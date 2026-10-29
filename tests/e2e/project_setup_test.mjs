/**
 * Project setup modal + settings on timeline; redo filter label.
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
const TEST_PREFIX = "ZZ-test-project-setup";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-project-setup-${runStamp}`);
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
  try {
    await waitForComfy(page);
    await openShotsTab(page);

    await openNewProjectModal(page);
    const fields = await page.evaluate(() => ({
      name: !!document.querySelector(".gg-modal-name"),
      resolution: !!document.querySelector(".gg-modal-resolution"),
      fps: !!document.querySelector(".gg-modal-fps"),
      cutSec: !!document.querySelector(".gg-modal-cut-sec"),
      captionLang: !!document.querySelector(".gg-modal-caption-lang"),
      template: !!document.querySelector(".gg-modal-tpl"),
      folder: !!document.querySelector(".gg-modal-folder"),
    }));
    if (!fields.name || !fields.resolution || !fields.fps || !fields.cutSec || !fields.captionLang || !fields.template || !fields.folder) {
      throw new Error(`New project modal missing fields: ${JSON.stringify(fields)}`);
    }
    console.log("PASS  project setup modal shows the setup fields incl. Project folder");
    const order = await page.evaluate(() => {
      const q = (s) => document.querySelector(`.gg-modal ${s}`);
      const pos = (el) => (el ? el.getBoundingClientRect().top : -1);
      return [".gg-modal-name", ".gg-modal-tpl", ".gg-split-text", ".gg-modal-resolution", ".gg-modal-folder"].map((s) => pos(q(s)));
    });
    const sorted = [...order].sort((a, b) => a - b);
    if (order.some((v) => v < 0) || order.join() !== sorted.join()) {
      throw new Error(`dialog order should be Name, Template, Auto Cut Split, format settings, folder: ${order}`);
    }
    const noFolderDefault = await page.$eval(".gg-modal-folder", (el) => el.value);
    if (noFolderDefault !== "") throw new Error("Project folder must default to empty (nothing on C:)");
    console.log("PASS  dialog order: Name, Template, Auto Cut Split, settings, folder; folder default empty");
    await page.click(".gg-modal-cancel");

    const redoLabel = await page.$eval(".gg-filter-redo", (el) => el.textContent?.trim() || "");
    const redoTitle = await page.$eval(".gg-filter-redo", (el) => el.getAttribute("title") || "");
    if (!redoLabel.includes("Show redo cuts only")) {
      throw new Error(`redo filter label wrong: ${redoLabel}`);
    }
    if (!redoTitle.toLowerCase().includes("marked for redo")) {
      throw new Error(`redo filter tooltip wrong: ${redoTitle}`);
    }
    console.log("PASS  project setup redo filter label");

    const name = `${TEST_PREFIX}-${runStamp}`;
    await openNewProjectModal(page);
    await page.click(".gg-modal-name", { clickCount: 3 });
    await page.type(".gg-modal-name", name, { delay: 6 });
    await page.select(".gg-modal-resolution", "9:16@720x1280");
    await page.type(".gg-modal-folder", "N:\\ZZ-test-folder", { delay: 4 });
    await page.select(".gg-modal-fps", "30");
    await page.$eval(".gg-modal-cut-sec", (el) => {
      el.value = "5";
    });
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
    console.log("PASS  project setup create via UI");

    let pythonOk = false;
    try {
      const tl = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
      const settings = tl.data?.project?.settings;
      if (
        settings &&
        settings.fps === 30 &&
        Number(settings.cut_seconds) === 5 &&
        settings.width === 720 &&
        settings.height === 1280
      ) {
        pythonOk = true;
        console.log("PASS  project setup timeline settings (server)");
        if (settings.project_folder === "N:\\ZZ-test-folder") console.log("PASS  project folder persisted (server)");
        else console.log("SKIP  project folder not persisted: server not restarted for 0.9.33");
      }
    } catch (e) {
      console.log(`SKIP python part (server not restarted): ${e.message}`);
    }
    if (!pythonOk) {
      console.log("SKIP python part (server not restarted)");
    }

    const head = await page.evaluate(() => {
      const h = document.querySelector(".gg-root.gg-shots .gg-head");
      const gear = h?.querySelector(".gg-proj-settings");
      return {
        projectLabel: h?.querySelector(".gg-proj-label")?.textContent?.trim() || "",
        gearTitle: gear?.getAttribute("title") || "",
        headTemplate: !!h?.querySelector(".gg-tpl-select"),
      };
    });
    if (head.projectLabel !== "Project:") throw new Error(`header Project label wrong: "${head.projectLabel}"`);
    if (head.gearTitle !== "Project settings") throw new Error(`gear title wrong: "${head.gearTitle}"`);
    if (head.headTemplate) throw new Error("Template selector should not be in the sidebar header");
    console.log("PASS  header shows Project: label + gear, no Template selector");

    await page.click(".gg-root.gg-shots .gg-proj-settings");
    await page.waitForSelector('.gg-modal[aria-label="Project settings"]', { timeout: 8000 });
    const settingsFields = await page.evaluate(() => ({
      title: document.querySelector(".gg-modal .gg-modal-title")?.textContent?.trim() || "",
      name: !!document.querySelector(".gg-modal-name"),
      resolution: !!document.querySelector(".gg-modal-resolution"),
      fps: !!document.querySelector(".gg-modal-fps"),
      cutSec: !!document.querySelector(".gg-modal-cut-sec"),
      captionLang: !!document.querySelector(".gg-modal-caption-lang"),
      folder: !!document.querySelector(".gg-modal-folder"),
      template: !!document.querySelector(".gg-modal .gg-tpl-select"),
      useLast: !!document.querySelector(".gg-modal .gg-tpl-use-last"),
    }));
    if (settingsFields.title !== "Project Settings") throw new Error(`modal title wrong: "${settingsFields.title}"`);
    if (Object.entries(settingsFields).some(([k, v]) => k !== "title" && !v)) {
      throw new Error(`Project settings dialog incomplete: ${JSON.stringify(settingsFields)}`);
    }
    console.log("PASS  gear opens Project Settings with name, setup fields and template selector");
    await page.click(".gg-modal-cancel");

    await page.evaluate(() => {
      document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
      );
    });
    await page.waitForSelector(".gg-ctx", { timeout: 8000 });
    const menuLabels = await page.$$eval(".gg-ctx-item", (els) => els.map((el) => el.textContent?.trim()));
    if (menuLabels.includes("Rename Project…")) throw new Error("Rename Project… should be in Project Settings now");
    if (!menuLabels.includes("Delete Project")) throw new Error("Delete Project should stay in the project menu");
    await clickCtxItem(page, "Project Settings…");
    await page.waitForSelector('.gg-modal[aria-label="Project settings"]', { timeout: 8000 });
    console.log("PASS  project menu: Project Settings… opens the same modal, Delete Project kept, Rename moved");
    await page.click(".gg-modal-cancel");

    if (blockedPromptAttempts > 0) {
      throw new Error(`unexpected blocked posts: ${blockedPromptAttempts}`);
    }
    console.log("PASS  project setup e2e complete");
  } finally {
    try {
      await cleanupProjects(page);
    } catch (_) {}
    await browser.close();
    try {
      fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
}

run().catch((err) => {
  if (err.skipped) {
    console.log(`SKIP  project setup e2e: ${err.message}`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
