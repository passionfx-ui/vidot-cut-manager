/**
 * Timeline on/off toggle: Shots header button, T shortcut, localStorage gg.timelineOpen / height.
 * ZZ-test- project only. Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-timeline-toggle";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-timeline-toggle-${runStamp}`);
const createdProjectIds = [];
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
    req.continue();
  });
}

async function getJson(page, route) {
  return page.evaluate(async (r) => {
    const res = await fetch(r.startsWith("http") ? r : `${location.origin}${r}`);
    const text = await res.text().catch(() => "");
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {}
    return { ok: res.ok, status: res.status, data, text };
  }, route);
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

async function fetchWorkflowPaths(page) {
  const { data } = await getJson(page, "/api/userdata?dir=workflows&recurse=true&split=false");
  if (Array.isArray(data)) {
    return data
      .map((x) => (typeof x === "string" ? x : x.path || x.name || ""))
      .filter(Boolean)
      .map((p) => String(p).replace(/^\/+/, ""));
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
        return Array.isArray(j.nodes) && j.nodes.length > 0 && j.nodes.length < 80;
      } catch (_) {
        return false;
      }
    }, norm(p));
    if (ok) return norm(p);
  }
  return "";
}

async function launchPersistentBrowser() {
  fs.mkdirSync(PERSISTENT_USER_DATA_DIR, { recursive: true });
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: PERSISTENT_USER_DATA_DIR,
    protocolTimeout: 240000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
}

async function newGuardedPage(browser) {
  const page = await browser.newPage(); page.on("dialog", (d) => d.accept().catch(() => {}));
  page.setDefaultNavigationTimeout(180000);
  page.setDefaultTimeout(60000);
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  return page;
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
  await sleep(1500);
}

async function openShotsTab(page) {
  const opened = await page.evaluate(() => {
    const st = window.app?.extensionManager?.sidebarTab;
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

async function selectProject(page, pid) {
  await page.waitForSelector(".gg-root.gg-shots .gg-proj", { timeout: 30000 });
  for (let i = 0; i < 12; i++) {
    await page.select(".gg-root.gg-shots .gg-proj", pid);
    await sleep(600);
    const v = await page.$eval(".gg-root.gg-shots .gg-proj", (el) => el.value);
    if (v === pid) break;
  }
  await sleep(500);
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

async function createProjectViaUi(page, name, templateRef) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await page.waitForSelector(".gg-modal", { timeout: 10000 });
  await page.click(".gg-modal-name", { clickCount: 3 });
  await page.type(".gg-modal-name", name, { delay: 8 });
  if (templateRef) {
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
  await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 1, { timeout: 20000 });
  const pid = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.value);
  if (pid) createdProjectIds.push(pid);
  return pid;
}

async function timelineMetrics(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".gg-timeline");
    const bp = window.app?.extensionManager?.bottomPanel;
    const panelOpen = !!(bp?.bottomPanelVisible && bp.activeBottomPanelTabId === "gg-timeline");
    if (!el || !el.isConnected || !el.offsetParent) {
      return { visible: false, height: 0, panelOpen, openFlag: localStorage.getItem("gg.timelineOpen") };
    }
    const r = el.getBoundingClientRect();
    return { visible: true, height: r.height, panelOpen, openFlag: localStorage.getItem("gg.timelineOpen") };
  });
}

async function clickCutById(page, cutId) {
  const sel = `.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"]`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  await sleep(400);
}

/** Since 0.9.57 the T shortcut needs the pointer (or focus) inside Shots or the Timeline panel. */
async function hoverShots(page) {
  await page.waitForSelector(".gg-root.gg-shots .gg-head", { timeout: 15000 });
  await page.hover(".gg-root.gg-shots .gg-head");
  await sleep(150);
}

async function canvasPoint(page) {
  const pt = await page.evaluate(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (let fy = 0.2; fy <= 0.6; fy += 0.1) {
      for (let fx = 0.85; fx >= 0.4; fx -= 0.05) {
        const x = Math.round(W * fx);
        const y = Math.round(H * fy);
        const el = document.elementFromPoint(x, y);
        if (el && el.tagName === "CANVAS" && !el.closest(".gg-root, .gg-timeline")) return { x, y };
      }
    }
    return null;
  });
  if (!pt) throw new Error("no point over the ComfyUI canvas found");
  return pt;
}

async function hoverCanvasAndBlur(page) {
  const pt = await canvasPoint(page);
  await page.mouse.move(pt.x, pt.y, { steps: 4 });
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    try {
      window.app?.canvas?.deselectAll?.();
    } catch (_) {}
  });
  await sleep(150);
  const inScope = await page.evaluate(() => {
    const ae = document.activeElement;
    const sel = ".gg-root.gg-shots, .gg-timeline";
    return !!(ae && ae !== document.body && ae.closest(sel));
  });
  if (inScope) throw new Error("focus is still inside Shots/Timeline after blur");
}

async function cleanupProjects(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      console.warn(`cleanup ${pid}:`, e.message);
    }
  }
}

async function cleanupProjectsHttp() {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      const res = await fetch(`${BASE}/gonggan/project/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
      if (!res.ok) console.warn(`cleanup ${pid}: HTTP ${res.status}`);
    } catch (e) {
      console.warn(`cleanup ${pid}:`, e.message);
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

  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);

  try {
    await waitForComfy(page);
    await openShotsTab(page);
    await page.evaluate(() => {
      localStorage.setItem("gg.timelineOpen", "1");
    });
    const paths = await fetchWorkflowPaths(page);
    const templateRef = await pickUsableTemplateRef(page, paths);
    if (!templateRef) throw new Error("need a usable workflow template");

    const projectName = `${TEST_PREFIX} ${runStamp}`;
    const pid = await createProjectViaUi(page, projectName, templateRef);
    await selectProject(page, pid);
    await sleep(800);

    let m = await timelineMetrics(page);
    if (!m.visible || m.height < 220) throw new Error(`initial timeline should be on with height>=220 (got ${m.height})`);

    const heightBeforeOff = m.height;
    await page.click(".gg-root.gg-shots .gg-timeline-toggle");
    await sleep(600);
    m = await timelineMetrics(page);
    if (m.visible) throw new Error("timeline should collapse after toggle off");
    if (m.openFlag !== "0") throw new Error(`expected gg.timelineOpen '0', got ${m.openFlag}`);
    const pressed = await page.$eval(".gg-timeline-toggle", (b) => b.getAttribute("aria-pressed"));
    if (pressed !== "false") throw new Error("expected aria-pressed false when off");

    const { data: tl0 } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const cut = (tl0?.cuts || [])[0];
    if (!cut?.id) throw new Error("expected one cut");
    await clickCutById(page, cut.id);
    m = await timelineMetrics(page);
    if (m.visible || m.panelOpen) throw new Error("selecting cut while off must not open timeline");

    await hoverShots(page);
    await page.keyboard.press("t");
    await sleep(800);
    m = await timelineMetrics(page);
    if (!m.visible || m.height < 220) throw new Error("T should turn timeline on");
    if (Math.abs(m.height - heightBeforeOff) > 10) {
      throw new Error(`height after T should be within 10px of before (${heightBeforeOff} vs ${m.height})`);
    }

    await page.evaluate(() => {
      const inp = document.createElement("input");
      inp.className = "gg-e2e-t-input";
      document.body.appendChild(inp);
      inp.focus();
    });
    await page.keyboard.press("t");
    await sleep(300);
    const stillOn = await page.evaluate(() => {
      const el = document.querySelector(".gg-timeline");
      return !!(el && el.offsetParent);
    });
    if (!stillOn) throw new Error("typing t in input must not toggle");
    await page.evaluate(() => document.querySelector(".gg-e2e-t-input")?.remove());

    await page.click(".gg-root.gg-shots .gg-timeline-toggle");
    await sleep(400);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    await waitForComfy(page);
    await openShotsTab(page);
    await selectProject(page, pid);
    await sleep(800);
    m = await timelineMetrics(page);
    if (m.visible || m.openFlag !== "0") throw new Error("reload should restore off state");

    await hoverCanvasAndBlur(page);
    await page.keyboard.press("t");
    await sleep(600);
    m = await timelineMetrics(page);
    if (m.visible || m.openFlag !== "0") throw new Error("T over the ComfyUI canvas must not toggle the timeline");

    await hoverShots(page);
    await page.keyboard.press("t");
    await sleep(600);
    m = await timelineMetrics(page);
    if (!m.visible || m.openFlag !== "1") throw new Error("T with pointer over Shots should turn timeline on after reload");
    await clickCutById(page, cut.id);
    m = await timelineMetrics(page);
    if (!m.visible || m.height < 220) throw new Error("cut select while on should keep timeline height >= 220");

    await hoverCanvasAndBlur(page);
    await page.keyboard.press("t");
    await sleep(600);
    m = await timelineMetrics(page);
    if (!m.visible || m.openFlag !== "1") throw new Error("T over the ComfyUI canvas must not turn the timeline off");

    console.log("PASS  timeline toggle (button, T, localStorage, cut select, reload)");
    console.log("PASS  T over ComfyUI canvas (focus outside Shots) does not toggle");
  } finally {
    try {
      await cleanupProjects(page);
    } catch (_) {
      await cleanupProjectsHttp();
    }
    await browser.close();
    try {
      fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
