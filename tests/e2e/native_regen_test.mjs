/**
 * Headless Chrome: right-click Regen on a native project (0.9.65).
 * - empty cut (no versions, zero-node graph): Regen disabled with a tooltip
 * - cut card Regen: opens the cut's current (newest, no pick) workflow, confirm modal; Cancel queues nothing
 * - cut card Regen + OK: exactly one POST /prompt whose workflow is that version's graph, shot tab = that cut
 * - timeline clip Regen with a manual pick: the picked version's graph is queued
 * - same cut already open with edits: the open graph is queued as is
 * POST /prompt and /api/prompt are intercepted and answered with a fake prompt id (never forwarded);
 * POST /gonggan/regen is blocked. ZZ-test- project only; its timeline and version media are mocked.
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
const TEST_PREFIX = "ZZ-test-native-regen";
const PROMPT_POST = [/\/prompt(\?|$)/, /\/api\/prompt(\?|$)/];
const BLOCKED_POST = [/\/gonggan\/regen(\?|$)/, /\/api\/gonggan\/regen(\?|$)/];
const LOAD_IMAGE_TYPES = new Set(["LoadImage", "LoadImageMask", "LoadImageOutput"]);

const runStamp = Date.now();
const USER_DATA_DIR = path.join(os.tmpdir(), `gg-native-regen-${runStamp}`);
const createdProjectIds = [];
/** @type {Map<string, object>} */
const timelineMocks = new Map();
/** vid -> Buffer (PNG) served for /gonggan/media and /gonggan/poster */
const mediaMocks = new Map();
/** Intercepted prompt bodies (never forwarded). */
const promptPosts = [];
const pickPosts = [];
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
      const promptId = `zz-fake-${runStamp}-${promptPosts.length + 1}`;
      promptPosts.push({ url, body, promptId });
      console.log(`INTERCEPTED POST ${new URL(url).pathname} (not forwarded) -> ${promptId}`);
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ prompt_id: promptId, number: 0, node_errors: {} }) });
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
    if (u && method === "POST" && /gonggan\/(edit|pick)(\/|$)/.test(u.pathname)) pickPosts.push(u.pathname);
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
const clipSel = (id) => `.gg-timeline .gg-track .gg-clip[data-cut-id="${id}"]`;

async function clickCut(page, cutId) {
  await page.waitForSelector(`${cutSel(cutId)} .gg-cut-title`, { timeout: 15000 });
  await page.$eval(cutSel(cutId), (el) => el.scrollIntoView({ block: "nearest" }));
  await page.click(`${cutSel(cutId)} .gg-cut-title`);
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

async function clickCtxItem(page, label) {
  for (const it of await page.$$(".gg-ctx > .gg-ctx-item")) {
    if ((await page.evaluate((n) => n.textContent?.trim(), it)) === label) {
      await it.click();
      return;
    }
  }
  throw new Error(`Context menu item not found: ${label}`);
}

async function closeCtx(page) {
  if (!(await page.$(".gg-ctx"))) return;
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".gg-ctx"), { timeout: 5000 });
}

async function ensureTimelineOpen(page, cutCount) {
  const visible = () => page.evaluate(() => !!document.querySelector(".gg-timeline")?.offsetParent);
  if (!(await visible())) {
    await page.click(".gg-root.gg-shots .gg-timeline-toggle");
    await sleep(800);
  }
  if (!(await visible())) throw new Error("timeline panel did not open");
  await page.waitForFunction((n) => document.querySelectorAll(".gg-timeline .gg-track .gg-clip[data-cut-id]").length === n, { timeout: 15000 }, cutCount);
}

async function waitGraphOf(page, cutId, { minNodes = 1 } = {}) {
  await page.waitForFunction(
    (id, min) => window.app.graph?.extra?.gonggan?.cutId === id && (window.app.graph?._nodes?.length || 0) >= min,
    { timeout: 60000 },
    cutId,
    minNodes
  );
  await sleep(500);
}

async function markerTitle(page, nodeId) {
  return page.evaluate((id) => window.app.graph?._nodes?.find((n) => String(n.id) === String(id))?.title ?? null, nodeId);
}

async function activeShotState(page, pid) {
  return page.evaluate((p) => {
    const ws = window.app.extensionManager.workflow;
    return {
      graphCutId: window.app.graph?.extra?.gonggan?.cutId || "",
      activePath: String(ws.activeWorkflow?.path || ""),
      ownedTabs: (ws.openWorkflows || []).filter((w) => String(w.path || "").includes(`gonggan/${p}/`)).length,
    };
  }, pid);
}

async function sdkIdle(page) {
  await page.waitForFunction(() => !document.querySelector(".gg-confirm-dialog"), { timeout: 10000 });
}

/** Right-click target -> Regen -> wait for the confirm modal; returns the modal title. */
async function regenToConfirm(page, selector) {
  await rightClickAt(page, selector);
  const it = await ctxItem(page, "Regen");
  if (!it || it.disabled) throw new Error(`Regen not enabled: ${JSON.stringify(it)}`);
  await clickCtxItem(page, "Regen");
  await page.waitForSelector(".gg-confirm-dialog", { timeout: 60000 });
  return page.$eval(".gg-confirm-title", (el) => el.textContent.trim());
}

async function waitPromptPosts(n) {
  const until = Date.now() + 30000;
  while (promptPosts.length < n && Date.now() < until) await sleep(200);
  await sleep(1500);
  if (promptPosts.length !== n) throw new Error(`expected ${n} intercepted prompt POST(s), got ${promptPosts.length}`);
}

function postedWorkflow(post) {
  return post?.body?.extra_data?.extra_pnginfo?.workflow || null;
}

function assertPostedGraph(label, post, expected, markerId, wantTitle) {
  const wf = postedWorkflow(post);
  if (!wf || !Array.isArray(wf.nodes)) throw new Error(`${label}: no workflow in the prompt body`);
  if (!post.body.prompt || !Object.keys(post.body.prompt).length) throw new Error(`${label}: empty API prompt`);
  const ids = (g) => g.nodes.map((n) => String(n.id)).sort().join(",");
  if (ids(wf) !== ids(expected)) throw new Error(`${label}: node ids differ: ${ids(wf)} vs ${ids(expected)}`);
  const got = wf.nodes.find((n) => String(n.id) === String(markerId))?.title;
  if (got !== wantTitle) throw new Error(`${label}: marker title "${got}", want "${wantTitle}"`);
  if (wf.extra?.gonggan?.cutId && wf.extra.gonggan.cutId !== expected.__cutId) {
    throw new Error(`${label}: posted workflow is stamped for cut ${wf.extra.gonggan.cutId}`);
  }
}

async function assertActiveTabIs(page, pid, cutId) {
  const st = await activeShotState(page, pid);
  const want = shotWorkflowRelPathById({ projectId: pid, cutId });
  if (st.graphCutId !== cutId) throw new Error(`active graph is cut ${st.graphCutId}, want ${cutId}`);
  if (!st.activePath.replace(/^workflows\//, "").toLowerCase().endsWith(want.replace(/^workflows\//, "").toLowerCase())) {
    throw new Error(`active tab ${st.activePath}, want ${want}`);
  }
  if (st.ownedTabs !== 1) throw new Error(`expected one owned shot tab, got ${st.ownedTabs}`);
}

async function assertJobRegistered(page, promptId, cutId, pid) {
  const job = await page.evaluate((id) => {
    try {
      return (JSON.parse(localStorage.getItem("gonggan.jobs") || "[]") || []).find((j) => j.promptId === id) || null;
    } catch (_) {
      return null;
    }
  }, promptId);
  if (!job || job.cutId !== cutId || job.projectId !== pid) throw new Error(`prompt ${promptId} not registered to the cut: ${JSON.stringify(job)}`);
}

async function waitToast(page, sum) {
  await page.waitForFunction(
    (s) => {
      const h = document.getElementById("gg-toast-host");
      return !!(h && !h.hidden && h.querySelector(".gg-toast-sum")?.textContent.trim() === s);
    },
    { timeout: 10000 },
    sum
  );
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
    const { data: tl0 } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    if ((tl0?.cuts || []).length !== 2) throw new Error(`expected 2 cuts, got ${(tl0?.cuts || []).length}`);
    const serverPickBefore = tl0.cuts[0].pick ?? null;

    const markerNode = baseGraph.nodes.find((n) => n.widgets_values?.length) || baseGraph.nodes[0];
    const withTitle = (t) => {
      const g = JSON.parse(JSON.stringify(baseGraph));
      delete g.extra?.gonggan;
      delete g.extra?.ggWip;
      g.nodes.find((n) => n.id === markerNode.id).title = t;
      return g;
    };
    const T_OLD = `ZZ_REGEN_OLD_${runStamp}`;
    const T_NEW = `ZZ_REGEN_NEW_${runStamp}`;
    const T_EDIT = `ZZ_REGEN_EDIT_${runStamp}`;
    const vOld = `regen-old-${runStamp}`;
    const vNew = `regen-new-${runStamp}`;
    mediaMocks.set(vOld, pngWithWorkflow(withTitle(T_OLD)));
    mediaMocks.set(vNew, pngWithWorkflow(withTitle(T_NEW)));

    const tl = JSON.parse(JSON.stringify(tl0));
    const [cutA, cutB] = tl.cuts;
    cutA.versions_list = [
      { id: vNew, kind: "image", source: "native", created: 2, seconds: 0, width: 64, height: 64 },
      { id: vOld, kind: "image", source: "native", created: 1, seconds: 0, width: 64, height: 64 },
    ];
    cutA.versions = 2;
    cutA.pick = null;
    cutA.media = { id: vNew, kind: "image", width: 64, height: 64, seconds: 0 };
    timelineMocks.set(pid, tl);
    await reloadTimelineInUi(page, pid);
    const expected = withTitle("");
    expected.__cutId = cutA.id;

    // 1. empty cut: open it (blank, zero nodes) -> Regen disabled with a tooltip
    await clickCut(page, cutB.id);
    await page.waitForFunction((id) => window.app.graph?.extra?.gonggan?.cutId === id, { timeout: 60000 }, cutB.id);
    await sleep(800);
    if ((await page.evaluate(() => window.app.graph?._nodes?.length || 0)) !== 0) throw new Error("empty cut should open a zero-node graph");
    await rightClickAt(page, `${cutSel(cutB.id)} .gg-cut-title`);
    const emptyItem = await ctxItem(page, "Regen");
    if (!emptyItem?.disabled || !/empty cut/i.test(emptyItem.title)) throw new Error(`empty cut Regen: ${JSON.stringify(emptyItem)}`);
    await closeCtx(page);
    console.log(`PASS  empty cut: Regen disabled ("${emptyItem.title}")`);

    // 2. cut card Regen -> cut opens (newest version, no pick) -> confirm -> Cancel sends nothing
    const title1 = await regenToConfirm(page, `${cutSel(cutA.id)} .gg-cut-title`);
    if (title1 !== "Queue this cut's workflow now?") throw new Error(`confirm title: ${title1}`);
    await waitGraphOf(page, cutA.id);
    if ((await markerTitle(page, markerNode.id)) !== T_NEW) throw new Error("Regen did not open the newest version's workflow");
    await page.click(".gg-confirm-cancel");
    await sdkIdle(page);
    await sleep(2000);
    if (promptPosts.length) throw new Error(`Cancel sent ${promptPosts.length} prompt POST(s)`);
    console.log("PASS  card Regen: opened newest version graph, confirm modal, Cancel sent nothing");

    // 3. from another cut: card Regen -> OK -> exactly one prompt POST with that cut's current graph
    await clickCut(page, cutB.id);
    await page.waitForFunction((id) => window.app.graph?.extra?.gonggan?.cutId === id, { timeout: 60000 }, cutB.id);
    await sleep(800);
    await regenToConfirm(page, `${cutSel(cutA.id)} .gg-cut-title`);
    await page.click(".gg-confirm-ok");
    await waitPromptPosts(1);
    assertPostedGraph("card Regen", promptPosts[0], expected, markerNode.id, T_NEW);
    await assertActiveTabIs(page, pid, cutA.id);
    await assertJobRegistered(page, promptPosts[0].promptId, cutA.id, pid);
    await waitToast(page, "Queued");
    console.log("PASS  card Regen + OK: one intercepted prompt = newest version graph, tab = cut, job registered, Queued toast");

    // 4. timeline clip Regen with a manual pick (older version) -> that version's graph
    tl.cuts[0].pick = vOld;
    tl.cuts[0].media = { id: vOld, kind: "image", width: 64, height: 64, seconds: 0 };
    await reloadTimelineInUi(page, pid);
    await clickCut(page, cutB.id);
    await page.waitForFunction((id) => window.app.graph?.extra?.gonggan?.cutId === id, { timeout: 60000 }, cutB.id);
    await sleep(800);
    await ensureTimelineOpen(page, 2);
    await regenToConfirm(page, clipSel(cutA.id));
    if ((await markerTitle(page, markerNode.id)) !== T_OLD) throw new Error("clip Regen did not open the picked version's workflow");
    await page.click(".gg-confirm-ok");
    await waitPromptPosts(2);
    assertPostedGraph("clip Regen (pick)", promptPosts[1], expected, markerNode.id, T_OLD);
    await assertActiveTabIs(page, pid, cutA.id);
    await assertJobRegistered(page, promptPosts[1].promptId, cutA.id, pid);
    console.log("PASS  clip Regen: picked (older) version graph queued once, tab = cut");

    // 5. same cut already open with an edit -> queued as is
    await page.evaluate((id, t) => {
      const n = window.app.graph?._nodes?.find((x) => String(x.id) === String(id));
      n.title = t;
      window.app.graph?.setDirtyCanvas?.(true, true);
      window.app.graph?.change?.();
      window.app.extensionManager.workflow.activeWorkflow?.changeTracker?.checkState?.();
    }, markerNode.id, T_EDIT);
    await regenToConfirm(page, clipSel(cutA.id));
    if ((await markerTitle(page, markerNode.id)) !== T_EDIT) throw new Error("Regen reloaded the open cut and dropped the edit");
    await page.click(".gg-confirm-ok");
    await waitPromptPosts(3);
    assertPostedGraph("same cut open", promptPosts[2], expected, markerNode.id, T_EDIT);
    await assertActiveTabIs(page, pid, cutA.id);
    console.log("PASS  same cut open: edited graph queued as is");

    if (pickPosts.length) throw new Error(`pick/edit POSTs sent: ${pickPosts.join(", ")}`);
    const ui = await page.evaluate(() => ({
      rep: [...document.querySelectorAll(".gg-root.gg-shots .gg-ver-wrap.gg-rep")].map((e) => e.dataset.vid),
    }));
    if (ui.rep.join() !== vOld) throw new Error(`UI pick changed: ${ui.rep.join()}`);
    timelineMocks.delete(pid);
    const { data: tl1 } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    if ((tl1?.cuts?.[0]?.pick ?? null) !== serverPickBefore) throw new Error("server pick changed");
    console.log("PASS  no pick/edit POST; pick unchanged");
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
