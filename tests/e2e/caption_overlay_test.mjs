/**
 * Headless Chrome: timeline viewer caption overlay (0.9.91). Nothing is rendered (POST /prompt and
 * /gonggan/regen are blocked). One ZZ-test- native project with 4 cuts placed as
 *   A "Alpha" 0–1.5 (trimmed) | B "Beta" 1.5–3.5 | C "" 3.5–5.5 | gap 5.5–8 | D "Delta" 8–10
 * Seeks with the ruler and checks `.gg-v-cap`: the clip's caption inside its span, nothing in the gap or
 * for an empty caption, white text on a dark translucent box at the bottom center of the frame.
 * Needs ComfyUI on 8188 and 40+ GB free RAM. Project deleted at the end.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-caption-overlay";
const BLOCKED_POST = [/\/prompt(\?|$)/, /\/api\/prompt(\?|$)/, /\/gonggan\/regen(\?|$)/, /\/api\/gonggan\/regen(\?|$)/];

const runStamp = Date.now();
const USER_DATA_DIR = path.join(os.tmpdir(), `gg-caption-overlay-${runStamp}`);
const createdProjectIds = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkRam(label) {
  const free = os.freemem();
  if (free < MIN_RAM) {
    const err = new Error(`RAM check failed (${label}): ${Math.round(free / 1e9)} GB free, need 40+ GB`);
    err.skipped = true;
    throw err;
  }
}

function attachRequestGuard(page) {
  page.on("request", (req) => {
    let p = "";
    try { p = new URL(req.url()).pathname; } catch (_) {}
    if (req.method() === "POST" && BLOCKED_POST.some((re) => re.test(p))) {
      console.error(`BLOCKED UNSAFE POST: ${req.url()}`);
      req.abort("blockedbyclient");
      return;
    }
    req.continue();
  });
}

async function postJson(page, route, body) {
  return page.evaluate(async (r, b) => {
    const res = await fetch(`${location.origin}${r}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  }, route, body);
}

async function getJson(page, route) {
  return page.evaluate(async (r) => (await fetch(`${location.origin}${r}`)).json().catch(() => null), route);
}

async function openShotsTab(page) {
  const opened = await page.evaluate(() => {
    const st = window.app?.extensionManager?.sidebarTab;
    if (!st) return false;
    st.activeSidebarTabId = "gg-shots";
    return true;
  });
  if (!opened) await (await page.waitForSelector('[aria-label="Vidot Cut Manager"]', { timeout: 15000 })).click();
  await page.waitForSelector(".gg-root.gg-shots", { timeout: 60000 });
}

async function selectProject(page, pid) {
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") await globalThis.__gongganReloadShotsData();
  });
  await page.waitForSelector(`.gg-root.gg-shots .gg-proj option[value="${pid}"]`, { timeout: 30000 });
  for (let i = 0; i < 12; i++) {
    await page.select(".gg-root.gg-shots .gg-proj", pid);
    await sleep(600);
    if ((await page.$eval(".gg-root.gg-shots .gg-proj", (el) => el.value)) === pid) return;
  }
  throw new Error("project did not become selected");
}

async function run() {
  checkRam("start");
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
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
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));
    const a = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-${runStamp}` });
    const pid = a.project.id;
    createdProjectIds.push(pid);
    for (let i = 0; i < 3; i++) await postJson(page, "/gonggan/cut/add", { pid });
    const tl0 = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const ids = (tl0.track_order || tl0.cuts.map((c) => c.id)).slice(0, 4);
    if (ids.length !== 4) throw new Error(`test setup: expected 4 cuts, got ${ids.length}`);
    const caps = ["Alpha", "Beta", "", "Delta"];
    for (let i = 0; i < 4; i++) await postJson(page, "/gonggan/cut/update", { pid, cut_id: ids[i], fields: { caption: caps[i] } });
    const place = [[0, 1.5], [1.5, 2], [3.5, 2], [8, 2]];
    await postJson(page, "/gonggan/edit", {
      pid,
      order: ids,
      clips: Object.fromEntries(ids.map((id, i) => [id, { in: 0, sec: place[i][1], pick: null, start: place[i][0] }])),
    });
    const tl1 = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const got = ids.map((id) => tl1.cuts.find((c) => c.id === id)).map((c) => [c.start, c.sec]);
    if (JSON.stringify(got) !== JSON.stringify(place)) throw new Error(`test setup: placement not saved: ${JSON.stringify(got)}`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(1500);
    await openShotsTab(page);
    await selectProject(page, pid);
    await page.waitForFunction(() => document.querySelectorAll(".gg-timeline .gg-track .gg-clip").length === 4, { timeout: 20000 });
    await sleep(800);

    const seekTo = async (t) => {
      const pt = await page.evaluate((id0, t0) => {
        const clip = document.querySelector(`.gg-timeline .gg-clip[data-cut-id="${id0}"]`).getBoundingClientRect();
        const track = document.querySelector(".gg-timeline .gg-track").getBoundingClientRect();
        const ruler = document.querySelector(".gg-timeline .gg-ruler");
        ruler.scrollIntoView({ block: "nearest" });
        const rr = ruler.getBoundingClientRect();
        return { x: track.left + (clip.width / 1.5) * t0, y: rr.top + rr.height / 2 };
      }, ids[0], t);
      await page.mouse.click(pt.x, pt.y);
      await sleep(250);
      return page.evaluate(() => {
        const el = document.querySelector(".gg-timeline .gg-v-cap");
        return { text: el.textContent, shown: getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0 };
      });
    };
    const expectCap = async (t, want, label) => {
      const r = await seekTo(t);
      if (r.text !== want || r.shown !== !!want) throw new Error(`${label} (t=${t}): expected ${JSON.stringify(want)}, got ${JSON.stringify(r)}`);
      console.log(`PASS  ${label}: ${want ? JSON.stringify(want) : "nothing shown"}`);
    };
    await expectCap(0.7, "Alpha", "first clip");
    await expectCap(1.8, "Beta", "after the trimmed first clip ends");
    await expectCap(4.5, "", "empty caption");
    await expectCap(6.7, "", "gap");
    await expectCap(9, "Delta", "clip after the gap");

    const look = await page.evaluate(() => {
      const el = document.querySelector(".gg-timeline .gg-v-cap");
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const scr = document.querySelector(".gg-timeline .gg-screen").getBoundingClientRect();
      return {
        color: s.color, bg: s.backgroundColor,
        centerOff: Math.abs((b.left + b.right) / 2 - (scr.left + scr.right) / 2),
        bottomGap: scr.bottom - b.bottom, inside: b.top >= scr.top && b.bottom <= scr.bottom,
      };
    });
    const bg = /rgba\(0, 0, 0, (0?\.\d+)\)/.exec(look.bg);
    if (look.color !== "rgb(255, 255, 255)" || !bg || !(Number(bg[1]) > 0 && Number(bg[1]) < 1)) throw new Error(`style: ${JSON.stringify(look)}`);
    if (look.centerOff > 2 || look.bottomGap < 0 || look.bottomGap > 30 || !look.inside) throw new Error(`position: ${JSON.stringify(look)}`);
    console.log(`PASS  white text on dark translucent box, bottom center (${JSON.stringify(look)})`);
    console.log("PASS  caption overlay e2e complete");
  } finally {
    for (const pid of createdProjectIds.reverse()) {
      try { await postJson(page, "/gonggan/project/delete", { pid }); } catch (_) {}
    }
    await browser.close();
    try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((e) => {
  if (e?.skipped) { console.log(`SKIP  ${e.message}`); process.exit(0); }
  console.error(e);
  process.exit(1);
});
