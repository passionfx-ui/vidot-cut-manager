/**
 * Headless Chrome UI screen tests for gonggan-cut (0.5.1–0.7.0) against live ComfyUI.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { submitAskDialog } from "./ask_text_helpers.mjs";
import { waitForDomCutCountSync } from "./dom_sync_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCREENS_DIR = path.join(REPO_ROOT, "tests/screens");
const RESULTS_PATH = path.join(SCREENS_DIR, "results.json");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ screentest";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const createdProjectIds = [];
let blockedPromptAttempts = 0;
/** @type {Map<string, object>} */
const timelineMocks = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkRam(label) {
  const free = os.freemem();
  if (free < MIN_RAM) {
    throw new Error(`RAM check failed (${label}): ${Math.round(free / 1e9)} GB free, need 40+ GB`);
  }
}

function ensureDirs() {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
}

function isBlockedPost(url, method) {
  if (method !== "POST") return false;
  try {
    const p = new URL(url).pathname;
    return BLOCKED_POST.some((re) => re.test(p));
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
    if (method === "GET" && /gonggan\/timeline/.test(url)) {
      try {
        const u = new URL(url);
        const pid = u.searchParams.get("pid");
        if (pid && timelineMocks.has(pid)) {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(timelineMocks.get(pid)),
          });
          return;
        }
      } catch (_) {}
    }
    if (method === "POST" && /\/gonggan\/edit$/.test(new URL(url).pathname)) {
      try {
        const raw = req.postData() || "{}";
        const body = JSON.parse(raw);
        const pid = body.pid;
        if (pid && timelineMocks.has(pid)) {
          const tl = timelineMocks.get(pid);
          const clips = body.clips || {};
          for (const c of tl.cuts || []) {
            const clip = clips[c.id];
            if (clip && clip.pick) {
              c.pick = clip.pick;
              const v = (c.versions_list || []).find((x) => x.id === clip.pick);
              if (v) c.media = { id: v.id, kind: v.kind };
            }
          }
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, ...tl }),
          });
          return;
        }
      } catch (_) {}
    }
    req.continue();
  });
}

async function postJson(page, route, body) {
  return page.evaluate(async (r, b) => {
    const res = await fetch(r.startsWith("http") ? r : `${location.origin}${r}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }, route, body);
}

async function getJson(page, route) {
  return page.evaluate(async (r) => {
    const res = await fetch(r.startsWith("http") ? r : `${location.origin}${r}`);
    return res.json();
  }, route);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-screen-test-${runStamp}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  browser._ggUserDataDir = userDataDir;
  return browser;
}

async function closeBrowser(browser) {
  if (!browser) return;
  const dir = browser._ggUserDataDir;
  try {
    await browser.close();
  } finally {
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

const pluginConsoleErrors = [];

function wireConsole(page) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    const loc = msg.location();
    const url = loc?.url || "";
    if (
      /gonggan/i.test(text) ||
      /comfyui-gonggan-cut/i.test(url) ||
      /\/web\/gonggan/i.test(url) ||
      /gg_progress_core/i.test(url)
    ) {
      pluginConsoleErrors.push({ text, url: url.slice(-120) });
    }
  });
  page.on("pageerror", (err) => {
    const stack = String(err.stack || err.message || err);
    if (/gonggan|gg_progress/i.test(stack)) {
      pluginConsoleErrors.push({ text: stack.slice(0, 500), url: "pageerror" });
    }
  });
}

function acceptDialogs(page) {
  page.on("dialog", async (d) => {
    try {
      if (d.type() === "prompt") await d.dismiss();
      else await d.accept();
    } catch (_) {
      try {
        await d.dismiss();
      } catch (_) {}
    }
  });
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager, { timeout: 120000 });
  await sleep(1500);
}

async function openShotsTab(page) {
  const opened = await page.evaluate(() => {
    const em = window.app?.extensionManager;
    const st = em?.sidebarTab;
    if (st) {
      st.activeSidebarTabId = "gg-shots";
      return true;
    }
    return false;
  });
  if (!opened) {
    const btn = await page.waitForSelector('[aria-label="Shots list"]', { timeout: 15000 });
    await btn.click();
  }
  await page.waitForSelector(".gg-root.gg-shots", { timeout: 60000 });
}

async function reloadShots(page) {
  // The header is re-rendered right after a project switch; retry the click once the new button has a box.
  for (let i = 0; ; i++) {
    try {
      await page.waitForSelector(".gg-root.gg-shots .gg-reload", { visible: true, timeout: 5000 });
      await page.click(".gg-root.gg-shots .gg-reload");
      break;
    } catch (e) {
      if (i >= 3) throw e;
      await sleep(600);
    }
  }
  await sleep(1200);
}

async function screenshot(page, name) {
  const p = path.join(SCREENS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function rightClickEmptyShots(page) {
  const box = await page.evaluate(() => {
    const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    const cuts = wrap.querySelectorAll(".gg-cut");
    let y;
    if (cuts.length > 0) {
      const lastRect = cuts[cuts.length - 1].getBoundingClientRect();
      const belowY = lastRect.bottom + 12;
      y = belowY < r.bottom - 6 ? belowY : r.bottom - 6;
    } else {
      y = Math.min(r.bottom - 6, r.top + 40);
    }
    const inset = 2;
    const x = Math.max(r.left + inset, Math.min(r.right - inset, r.left + r.width / 2));
    y = Math.max(r.top + inset, Math.min(r.bottom - inset, y));

    const isBlocked = (el) => {
      if (!el) return false;
      if (el.closest(".gg-cut")) return true;
      if (el.closest("textarea, input, button")) return true;
      const header = el.closest("header");
      return !!(header && header.closest(".gg-grp-sec"));
    };
    const hit = document.elementFromPoint(x, y);
    if (isBlocked(hit)) {
      const tag = hit.tagName.toLowerCase();
      const cls = typeof hit.className === "string" ? hit.className : "";
      throw new Error(
        `rightClickEmptyShots: point (${x}, ${y}) is on blocked element <${tag}${cls ? ` class="${cls}"` : ""}>`
      );
    }
    return { x, y };
  });
  if (!box) throw new Error("gg-grp-wrap not found");
  await page.mouse.click(box.x, box.y, { button: "right" });
}

async function clickCtxItem(page, label) {
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  const items = await page.$$(".gg-ctx-item");
  for (const it of items) {
    const t = await page.evaluate((n) => n.textContent?.trim(), it);
    if (t === label) {
      await it.click();
      return;
    }
  }
  throw new Error(`Context menu item not found: ${label}`);
}

async function countCuts(page) {
  return page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.length);
}

async function getActiveProjectName(page) {
  return page.$eval(".gg-root.gg-shots .gg-proj", (sel) => {
    const opt = sel.options[sel.selectedIndex];
    return opt ? opt.textContent : "";
  });
}

async function createProjectViaUi(page, name, templateRef) {
  await page.evaluate(() => {
    const head = document.querySelector(".gg-root.gg-shots .gg-head");
    head?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await page.waitForSelector(".gg-modal", { timeout: 10000 });
  await page.click(".gg-modal-name", { clickCount: 3 });
  await page.type(".gg-modal-name", name, { delay: 8 });
  if (templateRef) {
    await page.waitForFunction(() => document.querySelector(".gg-modal-tpl option[value]"), { timeout: 20000 }).catch(() => {});
    await page.select(".gg-modal-tpl", templateRef).catch(() => {});
  }
  await page.click(".gg-modal .gg-primary");
  await page.waitForFunction(
    (n) => {
      const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
      const opt = sel?.options[sel.selectedIndex];
      return opt && opt.textContent.includes(n);
    },
    { timeout: 30000 },
    name
  );
  const pid = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.value);
  if (pid) createdProjectIds.push(pid);
  await waitForDomCutCountSync(page);
  return pid;
}

/** Bottom selection bar (0.9.73): always shown under the list; buttons follow the selection. */
async function selbarState(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".gg-root.gg-shots");
    const bar = root?.querySelector(".gg-selbar");
    if (!bar) return null;
    const st = getComputedStyle(bar);
    const r = bar.getBoundingClientRect();
    const list = root.querySelector(".gg-grp-wrap").getBoundingClientRect();
    const dis = (s) => !!bar.querySelector(s)?.disabled;
    return {
      visible: !bar.hidden && st.display !== "none" && st.visibility !== "hidden" && r.height > 0,
      count: parseInt(bar.querySelector(".gg-sel-count")?.textContent || "-1", 10),
      renderDisabled: dis(".gg-sel-render"),
      groupDisabled: dis(".gg-sel-group"),
      xDisabled: dis(".gg-sel-x"),
      barTop: r.top,
      barBottom: r.bottom,
      rootBottom: root.getBoundingClientRect().bottom,
      listTop: list.top,
      listBottom: list.bottom,
    };
  });
}

/** Lower-left cut panel (hidden by SHOW_CUT_PANEL in 0.9.73). */
async function requireCutPanel(page) {
  const shown = await page.evaluate(() => !!document.querySelector(".gg-root.gg-shots .gg-cutpanel")?.getClientRects().length);
  if (shown) return;
  const err = new Error("SKIP panel hidden: cut panel is off (SHOW_CUT_PANEL = false)");
  err.skipped = true;
  throw err;
}

async function openCutContextMenu(page, index = 0) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  if (!cuts[index]) throw new Error(`cut index ${index} missing`);
  const box = await cuts[index].boundingBox();
  if (!box) throw new Error("cut box missing");
  await page.mouse.click(box.x + 12, box.y + box.height / 2, { button: "right" });
}

async function ctrlClickCut(page, index) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  await page.keyboard.down("Control");
  try {
    await cuts[index].click();
  } finally {
    await page.keyboard.up("Control");
  }
}

async function selectionCount(page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".gg-root.gg-shots .gg-sel-count");
    return bar ? parseInt(bar.textContent, 10) : 0;
  });
}

async function clickCut(page, index = 0) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  await cuts[index].click();
}

async function shiftClickCut(page, index) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  await page.keyboard.down("Shift");
  try {
    await cuts[index].click();
  } finally {
    await page.keyboard.up("Shift");
  }
}

async function fetchWorkflowPaths(page) {
  const data = await getJson(page, "/api/userdata?dir=workflows&recurse=true&split=false");
  if (Array.isArray(data)) {
    return data
      .map((x) => (typeof x === "string" ? x : x.path || x.name || ""))
      .filter(Boolean)
      .map((p) => String(p).replace(/^\/+/, ""));
  }
  if (data && typeof data === "object") return Object.keys(data);
  return [];
}

// The first *.json in userdata is often not a usable UI-graph template (API-format exports,
// settings files...). Cut load then fails with "workflow must be a UI graph" and every
// waitForCutLoaded() times out at 90 s. Pick a template that really is a UI graph.
async function pickUsableTemplateRef(page, paths) {
  const norm = (p) => String(p).replace(/^\/+/, "");
  const base = (p) => norm(p).replace(/^.*\//, "").toLowerCase();
  const cands = paths.filter((p) => base(p).endsWith(".json") && !/^cut\d+\.json$/i.test(base(p)) && !norm(p).startsWith("gonggan/") && !/_api\.json$/i.test(base(p)));
  cands.sort((a, b) => (base(b).startsWith("zz") ? 1 : 0) - (base(a).startsWith("zz") ? 1 : 0));
  for (const p of cands.slice(0, 40)) {
    const ok = await page.evaluate(async (rel) => {
      try {
        const r = await fetch(`/api/userdata/${encodeURIComponent("workflows/" + rel)}`);
        if (!r.ok) return false;
        const j = await r.json();
        return Array.isArray(j.nodes) && j.nodes.length > 0 && j.nodes.length < 80;
      } catch (_) { return false; }
    }, norm(p));
    if (ok) return norm(p);
  }
  return paths.find((p) => /\.json$/i.test(p)) || "";
}

function buildMockTimeline(pid, stamp) {
  const cutA = `cut-a-${stamp}`;
  const vImg = `ver-img-${stamp}`;
  const vVid = `ver-vid-${stamp}`;
  const vBest = `ver-best-${stamp}`;
  return {
    ok: true,
    project: { id: pid, name: `${TEST_PREFIX} mock`, native: true },
    groups: [],
    groups_customized: true,
    total_sec: 3,
    cuts: [
      {
        id: cutA,
        name: "hero",
        pos: 0,
        index: 0,
        sec: 3,
        in: 0,
        start: 0,
        group_id: "",
        group_name: "",
        media: { id: vBest, kind: "image" },
        pick: vBest,
        versions: 3,
        versions_list: [
          { id: vImg, kind: "image", source: "native", created: 1, seconds: 0, width: 64, height: 64 },
          { id: vVid, kind: "video", source: "native", created: 2, seconds: 1, width: 64, height: 64 },
          { id: vBest, kind: "image", source: "native", created: 3, seconds: 0, width: 64, height: 64 },
        ],
      },
    ],
  };
}

function buildMockTimelineNoPick(pid, stamp) {
  const t = buildMockTimeline(pid, stamp);
  const cut = t.cuts[0];
  cut.pick = null;
  cut.media = null;
  return t;
}

function buildMockTimelineFirstResult(pid, stamp) {
  const cutId = `cut-first-${stamp}`;
  const vid = `ver-first-${stamp}`;
  return {
    ok: true,
    project: { id: pid, name: `${TEST_PREFIX} first result`, native: true },
    groups: [],
    groups_customized: true,
    total_sec: 3,
    cuts: [
      {
        id: cutId,
        name: "cut1",
        pos: 0,
        index: 0,
        sec: 3,
        in: 0,
        start: 0,
        group_id: "",
        group_name: "",
        media: { id: vid, kind: "image" },
        pick: null,
        versions: 1,
        versions_list: [{ id: vid, kind: "image", source: "native", created: 1, seconds: 0, width: 64, height: 64 }],
      },
    ],
  };
}

async function cleanupProjects(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup delete ${pid}:`, e.message);
    }
  }
}

const scenarios = [];
let browser;
let page;
let mainPid = "";
let mainProjectName = "";
let templateRef = "";

async function runScenario(id, title, fn) {
  checkRam(`before ${id}`);
  const entry = { id, title, status: "FAIL", detail: "", screenshot: null };
  try {
    if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST attempted (${blockedPromptAttempts})`);
    await fn();
    entry.status = "PASS";
    entry.detail = "ok";
    console.log(`PASS  ${id} ${title}`);
  } catch (e) {
    if (e.skipped) {
      entry.status = "SKIPPED";
      entry.detail = e.message;
      console.log(`SKIP  ${id} ${title}: ${e.message}`);
    } else {
      entry.detail = (e.message || String(e)) + (e.stack ? " @ " + String(e.stack).split("\n").filter((x) => x.includes("screen_test")).slice(0, 2).join(" | ").replace(/file:\/\/\/\S*\//g, "") : "");
      console.log(`FAIL  ${id} ${title}: ${entry.detail}`);
    }
  }
  try {
    entry.screenshot = await screenshot(page, `scenario-${id}`);
  } catch (_) {}
  scenarios.push(entry);
  checkRam(`after ${id}`);
}

async function main() {
  ensureDirs();
  checkRam("startup");
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  browser = await launchBrowser();
  page = await browser.newPage();
  wireConsole(page);
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  acceptDialogs(page);

  mainProjectName = `${TEST_PREFIX} ${runStamp}`;

  await runScenario("01", "Open Shots tab, no plugin console errors", async () => {
    pluginConsoleErrors.length = 0;
    await waitForComfy(page);
    await openShotsTab(page);
    await sleep(2000);
    if (pluginConsoleErrors.length) {
      throw new Error(pluginConsoleErrors.map((x) => x.text).join(" | "));
    }
  });

  await runScenario("02", "New native project becomes active", async () => {
    const paths = await fetchWorkflowPaths(page);
    templateRef = await pickUsableTemplateRef(page, paths);
    mainPid = await createProjectViaUi(page, mainProjectName, templateRef || undefined);
    if (!mainPid || !mainPid.includes("-")) throw new Error(`expected native uuid pid, got ${mainPid}`);
    const label = await getActiveProjectName(page);
    if (!label.includes(mainProjectName)) throw new Error(`active label mismatch: ${label}`);
  });

  await runScenario("03", "Empty area Add Cut", async () => {
    timelineMocks.delete(mainPid);
    await waitForDomCutCountSync(page);
    const before = await countCuts(page);
    await rightClickEmptyShots(page);
    await clickCtxItem(page, "Add Cut");
    await page.waitForFunction(
      (n) => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length > n,
      { timeout: 15000 },
      before
    );
    await waitForDomCutCountSync(page);
  });

  await runScenario("04", "Multi-select and Group into scene", async () => {
    while ((await countCuts(page)) < 4) {
      await rightClickEmptyShots(page);
      await clickCtxItem(page, "Add Cut");
      await sleep(500);
      await waitForDomCutCountSync(page);
    }
    await clickCut(page, 0);
    await ctrlClickCut(page, 2);
    await ctrlClickCut(page, 3);
    await page.waitForFunction(
      () => {
        const bar = document.querySelector(".gg-root.gg-shots .gg-selbar");
        const n = parseInt(document.querySelector(".gg-root.gg-shots .gg-sel-count")?.textContent || "0", 10);
        return bar && !bar.hidden && n >= 2;
      },
      { timeout: 5000 }
    );
    const nSel = await selectionCount(page);
    if (nSel < 2) throw new Error(`selection bar should show for 3 selected (count=${nSel})`);
    await page.click(".gg-root.gg-shots .gg-sel-group");
    await submitAskDialog(page);
    await sleep(1000);
    const scenes = await page.$$eval(".gg-root.gg-shots .gg-grp-sec[data-group-id]", (els) => els.length);
    if (scenes < 1) throw new Error("expected a scene section after group");
  });

  await runScenario("05", "Bottom selection bar: always shown, pinned under the list, list never shifts", async () => {
    await page.keyboard.press("Escape");
    await sleep(300);
    const s0 = await selbarState(page);
    if (!s0?.visible) throw new Error(`bar not shown: ${JSON.stringify(s0)}`);
    if (s0.barTop < s0.listBottom - 1 || s0.rootBottom - s0.barBottom > 24) throw new Error(`bar not at the bottom: ${JSON.stringify(s0)}`);
    if (s0.count === 0 && (!s0.renderDisabled || !s0.groupDisabled)) throw new Error(`0 selected must disable actions: ${JSON.stringify(s0)}`);
    await clickCut(page, 0);
    await sleep(250);
    const s1 = await selbarState(page);
    if (!s1.visible || s1.count !== 1 || s1.renderDisabled || !s1.xDisabled) throw new Error(`1 selected: ${JSON.stringify(s1)}`);
    await shiftClickCut(page, 1);
    await page.waitForFunction(
      () => parseInt(document.querySelector(".gg-root.gg-shots .gg-sel-count")?.textContent || "0", 10) >= 2,
      { timeout: 5000 }
    );
    const s2 = await selbarState(page);
    if (!s2.visible || s2.renderDisabled || s2.xDisabled) throw new Error(`2+ selected: ${JSON.stringify(s2)}`);
    if (Math.abs(s2.listTop - s0.listTop) > 0.5 || Math.abs(s1.listTop - s0.listTop) > 0.5) {
      throw new Error(`list moved with the selection: ${s0.listTop} / ${s1.listTop} / ${s2.listTop}`);
    }
  });

  await runScenario("06", "Context menu opaque and compact", async () => {
    await openCutContextMenu(page, 0);
    const m = await page.evaluate(() => {
      const menu = document.querySelector(".gg-ctx");
      if (!menu) return null;
      const st = getComputedStyle(menu);
      const bg = st.backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      let alpha = 1;
      if (m) {
        const parts = m[1].split(",").map((s) => s.trim());
        if (parts.length === 4) alpha = parseFloat(parts[3]);
      }
      const r = menu.getBoundingClientRect();
      return { alpha, width: r.width, height: r.height, bg };
    });
    await page.keyboard.press("Escape");
    if (!m) throw new Error("menu missing");
    if (m.alpha < 0.99) throw new Error(`menu not opaque: alpha=${m.alpha} bg=${m.bg}`);
    if (m.width > 220) throw new Error(`menu too wide: ${m.width}px`);
    if (m.height > 360) throw new Error(`menu too tall: ${m.height}px`);
  });

  await runScenario("07", "Cut click loads workflow tab labeled Project/Scene cutLabel", async () => {
    if (!templateRef) {
      const err = new Error("No saved ComfyUI workflow for template — skipped");
      err.skipped = true;
      throw err;
    }
    timelineMocks.delete(mainPid);
    await reloadShots(page);
    await clickCut(page, 0);
    await sleep(1200);
    const info = await page.evaluate(() => {
      const ws = window.app?.extensionManager?.workflow;
      const active = ws?.activeWorkflow;
      const tabEls = [...document.querySelectorAll('[data-testid="workflow-tab"]')];
      const activeEl = tabEls.find((el) => /active|selected|p-tab-active/.test(el.className + " " + (el.getAttribute("aria-selected") || ""))) || tabEls[tabEls.length - 1];
      // 0.9.18: file name is the stable cutId; the displayed tab label is `<Project>/<Scene> <cutLabel>`.
      const base = activeEl?.querySelector(".workflow-label")?.textContent?.trim() || active?.filename || "";
      const numEl = document.querySelector(".gg-root.gg-shots .gg-cut .gg-num");
      return { tab: base, cutLabel: numEl?.textContent?.trim() || "" };
    });
    if (!info.tab) throw new Error("No active workflow tab after cut click");
    if (!info.cutLabel) throw new Error("No cut label on first cut card");
    if (!info.tab.includes("/") || !info.tab.replace(/ \*$/, "").endsWith(info.cutLabel)) {
      throw new Error(`tab "${info.tab}" does not end with cut label "${info.cutLabel}" (expected <Project>/<Scene> ${info.cutLabel})`);
    }  });

  await runScenario("08", "Template dropdown (Project Settings gear) matches saved workflows", async () => {
    if (await page.$(".gg-root.gg-shots .gg-tpl-select")) {
      throw new Error("Template selector should be in the Project Settings modal, not the sidebar header");
    }
    const paths = await fetchWorkflowPaths(page);
    await page.click(".gg-root.gg-shots .gg-proj-settings");
    await page.waitForSelector('.gg-modal[aria-label="Project settings"] .gg-tpl-select', { timeout: 8000 });
    await page.focus(".gg-modal .gg-tpl-select");
    await sleep(400);
    const opts = await page.$$eval(".gg-modal .gg-tpl-select option", (els) =>
      els.map((o) => o.value).filter((v) => v)
    );
    await page.click(".gg-modal .gg-modal-cancel");
    await page.waitForFunction(() => !document.querySelector(".gg-modal-backdrop"), { timeout: 5000 });
    if (paths.length > 0 && opts.length === 0) throw new Error("dropdown empty but userdata has workflows");
    const pathSet = new Set(paths);
    const extras = opts.filter((v) => !pathSet.has(v));
    if (extras.length > Math.max(2, paths.length * 0.1)) {
      throw new Error(`dropdown sync issue (${extras.length} unknown refs)`);
    }
  });

  await runScenario("09", "Trash: cut and project restore", async () => {
    timelineMocks.delete(mainPid);
    await page.keyboard.press("Escape");
    await sleep(200);
    await reloadShots(page);
    const tlBefore = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(mainPid)}`);
    const before = tlBefore.cuts?.length ?? 0;
    if (before < 1) throw new Error("no cuts to delete");
    const lastIdx = (await countCuts(page)) - 1;
    await openCutContextMenu(page, lastIdx);
    await clickCtxItem(page, "Delete");
    await page.waitForFunction(
      (pid, n) =>
        fetch(`/gonggan/timeline?pid=${encodeURIComponent(pid)}`)
          .then((r) => r.json())
          .then((d) => (d.cuts?.length ?? 0) < n),
      { timeout: 15000 },
      mainPid,
      before
    );
    const restoreRes = await postJson(page, "/gonggan/cut/restore", { pid: mainPid });
    const tlLen = restoreRes.timeline?.cuts?.length ?? 0;
    if (tlLen < before) throw new Error(`cut restore API timeline ${tlLen} < ${before}`);
    await reloadShots(page);
    const afterRestore = await countCuts(page);
    if (afterRestore < before) {
      throw new Error(`cut restore UI count ${afterRestore} (was ${before}, after del ${afterDel})`);
    }

    const trashName = `${TEST_PREFIX} trash ${runStamp}`;
    const trashPid = await createProjectViaUi(page, trashName);
    await postJson(page, "/gonggan/project/delete", { pid: trashPid });
    await reloadShots(page);
    await postJson(page, "/gonggan/project/restore", { pid: trashPid });
    await reloadShots(page);
    const names = await page.$$eval(".gg-root.gg-shots .gg-proj option", (o) => o.map((x) => x.textContent));
    if (!names.some((n) => n.includes(trashName))) throw new Error("restored project not in list");
    await postJson(page, "/gonggan/project/delete", { pid: trashPid });
    timelineMocks.delete(mainPid);
    await page.select(".gg-root.gg-shots .gg-proj", mainPid);
    await reloadShots(page);
  });

  await runScenario("10", "Progress: Best done + header summary (mocked timeline)", async () => {
    timelineMocks.set(mainPid, buildMockTimeline(mainPid, runStamp));
    await reloadShots(page);
    const state = await page.evaluate(() => {
      const row = document.querySelector(".gg-root.gg-shots .gg-cut .gg-stage-row");
      const sum = document.querySelector(".gg-root.gg-shots .gg-summary-text")?.textContent?.trim() || "";
      const glowHidden = document.querySelector(".gg-root.gg-shots .gg-done-glow")?.hidden;
      return {
        allDone: row?.classList.contains("gg-stage-all-done"),
        glow: glowHidden === false,
        sum,
      };
    });
    if (!state.allDone) throw new Error("gg-stage-all-done not set with Best pick");
    // gg-done-glow was removed in 0.9.3 (stage dots + gg-stage-all-done replaced it).
    if (!/^Best\s+1\//i.test(state.sum) && !/Best 1\//.test(state.sum)) {
      throw new Error(`summary wrong: "${state.sum}"`);
    }
    if (!/Video/i.test(state.sum) || !/Image/i.test(state.sum)) {
      throw new Error(`summary missing Video/Image: "${state.sum}"`);
    }
  });

  await runScenario("11", "Best change updates header summary immediately", async () => {
    await requireCutPanel(page);
    const mock = buildMockTimelineNoPick(mainPid, runStamp);
    timelineMocks.set(mainPid, mock);
    await reloadShots(page);
    await clickCut(page, 0);
    await sleep(600);
    const before = await page.$eval(".gg-root.gg-shots .gg-summary-text", (el) => el.textContent.trim());
    if (/Best\s+[1-9]/i.test(before)) throw new Error(`expected 0 best before pick, got: ${before}`);
    const bestVid = mock.cuts[0].versions_list[2].id;
    const btn = await page.waitForSelector(
      `.gg-cutpanel .gg-ver-wrap[data-vid="${bestVid}"] .gg-promote:not([disabled])`,
      { timeout: 8000 }
    );
    await btn.click();
    await sleep(800);
    const after = await page.$eval(".gg-root.gg-shots .gg-summary-text", (el) => el.textContent.trim());
    if (!/Best 1\//.test(after)) throw new Error(`summary did not update after pick: "${after}"`);
    timelineMocks.delete(mainPid);
    await reloadShots(page);
  });

  await runScenario("12", "First result is not Best until picked manually (mock timeline)", async () => {
    await requireCutPanel(page);
    const mock = buildMockTimelineFirstResult(mainPid, runStamp);
    const vid = mock.cuts[0].versions_list[0].id;
    timelineMocks.set(mainPid, mock);
    await reloadShots(page);
    await clickCut(page, 0);
    await sleep(600);
    const read = () => page.evaluate((v) => {
      const wrap = document.querySelector(`.gg-cutpanel .gg-ver-wrap[data-vid="${v}"]`);
      return {
        allDone: !!document.querySelector(".gg-root.gg-shots .gg-cut .gg-stage-row")?.classList.contains("gg-stage-all-done"),
        bestOn: !!document.querySelector('.gg-root.gg-shots .gg-cut .gg-stage-dot[data-k="best"]')?.classList.contains("gg-on"),
        sum: document.querySelector(".gg-root.gg-shots .gg-summary-text")?.textContent?.trim() || "",
        rep: !!wrap?.classList.contains("gg-rep"),
        implicit: !!wrap?.classList.contains("gg-implicit"),
        badge: !!wrap?.querySelector(".gg-ver-rep"),
        btnDisabled: wrap?.querySelector(".gg-promote")?.disabled ?? null,
      };
    }, vid);
    const before = await read();
    if (before.allDone || before.bestOn) throw new Error(`Best/Done lit without a manual pick: ${JSON.stringify(before)}`);
    if (!/Best 0\/1/.test(before.sum)) throw new Error(`summary before pick: "${before.sum}"`);
    if (!before.implicit || before.rep || before.badge) throw new Error(`implicit latest marker wrong: ${JSON.stringify(before)}`);
    if (before.btnDisabled !== false) throw new Error(`Set rep must stay enabled on implicit latest: ${JSON.stringify(before)}`);
    const clicked = await page.evaluate((v) => {
      const b = document.querySelector(`.gg-cutpanel .gg-ver-wrap[data-vid="${v}"] .gg-promote`);
      if (!b) return false;
      b.click();
      return true;
    }, vid);
    if (!clicked) throw new Error("Set rep button not found");
    await sleep(800);
    const after = await read();
    if (!after.allDone || !after.bestOn) throw new Error(`Best/Done not lit after manual pick: ${JSON.stringify(after)}`);
    if (!/Best 1\/1/.test(after.sum)) throw new Error(`summary after pick: "${after.sum}"`);
    if (!after.rep || !after.badge || after.implicit || after.btnDisabled !== true) {
      throw new Error(`manual Rep marker wrong: ${JSON.stringify(after)}`);
    }
    timelineMocks.delete(mainPid);
    await reloadShots(page);
  });

  try {
    await cleanupProjects(page);
  } catch (e) {
    console.warn("cleanup:", e.message);
  }

  if (blockedPromptAttempts > 0) console.error(`FATAL: ${blockedPromptAttempts} blocked generation POST(s)`);

  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify({ runStamp, mainPid, blockedPromptAttempts, scenarios, pluginConsoleErrors }, null, 2),
    "utf8"
  );

  await closeBrowser(browser);
  browser = null;

  const failed = scenarios.filter((s) => s.status === "FAIL");
  process.exit(failed.length || blockedPromptAttempts > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser(browser);
  process.exit(2);
});
