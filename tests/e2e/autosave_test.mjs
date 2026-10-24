/**
 * Headless Chrome: auto-save modified shot tab on cut switch (0.8.1).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCREENS_DIR = path.join(REPO_ROOT, "tests/screens");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ autosave";
const MARKER = "ZZ_AUTOSAVE_MARKER";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const createdProjectIds = [];
let blockedPromptAttempts = 0;
let dialogCount = 0;
let workflowPathsBefore = [];

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

function trackDialogs(page) {
  page.on("dialog", () => {
    dialogCount += 1;
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
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null), text: await res.text().catch(() => "") };
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

async function deleteWorkflowFile(page, relPath) {
  const enc = encodeURIComponent(relPath.replace(/^\/+/, ""));
  await page.evaluate(async (p) => {
    await fetch(`${location.origin}/api/userdata/${p}`, { method: "DELETE" });
  }, enc);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-autosave-${runStamp}`);
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

async function screenshot(page, name) {
  const p = path.join(SCREENS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
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
    const btn = await page.waitForSelector('[aria-label="Gonggan shot list"]', { timeout: 15000 });
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
  const pid = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.value);
  if (pid) createdProjectIds.push(pid);
  return pid;
}

async function rightClickEmptyShots(page) {
  const box = await page.evaluate(() => {
    const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: Math.min(r.bottom - 8, r.top + 80) };
  });
  if (!box) throw new Error("gg-grp-wrap not found");
  await page.mouse.click(box.x, box.y, { button: "right" });
}

async function clickCut(page, index) {
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  await cuts[index].click();
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

async function waitForGraphNodes(page) {
  await page.waitForFunction(() => (window.app.graph?._nodes?.length || 0) > 0, { timeout: 60000 });
}

async function markWorkflowModified(page) {
  await waitForGraphNodes(page);
  const ok = await page.evaluate((marker) => {
    const nodes = window.app.graph?._nodes || [];
    const n = nodes[0];
    if (!n) return { ok: false, err: "no graph nodes" };
    n.title = marker;
    n.properties = { ...(n.properties || {}), gg_autosave_marker: marker };
    if (typeof n.onPropertyChanged === "function") n.onPropertyChanged("title", marker);
    const w0 = n.widgets?.[0];
    if (w0) {
      w0.value = typeof w0.value === "number" ? w0.value + 1 : `${w0.value ?? ""}_zz`;
      w0.callback?.(w0.value);
    }
    window.app.graph?.setDirtyCanvas?.(true, true);
    if (typeof window.app.graph?.change === "function") window.app.graph.change();
    const wf = window.app.extensionManager.workflow.activeWorkflow;
    if (!wf) return { ok: false, err: "no active workflow" };
    const ct = wf.changeTracker;
    let serialized = null;
    if (typeof window.app.graph?.serialize === "function") {
      serialized = window.app.graph.serialize();
      const sn = serialized?.nodes?.find((x) => x.id === n.id) || serialized?.nodes?.[0];
      if (sn) sn.title = marker;
      if (ct) ct.activeState = serialized;
    }
    if (ct?.captureCanvasState) ct.captureCanvasState();
    else ct?.checkState?.();
    ct?.prepareForSave?.();
    if (typeof wf.prepareForSave === "function") wf.prepareForSave();
    wf.isModified = true;
    if (serialized && typeof wf.content === "string") {
      try {
        wf.content = JSON.stringify(serialized);
      } catch (_) {}
    }
    return {
      ok: !!wf.isModified,
      err: wf.isModified
        ? ""
        : `isModified still false (tracker=${!!ct}, nodes=${nodes.length}, wf=${wf.path || wf.filename})`,
    };
  }, MARKER);
  if (!ok.ok) throw new Error(ok.err || "failed to mark modified");
}

async function getActiveWorkflowBasename(page) {
  return page.evaluate(() => {
    const wf = window.app.extensionManager.workflow.activeWorkflow;
    const p = wf?.path || wf?.filename || "";
    const slash = p.lastIndexOf("/");
    return slash >= 0 ? p.slice(slash + 1) : p;
  });
}

async function getToastText(page) {
  return page.evaluate(() => document.getElementById("gg-toast-host")?.textContent || "");
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
  const after = new Set(await fetchWorkflowPaths(page));
  const before = new Set(workflowPathsBefore);
  for (const p of after) {
    if (!before.has(p)) {
      try {
        await deleteWorkflowFile(page, p);
      } catch (e) {
        console.warn(`workflow cleanup ${p}:`, e.message);
      }
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
  try {
    await screenshot(page, `autosave-${id}`);
  } catch (_) {}
  results.push(entry);
}

let browser;
let page;

async function main() {
  ensureDirs();
  let ramOk = true;
  try {
    checkRam("startup");
  } catch (e) {
    ramOk = false;
    console.log(`SKIP all scenarios: ${e.message}`);
    for (const id of ["01", "02"]) {
      results.push({ id, title: id === "01" ? "auto-save on cut switch" : "failure path", status: "SKIPPED", detail: e.message });
    }
    process.exit(0);
  }

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  browser = await launchBrowser();
  page = await browser.newPage();
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  trackDialogs(page);

  await waitForComfy(page);
  const feat = await page.evaluate(() => globalThis.__gongganCutAutosaveOnSwitch || "");
  if (feat !== "0.8.1") {
    throw new Error(`gonggan-cut 0.8.1 autosave not loaded (got "${feat}"); reload ComfyUI or hard-refresh`);
  }
  await openShotsTab(page);
  workflowPathsBefore = await fetchWorkflowPaths(page);

  const paths = await fetchWorkflowPaths(page);
  const templateRef = paths[0] || "";
  const projectName = `${TEST_PREFIX} ${runStamp}`;
  let pid = "";
  let cutIds = [];

  await runScenario("01", "auto-save on cut switch", async () => {
    dialogCount = 0;
    pid = await createProjectViaUi(page, projectName, templateRef || undefined);
    if (!templateRef) throw new Error("need at least one saved workflow as template");

    for (let i = 0; i < 2; i++) {
      await rightClickEmptyShots(page);
      await clickCtxItem(page, "Add Cut");
      await sleep(600);
    }
    await sleep(800);

    const sorted = await timelineCutsSorted(page, pid);
    if (sorted.length < 2) throw new Error("expected 2 cuts");
    cutIds = [sorted[0].id, sorted[1].id];

    await clickCutById(page, cutIds[0]);
    await sleep(2500);
    await waitForGraphNodes(page);
    await markWorkflowModified(page);

    dialogCount = 0;
    await clickCutById(page, cutIds[1]);
    await sleep(3000);

    if (dialogCount !== 0) throw new Error(`expected 0 dialogs, got ${dialogCount}`);

    const activeBase = await getActiveWorkflowBasename(page);
    if (!/^cut2\.json$/i.test(activeBase)) {
      throw new Error(`active tab should be cut B workflow (cut2.json), got "${activeBase}"`);
    }

    const afterPaths = await fetchWorkflowPaths(page);
    const beforeSet = new Set(workflowPathsBefore);
    const candidates = [
      "workflows/cut1.json",
      "cut1.json",
      "workflows/cut2.json",
      "cut2.json",
      ...afterPaths.filter((p) => !beforeSet.has(p)),
    ];
    let foundMarker = false;
    for (const rel of [...new Set(candidates)]) {
      const enc = encodeURIComponent(rel.replace(/^\/+/, ""));
      const saved = await getJson(page, `/api/userdata/${enc}`);
      const blob = saved.text || JSON.stringify(saved.data || "");
      if (blob.includes(MARKER)) {
        foundMarker = true;
        break;
      }
    }
    if (!foundMarker) throw new Error(`saved workflow missing marker (checked ${candidates.length} paths)`);
  });

  await runScenario("02", "failure path keeps tab and shows toast", async () => {
    if (!pid || cutIds.length < 2) throw new Error("scenario 01 setup required");

    dialogCount = 0;
    await clickCutById(page, cutIds[0]);
    await sleep(3000);
    await waitForGraphNodes(page);
    const setupBase = await getActiveWorkflowBasename(page);
    if (!/^cut1\.json$/i.test(setupBase)) {
      throw new Error(`setup: expected cut1.json active before failure test, got "${setupBase}"`);
    }

    await page.evaluate(() => {
      const ws = window.app.extensionManager.workflow;
      window.__ggOrigSaveWorkflow = ws.saveWorkflow.bind(ws);
      ws.saveWorkflow = async () => {
        throw new Error("e2e forced save failure");
      };
    });

    await markWorkflowModified(page);
    const beforeBase = await getActiveWorkflowBasename(page);

    await clickCutById(page, cutIds[1]);
    await sleep(2500);

    if (dialogCount !== 0) throw new Error(`expected 0 dialogs on failure path, got ${dialogCount}`);

    const afterBase = await getActiveWorkflowBasename(page);
    if (!/^cut1\.json$/i.test(afterBase)) {
      throw new Error(`tab should stay on cut A (cut1.json), got "${afterBase}" (before "${beforeBase}")`);
    }

    const stillMod = await page.evaluate(() => window.app.extensionManager.workflow.activeWorkflow?.isModified);
    if (!stillMod) throw new Error("tab should still be modified after failed auto-save");

    const toast = await getToastText(page);
    if (!toast.includes("Auto-save failed. Switch cancelled.")) {
      throw new Error(`toast missing failure text: "${toast}"`);
    }

    await page.evaluate(() => {
      const ws = window.app.extensionManager.workflow;
      if (window.__ggOrigSaveWorkflow) ws.saveWorkflow = window.__ggOrigSaveWorkflow;
      delete window.__ggOrigSaveWorkflow;
    });
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
  console.log(JSON.stringify({ results, blockedPromptAttempts, ramOk }, null, 2));
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
