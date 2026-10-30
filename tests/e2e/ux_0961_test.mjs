/**
 * UX 0.9.57-0.9.60: shortcut scope (Delete), right-click menus (scene header, timeline clip, cut card),
 * Shots sidebar shortcuts (Up/Down, Alt+G, Alt+Shift+G, Alt+N, F2, Ctrl+G ignored), drop highlight while dragging.
 * ZZ temp native project (2 scenes x 2 cuts), soft-deleted at the end. Blocks POST /prompt and /gonggan/regen.
 * Regen / Send last output are never clicked.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { submitAskDialog, dismissAskDialog } from "./ask_text_helpers.mjs";
import { waitForDomCutCountSync, getServerCutCount, countDomCuts } from "./dom_sync_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCREENS_DIR = path.join(REPO_ROOT, "tests/screens");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-ux0961";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const createdProjectIds = [];
let blockedPromptAttempts = 0;
let testPid = "";
/** @type {{ ids: string[], groups: { id: string, name: string, cut_ids: string[], collapsed: boolean }[] }} */
const baseline = { ids: [], groups: [] };

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

async function serverTimeline(page) {
  return page.evaluate(async (pid) => {
    const res = await fetch(`/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    if (!res.ok) throw new Error(`timeline HTTP ${res.status}`);
    return res.json();
  }, testPid);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-ux0961-${runStamp}`);
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

/** Counts every in-app confirm modal that appears (cut Delete must never show one). */
async function installConfirmWatcher(page) {
  await page.evaluate(() => {
    window.__ggConfirmSeen = 0;
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && (n.matches?.(".gg-confirm-backdrop") || n.querySelector?.(".gg-confirm-dialog"))) {
            window.__ggConfirmSeen += 1;
          }
        }
      }
    }).observe(document.body, { childList: true });
  });
}

const confirmSeen = (page) => page.evaluate(() => window.__ggConfirmSeen || 0);

async function hoverShots(page) {
  await page.waitForSelector(".gg-root.gg-shots .gg-head", { timeout: 15000 });
  await page.hover(".gg-root.gg-shots .gg-head");
  await sleep(150);
}

async function canvasPoint(page) {
  const pt = await page.evaluate(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (let fy = 0.2; fy <= 0.6; fy += 0.1) {
      for (let fx = 0.85; fx >= 0.4; fx -= 0.05) {
        const x = Math.round(W * fx);
        const y = Math.round(H * fy);
        const el = document.elementFromPoint(x, y);
        if (el && el.tagName === "CANVAS" && !el.closest(".gg-root, .gg-timeline")) return { x, y };
      }
    }
    return null;
  });
  if (!pt) throw new Error("no point over the ComfyUI canvas found");
  return pt;
}

async function hoverCanvasAndBlur(page) {
  const pt = await canvasPoint(page);
  await page.mouse.move(pt.x, pt.y, { steps: 4 });
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    try {
      window.app?.canvas?.deselectAll?.();
    } catch (_) {}
  });
  await sleep(150);
  const inScope = await page.evaluate(() => {
    const ae = document.activeElement;
    return !!(ae && ae !== document.body && ae.closest(".gg-root.gg-shots, .gg-timeline"));
  });
  if (inScope) throw new Error("focus is still inside Shots/Timeline after blur");
}

const cutSel = (id) => `.gg-root.gg-shots .gg-cut[data-cut-id="${id}"]`;
const secSel = (gid) => `.gg-root.gg-shots .gg-grp-sec[data-group-id="${gid}"]`;

async function clickCut(page, id, { ctrl = false } = {}) {
  await page.waitForSelector(`${cutSel(id)} .gg-cut-title`, { timeout: 15000 });
  await page.$eval(cutSel(id), (el) => el.scrollIntoView({ block: "nearest" }));
  if (ctrl) await page.keyboard.down("Control");
  try {
    await page.click(`${cutSel(id)} .gg-cut-title`);
  } finally {
    if (ctrl) await page.keyboard.up("Control");
  }
  await sleep(300);
}

const currentCutId = (page) =>
  page.evaluate(() => document.querySelector(".gg-root.gg-shots .gg-cut.gg-on")?.dataset.cutId || "");

const selectedCutIds = (page) =>
  page.$$eval(".gg-root.gg-shots .gg-cut.gg-sel", (els) => els.map((e) => e.dataset.cutId));

const domCutIds = (page) => page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.map((e) => e.dataset.cutId));

const sectionCutIds = (page, gid) =>
  page.$$eval(`.gg-root.gg-shots .gg-grp-sec[data-group-id="${gid}"] .gg-cut`, (els) => els.map((e) => e.dataset.cutId));

async function pressCombo(page, mods, key) {
  for (const m of mods) await page.keyboard.down(m);
  try {
    await page.keyboard.press(key);
  } finally {
    for (const m of [...mods].reverse()) await page.keyboard.up(m);
  }
}

async function rightClickAt(page, selector) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.$eval(selector, (el) => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
  const box = await (await page.$(selector)).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.mouse.click(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2, { button: "right" });
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
}

const ctxLabels = (page) => page.$$eval(".gg-ctx > .gg-ctx-item", (els) => els.map((e) => e.textContent.trim()));

async function clickCtxItem(page, label) {
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  const items = await page.$$(".gg-ctx > .gg-ctx-item");
  for (const it of items) {
    const t = await page.evaluate((n) => n.textContent?.trim(), it);
    if (t === label) {
      await it.click();
      return;
    }
  }
  throw new Error(`Context menu item not found: ${label}`);
}

async function closeCtx(page) {
  if (!(await page.$(".gg-ctx"))) return;
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".gg-ctx"), { timeout: 5000 });
}

async function waitDeleteToastAndUndo(page, deletedId, expectCount) {
  await page.waitForFunction(
    () => {
      const host = document.getElementById("gg-toast-host");
      return !!(host && !host.hidden && host.querySelector(".gg-toast-sum")?.textContent.trim() === "Moved 1 cut to Trash");
    },
    { timeout: 10000 },
  );
  await waitForDomCutCountSync(page);
  if ((await countDomCuts(page)) !== expectCount - 1) throw new Error(`delete should leave ${expectCount - 1} cuts`);
  if ((await domCutIds(page)).includes(deletedId)) throw new Error("deleted cut is still listed");
  await page.click("#gg-toast-host .gg-toast-action");
  await page.waitForFunction((id) => !!document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${id}"]`), { timeout: 10000 }, deletedId);
  await waitForDomCutCountSync(page);
  if ((await countDomCuts(page)) !== expectCount) throw new Error("Undo should restore the deleted cut");
}

async function reloadShots(page) {
  await page.click(".gg-root.gg-shots .gg-reload");
  await sleep(1200);
  await waitForDomCutCountSync(page);
}

/** Back to 4 cuts, 2 scenes x 2, baseline order; clears selection and open menus. */
async function resetBaseline(page) {
  await closeCtx(page);
  const tl = await serverTimeline(page);
  const live = (tl.cuts || []).map((c) => c.id);
  const missing = baseline.ids.filter((id) => !live.includes(id));
  if (missing.length) throw new Error(`baseline cuts missing (not restored): ${missing.join(",")}`);
  const extra = live.filter((id) => !baseline.ids.includes(id));
  if (extra.length) await postJson(page, "/gonggan/cut/delete", { pid: testPid, cuts: extra });
  await postJson(page, "/gonggan/groups", { pid: testPid, groups: baseline.groups });
  await postJson(page, "/gonggan/cut/reorder", { pid: testPid, order: baseline.ids });
  await postJson(page, "/gonggan/edit/reset", { pid: testPid });
  await reloadShots(page);
  await hoverShots(page);
  await page.keyboard.press("Escape");
  await sleep(200);
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
    { id: `ux-a-${runStamp}`, name: "Scene A", cut_ids: ids.slice(0, 2), collapsed: false },
    { id: `ux-b-${runStamp}`, name: "Scene B", cut_ids: ids.slice(2, 4), collapsed: false },
  ];
  await postJson(page, "/gonggan/groups", { pid: testPid, groups: baseline.groups });
  await page.waitForFunction(
    (pid) => !!document.querySelector(`.gg-root.gg-shots .gg-proj option[value="${pid}"]`),
    { timeout: 30000 },
    testPid,
  ).catch(async () => {
    await page.evaluate(() => document.querySelector(".gg-root.gg-shots .gg-reload")?.click());
    await page.waitForSelector(`.gg-root.gg-shots .gg-proj option[value="${testPid}"]`, { timeout: 30000 });
  });
  for (let i = 0; i < 12; i++) {
    await page.select(".gg-root.gg-shots .gg-proj", testPid);
    await sleep(600);
    if ((await page.$eval(".gg-root.gg-shots .gg-proj", (el) => el.value)) === testPid) break;
  }
  await reloadShots(page);
  const ids2 = await domCutIds(page);
  if (ids2.join() !== ids.join()) throw new Error(`Shots order differs from server: ${ids2.join()}`);
}

async function ensureTimelineOpen(page) {
  const visible = () =>
    page.evaluate(() => {
      const el = document.querySelector(".gg-timeline");
      return !!(el && el.offsetParent);
    });
  if (!(await visible())) {
    await page.click(".gg-root.gg-shots .gg-timeline-toggle");
    await sleep(800);
  }
  if (!(await visible())) throw new Error("timeline panel did not open");
  await page.waitForFunction(() => document.querySelectorAll(".gg-timeline .gg-track .gg-clip[data-cut-id]").length === 4, {
    timeout: 15000,
  });
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
      await page.screenshot({ path: path.join(SCREENS_DIR, `ux0961-fail-${id}-${runStamp}.png`) });
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
      console.log(`SKIP  ux 0.9.61 e2e: ${e.message}`);
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
      await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));
      await openShotsTab(page);
      await installConfirmWatcher(page);
      await setupProject(page);
    });
    if (!testPid || baseline.ids.length !== 4) throw new Error("setup failed; aborting");
    const [c1, c2, c3, c4] = baseline.ids;
    const [gA, gB] = baseline.groups.map((g) => g.id);

    await runScenario("a1", "Delete over canvas (sidebar blurred): no modal, no delete", async () => {
      await resetBaseline(page);
      await clickCut(page, c1);
      if ((await currentCutId(page)) !== c1) throw new Error("cut click did not select");
      const seen0 = await confirmSeen(page);
      await hoverCanvasAndBlur(page);
      await page.keyboard.press("Delete");
      await sleep(900);
      if ((await confirmSeen(page)) !== seen0 || (await page.$(".gg-confirm-dialog"))) throw new Error("confirm modal appeared");
      const toast = await page.evaluate(() => {
        const host = document.getElementById("gg-toast-host");
        return host && !host.hidden ? host.querySelector(".gg-toast-sum")?.textContent.trim() : "";
      });
      if (/Trash/.test(toast || "")) throw new Error(`Delete over canvas deleted a cut (toast: ${toast})`);
      if ((await countDomCuts(page)) !== 4 || (await getServerCutCount(page)) !== 4) throw new Error("cut count changed");
    });

    await runScenario("a2", "Delete over Shots: moves cut to Trash with Undo (no confirm by design), Undo restores", async () => {
      if ((await currentCutId(page)) !== c1) await clickCut(page, c1);
      const seen0 = await confirmSeen(page);
      await hoverShots(page);
      await page.keyboard.press("Delete");
      await waitDeleteToastAndUndo(page, c1, 4);
      if ((await confirmSeen(page)) !== seen0) throw new Error("cut Delete showed a confirm modal");
    });

    await runScenario("b1", "Scene header menu: items, Select cuts, Add Cut; header × delete confirm (cancel)", async () => {
      await resetBaseline(page);
      await rightClickAt(page, `${secSel(gA)} .gg-grp-title`);
      const labels = await ctxLabels(page);
      const want = ["Add Cut", "Select cuts", "Collapse", "Rename", "Ungroup"];
      if (labels.join("|") !== want.join("|")) throw new Error(`scene menu items: ${labels.join("|")}`);
      await clickCtxItem(page, "Select cuts");
      await sleep(400);
      const sel = (await selectedCutIds(page)).sort();
      if (sel.join() !== [c1, c2].sort().join()) throw new Error(`Select cuts selected ${sel.join()} (want scene A cuts)`);

      await rightClickAt(page, `${secSel(gB)} .gg-grp-title`);
      await clickCtxItem(page, "Add Cut");
      await page.waitForFunction((gid) => document.querySelectorAll(`.gg-root.gg-shots .gg-grp-sec[data-group-id="${gid}"] .gg-cut`).length === 3, { timeout: 10000 }, gB);
      await waitForDomCutCountSync(page);
      const tl = await serverTimeline(page);
      const added = tl.cuts.find((c) => !baseline.ids.includes(c.id));
      if (!added) throw new Error("no new cut on server");
      if (added.group_id !== gB) throw new Error(`new cut group ${added.group_id}, want scene B`);
      if (!(await sectionCutIds(page, gB)).includes(added.id)) throw new Error("new cut not shown in scene B");
      if ((await sectionCutIds(page, gA)).length !== 2) throw new Error("scene A should keep 2 cuts");

      const seen0 = await confirmSeen(page);
      await page.click(`${secSel(gA)} .gg-grp-del`);
      await page.waitForSelector(".gg-confirm-dialog", { timeout: 8000 });
      if ((await confirmSeen(page)) !== seen0 + 1) throw new Error("confirm watcher did not count the scene modal");
      await page.click(".gg-confirm-cancel");
      await page.waitForFunction(() => !document.querySelector(".gg-confirm-dialog"), { timeout: 5000 });
      await sleep(400);
      const tl2 = await serverTimeline(page);
      if (!(tl2.groups || []).some((g) => g.id === gA)) throw new Error("Cancel deleted the scene");
      if (!(await page.$(secSel(gA)))) throw new Error("scene A section gone after Cancel");
    });

    await runScenario("b2", "Timeline clip menu: items, Open cut, Delete (Trash + Undo)", async () => {
      await resetBaseline(page);
      await ensureTimelineOpen(page);
      await clickCut(page, c1);
      const clip = (id) => `.gg-timeline .gg-track .gg-clip[data-cut-id="${id}"]`;
      await rightClickAt(page, clip(c3));
      const labels = await ctxLabels(page);
      const ok =
        labels.length === 7 &&
        labels[0] === "Open cut" &&
        labels[1] === "Regen" &&
        labels[2] === "Send last output" &&
        /needs redo/i.test(labels[3]) &&
        labels[4] === "Rename…" &&
        labels[5] === "Apply order to cuts" &&
        labels[6] === "Delete";
      if (!ok) throw new Error(`clip menu items: ${labels.join("|")}`);
      await clickCtxItem(page, "Open cut");
      await sleep(500);
      if ((await currentCutId(page)) !== c3) throw new Error(`Open cut selected ${await currentCutId(page)}, want ${c3}`);

      const seen0 = await confirmSeen(page);
      await rightClickAt(page, clip(c4));
      await clickCtxItem(page, "Delete");
      await waitDeleteToastAndUndo(page, c4, 4);
      if ((await confirmSeen(page)) !== seen0) throw new Error("clip Delete showed a confirm modal");
    });

    await runScenario("b3", "Cut card menu: Group / Ungroup first, includes Regen and Send last output (not clicked)", async () => {
      await resetBaseline(page);
      await rightClickAt(page, `${cutSel(c2)} .gg-cut-title`);
      const labels = await ctxLabels(page);
      if (labels[0] !== "Group" || labels[1] !== "Ungroup") throw new Error(`cut menu should start with Group, Ungroup: ${labels.join("|")}`);
      for (const l of ["Regen", "Send last output", "Delete"]) {
        if (!labels.includes(l)) throw new Error(`cut menu missing ${l}: ${labels.join("|")}`);
      }
      if (new Set(labels).size !== labels.length) throw new Error(`cut menu has duplicate items: ${labels.join("|")}`);
      await closeCtx(page);
    });

    await runScenario("c1", "ArrowDown/ArrowUp over Shots change cut; ignored over canvas", async () => {
      await resetBaseline(page);
      await clickCut(page, c1);
      await hoverShots(page);
      await page.keyboard.press("ArrowDown");
      await sleep(300);
      if ((await currentCutId(page)) !== c2) throw new Error(`ArrowDown -> ${await currentCutId(page)}, want ${c2}`);
      await page.keyboard.press("ArrowDown");
      await sleep(300);
      if ((await currentCutId(page)) !== c3) throw new Error(`2nd ArrowDown -> ${await currentCutId(page)}, want ${c3}`);
      await page.keyboard.press("ArrowUp");
      await sleep(300);
      if ((await currentCutId(page)) !== c2) throw new Error(`ArrowUp -> ${await currentCutId(page)}, want ${c2}`);
      await hoverCanvasAndBlur(page);
      await page.keyboard.press("ArrowDown");
      await sleep(300);
      if ((await currentCutId(page)) !== c2) throw new Error("ArrowDown over canvas changed the Shots selection");
    });

    await runScenario("c2", "Ctrl+G does not group; Alt+G groups 2 selected cuts into a new scene", async () => {
      await resetBaseline(page);
      await clickCut(page, c2);
      await clickCut(page, c3, { ctrl: true });
      const sel = (await selectedCutIds(page)).sort();
      if (sel.join() !== [c2, c3].sort().join()) throw new Error(`selection ${sel.join()}`);
      await hoverShots(page);
      await pressCombo(page, ["Control"], "g");
      await sleep(700);
      if (await page.$(".gg-ask-input")) {
        await dismissAskDialog(page);
        throw new Error("Ctrl+G opened the scene dialog");
      }
      if (((await serverTimeline(page)).groups || []).length !== 2) throw new Error("Ctrl+G changed scenes");
      const sel2 = (await selectedCutIds(page)).sort();
      if (sel2.join() !== [c2, c3].sort().join()) throw new Error("selection lost after Ctrl+G");

      const name = `AltG ${runStamp}`;
      await hoverShots(page);
      await pressCombo(page, ["Alt"], "g");
      await submitAskDialog(page, { text: name });
      await page.waitForFunction(
        (n) => [...document.querySelectorAll(".gg-root.gg-shots .gg-grp-title")].some((t) => t.textContent.includes(n)),
        { timeout: 10000 },
        name,
      );
      const groups = (await serverTimeline(page)).groups || [];
      const g = groups.find((x) => x.name === name);
      if (groups.length !== 3 || !g) throw new Error(`expected 3 scenes incl. ${name}, got ${groups.map((x) => x.name).join("|")}`);
      if ([...g.cut_ids].sort().join() !== [c2, c3].sort().join()) throw new Error(`new scene cuts ${g.cut_ids.join()}`);
    });

    await runScenario("c3", "Alt+Shift+G removes cut from scene; Alt+N adds a cut", async () => {
      await resetBaseline(page);
      await clickCut(page, c2);
      await hoverShots(page);
      await pressCombo(page, ["Alt", "Shift"], "g");
      await page.waitForFunction(
        (id) => !!document.querySelector(`.gg-root.gg-shots .gg-grp-loose .gg-cut[data-cut-id="${id}"]`),
        { timeout: 10000 },
        c2,
      );
      const tl = await serverTimeline(page);
      if ((tl.cuts.find((c) => c.id === c2) || {}).group_id) throw new Error("server still has the cut in a scene");
      if ((tl.groups || []).some((g) => (g.cut_ids || []).includes(c2))) throw new Error("cut still listed in a scene");

      const before = await countDomCuts(page);
      await clickCut(page, c4);
      await hoverShots(page);
      await pressCombo(page, ["Alt"], "n");
      await page.waitForFunction((n) => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === n + 1, { timeout: 10000 }, before);
      await waitForDomCutCountSync(page);
    });

    await runScenario("c4", "F2 opens rename prompt; Escape cancels", async () => {
      await resetBaseline(page);
      await clickCut(page, c1);
      const nameBefore = (await serverTimeline(page)).cuts.find((c) => c.id === c1)?.name;
      await hoverShots(page);
      await page.keyboard.press("F2");
      await page.waitForSelector(".gg-ask-input", { visible: true, timeout: 8000 });
      const info = await page.evaluate(() => ({
        label: document.querySelector(".gg-ask-dialog")?.getAttribute("aria-label") || "",
        value: document.querySelector(".gg-ask-input")?.value ?? "",
      }));
      if (info.label !== "Cut name") throw new Error(`F2 dialog is "${info.label}", want "Cut name"`);
      if (info.value !== (nameBefore || "")) throw new Error(`rename prefill "${info.value}" != "${nameBefore}"`);
      await dismissAskDialog(page);
      await sleep(400);
      const nameAfter = (await serverTimeline(page)).cuts.find((c) => c.id === c1)?.name;
      if (nameAfter !== nameBefore) throw new Error("Escape renamed the cut");
    });

    await runScenario("d", "Drag over another scene highlights it (gg-drop-target); Escape cancels, order unchanged", async () => {
      await resetBaseline(page);
      await page.$eval(cutSel(c2), (el) => el.scrollIntoView({ block: "center" }));
      await sleep(300);
      const pts = await page.evaluate((a, b) => {
        const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
        const src = document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${a}"] .gg-cut-title`);
        const dst = document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${b}"]`);
        if (!wrap || !src || !dst) return null;
        const w = wrap.getBoundingClientRect();
        const s = src.getBoundingClientRect();
        const d = dst.getBoundingClientRect();
        const from = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
        const to = { x: d.x + d.width / 2, y: d.y + Math.max(4, d.height * 0.25) };
        const inside = (p) => p.y > w.top + 50 && p.y < w.bottom - 50;
        return { from, to, ok: inside(from) && inside(to) };
      }, c2, c3);
      if (!pts) throw new Error("drag points not found");
      if (!pts.ok) return { skip: "source and target cards not both visible away from the auto-scroll edges" };
      const orderBefore = (await serverTimeline(page)).cuts.map((c) => c.id);

      await page.mouse.move(pts.from.x, pts.from.y);
      await page.mouse.down();
      let released = false;
      try {
        await sleep(80);
        await page.mouse.move(pts.to.x, pts.to.y, { steps: 14 });
        await sleep(250);
        const hi = await page.evaluate((ga, gb) => ({
          b: !!document.querySelector(`.gg-root.gg-shots .gg-grp-sec[data-group-id="${gb}"]`)?.classList.contains("gg-drop-target"),
          a: !!document.querySelector(`.gg-root.gg-shots .gg-grp-sec[data-group-id="${ga}"]`)?.classList.contains("gg-drop-target"),
        }), gA, gB);
        if (!hi.b) throw new Error("scene B section lacks gg-drop-target while dragging over it");
        if (hi.a) throw new Error("scene A section is highlighted while dragging over scene B");
        await page.keyboard.press("Escape");
        await sleep(250);
        const after = await page.evaluate(() => ({
          targets: document.querySelectorAll(".gg-root.gg-shots .gg-drop-target").length,
          dragging: !!document.querySelector(".gg-root.gg-shots .gg-grp-wrap.gg-reorder-dragging"),
        }));
        if (after.targets) throw new Error("gg-drop-target still present after Escape");
        if (after.dragging) throw new Error("drag still active after Escape");
        await page.mouse.up();
        released = true;
      } finally {
        if (!released) await page.mouse.up().catch(() => {});
      }
      await sleep(1200);
      const orderAfter = (await serverTimeline(page)).cuts.map((c) => c.id);
      if (orderAfter.join() !== orderBefore.join()) throw new Error("server order changed after cancelled drag");
      if ((await domCutIds(page)).join() !== orderBefore.join()) throw new Error("Shots order changed after cancelled drag");
      if ((await sectionCutIds(page, gA)).join() !== [c1, c2].join()) throw new Error("scene A membership changed");
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
