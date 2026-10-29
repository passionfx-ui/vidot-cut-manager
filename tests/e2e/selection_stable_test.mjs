/**
 * Headless Chrome (0.9.97): the Shots cut list does not move when the selection changes.
 * A ZZ-test project with 16 empty cuts, list scrolled to the middle. For 0 -> 1 -> 2 selected, × back to
 * the current cut, and a click on a partly visible row: the list box (top, bottom, clientHeight), its
 * scrollTop, the selection bar height and the status panel height stay the same. The bar stays shown
 * with class `gg-selbar` only, Group/Ungroup disabled at 0; the status panel shows the cut /
 * "2 cuts selected" and the Queue button (none in the header). Clicks use mouse coordinates (no
 * automatic scroll into view).
 * POST /prompt and /gonggan/regen are blocked (nothing is queued).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { shotWorkflowRelPathById } from "../../web/gg_shot_names.js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-selection-stable";
const CUT_COUNT = 16;
const BLOCKED_POST = [/\/prompt(\?|$)/, /\/api\/prompt(\?|$)/, /\/gonggan\/regen(\?|$)/, /\/api\/gonggan\/regen(\?|$)/];

const runStamp = Date.now();
const USER_DATA_DIR = path.join(os.tmpdir(), `gg-selection-stable-${runStamp}`);
const createdProjectIds = [];
let blockedAttempts = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freeComfyMemory() {
  try {
    await fetch(`${BASE}/free`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
  } catch (_) {}
  await sleep(4000);
}

async function checkRam(label) {
  if (os.freemem() >= MIN_RAM) return;
  await freeComfyMemory();
  const free = os.freemem();
  if (free < MIN_RAM) {
    const err = new Error(`RAM check failed (${label}): ${Math.round(free / 1e9)} GB free, need 40+ GB`);
    err.skipped = true;
    throw err;
  }
}

const matchesAny = (list, url) => {
  try {
    const p = new URL(url).pathname;
    return list.some((re) => re.test(p));
  } catch {
    return false;
  }
};

function attachRequestGuard(page) {
  page.on("request", (req) => {
    if (req.method() === "POST" && matchesAny(BLOCKED_POST, req.url())) {
      blockedAttempts += 1;
      console.error(`BLOCKED UNSAFE POST: ${req.url()}`);
      req.abort("blockedbyclient");
      return;
    }
    req.continue();
  });
}

async function getJson(page, route) {
  return page.evaluate(async (r) => {
    const res = await fetch(`${location.origin}${r}`);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }, route);
}

async function postJson(page, route, body) {
  return page.evaluate(async (r, b) => {
    const res = await fetch(`${location.origin}${r}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  }, route, body);
}

async function fetchWorkflowPaths(page) {
  const { data } = await getJson(page, "/api/userdata?dir=workflows&recurse=true&split=false");
  if (Array.isArray(data)) {
    return data.map((x) => (typeof x === "string" ? x : x.path || x.name || "")).filter(Boolean).map((p) => String(p).replace(/^\/+/, ""));
  }
  if (data && typeof data === "object") return Object.keys(data);
  return [];
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
  await sleep(1500);
}

async function openShotsTab(page) {
  const opened = await page.evaluate(() => {
    const st = window.app?.extensionManager?.sidebarTab;
    if (!st) return false;
    st.activeSidebarTabId = "gg-shots";
    return true;
  });
  if (!opened) await (await page.waitForSelector('[aria-label="Shots list"]', { timeout: 15000 })).click();
  await page.waitForSelector(".gg-root.gg-shots", { timeout: 60000 });
}

async function selectProject(page, pid) {
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") await globalThis.__gongganReloadShotsData();
    await new Promise((r) => setTimeout(r, 400));
  });
  await page.waitForSelector(`.gg-root.gg-shots .gg-proj option[value="${pid}"]`, { timeout: 30000 });
  for (let i = 0; i < 12; i++) {
    await page.select(".gg-root.gg-shots .gg-proj", pid);
    await sleep(600);
    if ((await page.$eval(".gg-root.gg-shots .gg-proj", (el) => el.value)) === pid) break;
  }
}

/** List box, scroll, bar and panel geometry plus what the bar / panel show. */
async function measure(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".gg-root.gg-shots");
    const wrap = root.querySelector(".gg-grp-wrap");
    const bar = root.querySelector(".gg-selbar");
    const panel = root.querySelector(":scope > .gg-cutpanel");
    const w = wrap.getBoundingClientRect();
    const queue = panel?.querySelector(".gg-queue-btn");
    const info = panel?.querySelector(".gg-sp-info");
    const inside = (el, box) => {
      if (!el || !box) return false;
      const a = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
    };
    return {
      clipped: [
        ...(info && info.scrollHeight > info.clientHeight + 1 ? ["status info"] : []),
        ...(inside(queue, panel) ? [] : ["Queue button"]),
        ...[...bar.querySelectorAll(".gg-btn")].filter((b) => !inside(b, bar)).map((b) => b.className),
      ],
      listTop: w.top,
      listBottom: w.bottom,
      listHeight: wrap.clientHeight,
      scrollTop: wrap.scrollTop,
      barHeight: bar.getBoundingClientRect().height,
      panelHeight: panel ? panel.getBoundingClientRect().height : -1,
      barShown: bar.getClientRects().length > 0 && getComputedStyle(bar).visibility !== "hidden",
      barClass: bar.className,
      count: parseInt(bar.querySelector(".gg-sel-count")?.textContent || "-1", 10),
      groupDisabled: !!bar.querySelector(".gg-sel-group")?.disabled,
      ungroupDisabled: !!bar.querySelector(".gg-sel-ungroup")?.disabled,
      info: panel?.querySelector(".gg-sp-info")?.textContent.replace(/\s+/g, " ").trim() || "",
      queueText: queue?.textContent.trim() || "",
      queueDisabled: !!queue?.disabled,
      queueInHead: !!root.querySelector(".gg-head .gg-queue-btn, .gg-head .gg-render-btn, .gg-head .gg-render-row"),
    };
  });
}

const STABLE_KEYS = ["listTop", "listBottom", "listHeight", "scrollTop", "barHeight", "panelHeight"];

function assertStable(base, now, label) {
  if (now.clipped.length) throw new Error(`${label}: clipped by the fixed height: ${now.clipped.join(", ")}`);
  const moved = STABLE_KEYS.filter((k) => Math.abs(now[k] - base[k]) > 0.5);
  if (moved.length) {
    throw new Error(`${label}: ${moved.map((k) => `${k} ${base[k]} -> ${now[k]}`).join(", ")}`);
  }
}

/**
 * Cut rows by visibility inside the list: `full` fully inside, `partBottom` cut off by the list bottom.
 * Points are viewport coordinates for a mouse click on the visible part of the row.
 */
async function rowsInView(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    const w = wrap.getBoundingClientRect();
    const out = { full: [], partBottom: [] };
    for (const li of wrap.querySelectorAll(".gg-cut[data-cut-id]")) {
      const r = li.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 140);
      if (r.top >= w.top && r.bottom <= w.bottom) out.full.push({ id: li.dataset.cutId, x, y: r.top + r.height / 2 });
      else if (r.top < w.bottom - 10 && r.bottom > w.bottom) out.partBottom.push({ id: li.dataset.cutId, x, y: (r.top + w.bottom) / 2 });
    }
    return out;
  });
}

async function clickAt(page, pt, { ctrl = false } = {}) {
  if (ctrl) await page.keyboard.down("Control");
  try {
    await page.mouse.click(pt.x, pt.y);
  } finally {
    if (ctrl) await page.keyboard.up("Control");
  }
  await sleep(700);
}

async function cleanup(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    const dir = path.posix.dirname(shotWorkflowRelPathById({ projectId: pid, cutId: "x" })) + "/";
    try {
      for (const p of await fetchWorkflowPaths(page)) {
        if (!p.startsWith(dir)) continue;
        await page.evaluate(async (rel) => {
          await fetch(`${location.origin}/api/userdata/${encodeURIComponent("workflows/" + rel)}`, { method: "DELETE" });
        }, p);
      }
      await page.evaluate(async (d) => {
        await fetch(`${location.origin}/api/userdata/${encodeURIComponent("workflows/" + d.replace(/\/$/, ""))}`, { method: "DELETE" });
      }, dir);
    } catch (e) {
      console.warn(`workflow cleanup ${pid}:`, e.message);
    }
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup ${pid}:`, e.message);
    }
  }
}

async function main() {
  try {
    await checkRam("startup");
  } catch (e) {
    if (e.skipped) {
      console.log(`SKIP: ${e.message}`);
      process.exit(0);
    }
    throw e;
  }
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: USER_DATA_DIR,
    protocolTimeout: 240000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  try {
    await waitForComfy(page);
    await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));
    await openShotsTab(page);

    const created = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX} ${runStamp}` });
    const pid = created.project.id;
    createdProjectIds.push(pid);
    for (let i = 1; i < CUT_COUNT; i++) await postJson(page, "/gonggan/cut/add", { pid });
    await selectProject(page, pid);
    await page.waitForFunction(
      (n) => document.querySelectorAll(".gg-root.gg-shots .gg-cut[data-cut-id]").length === n,
      { timeout: 30000 },
      CUT_COUNT
    );
    await sleep(1500);

    // Scroll to the middle and leave one row cut off by the list bottom.
    const scrollable = await page.evaluate(() => {
      const w = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
      w.scrollTop = Math.round((w.scrollHeight - w.clientHeight) / 2);
      return w.scrollHeight - w.clientHeight;
    });
    if (scrollable < 100) throw new Error(`cut list should scroll (overflow ${scrollable}px)`);
    let rows = await rowsInView(page);
    for (let i = 0; i < 8 && !rows.partBottom.length; i++) {
      await page.evaluate(() => { document.querySelector(".gg-root.gg-shots .gg-grp-wrap").scrollTop += 23; });
      rows = await rowsInView(page);
    }
    if (rows.full.length < 3 || !rows.partBottom.length) throw new Error(`need 3 fully and 1 partly visible rows: ${JSON.stringify(rows)}`);
    await sleep(400);

    const m0 = await measure(page);
    assertStable(m0, m0, "0 selected");
    if (!m0.barShown || m0.barClass !== "gg-selbar" || m0.count !== 0 || !m0.groupDisabled || !m0.ungroupDisabled) {
      throw new Error(`0 selected: bar must be shown with Group/Ungroup disabled: ${JSON.stringify(m0)}`);
    }
    if (m0.info !== "No cut selected" || m0.queueText !== "Queue" || !m0.queueDisabled || m0.queueInHead) {
      throw new Error(`0 selected: status panel / Queue: ${JSON.stringify(m0)}`);
    }
    console.log(`PASS  0 selected: bar shown (Group/Ungroup off), status panel "No cut selected" + Queue off; list h=${m0.listHeight} scrollTop=${m0.scrollTop}`);

    await clickAt(page, rows.full[1]);
    const m1 = await measure(page);
    assertStable(m0, m1, "1 selected");
    if (m1.count !== 1 || m1.groupDisabled || m1.barClass !== "gg-selbar" || m1.queueDisabled || !m1.info || m1.info === "No cut selected") {
      throw new Error(`1 selected: ${JSON.stringify(m1)}`);
    }
    console.log(`PASS  1 selected: list box, scrollTop, bar and panel heights unchanged; panel "${m1.info}", Queue on`);

    await clickAt(page, rows.full[2], { ctrl: true });
    const m2 = await measure(page);
    assertStable(m0, m2, "2 selected");
    if (m2.count !== 2 || m2.info !== "2 cuts selected" || m2.queueDisabled) throw new Error(`2 selected: ${JSON.stringify(m2)}`);
    console.log('PASS  2 selected: nothing moved; panel "2 cuts selected", Queue on');

    const x = await (await page.$(".gg-root.gg-shots .gg-sel-x")).boundingBox();
    await clickAt(page, { x: x.x + x.width / 2, y: x.y + x.height / 2 });
    const m3 = await measure(page);
    assertStable(m0, m3, "× (multi-selection cleared)");
    if (m3.count !== 1 || !m3.barShown || m3.barClass !== "gg-selbar" || m3.info === "2 cuts selected") {
      throw new Error(`× should leave just the current cut: ${JSON.stringify(m3)}`);
    }
    console.log("PASS  × clears the multi-selection (current cut stays): nothing moved");

    await clickAt(page, rows.partBottom[0]);
    const m4 = await measure(page);
    assertStable(m0, m4, "click on a partly visible row");
    if (m4.count !== 1 || m4.info === m3.info) throw new Error(`partly visible row not selected: ${JSON.stringify(m4)}`);
    console.log("PASS  click on a partly visible row: selected, list not scrolled");

    await checkRam("end");
  } finally {
    try {
      await cleanup(page);
    } catch (_) {}
    await browser.close().catch(() => {});
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
  if (blockedAttempts > 0) throw new Error(`Unsafe POST (${blockedAttempts})`);
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
