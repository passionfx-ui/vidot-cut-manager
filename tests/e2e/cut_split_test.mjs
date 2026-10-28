/**
 * Auto Cut Split in the New Project dialog: copy prompt, paste, preview, errors, create.
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
const TEST_PREFIX = "ZZ-test-cut-split";
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
  "# Scene: Night train",
  "- Cut: Window | 3 | Her face over passing lights.",
  "# References",
  "- Character: Mina",
  "- Place: Old station",
].join("\n");

async function setSplitText(page, text) {
  await page.$eval(".gg-split-text", (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}

const previewText = (page) => page.$eval(".gg-split-preview", (el) => el.textContent || "");
const createDisabled = (page) => page.$eval(".gg-modal-create", (el) => el.disabled);

async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  let importBody = null;
  let mockImport = false;
  page.removeAllListeners("request");
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (isBlockedPost(url, method)) {
      blockedPromptAttempts += 1;
      req.abort("blockedbyclient");
      return;
    }
    if (mockImport && method === "POST" && new URL(url).pathname.endsWith("/gonggan/project/import")) {
      importBody = JSON.parse(req.postData() || "{}");
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    req.continue();
  });
  try {
    await waitForComfy(page);
    await openShotsTab(page);

    await openNewProjectModal(page);
    const ui = await page.evaluate(() => ({
      hint: document.querySelector(".gg-split-hint")?.textContent || "",
      copy: document.querySelector(".gg-split-copy")?.textContent?.trim() || "",
      area: !!document.querySelector(".gg-split-text"),
    }));
    if (ui.copy !== "Copy prompt" || !ui.area) throw new Error(`split UI missing: ${JSON.stringify(ui)}`);
    if (!ui.hint.includes("1. Copy the prompt and paste it into your LLM together with your story.") ||
        !ui.hint.includes("2. Paste the LLM's result here to split it into scenes and cuts automatically.")) {
      throw new Error(`guidance text wrong: ${ui.hint}`);
    }
    if (await page.$(".gg-modal [class*=api-key], .gg-modal [class*=schedule], .gg-modal input[type=date]")) {
      throw new Error("forbidden AI/schedule fields present");
    }
    console.log("PASS  Auto Cut Split guidance + Copy prompt + paste box in New Project");

    await page.evaluate(() => {
      window.__ggCopied = null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (t) => { window.__ggCopied = t; return Promise.resolve(); } },
      });
    });
    await page.click(".gg-split-copy");
    await sleep(200);
    const copied = await page.evaluate(() => window.__ggCopied);
    if (!copied || !copied.startsWith("Split the story below into scenes and cuts using the rules") || !copied.includes("# Format: auto-cut-split v1")) {
      throw new Error("copied prompt wrong");
    }
    console.log("PASS  Copy prompt puts the LLM prompt on the clipboard");

    if (await createDisabled(page)) throw new Error("Create must be enabled with empty paste box");
    await setSplitText(page, SAMPLE);
    const okPrev = await previewText(page);
    if (okPrev !== "2 scenes, 3 cuts, 2 references will be created") throw new Error(`preview wrong: ${okPrev}`);
    if (await createDisabled(page)) throw new Error("Create disabled for a valid list");
    console.log(`PASS  preview line: ${okPrev}`);

    await setSplitText(page, SAMPLE + "\nthis line is garbage");
    const errPrev = await previewText(page);
    if (!/^Line 10:/.test(errPrev)) throw new Error(`error preview wrong: ${errPrev}`);
    if (!(await createDisabled(page))) throw new Error("Create must be disabled while errors exist");
    await setSplitText(page, "# Scene: no format line\n- Cut: a | 1 | b");
    if (!(await createDisabled(page))) throw new Error("missing format line must disable Create");
    await setSplitText(page, "");
    if (await createDisabled(page)) throw new Error("Create must re-enable when box emptied");
    console.log("PASS  errors show line numbers and disable Create");

    // Real route available? (needs a restart after 0.9.32). Probe with a bogus pid: 400 = new server.
    const probe = await page.evaluate(async () => {
      const r = await fetch(`${location.origin}/gonggan/project/import`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: "x" }),
      });
      return r.status;
    });
    mockImport = probe !== 400; // real route answers 400 for a bogus pid; old server answers 404/405
    console.log(mockImport ? "NOTE  server has no /gonggan/project/import yet (restart needed): mocking the import call" : "NOTE  using the real import route");

    await setSplitText(page, SAMPLE);
    const name = `${TEST_PREFIX}-${runStamp}`;
    await page.click(".gg-modal-name", { clickCount: 3 });
    await page.type(".gg-modal-name", name, { delay: 6 });
    await page.click(".gg-modal-create");
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
    if (mockImport) {
      if (!importBody || importBody.pid !== pid) throw new Error("import call not sent for the new project");
      if (importBody.scenes?.length !== 2 || importBody.scenes[0].cuts.length !== 2 || importBody.references?.length !== 2) {
        throw new Error(`import payload wrong: ${JSON.stringify(importBody)}`);
      }
      if (importBody.scenes[0].cuts[0].caption !== "Rain on an empty platform." || importBody.scenes[0].cuts[0].sec !== 3) {
        throw new Error("import payload cut fields wrong");
      }
      console.log("PASS  create sends scenes/cuts/references to /gonggan/project/import (mocked server)");
    } else {
      await sleep(1500);
      const tl = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
      const cuts = tl.data?.cuts || [];
      const names = cuts.map((c) => c.name);
      if (cuts.length !== 3 || !names.includes("Platform wide") || !names.includes("Window")) {
        throw new Error(`real import produced wrong cuts: ${JSON.stringify(names)}`);
      }
      const cap = cuts.find((c) => c.name === "Platform wide")?.caption;
      if (cap !== "Rain on an empty platform.") throw new Error(`caption wrong: ${cap}`);
      console.log("PASS  real import created 3 named cuts with captions");
    }

    if (blockedPromptAttempts > 0) throw new Error(`unexpected blocked posts: ${blockedPromptAttempts}`);
    console.log("PASS  cut split e2e complete");
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
    console.log(`SKIP  cut split e2e: ${err.message}`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});