/**
 * Auto Cut Split: when the server refuses the import (400), the New Project modal stays open with the pasted text,
 * the error is shown, exactly one project exists, and a second Create retries the import into that same project.
 * ZZ-test- projects only. Blocks POST /prompt and /gonggan/regen.
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
const TEST_PREFIX = "ZZ-test-split-keep";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-cut-split-${runStamp}`);
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
    const btn = await page.waitForSelector('[aria-label="Shots list"]', { timeout: 15000 });
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

const SAMPLE = [
  "# Format: auto-cut-split v1",
  "# Scene: Arrival",
  "- Cut: Platform wide | 3 | Rain on an empty platform.",
  "- Cut: Ticket | 2 | \"One way, please.\"",
].join("\n");

async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  const rule = { refuse: true, hits: 0, passed: 0, creates: 0 };
  page.removeAllListeners("request");
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (isBlockedPost(url, method)) {
      blockedPromptAttempts += 1;
      req.abort("blockedbyclient");
      return;
    }
    if (method === "POST") {
      const path = new URL(url).pathname;
      if (path.endsWith("/gonggan/project/create")) rule.creates += 1;
      if (path.endsWith("/gonggan/project/import")) {
        if (rule.refuse) {
          rule.hits += 1;
          req.respond({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, message: "at most 500 cuts per import" }) });
          return;
        }
        rule.passed += 1;
      }
    }
    req.continue();
  });
  try {
    await waitForComfy(page);
    await openShotsTab(page);
    await openNewProjectModal(page);
    const setText = (v) => page.$eval(".gg-split-text", (el, t) => { el.value = t; el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    await setText(SAMPLE);
    const name = `${TEST_PREFIX}-${runStamp}`;
    await page.click(".gg-modal-name", { clickCount: 3 });
    await page.type(".gg-modal-name", name, { delay: 6 });
    await page.click(".gg-modal-create");
    const t0 = Date.now();
    while (!rule.hits && Date.now() - t0 < 20000) await sleep(100);
    if (!rule.hits) throw new Error("import was never attempted");
    await sleep(1500);

    // 1) refused import: modal open, text kept, error visible, Create usable
    const st = await page.evaluate(() => ({
      modal: !!document.querySelector(".gg-modal"),
      text: document.querySelector(".gg-split-text")?.value || "",
      preview: document.querySelector(".gg-split-preview")?.textContent || "",
      disabled: document.querySelector(".gg-modal-create")?.disabled,
    }));
    if (!st.modal) throw new Error("modal closed after a refused import");
    if (st.text !== SAMPLE) throw new Error("pasted text was not preserved");
    if (!st.preview.includes("at most 500 cuts per import")) throw new Error(`server message not shown: ${st.preview}`);
    if (st.disabled) throw new Error("Create stayed disabled after a refused import");
    const list1 = await getJson(page, "/gonggan/projects");
    const mine1 = (list1.data?.projects || []).filter((p) => String(p.name).includes(name));
    for (const p of mine1) createdProjectIds.push(p.id);
    if (mine1.length !== 1) throw new Error(`expected exactly 1 project after the refused import, got ${mine1.length}`);
    console.log("PASS  refused import keeps the modal open, the pasted text and shows the server message (1 project)");

    // 2) retry: same project, no second create, import now goes through
    rule.refuse = false;
    await page.click(".gg-modal-create");
    await page.waitForFunction(() => !document.querySelector(".gg-modal"), { timeout: 20000 });
    await sleep(1500);
    if (rule.creates !== 1) throw new Error(`retry created another project (creates=${rule.creates})`);
    if (rule.passed !== 1) throw new Error(`retry did not import (passed=${rule.passed})`);
    const list2 = await getJson(page, "/gonggan/projects");
    const mine2 = (list2.data?.projects || []).filter((p) => String(p.name).includes(name));
    if (mine2.length !== 1 || mine2[0].id !== mine1[0].id) throw new Error("retry did not reuse the first project");
    console.log("PASS  retry imports into the same project (no duplicate)");
    if (blockedPromptAttempts > 0) throw new Error(`unexpected blocked posts: ${blockedPromptAttempts}`);
    console.log("PASS  import keep-modal e2e complete");
  } finally {
    try { await cleanupProjects(page); } catch (_) {}
    await browser.close();
    try { fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}
run().catch((e) => { console.error(e); process.exit(1); });