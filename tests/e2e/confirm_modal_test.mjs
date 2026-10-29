/**
 * In-app confirm modal (replaces window.confirm): scene delete and project delete (Reset is disabled on native projects).
 * Cancel / Esc / backdrop do nothing (no request), Enter or OK acts, Korean IME Enter does not confirm,
 * OK is emphasized for deletes, no native dialog ever opens. ZZ-test- projects only. Blocks POST /prompt and /gonggan/regen.
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
const TEST_PREFIX = "ZZ-test-confirm";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-confirm-${runStamp}`);
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

async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  const posts = { groups: 0, reset: 0, projectDelete: 0 };
  let nativeDialogs = 0;
  page.on("dialog", (d) => { nativeDialogs += 1; d.dismiss().catch(() => {}); });
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
      if (path.endsWith("/gonggan/groups")) posts.groups += 1;
      if (path.endsWith("/gonggan/edit/reset")) posts.reset += 1;
      if (path.endsWith("/gonggan/project/delete")) posts.projectDelete += 1;
    }
    req.continue();
  });
  const modalState = () => page.evaluate(() => {
    const m = document.querySelector(".gg-confirm-dialog");
    if (!m) return null;
    const ok = m.querySelector(".gg-confirm-ok");
    return { title: m.querySelector(".gg-confirm-title")?.textContent || "", okClass: ok?.className || "", okFocused: document.activeElement === ok, buttons: [...m.querySelectorAll("button")].map((b) => b.textContent.trim()) };
  });
  const waitModal = async () => { await page.waitForSelector(".gg-confirm-dialog", { timeout: 8000 }); return modalState(); };
  const noModal = () => page.waitForFunction(() => !document.querySelector(".gg-confirm-dialog"), { timeout: 5000 });
  try {
    await waitForComfy(page);
    await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));
    const a = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-${runStamp}` });
    const pid = a.project.id;
    createdProjectIds.push(pid);
    await postJson(page, "/gonggan/cut/add", { pid });
    const tl0 = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`)).data;
    await postJson(page, "/gonggan/groups", { pid, groups: [{ id: "confirm-scene-1", name: "Scene One", cut_ids: [tl0.cuts[0].id], collapsed: false }] });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(1500);
    await openShotsTab(page);
    const sel = ".gg-root.gg-shots .gg-proj";
    await page.waitForFunction((p) => [...document.querySelectorAll(".gg-root.gg-shots .gg-proj option")].some((o) => o.value === p), { timeout: 15000 }, pid);
    if ((await page.$eval(sel, (e) => e.value)) !== pid) await page.select(sel, pid);
    await page.waitForSelector(".gg-root.gg-shots .gg-grp-del", { timeout: 15000 });
    posts.groups = 0;

    // ---- 1) delete scene
    await page.click(".gg-root.gg-shots .gg-grp-del");
    let m = await waitModal();
    if (m.title !== "Delete this scene? (Cuts become ungrouped)") throw new Error(`scene confirm wording changed: ${m.title}`);
    if (!m.okClass.includes("gg-danger")) throw new Error("OK is not emphasized on a delete confirm");
    if (m.buttons.join("|") !== "Cancel|OK") throw new Error(`buttons changed: ${m.buttons}`);
    await page.click(".gg-confirm-cancel");
    await noModal();
    await page.click(".gg-root.gg-shots .gg-grp-del");
    await waitModal();
    await page.keyboard.press("Escape");
    await noModal();
    await page.click(".gg-root.gg-shots .gg-grp-del");
    await waitModal();
    await page.mouse.click(5, 5); // backdrop
    await noModal();
    await sleep(500);
    if (posts.groups !== 0) throw new Error(`cancel / Esc / backdrop must not save groups (got ${posts.groups} POSTs)`);
    if (!(await page.$(".gg-root.gg-shots .gg-grp-del"))) throw new Error("scene vanished after cancelling");
    console.log("PASS  scene delete: Cancel, Esc and backdrop do nothing (no request, scene stays)");
    // IME Enter must not confirm
    await page.click(".gg-root.gg-shots .gg-grp-del");
    await waitModal();
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, keyCode: 229, bubbles: true, cancelable: true })));
    await sleep(300);
    if (!(await modalState())) throw new Error("an IME-composition Enter confirmed the dialog");
    if (posts.groups !== 0) throw new Error("IME Enter triggered a save");
    await page.keyboard.press("Enter");
    await noModal();
    await page.waitForFunction(() => !document.querySelector(".gg-root.gg-shots .gg-grp-del"), { timeout: 8000 });
    if (posts.groups !== 1) throw new Error(`Enter should save groups once (got ${posts.groups})`);
    console.log("PASS  scene delete: IME Enter ignored, Enter confirms and deletes the scene");

    // ---- 2) timeline Reset (enabled for native projects since 0.9.78)
    await page.waitForSelector(".gg-timeline .gg-reset:not([disabled])", { timeout: 15000 });
    await page.click(".gg-timeline .gg-reset");
    m = await waitModal();
    if (!m.title.startsWith("Reset this timeline")) throw new Error(`reset confirm wording changed: ${m.title}`);
    await page.click(".gg-confirm-cancel");
    await noModal();
    await sleep(300);
    if (posts.reset !== 0) throw new Error(`cancelled Reset still posted (${posts.reset})`);
    await page.click(".gg-timeline .gg-reset");
    await waitModal();
    await page.click(".gg-confirm-ok");
    await noModal();
    await sleep(800);
    if (posts.reset !== 1) throw new Error(`OK should post /gonggan/edit/reset once (got ${posts.reset})`);
    console.log("PASS  timeline Reset (native): Cancel does nothing, OK posts /gonggan/edit/reset once");

    // ---- 3) delete project (ctx menu)
    const openDeleteProject = async () => {
      await page.evaluate(() => {
        document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
        );
      });
      await clickCtxItem(page, "Delete Project");
    };
    await openDeleteProject();
    m = await waitModal();
    if (!/^Delete project ".*"\? It will be moved to trash\.$/.test(m.title)) throw new Error(`project delete wording: ${m.title}`);
    await page.keyboard.press("Escape");
    await noModal();
    await sleep(400);
    if (posts.projectDelete !== 0) throw new Error("Esc deleted the project");
    await openDeleteProject();
    await waitModal();
    await page.click(".gg-confirm-cancel");
    await noModal();
    await sleep(400);
    if (posts.projectDelete !== 0) throw new Error("Cancel deleted the project");
    await openDeleteProject();
    await waitModal();
    await page.keyboard.press("Enter");
    await noModal();
    const t2 = Date.now();
    while (!posts.projectDelete && Date.now() - t2 < 8000) await sleep(100);
    if (posts.projectDelete !== 1) throw new Error(`Enter should delete the project once (got ${posts.projectDelete})`);
    await page.waitForFunction((p) => ![...document.querySelectorAll(".gg-root.gg-shots .gg-proj option")].some((o) => o.value === p), { timeout: 10000 }, pid);
    console.log("PASS  project delete: Esc / Cancel keep it, Enter deletes it (moved to trash)");

    if (nativeDialogs !== 0) throw new Error(`${nativeDialogs} native dialog(s) opened`);
    if (blockedPromptAttempts > 0) throw new Error(`unexpected blocked posts: ${blockedPromptAttempts}`);
    console.log("PASS  no native dialog opened");
    console.log("PASS  confirm modal e2e complete");
  } finally {
    try { await cleanupProjects(page); } catch (_) {}
    await browser.close();
    try { fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}
run().catch((err) => {
  if (err.skipped) { console.log(`SKIP  confirm modal e2e: ${err.message}`); process.exit(0); }
  console.error(err);
  process.exit(1);
});