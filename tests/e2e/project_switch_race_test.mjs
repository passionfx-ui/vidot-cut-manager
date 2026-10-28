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
const TEST_PREFIX = "ZZ-test-switch-race";
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
  const sel = ".gg-root.gg-shots .gg-proj";
  const cutsOnScreen = () => page.evaluate(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length);
  const pick = async (pid) => {
    await page.waitForFunction((p) => [...document.querySelectorAll(".gg-root.gg-shots .gg-proj option")].some((o) => o.value === p), { timeout: 15000 }, pid);
    await page.select(sel, pid);
  };
  try {
    await waitForComfy(page);
    const a = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-A-${runStamp}` });
    const b = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-B-${runStamp}` });
    const pidA = a.project.id;
    const pidB = b.project.id;
    createdProjectIds.push(pidA, pidB);
    const tlA = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pidA)}`)).data;
    await postJson(page, "/gonggan/cut/delete", { pid: pidA, cuts: tlA.cuts.map((c) => c.id) });
    await postJson(page, "/gonggan/cut/add", { pid: pidB }); // B ends with 2 cuts
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(1500);
    await openShotsTab(page);
    await pick(pidB);
    await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 2, { timeout: 8000 });
    await pick(pidA);
    await sleep(1500);
    if ((await cutsOnScreen()) !== 0) throw new Error("test setup: project A should be empty");

    // 1) Add Cut in A (reply held 2.5 s), switch to B at once: A's late reply must not replace B's list
    delayRule.armed = true;
    delayRule.releasedAt = 0;
    await page.evaluate(() => {
      document.querySelector(".gg-root.gg-shots .gg-grp-wrap").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 200 })
      );
    });
    await clickCtxItem(page, "Add Cut");
    await pick(pidB);
    await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 2, { timeout: 8000 });
    const t0 = Date.now();
    while (!delayRule.releasedAt && Date.now() - t0 < 8000) await sleep(100);
    if (!delayRule.releasedAt) throw new Error("held reply never released");
    await sleep(1500);
    const afterLate = { cuts: await cutsOnScreen(), proj: await page.$eval(sel, (e) => e.value) };
    if (afterLate.cuts !== 2 || afterLate.proj !== pidB) throw new Error(`late reply of project A replaced project B: ${JSON.stringify(afterLate)}`);
    console.log("PASS  late Add Cut reply of project A does not replace project B's timeline (B still 2 cuts)");

    // 2) edit a caption in A and switch to B within 400 ms: the edit must still be saved to A
    await pick(pidA);
    await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 1, { timeout: 8000 });
    const text = `switch-${runStamp}`;
    await page.evaluate((v) => {
      const ta = document.querySelector(".gg-root.gg-shots .gg-cut .gg-caption-text");
      ta.value = v;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }, text);
    await page.select(sel, pidB); // well inside the 400 ms debounce
    await sleep(1500);
    const srvA = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pidA)}`)).data;
    const cap = srvA.cuts[0]?.caption || "";
    if (cap !== text) throw new Error(`caption typed right before a project switch was lost: server has "${cap}"`);
    console.log("PASS  caption typed right before a project switch is saved to its own project");
    console.log("PASS  project switch race e2e complete");
  } finally {
    try { await cleanupProjects(page); } catch (_) {}
    await browser.close();
    try { fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}
run().catch((e) => { console.error(e); process.exit(1); });