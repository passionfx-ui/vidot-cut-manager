/**
 * Headless Chrome: auto-save modified shot tab on cut switch (0.8.2 paths).
 */
import { shotWorkflowRelPathById } from "../../web/gg_shot_names.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { fillNewProjectModal } from "./new_project_helpers.mjs";

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

// The first *.json in userdata is often not a usable UI-graph template (API-format exports,
// settings files...). Cut load then fails with "workflow must be a UI graph" and every
// waitForCutLoaded() times out at 90 s. Pick a template that really is a UI graph.
async function pickUsableTemplateRef(page, paths) {
  const norm = (p) => String(p).replace(/^\/+/, "");
  const base = (p) => norm(p).replace(/^.*\//, "").toLowerCase();
  const cands = paths.filter((p) => base(p).endsWith(".json") && !/^cut\d+\.json$/i.test(base(p)) && !norm(p).startsWith("gonggan/") && !/_api\.json$/i.test(base(p)));
  cands.sort((a, b) => (base(b).startsWith("zz") ? 1 : 0) - (base(a).startsWith("zz") ? 1 : 0));
  for (const p of cands.slice(0, 40)) {
    const ok = await page.evaluate(async (rel) => {
      try {
        const r = await fetch(`/api/userdata/${encodeURIComponent("workflows/" + rel)}`);
        if (!r.ok) return false;
        const j = await r.json();
        return Array.isArray(j.nodes) && j.nodes.length > 0 && j.nodes.length < 80;
      } catch (_) { return false; }
    }, norm(p));
    if (ok) return norm(p);
  }
  return pickTemplateRef(paths);
}

function expectedShotWorkflowRel(pid, _projectName, cut) {
  return shotWorkflowRelPathById({ projectId: pid, cutId: cut.id });
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
    const btn = await page.waitForSelector('[aria-label="Vidot Studio – Cut Manager"]', { timeout: 15000 });
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
  await fillNewProjectModal(page, { name, templateRef });
  await page.click(".gg-modal-create");
  await page.waitForFunction(
    (n) => {
      const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
      const opt = sel?.options[sel.selectedIndex];
      return opt && opt.textContent.includes(n);
    },
    { timeout: 30000 },
    name
  );
  // wait until the list shows the NEW project (1 seed cut), not the previously selected one
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

    const isBlocked = (el) => {
      if (!el) return false;
      if (el.closest(".gg-cut")) return true;
      if (el.closest("textarea, input, button")) return true;
      const header = el.closest("header");
      return !!(header && header.closest(".gg-grp-sec"));
    };
    const hit = document.elementFromPoint(x, y);
    if (isBlocked(hit)) {
      const tag = hit.tagName.toLowerCase();
      const cls = typeof hit.className === "string" ? hit.className : "";
      throw new Error(
        `rightClickEmptyShots: point (${x}, ${y}) is on blocked element <${tag}${cls ? ` class="${cls}"` : ""}>`
      );
    }
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

async function waitForGraphNodes(page) {
  await page.waitForFunction(() => (window.app.graph?._nodes?.length || 0) > 0, { timeout: 60000 });
}

async function waitForCutLoaded(page, cutId) {
  await page.waitForFunction(
    (id) => window.app.graph?.extra?.gonggan?.cutId === id,
    { timeout: 90000 },
    cutId
  );
  await sleep(400);
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
    // graph.change() alone does not run the ChangeTracker diff; the UI calls checkState() on pointer/key events.
    wf?.changeTracker?.checkState?.();
    return {
      ok: !!wf?.isModified,
      err: wf?.isModified ? "" : "isModified still false after widget change",
      nodeType: n.type,
    };
  }, marker);
  if (!ok.ok) throw new Error(ok.err || "failed to modify workflow");
}

async function getActiveWorkflowInfo(page) {
  return page.evaluate(() => {
    const wf = window.app.extensionManager.workflow.activeWorkflow;
    const p = wf?.path || wf?.filename || "";
    return {
      path: p,
      basename: p.replace(/^.*\//, ""),
      isTemporary: wf?.isTemporary,
      isPersisted: wf?.isPersisted,
      isModified: wf?.isModified,
      cutId: window.app.graph?.extra?.gonggan?.cutId,
    };
  });
}

async function readUserdataText(page, relPath) {
  const enc = encodeURIComponent(relPath.replace(/^\/+/, ""));
  const saved = await getJson(page, `/api/userdata/${enc}`);
  return saved.text || JSON.stringify(saved.data || "");
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
  const created = [];
  for (const p of after) {
    if (!before.has(p)) created.push(p);
  }
  for (const p of created.sort((a, b) => b.length - a.length)) {
    try {
      await deleteWorkflowFile(page, p);
    } catch (e) {
      console.warn(`workflow cleanup ${p}:`, e.message);
    }
  }
  const dirs = new Set();
  for (const p of created) {
    const norm = p.replace(/^\/+/, "");
    const parts = norm.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    if (!d.startsWith("gonggan/")) continue;
    const enc = encodeURIComponent(d);
    await page.evaluate(async (pathEnc) => {
      await fetch(`${location.origin}/api/userdata/${pathEnc}`, { method: "DELETE" });
    }, enc);
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
      try { await page.screenshot({ path: path.join(SCREENS_DIR, `autosave-fail-${id}.png`) }); } catch (_) {}
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
  const folders = await page.evaluate(() => globalThis.__gongganProjectFolders || "");
  if (folders !== "0.8.2") {
    throw new Error(`gonggan-cut 0.8.2 project folders not loaded (got "${folders}"); hard-refresh ComfyUI (Ctrl+Shift+R)`);
  }
  await openShotsTab(page);
  workflowPathsBefore = await fetchWorkflowPaths(page);

  const paths = await fetchWorkflowPaths(page);
  const templateRef = await pickUsableTemplateRef(page, paths);
  const projectName = `${TEST_PREFIX} ${runStamp}`;
  let pid = "";
  let cutA = null;
  let cutB = null;
  let wfRelA = "";
  let wfRelB = "";
  let wfBasenameA = "";

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
    if (sorted.length < 3) throw new Error(`expected 3 cuts (seed + 2 added), got ${sorted.length}`);
    cutA = sorted[0];
    cutB = sorted[1];
    wfRelA = expectedShotWorkflowRel(pid, projectName, cutA);
    wfRelB = expectedShotWorkflowRel(pid, projectName, cutB);
    wfBasenameA = wfRelA.replace(/^.*\//, "");

    await clickCutById(page, cutA.id);
    await waitForCutLoaded(page, cutA.id);
    await waitForGraphNodes(page);
    const activeA = await getActiveWorkflowInfo(page);
    if (activeA.basename !== wfBasenameA) {
      throw new Error(`workflow filename should be "${wfBasenameA}", got "${activeA.basename}"`);
    }

    await modifyWorkflowViaWidget(page, MARKER);

    dialogCount = 0;
    await clickCutById(page, cutB.id);
    await waitForCutLoaded(page, cutB.id);
    await sleep(1500);

    if (dialogCount !== 0) throw new Error(`expected 0 dialogs, got ${dialogCount}`);

    const activeB = await getActiveWorkflowInfo(page);
    if (activeB.cutId !== cutB.id) {
      throw new Error(`after switch: active cut ${activeB.cutId} !== cut B ${cutB.id}`);
    }

    const expectedSaved = `workflows/${wfRelA}`;
    const afterPaths = await fetchWorkflowPaths(page);
    const beforeSet = new Set(workflowPathsBefore);
    const candidates = [
      expectedSaved,
      wfRelA,
      activeA.path,
      ...afterPaths.filter((p) => !beforeSet.has(p) && p.includes(`gonggan/${pid}/`)),
    ];
    let savedPath = "";
    for (const rel of [...new Set(candidates)]) {
      const blob = await readUserdataText(page, rel);
      if (blob.includes(MARKER)) {
        savedPath = rel.replace(/^\/+/, "");
        break;
      }
    }
    if (!savedPath) throw new Error(`saved workflow missing marker (checked ${candidates.length} paths)`);
    const normSaved = savedPath.replace(/^workflows\//, "");
    if (normSaved !== wfRelA) {
      throw new Error(`expected save at ${wfRelA}, got ${normSaved}`);
    }
  });

  await runScenario("02", "failure path keeps tab and shows toast", async () => {
    if (!pid || !cutA || !cutB) throw new Error("scenario 01 setup required");

    dialogCount = 0;
    await clickCutById(page, cutA.id);
    await waitForCutLoaded(page, cutA.id);
    await waitForGraphNodes(page);
    const setup = await getActiveWorkflowInfo(page);

    await page.evaluate(() => {
      const ws = window.app.extensionManager.workflow;
      window.__ggOrigSaveWorkflow = ws.saveWorkflow.bind(ws);
      ws.saveWorkflow = async () => {
        throw new Error("e2e forced save failure");
      };
    });

    await modifyWorkflowViaWidget(page, MARKER);
    const before = await getActiveWorkflowInfo(page);

    await clickCutById(page, cutB.id);
    await sleep(2500);

    if (dialogCount !== 0) throw new Error(`expected 0 dialogs on failure path, got ${dialogCount}`);

    const after = await getActiveWorkflowInfo(page);
    if (after.cutId !== cutA.id) {
      throw new Error(`tab should stay on cut A (${cutA.id}), got cut ${after.cutId}`);
    }
    if (before.path && after.path !== before.path) {
      throw new Error(`tab path changed on failed switch: ${before.path} -> ${after.path}`);
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
