/**
 * 0.9.62 scene reorder: drag a scene header to move the whole scene. Covers move + labels + persistence
 * (Reload button and full page reload), Undo, Esc mid-drag, collapsed scene, header buttons / right-click
 * still working, right button never drags, an ordinary cut drag between scenes, and a scene drag while a
 * timeline save is still waiting (0.9.78 hang) with Ctrl+Z / Ctrl+Y, the same in Caption list mode (scene
 * headers once, scene drag, cut drag from the caption field), and cut ids / media / versions / source
 * workflow unchanged by a move. 0.9.104: the icon row New scene stacks one empty scene per click
 * (Scene 1, 2, 3 above Ungrouped), with Ctrl+Z / Ctrl+Y. 0.9.108: a cut dropped on an empty scene's header
 * or empty body moves into it (tinted on dragover, Ctrl+Z / Ctrl+Y); New scene goes after the last scene even
 * with a cut of the first scene selected; New cut with no cut selected goes into Ungrouped at the bottom.
 * ZZ temp native project (2 scenes x 2 cuts), soft-deleted at the end. Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { dismissAskDialog } from "./ask_text_helpers.mjs";
import { waitForDomCutCountSync } from "./dom_sync_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCREENS_DIR = path.join(REPO_ROOT, "tests/screens");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-scene-reorder";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const createdProjectIds = [];
let blockedPromptAttempts = 0;
let failNextGroupsPost = false;
let testPid = "";
/** @type {{ ids: string[], groups: { id: string, name: string, cut_ids: string[], collapsed: boolean }[] }} */
const baseline = { ids: [], groups: [], fingerprint: {} };

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
    if (failNextGroupsPost && method === "POST" && /\/gonggan\/groups$/.test(new URL(url).pathname)) {
      failNextGroupsPost = false;
      req.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, message: "simulated save failure" }) });
      return;
    }
    req.continue();
  });
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

/** The native store reads the project file without its lock, so a poll that lands on a save's file
 * replace can get a one-off 404 on Windows; retry that a few times. */
async function serverTimeline(page) {
  return page.evaluate(async (pid) => {
    for (let i = 0; ; i++) {
      const res = await fetch(`/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
      if (res.ok) return res.json();
      if (res.status !== 404 || i >= 4) throw new Error(`timeline HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }, testPid);
}

/** Per-cut data a scene move must not touch: name, media files, versions, Best, caption, source workflow. */
async function cutFingerprint(page) {
  return page.evaluate(async (pid) => {
    const q = encodeURIComponent(pid);
    const tl = await (await fetch(`/gonggan/timeline?pid=${q}`)).json();
    const out = {};
    for (const c of tl.cuts) {
      const wf = await (await fetch(`/gonggan/cut-source-workflow?pid=${q}&cut=${encodeURIComponent(c.id)}`)).text();
      out[c.id] = JSON.stringify([c.name, c.media, c.versions_list, c.pick, c.caption, wf]);
    }
    return out;
  }, testPid);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-scene-reorder-${runStamp}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir,
    protocolTimeout: 240000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  browser._ggUserDataDir = userDataDir;
  return browser;
}

async function closeBrowser(browser) {
  if (!browser) return;
  const dir = browser._ggUserDataDir;
  try {
    await browser.close();
  } finally {
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
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

const cutSel = (id) => `.gg-root.gg-shots .gg-cut[data-cut-id="${id}"]`;
const secSel = (gid) => `.gg-root.gg-shots .gg-grp-sec[data-group-id="${gid}"]`;

const domCutIds = (page) => page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.map((e) => e.dataset.cutId));
const domSceneIds = (page) =>
  page.$$eval(".gg-root.gg-shots .gg-grp-sec[data-group-id]", (els) => els.map((e) => e.dataset.groupId));
const domLabels = (page) =>
  page.$$eval(".gg-root.gg-shots .gg-cut", (els) =>
    Object.fromEntries(els.map((e) => [e.dataset.cutId, e.querySelector(".gg-num")?.textContent.trim() || ""])));
const sectionCutIds = (page, gid) =>
  page.$$eval(`.gg-root.gg-shots .gg-grp-sec[data-group-id="${gid}"] .gg-cut`, (els) => els.map((e) => e.dataset.cutId));

async function rightClickAt(page, selector) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.$eval(selector, (el) => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
  const box = await (await page.$(selector)).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.mouse.click(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2, { button: "right" });
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
}

const ctxLabels = (page) => page.$$eval(".gg-ctx > .gg-ctx-item", (els) => els.map((e) => e.textContent.trim()));

async function closeCtx(page) {
  if (!(await page.$(".gg-ctx"))) return;
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".gg-ctx"), { timeout: 5000 });
}

async function reloadShots(page) {
  await page.click(".gg-root.gg-shots .gg-reload");
  await sleep(1200);
  await waitForDomCutCountSync(page);
}

async function selectTestProject(page) {
  await page.waitForFunction(
    (pid) => !!document.querySelector(`.gg-root.gg-shots .gg-proj option[value="${pid}"]`),
    { timeout: 30000 },
    testPid,
  ).catch(async () => {
    await page.evaluate(() => document.querySelector(".gg-root.gg-shots .gg-reload")?.click());
    await page.waitForSelector(`.gg-root.gg-shots .gg-proj option[value="${testPid}"]`, { timeout: 30000 });
  });
  for (let i = 0; i < 12; i++) {
    if ((await page.$eval(".gg-root.gg-shots .gg-proj", (el) => el.value)) === testPid) break;
    await page.select(".gg-root.gg-shots .gg-proj", testPid);
    await sleep(600);
  }
  await reloadShots(page);
}

/** Back to 2 scenes x 2 cuts in baseline order (Scene A first). */
async function resetBaseline(page) {
  await closeCtx(page);
  await postJson(page, "/gonggan/groups", { pid: testPid, groups: baseline.groups });
  await postJson(page, "/gonggan/cut/reorder", { pid: testPid, order: baseline.ids });
  await postJson(page, "/gonggan/edit/reset", { pid: testPid });
  await reloadShots(page);
  const ids = await domCutIds(page);
  if (ids.join() !== baseline.ids.join()) throw new Error(`baseline order not restored: ${ids.join()}`);
}

async function setupProject(page) {
  const created = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX} ${runStamp}` });
  testPid = created.project.id;
  createdProjectIds.push(testPid);
  let tl = await serverTimeline(page);
  while ((tl.cuts || []).length < 4) {
    await postJson(page, "/gonggan/cut/add", { pid: testPid });
    tl = await serverTimeline(page);
  }
  const ids = tl.cuts.map((c) => c.id);
  if (ids.length !== 4) throw new Error(`expected 4 cuts, got ${ids.length}`);
  baseline.ids = ids;
  baseline.groups = [
    { id: `sr-a-${runStamp}`, name: "Scene A", cut_ids: ids.slice(0, 2), collapsed: false },
    { id: `sr-b-${runStamp}`, name: "Scene B", cut_ids: ids.slice(2, 4), collapsed: false },
  ];
  await postJson(page, "/gonggan/groups", { pid: testPid, groups: baseline.groups });
  await selectTestProject(page);
  const ids2 = await domCutIds(page);
  if (ids2.join() !== ids.join()) throw new Error(`Shots order differs from server: ${ids2.join()}`);
  baseline.fingerprint = await cutFingerprint(page);
}

/** Viewport points for a header drag: from the title of `fromGid` to a Y inside `toSel`'s box. */
async function headerDragPoints(page, fromGid, toSel, fy) {
  return page.evaluate((fromSel, dstSel, f) => {
    const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    const src = document.querySelector(`${fromSel} > .gg-grp-head .gg-grp-title`);
    const dst = document.querySelector(dstSel);
    if (!wrap || !src || !dst) return null;
    const s = src.getBoundingClientRect();
    const d = dst.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const from = { x: s.x + Math.min(40, s.width / 2), y: s.y + s.height / 2 };
    const to = { x: from.x, y: d.y + d.height * f };
    // The press must land on the dragged scene's own header (a real header drag, not a cut drag).
    const onHead = document.elementFromPoint(from.x, from.y)?.closest(".gg-grp-head") === src.closest(".gg-grp-head");
    return { from, to, onHead, ok: onHead && from.y > w.top && from.y < w.bottom && to.y > w.top && to.y < w.bottom };
  }, secSel(fromGid), toSel, fy);
}

async function dragHeader(page, pts, { beforeUp } = {}) {
  await page.mouse.move(pts.from.x, pts.from.y);
  await page.mouse.down();
  let released = false;
  try {
    await sleep(80);
    await page.mouse.move(pts.to.x, pts.to.y, { steps: 14 });
    await sleep(250);
    if (beforeUp) await beforeUp();
    await page.mouse.up();
    released = true;
  } finally {
    if (!released) await page.mouse.up().catch(() => {});
  }
}

/** page.click that survives the Shots panel re-rendering between Puppeteer's lookup and its click
 * (the error is thrown before any mouse event, so retrying cannot double-click). */
async function clickFresh(page, selector) {
  for (let i = 0; ; i++) {
    try {
      await page.click(selector);
      return;
    } catch (e) {
      if (i >= 4 || !/not clickable|detached|not an Element/i.test(e.message || "")) throw e;
      await sleep(150);
    }
  }
}

async function waitToast(page, text) {
  await page.waitForFunction(
    (t) => {
      const host = document.getElementById("gg-toast-host");
      return !!(host && !host.hidden && host.querySelector(".gg-toast-sum")?.textContent.trim() === t);
    },
    { timeout: 10000 },
    text,
  );
}

async function waitServerOrder(page, want) {
  for (let i = 0; i < 30; i++) {
    const tl = await serverTimeline(page);
    if (tl.cuts.map((c) => c.id).join() === want.join()) return tl;
    await sleep(300);
  }
  const tl = await serverTimeline(page);
  throw new Error(`server order ${tl.cuts.map((c) => c.id).join()} != ${want.join()}`);
}

const results = [];
let browser;
let page;

async function runScenario(id, title, fn) {
  checkRam(`before ${id}`);
  try {
    if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST attempted (${blockedPromptAttempts})`);
    const out = await fn();
    if (out && out.skip) {
      results.push({ id, status: "SKIP" });
      console.log(`SKIP  ${id} ${title}: ${out.skip}`);
    } else {
      results.push({ id, status: "PASS" });
      console.log(`PASS  ${id} ${title}`);
    }
  } catch (e) {
    results.push({ id, status: "FAIL" });
    console.log(`FAIL  ${id} ${title}: ${e.message || e}`);
    try {
      fs.mkdirSync(SCREENS_DIR, { recursive: true });
      await page.screenshot({ path: path.join(SCREENS_DIR, `scene-reorder-fail-${id}-${runStamp}.png`) });
    } catch (_) {}
    try {
      await page.mouse.up();
    } catch (_) {}
    try {
      await page.keyboard.press("Escape");
    } catch (_) {}
  }
  checkRam(`after ${id}`);
}

async function cleanupProjects(p) {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await postJson(p, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup delete ${pid}:`, e.message);
    }
  }
}

async function cleanupProjectsHttp() {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await fetch(`${BASE}/gonggan/project/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
    } catch (e) {
      console.warn(`cleanup ${pid}:`, e.message);
    }
  }
}

async function main() {
  try {
    checkRam("startup");
  } catch (e) {
    if (e.skipped) {
      console.log(`SKIP  scene reorder e2e: ${e.message}`);
      process.exit(0);
    }
    throw e;
  }
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  browser = await launchBrowser();
  page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  try {
    await runScenario("00", "Setup ZZ project (2 scenes x 2 cuts)", async () => {
      await waitForComfy(page);
      await openShotsTab(page);
      await setupProject(page);
    });
    if (!testPid || baseline.ids.length !== 4) throw new Error("setup failed; aborting");
    const [c1, c2, c3, c4] = baseline.ids;
    const [gA, gB] = baseline.groups.map((g) => g.id);
    const moved = [c3, c4, c1, c2];
    const movedLabels = { [c3]: "1-1", [c4]: "1-2", [c1]: "2-1", [c2]: "2-2" };

    // Caption view rows are just the caption field (no cut label), so labels are checked in Info view only.
    const checkMoved = async (where, { labels: withLabels = true } = {}) => {
      if ((await domCutIds(page)).join() !== moved.join()) throw new Error(`${where}: Shots order ${(await domCutIds(page)).join()}`);
      if ((await domSceneIds(page)).join() !== [gB, gA].join()) throw new Error(`${where}: scene order ${(await domSceneIds(page)).join()}`);
      const labels = await domLabels(page);
      if (withLabels && JSON.stringify(labels) !== JSON.stringify(movedLabels)) throw new Error(`${where}: labels ${JSON.stringify(labels)}`);
      if ((await sectionCutIds(page, gB)).join() !== [c3, c4].join()) throw new Error(`${where}: scene B cuts changed`);
      if ((await sectionCutIds(page, gA)).join() !== [c1, c2].join()) throw new Error(`${where}: scene A cuts changed`);
      const tl = await serverTimeline(page);
      if (tl.cuts.map((c) => c.id).join() !== moved.join()) throw new Error(`${where}: server order ${tl.cuts.map((c) => c.id).join()}`);
      if ((tl.groups || []).map((g) => g.id).join() !== [gB, gA].join()) throw new Error(`${where}: server scene order`);
      const fp = await cutFingerprint(page);
      const changed = baseline.ids.filter((id) => fp[id] !== baseline.fingerprint[id]);
      if (changed.length) throw new Error(`${where}: cut data/files/workflow changed for ${changed.join()}`);
    };

    await runScenario("s1", "Drag scene B header above scene A: order, labels, persisted (Reload + page reload)", async () => {
      await resetBaseline(page);
      if (JSON.stringify(await domLabels(page)) !== JSON.stringify({ [c1]: "1-1", [c2]: "1-2", [c3]: "2-1", [c4]: "2-2" })) {
        throw new Error("baseline labels unexpected");
      }
      const pts = await headerDragPoints(page, gB, `${secSel(gA)} > .gg-grp-head`, 0.5);
      if (!pts?.ok) throw new Error(`scene header drag points not usable: ${JSON.stringify(pts)}`);
      await dragHeader(page, pts, {
        beforeUp: async () => {
          const st = await page.evaluate((b) => {
            const ind = document.querySelector(".gg-root.gg-shots .gg-drag-ind");
            return {
              ind: !!ind && !ind.hidden,
              moving: !!document.querySelector(b)?.classList.contains("gg-grp-moving"),
            };
          }, secSel(gB));
          if (!st.ind) throw new Error("drop line (.gg-drag-ind) not shown during scene drag");
          if (!st.moving) throw new Error("dragged scene not marked while dragging");
        },
      });
      await waitToast(page, "Moved 2 cut(s)");
      await waitServerOrder(page, moved);
      await sleep(400);
      await checkMoved("after drop");
      await reloadShots(page);
      await checkMoved("after Reload button");
      await waitForComfy(page);
      await openShotsTab(page);
      await selectTestProject(page);
      await checkMoved("after page reload");
    });

    await runScenario("s2", "Undo after a scene move restores the previous order", async () => {
      await resetBaseline(page);
      const pts = await headerDragPoints(page, gB, `${secSel(gA)} > .gg-grp-head`, 0.5);
      if (!pts?.ok) throw new Error(`scene header drag points not usable: ${JSON.stringify(pts)}`);
      await dragHeader(page, pts);
      await waitToast(page, "Moved 2 cut(s)");
      await waitServerOrder(page, moved);
      await page.click("#gg-toast-host .gg-toast-action");
      await waitToast(page, "Undone");
      const tl = await waitServerOrder(page, baseline.ids);
      if ((tl.groups || []).map((g) => g.id).join() !== [gA, gB].join()) throw new Error("Undo did not restore scene order");
      await sleep(300);
      if ((await domCutIds(page)).join() !== baseline.ids.join()) throw new Error("Shots order not restored by Undo");
    });

    await runScenario("s3", "Esc mid-drag cancels a scene drag with no change", async () => {
      await resetBaseline(page);
      const pts = await headerDragPoints(page, gB, `${secSel(gA)} > .gg-grp-head`, 0.5);
      if (!pts?.ok) throw new Error(`scene header drag points not usable: ${JSON.stringify(pts)}`);
      await dragHeader(page, pts, {
        beforeUp: async () => {
          await page.keyboard.press("Escape");
          await sleep(250);
          const st = await page.evaluate(() => ({
            ind: !document.querySelector(".gg-root.gg-shots .gg-drag-ind")?.hidden,
            dragging: !!document.querySelector(".gg-root.gg-shots .gg-grp-wrap.gg-reorder-dragging"),
            moving: document.querySelectorAll(".gg-root.gg-shots .gg-grp-moving").length,
          }));
          if (st.ind || st.dragging || st.moving) throw new Error(`drag still active after Escape: ${JSON.stringify(st)}`);
        },
      });
      await sleep(1200);
      const tl = await serverTimeline(page);
      if (tl.cuts.map((c) => c.id).join() !== baseline.ids.join()) throw new Error("server order changed after Esc");
      if ((tl.groups || []).map((g) => g.id).join() !== [gA, gB].join()) throw new Error("server scene order changed after Esc");
      if ((await domCutIds(page)).join() !== baseline.ids.join()) throw new Error("Shots order changed after Esc");
    });

    await runScenario("s4", "Collapsed scene A dragged below scene B moves with its cuts and stays collapsed", async () => {
      await resetBaseline(page);
      await page.click(`${secSel(gA)} .gg-grp-fold`);
      await page.waitForFunction((s) => !!document.querySelector(`${s} .gg-cutlist`)?.hidden, { timeout: 8000 }, secSel(gA));
      await sleep(500);
      const pts = await headerDragPoints(page, gA, secSel(gB), 0.9);
      if (!pts?.ok) throw new Error(`scene header drag points not usable: ${JSON.stringify(pts)}`);
      await dragHeader(page, pts);
      const tl = await waitServerOrder(page, moved);
      const g = (tl.groups || []).find((x) => x.id === gA);
      if (!g?.collapsed) throw new Error("scene A lost its collapsed state");
      if (g.cut_ids.join() !== [c1, c2].join()) throw new Error(`scene A cuts ${g.cut_ids.join()}`);
      await sleep(400);
      if ((await domSceneIds(page)).join() !== [gB, gA].join()) throw new Error("Shots scene order not updated");
    });

    await runScenario("s5", "Header buttons, right-click menu and right-button drag still behave", async () => {
      await resetBaseline(page);
      await rightClickAt(page, `${secSel(gA)} .gg-grp-title`);
      const labels = await ctxLabels(page);
      const want = ["Add Cut", "Select cuts", "Collapse", "Rename", "Ungroup"];
      if (labels.join("|") !== want.join("|")) throw new Error(`scene menu items: ${labels.join("|")}`);
      await closeCtx(page);

      const pts = await headerDragPoints(page, gB, `${secSel(gA)} > .gg-grp-head`, 0.5);
      if (!pts?.ok) throw new Error(`scene header drag points not usable: ${JSON.stringify(pts)}`);
      await page.mouse.move(pts.from.x, pts.from.y);
      await page.mouse.down({ button: "right" });
      try {
        await page.mouse.move(pts.to.x, pts.to.y, { steps: 10 });
        await sleep(200);
        if (await page.$(".gg-root.gg-shots .gg-grp-wrap.gg-reorder-dragging")) throw new Error("right button started a drag");
      } finally {
        await page.mouse.up({ button: "right" });
      }
      await sleep(300);
      await closeCtx(page);
      await sleep(800);
      if ((await serverTimeline(page)).cuts.map((c) => c.id).join() !== baseline.ids.join()) throw new Error("right-button drag moved");

      await page.click(`${secSel(gA)} .gg-grp-fold`);
      await page.waitForFunction((s) => !!document.querySelector(`${s} .gg-cutlist`)?.hidden, { timeout: 8000 }, secSel(gA));
      await page.click(`${secSel(gA)} .gg-grp-fold`);
      await page.waitForFunction((s) => !document.querySelector(`${s} .gg-cutlist`)?.hidden, { timeout: 8000 }, secSel(gA));

      await page.click(`${secSel(gA)} .gg-grp-ren`);
      await page.waitForSelector(".gg-ask-input", { visible: true, timeout: 8000 });
      await dismissAskDialog(page);

      await page.click(`${secSel(gA)} .gg-grp-del`);
      await page.waitForSelector(".gg-confirm-dialog", { timeout: 8000 });
      await page.click(".gg-confirm-cancel");
      await page.waitForFunction(() => !document.querySelector(".gg-confirm-dialog"), { timeout: 5000 });
      await sleep(600);
      const tl = await serverTimeline(page);
      if (tl.cuts.map((c) => c.id).join() !== baseline.ids.join()) throw new Error("header buttons changed the order");
      if ((tl.groups || []).map((g) => g.id).join() !== [gA, gB].join()) throw new Error("header buttons changed scenes");
    });

    await runScenario("s7", "Save failure during a scene move: failure toast, previous order restored", async () => {
      await resetBaseline(page);
      const pts = await headerDragPoints(page, gB, `${secSel(gA)} > .gg-grp-head`, 0.5);
      if (!pts?.ok) throw new Error(`scene header drag points not usable: ${JSON.stringify(pts)}`);
      failNextGroupsPost = true;
      try {
        await dragHeader(page, pts);
        await waitToast(page, "Reorder failed. Previous order restored.");
      } finally {
        failNextGroupsPost = false;
      }
      await page.waitForFunction(
        (want) => [...document.querySelectorAll(".gg-root.gg-shots .gg-cut")].map((e) => e.dataset.cutId).join() === want,
        { timeout: 10000 },
        baseline.ids.join(),
      );
      const tl = await serverTimeline(page);
      if (tl.cuts.map((c) => c.id).join() !== baseline.ids.join()) throw new Error("server order changed after failed save");
      if ((tl.groups || []).map((g) => g.id).join() !== [gA, gB].join()) throw new Error("server scene order changed after failed save");
      if ((await domSceneIds(page)).join() !== [gA, gB].join()) throw new Error("Shots scene order not restored");
    });

    await runScenario("s8", "Scene drag right after a timeline clip move is saved (with the clip move); Ctrl+Z / Ctrl+Y", async () => {
      await resetBaseline(page);
      const clipSel = `.gg-root.gg-timeline .gg-clip[data-cut-id="${c4}"]`;
      await page.waitForSelector(clipSel, { visible: true, timeout: 15000 });
      const startBefore = (await serverTimeline(page)).cuts.find((c) => c.id === c4)?.start;
      const pts = await headerDragPoints(page, gB, `${secSel(gA)} > .gg-grp-head`, 0.5);
      if (!pts?.ok) throw new Error(`scene header drag points not usable: ${JSON.stringify(pts)}`);
      const cb = await (await page.$(clipSel)).boundingBox();
      const cx = cb.x + cb.width / 2;
      const cy = cb.y + cb.height / 2;
      if (cx + 60 > VIEWPORT.width) throw new Error(`last timeline clip too far right (${Math.round(cx)})`);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 40, cy, { steps: 4 });
      await page.mouse.up();
      // The timeline save waits 400 ms; the scene drop must land while it is still waiting (0.9.78 hang).
      const t0 = Date.now();
      await page.mouse.move(pts.from.x, pts.from.y);
      await page.mouse.down();
      await page.mouse.move(pts.to.x, pts.to.y, { steps: 5 });
      await page.mouse.up();
      const elapsed = Date.now() - t0;
      if (elapsed > 300) return { skip: `scene drop came ${elapsed} ms after the clip move (needs < 300 ms)` };
      const tl = await waitServerOrder(page, moved);
      if ((tl.groups || []).map((g) => g.id).join() !== [gB, gA].join()) throw new Error("server scene order not saved");
      const startAfter = tl.cuts.find((c) => c.id === c4)?.start;
      if (!(startAfter > startBefore)) throw new Error(`timeline clip move not saved: start ${startBefore} -> ${startAfter}`);
      await sleep(400);
      await checkMoved("after drop");

      const keyInShots = async (key) => {
        await page.mouse.move(pts.to.x, pts.to.y);
        await page.keyboard.down("Control");
        await page.keyboard.press(key);
        await page.keyboard.up("Control");
      };
      await keyInShots("KeyZ");
      const undone = await waitServerOrder(page, baseline.ids);
      if ((undone.groups || []).map((g) => g.id).join() !== [gA, gB].join()) throw new Error("Ctrl+Z did not restore scene order");
      await sleep(400);
      if ((await domSceneIds(page)).join() !== [gA, gB].join()) throw new Error("Shots scene order not restored by Ctrl+Z");
      await keyInShots("KeyY");
      await waitServerOrder(page, moved);
      await sleep(400);
      await checkMoved("after Ctrl+Y");
    });

    /** Drag cut c4 (pressed on `grab` inside its row) onto c2: it must join scene A. */
    const dragC4IntoSceneA = async (grab) => {
      const pts = await page.evaluate((a, b, g) => {
        const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
        const src = document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${a}"] ${g}`);
        const dst = document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${b}"]`);
        if (!wrap || !src || !dst) return null;
        const w = wrap.getBoundingClientRect();
        const s = src.getBoundingClientRect();
        const d = dst.getBoundingClientRect();
        const from = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
        const to = { x: d.x + d.width / 2, y: d.y + Math.max(4, d.height * 0.25) };
        const inside = (p) => p.y > w.top + 50 && p.y < w.bottom - 50;
        return { from, to, ok: inside(from) && inside(to), geo: { wTop: w.top, wBottom: w.bottom, dTop: d.top, dBottom: d.bottom } };
      }, c4, c2, grab);
      if (!pts) throw new Error("drag points not found");
      if (!pts.ok) return { skip: `source/target not both away from the auto-scroll edges ${JSON.stringify(pts.geo)}` };
      await dragHeader(page, pts);
      const tl = await waitServerOrder(page, [c1, c4, c2, c3]);
      if ((tl.cuts.find((c) => c.id === c4) || {}).group_id !== gA) throw new Error("cut did not join scene A");
      await sleep(400);
      if ((await sectionCutIds(page, gA)).join() !== [c1, c4, c2].join()) throw new Error("Shots scene A cuts not updated");
      if ((await sectionCutIds(page, gB)).join() !== [c3].join()) throw new Error("Shots scene B cuts not updated");
      return null;
    };

    await runScenario("s6", "Cut drag still moves a cut from scene B into scene A", async () => {
      await resetBaseline(page);
      return dragC4IntoSceneA(".gg-cut-title");
    });

    await runScenario("s9", "Caption list mode: scene drag shows the drop line, moves the whole scene; Ctrl+Z / Ctrl+Y", async () => {
      await resetBaseline(page);
      await page.click('.gg-root.gg-shots .gg-list-toggle [data-mode="caption"]');
      await page.waitForSelector(".gg-root.gg-shots.gg-list-caption", { timeout: 8000 });
      try {
        await sleep(400);
        const heads = await page.$$eval(".gg-root.gg-shots .gg-grp-sec", (els) =>
          els.map((s) => `${s.dataset.groupId}:${s.querySelectorAll(":scope > .gg-grp-head").length}`));
        if (heads.join() !== [`${gA}:1`, `${gB}:1`].join()) throw new Error(`Caption view scene headers: ${heads.join()}`);
        if ((await sectionCutIds(page, gA)).join() !== [c1, c2].join()) throw new Error("Caption view scene A rows differ from Info");
        if (await page.$(".gg-root.gg-shots .gg-cut .gg-cut-header")) {
          throw new Error("Caption view row shows info card parts");
        }
        const pts = await headerDragPoints(page, gB, `${secSel(gA)} > .gg-grp-head`, 0.5);
        if (!pts?.ok) throw new Error(`scene header drag points not usable: ${JSON.stringify(pts)}`);
        await dragHeader(page, pts, {
          beforeUp: async () => {
            const ind = await page.evaluate(() => {
              const el = document.querySelector(".gg-root.gg-shots .gg-drag-ind");
              return !!el && !el.hidden;
            });
            if (!ind) throw new Error("drop line (.gg-drag-ind) not shown during scene drag in Caption mode");
          },
        });
        await waitToast(page, "Moved 2 cut(s)");
        await waitServerOrder(page, moved);
        await sleep(400);
        await checkMoved("Caption mode drop", { labels: false });
        const keyInShots = async (key) => {
          await page.mouse.move(pts.to.x, pts.to.y);
          await page.keyboard.down("Control");
          await page.keyboard.press(key);
          await page.keyboard.up("Control");
        };
        await keyInShots("KeyZ");
        await waitServerOrder(page, baseline.ids);
        await sleep(400);
        if ((await domSceneIds(page)).join() !== [gA, gB].join()) throw new Error("Ctrl+Z did not restore scene order in Caption mode");
        await keyInShots("KeyY");
        await waitServerOrder(page, moved);
        await sleep(400);
        await checkMoved("Caption mode Ctrl+Y", { labels: false });
      } finally {
        await page.click('.gg-root.gg-shots .gg-list-toggle [data-mode="info"]').catch(() => {});
      }
    });

    await runScenario("s10", "Caption view: cut drag (pressed on the caption field) moves a cut from scene B into scene A", async () => {
      await resetBaseline(page);
      await page.click('.gg-root.gg-shots .gg-list-toggle [data-mode="caption"]');
      await page.waitForSelector(".gg-root.gg-shots.gg-list-caption .gg-caption-text", { timeout: 8000 });
      try {
        await sleep(400);
        return await dragC4IntoSceneA(".gg-caption-text");
      } finally {
        await page.click('.gg-root.gg-shots .gg-list-toggle [data-mode="info"]').catch(() => {});
      }
    });

    await runScenario("s11", "Icon row New scene: every click stacks one empty scene (Scene 1, 2, 3) above Ungrouped; Ctrl+Z / Ctrl+Y", async () => {
      await resetBaseline(page);
      // c4 ungrouped so the list ends with an Ungrouped section.
      await postJson(page, "/gonggan/groups", { pid: testPid, groups: [baseline.groups[0], { ...baseline.groups[1], cut_ids: [c3] }] });
      await reloadShots(page);
      await page.keyboard.press("Escape");
      const btn = ".gg-root.gg-shots .gg-ir-scene";
      await page.waitForFunction((s) => !document.querySelector(s)?.disabled, { timeout: 8000 }, btn)
        .catch(() => { throw new Error("New scene icon disabled on a native project"); });
      const serverScenes = async () => ((await serverTimeline(page)).groups || []).map((g) => `${g.name}:${g.cut_ids.length}`);
      const want = ["Scene A:2", "Scene B:1", "Scene 1:0", "Scene 2:0", "Scene 3:0"];
      // Three clicks back to back: each must add its own scene (no lost click, no reused name).
      for (let i = 0; i < 3; i++) await clickFresh(page, btn);
      if (await page.$(".gg-ask-backdrop")) throw new Error("New scene should not ask for a name");
      let got = [];
      for (let i = 0; i < 30; i++) {
        got = await serverScenes();
        if (got.length >= want.length) break;
        await sleep(300);
      }
      if (got.join() !== want.join()) {
        throw new Error(`server scenes ${got.join()} != ${want.join()} (an empty scene dropped by the server means ComfyUI still runs pre-0.9.104 Python)`);
      }
      await sleep(400);
      const layout = await page.$$eval(".gg-root.gg-shots .gg-grp-sec", (els) => els.map((s) =>
        `${s.classList.contains("gg-grp-loose") ? "Ungrouped" : s.querySelector(".gg-grp-title")?.textContent.replace(/^Scene · /, "").trim()}:${s.querySelectorAll(".gg-cut").length}`));
      if (layout.join() !== [...want, "Ungrouped:1"].join()) throw new Error(`Shots sections ${layout.join()}`);
      if ((await domCutIds(page)).join() !== [c1, c2, c3, c4].join()) throw new Error("New scene moved cuts");

      const keyInShots = async (key) => {
        await page.$eval(".gg-root.gg-shots .gg-grp-wrap", (el) => el.scrollIntoView({ block: "nearest" }));
        const box = await (await page.$(".gg-root.gg-shots .gg-grp-wrap")).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2));
        await page.keyboard.down("Control");
        await page.keyboard.press(key);
        await page.keyboard.up("Control");
      };
      const waitScenes = async (list, what) => {
        for (let i = 0; i < 30; i++) {
          if ((await serverScenes()).join() === list.join()) return;
          await sleep(300);
        }
        throw new Error(`${what}: server scenes ${(await serverScenes()).join()} != ${list.join()}`);
      };
      await keyInShots("KeyZ");
      await waitScenes(want.slice(0, 4), "Ctrl+Z");
      await keyInShots("KeyY");
      await waitScenes(want, "Ctrl+Y");
      await sleep(400);
      const titles = await page.$$eval(".gg-root.gg-shots .gg-grp-sec[data-group-id] .gg-grp-title", (els) => els.map((e) => e.textContent.trim()));
      if (titles.at(-1) !== "Scene · Scene 3") throw new Error(`after Ctrl+Y the last scene is ${titles.at(-1)}`);
    });

    const short = { [c1]: "c1", [c2]: "c2", [c3]: "c3", [c4]: "c4" };
    /** Server scenes as `Name[c1,c2]` plus the cut order, e.g. "Scene A[c1,c2] Scene 1[] | c1,c2,c3,c4". */
    const serverState = async () => {
      const tl = await serverTimeline(page);
      const s = (id) => short[id] || "new";
      return `${(tl.groups || []).map((g) => `${g.name}[${g.cut_ids.map(s).join(",")}]`).join(" ")} | ${tl.cuts.map((c) => s(c.id)).join(",")}`;
    };
    const waitServerState = async (want, what) => {
      let got = "";
      for (let i = 0; i < 30; i++) {
        got = await serverState();
        if (got === want) return;
        await sleep(300);
      }
      throw new Error(`${what}: server ${got} != ${want}`);
    };
    const shotsLayout = () => page.$$eval(".gg-root.gg-shots .gg-grp-sec", (els) => els.map((s) =>
      `${s.classList.contains("gg-grp-loose") ? "Ungrouped" : s.querySelector(".gg-grp-title")?.textContent.replace(/^Scene · /, "").trim()}:${s.querySelectorAll(".gg-cut").length}`).join(" "));
    const waitShotsLayout = async (want, what) => {
      let got = "";
      for (let i = 0; i < 20; i++) {
        got = await shotsLayout();
        if (got === want) return;
        await sleep(250);
      }
      throw new Error(`${what}: Shots sections ${got} != ${want}`);
    };
    const keyInList = async (key) => {
      const box = await (await page.$(".gg-root.gg-shots .gg-grp-wrap")).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2));
      await page.keyboard.down("Control");
      await page.keyboard.press(key);
      await page.keyboard.up("Control");
    };
    /** Icon row New scene; resolves with the id of the new (empty) scene named `name`. */
    const clickNewScene = async (name) => {
      await clickFresh(page, ".gg-root.gg-shots .gg-ir-scene");
      for (let i = 0; i < 30; i++) {
        const g = ((await serverTimeline(page)).groups || []).find((x) => x.name === name);
        if (g) {
          await page.waitForSelector(secSel(g.id), { timeout: 8000 });
          return g.id;
        }
        await sleep(300);
      }
      throw new Error(`New scene did not add "${name}"`);
    };
    /** Drag a cut (pressed on its title) to fraction `fy` of `dstSel`'s box, checking the empty scene `gid` is tinted before release. */
    const dragCutOntoEmptyScene = async (cutId, gid, dstSel, fy) => {
      await page.$eval(dstSel, (el) => el.scrollIntoView({ block: "center" }));
      const pts = await page.evaluate((srcSel, d, f) => {
        const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
        const src = document.querySelector(srcSel);
        const dst = document.querySelector(d);
        if (!wrap || !src || !dst) return null;
        const w = wrap.getBoundingClientRect();
        const s = src.getBoundingClientRect();
        const r = dst.getBoundingClientRect();
        const from = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
        const to = { x: from.x, y: r.y + r.height * f };
        const ok = from.y > w.top && from.y < w.bottom && to.y > w.top + 50 && to.y < w.bottom - 50;
        return { from, to, ok, geo: { wTop: w.top, wBottom: w.bottom, dTop: r.top, dBottom: r.bottom } };
      }, `${cutSel(cutId)} .gg-cut-title`, dstSel, fy);
      if (!pts) throw new Error("drag points not found");
      if (!pts.ok) throw new Error(`drop point too close to the auto-scroll edge ${JSON.stringify(pts.geo)}`);
      await dragHeader(page, pts, {
        beforeUp: async () => {
          const st = await page.evaluate((s) => {
            const sec = document.querySelector(s);
            const ind = document.querySelector(".gg-root.gg-shots .gg-drag-ind");
            return {
              target: !!sec?.classList.contains("gg-drop-target"),
              cross: !!sec?.classList.contains("gg-drop-cross"),
              tinted: document.querySelectorAll(".gg-root.gg-shots .gg-drop-target").length,
              line: !!ind && !ind.hidden,
            };
          }, secSel(gid));
          if (!st.target || !st.cross || st.tinted !== 1) throw new Error(`empty scene not highlighted on dragover: ${JSON.stringify(st)}`);
          if (st.line) throw new Error("drop line shown over an empty scene");
        },
      });
    };

    await runScenario("s12", "Cut dropped on an EMPTY scene (header, then body) moves into it; highlight; Ctrl+Z / Ctrl+Y", async () => {
      await resetBaseline(page);
      await postJson(page, "/gonggan/groups", { pid: testPid, groups: [baseline.groups[0], { ...baseline.groups[1], cut_ids: [c3] }] });
      await reloadShots(page);
      await page.keyboard.press("Escape");
      const e1 = await clickNewScene("Scene 1");
      await waitShotsLayout("Scene A:2 Scene B:1 Scene 1:0 Ungrouped:1", "after New scene");

      // Ungrouped c4 onto the empty scene's header.
      await dragCutOntoEmptyScene(c4, e1, `${secSel(e1)} > .gg-grp-head`, 0.5);
      await waitToast(page, "Moved 1 cut(s)");
      const dropped1 = "Scene A[c1,c2] Scene B[c3] Scene 1[c4] | c1,c2,c3,c4";
      await waitServerState(dropped1, "header drop");
      await waitShotsLayout("Scene A:2 Scene B:1 Scene 1:1", "header drop");
      if ((await sectionCutIds(page, e1)).join() !== c4) throw new Error("c4 not shown inside Scene 1");
      if (JSON.stringify(await domLabels(page)) !== JSON.stringify({ [c1]: "1-1", [c2]: "1-2", [c3]: "2-1", [c4]: "3-1" })) {
        throw new Error(`labels after drop ${JSON.stringify(await domLabels(page))}`);
      }
      await keyInList("KeyZ");
      await waitServerState("Scene A[c1,c2] Scene B[c3] Scene 1[] | c1,c2,c3,c4", "Ctrl+Z");
      await waitShotsLayout("Scene A:2 Scene B:1 Scene 1:0 Ungrouped:1", "Ctrl+Z");
      await keyInList("KeyY");
      await waitServerState(dropped1, "Ctrl+Y");
      await waitShotsLayout("Scene A:2 Scene B:1 Scene 1:1", "Ctrl+Y");

      // A scene cut onto the (empty) body of a second new scene.
      const e2 = await clickNewScene("Scene 2");
      await waitShotsLayout("Scene A:2 Scene B:1 Scene 1:1 Scene 2:0", "second New scene");
      await sleep(300);
      await dragCutOntoEmptyScene(c1, e2, `${secSel(e2)} > .gg-cutlist`, 0.5);
      await waitToast(page, "Moved 1 cut(s)");
      const dropped2 = "Scene A[c2] Scene B[c3] Scene 1[c4] Scene 2[c1] | c2,c3,c4,c1";
      await waitServerState(dropped2, "body drop");
      await waitShotsLayout("Scene A:1 Scene B:1 Scene 1:1 Scene 2:1", "body drop");
      await keyInList("KeyZ");
      await waitServerState("Scene A[c1,c2] Scene B[c3] Scene 1[c4] Scene 2[] | c1,c2,c3,c4", "Ctrl+Z body drop");
      await waitShotsLayout("Scene A:2 Scene B:1 Scene 1:1 Scene 2:0", "Ctrl+Z body drop");
      await keyInList("KeyY");
      await waitServerState(dropped2, "Ctrl+Y body drop");

      const fp = await cutFingerprint(page);
      const changed = baseline.ids.filter((id) => fp[id] !== baseline.fingerprint[id]);
      if (changed.length) throw new Error(`cut data/files/workflow changed for ${changed.join()}`);
    });

    await runScenario("s13", "New scene with a cut of the FIRST scene selected still goes after the last scene, above Ungrouped", async () => {
      await resetBaseline(page);
      await postJson(page, "/gonggan/groups", { pid: testPid, groups: [baseline.groups[0], { ...baseline.groups[1], cut_ids: [c3] }] });
      await reloadShots(page);
      await page.keyboard.press("Escape");
      await page.keyboard.down("Control");
      await page.click(`${cutSel(c1)} .gg-cut-title`);
      await page.keyboard.up("Control");
      await page.waitForSelector(`${cutSel(c1)}.gg-sel`, { timeout: 8000 });
      await clickNewScene("Scene 1");
      await waitServerState("Scene A[c1,c2] Scene B[c3] Scene 1[] | c1,c2,c3,c4", "New scene");
      await waitShotsLayout("Scene A:2 Scene B:1 Scene 1:0 Ungrouped:1", "New scene");
      await clickNewScene("Scene 2");
      await waitServerState("Scene A[c1,c2] Scene B[c3] Scene 1[] Scene 2[] | c1,c2,c3,c4", "second New scene");
      await waitShotsLayout("Scene A:2 Scene B:1 Scene 1:0 Scene 2:0 Ungrouped:1", "second New scene");
      if (!(await page.$(`${cutSel(c1)}.gg-sel`))) throw new Error("New scene dropped the cut selection");
    });

    await runScenario("s14", "New cut with no cut selected goes into Ungrouped at the bottom, below the last scene", async () => {
      await resetBaseline(page);
      await page.keyboard.press("Escape");
      await clickNewScene("Scene 1");
      await waitShotsLayout("Scene A:2 Scene B:2 Scene 1:0", "New scene");
      // Switching projects clears the current cut: a fresh "nothing selected" state.
      const other = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX} other ${runStamp}` });
      createdProjectIds.push(other.project.id);
      await page.evaluate(() => document.querySelector(".gg-root.gg-shots .gg-reload")?.click());
      await page.waitForSelector(`.gg-root.gg-shots .gg-proj option[value="${other.project.id}"]`, { timeout: 30000 });
      await page.select(".gg-root.gg-shots .gg-proj", other.project.id);
      await sleep(1200);
      await selectTestProject(page);
      await waitShotsLayout("Scene A:2 Scene B:2 Scene 1:0", "back on the test project");
      if (await page.$(".gg-root.gg-shots .gg-cut.gg-on, .gg-root.gg-shots .gg-cut.gg-sel")) {
        throw new Error("a cut is still selected after the project switch");
      }
      await page.waitForFunction(() => !document.querySelector(".gg-root.gg-shots .gg-ir-cut")?.disabled, { timeout: 8000 });
      await clickFresh(page, ".gg-root.gg-shots .gg-ir-cut");
      await waitServerState("Scene A[c1,c2] Scene B[c3,c4] Scene 1[] | c1,c2,c3,c4,new", "New cut");
      const tl = await serverTimeline(page);
      const added = tl.cuts.at(-1);
      if (added.group_id) throw new Error(`new cut joined scene ${added.group_id}`);
      await waitShotsLayout("Scene A:2 Scene B:2 Scene 1:0 Ungrouped:1", "New cut");
      const dom = await domCutIds(page);
      if (dom.at(-1) !== added.id) throw new Error("new cut is not the last row of the list");
      if ((await page.$$eval(".gg-root.gg-shots .gg-grp-loose .gg-cut", (els) => els.map((e) => e.dataset.cutId))).join() !== added.id) {
        throw new Error("new cut is not in the Ungrouped section");
      }
      await sleep(400);
      await keyInList("KeyZ");
      await waitServerState("Scene A[c1,c2] Scene B[c3,c4] Scene 1[] | c1,c2,c3,c4", "Ctrl+Z New cut");
      await waitShotsLayout("Scene A:2 Scene B:2 Scene 1:0", "Ctrl+Z New cut");
    });
  } finally {
    try {
      await cleanupProjects(page);
    } catch (_) {
      await cleanupProjectsHttp();
    }
    await closeBrowser(browser);
    browser = null;
  }

  const failed = results.filter((r) => r.status === "FAIL").length;
  if (blockedPromptAttempts > 0) console.log(`FAIL  blocked unsafe POSTs: ${blockedPromptAttempts}`);
  console.log(`SUMMARY  pass=${results.filter((r) => r.status === "PASS").length} skip=${results.filter((r) => r.status === "SKIP").length} fail=${failed}`);
  process.exit(failed || blockedPromptAttempts > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await cleanupProjectsHttp();
  } catch (_) {}
  await closeBrowser(browser);
  process.exit(2);
});
