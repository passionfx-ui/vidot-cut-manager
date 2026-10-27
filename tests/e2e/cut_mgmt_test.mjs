/**
 * Headless Chrome UI tests for cut management (0.8.0 part 2).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

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
      if (d.type() === "prompt") await d.accept(`Scene ${runStamp % 100}`);
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
    const btn = await page.waitForSelector('[aria-label="Gonggan shot list"]', { timeout: 15000 });
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
  return pid;
}

async function ensureFourCuts(page) {
  timelineMocks.delete(createdProjectIds[createdProjectIds.length - 1]);
  while ((await countCuts(page)) < 4) {
    await rightClickEmptyShots(page);
    await clickCtxItem(page, "Add Cut");
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
    // Numbers (001..) are positional and never change on reorder; compare the cut ids/order instead.
    const ids = () => page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.map((e) => e.dataset.cutId));
    const before = await ids();
    if (before.length < 4) throw new Error("need 4 cuts");
    await dragCut(page, 0, 2);
    const after = await ids();
    if (after.join() === before.join()) throw new Error(`order unchanged: ${before} -> ${after}`);
    const nums = await getCutNumbers(page);
    if (nums.join() !== ["001", "002", "003", "004"].slice(0, nums.length).join()) throw new Error(`numbers should stay positional: ${nums}`);
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
    await sleep(800);
    const inScene = await page.$$eval(".gg-grp-sec[data-group-id] .gg-cut .gg-num", (els) => els.map((e) => e.textContent));
    if (inScene.length < 2) throw new Error("scene should have 2+ cuts");
    await dragCut(page, 0, 1);
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

  await runScenario("06", "Notes persist after reload", async () => {
    const note = `note-${runStamp}`;
    await page.click(".gg-notes", { clickCount: 3 });
    await page.type(".gg-notes", note);
    await page.keyboard.press("Tab");
    await sleep(700);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1500);
    await page.click(".gg-root.gg-shots .gg-cut");
    const val = await page.$eval(".gg-notes", (el) => el.value);
    if (!val.includes(note)) throw new Error(`notes lost: ${val}`);
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

  await runScenario("10", "Card notes single-click select, dbl-click edit", async () => {
    timelineMocks.delete(mainPid);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1500);
    const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
    if (cuts.length < 2) throw new Error("need 2+ cuts");
    const secondName = await cuts[1].$eval(
      ".gg-cut-title",
      (el) => el.textContent?.trim() || ""
    );
    const notesBox = await cuts[1].$(".gg-info-notes");
    if (!notesBox) throw new Error("card notes textarea missing");
    const nb = await notesBox.boundingBox();
    if (!nb) throw new Error("notes box missing");
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await sleep(400);
    const panelName = await page.$eval(".gg-cutpanel .gg-panel-name", (el) => el.textContent?.trim());
    if (panelName !== secondName) {
      throw new Error(`single click on notes should select cut: panel=${panelName} expected=${secondName}`);
    }
    const focusedAfterClick = await page.evaluate(
      () => document.activeElement?.classList?.contains("gg-info-notes") ?? false
    );
    if (focusedAfterClick) throw new Error("single click should not focus card notes");
    await notesBox.click({ clickCount: 2 });
    await sleep(200);
    const focusedEdit = await page.evaluate(
      () => document.activeElement?.classList?.contains("gg-info-notes") ?? false
    );
    if (!focusedEdit) throw new Error("double-click should enter edit mode");
    const tag = `abc-${runStamp}`;
    await page.keyboard.type(tag, { delay: 10 });
    await page.keyboard.press("Escape");
    await sleep(700);
    const cardVal = await page.evaluate((el) => el.value, await cuts[1].$(".gg-info-notes"));
    if (!cardVal.includes(tag)) throw new Error(`escape should keep text: ${cardVal}`);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1500);
    const cutsAfter = await page.$$(".gg-root.gg-shots .gg-cut");
    const reloadedVal = await page.evaluate((el) => el?.value || "", await cutsAfter[1].$(".gg-info-notes"));
    if (!reloadedVal.includes(tag)) throw new Error(`notes not persisted after reload: ${reloadedVal}`);
  });

  await runScenario("09", "Due date + completion percent", async () => {
    timelineMocks.delete(mainPid);
    await page.click(".gg-root.gg-shots .gg-reload");
    await sleep(1200);
    await page.$eval(".gg-due-input", (el) => {
      el.value = "2026-10-30";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await sleep(800);
    const dueText = await page.$eval(".gg-due-text", (el) => el.textContent);
    if (!/Due Oct 30/i.test(dueText)) throw new Error(`due text: ${dueText}`);
    const pct = await page.$eval(".gg-complete-pct", (el) => el.textContent);
    if (!/%/.test(pct)) throw new Error(`percent missing: ${pct}`);
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
