/**
 * Headless Chrome: horizontal version row directly below the borderless Shots icon row (0.9.109);
 * icons right-aligned, Queue right-aligned in the status panel.
 * - selected cut's versions, newest on the left; scrolls sideways (also with the mouse wheel);
 *   a left arrow appears when scrolled and goes back to the newest
 * - thumbnail click = existing version click (opens that version's workflow, Best unchanged)
 * - header Best (on the selected thumbnail) and right-click "Set as Best" use the existing pick (POST /gonggan/edit);
 *   Best = highlighted border, no icons on thumbnails; else latest is current
 * - video length label bottom-right (0:06), missing file = no-media placeholder, cut without versions
 * Uses its own ZZ-test- project (POST /gonggan/project/create, deleted at the end); versions are synthetic
 * gradient PNGs added by seed_demo_thumbs.py. Only this project's timeline / one version workflow are mocked.
 * Does not restart ComfyUI. Blocks POST /prompt, /api/prompt and /gonggan/regen.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { shotWorkflowRelPathById } from "../../web/gg_shot_names.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const PYTHON = process.env.GG_PYTHON || "python";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-vstrip";
const SEED_COUNT = 16;
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];
const ROOT = ".gg-root.gg-shots";
const STRIP = `${ROOT} .gg-vstrip`;

const runStamp = Date.now();
const USER_DATA_DIR = path.join(os.tmpdir(), `gg-vstrip-${runStamp}`);
const createdProjectIds = [];
/** pid -> timeline payload served instead of the real one */
const timelineMocks = new Map();
/** vid -> workflow served for /gonggan/version-workflow */
const versionWfMocks = new Map();
const editPosts = [];
const versionWfGets = [];
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
    return BLOCKED_POST.some((re) => re.test(new URL(url).pathname));
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
    let u = null;
    try {
      u = new URL(url);
    } catch (_) {}
    if (u && method === "POST" && /gonggan\/edit$/.test(u.pathname)) {
      let body = null;
      try {
        body = JSON.parse(req.postData() || "null");
      } catch (_) {}
      editPosts.push(body);
    }
    if (u && method === "GET") {
      const pid = u.searchParams.get("pid");
      if (/gonggan\/timeline$/.test(u.pathname) && pid && timelineMocks.has(pid)) {
        req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(timelineMocks.get(pid)) });
        return;
      }
      const vid = u.searchParams.get("vid");
      if (/gonggan\/version-workflow$/.test(u.pathname) && vid) {
        versionWfGets.push(vid);
        if (versionWfMocks.has(vid)) {
          const body = JSON.stringify({ ok: true, workflow: versionWfMocks.get(vid), prompt: null, source: "stored", kind: "ui" });
          req.respond({ status: 200, contentType: "application/json", body });
          return;
        }
      }
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
    if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }, route, body);
}

async function realTimeline(page, pid) {
  return page.evaluate(async (p) => {
    const res = await fetch(`${location.origin}/gonggan/timeline?pid=${encodeURIComponent(p)}&_=${Date.now()}`, { cache: "no-store" });
    return res.json();
  }, pid);
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
  if (!opened) await (await page.waitForSelector('[aria-label="Vidot Studio – Cut Manager"]', { timeout: 15000 })).click();
  await page.waitForSelector(ROOT, { timeout: 60000 });
}

async function reloadAndSelectProject(page, pid) {
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") await globalThis.__gongganReloadShotsData();
  });
  await page.waitForFunction(
    (r, p) => [...(document.querySelector(`${r} .gg-proj`)?.options || [])].some((o) => o.value === p),
    { timeout: 20000 },
    ROOT,
    pid
  );
  await page.select(`${ROOT} .gg-proj`, pid);
  await sleep(600);
}

async function clickCut(page, cutId) {
  const sel = `${ROOT} .gg-cut[data-cut-id="${cutId}"]`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
}

async function stripState(page) {
  return page.evaluate((s) => {
    const strip = document.querySelector(s);
    const list = strip?.querySelector(".gg-vs-list");
    return {
      ids: [...(list?.querySelectorAll(".gg-ver-wrap") || [])].map((w) => w.dataset.vid),
      items: Object.fromEntries(
        [...(list?.querySelectorAll(".gg-ver-wrap") || [])].map((w) => [
          w.dataset.vid,
          {
            best: w.classList.contains("gg-rep"),
            latest: w.classList.contains("gg-implicit"),
            open: w.classList.contains("gg-ver-open"),
            bestBorder: w.classList.contains("gg-vs-best"),
            sel: w.classList.contains("gg-vs-sel"),
            icons: w.querySelectorAll("button, .gg-vs-star").length,
            dur: w.querySelector(".gg-vs-dur:not([hidden])")?.textContent || "",
            empty: !!w.querySelector(".gg-thumb-empty"),
          },
        ])
      ),
      empty: list?.querySelector(".gg-vs-empty")?.textContent || "",
      scrollLeft: list?.scrollLeft ?? -1,
      newestShown: !!strip && !strip.querySelector(".gg-vs-newest")?.hidden,
    };
  }, STRIP);
}

async function waitStrip(page, fn, arg, label) {
  try {
    await page.waitForFunction(fn, { timeout: 15000 }, STRIP, arg);
  } catch (e) {
    throw new Error(`${label}: ${JSON.stringify(await stripState(page))}`);
  }
}

async function clickCtxItem(page, label) {
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  for (const it of await page.$$(".gg-ctx-item")) {
    if ((await page.evaluate((n) => n.textContent?.trim(), it)) === label) {
      const disabled = await page.evaluate((n) => n.disabled, it);
      if (disabled) throw new Error(`${label} is disabled`);
      await it.click();
      return;
    }
  }
  throw new Error(`Context menu item not found: ${label}`);
}

async function ctxItemDisabled(page, label) {
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  return page.evaluate((l) => {
    const it = [...document.querySelectorAll(".gg-ctx-item")].find((n) => n.textContent?.trim() === l);
    return it ? it.disabled : null;
  }, label);
}

async function waitServerPick(page, pid, cutId, vid) {
  for (let i = 0; i < 40; i++) {
    const tl = await realTimeline(page, pid);
    if (tl?.cuts?.find((c) => c.id === cutId)?.pick === vid) return;
    await sleep(250);
  }
  throw new Error(`server pick is not ${vid}`);
}

async function cleanup(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    const dir = path.posix.dirname(shotWorkflowRelPathById({ projectId: pid, cutId: "x" })) + "/";
    try {
      const { data } = await getJson(page, "/api/userdata?dir=workflows&recurse=true&split=false");
      const paths = Array.isArray(data)
        ? data.map((x) => (typeof x === "string" ? x : x.path || x.name || ""))
        : Object.keys(data || {});
      for (const p of paths.map((x) => String(x).replace(/^\/+/, "")).filter((x) => x.startsWith(dir))) {
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
    checkRam("startup");
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
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  try {
    await waitForComfy(page);
    await openShotsTab(page);

    const created = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX} ${runStamp}` });
    const pid = created.project?.id || created.id || created.pid;
    if (!pid) throw new Error(`no pid: ${JSON.stringify(created).slice(0, 200)}`);
    createdProjectIds.push(pid);
    await postJson(page, "/gonggan/cut/add", { pid });
    let tl = await realTimeline(page, pid);
    if (tl?.cuts?.length !== 2) throw new Error(`expected 2 cuts, got ${tl?.cuts?.length}`);
    const [cutA, cutB] = tl.cuts.map((c) => c.id);
    execFileSync(PYTHON, [path.join(__dirname, "seed_demo_thumbs.py"), pid, ...Array(SEED_COUNT).fill(cutA)], { stdio: "inherit" });
    tl = await realTimeline(page, pid);
    const serverVers = tl.cuts.find((c) => c.id === cutA).versions_list.map((v) => v.id);
    if (serverVers.length !== SEED_COUNT) throw new Error(`expected ${SEED_COUNT} versions, got ${serverVers.length}`);
    if (tl.cuts.find((c) => c.id === cutA).pick) throw new Error("seeding must not set a Best");

    await reloadAndSelectProject(page, pid);
    await clickCut(page, cutA);

    // 1. layout + order: row directly above the icon row, full width, newest on the left, latest is current, no Best
    await waitStrip(page, (s, n) => document.querySelectorAll(`${s} .gg-ver-wrap`).length === n, SEED_COUNT, "row did not show the versions");
    const geo = await page.evaluate((r, s) => {
      const box = (el) => el.getBoundingClientRect();
      const root = box(document.querySelector(r));
      const list = box(document.querySelector(`${r} .gg-grp-wrap`));
      const strip = box(document.querySelector(`${r} .gg-vstrip`));
      const iconEl = document.querySelector(`${r} .gg-iconrow`);
      const icons = box(iconEl);
      const iconCss = getComputedStyle(iconEl);
      const lastIcon = box(document.querySelector(`${r} .gg-iconrow .gg-ir-del`));
      const firstIcon = box(document.querySelector(`${r} .gg-iconrow .gg-ir-scene`));
      const ver = box(document.querySelector(`${r} .gg-iconrow .gg-version`));
      const btnBorders = [...iconEl.querySelectorAll(".gg-ir-btn")].map((b) => getComputedStyle(b).borderTopWidth);
      const panel = box(document.querySelector(`${r} .gg-cutpanel`));
      const queue = box(document.querySelector(`${r} .gg-queue-btn`));
      const thumbs = [...document.querySelectorAll(`${s} .gg-ver-wrap`)].slice(0, 3).map((w) => box(w));
      return {
        stripTop: strip.top, stripBottom: strip.bottom, stripLeft: strip.left, stripWidth: strip.width, stripHeight: strip.height,
        iconTop: icons.top, iconBottom: icons.bottom, iconRightGap: icons.right - lastIcon.right, iconLeftOfIcons: firstIcon.left - ver.right,
        iconBorder: iconCss.borderTopWidth, iconBg: iconCss.backgroundColor, btnBorders,
        panelTop: panel.top, queueRightGap: panel.right - queue.right, queueLeft: queue.left - panel.left,
        listBottom: list.bottom, rootLeft: root.left, rootWidth: root.width,
        sameLine: thumbs.every((t) => Math.abs(t.top - thumbs[0].top) < 1),
        leftToRight: thumbs.every((t, i) => !i || t.left >= thumbs[i - 1].right),
        thumbs: thumbs.map((t) => [Math.round(t.left), Math.round(t.right)]),
      };
    }, ROOT, STRIP);
    if (Math.abs(geo.iconBottom - geo.stripTop) > 2) throw new Error(`row not directly below the icon row: ${JSON.stringify(geo)}`);
    if (geo.listBottom > geo.iconTop + 2) throw new Error(`icon row overlaps the cut list: ${JSON.stringify(geo)}`);
    if (Math.abs(geo.stripBottom - geo.panelTop) > 2) throw new Error(`status panel not right below the row: ${JSON.stringify(geo)}`);
    if (geo.iconRightGap < 0 || geo.iconRightGap > 12 || geo.iconLeftOfIcons < 20) throw new Error(`icons not right-aligned: ${JSON.stringify(geo)}`);
    if (geo.iconBorder !== "0px" || !/rgba\(0, 0, 0, 0\)|transparent/.test(geo.iconBg) || geo.btnBorders.some((w) => w !== "0px")) {
      throw new Error(`icon row not borderless: ${JSON.stringify(geo)}`);
    }
    if (geo.queueRightGap < 0 || geo.queueRightGap > 16 || geo.queueLeft < 40) throw new Error(`Queue not right-aligned: ${JSON.stringify(geo)}`);
    if (Math.abs(geo.stripLeft - geo.rootLeft) > 2 || Math.abs(geo.stripWidth - geo.rootWidth) > 2) throw new Error(`row not full width: ${JSON.stringify(geo)}`);
    if (geo.stripHeight > 110) throw new Error(`row too tall: ${geo.stripHeight}`);
    if (!geo.sameLine || !geo.leftToRight) throw new Error(`thumbnails not in one horizontal line without overlap: ${JSON.stringify(geo)}`);
    let st = await stripState(page);
    if (JSON.stringify(st.ids) !== JSON.stringify(serverVers)) throw new Error(`order differs from server (newest first = left): ${JSON.stringify(st.ids)}`);
    const created_ = tl.cuts.find((c) => c.id === cutA).versions_list.map((v) => v.created);
    if (created_.some((t, i) => i && t > created_[i - 1])) throw new Error(`server list not newest first: ${created_}`);
    if (!st.items[serverVers[0]].latest || Object.values(st.items).some((x) => x.best || x.bestBorder || x.icons)) {
      throw new Error(`expected newest = current, no Best: ${JSON.stringify(st.items)}`);
    }
    console.log(`PASS  layout: borderless icon row (icons right-aligned), ${Math.round(geo.stripWidth)}x${Math.round(geo.stripHeight)} row directly below it, Queue right-aligned; ${SEED_COUNT} versions newest on the left; latest current, no Best`);

    // 2. horizontal scroll (wheel + scrollbar) + left arrow back to the newest
    if (st.newestShown) throw new Error("left arrow shown at the newest");
    const box = await page.evaluate((s, r) => {
      const l = document.querySelector(`${s} .gg-vs-list`);
      return { client: l.clientWidth, scroll: l.scrollWidth, vClient: l.clientHeight, vScroll: l.scrollHeight, root: document.querySelector(r).clientWidth };
    }, STRIP, ROOT);
    if (!(box.scroll > box.client) || box.client > box.root) throw new Error(`row not scrollable sideways / not bounded: ${JSON.stringify(box)}`);
    if (box.vScroll > box.vClient + 1) throw new Error(`row should not scroll vertically: ${JSON.stringify(box)}`);
    await page.hover(`${STRIP} .gg-vs-list`);
    await page.mouse.wheel({ deltaY: 300 });
    await waitStrip(page, (s) => document.querySelector(`${s} .gg-vs-list`).scrollLeft > 20, null, "vertical wheel did not scroll the row sideways");
    await page.evaluate((s) => {
      const l = document.querySelector(`${s} .gg-vs-list`);
      l.scrollLeft = l.scrollWidth;
    }, STRIP);
    await waitStrip(page, (s) => !document.querySelector(`${s} .gg-vs-newest`).hidden, null, "left arrow not shown after scrolling");
    st = await stripState(page);
    if (st.scrollLeft < 20) throw new Error(`row did not scroll (${st.scrollLeft}); not enough versions to overflow?`);
    await page.click(`${STRIP} .gg-vs-newest`);
    await waitStrip(page, (s) => document.querySelector(`${s} .gg-vs-list`).scrollLeft === 0 && document.querySelector(`${s} .gg-vs-newest`).hidden, null, "left arrow did not return to the newest");
    console.log(`PASS  scroll: wheel scrolls sideways; left arrow appears at scrollLeft ${st.scrollLeft}, click returns to the newest and hides it`);

    // 3. thumbnail click = existing version click (opens that version's workflow), Best unchanged
    const vOpen = serverVers[1];
    versionWfMocks.set(vOpen, {
      last_node_id: 1, last_link_id: 0, links: [], groups: [], config: {}, extra: {}, version: 0.4,
      nodes: [{ id: 1, type: "Note", pos: [0, 0], size: [240, 80], flags: {}, order: 0, mode: 0, properties: {}, widgets_values: [`ZZ vstrip ${runStamp}`] }],
    });
    await sleep(1500);
    const editsBefore = editPosts.length;
    await page.click(`${STRIP} .gg-ver-wrap[data-vid="${vOpen}"] > .gg-ver`);
    await page.waitForFunction(
      (m) => (window.app.graph?._nodes || []).some((n) => (n.widgets_values || []).includes(m)),
      { timeout: 30000 },
      `ZZ vstrip ${runStamp}`
    );
    await waitStrip(page, (s, v) => document.querySelector(`${s} .gg-ver-wrap[data-vid="${v}"]`)?.classList.contains("gg-ver-open"), vOpen, "clicked version not marked open");
    const vNoWf = serverVers[2];
    await page.click(`${STRIP} .gg-ver-wrap[data-vid="${vNoWf}"] > .gg-ver`);
    await page.waitForFunction(
      () => (document.getElementById("gg-toast-host")?.textContent || "").includes("No workflow saved for this version."),
      { timeout: 15000 }
    );
    if (!versionWfGets.includes(vOpen) || !versionWfGets.includes(vNoWf)) throw new Error(`version workflow not requested: ${versionWfGets}`);
    if (editPosts.length !== editsBefore) throw new Error("thumbnail click posted an edit (Best must not change)");
    st = await stripState(page);
    if (Object.values(st.items).some((x) => x.best)) throw new Error("thumbnail click set a Best");
    console.log("PASS  click: opens that version's workflow (marked open), no-workflow version shows the existing toast, no pick change");

    // 4. header Best = toggles Best on the selected thumbnail (existing pick)
    const vStar = serverVers[3];
    await page.click(`${STRIP} .gg-ver-wrap[data-vid="${vStar}"] > .gg-ver`);
    await waitStrip(page, (s, v) => document.querySelector(`${s} .gg-ver-wrap[data-vid="${v}"]`)?.classList.contains("gg-vs-sel"), vStar, "click did not select the thumbnail");
    await page.click(`${STRIP} .gg-vs-head .gg-vs-best-btn`);
    await waitStrip(page, (s, v) => document.querySelector(`${s} .gg-ver-wrap[data-vid="${v}"]`)?.classList.contains("gg-rep"), vStar, "Best did not set Best");
    await waitServerPick(page, pid, cutA, vStar);
    st = await stripState(page);
    if (!st.items[vStar].bestBorder || st.items[serverVers[0]].latest || Object.entries(st.items).some(([id, x]) => id !== vStar && x.best)) {
      throw new Error(`Best marks wrong after Best: ${JSON.stringify(st.items)}`);
    }
    if (!editPosts.some((b) => b?.clips?.[cutA]?.pick === vStar)) throw new Error("Best did not go through POST /gonggan/edit pick");
    console.log("PASS  Best: set on the selected thumbnail via the existing pick (POST /gonggan/edit), highlighted border, latest no longer implicit");

    // 5. right-click Set as Best; disabled on the Best one
    const vMenu = serverVers[5];
    await page.click(`${STRIP} .gg-ver-wrap[data-vid="${vMenu}"] > .gg-ver`, { button: "right" });
    await clickCtxItem(page, "Set as Best");
    await waitStrip(page, (s, v) => document.querySelector(`${s} .gg-ver-wrap[data-vid="${v}"]`)?.classList.contains("gg-rep"), vMenu, "menu did not set Best");
    await waitServerPick(page, pid, cutA, vMenu);
    await page.click(`${STRIP} .gg-ver-wrap[data-vid="${vMenu}"] > .gg-ver`, { button: "right" });
    if ((await ctxItemDisabled(page, "Set as Best")) !== true) throw new Error("Set as Best should be disabled on the Best");
    await page.keyboard.press("Escape");
    st = await stripState(page);
    if (st.items[vStar].best || st.items[vStar].bestBorder) throw new Error("old Best still marked");
    console.log("PASS  right-click: Set as Best moves the Best; disabled on the Best thumbnail");

    // 6. another cut: no versions; back: starts at the newest
    await page.evaluate((s) => {
      const l = document.querySelector(`${s} .gg-vs-list`);
      l.scrollLeft = l.scrollWidth;
    }, STRIP);
    await sleep(200);
    await clickCut(page, cutB);
    await waitStrip(page, (s) => document.querySelector(`${s} .gg-vs-empty`)?.textContent === "No versions", null, "empty cut text");
    await clickCut(page, cutA);
    await waitStrip(page, (s, n) => document.querySelectorAll(`${s} .gg-ver-wrap`).length === n, SEED_COUNT, "row back on cut A");
    st = await stripState(page);
    if (st.scrollLeft !== 0) throw new Error(`switching cuts should start at the newest, scrollLeft ${st.scrollLeft}`);
    console.log("PASS  cut switch: empty cut shows No versions; other cut starts at the newest");

    // 7. video length label + missing file placeholder (this project's timeline mocked)
    const mock = await realTimeline(page, pid);
    const mc = mock.cuts.find((c) => c.id === cutA);
    const vVideo = serverVers[0];
    const vMissing = serverVers[4];
    mc.versions_list = mc.versions_list.map((v) =>
      v.id === vVideo ? { ...v, kind: "video", seconds: 6.2 } : v.id === vMissing ? { ...v, missing: true } : v
    );
    timelineMocks.set(pid, mock);
    await reloadAndSelectProject(page, pid);
    await clickCut(page, cutA);
    await waitStrip(page, (s, v) => document.querySelector(`${s} .gg-ver-wrap[data-vid="${v}"] .gg-vs-dur:not([hidden])`)?.textContent === "0:06", vVideo, "video length label");
    st = await stripState(page);
    if (!st.items[vMissing].empty) throw new Error("missing file should show the no-media placeholder");
    if (Object.entries(st.items).some(([id, x]) => id !== vVideo && x.dur)) throw new Error("length label on an image");
    const durBox = await page.evaluate((s, v) => {
      const ver = document.querySelector(`${s} .gg-ver-wrap[data-vid="${v}"] > .gg-ver`).getBoundingClientRect();
      const d = document.querySelector(`${s} .gg-ver-wrap[data-vid="${v}"] .gg-vs-dur`).getBoundingClientRect();
      return { right: ver.right - d.right, bottom: ver.bottom - d.bottom };
    }, STRIP, vVideo);
    if (durBox.right < 0 || durBox.right > 6 || durBox.bottom < 0 || durBox.bottom > 6) throw new Error(`length label not bottom-right: ${JSON.stringify(durBox)}`);
    timelineMocks.delete(pid);
    console.log("PASS  video thumbnail shows 0:06 bottom-right; missing file shows the no-media placeholder");

    await page.screenshot({ path: path.join(os.tmpdir(), `gg-vstrip-${runStamp}.png`) });
  } finally {
    try {
      await cleanup(page);
    } catch (_) {}
    await browser.close().catch(() => {});
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
  if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST (${blockedPromptAttempts})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
