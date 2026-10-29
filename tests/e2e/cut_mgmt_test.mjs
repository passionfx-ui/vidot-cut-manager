/**
 * Headless Chrome UI tests for cut management (0.8.0 part 2).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { submitAskDialog, dismissAskDialog } from "./ask_text_helpers.mjs";
import { waitForDomCutCountSync } from "./dom_sync_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCREENS_DIR = path.join(REPO_ROOT, "tests/screens");
const RESULTS_PATH = path.join(SCREENS_DIR, "cutmgmt-results.json");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ cutmgmt";
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
let shotNum = 0;

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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return data;
  }, route);
}

async function fetchWorkflowPaths(page) {
  const data = await getJson(page, "/api/userdata?dir=workflows&recurse=true&split=false");
  const paths = [];
  if (Array.isArray(data)) {
    for (const x of data) {
      const k = typeof x === "string" ? x : x?.path || x?.name || "";
      if (k) paths.push(String(k).replace(/^workflows\//, "").replace(/^\/+/, ""));
    }
  } else if (data && typeof data === "object") {
    for (const k of Object.keys(data)) {
      const rel = String(k).replace(/^workflows\//, "");
      if (rel.toLowerCase().endsWith(".json")) paths.push(rel);
    }
  }
  paths.sort((a, b) => a.localeCompare(b));
  return paths;
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-cutmgmt-${runStamp}`);
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

async function clickCtxSubItem(page, parentLabel, childLabel) {
  await clickCtxItem(page, parentLabel);
  await page.waitForSelector(".gg-ctx-sub", { timeout: 5000 });
  const items = await page.$$(".gg-ctx-sub .gg-ctx-item");
  for (const it of items) {
    const t = await page.evaluate((n) => n.textContent?.trim(), it);
    if (t === childLabel) {
      await it.click();
      return;
    }
  }
  throw new Error(`Submenu item not found: ${childLabel}`);
}

async function rightClickCut(page, index = 0) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  const cut = cuts[index];
  if (!cut) throw new Error(`cut index ${index} missing`);
  const box = await cut.boundingBox();
  if (!box) throw new Error("cut box missing");
  await page.mouse.click(box.x + 12, box.y + 12, { button: "right" });
}

async function cutIdOrder(page) {
  return page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.map((e) => e.dataset.cutId));
}

async function countCuts(page) {
  return page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.length);
}

async function createProjectViaUi(page, name) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await page.waitForSelector(".gg-modal", { timeout: 10000 });
  await page.click(".gg-modal-name", { clickCount: 3 });
  await page.type(".gg-modal-name", name, { delay: 8 });
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

async function ensureFourCuts(page) {
  timelineMocks.delete(createdProjectIds[createdProjectIds.length - 1]);
  while ((await countCuts(page)) < 4) {
    await rightClickEmptyShots(page);
    await clickCtxItem(page, "Add Cut");
    await waitForDomCutCountSync(page);
    await sleep(500);
  }
}

async function getCutNumbers(page) {
  return page.$$eval(".gg-root.gg-shots .gg-cut .gg-num", (els) => els.map((e) => e.textContent?.trim()));
}

async function dragCut(page, fromIndex, toIndex) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  const from = cuts[fromIndex];
  const to = cuts[toIndex];
  if (!from || !to) throw new Error("drag indices out of range");
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("bounding box missing");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.move(b.x + b.width / 2, b.y + 4, { steps: 12 });
  await sleep(80);
  await page.mouse.up();
  await sleep(800);
}

function buildMockTimelineWithBest(pid, stamp) {
  const cutA = `cut-best-${stamp}`;
  const vBest = `ver-best-${stamp}`;
  return {
    ok: true,
    project: { id: pid, name: `${TEST_PREFIX} mock`, native: true, due_date: "2026-10-30" },
    groups: [],
    groups_customized: true,
    total_sec: 3,
    cuts: [
      {
        id: cutA,
        name: "hero",
        number: 1,
        pos: 0,
        index: 0,
        sec: 3,
        in: 0,
        start: 0,
        group_id: "",
        group_name: "",
        scene_index: 0,
        media: { id: vBest, kind: "image" },
        pick: vBest,
        versions: 1,
        versions_list: [{ id: vBest, kind: "image", source: "native", created: 1, seconds: 0, width: 64, height: 64 }],
        planned_sec: null,
        end_card: false,
        needs_redo: false,
        notes: "",
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
    entry.detail = e.message || String(e);
    console.log(`FAIL  ${id} ${title}: ${entry.detail}`);
  }
  shotNum += 1;
  try {
    entry.screenshot = await screenshot(page, `cutmgmt-${String(shotNum).padStart(2, "0")}`);
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
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  acceptDialogs(page);

  await runScenario("01", "Open Shots + create project", async () => {
    await waitForComfy(page);
    await openShotsTab(page);
    const name = `${TEST_PREFIX} ${runStamp}`;
    mainPid = await createProjectViaUi(page, name);
    if (!mainPid.includes("-")) throw new Error("expected native pid");
  });

  await runScenario("02", "Four cuts + drag reorder updates numbers", async () => {
    await ensureFourCuts(page);
    const grouped = await page.$$eval(".gg-grp-sec[data-group-id] .gg-cut", (els) => els.length);
    const total = await countCuts(page);
    if (grouped !== total) {
      throw new Error(`expected all ${total} cuts in a scene, found ${grouped} in grouped sections`);
    }
    // Numbers (001..) are positional and never change on reorder; compare the cut ids/order instead.
    const ids = () => page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.map((e) => e.dataset.cutId));
    const before = await ids();
    if (before.length < 4) throw new Error("need 4 cuts");
    await dragCut(page, 0, 2);
    const after = await ids();
    if (after.join() === before.join()) throw new Error(`order unchanged: ${before} -> ${after}`);
    // Scene-cut labels follow display order within each scene block (1-1, 1-2, …).
    const nums = await getCutNumbers(page);
    const expected = Array.from({ length: nums.length }, (_, i) => `1-${i + 1}`);
    if (nums.join() !== expected.join()) throw new Error(`expected ${expected.join()}, got ${nums.join()}`);
  });

  await runScenario("03", "Scene group + reorder inside scene", async () => {
    await page.keyboard.press("Escape");
    await page.click(".gg-root.gg-shots .gg-cut");
    const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
    await page.keyboard.down("Control");
    try {
      await cuts[0].click();
      await cuts[1].click();
    } finally {
      await page.keyboard.up("Control");
    }
    await page.click(".gg-root.gg-shots .gg-sel-group");
    await submitAskDialog(page);
    await sleep(800);
    const inScene = await page.$$eval(".gg-grp-sec[data-group-id] .gg-cut .gg-num", (els) => els.map((e) => e.textContent));
    if (inScene.length < 2) throw new Error("scene should have 2+ cuts");
    await dragCut(page, 0, 1);
  });

  await runScenario("03b", "Scene ask dialog Esc cancel and Enter confirm", async () => {
    const scenesBefore = await page.$$eval(".gg-root.gg-shots .gg-grp-sec[data-group-id]", (els) => els.length);
    await page.keyboard.press("Escape");
    const picked = await page.evaluate(() => {
      const els = [...document.querySelectorAll(".gg-root.gg-shots .gg-cut")].filter((e) => e.offsetParent !== null);
      const two = els.slice(0, 2);
      two.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: i > 0, clientX: r.x + 12, clientY: r.y + r.height / 2 }));
      });
      return two.length;
    });
    if (picked < 2) throw new Error("need two visible cuts for scene dialog test");
    await sleep(300);
    await page.click(".gg-root.gg-shots .gg-sel-group");
    await dismissAskDialog(page);
    await sleep(400);
    const scenesAfterEsc = await page.$$eval(".gg-root.gg-shots .gg-grp-sec[data-group-id]", (els) => els.length);
    if (scenesAfterEsc !== scenesBefore) throw new Error("Esc should cancel scene create");

    await page.click(".gg-root.gg-shots .gg-sel-group");
    const sceneName = `EnterScene ${runStamp}`;
    await submitAskDialog(page, { text: sceneName, useEnter: true });
    await sleep(600);
    const titles = await page.$$eval(
      ".gg-root.gg-shots .gg-grp-sec[data-group-id] .gg-grp-title",
      (els) => els.map((e) => e.textContent?.trim() || "")
    );
    if (!titles.some((t) => t.includes(sceneName))) {
      throw new Error(`Enter should create scene; titles=${titles.join("|")}`);
    }
  });

  await runScenario("04", "Length 4s warning badge", async () => {
    await page.click(".gg-root.gg-shots .gg-cut");
    await sleep(300);
    await page.waitForSelector(".gg-len-input");
    await page.click(".gg-len-input", { clickCount: 3 });
    await page.type(".gg-len-input", "4");
    await page.keyboard.press("Tab");
    await sleep(600);
    const warn = await page.$(".gg-root.gg-shots .gg-cut .gg-warn3");
    if (!warn) throw new Error("expected >3s warning badge");
  });

  await runScenario("05", "End card clears warning", async () => {
    await page.click(".gg-cutpanel input.gg-endcard-chk");
    await sleep(500);
    const hidden = await page.$eval(".gg-root.gg-shots .gg-cut .gg-warn3", (el) => el.hidden).catch(() => true);
    const badge = await page.$(".gg-root.gg-shots .gg-cut .gg-endcard-badge");
    if (!badge) throw new Error("end card badge missing");
    if (!hidden) throw new Error("warning should hide for end card");
  });

  await runScenario("06", "Caption persists after reload", async () => {
    const note = `note-${runStamp}`;
    const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
    if (!cuts.length) throw new Error("need a cut");
    const capBox = await cuts[0].$(".gg-caption-text");
    if (!capBox) throw new Error("card caption textarea missing");
    await capBox.click({ clickCount: 2 });
    await sleep(200);
    await page.keyboard.type(note, { delay: 8 });
    await page.keyboard.press("Escape");
    await sleep(700);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1500);
    const val = await page.$eval(".gg-root.gg-shots .gg-cut .gg-caption-text", (el) => el.value);
    if (!val.includes(note)) throw new Error(`caption lost: ${val}`);
  });

  await runScenario("07", "Needs redo flag + filter", async () => {
    await page.click(".gg-cutpanel input.gg-redo-chk");
    await sleep(500);
    const badge = await page.$(".gg-root.gg-shots .gg-cut .gg-redo-badge");
    if (!badge) throw new Error("redo badge missing");
    await page.click(".gg-filter-redo input");
    await sleep(400);
    const visible = await countCuts(page);
    if (visible < 1) throw new Error("filter should show redo cut");
    await page.click(".gg-filter-redo input");
    await sleep(300);
  });

  await runScenario("08", "Final cut list with mocked Best", async () => {
    timelineMocks.set(mainPid, buildMockTimelineWithBest(mainPid, runStamp));
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1200);
    await page.click(".gg-view-final");
    await sleep(400);
    const total = await page.$eval(".gg-final-total", (el) => el.textContent);
    if (!/Total:/i.test(total)) throw new Error(`missing total: ${total}`);
    await page.click(".gg-view-cuts");
  });

  await runScenario("10", "Card caption single-click select, dbl-click edit", async () => {
    timelineMocks.delete(mainPid);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1500);
    const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
    if (cuts.length < 2) throw new Error("need 2+ cuts");
    const secondName = await cuts[1].$eval(
      ".gg-cut-title",
      (el) => el.textContent?.trim() || ""
    );
    const capBox = await cuts[1].$(".gg-caption-text");
    if (!capBox) throw new Error("card caption textarea missing");
    const nb = await capBox.boundingBox();
    if (!nb) throw new Error("caption box missing");
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await sleep(400);
    const panelName = await page.$eval(".gg-cutpanel .gg-panel-name", (el) => el.textContent?.trim());
    if (panelName !== secondName) {
      throw new Error(`single click on caption should select cut: panel=${panelName} expected=${secondName}`);
    }
    const focusedAfterClick = await page.evaluate(
      () => document.activeElement?.classList?.contains("gg-caption-text") ?? false
    );
    if (focusedAfterClick) throw new Error("single click should not focus card caption");
    await capBox.click({ clickCount: 2 });
    await sleep(200);
    const focusedEdit = await page.evaluate(
      () => document.activeElement?.classList?.contains("gg-caption-text") ?? false
    );
    if (!focusedEdit) throw new Error("double-click should enter edit mode");
    const tag = `abc-${runStamp}`;
    await page.keyboard.type(tag, { delay: 10 });
    await page.keyboard.press("Escape");
    await sleep(700);
    const cardVal = await page.evaluate((el) => el.value, await cuts[1].$(".gg-caption-text"));
    if (!cardVal.includes(tag)) throw new Error(`escape should keep text: ${cardVal}`);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1500);
    const cutsAfter = await page.$$(".gg-root.gg-shots .gg-cut");
    const reloadedVal = await page.evaluate((el) => el?.value || "", await cutsAfter[1].$(".gg-caption-text"));
    if (!reloadedVal.includes(tag)) throw new Error(`caption not persisted after reload: ${reloadedVal}`);
  });

  await runScenario("09", "Completion percent; Due field is hidden", async () => {
    timelineMocks.delete(mainPid);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1200);
    if (await page.$(".gg-due-input, .gg-due-label, .gg-due-text")) throw new Error("Due field must not be shown");
    const pct = await page.$eval(".gg-complete-pct", (el) => el.textContent);
    if (!/%/.test(pct)) throw new Error(`percent missing: ${pct}`);
  });

  await runScenario("11", "Delete undo and trash modal restore", async () => {
    timelineMocks.delete(mainPid);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1200);
    const before = await countCuts(page);
    if (before < 2) throw new Error("need 2+ cuts for delete restore");

    const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
    const last = cuts[cuts.length - 1];
    const box = await last.boundingBox();
    if (!box) throw new Error("cut box missing");
    let cutDeleteDialogCount = 0;
    const countCutDeleteDialog = () => {
      cutDeleteDialogCount += 1;
    };
    page.on("dialog", countCutDeleteDialog);
    await page.mouse.click(box.x + 12, box.y + 12, { button: "right" });
    await clickCtxItem(page, "Delete");
    await sleep(700);
    page.off("dialog", countCutDeleteDialog);
    if (cutDeleteDialogCount !== 0) {
      throw new Error(`expected no confirm dialog on cut delete, got ${cutDeleteDialogCount}`);
    }
    const afterDel = await countCuts(page);
    if (afterDel !== before - 1) throw new Error(`delete count: ${before} -> ${afterDel}`);

    await page.waitForSelector(".gg-toast-action", { timeout: 10000 });
    const toastSum = await page.$eval(".gg-toast-sum", (el) => el.textContent?.trim() || "");
    if (toastSum !== "Moved 1 cut to Trash") {
      throw new Error(`expected delete toast, got: ${toastSum}`);
    }
    const undoLabel = await page.$eval(".gg-toast-action", (el) => el.textContent?.trim() || "");
    if (undoLabel !== "Undo") throw new Error(`expected Undo action, got: ${undoLabel}`);
    await page.click(".gg-toast-action");
    await sleep(1200);
    const afterUndo = await countCuts(page);
    if (afterUndo !== before) throw new Error(`undo count: expected ${before}, got ${afterUndo}`);

    const cuts2 = await page.$$(".gg-root.gg-shots .gg-cut");
    const last2 = cuts2[cuts2.length - 1];
    const box2 = await last2.boundingBox();
    if (!box2) throw new Error("cut box missing (2)");
    await page.mouse.click(box2.x + 12, box2.y + 12, { button: "right" });
    await clickCtxItem(page, "Delete");
    await sleep(1500);
    await page.waitForFunction(
      () => {
        const btn = document.querySelector(".gg-root.gg-shots .gg-trash-btn");
        return btn && !btn.hidden && /Trash \(1\)/.test(btn.textContent || "");
      },
      { timeout: 15000 }
    );
    await page.click(".gg-root.gg-shots .gg-trash-btn");
    await page.waitForSelector(".gg-modal-trash", { timeout: 10000 });
    await page.click(".gg-trash-restore-one");
    await sleep(1200);
    const final = await countCuts(page);
    if (final !== before) throw new Error(`modal restore: expected ${before}, got ${final}`);
    const trashHidden = await page.$eval(".gg-root.gg-shots .gg-trash-btn", (el) => el.hidden);
    if (!trashHidden) throw new Error("Trash button should hide when empty");
  });

  await runScenario("12", "Reorder menu, keyboard, scene move, undo, drag handle", async () => {
    timelineMocks.delete(mainPid);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1200);
    await ensureFourCuts(page);

    const handles = await page.$$eval(".gg-root.gg-shots .gg-drag-handle", (els) => els.length);
    const total = await countCuts(page);
    if (handles !== total) throw new Error(`drag handles ${handles} != cuts ${total}`);

    const before = await cutIdOrder(page);
    if (before.length < 4) throw new Error("need 4 cuts");

    await rightClickCut(page, 0);
    await clickCtxItem(page, "Move down");
    await sleep(900);
    const afterDown = await cutIdOrder(page);
    if (afterDown.join() === before.join()) throw new Error("Move down should change order");

    await page.keyboard.down("Alt");
    try {
      await page.keyboard.press("ArrowUp");
    } finally {
      await page.keyboard.up("Alt");
    }
    await sleep(900);
    const afterUp = await cutIdOrder(page);
    if (afterUp.join() !== before.join()) throw new Error("Alt+ArrowUp should restore prior order");

    // Re-query after every click: selecting re-renders the list and old handles go stale.
    const clickIdx = async (idx) => {
      const els = await page.$$(".gg-root.gg-shots .gg-cut");
      const bb = await els[idx].boundingBox();
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await sleep(250);
    };
    await clickIdx(0); // plain click: selection = cut 0 only (Ctrl-click would toggle it off)
    await page.keyboard.down("Control");
    try {
      await clickIdx(1);
    } finally {
      await page.keyboard.up("Control");
    }
    const beforePair = await cutIdOrder(page);
    await rightClickCut(page, 0);
    await clickCtxItem(page, "Move down");
    await sleep(900);
    const afterPair = await cutIdOrder(page);
    const pairIds = [beforePair[0], beforePair[1]];
    const idx0 = afterPair.indexOf(pairIds[0]);
    const idx1 = afterPair.indexOf(pairIds[1]);
    if (idx0 < 0 || idx1 < 0 || idx1 !== idx0 + 1) {
      const sel = await page.$$eval(".gg-root.gg-shots .gg-cut.gg-sel", (els) => els.length);
      const tags = (arr) => arr.map((x) => x.slice(-4)).join();
      throw new Error(`pair should stay adjacent after move (selected=${sel}): before ${tags(beforePair)} after ${tags(afterPair)}`);
    }

    await page.click(".gg-root.gg-shots .gg-sel-group");
    await submitAskDialog(page);
    await sleep(800);
    const orderBeforeScene = await cutIdOrder(page);
    const firstId = orderBeforeScene[0];
    await rightClickCut(page, 0);
    await clickCtxSubItem(page, "Move to scene \u25B8", "No scene");
    await sleep(900);
    const orderUngrouped = await cutIdOrder(page);
    if (orderUngrouped.join() === orderBeforeScene.join()) {
      throw new Error("Move to No scene should change order/group");
    }

    await page.waitForSelector(".gg-toast-action", { timeout: 10000 });
    await page.click(".gg-toast-action");
    await sleep(1200);
    const afterUndo = await cutIdOrder(page);
    if (afterUndo.join() !== orderBeforeScene.join()) {
      throw new Error("Undo should restore order before scene move");
    }
    const inSceneAfterUndo = await page.evaluate((id) => {
      return !!document.querySelector(`.gg-grp-sec[data-group-id] .gg-cut[data-cut-id="${id}"]`);
    }, firstId);
    if (!inSceneAfterUndo) throw new Error("Undo should restore scene membership");

    const nCuts = await countCuts(page);
    const orderBeforeHandleDrag = await cutIdOrder(page);
    const lastCutId = orderBeforeHandleDrag[orderBeforeHandleDrag.length - 1];
    const handlePt = await page.evaluate(() => {
      const cuts = document.querySelectorAll(".gg-root.gg-shots .gg-cut");
      const last = cuts[cuts.length - 1];
      const handle = last?.querySelector(".gg-drag-handle");
      if (!handle) return null;
      const r = handle.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!handlePt) throw new Error("last cut drag handle missing");
    const targetPt = await page.evaluate(() => {
      const first = document.querySelector(".gg-root.gg-shots .gg-cut");
      if (!first) return null;
      const r = first.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + 6 };
    });
    if (!targetPt) throw new Error("first cut missing for drag target");

    await page.mouse.move(handlePt.x, handlePt.y);
    await page.mouse.down();
    await sleep(60);
    let indSeen = false;
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = handlePt.x + (targetPt.x - handlePt.x) * t;
      const y = handlePt.y + (targetPt.y - handlePt.y) * t;
      await page.mouse.move(x, y);
      await sleep(35);
      const seen = await page.evaluate(() => {
        const ind = document.querySelector(".gg-root.gg-shots .gg-drag-ind");
        return !!(ind && !ind.hidden);
      });
      if (seen) indSeen = true;
    }
    if (!indSeen) throw new Error(".gg-drag-ind should be visible while dragging by handle");
    await page.mouse.up();
    await sleep(1200);

    const orderAfterHandle = await cutIdOrder(page);
    if (orderAfterHandle[0] !== lastCutId) {
      throw new Error(`handle drag: last cut should be first, got ${orderAfterHandle.join()}`);
    }
    const nums = await getCutNumbers(page);
    // Labels are per scene: scene number steps by 1, cut number restarts at 1 for each new scene (earlier steps may have created scenes).
    {
      let prevS = 0;
      let prevC = 0;
      for (const lab of nums) {
        const m = /^(\d+)-(\d+)$/.exec(lab || "");
        const ok = m && ((+m[1] === prevS && +m[2] === prevC + 1) || (+m[1] === prevS + 1 && +m[2] === 1));
        if (!ok) throw new Error(`cut numbers should restart per scene (S-N), got ${nums.join(",")}`);
        prevS = +m[1];
        prevC = +m[2];
      }
    }

    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1200);
    const orderReload = await cutIdOrder(page);
    if (orderReload[0] !== lastCutId) {
      throw new Error("handle drag order should persist after reload");
    }
  });

  await runScenario("13", "New project remembers last template + filter preselect", async () => {
    const wfPaths = await fetchWorkflowPaths(page);
    const jsonPaths = wfPaths.filter((p) => p.toLowerCase().endsWith(".json"));
    if (!jsonPaths.length) {
      console.log("NOTE: no userdata workflows — skipping template remember assertions");
      return;
    }
    const templateRef = jsonPaths[0];
    await page.evaluate((ref) => {
      localStorage.setItem("gonggan-cut.lastTemplate", ref);
    }, templateRef);

    await page.evaluate(() => {
      document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
      );
    });
    await clickCtxItem(page, "New Project…");
    await page.waitForSelector(".gg-modal-tpl-filter", { timeout: 10000 });
    const gongganOpts = await page.$$eval(".gg-modal-tpl option", (els) =>
      els.map((o) => o.value).filter((v) => /^gonggan\//i.test(v))
    );
    if (gongganOpts.length) {
      throw new Error(`modal template list must not include gonggan/ workflows: ${gongganOpts.join(", ")}`);
    }
    await page.waitForFunction(
      (ref) => {
        const sel = document.querySelector(".gg-modal-tpl");
        return sel && Array.from(sel.options).some((o) => o.value === ref);
      },
      { timeout: 20000 },
      templateRef
    );
    const preselected = await page.$eval(".gg-modal-tpl", (sel) => sel.value);
    if (preselected !== templateRef) {
      throw new Error(`expected modal preselect ${templateRef}, got ${preselected || "(none)"}`);
    }

    const needle = templateRef.slice(0, Math.min(8, templateRef.length)).toLowerCase();
    await page.click(".gg-modal-tpl-filter", { clickCount: 3 });
    await page.type(".gg-modal-tpl-filter", needle, { delay: 5 });
    await sleep(200);
    const optionCount = await page.$$eval(".gg-modal-tpl option", (els) => els.length);
    const total = jsonPaths.length;
    if (optionCount >= total + 1) {
      throw new Error(`filter should narrow options (got ${optionCount}, total workflows ~${total})`);
    }
    const stillSelected = await page.$eval(".gg-modal-tpl", (sel) => sel.value);
    if (stillSelected !== templateRef) throw new Error("filtered list should keep selected template");

    const projName = `${TEST_PREFIX} tpl ${runStamp}`;
    await page.click(".gg-modal-name", { clickCount: 3 });
    await page.type(".gg-modal-name", projName, { delay: 8 });
    await page.click(".gg-modal .gg-primary");
    await page.waitForFunction(
      (n) => {
        const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
        const opt = sel?.options[sel.selectedIndex];
        return opt && opt.textContent.includes(n);
      },
      { timeout: 30000 },
      projName
    );
    const pid = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.value);
    if (pid) createdProjectIds.push(pid);

    const tpl = await getJson(page, `/gonggan/template?pid=${encodeURIComponent(pid)}`);
    if ((tpl.ref || "") !== templateRef) {
      throw new Error(`template ref expected ${templateRef}, got ${tpl.ref || "(empty)"}`);
    }
  });

  try {
    await cleanupProjects(page);
  } catch (e) {
    console.warn("cleanup:", e.message);
  }

  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify({ runStamp, mainPid, base: BASE, blockedPromptAttempts, scenarios }, null, 2),
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
