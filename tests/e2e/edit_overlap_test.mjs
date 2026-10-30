/**
 * Overlapping /gonggan/edit saves: an OLD reply (held 2.5 s) must not overwrite a newer local trim,
 * and the server must end up with the newest trim. ZZ-test- projects only. Blocks POST /prompt and /gonggan/regen.
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
const TEST_PREFIX = "ZZ-test-edit-overlap";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-shots-${runStamp}`);
const createdProjectIds = [];
const delayRule = { armed: false, ms: 2500, releasedAt: 0, held: 0 };
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
    if (delayRule.armed && method === "POST" && new URL(url).pathname.endsWith("/gonggan/edit")) {
      // Let the server apply the add NOW, but hold the response back (a slow reply that lands after a project switch).
      delayRule.armed = false; delayRule.held += 1;
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



async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  try {
    await waitForComfy(page);
    await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));
    const a = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-${runStamp}` });
    const pid = a.project.id;
    createdProjectIds.push(pid);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(1500);
    await openShotsTab(page);
    const sel = ".gg-root.gg-shots .gg-proj";
    await page.waitForFunction((p) => [...document.querySelectorAll(".gg-root.gg-shots .gg-proj option")].some((o) => o.value === p), { timeout: 15000 }, pid);
    await page.select(sel, pid);
    await page.waitForSelector(".gg-timeline .gg-clip .gg-edge[data-side='r']", { timeout: 15000 });

    const tlNow = async () => (await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`)).data;
    const srvSec = async () => (await tlNow()).cuts[0].sec;
    const ownSec0 = (await tlNow()).cuts[0].tl_sec;
    const clipSec = () => page.$eval(".gg-timeline .gg-clip .gg-clip-dur", (e) => parseFloat(e.textContent));
    const drag = async (dx) => {
      const box = await (await page.$(".gg-timeline .gg-clip .gg-edge[data-side='r']")).boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y, { steps: 3 });
      await page.mouse.move(x + dx, y, { steps: 3 });
      await page.mouse.up();
    };
    const sec0 = await clipSec();

    // 1) first trim: its reply is held 2.5 s; a second trim is made while it is in flight
    delayRule.armed = true; delayRule.releasedAt = 0; delayRule.held = 0;
    await drag(70);
    const sec1 = await clipSec();
    if (sec1 === sec0) throw new Error(`test setup: first drag did not change the clip (${sec0})`);
    const t0 = Date.now();
    while (!delayRule.held && Date.now() - t0 < 5000) await sleep(50);
    if (!delayRule.held) throw new Error("first /gonggan/edit was never sent");
    await drag(70);
    const sec2 = await clipSec();
    if (sec2 === sec1) throw new Error(`test setup: second drag did not change the clip (${sec1})`);
    // wait for the held reply and the follow-up save
    const t1 = Date.now();
    while (!delayRule.releasedAt && Date.now() - t1 < 8000) await sleep(100);
    await sleep(3500);
    const shown = await clipSec();
    const srv = await srvSec();
    if (Math.abs(shown - sec2) > 0.051) throw new Error(`old reply overwrote the newer trim: shown ${shown}, newest local ${sec2}`);
    if (Math.abs(srv - sec2) > 0.051) throw new Error(`server did not end with the newest trim: server ${srv}, newest local ${sec2}`);
    console.log(`PASS  overlapping trim saves: panel ${shown}s and server ${srv}s both end at the newest trim (${sec0} -> ${sec1} -> ${sec2})`);
    if ((await tlNow()).cuts[0].tl_sec !== ownSec0) throw new Error("a timeline trim changed the cut's own length");
    console.log("PASS  timeline trim leaves the cut's own length alone");

    // 2) 0.9.78: the timeline is independent of the Shots cut list
    const row = (t, id) => t.cuts.find((c) => c.id === id);
    const ids = (t) => t.cuts.map((c) => c.id).join();
    await postJson(page, "/gonggan/cut/add", { pid });
    await page.click(".gg-timeline .gg-reload");
    await page.waitForFunction(() => document.querySelectorAll(".gg-timeline .gg-track .gg-clip").length === 2, { timeout: 15000 });
    let tl = await tlNow();
    const [c1, c2] = tl.cuts.map((c) => c.id);
    const dragClipBy = async (id, dx) => {
      const b = await (await page.$(`.gg-timeline .gg-clip[data-cut-id="${id}"]`)).boundingBox();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y, { steps: 4 });
      await page.mouse.move(x + dx, y, { steps: 4 });
      await page.mouse.up();
      await sleep(1500); // 400 ms save debounce + request
    };
    await dragClipBy(c2, 120);
    tl = await tlNow();
    const gap = row(tl, c2).start - (row(tl, c1).start + row(tl, c1).sec);
    if (!(gap > 0.2)) throw new Error(`moving a clip right should leave a gap (gap ${gap})`);
    if (Math.abs(tl.total_sec - (row(tl, c2).start + row(tl, c2).sec)) > 0.011) throw new Error(`total ${tl.total_sec} must include the gap`);
    if (ids(tl) !== [c1, c2].join()) throw new Error("a timeline move reordered the cut list");
    console.log(`PASS  free move: ${gap.toFixed(2)}s gap kept, total ${tl.total_sec}s, cut list unchanged`);

    const trackX = (await (await page.$(".gg-timeline .gg-track")).boundingBox()).x;
    const b2 = await (await page.$(`.gg-timeline .gg-clip[data-cut-id="${c2}"]`)).boundingBox();
    await dragClipBy(c2, trackX + 2 - b2.x);
    tl = await tlNow();
    if (tl.track_order.join() !== [c2, c1].join()) throw new Error(`drop over clip 1 should insert before it: ${tl.track_order.join()}`);
    if (row(tl, c1).start < row(tl, c2).start + row(tl, c2).sec - 0.011) throw new Error("clips overlap after the drop");
    if (ids(tl) !== [c1, c2].join()) throw new Error("a timeline reorder changed the cut list");
    if (row(tl, c1).number !== 1 || row(tl, c2).number !== 2) throw new Error("a timeline reorder renumbered the cuts");
    console.log("PASS  drop over another clip inserts before it and pushes it; cut list and numbers unchanged");

    await page.click(`.gg-timeline .gg-clip[data-cut-id="${c2}"]`, { button: "right" });
    await clickCtxItem(page, "Apply order to cuts");
    await page.waitForSelector(".gg-confirm-dialog", { timeout: 8000 });
    const title = await page.$eval(".gg-confirm-title", (e) => e.textContent);
    if (title !== "Cut numbers will be renumbered. Continue?") throw new Error(`apply order confirm: ${title}`);
    await page.click(".gg-confirm-ok");
    await sleep(1200);
    tl = await tlNow();
    if (ids(tl) !== [c2, c1].join()) throw new Error(`Apply order to cuts: cut list ${ids(tl)}`);
    if (tl.track_order.join() !== [c2, c1].join()) throw new Error("Apply order to cuts changed the timeline");
    console.log("PASS  Apply order to cuts: cut list follows the timeline, timeline unchanged");

    await page.click(".gg-timeline .gg-reset");
    await page.waitForSelector(".gg-confirm-dialog", { timeout: 8000 });
    await page.click(".gg-confirm-ok");
    await sleep(1200);
    tl = await tlNow();
    if (tl.track_order.join() !== ids(tl)) throw new Error("Reset: timeline order should follow the cut list");
    if (row(tl, c2).start !== 0 || Math.abs(row(tl, c1).start - row(tl, c2).sec) > 0.011) throw new Error("Reset: clips should be packed with no gaps");
    if (tl.cuts.some((c) => c.in !== 0)) throw new Error("Reset: trims should be cleared");
    if (Math.abs(row(tl, c1).sec - ownSec0) > 0.011) throw new Error(`Reset: clip 1 should be back to ${ownSec0}s (got ${row(tl, c1).sec})`);
    console.log("PASS  timeline Reset (native): cut list order, original lengths, no gaps");
    console.log("PASS  edit overlap e2e complete");
  } finally {
    try { await cleanupProjects(page); } catch (_) {}
    await browser.close();
    try { fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}
run().catch((e) => { console.error(e); process.exit(1); });