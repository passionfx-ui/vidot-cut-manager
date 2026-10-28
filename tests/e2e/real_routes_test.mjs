/**
 * Real-server check, no mocks: import, project_folder, cut rename after reload, reference add + real send-output (existing ComfyUI output file, no generation), thumbnail loads.
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
const TEST_PREFIX = "ZZ-test-real";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-shots-${runStamp}`);
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


const pidQ = (pid) => encodeURIComponent(pid);
const tlOf = async (page, pid) => (await getJson(page, `/gonggan/timeline?pid=${pidQ(pid)}`)).data;

async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  try {
    await waitForComfy(page);
    for (const r of ["/gonggan/project/import", "/gonggan/cut/rename", "/gonggan/reference/add"]) {
      const code = await page.evaluate(async (u) => (await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: "zz" }) })).status, r);
      if (code !== 400) {
        const err = new Error(`server has no ${r} (status ${code}): restart needed`);
        err.skipped = true;
        throw err;
      }
    }
    console.log("PASS  server has the 0.9.32-0.9.34 routes (400 for a bogus pid)");

    const folder = "N:\\ZZ-test-real-folder";
    const created = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-${runStamp}`, settings: { project_folder: folder } });
    const pid = created.project.id;
    createdProjectIds.push(pid);

    await postJson(page, "/gonggan/project/import", {
      pid,
      scenes: [
        { name: "Arrival", cuts: [{ name: "Platform wide", sec: 3, caption: "Rain." }, { name: "Ticket", sec: 2, caption: "One way." }] },
        { name: "Night", cuts: [{ name: "Window", sec: 3, caption: "Lights." }] },
      ],
      loose: [{ name: "Loose one", sec: 2, caption: "extra" }],
      references: [{ category: "Character", name: "Mina Park" }, { category: "Place", name: "Night Platform" }],
    });
    let tl = await tlOf(page, pid);
    const names = tl.cuts.map((c) => c.name);
    if (JSON.stringify(names) !== JSON.stringify(["Platform wide", "Ticket", "Window", "Loose one"])) throw new Error(`cut names: ${names}`);
    if (tl.references.length !== 2) throw new Error(`references: ${tl.references.length}`);
    if (tl.cuts.some((c) => c.kind === "reference")) throw new Error("reference leaked into cuts");
    console.log("PASS  real import: 4 named cuts, 2 scenes, 2 references (hidden)");

    if ((tl.project?.settings || tl.settings || {}).project_folder !== folder) throw new Error("project_folder not saved at create");
    await postJson(page, "/gonggan/project/update", { pid, fields: { settings: { project_folder: folder + "-b" } } });
    tl = await tlOf(page, pid);
    if ((tl.project?.settings || tl.settings || {}).project_folder !== folder + "-b") throw new Error("project_folder not updated");
    console.log("PASS  project_folder saved and updated (real route)");

    const cutId = tl.cuts[1].id;
    await postJson(page, "/gonggan/cut/rename", { pid, cut_id: cutId, name: "Ticket booth" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    tl = await tlOf(page, pid);
    if (tl.cuts[1].name !== "Ticket booth") throw new Error("rename not persisted after reload");
    console.log("PASS  cut rename persists after reload (real route)");

    const dup = await page.evaluate(async (p) => (await fetch("/gonggan/reference/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: p, name: "mina park", category: "Character" }) })).status, pid);
    if (dup < 400) throw new Error(`duplicate reference accepted (${dup})`);
    const add = await postJson(page, "/gonggan/reference/add", { pid, name: "Red Coat", category: "Prop" });
    tl = await tlOf(page, pid);
    const ref = tl.references.find((r) => r.name === "Red Coat");
    if (!ref || tl.references.length !== 3) throw new Error(`reference/add failed: ${JSON.stringify(add).slice(0, 120)}`);
    console.log("PASS  reference/add real route (duplicate refused, 3 references, cuts unchanged)");

    const lo = (await getJson(page, "/gonggan/last-output")).data;
    if (!lo?.ok) {
      console.log("SKIP  no existing ComfyUI output to attach (thumbnail check skipped)");
    } else {
      await postJson(page, "/gonggan/send-output", { pid, cut_id: ref.id });
      tl = await tlOf(page, pid);
      const r2 = tl.references.find((r) => r.id === ref.id);
      if (!r2.media || r2.versions !== 1 || r2.pick !== r2.media.id) throw new Error(`reference version missing: ${JSON.stringify(r2).slice(0, 200)}`);
      const poster = await page.evaluate(async (id) => {
        const res = await fetch(`/gonggan/poster?id=${encodeURIComponent(id)}`);
        return { status: res.status, type: res.headers.get("content-type"), size: (await res.arrayBuffer()).byteLength };
      }, r2.media.id);
      if (poster.status !== 200 || !/^image\//.test(poster.type) || poster.size < 500) throw new Error(`poster: ${JSON.stringify(poster)}`);
      if (tl.cuts.length !== 4) throw new Error("send-output on a reference changed the cut count");
      await openShotsTab(page);
      await page.select(".gg-root.gg-shots .gg-proj", pid);
      await sleep(1500);
      await page.evaluate(() => {
        document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 }));
      });
      await clickCtxItem(page, "References\u2026");
      await page.waitForSelector(".gg-refs .gg-ref-thumb img", { timeout: 10000 });
      await sleep(800);
      const nat = await page.$eval(".gg-refs .gg-ref-thumb img", (im) => ({ w: im.naturalWidth, h: im.naturalHeight }));
      if (!nat.w || !nat.h) throw new Error("reference thumbnail did not load");
      console.log(`PASS  real send-output on a reference: version + pick, poster ${poster.type} ${poster.size} B, thumbnail ${nat.w}x${nat.h} loaded`);
    }
    console.log("PASS  real routes e2e complete");
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
    console.log(`SKIP  real routes: ${err.message}`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});