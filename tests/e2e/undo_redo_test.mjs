/**
 * 0.9.79 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y: Shots (cut reorder, scene group) and Timeline (move, trim, Reset)
 * histories, key scope (canvas and text inputs left alone), history cleared on project switch, and the
 * first-show Timeline height (half of ComfyUI's default bottom panel, fresh browser profile).
 * 0.9.81: Remove from Scene / Delete / Add Cut from the cut context menu, then Ctrl+Z / Ctrl+Y with the
 * pointer moved off the panel (last-clicked panel fallback); a canvas click hands Ctrl+Z back to ComfyUI.
 * ZZ-test- projects only. Blocks POST /prompt and /gonggan/regen; no other request is changed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { submitAskDialog } from "./ask_text_helpers.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-undo-redo";
const BLOCKED_POST = [/\/prompt(\?|$)/, /\/api\/prompt(\?|$)/, /\/gonggan\/regen(\?|$)/, /\/api\/gonggan\/regen(\?|$)/];

const runStamp = Date.now();
const USER_DATA_DIR = path.join(os.tmpdir(), `gg-undo-redo-${runStamp}`);
const createdProjectIds = [];
let blockedPromptAttempts = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isBlockedPost(url, method) {
  if (method !== "POST") return false;
  try {
    return BLOCKED_POST.some((re) => re.test(new URL(url).pathname));
  } catch {
    return false;
  }
}

async function newGuardedPage(browser) {
  const page = await browser.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  page.setDefaultTimeout(60000);
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (isBlockedPost(req.url(), req.method())) {
      blockedPromptAttempts += 1;
      console.error(`BLOCKED UNSAFE POST: ${req.method()} ${req.url()}`);
      req.abort("blockedbyclient");
      return;
    }
    req.continue();
  });
  return page;
}

async function getJson(page, route) {
  return page.evaluate(async (r) => {
    const res = await fetch(`${location.origin}${r}`);
    return res.json();
  }, route);
}

async function postJson(page, route, body) {
  return page.evaluate(async (r, b) => {
    const res = await fetch(`${location.origin}${r}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }, route, body);
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
  await sleep(1500);
}

async function openShotsTab(page) {
  await page.evaluate(() => {
    const st = window.app?.extensionManager?.sidebarTab;
    if (st) st.activeSidebarTabId = "gg-shots";
  });
  await page.waitForSelector(".gg-root.gg-shots", { timeout: 60000 });
}

async function selectProject(page, pid) {
  await page.waitForFunction((p) => [...document.querySelectorAll(".gg-root.gg-shots .gg-proj option")].some((o) => o.value === p), { timeout: 15000 }, pid);
  await page.select(".gg-root.gg-shots .gg-proj", pid);
  await sleep(1200);
}

async function hover(page, sel) {
  const b = await (await page.waitForSelector(sel, { timeout: 15000 })).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 12), { steps: 3 });
  await sleep(150);
}

async function combo(page, mods, key) {
  for (const m of mods) await page.keyboard.down(m);
  try {
    await page.keyboard.press(key);
  } finally {
    for (const m of [...mods].reverse()) await page.keyboard.up(m);
  }
}
const undo = (page) => combo(page, ["Control"], "z");
const redoShiftZ = (page) => combo(page, ["Control", "Shift"], "z");
const redoY = (page) => combo(page, ["Control"], "y");

/** Pointer onto an empty spot of the ComfyUI canvas (no node under it), focus dropped; no click. */
async function hoverCanvasAndBlur(page) {
  const pt = await page.evaluate(() => {
    const lc = window.app?.canvas;
    const onNode = (el, x, y) => {
      try {
        const r = el.getBoundingClientRect();
        const off = [x - r.left, y - r.top];
        const pos = lc?.ds?.convertOffsetToCanvas ? lc.ds.convertOffsetToCanvas(off) : lc?.convertOffsetToCanvas?.(off);
        return !!(pos && lc.graph?.getNodeOnPos?.(pos[0], pos[1]));
      } catch {
        return false;
      }
    };
    for (let fy = 0.15; fy <= 0.45; fy += 0.05) {
      for (let fx = 0.85; fx >= 0.4; fx -= 0.05) {
        const x = Math.round(innerWidth * fx), y = Math.round(innerHeight * fy);
        const el = document.elementFromPoint(x, y);
        if (el && el.tagName === "CANVAS" && !el.closest(".gg-root") && !onNode(el, x, y)) return { x, y };
      }
    }
    return null;
  });
  if (!pt) throw new Error("no point over the ComfyUI canvas found");
  await page.mouse.move(pt.x, pt.y, { steps: 4 });
  await page.evaluate(() => document.activeElement?.blur?.());
  await sleep(150);
  return pt;
}

async function clickCtxItem(page, label) {
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  for (const it of await page.$$(".gg-ctx > .gg-ctx-item")) {
    if ((await page.evaluate((n) => n.textContent?.trim(), it)) === label) {
      await it.click();
      return;
    }
  }
  throw new Error(`Context menu item not found: ${label}`);
}

async function rightClickCut(page, sel) {
  const box = await (await page.waitForSelector(sel, { timeout: 15000 })).boundingBox();
  await page.mouse.click(box.x + 12, box.y + 12, { button: "right" });
}

async function main() {
  if (os.freemem() < MIN_RAM) {
    console.log(`SKIP: ${Math.round(os.freemem() / 1e9)} GB free RAM, need 40+ GB`);
    return;
  }
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: USER_DATA_DIR,
    protocolTimeout: 240000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  const page = await newGuardedPage(browser);
  try {
    await waitForComfy(page);
    await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));
    const a = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-${runStamp}` });
    const pid = a.project.id;
    createdProjectIds.push(pid);
    await postJson(page, "/gonggan/cut/add", { pid });
    await postJson(page, "/gonggan/cut/add", { pid });
    const b = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX}-other-${runStamp}` });
    createdProjectIds.push(b.project.id);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(1500);
    await openShotsTab(page);
    await selectProject(page, pid);
    await page.waitForFunction(() => document.querySelectorAll(".gg-timeline .gg-track .gg-clip").length === 3, { timeout: 20000 });
    await sleep(800);

    const tlNow = () => getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const cutOrder = async () => (await tlNow()).cuts.map((c) => c.id).join();
    const domOrder = () => page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.map((e) => e.dataset.cutId).join());
    const sceneCount = async () => ((await tlNow()).groups || []).length;
    const trackState = async () => {
      const t = await tlNow();
      return JSON.stringify({ order: t.track_order, clips: t.cuts.map((c) => [c.id, c.in, c.sec, c.start]).sort() });
    };
    const waitFor = async (fn, want, label, ms = 6000) => {
      const t0 = Date.now();
      let got;
      while (Date.now() - t0 < ms) {
        got = await fn();
        if (got === want) return;
        await sleep(200);
      }
      throw new Error(`${label}: expected ${want}, got ${got}`);
    };

    // ---- first-show Timeline height (no gg.timelineHeight in a fresh profile)
    const h = await page.evaluate(() => {
      const panel = document.querySelector(".bottom-panel");
      const split = document.querySelector('[data-testid="graph-canvas-gutter"]')?.closest(".p-splitter");
      return { panel: panel?.getBoundingClientRect().height || 0, split: split?.getBoundingClientRect().height || 0, stored: localStorage.getItem("gg.timelineHeight") };
    });
    if (!h.stored) throw new Error("first Timeline show should save gg.timelineHeight");
    if (!(h.panel >= 215 && h.panel <= Math.max(232, h.split * 0.32))) {
      throw new Error(`first-show Timeline height should be ~half of ComfyUI's default (half of the splitter): panel ${h.panel}, splitter ${h.split}`);
    }
    console.log(`PASS  first-show Timeline height ${Math.round(h.panel)}px (splitter ${Math.round(h.split)}px, saved ${h.stored})`);

    // ---- Shots: reorder undo / redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
    const order0 = await cutOrder();
    await page.click(".gg-root.gg-shots .gg-cut");
    await sleep(500);
    await hover(page, ".gg-root.gg-shots .gg-grp-wrap");
    await combo(page, ["Alt"], "ArrowDown");
    await sleep(1200);
    const order1 = await cutOrder();
    if (order1 === order0) throw new Error("test setup: Alt+ArrowDown did not reorder");
    await undo(page);
    await waitFor(cutOrder, order0, "Shots Ctrl+Z (server)");
    await waitFor(domOrder, order0, "Shots Ctrl+Z (list)");
    await redoShiftZ(page);
    await waitFor(cutOrder, order1, "Shots Ctrl+Shift+Z");
    await undo(page);
    await waitFor(cutOrder, order0, "Shots Ctrl+Z again");
    await redoY(page);
    await waitFor(cutOrder, order1, "Shots Ctrl+Y");
    console.log("PASS  Shots reorder: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y");

    // ---- Shots: scene group undo / redo
    await page.evaluate(() => {
      const els = [...document.querySelectorAll(".gg-root.gg-shots .gg-cut")];
      els.slice(0, 2).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: i > 0, clientX: r.x + 12, clientY: r.y + r.height / 2 }));
      });
    });
    await sleep(300);
    await page.click(".gg-root.gg-shots .gg-sel-group");
    await submitAskDialog(page);
    await waitFor(sceneCount, 1, "scene create");
    await hover(page, ".gg-root.gg-shots .gg-grp-wrap");
    await undo(page);
    await waitFor(sceneCount, 0, "Shots Ctrl+Z after scene group");
    await redoY(page);
    await waitFor(sceneCount, 1, "Shots Ctrl+Y after scene group");
    console.log("PASS  Shots scene group: Ctrl+Z ungroups, Ctrl+Y groups again");

    // ---- not intercepted: text input, ComfyUI canvas
    await page.evaluate(() => {
      const inp = document.createElement("input");
      inp.className = "gg-e2e-undo-input";
      document.querySelector(".gg-root.gg-shots")?.appendChild(inp);
      inp.focus();
    });
    await undo(page);
    await sleep(1200);
    if ((await sceneCount()) !== 1) throw new Error("Ctrl+Z in a text input must not undo Shots");
    await page.evaluate(() => document.querySelector(".gg-e2e-undo-input")?.remove());
    const canvasPt = await hoverCanvasAndBlur(page);
    await page.mouse.click(canvasPt.x, canvasPt.y);  // canvas = last interacted area
    await page.evaluate(() => document.activeElement?.blur?.());
    await undo(page);
    await sleep(1200);
    if ((await sceneCount()) !== 1) throw new Error("Ctrl+Z after clicking the ComfyUI canvas must not undo Shots");
    console.log("PASS  Ctrl+Z in a text input or after a canvas click is left to ComfyUI");

    // ---- Timeline: move, trim, Reset
    const clipIds = await page.$$eval(".gg-timeline .gg-track .gg-clip", (els) => els.map((e) => e.dataset.cutId));
    const dragBy = async (sel, dx) => {
      const bb = await (await page.$(sel)).boundingBox();
      const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y, { steps: 4 });
      await page.mouse.move(x + dx, y, { steps: 4 });
      await page.mouse.up();
      await sleep(1500); // 400 ms save debounce + request
    };
    const last = clipIds[clipIds.length - 1];
    const t0 = await trackState();
    await dragBy(`.gg-timeline .gg-clip[data-cut-id="${last}"]`, 120);
    const t1 = await trackState();
    if (t1 === t0) throw new Error("test setup: timeline move did not change the track");
    await hover(page, ".gg-timeline .gg-tl-scroll");
    await undo(page);
    await waitFor(trackState, t0, "Timeline Ctrl+Z after move");
    await redoShiftZ(page);
    await waitFor(trackState, t1, "Timeline Ctrl+Shift+Z after move");
    console.log("PASS  Timeline move: Ctrl+Z / Ctrl+Shift+Z");

    await dragBy(`.gg-timeline .gg-clip[data-cut-id="${clipIds[0]}"] .gg-edge[data-side='r']`, 70);
    const t2 = await trackState();
    if (t2 === t1) throw new Error("test setup: trim did not change the clip");
    await hover(page, ".gg-timeline .gg-tl-scroll");
    await undo(page);
    await waitFor(trackState, t1, "Timeline Ctrl+Z after trim");
    await redoY(page);
    await waitFor(trackState, t2, "Timeline Ctrl+Y after trim");
    console.log("PASS  Timeline trim: Ctrl+Z / Ctrl+Y");

    await page.click(".gg-timeline .gg-reset");
    await page.waitForSelector(".gg-confirm-dialog", { timeout: 8000 });
    await page.click(".gg-confirm-ok");
    await sleep(1500);
    const t3 = await trackState();
    if (t3 === t2) throw new Error("test setup: Reset did not change the track");
    await hover(page, ".gg-timeline .gg-tl-scroll");
    await undo(page);
    await waitFor(trackState, t2, "Timeline Ctrl+Z after Reset");
    console.log("PASS  Timeline Reset: Ctrl+Z restores the edit before Reset");

    // ---- Shots keys stay Shots while the Timeline keeps focus
    const scenesBefore = await sceneCount();
    await hover(page, ".gg-root.gg-shots .gg-grp-wrap");
    await undo(page);
    await waitFor(sceneCount, scenesBefore - 1, "Ctrl+Z over Shots after a timeline click");
    if ((await trackState()) !== t2) throw new Error("Ctrl+Z over Shots must not touch the timeline");
    console.log("PASS  pointer over Shots wins over Timeline focus");

    // ---- Shots: Remove from Scene via the cut context menu, then Ctrl+Z with the pointer off the panel
    // (the menu lives on document.body: once it closes Shots is neither hovered nor focused)
    await hover(page, ".gg-root.gg-shots .gg-grp-wrap");
    await redoY(page);
    await waitFor(sceneCount, 1, "Ctrl+Y groups again before Remove from Scene");
    const sceneSize = async () => ((await tlNow()).groups || [])[0]?.cut_ids?.length ?? 0;
    const size0 = await sceneSize();
    if (size0 < 2) throw new Error(`test setup: scene should have 2+ cuts, has ${size0}`);
    const tBeforeRemove = await trackState();
    await rightClickCut(page, ".gg-root.gg-shots .gg-grp-sec[data-group-id] .gg-cut");
    await clickCtxItem(page, "Remove from Scene");
    await waitFor(sceneSize, size0 - 1, "Remove from Scene (context menu)");
    await hoverCanvasAndBlur(page);
    await undo(page);
    await waitFor(sceneSize, size0, "Ctrl+Z right after Remove from Scene");
    if ((await trackState()) !== tBeforeRemove) throw new Error("Ctrl+Z after Remove from Scene must not touch the timeline");
    await redoY(page);
    await waitFor(sceneSize, size0 - 1, "Ctrl+Y after Remove from Scene");
    await undo(page);
    await waitFor(sceneSize, size0, "Ctrl+Z again after Remove from Scene");
    console.log("PASS  Remove from Scene (context menu) -> Ctrl+Z / Ctrl+Y with the pointer over the canvas");

    // ---- Shots: Delete (soft) -> Ctrl+Z restores it in place; Ctrl+Y deletes again
    const trashLen = async () => {
      const d = await getJson(page, `/gonggan/trash?pid=${encodeURIComponent(pid)}`);
      return (Array.isArray(d) ? d : d.items || d.cuts || []).length;
    };
    const orderD0 = await cutOrder();
    const trash0 = await trashLen();
    const victim = orderD0.split(",")[1];
    await rightClickCut(page, `.gg-root.gg-shots .gg-cut[data-cut-id="${victim}"]`);
    await clickCtxItem(page, "Delete");
    await waitFor(async () => (await cutOrder()).includes(victim), false, "Delete (context menu)");
    await hoverCanvasAndBlur(page);
    await undo(page);
    await waitFor(cutOrder, orderD0, "Ctrl+Z after Delete restores the cut in place");
    await waitFor(sceneSize, size0, "Ctrl+Z after Delete keeps the scene");
    await waitFor(trashLen, trash0, "Ctrl+Z after Delete empties it from Trash");
    await redoY(page);
    await waitFor(async () => (await cutOrder()).includes(victim), false, "Ctrl+Y after Delete");
    await undo(page);
    await waitFor(cutOrder, orderD0, "Ctrl+Z again after Delete");
    console.log("PASS  Delete -> Ctrl+Z restores in place, Ctrl+Y deletes again");

    // ---- Shots: Add Cut -> Ctrl+Z soft-deletes it; Ctrl+Y brings the same cut back
    const orderA0 = await cutOrder();
    await rightClickCut(page, ".gg-root.gg-shots .gg-cut");
    await clickCtxItem(page, "Add Cut");
    await waitFor(async () => (await cutOrder()).split(",").length, 4, "Add Cut (context menu)");
    const orderA1 = await cutOrder();
    const added = orderA1.split(",").find((id) => !orderA0.split(",").includes(id));
    await sleep(1500);  // the new cut's workflow load settles
    await hoverCanvasAndBlur(page);
    await undo(page);
    await waitFor(cutOrder, orderA0, "Ctrl+Z after Add Cut");
    await waitFor(trashLen, trash0 + 1, "Ctrl+Z after Add Cut moves it to Trash");
    await redoY(page);
    await waitFor(cutOrder, orderA1, `Ctrl+Y after Add Cut brings ${added} back in place`);
    await undo(page);
    await waitFor(cutOrder, orderA0, "Ctrl+Z again after Add Cut");
    console.log("PASS  Add Cut -> Ctrl+Z soft-deletes, Ctrl+Y restores the same cut");

    // ---- project switch clears the history
    await selectProject(page, b.project.id);
    await selectProject(page, pid);
    await page.waitForFunction(() => document.querySelectorAll(".gg-timeline .gg-track .gg-clip").length === 3, { timeout: 20000 });
    const tBefore = await trackState();
    await hover(page, ".gg-timeline .gg-tl-scroll");
    await undo(page);
    await page.waitForFunction(() => /Nothing to undo/.test(document.querySelector(".gg-toast-sum")?.textContent || ""), { timeout: 5000 });
    await sleep(1200);
    if ((await trackState()) !== tBefore) throw new Error("Ctrl+Z after a project switch must not change the timeline");
    console.log("PASS  project switch clears undo history");

    if (blockedPromptAttempts) throw new Error(`blocked ${blockedPromptAttempts} unsafe POST(s)`);
    console.log("PASS  undo/redo e2e complete");
  } finally {
    for (const p of createdProjectIds.reverse()) {
      try { await postJson(page, "/gonggan/project/delete", { pid: p }); } catch (_) {}
    }
    await browser.close();
    try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
