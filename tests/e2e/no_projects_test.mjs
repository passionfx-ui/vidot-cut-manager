/**
 * Empty-project hint: with 0 projects the panel shows a hint + New project button, and right-click there offers New Project....
 * Read-only: GET /gonggan/projects is answered by the test with an empty list, nothing is created or deleted on the server.
 * Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-no-projects";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-noproj-${runStamp}`);
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

async function launchPersistentBrowser() {
  fs.mkdirSync(PERSISTENT_USER_DATA_DIR, { recursive: true });
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: PERSISTENT_USER_DATA_DIR,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
}

async function newGuardedPage(browser) {
  const page = await browser.newPage();
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
    const btn = await page.waitForSelector('[aria-label="Vidot Cut Manager"]', { timeout: 15000 });
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

async function openNewProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await page.waitForSelector(".gg-modal", { timeout: 10000 });
}

async function cleanupProjects(page) {
  for (const pid of [...createdProjectIds].reverse()) {
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (_) {}
  }
  createdProjectIds.length = 0;
}

async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  let stubbed = 0;
  let writes = 0;
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (isBlockedPost(url, method)) {
      blockedPromptAttempts += 1;
      req.abort("blockedbyclient");
      return;
    }
    let p = "";
    try { p = new URL(url).pathname; } catch (_) {}
    if (method === "GET" && /\/gonggan\/projects$/.test(p)) {
      stubbed += 1;
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [], active_project_id: "" }) });
      return;
    }
    if (method === "POST" && p.includes("/gonggan/")) writes += 1;
    req.continue();
  });
  try {
    await waitForComfy(page);
    await openShotsTab(page);
    await page.waitForSelector(".gg-root.gg-shots .gg-no-projects", { timeout: 15000 });
    const hint = await page.$eval(".gg-no-projects", (e) => ({
      text: e.querySelector("span")?.textContent.trim() || "",
      button: e.querySelector(".gg-new-project-btn")?.textContent.trim() || "",
    }));
    if (hint.text !== "No projects yet. Create one to start." || hint.button !== "New project") throw new Error(`hint: ${JSON.stringify(hint)}`);
    if (!stubbed) throw new Error("projects stub was never used");
    console.log("PASS  0 projects shows the hint and the New project button");
    const box = await (await page.$(".gg-no-projects")).boundingBox();
    await page.mouse.click(box.x + 12, box.y + 8, { button: "right" });
    await page.waitForSelector(".gg-ctx", { timeout: 8000 });
    const labels = await page.$$eval(".gg-ctx-item", (els) => els.map((e) => e.textContent.trim()));
    if (!labels.includes("New Project\u2026")) throw new Error(`right-click on the hint lacks New Project...: ${labels}`);
    if (labels.includes("Add Cut")) throw new Error("Add Cut offered with no project");
    await clickCtxItem(page, "New Project\u2026");
    await page.waitForSelector(".gg-modal", { timeout: 8000 });
    console.log("PASS  right-click on the hint offers New Project... and opens its dialog");
    if (writes) throw new Error(`unexpected POSTs to /gonggan: ${writes}`);
    if (blockedPromptAttempts > 0) throw new Error(`unexpected blocked posts: ${blockedPromptAttempts}`);
    console.log("PASS  no-projects e2e complete");
  } finally {
    await browser.close();
    try { fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}
run().catch((err) => {
  if (err.skipped) { console.log(`SKIP  no-projects e2e: ${err.message}`); process.exit(0); }
  console.error(err);
  process.exit(1);
});