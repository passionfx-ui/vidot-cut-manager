/**
 * Headless Chrome: clicking a version thumbnail opens THAT version's workflow in the shot tab.
 * - image version: workflow embedded in the PNG wins over the stored one
 * - video version: stored per-version workflow (/gonggan/version-workflow)
 * - no workflow: warn toast, canvas unchanged
 * Pick (Best) never changes, no '*' after opening, one owned shot tab, the click beats WIP restore.
 * ZZ-test- project only; timeline + version media/workflow responses are mocked for this project.
 * Blocks POST /prompt, /api/prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import puppeteer from "puppeteer-core";
import { fillNewProjectModal } from "./new_project_helpers.mjs";
import { shotWorkflowRelPathById } from "../../web/gg_shot_names.js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-ver-click";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const USER_DATA_DIR = path.join(os.tmpdir(), `gg-ver-click-${runStamp}`);
const createdProjectIds = [];
/** @type {Map<string, object>} */
const timelineMocks = new Map();
/** vid -> Buffer (PNG) served for /gonggan/media and /gonggan/poster */
const mediaMocks = new Map();
/** vid -> payload (null = 404) served for /gonggan/version-workflow */
const versionWfMocks = new Map();
const pickPosts = [];
const shotFileSaves = [];
let blockedPromptAttempts = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkRam(label) {
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

function isBlockedPost(url, method) {
  if (method !== "POST") return false;
  try {
    return BLOCKED_POST.some((re) => re.test(new URL(url).pathname));
  } catch {
    return false;
  }
}

function attachRequestGuard(page) {
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (isBlockedPost(url, method)) {
      blockedPromptAttempts += 1;
      console.error(`BLOCKED UNSAFE POST: ${method} ${url}`);
      req.abort("blockedbyclient");
      return;
    }
    let u = null;
    try {
      u = new URL(url);
    } catch (_) {}
    if (u && method === "POST" && /gonggan\/(edit|pick)(\/|$)/.test(u.pathname)) pickPosts.push(u.pathname);
    if (u && method === "POST" && /\/userdata\/workflows/.test(decodeURIComponent(u.pathname))) shotFileSaves.push(decodeURIComponent(u.pathname));
    if (u && method === "GET") {
      const pid = u.searchParams.get("pid");
      if (/gonggan\/timeline$/.test(u.pathname) && pid && timelineMocks.has(pid)) {
        req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(timelineMocks.get(pid)) });
        return;
      }
      const id = u.searchParams.get("id");
      if (/gonggan\/(media|poster)$/.test(u.pathname) && id && mediaMocks.has(id)) {
        const png = mediaMocks.get(id);
        if (png) req.respond({ status: 200, contentType: "image/png", body: png });
        else req.respond({ status: 404, contentType: "application/json", body: '{"ok":false,"message":"not found"}' });
        return;
      }
      const vid = u.searchParams.get("vid");
      if (/gonggan\/version-workflow$/.test(u.pathname) && vid && versionWfMocks.has(vid)) {
        const rec = versionWfMocks.get(vid);
        if (rec) req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...rec }) });
        else req.respond({ status: 404, contentType: "application/json", body: '{"ok":false,"message":"workflow not found"}' });
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

async function pickUsableTemplateRef(page, paths) {
  const norm = (p) => String(p).replace(/^\/+/, "");
  const base = (p) => norm(p).replace(/^.*\//, "").toLowerCase();
  const cands = paths.filter(
    (p) => base(p).endsWith(".json") && !/^cut\d+\.json$/i.test(base(p)) && !norm(p).startsWith("gonggan/") && !/_api\.json$/i.test(base(p))
  );
  cands.sort((a, b) => (base(b).startsWith("zz") ? 1 : 0) - (base(a).startsWith("zz") ? 1 : 0));
  for (const p of cands.slice(0, 40)) {
    const ok = await page.evaluate(async (rel) => {
      try {
        const r = await fetch(`/api/userdata/${encodeURIComponent("workflows/" + rel)}`);
        if (!r.ok) return false;
        const j = await r.json();
        return Array.isArray(j.nodes) && j.nodes.length > 0 && j.nodes.length < 80 && j.nodes.some((n) => n.widgets_values?.length);
      } catch (_) {
        return false;
      }
    }, norm(p));
    if (ok) return norm(p);
  }
  return "";
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
  await page.waitForSelector(".gg-root.gg-shots .gg-proj", { timeout: 30000 });
  await page.select(".gg-root.gg-shots .gg-proj", pid);
  await sleep(400);
}

async function clickCtxItem(page, label) {
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  for (const it of await page.$$(".gg-ctx-item")) {
    if ((await page.evaluate((n) => n.textContent?.trim(), it)) === label) {
      await it.click();
      return;
    }
  }
  throw new Error(`Context menu item not found: ${label}`);
}

async function createProjectViaUi(page, name, templateRef) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await fillNewProjectModal(page, { name, templateRef });
  await page.click(".gg-modal-create");
  await page.waitForFunction(
    (n) => {
      const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
      return sel?.options[sel.selectedIndex]?.textContent.includes(n);
    },
    { timeout: 30000 },
    name
  );
  await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 1, { timeout: 20000 });
  const pid = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.value);
  if (pid) createdProjectIds.push(pid);
  return pid;
}

async function reloadTimelineInUi(page, pid) {
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") await globalThis.__gongganReloadShotsData();
    await new Promise((r) => setTimeout(r, 400));
  });
  await selectProject(page, pid);
}

async function clickCut(page, cutId) {
  const sel = `.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"]`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
}

async function clickVersionThumb(page, vid) {
  const sel = `.gg-root.gg-shots .gg-ver-wrap[data-vid="${vid}"] > .gg-ver`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
}

async function waitForCutLoaded(page, cutId) {
  await page.waitForFunction((id) => window.app.graph?.extra?.gonggan?.cutId === id && (window.app.graph?._nodes?.length || 0) > 0, { timeout: 90000 }, cutId);
  await sleep(400);
}

async function waitForMarkerTitle(page, nodeId, title) {
  await page.waitForFunction(
    (id, t) => window.app.graph?._nodes?.find((n) => String(n.id) === String(id))?.title === t,
    { timeout: 30000 },
    nodeId,
    title
  );
  await sleep(300);
}

async function currentMarkerTitle(page, nodeId) {
  return page.evaluate((id) => window.app.graph?._nodes?.find((n) => String(n.id) === String(id))?.title ?? null, nodeId);
}

async function verClasses(page) {
  return page.$$eval(".gg-root.gg-shots .gg-ver-wrap", (els) =>
    Object.fromEntries(els.map((e) => [e.dataset.vid, { open: e.classList.contains("gg-ver-open"), rep: e.classList.contains("gg-rep") }]))
  );
}

async function cutCardTitle(page, cutId) {
  return page.$eval(`.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"] .gg-cut-title`, (el) => el.textContent || "");
}

async function activeTabLabel(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-testid="workflow-tab"]')];
    const active = tabs.find((t) => t.classList.contains("active") || t.getAttribute("aria-selected") === "true") || tabs[tabs.length - 1];
    return active?.querySelector(".workflow-label")?.textContent?.trim() || "";
  });
}

async function ownedShotTabCount(page, pid) {
  return page.evaluate((p) => {
    const open = window.app.extensionManager.workflow.openWorkflows || [];
    return open.filter((w) => String(w.path || "").includes(`gonggan/${p}/`)).length;
  }, pid);
}

async function toastText(page) {
  return page.evaluate(() => {
    const h = document.getElementById("gg-toast-host");
    return h && !h.hidden ? h.textContent || "" : "";
  });
}

/** Moves a node to a distinctive position (a real content edit) and returns that position. */
async function moveNode(page, nodeId) {
  const pos = await page.evaluate((id) => {
    const n = window.app.graph?._nodes?.find((x) => String(x.id) === String(id));
    if (!n) return null;
    n.pos = [Math.round(n.pos[0]) + 1237, Math.round(n.pos[1]) + 311];
    window.app.graph?.setDirtyCanvas?.(true, true);
    window.app.graph?.change?.();
    window.app.extensionManager.workflow.activeWorkflow?.changeTracker?.checkState?.();
    return [n.pos[0], n.pos[1]];
  }, nodeId);
  if (!pos) throw new Error("node to move not found");
  return pos;
}

function assertNoStar(label, text) {
  if (text.includes("*")) throw new Error(`${label}: unexpected '*' in "${text}"`);
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
    checkRam("startup");
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
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  try {
    await waitForComfy(page);
    await openShotsTab(page);
    // Every scenario clicks version thumbnails in the old cut panel (off since 0.9.73; the slot is a read-only status panel since 0.9.88).
    const panelShown = await page.evaluate(() => {
      const root = document.querySelector(".gg-root.gg-shots");
      return !!root?.querySelector(".gg-cutpanel")?.getClientRects().length && !root.classList.contains("gg-cutpanel-status");
    });
    if (!panelShown) {
      console.log("SKIP panel hidden: version thumbnails live in the old cut panel (SHOW_CUT_PANEL = false; status panel only); all scenarios skipped");
      return;
    }
    const templateRef = await pickUsableTemplateRef(page, await fetchWorkflowPaths(page));
    if (!templateRef) throw new Error("need a usable workflow template");

    const pid = await createProjectViaUi(page, `${TEST_PREFIX} ${runStamp}`, templateRef);
    const { data: tl0 } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const cut0 = (tl0?.cuts || [])[0];
    if (!cut0?.id) throw new Error("expected one cut");
    const serverPickBefore = cut0.pick ?? null;

    const vImg = `ver-img-${runStamp}`;
    const vVid = `ver-vid-${runStamp}`;
    const vNone = `ver-none-${runStamp}`;
    const tl = JSON.parse(JSON.stringify(tl0));
    const cut = tl.cuts[0];
    cut.versions_list = [
      { id: vNone, kind: "image", source: "native", created: 3, seconds: 0, width: 64, height: 64 },
      { id: vVid, kind: "video", source: "native", created: 2, seconds: 1, width: 64, height: 64 },
      { id: vImg, kind: "image", source: "native", created: 1, seconds: 0, width: 64, height: 64 },
    ];
    cut.versions = 3;
    cut.pick = vVid;
    cut.media = { id: vVid, kind: "video", width: 64, height: 64, seconds: 1 };
    timelineMocks.set(pid, tl);
    mediaMocks.set(vVid, null);
    mediaMocks.set(vNone, null);
    versionWfMocks.set(vNone, null);
    await reloadTimelineInUi(page, pid);

    await clickCut(page, cut.id);
    await waitForCutLoaded(page, cut.id);
    const baseGraph = await page.evaluate(() => window.app.graph.serialize());
    const markerNode = baseGraph.nodes.find((n) => n.widgets_values?.length) || baseGraph.nodes[0];
    const withTitle = (t) => {
      const g = JSON.parse(JSON.stringify(baseGraph));
      delete g.extra?.gonggan;
      delete g.extra?.ggWip;
      g.nodes.find((n) => n.id === markerNode.id).title = t;
      return g;
    };
    const T_EMBED = `ZZ_VER_EMBED_${runStamp}`;
    const T_IMG_STORED = `ZZ_VER_IMG_STORED_${runStamp}`;
    const T_VIDEO = `ZZ_VER_VIDEO_${runStamp}`;
    mediaMocks.set(vImg, pngWithWorkflow(withTitle(T_EMBED)));
    versionWfMocks.set(vImg, { workflow: withTitle(T_IMG_STORED), prompt: null, source: "stored", kind: "ui" });
    versionWfMocks.set(vVid, { workflow: withTitle(T_VIDEO), prompt: null, source: "stored", kind: "ui" });

    const repBefore = (await verClasses(page))[vVid]?.rep;
    if (!repBefore) throw new Error("mock pick should show as Rep");

    // 1. image version: embedded PNG workflow wins over the stored one
    await sleep(1500);
    shotFileSaves.length = 0;
    await clickVersionThumb(page, vImg);
    await waitForMarkerTitle(page, markerNode.id, T_EMBED);
    let cls = await verClasses(page);
    if (!cls[vImg]?.open || cls[vVid]?.open || cls[vNone]?.open) throw new Error(`gg-ver-open wrong after image click: ${JSON.stringify(cls)}`);
    if (!cls[vVid]?.rep || cls[vImg]?.rep) throw new Error(`pick changed after image click: ${JSON.stringify(cls)}`);
    if ((await page.evaluate(() => window.app.graph?.extra?.gonggan?.cutId)) !== cut.id) throw new Error("graph not stamped with the cut");
    await sleep(3500);
    assertNoStar("cut card", await cutCardTitle(page, cut.id));
    assertNoStar("tab label", await activeTabLabel(page));
    if (shotFileSaves.length) throw new Error(`opening a version saved the shot file: ${shotFileSaves.join(", ")}`);
    console.log("PASS  image version: embedded workflow opened, Rep unchanged, no *, no WIP save");

    // 2. video version: stored per-version workflow
    await clickVersionThumb(page, vVid);
    await waitForMarkerTitle(page, markerNode.id, T_VIDEO);
    cls = await verClasses(page);
    if (!cls[vVid]?.open || cls[vImg]?.open) throw new Error(`gg-ver-open wrong after video click: ${JSON.stringify(cls)}`);
    if (!cls[vVid]?.rep) throw new Error("pick changed after video click");
    await sleep(3500);
    assertNoStar("cut card", await cutCardTitle(page, cut.id));
    assertNoStar("tab label", await activeTabLabel(page));
    const tabs = await ownedShotTabCount(page, pid);
    if (tabs !== 1) throw new Error(`expected one owned shot tab, got ${tabs}`);
    if (shotFileSaves.length) throw new Error(`opening a version saved the shot file: ${shotFileSaves.join(", ")}`);
    console.log("PASS  video version: stored workflow opened, one shot tab, no *, no WIP save");

    // 3. no workflow: warn toast, canvas unchanged
    await clickVersionThumb(page, vNone);
    await page.waitForFunction(
      () => (document.getElementById("gg-toast-host")?.textContent || "").includes("No workflow saved for this version."),
      { timeout: 15000 }
    );
    await sleep(300);
    if ((await currentMarkerTitle(page, markerNode.id)) !== T_VIDEO) throw new Error("canvas changed for a version without workflow");
    cls = await verClasses(page);
    if (!cls[vVid]?.open || cls[vNone]?.open) throw new Error(`gg-ver-open moved without a load: ${JSON.stringify(cls)}`);
    console.log(`PASS  missing workflow: toast "${(await toastText(page)).trim()}", canvas kept`);

    // 4. WIP is autosaved first, the clicked version still wins; re-clicking the cut keeps it
    const movedTo = await moveNode(page, markerNode.id);
    await clickVersionThumb(page, vImg);
    await waitForMarkerTitle(page, markerNode.id, T_EMBED);
    await sleep(2500);
    const diskNode = await page.evaluate(async (rel, id) => {
      const r = await fetch(`/api/userdata/${encodeURIComponent("workflows/" + rel)}`);
      const j = r.ok ? await r.json() : null;
      const n = j?.nodes?.find((x) => String(x.id) === String(id));
      return n ? { title: n.title, pos: [Math.round(n.pos[0] ?? n.pos["0"]), Math.round(n.pos[1] ?? n.pos["1"])], wip: !!j.extra?.ggWip } : null;
    }, shotWorkflowRelPathById({ projectId: pid, cutId: cut.id }), markerNode.id);
    if (!diskNode || diskNode.title !== T_VIDEO || diskNode.pos[0] !== Math.round(movedTo[0]) || diskNode.pos[1] !== Math.round(movedTo[1]) || !diskNode.wip) {
      throw new Error(`edited graph was not autosaved before opening the version: ${JSON.stringify({ diskNode, movedTo })}`);
    }
    await clickCut(page, cut.id);
    await sleep(2500);
    if ((await currentMarkerTitle(page, markerNode.id)) !== T_EMBED) throw new Error("WIP restore overrode the clicked version");
    console.log("PASS  WIP autosaved first; clicked version kept over WIP restore");

    if (pickPosts.length) throw new Error(`pick/edit POSTs sent: ${pickPosts.join(", ")}`);
    timelineMocks.delete(pid);
    const { data: tl1 } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    if ((tl1?.cuts?.[0]?.pick ?? null) !== serverPickBefore) throw new Error("server pick changed");
    console.log("PASS  no pick/edit POST; server pick unchanged");
  } finally {
    try {
      await cleanup(page);
    } catch (_) {}
    await browser.close().catch(() => {});
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
  if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST (${blockedPromptAttempts})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
