/**
 * Reorder with real thumbnails + CDP mouse (headless Chrome).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { GG_VERSION } from "../../web/gg_version.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCREENS_DIR = path.join(REPO_ROOT, "tests/screens");
const RESULTS_PATH = path.join(SCREENS_DIR, "reorder-real-results.json");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-reorder";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const runStamp = Date.now();
const createdProjectIds = [];
let blockedPromptAttempts = 0;
let testPid = "";

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

function patchTimelineMedia(data) {
  if (!data || !Array.isArray(data.cuts)) return data;
  for (const c of data.cuts) {
    c.media = { id: `ver-${c.id}`, kind: "image" };
    if (!c.pick) c.pick = `ver-${c.id}`;
  }
  return data;
}

function attachRequestGuard(page) {
  page.on("request", async (req) => {
    const url = req.url();
    const method = req.method();
    if (isBlockedPost(url, method)) {
      blockedPromptAttempts += 1;
      console.error(`BLOCKED UNSAFE POST: ${method} ${url}`);
      req.abort("blockedbyclient");
      return;
    }
    if (method === "GET" && /gonggan\/(poster|media)/.test(url)) {
      req.respond({ status: 200, contentType: "image/png", body: TINY_PNG });
      return;
    }
    if (method === "GET" && /gonggan\/timeline/.test(url)) {
      if (process.env.GG_DEBUG) console.log("TL", url, "testPid=", testPid);
      try {
        const u = new URL(url);
        const pid = u.searchParams.get("pid");
        if (pid && testPid && pid === testPid) {
          const res = await fetch(url);
          const data = patchTimelineMedia(await res.json());
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(data),
          });
          return;
        }
      } catch (e) {
        console.warn("timeline intercept:", e.message);
      }
    }
    if (method === "POST" && testPid && /gonggan\/(edit|groups|cut\/|scene)/.test(url)) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: req.postData() || "{}" });
        const data = await res.json();
        if (data) patchTimelineMedia(data.cuts ? data : data.timeline);
        req.respond({ status: res.status, contentType: "application/json", body: JSON.stringify(data) });
        return;
      } catch (e) {
        console.warn("post intercept:", e.message);
      }
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

async function fetchServerOrder(page, pid) {
  return page.evaluate(async (p) => {
    const res = await fetch(`/gonggan/timeline?pid=${encodeURIComponent(p)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(`timeline HTTP ${res.status}`);
    return data.cuts.map((c) => c.id);
  }, pid);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-reorder-real-${runStamp}`);
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

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager, { timeout: 120000 });
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
    const btn = await page.waitForSelector('[aria-label="Gonggan shot list"]', { timeout: 15000 });
    await btn.click();
  }
  await page.waitForSelector(".gg-root.gg-shots", { timeout: 60000 });
}

async function installDragStartCounter(page) {
  await page.evaluate(() => {
    window.__ggDragStart = 0;
    const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    if (wrap) {
      wrap.addEventListener(
        "dragstart",
        () => {
          window.__ggDragStart += 1;
        },
        true,
      );
    }
  });
}

async function resetDragStartCounter(page) {
  await page.evaluate(() => {
    window.__ggDragStart = 0;
  });
}

async function assertNoDragStart(page, label) {
  const n = await page.evaluate(() => window.__ggDragStart || 0);
  if (n > 0) throw new Error(`${label}: dragstart fired ${n} time(s) inside list`);
}

async function limitListHeight(page, px = 220) {
  await page.evaluate((h) => {
    const w = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    if (w) w.style.maxHeight = `${h}px`;
  }, px);
}

async function dragWithCdp(page, from, to, { holdAtEdgeMs = 0 } = {}) {
  await resetDragStartCounter(page);
  const cdp = await page.createCDPSession();
  const dispatch = (type, x, y, buttons = 0) =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      buttons,
      clickCount: 1,
    });
  await dispatch("mouseMoved", from.x, from.y);
  await dispatch("mousePressed", from.x, from.y, 1);
  await sleep(60);
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    await dispatch("mouseMoved", x, y, 1);
    await sleep(35);
  }
  await dispatch("mouseMoved", to.x, to.y, 1);
  if (holdAtEdgeMs > 0) await sleep(holdAtEdgeMs);
  await dispatch("mouseReleased", to.x, to.y, 0);
  await cdp.detach();
  await assertNoDragStart(page, "CDP drag");
}

async function cutCenter(page, index) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  const el = cuts[index];
  if (!el) throw new Error(`cut index ${index} missing`);
  const box = await el.boundingBox();
  if (!box) throw new Error("cut box missing");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, el };
}

async function cutThumbCenter(page, index) {
  const pt = await page.evaluate((idx) => {
    const cut = document.querySelectorAll(".gg-root.gg-shots .gg-cut")[idx];
    const im = cut?.querySelector(".gg-thumb-img, .gg-thumb-vid");
    if (!im) return null;
    const r = im.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, index);
  if (!pt) throw new Error(`thumb missing at index ${index}`);
  return pt;
}

async function cutTitleCenter(page, index) {
  const pt = await page.evaluate((idx) => {
    const cut = document.querySelectorAll(".gg-root.gg-shots .gg-cut")[idx];
    const t = cut?.querySelector(".gg-cut-title");
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, index);
  if (!pt) throw new Error(`title missing at index ${index}`);
  return pt;
}

async function handleCenter(page, index) {
  const pt = await page.evaluate((idx) => {
    const cut = document.querySelectorAll(".gg-root.gg-shots .gg-cut")[idx];
    const h = cut?.querySelector(".gg-drag-handle");
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, index);
  if (!pt) throw new Error(`handle missing at index ${index}`);
  return pt;
}

async function wrapEdgeY(page, edge) {
  return page.evaluate((which) => {
    const w = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    if (!w) return null;
    const r = w.getBoundingClientRect();
    const y = which === "top" ? r.top + 8 : r.bottom - 8;
    return { x: r.left + r.width / 2, y };
  }, edge);
}

async function setupProject(page) {
  const name = `${TEST_PREFIX} ${runStamp}`;
  const created = await postJson(page, "/gonggan/project/create", { name });
  testPid = created.project.id;
  createdProjectIds.push(testPid);
  for (let i = 0; i < 13; i++) {
    await postJson(page, "/gonggan/cut/add", { pid: testPid });
  }
  let tl = await page.evaluate(async (pid) => {
    const res = await fetch(`/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    return res.json();
  }, testPid);
  for (let i = 0; i < Math.min(3, tl.cuts.length); i++) {
    try {
      await postJson(page, "/gonggan/cut/update", {
        pid: testPid,
        cut_id: tl.cuts[i].id,
        fields: { name: `${"Very long reorder test cut name ".repeat(4)}#${i + 1}` },
      });
    } catch (_) {
      /* cut rename is not supported by the server yet: long names are optional */
    }
  }
  tl = await page.evaluate(async (pid) => {
    const res = await fetch(`/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    return res.json();
  }, testPid);
  const ids = tl.cuts.map((c) => c.id);
  const groups = [
    {
      id: `scene-a-${runStamp}`,
      name: "Scene Alpha",
      cut_ids: ids.slice(0, 6),
      collapsed: false,
    },
    {
      id: `scene-b-${runStamp}`,
      name: "Scene Beta",
      cut_ids: ids.slice(6, 10),
      collapsed: false,
    },
  ];
  await postJson(page, "/gonggan/groups", { pid: testPid, groups });
  await waitForComfy(page);
  await openShotsTab(page);
  await page.waitForSelector(`.gg-root.gg-shots .gg-proj option[value="${testPid}"]`, { timeout: 30000 });
  await sleep(800);
  await page.select(".gg-root.gg-shots .gg-proj", testPid);
  await sleep(800);
  await page.evaluate(() => document.querySelector(".gg-root.gg-shots .gg-reload")?.click());
  await sleep(1500);
  await limitListHeight(page);
  await installDragStartCounter(page);
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

async function rightClickCut(page, index = 0) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  const cut = cuts[index];
  if (!cut) throw new Error(`cut index ${index} missing`);
  const box = await cut.boundingBox();
  if (!box) throw new Error("cut box missing");
  await page.mouse.click(box.x + 12, box.y + 12, { button: "right" });
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

async function runScenario(id, title, fn) {
  checkRam(`before ${id}`);
  const entry = { id, title, status: "FAIL", detail: "" };
  try {
    if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST attempted (${blockedPromptAttempts})`);
    await fn();
    entry.status = "PASS";
    entry.detail = "ok";
    console.log(`PASS  ${id} ${title}`);
  } catch (e) {
    entry.detail = e.message || String(e);
    console.log(`FAIL  ${id} ${title}: ${entry.detail}`);
    try { await page.screenshot({ path: path.join(SCREENS_DIR, `reorder-real-fail-${id}.png`) }); } catch (_) {}
  }
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
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  page.on("dialog", async (d) => {
    try {
      await d.dismiss();
    } catch (_) {}
  });

  await runScenario("01", "Setup project + version label", async () => {
    await waitForComfy(page);
    await openShotsTab(page);
    await setupProject(page);
    await page.waitForSelector(".gg-version", { timeout: 15000 }); await sleep(500); const label = await page.$eval(".gg-version", (el) => el.textContent?.trim());
    if (label !== `v${GG_VERSION}`) throw new Error(`version label ${label} != v${GG_VERSION}`);
  });

  await runScenario("02a", "Handle drag last to top with auto-scroll", async () => {
    const before = await fetchServerOrder(page, testPid);
    const lastId = before[before.length - 1];
    await page.evaluate(() => {
      const w = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
      if (w) w.scrollTop = w.scrollHeight;
    });
    await sleep(200);
    const n = await page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.length);
    const from = await handleCenter(page, n - 1);
    const topEdge = await wrapEdgeY(page, "top");
    const first = await cutCenter(page, 0);
    await dragWithCdp(page, from, { x: first.x, y: topEdge.y }, { holdAtEdgeMs: 600 });
    await sleep(3000);
    const after = await fetchServerOrder(page, testPid);
    if (after[0] !== lastId) throw new Error(`expected ${lastId.slice(-4)} first, got ${after.map((x) => x.slice(-4)).join()}`);
  });

  await runScenario("02b", "Drag by thumbnail", async () => {
    const order = await fetchServerOrder(page, testPid);
    const firstId = order[0];
    const lastIdx = order.length - 1;
    const from = await cutThumbCenter(page, 0);
    const to = await cutCenter(page, lastIdx);
    await dragWithCdp(page, from, { x: to.x, y: to.y + 4 });
    await sleep(3000);
    const after = await fetchServerOrder(page, testPid);
    if (after[after.length - 1] !== firstId) throw new Error("thumbnail drag should move first cut to end");
  });

  await runScenario("02c", "Drag by title", async () => {
    const order = await fetchServerOrder(page, testPid);
    await page.evaluate(() => { const w = document.querySelector(".gg-root.gg-shots .gg-grp-wrap"); if (w) w.scrollTop = 0; });
    await sleep(300);
    const movingId = order[3];
    const domIdx = await page.evaluate((id) => {
      const els = [...document.querySelectorAll(".gg-root.gg-shots .gg-cut")];
      return els.findIndex((e) => e.dataset.cutId === id);
    }, movingId);
    const from = await cutTitleCenter(page, domIdx);
    const to = await cutCenter(page, 0);
    await dragWithCdp(page, from, { x: to.x, y: to.y - 25 });
    await sleep(3000);
    const after = await fetchServerOrder(page, testPid);
    if (after[0] !== movingId) throw new Error("title drag should place cut at top");
  });

  await runScenario("02d", "Drag first to bottom with edge hold", async () => {
    await page.evaluate(() => {
      const w = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
      if (w) w.scrollTop = 0;
    });
    const order = await fetchServerOrder(page, testPid);
    const firstId = order[0];
    const from = await handleCenter(page, 0);
    const bottomEdge = await wrapEdgeY(page, "bottom");
    await dragWithCdp(page, from, bottomEdge, { holdAtEdgeMs: 500 });
    await sleep(3000);
    const after = await fetchServerOrder(page, testPid);
    if (after[after.length - 1] !== firstId) throw new Error("first cut should be last after bottom drag");
  });

  await runScenario("02e", "Drag across scene boundary", async () => {
    const order = await fetchServerOrder(page, testPid);
    const ungroupedId = order[order.length - 1];
    const domLast = await page.evaluate(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length - 1);
    await page.evaluate(() => { const w = document.querySelector(".gg-root.gg-shots .gg-grp-wrap"); if (w) w.scrollTop = w.scrollHeight; });
    await sleep(300);
    const from = await handleCenter(page, domLast);
    const topEdge = await wrapEdgeY(page, "top");
    await dragWithCdp(page, from, topEdge, { holdAtEdgeMs: 600 });
    await sleep(3000);
    const after = await fetchServerOrder(page, testPid);
    const idx = after.indexOf(ungroupedId);
    if (idx < 0 || idx > 1) throw new Error("ungrouped last cut should land at top of first scene, index " + idx);
  });

  await runScenario("02f", "Move up/down buttons", async () => {
    const order = await fetchServerOrder(page, testPid);
    const cutId = order[3];
    const domIdx = await page.evaluate((id) => {
      const els = [...document.querySelectorAll(".gg-root.gg-shots .gg-cut")];
      return els.findIndex((e) => e.dataset.cutId === id);
    }, cutId);
    const upDisabled = await page.evaluate((idx) => {
      const cut = document.querySelectorAll(".gg-root.gg-shots .gg-cut")[idx];
      return cut?.querySelector(".gg-move-up")?.disabled;
    }, 0);
    if (upDisabled !== true) throw new Error("first cut move-up should be disabled");
    const downDisabled = await page.evaluate((idx) => {
      const n = document.querySelectorAll(".gg-root.gg-shots .gg-cut").length;
      const cut = document.querySelectorAll(".gg-root.gg-shots .gg-cut")[n - 1];
      return cut?.querySelector(".gg-move-down")?.disabled;
    });
    if (downDisabled !== true) throw new Error("last cut move-down should be disabled");

    await page.evaluate((idx) => {
      const cut = document.querySelectorAll(".gg-root.gg-shots .gg-cut")[idx];
      cut?.querySelector(".gg-move-down")?.click();
    }, domIdx);
    await sleep(900);
    const afterDown = await fetchServerOrder(page, testPid);
    if (afterDown.indexOf(cutId) !== 4) throw new Error("move-down should shift cut one step");
    await page.evaluate((idx) => {
      const cut = document.querySelectorAll(".gg-root.gg-shots .gg-cut")[idx];
      cut?.querySelector(".gg-move-up")?.click();
    }, domIdx + 1);
    await sleep(900);
    const afterUp = await fetchServerOrder(page, testPid);
    if (afterUp.indexOf(cutId) !== 3) throw new Error("move-up should restore position");
  });

  await runScenario("02g", "Context menu move down", async () => {
    const before = await fetchServerOrder(page, testPid);
    await rightClickCut(page, 1);
    await clickCtxItem(page, "Move down");
    await sleep(900);
    const after = await fetchServerOrder(page, testPid);
    if (after.join() === before.join()) throw new Error("context Move down should change order");
  });

  await runScenario("02h", "Alt+Arrow keyboard move", async () => {
    const before = await fetchServerOrder(page, testPid);
    await page.evaluate(() => {
      document.querySelector(".gg-root.gg-shots .gg-cut")?.click();
    });
    await sleep(200);
    await page.keyboard.down("Alt");
    try {
      await page.keyboard.press("ArrowDown");
    } finally {
      await page.keyboard.up("Alt");
    }
    await sleep(900);
    const afterDown = await fetchServerOrder(page, testPid);
    if (afterDown.join() === before.join()) throw new Error("Alt+Down should move");
    await page.keyboard.down("Alt");
    try {
      await page.keyboard.press("ArrowUp");
    } finally {
      await page.keyboard.up("Alt");
    }
    await sleep(900);
    const afterUp = await fetchServerOrder(page, testPid);
    if (afterUp.join() !== before.join()) throw new Error("Alt+Up should restore");
  });

  await runScenario("03", "Caption mode handle drag + buttons", async () => {
    await page.click('.gg-root.gg-shots .gg-list-toggle [data-mode="caption"]');
    await sleep(800);
    const before = await fetchServerOrder(page, testPid);
    const lastId = before[before.length - 1];
    const n = before.length;
    await page.evaluate(() => { const w = document.querySelector(".gg-root.gg-shots .gg-grp-wrap"); if (w) w.scrollTop = w.scrollHeight; });
    await sleep(300);
    const from = await handleCenter(page, n - 1);
    const topEdge = await wrapEdgeY(page, "top");
    await dragWithCdp(page, from, topEdge, { holdAtEdgeMs: 1500 });
    await sleep(3000);
    const afterDrag = await fetchServerOrder(page, testPid);
    if (afterDrag[0] !== lastId) throw new Error("caption mode drag should move last to top");

    const midId = afterDrag[5];
    const domIdx = await page.evaluate((id) => {
      const els = [...document.querySelectorAll(".gg-root.gg-shots .gg-cut")];
      return els.findIndex((e) => e.dataset.cutId === id);
    }, midId);
    await page.evaluate((idx) => {
      const cut = document.querySelectorAll(".gg-root.gg-shots .gg-cut")[idx];
      cut?.querySelector(".gg-move-up")?.click();
    }, domIdx);
    await sleep(900);
    const afterBtn = await fetchServerOrder(page, testPid);
    if (afterBtn.indexOf(midId) !== 4) throw new Error("caption mode move-up should work");
    await page.click('.gg-root.gg-shots .gg-list-toggle [data-mode="info"]');
    await sleep(400);
  });

  try {
    await cleanupProjects(page);
  } catch (e) {
    console.warn("cleanup:", e.message);
  }

  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify({ runStamp, testPid, base: BASE, blockedPromptAttempts, scenarios }, null, 2),
    "utf8",
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
