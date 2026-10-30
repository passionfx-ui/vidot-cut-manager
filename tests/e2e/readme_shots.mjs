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
const TEST_PREFIX = "Demo";
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


const OUT = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "docs", "images"));

const CUTS = [
  ["Arrival", [["Platform wide", 3, "Rain on an empty platform."], ["Ticket", 2, "\"One way, please.\""], ["Door", 3, "The train doors open."]]],
  ["Night train", [["Window", 3, "Her face over passing lights."], ["Hands", 2, "She turns the ticket over."], ["Station sign", 3, "The name is not on the map."]]],
];

async function api(page, route, body) {
  return postJson(page, route, body);
}

async function run() {
  checkRam("start");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  try {
    await waitForComfy(page);
    await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));

    const demo = await api(page, "/gonggan/project/create", { name: "Night Train" });
    const demoPid = demo.project?.id || demo.id || demo.pid;
    if (!demoPid) throw new Error(`no demo pid: ${JSON.stringify(demo).slice(0, 200)}`);
    createdProjectIds.push(demoPid);
    const empty = await api(page, "/gonggan/project/create", { name: "Empty project" });
    const emptyPid = empty.project?.id || empty.id || empty.pid;
    createdProjectIds.push(emptyPid);

    const flat = CUTS.flatMap(([, list]) => list);
    for (let i = 1; i < flat.length; i += 1) await api(page, "/gonggan/cut/add", { pid: demoPid });
    let tl = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(demoPid)}`)).data;
    if (tl.cuts.length !== flat.length) throw new Error(`expected ${flat.length} cuts, got ${tl.cuts.length}`);
    for (let i = 0; i < flat.length; i += 1) {
      const [nm, sec, cap] = flat[i];
      await api(page, "/gonggan/cut/update", { pid: demoPid, cut_id: tl.cuts[i].id, fields: { planned_sec: sec, caption: cap } });
      await api(page, "/gonggan/cut/rename", { pid: demoPid, cut_id: tl.cuts[i].id, name: nm });
    }
    tl = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(demoPid)}`)).data;
    let at = 0;
    const groups = CUTS.map(([name, list], gi) => {
      const ids = tl.cuts.slice(at, at + list.length).map((c) => c.id);
      at += list.length;
      return { id: `demo-scene-${gi + 1}`, name, cut_ids: ids, collapsed: false };
    });
    await api(page, "/gonggan/groups", { pid: demoPid, groups });
    const seedIds = [0, 1, 3, 4].map((i) => tl.cuts[i].id);
    execFileSync("python", [path.join(__dirname, "seed_demo_thumbs.py"), demoPid, ...seedIds], { stdio: "inherit" });
    const emptyTl = (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(emptyPid)}`)).data;
    await api(page, "/gonggan/cut/delete", { pid: emptyPid, cuts: emptyTl.cuts.map((c) => c.id) });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(2000);
    await openShotsTab(page);
    const root = ".gg-root.gg-shots";
    const pick = async (pid) => {
      await page.select(`${root} .gg-proj`, pid);
      await sleep(1500);
    };
    const shot = async (sel, file) => {
      const el = sel ? await page.$(sel) : null;
      if (sel && !el) throw new Error(`missing ${sel}`);
      const out = path.join(OUT, file);
      if (el) await el.screenshot({ path: out });
      else await page.screenshot({ path: out });
      return out;
    };

    await pick(emptyPid);
    const nEmpty = await page.$$eval(`${root} .gg-cut`, (e) => e.length);
    if (nEmpty !== 0) throw new Error(`empty project shows ${nEmpty} cuts`);
    const files = {};
    files.empty = await shot(root, "empty.png");

    await pick(demoPid);
    await page.waitForSelector(`${root} .gg-cut`, { timeout: 15000 });
    const nDemo = await page.$$eval(`${root} .gg-cut`, (e) => e.length);
    const nGroups = await page.$$eval(`${root} .gg-grp-sec[data-group-id]`, (e) => e.length);
    if (nDemo !== flat.length) throw new Error(`demo shows ${nDemo} cuts`);
    const titles = await page.$$eval(`${root} .gg-cut .gg-cut-title`, (e) => e.map((x) => x.textContent.trim()));
    if (JSON.stringify(titles) !== JSON.stringify(flat.map((f) => f[0]))) throw new Error(`cut names not shown: ${titles}`);
    const thumbs = await page.$$eval(`${root} .gg-cut img.gg-thumb`, (e) => e.filter((i) => i.naturalWidth > 0).length);
    if (thumbs !== seedIds.length) throw new Error(`expected ${seedIds.length} loaded thumbnails, got ${thumbs}`);
    const firstCut = await page.$(`${root} .gg-cut`);
    await firstCut.click({ offset: { x: 150, y: 10 } });
    await sleep(2500);
    const tlm = await page.evaluate(() => {
      const el = document.querySelector(".gg-timeline");
      const r = el?.getBoundingClientRect();
      return { visible: !!(el && el.offsetParent), h: r ? Math.round(r.height) : 0, clips: document.querySelectorAll(".gg-timeline .gg-clip").length };
    });
    if (!tlm.visible || tlm.h < 150) throw new Error(`timeline not visible: ${JSON.stringify(tlm)}`);
    files.shots = await shot(root, "shots.png");
    files.overview = await shot(null, "overview.png");
    files.timeline = await shot(".gg-timeline", "timeline.png");

    const report = {};
    const seen = new Map();
    for (const [k, f] of Object.entries(files)) {
      const buf = fs.readFileSync(f);
      const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
      if (buf.length < 10000) throw new Error(`${k} too small: ${buf.length}`);
      if (seen.has(hash)) throw new Error(`${k} identical to ${seen.get(hash)}`);
      seen.set(hash, k);
      report[k] = { bytes: buf.length, sha256_12: hash };
    }
    console.log("PASS  screenshots written (NOT visually checked): " + JSON.stringify({ cuts: nDemo, groupsNodes: nGroups, titles, thumbs, timeline: tlm, files: report }));
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
    console.log(`SKIP  readme shots: ${err.message}`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});