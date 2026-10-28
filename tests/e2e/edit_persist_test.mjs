/**
 * Headless Chrome: shot workflow edit persistence (WIP autosave + restore).
 * S1 is report-only; S2–S6 must persist; S7 rejects stale WIP after version change.
 */
import { shotWorkflowRelPathById } from "../../web/gg_shot_names.js";
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
const TEST_PREFIX = "ZZ-test-edit-persist";
const TAB_RESTORE_WAIT_MS = 5000;
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-edit-persist-${runStamp}`);
const createdProjectIds = [];
/** @type {Map<string, object>} */
const timelineMocks = new Map();
let blockedPromptAttempts = 0;
let workflowPathsBefore = [];

const SCENARIOS = [
  { id: "S1", delayMs: 1000, exit: "kill" },
  { id: "S2", delayMs: 12000, exit: "kill" },
  { id: "S3", delayMs: 45000, exit: "kill" },
  { id: "S4", delayMs: 3000, exit: "graceful" },
  { id: "S8", delayMs: 0, exit: "graceful" },
  { id: "S5", delayMs: 0, exit: "kill", autosaveSwitch: true },
  { id: "S6", delayMs: 4000, exit: "kill" },
  { id: "S7", delayMs: 4000, exit: "none", versionBump: true },
];

const MUST_PERSIST = new Set(["S2", "S3", "S4", "S5", "S6"]);

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
    if (method === "GET" && /gonggan\/timeline/.test(url)) {
      try {
        const u = new URL(url);
        const pid = u.searchParams.get("pid");
        if (pid && timelineMocks.has(pid)) {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(timelineMocks.get(pid)),
          });
          return;
        }
      } catch (_) {}
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
  const cands = paths.filter((p) => base(p).endsWith(".json") && !/^cut\d+\.json$/i.test(base(p)) && !norm(p).startsWith("gonggan/") && !/_api\.json$/i.test(base(p)));
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

function expectedShotWorkflowRel(pid, cut) {
  return shotWorkflowRelPathById({ projectId: pid, cutId: cut.id });
}

async function deleteWorkflowFile(page, relPath) {
  const rel = relPath.replace(/^\/+/, "");
  const enc = encodeURIComponent(rel.startsWith("workflows/") ? rel : `workflows/${rel}`);
  await page.evaluate(async (p) => {
    await fetch(`${location.origin}/api/userdata/${p}`, { method: "DELETE" });
  }, enc);
}

function removeSingletonLocks(userDataDir) {
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try {
      fs.rmSync(path.join(userDataDir, name), { force: true });
    } catch (_) {}
  }
}

async function waitBrowserProcessExit(proc, timeoutMs = 45000) {
  if (!proc) return;
  if (proc.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("browser process did not exit after SIGKILL")), timeoutMs);
    proc.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function launchPersistentBrowser() {
  fs.mkdirSync(PERSISTENT_USER_DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: PERSISTENT_USER_DATA_DIR,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  browser._ggUserDataDir = PERSISTENT_USER_DATA_DIR;
  return browser;
}

async function newGuardedPage(browser) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  return page;
}

async function killBrowserAbnormally(browser) {
  const proc = browser.process();
  proc.kill("SIGKILL");
  await waitBrowserProcessExit(proc);
  removeSingletonLocks(PERSISTENT_USER_DATA_DIR);
}

async function closeBrowserGracefully(browser, page) {
  try {
    if (page && !page.isClosed()) await page.close({ runBeforeUnload: true });
  } catch (_) {}
  try {
    await browser.close();
  } catch (_) {}
}

async function destroyPersistentProfile() {
  try {
    fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true });
  } catch (_) {}
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

async function selectProject(page, pid) {
  await page.waitForSelector(".gg-root.gg-shots .gg-proj", { timeout: 30000 });
  await page.select(".gg-root.gg-shots .gg-proj", pid);
  await page.waitForFunction(
    (id) => document.querySelector(".gg-root.gg-shots .gg-proj")?.value === id,
    { timeout: 15000 },
    pid
  );
  await sleep(400);
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
    const hit = document.elementFromPoint(x, y);
    if (hit?.closest(".gg-cut")) throw new Error("rightClickEmptyShots: point on cut");
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
  await page.waitForFunction((id) => window.app.graph?.extra?.gonggan?.cutId === id, { timeout: 90000 }, cutId);
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
    wf?.changeTracker?.checkState?.();
    return {
      ok: !!wf?.isModified,
      err: wf?.isModified ? "" : "isModified still false after widget change",
    };
  }, marker);
  if (!ok.ok) throw new Error(ok.err || "failed to modify workflow");
}

async function restoredOpenTabsHaveMarker(page, marker) {
  return page.evaluate((marker) => {
    const contains = (obj) => {
      try {
        return JSON.stringify(obj ?? {}).includes(marker);
      } catch {
        return false;
      }
    };
    const ws = window.app?.extensionManager?.workflow;
    const open = ws?.openWorkflows || [];
    for (const wf of open) {
      if (contains(wf?.activeState) || contains(wf?.changeTracker?.activeState)) return true;
    }
    if (ws?.activeWorkflow && window.app?.graph?.serialize) {
      if (contains(window.app.graph.serialize())) return true;
    }
    if (open.length === 0 && window.app?.graph?.serialize) {
      return contains(window.app.graph.serialize());
    }
    return false;
  }, marker);
}

async function activeGraphHasMarker(page, marker) {
  return page.evaluate((marker) => {
    const contains = (obj) => {
      try {
        return JSON.stringify(obj ?? {}).includes(marker);
      } catch {
        return false;
      }
    };
    const ser = window.app?.graph?.serialize?.();
    if (contains(ser)) return true;
    const wf = window.app?.extensionManager?.workflow?.activeWorkflow;
    return contains(wf?.activeState) || contains(wf?.changeTracker?.activeState);
  }, marker);
}

async function readUserdataText(page, relPath) {
  const rel = relPath.replace(/^\/+/, "");
  const enc = encodeURIComponent(rel.startsWith("workflows/") ? rel : `workflows/${rel}`);
  const saved = await getJson(page, `/api/userdata/${enc}`);
  return saved.text || JSON.stringify(saved.data || "");
}

async function fileWorkflowHasMarker(page, wfRel, marker) {
  const blob = await readUserdataText(page, wfRel);
  return blob.includes(marker);
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
}

async function reloadTimelineInUi(page, pid) {
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") {
      await globalThis.__gongganReloadShotsData();
    }
    await new Promise((r) => setTimeout(r, 400));
  });
  await selectProject(page, pid);
}

function buildTimelineWithExtraVersion(timelinePayload, cutId) {
  const tl = JSON.parse(JSON.stringify(timelinePayload));
  const cut = (tl.cuts || []).find((c) => c.id === cutId);
  if (!cut) throw new Error(`S7 mock: cut ${cutId} missing`);
  const newVid = `ver-bump-${Date.now()}`;
  cut.versions_list = [
    ...(cut.versions_list || []),
    { id: newVid, kind: "image", source: "native", created: Date.now(), seconds: 0, width: 64, height: 64 },
  ];
  cut.pick = newVid;
  cut.media = { id: newVid, kind: "image" };
  return tl;
}

async function runScenarioS7(page, pid, cut, switchCutId, marker, wfRel) {
  await selectProject(page, pid);
  await clickCutById(page, cut.id);
  await waitForCutLoaded(page, cut.id);
  await modifyWorkflowViaWidget(page, marker);
  await sleep(4000);
  const fileSaved = await fileWorkflowHasMarker(page, wfRel, marker);
  if (!fileSaved) {
    throw new Error("S7: expected autosaved working copy with marker before version bump");
  }
  const { data: tlData } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
  if (!tlData?.cuts) throw new Error("S7: timeline fetch failed");
  const bumped = buildTimelineWithExtraVersion(tlData, cut.id);
  timelineMocks.set(pid, bumped);
  await reloadTimelineInUi(page, pid);
  timelineMocks.delete(pid);
  await clickCutById(page, switchCutId);
  await waitForCutLoaded(page, switchCutId);
  await sleep(300);
  await clickCutById(page, cut.id);
  await waitForCutLoaded(page, cut.id);
  await waitForGraphNodes(page);
  const afterClick = await activeGraphHasMarker(page, marker);
  console.log(`RESULT S7 afterClick=${afterClick} fileBeforeClick=${fileSaved} (expect source, no marker)`);
  if (afterClick) {
    throw new Error("S7: marker still visible after version bump — should load source, not stale WIP");
  }
}

async function relaunchAfterExit(browser, page, exitKind) {
  if (exitKind === "graceful") {
    await closeBrowserGracefully(browser, page);
  } else {
    await killBrowserAbnormally(browser);
  }
  const nextBrowser = await launchPersistentBrowser();
  const nextPage = await newGuardedPage(nextBrowser);
  await waitForComfy(nextPage);
  await openShotsTab(nextPage);
  return { browser: nextBrowser, page: nextPage };
}

async function measureAfterRelaunch(page, pid, cutId, wfRel, marker) {
  await selectProject(page, pid);
  await sleep(TAB_RESTORE_WAIT_MS);
  const restoredTab = await restoredOpenTabsHaveMarker(page, marker);
  const fileBefore = await fileWorkflowHasMarker(page, wfRel, marker);
  await clickCutById(page, cutId);
  await waitForCutLoaded(page, cutId);
  await waitForGraphNodes(page);
  const afterClick = await activeGraphHasMarker(page, marker);
  const file = await fileWorkflowHasMarker(page, wfRel, marker);
  return { restoredTab, afterClick, file, fileBefore };
}

let browser;
let page;

async function main() {
  ensureDirs();
  try {
    checkRam("startup");
  } catch (e) {
    if (e.skipped) {
      console.log(`SKIP all: ${e.message}`);
      process.exit(0);
    }
    throw e;
  }

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST before start (${blockedPromptAttempts})`);

  browser = await launchPersistentBrowser();
  page = await newGuardedPage(browser);

  await waitForComfy(page);
  const folders = await page.evaluate(() => globalThis.__gongganProjectFolders || "");
  if (folders !== "0.8.2") {
    throw new Error(`gonggan-cut 0.8.2 project folders not loaded (got "${folders}"); hard-refresh ComfyUI`);
  }
  await openShotsTab(page);
  workflowPathsBefore = await fetchWorkflowPaths(page);

  const paths = await fetchWorkflowPaths(page);
  const templateRef = await pickUsableTemplateRef(page, paths);
  if (!templateRef) throw new Error("need at least one saved workflow as template");

  const projectName = `${TEST_PREFIX} ${runStamp}`;
  const pid = await createProjectViaUi(page, projectName, templateRef);

  for (let i = 0; i < 7; i++) {
    await postJson(page, "/gonggan/cut/add", { pid });
  }
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") await globalThis.__gongganReloadShotsData();
  });
  await sleep(600);

  const sorted = await timelineCutsSorted(page, pid);
  if (sorted.length < 8) throw new Error(`expected 8 cuts, got ${sorted.length}`);

  const switchCutId = sorted[0].id;

  const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    if (ONLY.length && !ONLY.includes(sc.id)) continue;
    const cut = sorted[i];
    const marker = `ZZ_EDIT_PERSIST_${sc.id}_${runStamp}`;
    const wfRel = expectedShotWorkflowRel(pid, cut);

    checkRam(`before ${sc.id}`);
    if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST attempted (${blockedPromptAttempts})`);

    if (sc.versionBump) {
      await runScenarioS7(page, pid, cut, switchCutId, marker, wfRel);
      continue;
    }

    await selectProject(page, pid);
    await clickCutById(page, cut.id);
    await waitForCutLoaded(page, cut.id);
    await modifyWorkflowViaWidget(page, marker);

    if (sc.autosaveSwitch) {
      await clickCutById(page, switchCutId);
      await waitForCutLoaded(page, switchCutId);
      await sleep(1500);
    } else if (sc.delayMs > 0) {
      await sleep(sc.delayMs);
    }

    const exitKind = sc.exit;
    ({ browser, page } = await relaunchAfterExit(browser, page, exitKind));

    const { restoredTab, afterClick, file, fileBefore } = await measureAfterRelaunch(page, pid, cut.id, wfRel, marker);

    console.log(
      `RESULT ${sc.id} delay=${sc.delayMs}ms restoredTab=${restoredTab} afterClick=${afterClick} fileBeforeClick=${fileBefore} fileAfterClick=${file}`
    );

    if (MUST_PERSIST.has(sc.id)) {
      if (!afterClick || !fileBefore) {
        throw new Error(
          `${sc.id} failed: afterClick=${afterClick} fileBeforeClick=${fileBefore} fileAfterClick=${file} (edits should persist)`
        );
      }
    }
  }

  try {
    await cleanupNewWorkflows(page);
    await cleanupProjects(page);
  } catch (e) {
    console.warn("cleanup:", e.message);
  }

  try {
    await browser.close();
  } catch (_) {}
  browser = null;
  await destroyPersistentProfile();

  console.log("PASS  edit persistence");
  process.exit(blockedPromptAttempts > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    if (page) await cleanupNewWorkflows(page).catch(() => {});
    if (page) await cleanupProjects(page).catch(() => {});
  } catch (_) {}
  try {
    if (browser) await browser.close();
  } catch (_) {}
  await destroyPersistentProfile();
  process.exit(2);
});
