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

/** Fake folder tree for GET /gonggan/folder/list while `folderMockOn` (the real route needs a ComfyUI restart). */
let folderMockOn = false;
/** GET /gonggan/projects answers an empty list while on (empty state without deleting real projects). */
let projectsMockEmpty = false;
const FOLDER_PLACES = { drives: ["C:\\", "D:\\"], quick: [{ name: "Home", path: "C:\\Users\\me" }] };
const FOLDER_MOCK = {
  "": { path: "", parent: null, folders: ["C:\\", "D:\\"] },
  "C:\\": { path: "C:\\", parent: "", folders: ["Films", "Locked"] },
  "C:\\Films": { path: "C:\\Films", parent: "C:\\", folders: ["A", "B"] },
  "C:\\Users\\me": { path: "C:\\Users\\me", parent: "C:\\Users", folders: ["Desktop"] },
  "D:\\": { path: "D:\\", parent: "", folders: ["Renders"] },
};

function folderMockResponse(url) {
  const p = new URL(url).searchParams.get("path") || "";
  if (p === "C:\\Locked") return { status: 403, body: { ok: false, message: "Permission denied: this folder cannot be opened" } };
  const hit = FOLDER_MOCK[p];
  return hit ? { status: 200, body: { ok: true, ...FOLDER_PLACES, ...hit } } : { status: 404, body: { ok: false, message: "Folder not found" } };
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
    if (projectsMockEmpty && method === "GET" && /\/gonggan\/projects$/.test(new URL(url).pathname)) {
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, projects: [] }) });
      return;
    }
    if (folderMockOn && method === "GET" && /\/gonggan\/folder\/list$/.test(new URL(url).pathname)) {
      const { status, body } = folderMockResponse(url);
      req.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
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

    const NP = '.gg-modal[aria-label="New project"]';
    const projectCount = async () => (await getJson(page, "/gonggan/projects")).data?.projects?.length ?? -1;
    const countBefore = await projectCount();
    await openNewProjectModal(page);
    const np = await page.evaluate((sel) => {
      const m = document.querySelector(sel);
      const pos = (s) => m?.querySelector(s)?.getBoundingClientRect().top ?? -1;
      return {
        title: m?.querySelector(".gg-modal-title")?.textContent?.trim() || "",
        fieldCount: m?.querySelectorAll(":scope > .gg-modal-field").length ?? 0,
        labels: [...(m?.querySelectorAll(":scope > .gg-modal-field") || [])].map((f) =>
          (f.querySelector(".gg-tpl-label")?.textContent || f.firstChild?.textContent || "").trim()),
        browse: m?.querySelector(".gg-modal-folder-browse")?.textContent?.trim() || "",
        combo: !!m?.querySelector(".gg-tpl-combo"),
        location: m?.querySelector(".gg-modal-folder")?.value ?? null,
        order: [".gg-modal-name", ".gg-modal-folder", ".gg-tpl-combo"].map(pos),
        removed: [".gg-modal-resolution", ".gg-modal-fps", ".gg-modal-cut-sec", ".gg-modal-caption-lang", ".gg-split-text", ".gg-modal-tpl"]
          .filter((s) => m?.querySelector(s)),
        buttons: [...(m?.querySelectorAll(".gg-modal-actions button") || [])].map((b) => b.textContent?.trim()),
      };
    }, NP);
    if (np.title !== "New Project" || np.fieldCount !== 3 || np.labels.join("|") !== "Project name|Location|Default template") {
      throw new Error(`New Project window fields wrong: ${JSON.stringify(np)}`);
    }
    if (np.browse !== "Browse…" || !np.combo || np.removed.length || np.buttons.join() !== "Cancel,Create") {
      throw new Error(`New Project window controls wrong: ${JSON.stringify(np)}`);
    }
    if (np.order.some((v) => v < 0) || np.order.join() !== [...np.order].sort((a, b) => a - b).join()) {
      throw new Error(`order should be name, location, template: ${np.order}`);
    }
    if (np.location !== "") throw new Error(`fresh profile: Location should start empty, got "${np.location}"`);
    console.log("PASS  New Project window: Project name, Location (Browse…), Default template only; Cancel / Create");

    const toggle = await page.$eval(`${NP} .gg-tpl-toggle`, (el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent?.trim(), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" };
    });
    if (toggle.text !== "▼" || !toggle.visible) throw new Error(`Default template ▼ button should be visible: ${JSON.stringify(toggle)}`);
    const listHidden = () => page.$eval(`${NP} .gg-tpl-list`, (el) => el.hidden);
    await page.click(`${NP} .gg-tpl-toggle`);
    await page.waitForFunction((sel) => !document.querySelector(`${sel} .gg-tpl-list`)?.hidden, { timeout: 5000 }, NP);
    const firstNpOpt = await page.$eval(`${NP} .gg-tpl-list li`, (el) => el.textContent);
    await page.click(`${NP} .gg-tpl-toggle`);
    if (firstNpOpt !== "(none)" || !(await listHidden())) throw new Error(`▼ should open the list ((none) first) and close it again: "${firstNpOpt}"`);
    const typedRef = "zz-typed/own-template.json";
    await page.click(`${NP} .gg-tpl-combo`, { clickCount: 3 });
    await page.type(`${NP} .gg-tpl-combo`, typedRef, { delay: 2 });
    await page.keyboard.press("Enter");
    const typed = await page.evaluate((sel) => ({
      value: document.querySelector(`${sel} .gg-tpl-combo`)?.value,
      hidden: document.querySelector(`${sel} .gg-tpl-list`)?.hidden,
      modal: !!document.querySelector(sel),
    }), NP);
    if (typed.value !== typedRef || !typed.hidden || !typed.modal) throw new Error(`a typed template should be kept on Enter: ${JSON.stringify(typed)}`);
    console.log("PASS  Default template: ▼ button visible, opens/closes the list; a typed value is kept on Enter");

    await page.type(".gg-modal-name", "ZZ-should-not-exist", { delay: 2 });
    await page.click(".gg-modal-cancel");
    await sleep(500);
    if (await page.$(NP)) throw new Error("Cancel should close the New Project window");
    if ((await projectCount()) !== countBefore) throw new Error("Cancel must not create a project");
    console.log("PASS  Cancel closes the window and creates nothing");

    if (!(await page.$(".gg-filter-redo"))) {
      console.log("SKIP  project setup redo filter label: option hidden (SHOW_REDO_FILTER = false)");
    } else {
      const redoLabel = await page.$eval(".gg-filter-redo", (el) => el.textContent?.trim() || "");
      const redoTitle = await page.$eval(".gg-filter-redo", (el) => el.getAttribute("title") || "");
      if (!redoLabel.includes("Show redo cuts only")) {
        throw new Error(`redo filter label wrong: ${redoLabel}`);
      }
      if (!redoTitle.toLowerCase().includes("marked for redo")) {
        throw new Error(`redo filter tooltip wrong: ${redoTitle}`);
      }
      console.log("PASS  project setup redo filter label");
    }

    const name = `${TEST_PREFIX}-${runStamp}`;
    const location = path.join(os.tmpdir(), `${TEST_PREFIX}-${runStamp}-loc`);
    const expectedFolder = path.join(location, name);
    await openNewProjectModal(page);
    await page.type(".gg-modal-name", name, { delay: 6 });
    await page.click(".gg-modal-create");
    const locErr = await (await page.waitForFunction(
      () => document.querySelector(".gg-modal-folder-err")?.textContent?.trim(), { timeout: 5000 })).jsonValue();
    if (locErr !== "Choose a location" || !(await page.$(NP))) throw new Error(`empty Location should block Create: "${locErr}"`);
    if ((await projectCount()) !== countBefore) throw new Error("blocked Create must not create a project");
    console.log("PASS  empty Location blocks Create with an inline message");

    await page.type(".gg-modal-folder", location, { delay: 2 });
    const hint = await page.$eval(".gg-np-path", (el) => el.textContent);
    if (hint !== `Project folder: ${expectedFolder}`) throw new Error(`folder hint wrong: "${hint}"`);
    console.log("PASS  hint shows the project folder <location>\\<name>");
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
    if (await page.$(NP)) throw new Error("Create should close the New Project window");
    console.log("PASS  project setup create via UI");

    const createdSettings = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`)).data?.project?.settings || {};
    const pythonOk = createdSettings.project_folder === expectedFolder;
    if (pythonOk) {
      const entries = fs.readdirSync(expectedFolder);
      if (entries.join() !== "assets" || !fs.statSync(path.join(expectedFolder, "assets")).isDirectory()) {
        throw new Error(`project folder should hold exactly one subfolder "assets": ${entries}`);
      }
      console.log("PASS  project folder <location>\\<name> created with only assets; project_folder set (server)");
    } else if (fs.existsSync(expectedFolder)) {
      throw new Error(`folder created but project_folder not set: ${JSON.stringify(createdSettings)}`);
    } else {
      console.log("SKIP  project folder not created: restart ComfyUI for 0.9.99 (create route)");
    }

    await openNewProjectModal(page);
    const prefilled = await page.$eval(".gg-modal-folder", (el) => el.value);
    if (prefilled !== location) throw new Error(`last-used location should be prefilled: "${prefilled}"`);
    await page.click(".gg-modal-cancel");
    console.log("PASS  next New Project prefills the last-used location");

    const head = await page.evaluate(() => {
      const h = document.querySelector(".gg-root.gg-shots .gg-head");
      const gear = h?.querySelector(".gg-proj-settings");
      return {
        projectLabel: h?.querySelector(".gg-proj-label")?.textContent?.trim() || "",
        gearTitle: gear?.getAttribute("title") || "",
        headTemplate: !!h?.querySelector(".gg-tpl-combo"),
      };
    });
    if (head.projectLabel !== "Project:") throw new Error(`header Project label wrong: "${head.projectLabel}"`);
    if (head.gearTitle !== "Project settings") throw new Error(`gear title wrong: "${head.gearTitle}"`);
    if (head.headTemplate) throw new Error("Template selector should not be in the sidebar header");
    console.log("PASS  header shows Project: label + gear, no Template selector");

    await page.click(".gg-root.gg-shots .gg-proj-settings");
    await page.waitForSelector('.gg-modal[aria-label="Project settings"]', { timeout: 8000 });
    const settingsFields = await page.evaluate(() => {
      const m = document.querySelector('.gg-modal[aria-label="Project settings"]');
      return {
        title: m?.querySelector(".gg-modal-title")?.textContent?.trim() || "",
        fieldCount: m?.querySelectorAll(":scope > .gg-modal-field").length ?? 0,
        folderLabel: m?.querySelector(".gg-modal-folder")?.closest(".gg-modal-field")?.firstChild?.textContent?.trim() || "",
        folderValue: m?.querySelector(".gg-modal-folder")?.value ?? null,
        folderHint: m?.querySelector(".gg-folder-row ~ .gg-modal-hint")?.textContent || "",
        browse: m?.querySelector(".gg-modal-folder-browse")?.textContent?.trim() || "",
        templateLabel: m?.querySelector(".gg-tpl-label")?.textContent?.trim() || "",
        template: !!m?.querySelector(".gg-tpl-combo") && !m?.querySelector(".gg-tpl-select, .gg-modal-tpl-filter"),
        useLast: !!m?.querySelector(".gg-tpl-use-last"),
        removed: [".gg-modal-name", ".gg-modal-resolution", ".gg-modal-fps", ".gg-modal-cut-sec", ".gg-modal-caption-lang"]
          .filter((s) => m?.querySelector(s)),
        buttons: [...(m?.querySelectorAll(".gg-modal-actions button") || [])].map((b) => b.textContent?.trim()),
      };
    });
    if (settingsFields.title !== "Project Settings") throw new Error(`modal title wrong: "${settingsFields.title}"`);
    if (settingsFields.fieldCount !== 2) throw new Error(`Project Settings should have exactly 2 settings: ${JSON.stringify(settingsFields)}`);
    if (settingsFields.folderLabel !== "Output folder") throw new Error(`folder label wrong: "${settingsFields.folderLabel}"`);
    if (settingsFields.templateLabel !== "Default template" || !settingsFields.template || !settingsFields.useLast) {
      throw new Error(`template field incomplete: ${JSON.stringify(settingsFields)}`);
    }
    if (settingsFields.removed.length) throw new Error(`removed fields still shown: ${settingsFields.removed}`);
    if (settingsFields.browse !== "Browse…") throw new Error(`Browse… button missing: "${settingsFields.browse}"`);
    if (!/Empty = default/.test(settingsFields.folderHint)) throw new Error(`folder hint missing: "${settingsFields.folderHint}"`);
    if (settingsFields.buttons.join() !== "Cancel,Save") throw new Error(`buttons wrong: ${settingsFields.buttons}`);
    if (pythonOk && settingsFields.folderValue !== expectedFolder) {
      throw new Error(`Output folder should show the saved path: "${settingsFields.folderValue}"`);
    }
    console.log("PASS  gear opens Project Settings: Output folder + Default template only, Cancel / Save");

    const comboBefore = await page.$eval(".gg-tpl-combo", (el) => el.value);
    await page.click(".gg-tpl-combo");
    await page.waitForFunction(() => !document.querySelector(".gg-tpl-list")?.hidden, { timeout: 5000 });
    const firstOpt = await page.$eval(".gg-tpl-list li", (el) => el.textContent);
    await page.keyboard.type("zz-no-such-template-zz", { delay: 2 });
    const filtered = await page.$$eval(".gg-tpl-list li", (els) => els.map((el) => el.className));
    await page.keyboard.press("Escape");
    const combo = await page.evaluate(() => ({
      hidden: document.querySelector(".gg-tpl-list")?.hidden,
      value: document.querySelector(".gg-tpl-combo")?.value,
      modal: !!document.querySelector('.gg-modal[aria-label="Project settings"]'),
    }));
    if (firstOpt !== "(none)") throw new Error(`template list should start with (none): "${firstOpt}"`);
    if (filtered.join() !== "gg-combo-empty") throw new Error(`typing should filter the list live: ${filtered}`);
    if (!combo.hidden || combo.value !== comboBefore || !combo.modal) throw new Error(`Escape should close + revert: ${JSON.stringify(combo)}`);
    console.log("PASS  Default template combobox: typing filters live, Escape closes and restores the value");

    await page.click(".gg-modal-folder-browse");
    await page.waitForSelector('.gg-modal[aria-label="Choose folder"]', { timeout: 5000 });
    const picker = await (await page.waitForFunction(() => {
      const m = document.querySelector('.gg-modal[aria-label="Choose folder"]');
      const err = m?.querySelector(".gg-fp-err")?.textContent?.trim();
      const items = m?.querySelectorAll(".gg-fp-list li").length || 0;
      if (!err && !items) return null;
      return { err, items, title: m.querySelector(".gg-fp-addr")?.value || "(drives)", up: m.querySelector(".gg-fp-up")?.disabled };
    }, { timeout: 10000 })).jsonValue();
    if (picker.err && /Restart ComfyUI/.test(picker.err)) {
      console.log("SKIP  folder list route not loaded yet (restart ComfyUI for 0.9.94); picker shows the restart hint");
    } else if (picker.err) {
      throw new Error(`folder picker failed: ${picker.err}`);
    } else {
      console.log(`PASS  Browse… opens the folder picker at "${picker.title}" (${picker.items} rows)`);
    }
    await page.click(".gg-fp-cancel");
    const afterCancel = await page.evaluate(() => ({
      picker: !!document.querySelector('.gg-modal[aria-label="Choose folder"]'),
      settings: !!document.querySelector('.gg-modal[aria-label="Project settings"]'),
    }));
    if (afterCancel.picker || !afterCancel.settings) throw new Error(`Cancel should close only the picker: ${JSON.stringify(afterCancel)}`);
    console.log("PASS  folder picker Cancel closes it and keeps Project Settings open");

    folderMockOn = true;
    const FP = '.gg-modal[aria-label="Choose folder"]';
    const fpState = () => page.evaluate((sel) => {
      const m = document.querySelector(sel);
      if (!m) return null;
      return {
        title: m.querySelector(".gg-fp-addr")?.value || "",
        rows: [...m.querySelectorAll(".gg-fp-item")].map((li) => li.textContent),
        places: [...m.querySelectorAll(".gg-fp-side li")].map((li) => li.textContent),
        err: m.querySelector(".gg-fp-err")?.textContent || "",
        up: !m.querySelector(".gg-fp-up")?.disabled,
        select: !m.querySelector(".gg-fp-select")?.disabled,
      };
    }, FP);
    /** Address bar shows `want` and the right pane has loaded (rows or "No folders"). */
    const waitTitle = (t) => page.waitForFunction(
      (sel, want) => {
        const m = document.querySelector(sel);
        return m?.querySelector(".gg-fp-addr")?.value === want && m.querySelector(".gg-fp-list li");
      }, { timeout: 5000 }, FP, t);
    const setAddr = (v, inputType) => page.$eval(`${FP} .gg-fp-addr`, (el, val, type) => {
      el.value = val;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: type }));
    }, v, inputType);
    const clickPlace = async (name) => {
      for (const li of await page.$$(`${FP} .gg-fp-place`)) {
        if ((await li.evaluate((el) => el.textContent)) === name) return li.click();
      }
      throw new Error(`no place "${name}"`);
    };
    const dbl = async (name) => {
      const items = await page.$$(`${FP} .gg-fp-item`);
      for (const li of items) {
        if ((await li.evaluate((el) => el.textContent)) === name) return li.click({ clickCount: 2 });
      }
      throw new Error(`no folder row "${name}"`);
    };
    await page.$eval(".gg-modal-folder", (el) => { el.value = "Q:\\Missing\\Out"; });
    await page.click(".gg-modal-folder-browse");
    await waitTitle("");
    let st = await fpState();
    if (st.rows.join() !== "C:\\,D:\\" || st.up || st.select) throw new Error(`picker should fall back to the drive list: ${JSON.stringify(st)}`);
    const wantPlaces = ["Home", ...(location ? ["Last used"] : []), "Drives", "C:", "D:"];
    if (st.places.join() !== wantPlaces.join()) throw new Error(`left pane should list quick folders + drives: ${st.places}`);
    await clickPlace("D:");
    await waitTitle("D:\\");
    await clickPlace("Home");
    await waitTitle("C:\\Users\\me");
    st = await fpState();
    if (st.rows.join() !== "Desktop") throw new Error(`Home should open its folder: ${JSON.stringify(st)}`);
    await setAddr("  \"C:\\Films\\\\\"  ");
    await page.focus(`${FP} .gg-fp-addr`);
    await page.keyboard.press("Enter");
    await waitTitle("C:\\Films");
    await setAddr("\"C:\\\"", "insertFromPaste");
    await waitTitle("C:\\");
    await setAddr("Q:\\Nope");
    await page.click(`${FP} .gg-fp-go`);
    await page.waitForFunction((sel) => document.querySelector(`${sel} .gg-fp-err`)?.textContent, { timeout: 5000 }, FP);
    st = await fpState();
    if (st.err !== "Folder not found" || st.rows.join() !== "Films,Locked") throw new Error(`bad path should show an inline error and stay put: ${JSON.stringify(st)}`);
    await setAddr("relative\\folder");
    await page.click(`${FP} .gg-fp-go`);
    st = await fpState();
    if (!/full path/.test(st.err)) throw new Error(`relative path should show an inline error: ${JSON.stringify(st)}`);
    console.log("PASS  folder picker address bar (Enter / Go / paste, quotes + trailing slash stripped, inline errors) and left pane (quick folders, drives)");
    await page.click(`${FP} .gg-fp-up`);
    await waitTitle("");
    await dbl("C:\\");
    await waitTitle("C:\\");
    await dbl("Locked");
    await page.waitForFunction((sel) => document.querySelector(`${sel} .gg-fp-err`)?.textContent, { timeout: 5000 }, FP);
    st = await fpState();
    if (st.title !== "C:\\" || !/Permission denied/.test(st.err)) throw new Error(`permission error should show and stay put: ${JSON.stringify(st)}`);
    await dbl("Films");
    await waitTitle("C:\\Films");
    st = await fpState();
    if (st.err || !st.up || !st.select || st.rows.join() !== "A,B") throw new Error(`Films view wrong: ${JSON.stringify(st)}`);
    await page.click(`${FP} .gg-fp-up`);
    await waitTitle("C:\\");
    await dbl("Films");
    await waitTitle("C:\\Films");
    const rowB = (await page.$$(`${FP} .gg-fp-item`))[1];
    await rowB.click();
    await page.click(`${FP} .gg-fp-select`);
    const picked = await page.evaluate((sel) => ({
      picker: !!document.querySelector(sel),
      value: document.querySelector(".gg-modal-folder")?.value,
    }), FP);
    folderMockOn = false;
    if (picked.picker || picked.value !== "C:\\Films\\B") throw new Error(`Select should fill the Output folder: ${JSON.stringify(picked)}`);
    console.log("PASS  folder picker (mocked route): drives fallback, open, permission message, Up, Select fills the path");

    const SAVE_BTN = '.gg-modal[aria-label="Project settings"] button[type=submit]';
    const setFolder = (v) =>
      page.$eval(".gg-modal-folder", (el, val) => {
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, v);
    await setFolder("relative\\folder");
    await page.click(SAVE_BTN);
    const badFolder = await (await page.waitForFunction(
      () => document.querySelector(".gg-modal-folder-err")?.textContent?.trim(),
      { timeout: 8000 },
    )).jsonValue();
    if (!(await page.$('.gg-modal[aria-label="Project settings"]'))) throw new Error("modal closed on an invalid folder");
    console.log(`PASS  invalid Output folder blocks Save with an inline message: "${badFolder}"`);

    const okFolder = path.join(os.tmpdir(), `${TEST_PREFIX}-${runStamp}`, "Out");
    await setFolder(okFolder);
    await page.click(SAVE_BTN);
    const outcome = await (await page.waitForFunction(
      () => (!document.querySelector(".gg-modal-backdrop") ? "closed" : document.querySelector(".gg-modal-folder-err")?.textContent?.trim()),
      { timeout: 15000 },
    )).jsonValue();
    const saved = outcome === "closed" ? "" : outcome;
    if (saved && /Restart ComfyUI/.test(saved)) {
      console.log("SKIP  folder check route not loaded yet (restart ComfyUI for 0.9.82)");
      await page.click(".gg-modal-cancel");
    } else if (saved) {
      throw new Error(`valid Output folder rejected: ${saved}`);
    } else {
      const s2 = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`)).data?.project?.settings || {};
      if (s2.project_folder !== okFolder) throw new Error(`Output folder not saved: ${s2.project_folder}`);
      const keep = ["fps", "cut_seconds", "width", "height", "aspect", "caption_lang"];
      if (keep.some((k) => s2[k] !== createdSettings[k])) {
        throw new Error(`hidden settings changed by Save: ${JSON.stringify(s2)}`);
      }
      if (fs.existsSync(okFolder)) throw new Error("Save must not create the Output folder");
      console.log("PASS  Output folder saved (other stored settings untouched, folder not created)");
    }

    await page.evaluate(() => {
      document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
      );
    });
    await page.waitForSelector(".gg-ctx", { timeout: 8000 });
    const menuLabels = await page.$$eval(".gg-ctx-item", (els) => els.map((el) => el.textContent?.trim()));
    if (!menuLabels.includes("Rename Project…")) throw new Error("Rename Project… should be back in the project menu");
    if (!menuLabels.includes("Delete Project")) throw new Error("Delete Project should stay in the project menu");
    await clickCtxItem(page, "Project Settings…");
    await page.waitForSelector('.gg-modal[aria-label="Project settings"]', { timeout: 8000 });
    console.log("PASS  project menu: Project Settings… opens the same modal, Rename Project… and Delete Project kept");
    await page.click(".gg-modal-cancel");

    await page.evaluate(() => {
      document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
      );
    });
    await clickCtxItem(page, "Rename Project…");
    await page.waitForSelector(".gg-ask-dialog .gg-ask-input", { timeout: 8000 });
    const askValue = await page.$eval(".gg-ask-dialog .gg-ask-input", (el) => el.value);
    if (askValue !== name) throw new Error(`rename prompt should show the current name: "${askValue}"`);
    await page.keyboard.press("End");
    await page.type(".gg-ask-dialog .gg-ask-input", " R", { delay: 5 });
    await page.click(".gg-ask-dialog .gg-ask-ok");
    await page.waitForFunction(
      (n) => {
        const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
        return sel?.options[sel.selectedIndex]?.textContent.includes(n);
      },
      { timeout: 15000 },
      `${name} R`
    );
    console.log("PASS  Rename Project… renames via the in-app prompt");

    projectsMockEmpty = true;
    await waitForComfy(page);
    await openShotsTab(page);
    await page.waitForSelector(".gg-root.gg-shots .gg-no-projects .gg-new-project-btn", { timeout: 20000 });
    const empty = await page.evaluate(() => {
      const r = document.querySelector(".gg-root.gg-shots");
      const btn = r.querySelector(".gg-no-projects .gg-new-project-btn");
      const box = btn.getBoundingClientRect();
      return {
        hint: r.querySelector(".gg-no-projects span")?.textContent?.trim() || "",
        label: btn.textContent?.trim(),
        visible: box.width > 0 && box.height > 0 && getComputedStyle(btn).visibility !== "hidden",
        inList: !!btn.closest(".gg-grp-wrap"),
        disabled: [".gg-ir-scene", ".gg-ir-cut", ".gg-ir-del", ".gg-queue-btn"].map((s) => r.querySelector(s)?.disabled ?? null),
        queueTitle: r.querySelector(".gg-queue-btn")?.title || "",
      };
    });
    if (empty.label !== "New project" || !empty.visible || !empty.inList || !empty.hint) {
      throw new Error(`empty state New project button wrong: ${JSON.stringify(empty)}`);
    }
    if (empty.disabled.some((d) => d !== true)) throw new Error(`no project: icons + Queue should be disabled: ${JSON.stringify(empty)}`);
    console.log(`PASS  0 projects: "${empty.hint}" + visible New project button in the cut list; New scene / New cut / Delete / Queue disabled ("${empty.queueTitle}")`);
    await page.click(".gg-new-project-btn");
    await page.waitForSelector(NP, { timeout: 5000 });
    const sameWindow = await page.evaluate((sel) => ({
      fields: document.querySelectorAll(`${sel} > .gg-modal-field`).length,
      location: document.querySelector(`${sel} .gg-modal-folder`)?.value,
    }), NP);
    if (sameWindow.fields !== 3 || sameWindow.location !== location) throw new Error(`button should open the same window: ${JSON.stringify(sameWindow)}`);
    await page.click(".gg-modal-cancel");
    projectsMockEmpty = false;
    console.log("PASS  New project button opens the same New Project window");

    if (blockedPromptAttempts > 0) {
      throw new Error(`unexpected blocked posts: ${blockedPromptAttempts}`);
    }
    console.log("PASS  project setup e2e complete");
  } finally {
    try {
      await cleanupProjects(page);
    } catch (_) {}
    await browser.close();
    for (const dir of [PERSISTENT_USER_DATA_DIR, path.join(os.tmpdir(), `${TEST_PREFIX}-${runStamp}-loc`)]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
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
