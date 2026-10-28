/**
 * E2E: cut switch latency, network churn, tab leak, main-thread blocking (regression).
 * Run: node tests/e2e/switch_perf_test.mjs  (requires live ComfyUI + 40GB+ free RAM)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { waitForDomCutCountSync } from "./dom_sync_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCREENS_DIR = path.join(REPO_ROOT, "tests/screens");
const JSON_PATH = path.join(SCREENS_DIR, "switch_perf.json");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40e9;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ switchperf";
const MARKER = "ZZ_SWITCHPERF_MARKER";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const SWITCH_CLEAN_MEDIAN_MS = Number(process.env.SWITCH_CLEAN_MEDIAN_MS || 250);
const SWITCH_CLEAN_MAX_MS = Number(process.env.SWITCH_CLEAN_MAX_MS || 1500);
const SWITCH_MOD_MEDIAN_MS = Number(process.env.SWITCH_MOD_MEDIAN_MS || 400);

const CYCLES = 15;
const runStamp = Date.now();
const createdProjectIds = [];
let blockedPromptAttempts = 0;
let workflowPathsBefore = [];

/** @type {{ t: number, method: string, url: string, bodyBytes: number }[]} */
const networkLog = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkRam(label) {
  const free = os.freemem();
  if (free < MIN_RAM) {
    const err = new Error(`RAM check failed (${label}): ${Math.round(free / 1e9)} GB free, need 40+ GB`);
    err.skipped = true;
    throw err;
  }
}

function ensureDirs() {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
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

function isSaveRequest(method, pathname) {
  if (method !== "POST" && method !== "PUT") return false;
  return /\/userdata(\/|$)/.test(pathname) || /\/workflows(\/|$)/.test(pathname) || /\/api\/userdata/.test(pathname);
}

function isGongganRequest(pathname) {
  return /\/gonggan\//.test(pathname) || /\/api\/gonggan\//.test(pathname);
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
    let bodyBytes = 0;
    try {
      const pd = req.postData();
      if (pd) bodyBytes = Buffer.byteLength(pd, "utf8");
    } catch (_) {}
    networkLog.push({ t: Date.now(), method, url, bodyBytes });
    req.continue();
  });
}

const pluginConsoleErrors = [];

function wireConsole(page) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    const loc = msg.location();
    const url = loc?.url || "";
    if (
      /gonggan/i.test(text) ||
      /comfyui-gonggan-cut/i.test(url) ||
      /\/web\/gonggan/i.test(url) ||
      /gg_progress_core/i.test(url)
    ) {
      pluginConsoleErrors.push({ text, url: url.slice(-120) });
    }
  });
  page.on("pageerror", (err) => {
    const stack = String(err.stack || err.message || err);
    if (/gonggan|gg_progress/i.test(stack)) {
      pluginConsoleErrors.push({ text: stack.slice(0, 500), url: "pageerror" });
    }
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

async function fetchWorkflowPaths(page) {
  const { data } = await getJson(page, "/api/userdata?dir=workflows&recurse=true&split=false");
  if (Array.isArray(data)) {
    return data
      .map((x) => (typeof x === "string" ? x : x.path || x.name || ""))
      .filter(Boolean)
      .map((p) => String(p).replace(/^\/+/, ""));
  }
  if (data && typeof data === "object") return Object.keys(data);
  return [];
}

function pickTemplateRef(paths) {
  const norm = (p) => String(p).replace(/^\/+/, "");
  const base = (p) => norm(p).replace(/^.*\//, "").toLowerCase();
  return (
    paths.find((p) => base(p).startsWith("zz") && base(p).endsWith(".json")) ||
    paths.find((p) => !/^cut\d+\.json$/i.test(base(p)) && base(p).endsWith(".json")) ||
    paths.find((p) => base(p).endsWith(".json")) ||
    ""
  );
}

async function pickUsableTemplateRef(page, paths) {
  const norm = (p) => String(p).replace(/^\/+/, "");
  const base = (p) => norm(p).replace(/^.*\//, "").toLowerCase();
  const cands = paths.filter(
    (p) => base(p).endsWith(".json") && !/^cut\d+\.json$/i.test(base(p)) && !norm(p).startsWith("gonggan/") && !/_api\.json$/i.test(base(p))
  );
  cands.sort((a, b) => (base(b).startsWith("zz") ? 1 : 0) - (base(a).startsWith("zz") ? 1 : 0));
  for (const p of cands.slice(0, 40)) {
    const ok = await page.evaluate(async (rel) => {
      try {
        const r = await fetch(`/api/userdata/${encodeURIComponent("workflows/" + rel)}`);
        if (!r.ok) return false;
        const j = await r.json();
        return Array.isArray(j.nodes) && j.nodes.length > 0 && j.nodes.length < 80;
      } catch (_) {
        return false;
      }
    }, norm(p));
    if (ok) return norm(p);
  }
  return pickTemplateRef(paths);
}

async function deleteWorkflowFile(page, relPath) {
  const enc = encodeURIComponent(relPath.replace(/^\/+/, ""));
  await page.evaluate(async (p) => {
    await fetch(`${location.origin}/api/userdata/${p}`, { method: "DELETE" });
  }, enc);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-switchperf-${runStamp}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir,
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

async function installMainThreadMonitors(page) {
  await page.evaluateOnNewDocument(() => {
    const state = {
      longTasks: [],
      rafGaps: [],
      rafLast: 0,
      rafId: 0,
      winStart: 0,
      installed: false,
    };

    function install() {
      if (state.installed) return;
      state.installed = true;
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            state.longTasks.push({ start: e.startTime, duration: e.duration });
            if (state.longTasks.length > 5000) state.longTasks.splice(0, 2000);
          }
        });
        obs.observe({ type: "longtask", buffered: true });
      } catch (_) {}

      const loop = () => {
        const now = performance.now();
        if (state.rafLast > 0) {
          const gap = now - state.rafLast;
          if (gap > 16) {
            state.rafGaps.push({ at: now, gap });
            if (state.rafGaps.length > 5000) state.rafGaps.splice(0, 2000);
          }
        }
        state.rafLast = now;
        state.rafId = requestAnimationFrame(loop);
      };
      state.rafId = requestAnimationFrame(loop);
    }

    globalThis.__ggSwitchPerf = {
      install,
      windowStart() {
        state.winStart = performance.now();
      },
      windowEnd() {
        const t0 = state.winStart;
        const t1 = performance.now();
        let longestBlockMs = 0;
        let totalBlockedMs = 0;
        for (const e of state.longTasks) {
          const end = e.start + e.duration;
          if (end <= t0 || e.start >= t1) continue;
          longestBlockMs = Math.max(longestBlockMs, e.duration);
          totalBlockedMs += e.duration;
        }
        for (const g of state.rafGaps) {
          if (g.at < t0 || g.at >= t1) continue;
          if (g.gap <= 50) continue;
          longestBlockMs = Math.max(longestBlockMs, g.gap);
          totalBlockedMs += g.gap;
        }
        return { longestBlockMs, totalBlockedMs };
      },
    };
    install();
  });
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
  await sleep(1500);
  await page.evaluate(() => globalThis.__ggSwitchPerf?.install?.());
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

async function createProjectViaUi(page, name, templateRef) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await page.waitForSelector(".gg-modal", { timeout: 10000 });
  await page.click(".gg-modal-name", { clickCount: 3 });
  await page.type(".gg-modal-name", name, { delay: 8 });
  if (templateRef) {
    await page.waitForFunction(() => document.querySelector(".gg-modal-tpl option[value]"), { timeout: 20000 }).catch(() => {});
    await page.select(".gg-modal-tpl", templateRef).catch(() => {});
  }
  await page.click(".gg-modal .gg-primary");
  await page.waitForFunction(
    (n) => {
      const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
      const opt = sel?.options[sel.selectedIndex];
      return opt && opt.textContent.includes(n);
    },
    { timeout: 30000 },
    name
  );
  await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 1, { timeout: 20000 });
  const pid = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.value);
  if (pid) createdProjectIds.push(pid);
  return pid;
}

async function rightClickEmptyShots(page) {
  const box = await page.evaluate(() => {
    const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    const cuts = wrap.querySelectorAll(".gg-cut");
    let y;
    if (cuts.length > 0) {
      const lastRect = cuts[cuts.length - 1].getBoundingClientRect();
      const belowY = lastRect.bottom + 12;
      y = belowY < r.bottom - 6 ? belowY : r.bottom - 6;
    } else {
      y = Math.min(r.bottom - 6, r.top + 40);
    }
    const inset = 2;
    const x = Math.max(r.left + inset, Math.min(r.right - inset, r.left + r.width / 2));
    y = Math.max(r.top + inset, Math.min(r.bottom - inset, y));
    return { x, y };
  });
  if (!box) throw new Error("gg-grp-wrap not found");
  await page.mouse.click(box.x, box.y, { button: "right" });
}

async function clickCutById(page, cutId) {
  const sel = `.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"]`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
}

async function timelineCutsSorted(page, pid) {
  const { data } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
  if (!data) throw new Error("timeline fetch failed");
  const cuts = data.cuts || [];
  return [...cuts].sort((a, b) => (a.pos ?? a.index ?? 0) - (b.pos ?? b.index ?? 0));
}

async function waitForCutLoaded(page, cutId) {
  await page.waitForFunction(
    (id) => window.app.graph?.extra?.gonggan?.cutId === id,
    { timeout: 90000 },
    cutId
  );
}

async function waitForGraphNodes(page) {
  await page.waitForFunction(() => (window.app.graph?._nodes?.length || 0) > 0, { timeout: 60000 });
}

async function countOwnedTabs(page) {
  return page.evaluate(() => {
    const ws = window.app.extensionManager.workflow;
    const open = ws.openWorkflows || [];
    return open.filter((w) => w.ggGongganOwned || w.path?.includes("gonggan/")).length;
  });
}

async function getWorkflowTabState(page) {
  return page.evaluate(() => {
    const ws = window.app.extensionManager.workflow;
    const open = ws.openWorkflows || [];
    const owned = open.filter((w) => w.ggGongganOwned);
    return {
      openCount: open.length,
      ownedCount: owned.length,
    };
  });
}

async function modifyWorkflowViaWidget(page, marker) {
  await waitForGraphNodes(page);
  const ok = await page.evaluate((marker) => {
    const nodes = window.app.graph?._nodes || [];
    const n =
      nodes.find((x) => x.type === "PrimitiveStringMultiline" && x.widgets?.length) ||
      nodes.find((x) => x.widgets?.length) ||
      nodes[0];
    if (!n) return { ok: false, err: "no graph nodes" };
    const w = n.widgets?.find((x) => x.name === "value" || x.type === "text") || n.widgets[0];
    if (!w) return { ok: false, err: "no widgets" };
    const prev = w.value;
    const next = typeof prev === "string" ? `${marker}\n${prev}`.slice(0, 8000) : marker;
    w.value = next;
    if (typeof w.callback === "function") w.callback(next);
    window.app.graph?.setDirtyCanvas?.(true, true);
    if (typeof window.app.graph?.change === "function") window.app.graph.change();
    const wf = window.app.extensionManager.workflow.activeWorkflow;
    wf?.changeTracker?.checkState?.();
    return { ok: !!wf?.isModified, err: wf?.isModified ? "" : "isModified false" };
  }, marker);
  if (!ok.ok) throw new Error(ok.err || "modify failed");
}

function summarizeNetwork(t0, t1) {
  const win = networkLog.filter((e) => e.t >= t0 && e.t <= t1);
  let saves = 0;
  let gonggan = 0;
  let maxBodyBytes = 0;
  const requests = [];
  for (const e of win) {
    let pathname = "";
    try {
      const u = new URL(e.url);
      pathname = u.pathname;
      requests.push(`${e.method} ${pathname}`);
    } catch {
      requests.push(`${e.method} ${e.url}`);
      continue;
    }
    if (isSaveRequest(e.method, pathname)) saves += 1;
    if (isGongganRequest(pathname)) gonggan += 1;
    maxBodyBytes = Math.max(maxBodyBytes, e.bodyBytes);
  }
  return { total: win.length, saves, gonggan, maxBodyBytes, requests };
}

async function measuredSwitch(page, cutId, { modify, modifyMarker, phase, cycle, step }) {
  if (modify) {
    await modifyWorkflowViaWidget(page, modifyMarker || `${MARKER}-${cycle}-${step}`);
  }
  const tabsBefore = await getWorkflowTabState(page);
  const ownedBefore = await countOwnedTabs(page);

  await page.evaluate(() => globalThis.__ggSwitchPerf?.windowStart?.());
  const t0 = Date.now();
  await clickCutById(page, cutId);
  await waitForCutLoaded(page, cutId);
  const t1 = Date.now();

  const blocking = await page.evaluate(() => globalThis.__ggSwitchPerf?.windowEnd?.() || { longestBlockMs: 0, totalBlockedMs: 0 });
  const net = summarizeNetwork(t0, t1);
  const tabsAfter = await getWorkflowTabState(page);
  const ownedAfter = await countOwnedTabs(page);

  return {
    phase,
    cycle,
    step,
    cutId,
    switch_ms: t1 - t0,
    network: net,
    tabs: {
      openBefore: tabsBefore.openCount,
      openAfter: tabsAfter.openCount,
      ownedBefore,
      ownedAfter,
    },
    blocking,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function phaseStats(records) {
  const switchMs = records.map((r) => r.switch_ms).sort((a, b) => a - b);
  const saves = records.map((r) => r.network.saves);
  const netTotals = records.map((r) => r.network.total);
  const longest = records.map((r) => r.blocking.longestBlockMs);
  const openCounts = records.flatMap((r) => [r.tabs.openBefore, r.tabs.openAfter]);
  return {
    switch_ms: {
      median: percentile(switchMs, 50),
      p95: percentile(switchMs, 95),
      max: switchMs[switchMs.length - 1] ?? 0,
    },
    saves: {
      median: percentile([...saves].sort((a, b) => a - b), 50),
      max: Math.max(0, ...saves),
    },
    network: {
      median: percentile([...netTotals].sort((a, b) => a - b), 50),
      max: Math.max(0, ...netTotals),
    },
    longestBlock: { max: Math.max(0, ...longest) },
    tabs: { min: Math.min(...openCounts), max: Math.max(...openCounts) },
    totalSaves: saves.reduce((a, b) => a + b, 0),
  };
}

function printPhaseTable(phaseName, stats) {
  console.log(`\n### ${phaseName}\n`);
  console.log("| metric | median | p95 | max |");
  console.log("| --- | ---: | ---: | ---: |");
  console.log(`| switch_ms | ${stats.switch_ms.median} | ${stats.switch_ms.p95} | ${stats.switch_ms.max} |`);
  console.log(`| saves/switch | ${stats.saves.median} | — | ${stats.saves.max} |`);
  console.log(`| network/switch | ${stats.network.median} | — | ${stats.network.max} |`);
  console.log(`| longest block (ms) | — | — | ${stats.longestBlock.max} |`);
  console.log(`| open tab count | min ${stats.tabs.min} | — | max ${stats.tabs.max} |`);
}

function normWorkflowRelPath(p) {
  return String(p ?? "")
    .replace(/^\/+/, "")
    .replace(/^workflows\//, "");
}

function isRunGongganPath(p) {
  const norm = normWorkflowRelPath(p);
  const m = norm.match(/^gonggan\/([^/]+)(?:\/|$)/);
  if (!m) return false;
  return createdProjectIds.includes(m[1]);
}

async function cleanupProjects(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup delete ${pid}:`, e.message);
    }
  }
}

async function cleanupNewWorkflows(page) {
  await sleep(800);
  const normalize = normWorkflowRelPath;
  const before = new Set(workflowPathsBefore.map(normalize));
  let afterList = await fetchWorkflowPaths(page);
  const created = [];
  for (const p of afterList) {
    const n = normalize(p);
    if (!before.has(n) && isRunGongganPath(n)) created.push(n);
  }
  for (const p of created.sort((a, b) => b.length - a.length)) {
    try {
      await deleteWorkflowFile(page, p);
    } catch (e) {
      console.warn(`workflow cleanup ${p}:`, e.message);
    }
  }
}

const results = [];

async function runScenario(id, title, fn) {
  const entry = { id, title, status: "FAIL", detail: "" };
  try {
    checkRam(`before ${id}`);
    if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST attempted (${blockedPromptAttempts})`);
    await fn();
    entry.status = "PASS";
    entry.detail = "ok";
    console.log(`PASS  ${id} ${title}`);
  } catch (e) {
    if (e.skipped) {
      entry.status = "SKIPPED";
      entry.detail = e.message;
      console.log(`SKIP  ${id} ${title}: ${e.message}`);
    } else {
      entry.detail = e.message || String(e);
      console.log(`FAIL  ${id} ${title}: ${entry.detail}`);
    }
  }
  results.push(entry);
}

let browser;
let page;

async function runPhase(page, cuts, phaseName, modify) {
  const order = [cuts[0], cuts[1], cuts[2]];
  const records = [];
  for (let cycle = 0; cycle < CYCLES; cycle++) {
    for (let step = 0; step < order.length; step++) {
      const c = order[step];
      const rec = await measuredSwitch(page, c.id, {
        modify,
        modifyMarker: `${MARKER} ${phaseName} c${cycle} s${step}`,
        phase: phaseName,
        cycle,
        step,
      });
      records.push(rec);
    }
  }
  return records;
}

async function main() {
  ensureDirs();
  try {
    checkRam("startup");
  } catch (e) {
    console.log(`SKIP all: ${e.message}`);
    process.exit(0);
  }

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  browser = await launchBrowser();
  page = await browser.newPage();
  await installMainThreadMonitors(page);
  wireConsole(page);
  await page.setRequestInterception(true);
  attachRequestGuard(page);

  pluginConsoleErrors.length = 0;
  await waitForComfy(page);
  await openShotsTab(page);
  workflowPathsBefore = await fetchWorkflowPaths(page);

  const paths = await fetchWorkflowPaths(page);
  const templateRef = await pickUsableTemplateRef(page, paths);
  if (!templateRef) throw new Error("need a usable template workflow");

  const projectName = `${TEST_PREFIX} ${runStamp}`;
  const pid = await createProjectViaUi(page, projectName, templateRef);
  await waitForDomCutCountSync(page);

  for (let i = 0; i < 2; i++) {
    await rightClickEmptyShots(page);
    await clickCtxItem(page, "Add Cut");
    await sleep(600);
    await waitForDomCutCountSync(page);
  }
  const cuts = await timelineCutsSorted(page, pid);
  if (cuts.length < 3) throw new Error(`expected 3 cuts, got ${cuts.length}`);

  for (const c of cuts) {
    await clickCutById(page, c.id);
    await waitForCutLoaded(page, c.id);
    await sleep(400);
  }

  const baselineTabs = (await getWorkflowTabState(page)).openCount;
  const baselineOwned = await countOwnedTabs(page);
  if (baselineOwned !== 1) throw new Error(`baseline owned tabs ${baselineOwned} !== 1`);

  console.log(`\n## switch_perf (${projectName})\n`);
  console.log(`Baseline open tabs: ${baselineTabs}, owned: ${baselineOwned}`);
  console.log(`Phase 1 clean: ${CYCLES}× A→B→C (${CYCLES * 3} switches)…`);

  const cleanRecords = await runPhase(page, cuts, "clean", false);
  const cleanStats = phaseStats(cleanRecords);
  printPhaseTable("clean", cleanStats);

  console.log(`Phase 2 modified: ${CYCLES}× A→B→C with widget edit before each switch…`);
  const modRecords = await runPhase(page, cuts, "modified", true);
  const modStats = phaseStats(modRecords);
  printPhaseTable("modified", modStats);

  const payload = {
    runStamp,
    projectName,
    pid,
    cutIds: cuts.map((c) => c.id),
    thresholds: {
      SWITCH_CLEAN_MEDIAN_MS,
      SWITCH_CLEAN_MAX_MS,
      SWITCH_MOD_MEDIAN_MS,
    },
    baseline: { openTabs: baselineTabs, ownedTabs: baselineOwned },
    clean: { records: cleanRecords, stats: cleanStats },
    modified: { records: modRecords, stats: modStats },
    sampleCleanRequests: cleanRecords[0]?.network?.requests?.slice(0, 12) || [],
    pluginConsoleErrors: [...pluginConsoleErrors],
    blockedPromptAttempts,
  };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\nRaw data: ${JSON_PATH}`);

  const allRecords = [...cleanRecords, ...modRecords];

  await runScenario("S1", "no extra workflow tabs; owned tabs stay 1", () => {
    for (const r of allRecords) {
      if (r.tabs.openAfter > baselineTabs) {
        throw new Error(`open tabs ${r.tabs.openAfter} > baseline ${baselineTabs} (${r.phase} c${r.cycle} s${r.step})`);
      }
      if (r.tabs.ownedAfter !== 1) {
        throw new Error(`owned tabs ${r.tabs.ownedAfter} !== 1 (${r.phase} c${r.cycle} s${r.step})`);
      }
    }
  });

  await runScenario("S2", `clean switch_ms median<=${SWITCH_CLEAN_MEDIAN_MS} max<=${SWITCH_CLEAN_MAX_MS}`, () => {
    if (cleanStats.switch_ms.median > SWITCH_CLEAN_MEDIAN_MS) {
      throw new Error(`median ${cleanStats.switch_ms.median} > ${SWITCH_CLEAN_MEDIAN_MS}`);
    }
    if (cleanStats.switch_ms.max > SWITCH_CLEAN_MAX_MS) {
      throw new Error(`max ${cleanStats.switch_ms.max} > ${SWITCH_CLEAN_MAX_MS}`);
    }
  });

  await runScenario("S3", `modified switch_ms median<=${SWITCH_MOD_MEDIAN_MS}`, () => {
    if (modStats.switch_ms.median > SWITCH_MOD_MEDIAN_MS) {
      throw new Error(`median ${modStats.switch_ms.median} > ${SWITCH_MOD_MEDIAN_MS}`);
    }
  });

  await runScenario("S4", "clean phase zero save POSTs", () => {
    if (cleanStats.totalSaves !== 0) {
      throw new Error(`total saves in clean phase: ${cleanStats.totalSaves}`);
    }
  });

  await runScenario("S5", "no plugin console errors", () => {
    if (pluginConsoleErrors.length) {
      throw new Error(pluginConsoleErrors.map((x) => x.text).join(" | "));
    }
  });

  await runScenario("S6", "rapid A→B→C clicks: owned tab stays 1, tabs do not grow", async () => {
    const order = [cuts[0], cuts[1], cuts[2]];
    let maxOpen = baselineTabs;
    for (let round = 0; round < 5; round++) {
      for (const c of order) {
        await clickCutById(page, c.id);
        await sleep(30);
      }
      await waitForCutLoaded(page, order[2].id);
      const st = await getWorkflowTabState(page);
      maxOpen = Math.max(maxOpen, st.openCount);
      const owned = await countOwnedTabs(page);
      if (owned !== 1) {
        throw new Error(`round ${round}: owned tabs ${owned} !== 1`);
      }
    }
    if (maxOpen > baselineTabs) {
      throw new Error(`open tabs grew to ${maxOpen} (baseline ${baselineTabs})`);
    }
  });

  try {
    await cleanupNewWorkflows(page);
    await cleanupProjects(page);
  } catch (e) {
    console.warn("cleanup:", e.message);
  }

  await closeBrowser(browser);
  browser = null;

  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n## Summary\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(7)} ${r.id} ${r.title}${r.detail && r.status !== "PASS" ? `: ${r.detail}` : ""}`);
  }
  if (blockedPromptAttempts > 0) console.error(`FATAL: ${blockedPromptAttempts} blocked generation POST(s)`);
  process.exit(failed.length || blockedPromptAttempts > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    if (page) await cleanupNewWorkflows(page).catch(() => {});
    if (page) await cleanupProjects(page).catch(() => {});
  } catch (_) {}
  await closeBrowser(browser);
  process.exit(2);
});
