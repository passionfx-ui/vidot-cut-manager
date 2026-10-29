/**
 * Re-shoots the README screenshots (docs/images) from a temporary demo project. Not part of the e2e suite. Usage: node readme_shots.mjs [outDir]
 * ZZ-test- projects only. Blocks POST /prompt and /gonggan/regen.
 */
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
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
const TEST_PREFIX = "ZZ-test-field-slots";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-shots-${runStamp}`);
const createdProjectIds = [];
const delayRule = { armed: false, ms: 2500, releasedAt: 0 };
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
  page.on("request", async (req) => {
    const url = req.url();
    const method = req.method();
    if (isBlockedPost(url, method)) {
      blockedPromptAttempts += 1;
      console.error(`BLOCKED UNSAFE POST: ${method} ${url}`);
      req.abort("blockedbyclient");
      return;
    }
    if (delayRule.armed && method === "POST" && new URL(url).pathname.endsWith("/gonggan/cut/add")) {
      // Let the server apply the add NOW, but hold the response back (a slow reply that lands after a project switch).
      delayRule.armed = false;
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: req.postData() });
      const body = await r.text();
      setTimeout(() => {
        delayRule.releasedAt = Date.now();
        req.respond({ status: r.status, contentType: "application/json", body }).catch(() => {});
      }, delayRule.ms);
      return;
    }    req.continue();
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


async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  const posts = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/gonggan/cut/update")) posts.push({ t: Date.now(), body: r.postData() || "" });
  });
  const sel = ".gg-root.gg-shots .gg-proj";
  const typeCaption = (idx, v) =>
    page.evaluate((i, val) => {
      const ta = document.querySelectorAll(".gg-root.gg-shots .gg-cut .gg-caption-text")[i];
      ta.value = val;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }, idx, v);
  try {
    await waitForComfy(page);
    const a = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-${runStamp}` });
    const pid = a.project.id;
    createdProjectIds.push(pid);
    await postJson(page, "/gonggan/cut/add", { pid });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(1500);
    await openShotsTab(page);
    await page.waitForFunction((p) => [...document.querySelectorAll(".gg-root.gg-shots .gg-proj option")].some((o) => o.value === p), { timeout: 15000 }, pid);
    if ((await page.$eval(sel, (e) => e.value)) !== pid) await page.select(sel, pid);
    await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 2, { timeout: 10000 });
    await page.click('.gg-root.gg-shots .gg-list-toggle [data-mode="caption"]');
    await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut .gg-caption-text").length === 2, { timeout: 5000 });
    const srv = async () => (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`)).data.cuts;

    // 1) two cuts edited 100 ms apart (inside one 400 ms window): both must reach the server
    const t1 = `one-${runStamp}`;
    const t2 = `two-${runStamp}`;
    await typeCaption(0, t1);
    await sleep(100);
    await typeCaption(1, t2);
    await sleep(1800);
    let cuts = await srv();
    const got = cuts.map((c) => c.caption || "");
    if (got[0] !== t1 || got[1] !== t2) throw new Error(`two quick edits on two cuts: server has ${JSON.stringify(got)}`);
    console.log("PASS  two cuts edited within 400 ms are both saved");

    // 2) leaving the field (blur) sends the edit at once instead of waiting for the 400 ms timer
    posts.length = 0;
    const t3 = `blur-${runStamp}`;
    const t0 = Date.now();
    await page.evaluate((val) => {
      const ta = document.querySelectorAll(".gg-root.gg-shots .gg-cut .gg-caption-text")[0];
      ta.focus();
      ta.value = val;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.blur();
    }, t3);
    const w0 = Date.now();
    while (!posts.length && Date.now() - w0 < 1500) await sleep(10);
    if (!posts.length) throw new Error("no save request after blur");
    const lag = posts[0].t - t0;
    if (lag > 300) throw new Error(`blur did not flush: first save ${lag} ms after the edit`);
    await sleep(800);
    cuts = await srv();
    if ((cuts[0].caption || "") !== t3) throw new Error(`blur save lost: ${cuts[0].caption}`);
    console.log(`PASS  blur flushes the edit immediately (${lag} ms)`);

    // 3) page hide (tab switch / close) sends a waiting edit
    const t4 = `hide-${runStamp}`;
    await typeCaption(1, t4);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await sleep(250);
    cuts = await srv();
    if ((cuts[1].caption || "") !== t4) throw new Error(`edit waiting at page hide was not sent: ${cuts[1].caption}`);
    console.log("PASS  page hide flushes a waiting edit (checked 250 ms later)");
    console.log("PASS  per-cut field slots e2e complete");
  } finally {
    try { await cleanupProjects(page); } catch (_) {}
    await browser.close();
    try { fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}
run().catch((e) => { console.error(e); process.exit(1); });