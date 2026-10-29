/**
 * Headless Chrome: top Render button on selected cuts (0.9.73, moved to the Shots header in 0.9.87).
 * - bottom bar is always shown: 0 selected -> top Render disabled; the bar has no Render
 * - Ctrl+A over Shots selects every cut; over the canvas it does not touch the Shots selection
 * - 3 cuts selected (one empty, selected first) -> Render -> one confirm "Queue 2 cuts?"; Cancel sends nothing
 * - OK -> exactly 2 POST /prompt in Shots display order (each the cut's current version graph),
 *   jobs registered to the cuts, cards show Queued, toast "Queued 2 cuts" + "(1 skipped: no workflow)",
 *   selection kept, counter "0 / 2 done"
 * - cut card menu has "Render selected" (not clicked)
 * - 0.9.87: Remove from queue on A -> POST /queue {delete:[A's prompt]}, badge cleared, "0 / 1 done";
 *   C errors -> Failed badge, "1 / 1 done"; Re-queue on C -> confirm "Queue 1 cut?" -> 1 more POST /prompt
 *   (C's graph), C Queued, "0 / 1 done"
 * POST /prompt and /api/prompt are intercepted and answered with a fake prompt id (never forwarded);
 * GET /queue answers from the test's fake queue; POST /queue is intercepted (never forwarded);
 * POST /gonggan/regen is blocked. ComfyUI execution events are dispatched in the page (nothing runs).
 * ZZ-test- project only; its timeline and version media are mocked.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import puppeteer from "puppeteer-core";
import { shotWorkflowRelPathById } from "../../web/gg_shot_names.js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-batch-render";
const PROMPT_POST = [/\/prompt(\?|$)/, /\/api\/prompt(\?|$)/];
const QUEUE_PATH = [/^\/queue$/, /^\/api\/queue$/];
const BLOCKED_POST = [/\/gonggan\/regen(\?|$)/, /\/api\/gonggan\/regen(\?|$)/];
const LOAD_IMAGE_TYPES = new Set(["LoadImage", "LoadImageMask", "LoadImageOutput"]);

const runStamp = Date.now();
const USER_DATA_DIR = path.join(os.tmpdir(), `gg-batch-render-${runStamp}`);
const createdProjectIds = [];
/** @type {Map<string, object>} */
const timelineMocks = new Map();
/** vid -> Buffer (PNG) served for /gonggan/media and /gonggan/poster */
const mediaMocks = new Map();
/** Intercepted prompt bodies (never forwarded). */
const promptPosts = [];
/** Intercepted POST /queue bodies (never forwarded). */
const queuePosts = [];
/** What GET /queue lists as pending (fake prompt ids). */
let fakePending = [];
let blockedAttempts = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freeComfyMemory() {
  try {
    await fetch(`${BASE}/free`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
  } catch (_) {}
  await sleep(4000);
}

async function checkRam(label) {
  if (os.freemem() >= MIN_RAM) return;
  await freeComfyMemory();
  const free = os.freemem();
  if (free < MIN_RAM) {
    const err = new Error(`RAM check failed (${label}): ${Math.round(free / 1e9)} GB free, need 40+ GB`);
    err.skipped = true;
    throw err;
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 1x1 PNG with a ComfyUI-style `workflow` tEXt chunk. */
function pngWithWorkflow(workflow) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const text = Buffer.concat([Buffer.from("workflow\0", "latin1"), Buffer.from(JSON.stringify(workflow), "utf8")]);
  const idat = zlib.deflateSync(Buffer.from([0, 0, 0, 0, 255]));
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("tEXt", text), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

const matchesAny = (list, url) => {
  try {
    const p = new URL(url).pathname;
    return list.some((re) => re.test(p));
  } catch {
    return false;
  }
};

function attachRequestGuard(page) {
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (method === "POST" && matchesAny(PROMPT_POST, url)) {
      let body = null;
      try {
        body = JSON.parse(req.postData() || "null");
      } catch (_) {}
      const promptId = `zz-batch-${runStamp}-${promptPosts.length + 1}`;
      promptPosts.push({ url, body, promptId });
      fakePending.push(promptId);
      console.log(`INTERCEPTED POST ${new URL(url).pathname} (not forwarded) -> ${promptId}`);
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ prompt_id: promptId, number: 0, node_errors: {} }) });
      return;
    }
    if (method === "POST" && matchesAny(QUEUE_PATH, url)) {
      let body = null;
      try {
        body = JSON.parse(req.postData() || "null");
      } catch (_) {}
      queuePosts.push(body);
      const del = new Set(Array.isArray(body?.delete) ? body.delete : []);
      fakePending = fakePending.filter((id) => !del.has(id));
      console.log(`INTERCEPTED POST ${new URL(url).pathname} (not forwarded): ${JSON.stringify(body)}`);
      req.respond({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    if (method === "GET" && matchesAny(QUEUE_PATH, url)) {
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ queue_running: [], queue_pending: fakePending.map((id, i) => [i, id, {}, {}, []]) }),
      });
      return;
    }
    if (method === "POST" && matchesAny(BLOCKED_POST, url)) {
      blockedAttempts += 1;
      console.error(`BLOCKED UNSAFE POST: ${method} ${url}`);
      req.abort("blockedbyclient");
      return;
    }
    let u = null;
    try {
      u = new URL(url);
    } catch (_) {}
    if (u && method === "GET") {
      const pid = u.searchParams.get("pid");
      if (/gonggan\/timeline$/.test(u.pathname) && pid && timelineMocks.has(pid)) {
        req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(timelineMocks.get(pid)) });
        return;
      }
      const id = u.searchParams.get("id");
      if (/gonggan\/(media|poster)$/.test(u.pathname) && id && mediaMocks.has(id)) {
        req.respond({ status: 200, contentType: "image/png", body: mediaMocks.get(id) });
        return;
      }
    }
    req.continue();
  });
}

async function getJson(page, route) {
  return page.evaluate(async (r) => {
    const res = await fetch(`${location.origin}${r}`);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }, route);
}

async function postJson(page, route, body) {
  return page.evaluate(async (r, b) => {
    const res = await fetch(`${location.origin}${r}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  }, route, body);
}

async function fetchWorkflowPaths(page) {
  const { data } = await getJson(page, "/api/userdata?dir=workflows&recurse=true&split=false");
  if (Array.isArray(data)) {
    return data.map((x) => (typeof x === "string" ? x : x.path || x.name || "")).filter(Boolean).map((p) => String(p).replace(/^\/+/, ""));
  }
  if (data && typeof data === "object") return Object.keys(data);
  return [];
}

/** A saved user workflow with only registered node types, no Load Image and no subgraphs. */
async function pickBaseGraph(page, paths) {
  const norm = (p) => String(p).replace(/^\/+/, "");
  const base = (p) => norm(p).replace(/^.*\//, "").toLowerCase();
  const cands = paths.filter(
    (p) => base(p).endsWith(".json") && !/^cut\d+\.json$/i.test(base(p)) && !norm(p).startsWith("gonggan/") && !/_api\.json$/i.test(base(p))
  );
  for (const p of cands.slice(0, 60)) {
    const g = await page.evaluate(async (rel, skip) => {
      try {
        const r = await fetch(`/api/userdata/${encodeURIComponent("workflows/" + rel)}`);
        if (!r.ok) return null;
        const j = await r.json();
        const reg = window.LiteGraph?.registered_node_types || {};
        if (!Array.isArray(j.nodes) || !j.nodes.length || j.nodes.length > 60) return null;
        if (j.definitions?.subgraphs?.length) return null;
        if (j.nodes.some((n) => skip.includes(n.type) || !reg[n.type])) return null;
        if (!j.nodes.some((n) => n.widgets_values?.length)) return null;
        return j;
      } catch (_) {
        return null;
      }
    }, norm(p), [...LOAD_IMAGE_TYPES]);
    if (g) return g;
  }
  return null;
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
  await sleep(1500);
}

async function openShotsTab(page) {
  const opened = await page.evaluate(() => {
    const st = window.app?.extensionManager?.sidebarTab;
    if (!st) return false;
    st.activeSidebarTabId = "gg-shots";
    return true;
  });
  if (!opened) await (await page.waitForSelector('[aria-label="Shots list"]', { timeout: 15000 })).click();
  await page.waitForSelector(".gg-root.gg-shots", { timeout: 60000 });
}

async function selectProject(page, pid) {
  await page.waitForSelector(`.gg-root.gg-shots .gg-proj option[value="${pid}"]`, { timeout: 30000 });
  for (let i = 0; i < 12; i++) {
    await page.select(".gg-root.gg-shots .gg-proj", pid);
    await sleep(600);
    if ((await page.$eval(".gg-root.gg-shots .gg-proj", (el) => el.value)) === pid) break;
  }
}

async function reloadTimelineInUi(page, pid) {
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") await globalThis.__gongganReloadShotsData();
    await new Promise((r) => setTimeout(r, 400));
  });
  await selectProject(page, pid);
}

const cutSel = (id) => `.gg-root.gg-shots .gg-cut[data-cut-id="${id}"]`;
const cardBadge = (id) => `${cutSel(id)} .gg-render-badge`;

async function clickCut(page, cutId, { ctrl = false } = {}) {
  await page.waitForSelector(`${cutSel(cutId)} .gg-cut-title`, { timeout: 15000 });
  await page.$eval(cutSel(cutId), (el) => el.scrollIntoView({ block: "nearest" }));
  if (ctrl) await page.keyboard.down("Control");
  try {
    await page.click(`${cutSel(cutId)} .gg-cut-title`);
  } finally {
    if (ctrl) await page.keyboard.up("Control");
  }
  await sleep(300);
}

async function barState(page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".gg-root.gg-shots .gg-selbar");
    const btn = document.querySelector(".gg-root.gg-shots .gg-head .gg-render-btn");
    if (!bar || !btn) return null;
    return {
      shown: bar.getClientRects().length > 0,
      count: parseInt(bar.querySelector(".gg-sel-count")?.textContent || "-1", 10),
      render: !!btn.disabled,
      renderInBar: !!bar.querySelector(".gg-sel-render, .gg-render-btn"),
      selected: [...document.querySelectorAll(".gg-root.gg-shots .gg-cut.gg-sel")].map((e) => e.dataset.cutId),
    };
  });
}

async function hoverShots(page) {
  const box = await (await page.$(".gg-root.gg-shots .gg-meta")).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(150);
}

async function hoverCanvasAndBlur(page) {
  const box = await (await page.$("#graph-canvas-container, #graph-canvas, canvas")).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => document.activeElement?.blur?.());
  await sleep(200);
}

async function pressCtrlA(page) {
  await page.keyboard.down("Control");
  try {
    await page.keyboard.press("a");
  } finally {
    await page.keyboard.up("Control");
  }
  await sleep(300);
}

async function rightClickAt(page, selector) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.$eval(selector, (el) => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
  const box = await (await page.$(selector)).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.mouse.click(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2, { button: "right" });
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
}

async function ctxItem(page, label) {
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  return page.$$eval(
    ".gg-ctx > .gg-ctx-item",
    (els, l) => {
      const el = els.find((e) => e.textContent.trim() === l);
      return el ? { disabled: el.disabled, title: el.title || "" } : null;
    },
    label
  );
}

/** Close the menu without Escape (Escape over Shots also clears the cut selection). */
async function closeCtx(page) {
  if (!(await page.$(".gg-ctx"))) return;
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));
  await page.waitForFunction(() => !document.querySelector(".gg-ctx"), { timeout: 5000 });
}

async function clickCtxItem(page, label) {
  const ok = await page.$$eval(
    ".gg-ctx > .gg-ctx-item",
    (els, l) => {
      const el = els.find((e) => e.textContent.trim() === l);
      if (!el || el.disabled) return false;
      el.click();
      return true;
    },
    label
  );
  if (!ok) throw new Error(`menu item "${label}" missing or disabled`);
}

/** Dispatch a ComfyUI api event in the page (same api instance the extension listens on). */
async function fire(page, type, detail) {
  await page.evaluate(async (t, d) => {
    const { api } = await import("/scripts/api.js");
    if (typeof api.dispatchCustomEvent === "function") api.dispatchCustomEvent(t, d);
    else api.dispatchEvent(new CustomEvent(t, { detail: d }));
  }, type, detail);
}

const BATCH_PROG = ".gg-root.gg-shots .gg-head .gg-render-row .gg-batch-prog";

async function waitBatchProg(page, want, label) {
  try {
    await page.waitForFunction(
      (s, w) => {
        const el = document.querySelector(s);
        return !!el && !el.hidden && el.offsetParent !== null && el.textContent.trim() === w;
      },
      { timeout: 10000 },
      BATCH_PROG,
      want
    );
  } catch (_) {
    const got = await page.evaluate((s) => document.querySelector(s)?.textContent.trim() ?? null, BATCH_PROG);
    throw new Error(`${label}: want "${want}", got ${JSON.stringify(got)}`);
  }
}

async function renderToConfirm(page) {
  await page.click(".gg-root.gg-shots .gg-head .gg-render-btn");
  await page.waitForSelector(".gg-confirm-dialog", { timeout: 15000 });
  return page.evaluate(() => ({
    title: document.querySelector(".gg-confirm-title")?.textContent.trim() || "",
    body: document.querySelector(".gg-confirm-body")?.textContent.trim() || "",
  }));
}

async function waitPromptPosts(n) {
  const until = Date.now() + 90000;
  while (promptPosts.length < n && Date.now() < until) await sleep(200);
  await sleep(2000);
  if (promptPosts.length !== n) throw new Error(`expected ${n} intercepted prompt POST(s), got ${promptPosts.length}`);
}

function postedMarkerTitle(post, markerId) {
  const wf = post?.body?.extra_data?.extra_pnginfo?.workflow;
  if (!wf || !Array.isArray(wf.nodes)) throw new Error("no workflow in the prompt body");
  if (!post.body.prompt || !Object.keys(post.body.prompt).length) throw new Error("empty API prompt");
  return wf.nodes.find((n) => String(n.id) === String(markerId))?.title;
}

async function jobOf(page, promptId) {
  return page.evaluate((id) => {
    try {
      return (JSON.parse(localStorage.getItem("gonggan.jobs") || "[]") || []).find((j) => j.promptId === id) || null;
    } catch (_) {
      return null;
    }
  }, promptId);
}

async function waitBadge(page, sel, want, label) {
  try {
    await page.waitForFunction(
      (s, w) => {
        const el = document.querySelector(s);
        if (!el) return false;
        const shown = !el.hidden && el.offsetParent !== null;
        const text = el.querySelector(".gg-rs-text")?.textContent.trim() || "";
        return w ? shown && text === w : !shown;
      },
      { timeout: 10000 },
      sel,
      want
    );
  } catch (_) {
    throw new Error(`${label}: want ${want ? `"${want}"` : "hidden"}`);
  }
}

async function cleanup(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    const dir = path.posix.dirname(shotWorkflowRelPathById({ projectId: pid, cutId: "x" })) + "/";
    try {
      for (const p of await fetchWorkflowPaths(page)) {
        if (!p.startsWith(dir)) continue;
        await page.evaluate(async (rel) => {
          await fetch(`${location.origin}/api/userdata/${encodeURIComponent("workflows/" + rel)}`, { method: "DELETE" });
        }, p);
      }
      await page.evaluate(async (d) => {
        await fetch(`${location.origin}/api/userdata/${encodeURIComponent("workflows/" + d.replace(/\/$/, ""))}`, { method: "DELETE" });
      }, dir);
    } catch (e) {
      console.warn(`workflow cleanup ${pid}:`, e.message);
    }
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup ${pid}:`, e.message);
    }
  }
}

async function main() {
  try {
    await checkRam("startup");
  } catch (e) {
    if (e.skipped) {
      console.log(`SKIP: ${e.message}`);
      process.exit(0);
    }
    throw e;
  }
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: USER_DATA_DIR,
    protocolTimeout: 240000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  try {
    await waitForComfy(page);
    await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));
    await openShotsTab(page);
    const baseGraph = await pickBaseGraph(page, await fetchWorkflowPaths(page));
    if (!baseGraph) throw new Error("need a saved workflow with known node types and no Load Image");

    const created = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX} ${runStamp}` });
    const pid = created.project.id;
    createdProjectIds.push(pid);
    await postJson(page, "/gonggan/cut/add", { pid });
    await postJson(page, "/gonggan/cut/add", { pid });
    const { data: tl0 } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    if ((tl0?.cuts || []).length !== 3) throw new Error(`expected 3 cuts, got ${(tl0?.cuts || []).length}`);

    const markerNode = baseGraph.nodes.find((n) => n.widgets_values?.length) || baseGraph.nodes[0];
    const withTitle = (t) => {
      const g = JSON.parse(JSON.stringify(baseGraph));
      delete g.extra?.gonggan;
      delete g.extra?.ggWip;
      g.nodes.find((n) => n.id === markerNode.id).title = t;
      return g;
    };
    const T_A = `ZZ_BATCH_A_${runStamp}`;
    const T_C = `ZZ_BATCH_C_${runStamp}`;
    const vA = `batch-a-${runStamp}`;
    const vC = `batch-c-${runStamp}`;
    mediaMocks.set(vA, pngWithWorkflow(withTitle(T_A)));
    mediaMocks.set(vC, pngWithWorkflow(withTitle(T_C)));

    const tl = JSON.parse(JSON.stringify(tl0));
    const [cutA, cutB, cutC] = tl.cuts;
    const version = (id) => ({ id, kind: "image", source: "native", created: 1, seconds: 0, width: 64, height: 64 });
    for (const [c, v] of [[cutA, vA], [cutC, vC]]) {
      c.versions_list = [version(v)];
      c.versions = 1;
      c.pick = null;
      c.media = { id: v, kind: "image", width: 64, height: 64, seconds: 0 };
    }
    timelineMocks.set(pid, tl);
    await reloadTimelineInUi(page, pid);
    await page.waitForSelector(cutSel(cutC.id), { timeout: 15000 });

    // 1. bottom bar shown with nothing selected, top Render disabled, no Render in the bar, no batch counter
    let bar = await barState(page);
    if (!bar?.shown || bar.count !== 0 || !bar.render || bar.renderInBar) throw new Error(`empty bar: ${JSON.stringify(bar)}`);
    if (await page.$eval(BATCH_PROG, (el) => !el.hidden)) throw new Error("batch counter shown with no batch");
    console.log("PASS  bottom bar shown with 0 selected, top Render disabled, counter hidden");

    // 2. Ctrl+A over Shots selects all cuts; over the canvas it leaves the Shots selection alone
    await hoverShots(page);
    await pressCtrlA(page);
    bar = await barState(page);
    if (bar.count !== 3 || bar.selected.length !== 3 || bar.render) throw new Error(`Ctrl+A over Shots: ${JSON.stringify(bar)}`);
    await hoverShots(page);
    await page.keyboard.press("Escape");
    await sleep(300);
    await hoverCanvasAndBlur(page);
    await pressCtrlA(page);
    bar = await barState(page);
    if (bar.count !== 0 || bar.selected.length) throw new Error(`Ctrl+A over the canvas changed the Shots selection: ${JSON.stringify(bar)}`);
    console.log("PASS  Ctrl+A selects all cuts over Shots, ignored over the canvas");

    // 3. open the empty cut (zero-node graph), then add C and A to the selection
    await clickCut(page, cutB.id);
    await page.waitForFunction((id) => window.app.graph?.extra?.gonggan?.cutId === id, { timeout: 60000 }, cutB.id);
    await sleep(800);
    if ((await page.evaluate(() => window.app.graph?._nodes?.length || 0)) !== 0) throw new Error("empty cut should open a zero-node graph");
    await clickCut(page, cutC.id, { ctrl: true });
    await clickCut(page, cutA.id, { ctrl: true });
    bar = await barState(page);
    if (bar.count !== 3 || bar.render) throw new Error(`3 selected: ${JSON.stringify(bar)}`);
    await rightClickAt(page, `${cutSel(cutC.id)} .gg-cut-title`);
    const item = await ctxItem(page, "Render selected");
    if (!item || item.disabled) throw new Error(`card menu Render selected: ${JSON.stringify(item)}`);
    await closeCtx(page);
    if ((await barState(page)).count !== 3) throw new Error("right-click changed the selection");
    console.log("PASS  3 cuts selected (one empty); card menu has Render selected");

    // 4. Render -> one confirm; Cancel sends nothing
    let dlg = await renderToConfirm(page);
    if (dlg.title !== "Queue 2 cuts?" || !dlg.body.includes("1 skipped: no workflow")) throw new Error(`confirm: ${JSON.stringify(dlg)}`);
    await page.click(".gg-confirm-cancel");
    await page.waitForFunction(() => !document.querySelector(".gg-confirm-dialog"), { timeout: 5000 });
    await sleep(1500);
    if (promptPosts.length) throw new Error(`Cancel sent ${promptPosts.length} prompt POST(s)`);
    console.log(`PASS  Render: confirm "${dlg.title}" (1 skipped), Cancel sent nothing`);

    // 5. Render -> OK -> 2 prompts in display order (A then C), registered, Queued badges, toast, selection kept
    dlg = await renderToConfirm(page);
    await page.click(".gg-confirm-ok");
    await waitPromptPosts(2);
    const titles = promptPosts.map((p) => postedMarkerTitle(p, markerNode.id));
    if (titles.join() !== [T_A, T_C].join()) throw new Error(`queued order/graphs: ${titles.join()} (want A, C)`);
    for (const [post, cut] of [[promptPosts[0], cutA], [promptPosts[1], cutC]]) {
      const job = await jobOf(page, post.promptId);
      if (!job || job.cutId !== cut.id || job.projectId !== pid) throw new Error(`prompt ${post.promptId} not registered to ${cut.id}: ${JSON.stringify(job)}`);
    }
    await page.waitForFunction(
      () => {
        const h = document.getElementById("gg-toast-host");
        return !!(h && !h.hidden && h.querySelector(".gg-toast-sum")?.textContent.trim() === "Queued 2 cuts");
      },
      { timeout: 15000 }
    );
    const detail = await page.$eval("#gg-toast-host .gg-toast-detail", (el) => el.textContent.trim());
    if (detail !== "(1 skipped: no workflow)") throw new Error(`toast detail: "${detail}"`);
    await waitBadge(page, cardBadge(cutA.id), "Queued", "card A queued");
    await waitBadge(page, cardBadge(cutC.id), "Queued", "card C queued");
    await waitBadge(page, cardBadge(cutB.id), "", "empty card idle");
    bar = await barState(page);
    if (bar.count !== 3) throw new Error(`selection not kept after Render: ${JSON.stringify(bar)}`);
    await waitBatchProg(page, "0 / 2 done", "counter after Render");
    console.log('PASS  OK: 2 prompts in display order (A, C), jobs registered, cards Queued, toast "Queued 2 cuts (1 skipped: no workflow)", "0 / 2 done"');

    // 6. Remove from queue on A only -> POST /queue {delete:[A]}, A badge cleared, counter drops A
    const [postA, postC] = promptPosts;
    await clickCut(page, cutA.id);
    await rightClickAt(page, `${cutSel(cutA.id)} .gg-cut-title`);
    if (await ctxItem(page, "Re-queue")) throw new Error("Re-queue listed for a cut that did not fail");
    await clickCtxItem(page, "Remove from queue");
    const untilQ = Date.now() + 10000;
    while (!queuePosts.length && Date.now() < untilQ) await sleep(100);
    if (queuePosts.length !== 1 || JSON.stringify(queuePosts[0]) !== JSON.stringify({ delete: [postA.promptId] })) {
      throw new Error(`POST /queue body: ${JSON.stringify(queuePosts)}`);
    }
    await waitBadge(page, cardBadge(cutA.id), "", "card A cleared after Remove from queue");
    await waitBadge(page, cardBadge(cutC.id), "Queued", "card C still queued");
    await waitBatchProg(page, "0 / 1 done", "counter after Remove from queue");
    console.log('PASS  Remove from queue: POST /queue {delete:[A]} (not forwarded), A cleared, "0 / 1 done"');

    // 7. C errors -> Failed + "1 / 1 done"; Re-queue C -> confirm -> 1 more prompt (C's graph) -> Queued, "0 / 1 done"
    fakePending = fakePending.filter((id) => id !== postC.promptId);
    await fire(page, "execution_start", { prompt_id: postC.promptId, timestamp: Date.now() });
    await fire(page, "execution_error", { prompt_id: postC.promptId, exception_message: "zz test error", timestamp: Date.now() });
    await waitBadge(page, cardBadge(cutC.id), "Failed", "card C failed");
    await waitBatchProg(page, "1 / 1 done", "counter after C failed");
    await rightClickAt(page, `${cutSel(cutC.id)} .gg-cut-title`);
    if (await ctxItem(page, "Remove from queue")) throw new Error("Remove from queue listed for a failed cut");
    await clickCtxItem(page, "Re-queue");
    await page.waitForSelector(".gg-confirm-dialog", { timeout: 15000 });
    const rq = await page.$eval(".gg-confirm-title", (el) => el.textContent.trim());
    if (rq !== "Queue 1 cut?") throw new Error(`Re-queue confirm: "${rq}"`);
    await page.click(".gg-confirm-ok");
    await waitPromptPosts(3);
    if (postedMarkerTitle(promptPosts[2], markerNode.id) !== T_C) throw new Error("Re-queue did not queue C's graph");
    const jobC = await jobOf(page, promptPosts[2].promptId);
    if (!jobC || jobC.cutId !== cutC.id) throw new Error(`re-queued prompt not registered to C: ${JSON.stringify(jobC)}`);
    await waitBadge(page, cardBadge(cutC.id), "Queued", "card C queued again");
    await waitBatchProg(page, "0 / 1 done", "counter after Re-queue");
    console.log('PASS  C error: Failed badge, "1 / 1 done"; Re-queue: "Queue 1 cut?" -> C queued again, "0 / 1 done"');

    timelineMocks.delete(pid);
    await checkRam("end");
  } finally {
    try {
      await cleanup(page);
    } catch (_) {}
    await browser.close().catch(() => {});
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
  if (blockedAttempts > 0) throw new Error(`Unsafe POST (${blockedAttempts})`);
  console.log(`DONE  ${promptPosts.length} prompt POSTs intercepted, none forwarded`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
