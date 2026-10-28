/**
 * Per-scene cut numbering (1-1, 1-2, …) in Shots UI.
 * ZZ-test- project only. Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { submitAskDialog } from "./ask_text_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-numbering";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const createdProjectIds = [];
let blockedPromptAttempts = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkRam(label) {
  const free = os.freemem();
  if (free < MIN_RAM) {
    throw new Error(`RAM check failed (${label}): ${Math.round(free / 1e9)} GB free, need 40+ GB`);
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

async function rightClickEmptyShots(page) {
  const box = await page.evaluate(() => {
    const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    const cuts = wrap.querySelectorAll(".gg-cut");
    let y;
    if (cuts.length > 0) {
      const lastRect = cuts[cuts.length - 1].getBoundingClientRect();
      y = lastRect.bottom + 12 < r.bottom - 6 ? lastRect.bottom + 12 : r.bottom - 6;
    } else {
      y = Math.min(r.bottom - 6, r.top + 40);
    }
    return { x: r.left + r.width / 2, y };
  });
  if (!box) throw new Error("gg-grp-wrap not found");
  await page.mouse.click(box.x, box.y, { button: "right" });
}

async function rightClickCut(page, index = 0) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  const cut = cuts[index];
  if (!cut) throw new Error(`cut index ${index} missing`);
  const box = await cut.boundingBox();
  if (!box) throw new Error("cut box missing");
  await page.mouse.click(box.x + 12, box.y + 12, { button: "right" });
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

async function countCuts(page) {
  return page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.length);
}

async function getCutNumbers(page) {
  return page.$$eval(".gg-root.gg-shots .gg-cut .gg-num", (els) => els.map((e) => e.textContent?.trim()));
}

async function selectCuts(page, indices) {
  await page.keyboard.press("Escape");
  for (let i = 0; i < indices.length; i++) {
    const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
    const cut = cuts[indices[i]];
    if (!cut) throw new Error(`cut ${indices[i]} missing`);
    const box = await cut.boundingBox();
    if (i > 0) await page.keyboard.down("Control");
    try {
      await page.mouse.click(box.x + 12, box.y + 12);
    } finally {
      if (i > 0) await page.keyboard.up("Control");
    }
    await sleep(250);
  }
}

async function groupSelected(page) {
  await page.click(".gg-root.gg-shots .gg-sel-group");
  await submitAskDialog(page);
  await sleep(800);
}

async function cleanupProjects(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await page.evaluate(async (id) => {
        await fetch("/gonggan/project/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pid: id }),
        });
      }, pid);
    } catch (_) {}
  }
}

function assertNums(actual, expected, msg) {
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`${msg}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`);
  }
}

async function main() {
  checkRam("startup");
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  const userDataDir = path.join(os.tmpdir(), `gg-numbering-${runStamp}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  page.on("dialog", async (d) => {
    try {
      if (d.type() === "prompt") await d.accept(await d.defaultValue());
      else await d.accept();
    } catch (_) {
      try {
        await d.dismiss();
      } catch (_) {}
    }
  });

  try {
    await waitForComfy(page);
    await openShotsTab(page);
    await createProjectViaUi(page, `${TEST_PREFIX} ${runStamp}`);

    while ((await countCuts(page)) < 4) {
      await rightClickEmptyShots(page);
      await clickCtxItem(page, "Add Cut");
      await sleep(500);
    }

    let nums = await getCutNumbers(page);
    assertNums(nums, ["1-1", "1-2", "1-3", "1-4"], "single scene four cuts");
    console.log("PASS  numbering single scene 1-1..1-4");

    await selectCuts(page, [0, 1]);
    await groupSelected(page);
    await selectCuts(page, [2, 3]);
    await groupSelected(page);
    nums = await getCutNumbers(page);
    assertNums(nums, ["1-1", "1-2", "2-1", "2-2"], "two scenes after grouping");
    console.log("PASS  numbering two scenes 1-1,1-2,2-1,2-2");

    const firstScene = await page.$eval(
      ".gg-grp-sec[data-group-id] .gg-grp-title",
      (el) => (el.textContent || "").replace(/^Scene\s·\s*/, "").trim()
    );
    await rightClickCut(page, 2);
    await clickCtxSubItem(page, "Move to scene \u25B8", firstScene);
    await sleep(900);
    nums = await getCutNumbers(page);
    assertNums(nums, ["1-1", "1-2", "1-3", "2-1"], "after move into first scene");
    console.log("PASS  numbering relabel after cross-scene move");

    await rightClickCut(page, 1);
    await clickCtxItem(page, "Delete");
    await sleep(800);
    nums = await getCutNumbers(page);
    assertNums(nums, ["1-1", "1-2", "2-1"], "after delete");
    console.log("PASS  numbering relabel after delete");

    if (blockedPromptAttempts > 0) {
      throw new Error(`Unsafe POST attempted (${blockedPromptAttempts})`);
    }
  } finally {
    try {
      await cleanupProjects(page);
    } catch (_) {}
    try {
      await browser.close();
    } catch (_) {}
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
