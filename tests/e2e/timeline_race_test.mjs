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
const TEST_PREFIX = "ZZ-test-timeline-race";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-shots-${runStamp}`);
const createdProjectIds = [];
const tlLog = [];
const delayRule = { armed: false, pid: "", ms: 2500, heldAt: 0, releasedAt: 0 };
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
    if (url.includes("/gonggan/timeline")) tlLog.push(`${Date.now() % 100000} ${delayRule.armed} ${url.slice(-45)}`);
    if (delayRule.armed && method === "GET" && new URL(url).pathname.endsWith("/gonggan/timeline") && new URL(url).searchParams.get("pid") === delayRule.pid) {
      // Fetch the CURRENT (old) timeline now, answer it late: a genuinely stale response.
      delayRule.armed = false;
      const r = await fetch(url);
      const body = await r.text();
      delayRule.heldAt = Date.now();
      setTimeout(() => {
        delayRule.releasedAt = Date.now();
        req.respond({ status: r.status, contentType: "application/json", body }).catch(() => {});
      }, delayRule.ms);
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


async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  try {
    await waitForComfy(page);
    const a = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-${runStamp}` });
    const pid = a.project.id;
    createdProjectIds.push(pid);
    const tl0 = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`)).data;
    await postJson(page, "/gonggan/cut/delete", { pid, cuts: tl0.cuts.map((c) => c.id) });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(1500);
    await openShotsTab(page);
    await page.waitForFunction((p) => [...document.querySelectorAll(".gg-root.gg-shots .gg-proj option")].some((o) => o.value === p), { timeout: 15000 }, pid);

    // the app may already have auto-selected the new project; make sure a real project switch happens below
    const other = await page.evaluate((p) => {
      const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
      return sel.value === p ? [...sel.options].map((x) => x.value).find((v) => v && v !== p) || "" : null;
    }, pid);
    if (other !== null) {
      if (!other) throw new Error("test setup: no other project to switch from");
      await page.select(".gg-root.gg-shots .gg-proj", other);
      await sleep(1500);
    }
    // 1) select the project; its timeline GET (0 cuts) is held back for 2.5 s
    delayRule.pid = pid;
    delayRule.armed = true;
    await page.select(".gg-root.gg-shots .gg-proj", pid);
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector(".gg-root.gg-shots .gg-grp-wrap"), { timeout: 5000 });
    // 2) right after selecting (no settle wait): Add Cut through the panel context menu
    await page.evaluate(() => {
      document.querySelector(".gg-root.gg-shots .gg-grp-wrap").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 200 })
      );
    });
    await clickCtxItem(page, "Add Cut");
    await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 1, { timeout: 8000 });
    const addedAfter = Date.now() - t0;
    console.log(`PASS  cut shown ${addedAfter} ms after selecting the project (stale 0-cut response still pending: ${!delayRule.releasedAt})`);
    if (delayRule.releasedAt) throw new Error("test setup: the stale response was released before the add finished");

    // 3) let the stale (0 cuts) response arrive; it must be ignored
    await page.waitForFunction(() => true);
    while (!delayRule.releasedAt && Date.now() - t0 < 8000) await sleep(100);
    if (!delayRule.releasedAt) throw new Error("stale response never released " + JSON.stringify({ ...delayRule, now: Date.now() % 100000, t0: t0 % 100000, tlLog }));
    await sleep(1200);
    const after = await page.evaluate(() => ({
      cuts: document.querySelectorAll(".gg-root.gg-shots .gg-cut").length,
      hint: !!document.querySelector(".gg-list-empty"),
      meta: document.querySelector(".gg-meta-text")?.textContent || "",
    }));
    if (after.cuts !== 1 || after.hint) throw new Error(`stale response overwrote the newer timeline: ${JSON.stringify(after)}`);
    console.log(`PASS  late stale response ignored (still 1 cut, "${after.meta.trim()}")`);

    // 4) the newest load still wins: reload via the UI path and see the cut persisted
    const srv = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`)).data;
    if (srv.cuts.length !== 1) throw new Error(`server has ${srv.cuts.length} cuts`);
    console.log("PASS  timeline race e2e complete");
  } finally {
    try { await cleanupProjects(page); } catch (_) {}
    await browser.close();
    try { fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}
run().catch((e) => { console.error(e); process.exit(1); });