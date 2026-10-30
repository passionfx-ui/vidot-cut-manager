/**
 * Headless Chrome: ComfyUI Save / Save As on a cut's shot tab must not make later cut clicks spawn tabs.
 *
 * Save (on the not-yet-saved shot tab, so ComfyUI asks for a name) and Save As run through the real
 * ComfyUI commands (`Comfy.SaveWorkflow`, `Comfy.SaveWorkflowAs`) and the real filename prompt.
 * After each, the cut is clicked several times. Checks: tab count stays the same, the active tab is the
 * cut's own tab at workflows/gonggan/<pid>/<cutId>.json with the cut tab label, and the saved template
 * file is not changed (and its tab is not treated as the cut's tab).
 * No prompts are queued (POST /prompt is blocked). Uses a ZZ test project and deletes it afterwards.
 */
import { shotWorkflowRelPathById } from "../../web/gg_shot_names.js";
import { formatShotTabLabel, shotTabCutParts } from "../../web/gg_tab_label_core.js";
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
const TEST_PREFIX = "ZZ saveas";
const CLICKS_PER_PHASE = 4;
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const createdProjectIds = [];
const createdWorkflowFiles = new Set();
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

async function getJson(page, route) {
  return page.evaluate(async (r) => {
    const res = await fetch(`${location.origin}${r}`);
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

async function pickUsableTemplateRef(page, paths) {
  const norm = (p) => String(p).replace(/^\/+/, "");
  const base = (p) => norm(p).replace(/^.*\//, "").toLowerCase();
  const cands = paths.filter(
    (p) =>
      base(p).endsWith(".json") &&
      !/^cut\d+\.json$/i.test(base(p)) &&
      !norm(p).startsWith("gonggan/") &&
      !/_api\.json$/i.test(base(p))
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
  return "";
}

async function readUserdataText(page, storagePath) {
  const enc = encodeURIComponent(storagePath.replace(/^\/+/, ""));
  const r = await getJson(page, `/api/userdata/${enc}`);
  return r.ok ? r.text : null;
}

async function deleteUserdata(page, storagePath) {
  const enc = encodeURIComponent(storagePath.replace(/^\/+/, ""));
  await page.evaluate(async (p) => {
    await fetch(`${location.origin}/api/userdata/${p}`, { method: "DELETE" });
  }, enc);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-saveas-${runStamp}`);
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
  await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 1, { timeout: 20000 });
  const pid = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.value);
  if (pid) createdProjectIds.push(pid);
  return pid;
}

async function addCutViaMenu(page) {
  const box = await page.evaluate(() => {
    const wrap = document.querySelector(".gg-root.gg-shots .gg-grp-wrap");
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    const cuts = wrap.querySelectorAll(".gg-cut");
    const last = cuts[cuts.length - 1]?.getBoundingClientRect();
    const y = last ? Math.min(last.bottom + 12, r.bottom - 6) : Math.min(r.bottom - 6, r.top + 40);
    return { x: r.left + r.width / 2, y: Math.max(r.top + 2, y) };
  });
  if (!box) throw new Error("gg-grp-wrap not found");
  await page.mouse.click(box.x, box.y, { button: "right" });
  await clickCtxItem(page, "Add Cut");
  await page.waitForFunction(() => document.querySelectorAll(".gg-root.gg-shots .gg-cut").length === 2, { timeout: 20000 });
  await sleep(800);
}

async function timelineCutsSorted(page, pid) {
  const { data } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
  if (!data) throw new Error("timeline fetch failed");
  return [...(data.cuts || [])].sort((a, b) => (a.pos ?? a.index ?? 0) - (b.pos ?? b.index ?? 0));
}

/**
 * Click a cut card and wait until its graph is on the canvas and the tab set settled.
 * A Save As copy carries the same `extra.gonggan`, so with `stablePath` it also waits (bounded) for
 * that tab to be active; on timeout the caller's checks report the actual tabs.
 */
async function clickCut(page, cutId, stablePath = "") {
  const sel = `.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"]`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  await page.waitForFunction((id) => window.app.graph?.extra?.gonggan?.cutId === id, { timeout: 90000 }, cutId);
  if (stablePath) {
    await page
      .waitForFunction(
        (p) => window.app.extensionManager.workflow.activeWorkflow?.path === p,
        { timeout: 10000 },
        stablePath
      )
      .catch(() => {});
  }
  await settleTabs(page);
}

async function settleTabs(page) {
  let last = "";
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    const cur = JSON.stringify(await tabState(page));
    if (cur === last) break;
    last = cur;
  }
  await page.evaluate(() => globalThis.__gongganTabLabelRefresh?.());
  await sleep(250);
}

async function tabState(page) {
  return page.evaluate(() => {
    const ws = window.app.extensionManager.workflow;
    const open = ws.openWorkflows || [];
    const active = ws.activeWorkflow;
    const labels = [...document.querySelectorAll('[data-testid="workflow-tab"]')].map(
      (el) => el.querySelector(".workflow-label")?.textContent?.trim() || ""
    );
    return {
      tabs: open.map((w, i) => ({
        path: w.path,
        temp: !!w.isTemporary,
        owned: !!w.ggGongganOwned,
        metaCut: w.ggGongganMeta?.cutId || "",
        active: w === active,
        label: labels[i] ?? "",
      })),
      activePath: active?.path || "",
      graphCutId: window.app.graph?.extra?.gonggan?.cutId || "",
    };
  });
}

/** Click the workflow tab (top bar) of an open workflow; no-op when it is not open. */
async function activateTabByPath(page, storagePath) {
  const idx = await page.evaluate((p) => {
    const open = window.app.extensionManager.workflow.openWorkflows || [];
    return open.findIndex((w) => w.path === p);
  }, storagePath);
  if (idx < 0) return false;
  const tabs = await page.$$('[data-testid="workflow-tab"]');
  if (!tabs[idx]) throw new Error(`no DOM tab #${idx} for ${storagePath}`);
  await tabs[idx].click();
  await page.waitForFunction(
    (p) => window.app.extensionManager.workflow.activeWorkflow?.path === p,
    { timeout: 15000 },
    storagePath
  );
  await settleTabs(page);
  return true;
}

async function editActiveGraph(page, marker) {
  const res = await page.evaluate((m) => {
    const nodes = window.app.graph?._nodes || [];
    const n = nodes.find((x) => x.widgets?.some((w) => typeof w.value === "string")) || nodes.find((x) => x.widgets?.length);
    if (!n) return "no node with widgets";
    const w = n.widgets.find((x) => typeof x.value === "string") || n.widgets[0];
    const next = typeof w.value === "string" ? `${m}\n${w.value}`.slice(0, 8000) : m;
    w.value = next;
    if (typeof w.callback === "function") w.callback(next);
    window.app.graph?.setDirtyCanvas?.(true, true);
    window.app.graph?.change?.();
    const wf = window.app.extensionManager.workflow.activeWorkflow;
    wf?.changeTracker?.checkState?.();
    return wf?.isModified ? "" : "isModified false";
  }, marker);
  if (res) throw new Error(`edit failed: ${res}`);
}

/** The periodic WIP auto-save writes the edited shot tab to its stable path (no longer temporary). */
async function waitForPersistedTab(page, storagePath) {
  await page.waitForFunction(
    (p) => {
      const w = window.app.extensionManager.workflow.getWorkflowByPath(p);
      return !!w && !w.isTemporary && !w.isModified;
    },
    { timeout: 20000 },
    storagePath
  );
  await settleTabs(page);
}

function fmtTabs(st) {
  return st.tabs
    .map((t) => `${t.active ? "*" : " "}${t.path}${t.temp ? " [temp]" : ""}${t.owned ? ` [owned:${t.metaCut}]` : ""} «${t.label}»`)
    .join("\n    ");
}

/**
 * Run a ComfyUI save command and answer its filename prompt.
 * @returns {Promise<string>} storage path the workflow store now has for `filename`
 */
async function runSaveCommand(page, commandId, filename) {
  await page.evaluate((id) => {
    window.__ggSaveDone = false;
    Promise.resolve(window.app.extensionManager.command.execute(id)).finally(() => {
      window.__ggSaveDone = true;
    });
  }, commandId);
  const input = await page.waitForSelector('[role="dialog"] input[type="text"], .p-dialog input', { visible: true, timeout: 10000 });
  await input.click({ clickCount: 3 });
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type(filename);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__ggSaveDone === true, { timeout: 20000 });
  const storagePath = await page.evaluate((name) => {
    const ws = window.app.extensionManager.workflow;
    const w = (ws.workflows || []).find((x) => x.filename === name && !x.isTemporary);
    return w?.path || "";
  }, filename);
  if (!storagePath) throw new Error(`${commandId}: no persisted workflow named ${filename}`);
  createdWorkflowFiles.add(storagePath);
  await settleTabs(page);
  return storagePath;
}

function expLabel(projectName, cut, cuts, edited) {
  return formatShotTabLabel({ projectName, ...shotTabCutParts(cut, { cuts }), edited: !!edited });
}

/**
 * Click `cut` CLICKS_PER_PHASE times. The tab set must not grow, the active tab must be the cut's
 * stable-path tab with the cut label, and the saved file must stay byte-identical.
 */
async function clickRepeatedlyAndCheck(page, phase, { pid, cut, cuts, projectName, savedPath, savedText, edited }) {
  const stable = `workflows/${shotWorkflowRelPathById({ projectId: pid, cutId: cut.id })}`;
  const label = expLabel(projectName, cut, cuts, edited);
  let baseCount = -1;
  for (let i = 1; i <= CLICKS_PER_PHASE; i++) {
    // Every other click, the user first goes back to the saved file's tab (when it is open).
    if (i % 2 === 0) await activateTabByPath(page, savedPath);
    await clickCut(page, cut.id, stable);
    const st = await tabState(page);
    const where = `${phase} click ${i}`;
    const detail = `\n    ${fmtTabs(st)}`;
    if (baseCount < 0) baseCount = st.tabs.length;
    if (st.tabs.length !== baseCount) throw new Error(`${where}: tab count ${st.tabs.length} != ${baseCount}${detail}`);
    if (st.activePath !== stable) throw new Error(`${where}: active tab ${st.activePath}, want ${stable}${detail}`);
    const act = st.tabs.find((t) => t.active);
    if (act.label !== label) throw new Error(`${where}: active tab label «${act.label}», want «${label}»${detail}`);
    if (st.tabs.filter((t) => t.path === stable).length !== 1) throw new Error(`${where}: stable path not exactly once${detail}`);
    const stray = st.tabs.filter((t) => / \(\d+\)\.json$/.test(t.path));
    if (stray.length) throw new Error(`${where}: stray suffixed tab ${stray.map((t) => t.path).join(", ")}${detail}`);
    const savedTab = st.tabs.find((t) => t.path === savedPath);
    if (savedTab && savedTab.owned) throw new Error(`${where}: saved file tab ${savedPath} is treated as a shot tab${detail}`);
    const now = await readUserdataText(page, savedPath);
    if (now !== savedText) throw new Error(`${where}: saved file ${savedPath} changed on disk`);
  }
  console.log(`ok    ${phase}: ${CLICKS_PER_PHASE} clicks, ${baseCount} tabs, active = cut tab`);
}

async function cleanup(page) {
  await sleep(800);
  for (const p of [...createdWorkflowFiles]) {
    try {
      await deleteUserdata(page, p);
    } catch (e) {
      console.warn(`cleanup ${p}:`, e.message);
    }
  }
  for (const pid of [...new Set(createdProjectIds)]) {
    const folder = `workflows/gonggan/${pid}`;
    for (const p of await fetchWorkflowPaths(page)) {
      const n = String(p).replace(/^\/+/, "").replace(/^workflows\//, "");
      if (n.startsWith(`gonggan/${pid}/`)) {
        try {
          await deleteUserdata(page, `workflows/${n}`);
        } catch (e) {
          console.warn(`cleanup ${folder}:`, e.message);
        }
      }
    }
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup delete ${pid}:`, e.message);
    }
  }
}

let browser;
let page;

async function main() {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
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
  page.on("dialog", (d) => {
    d.accept().catch(() => {});
  });
  await page.setRequestInterception(true);
  attachRequestGuard(page);

  await waitForComfy(page);
  await openShotsTab(page);

  const templateRef = await pickUsableTemplateRef(page, await fetchWorkflowPaths(page));
  const projectName = `${TEST_PREFIX} ${runStamp}`;

  try {
    if (!templateRef) throw new Error("need a template workflow");
    const pid = await createProjectViaUi(page, projectName, templateRef);
    await addCutViaMenu(page);
    const cuts = await timelineCutsSorted(page, pid);
    if (cuts.length < 2) throw new Error(`expected 2 cuts, got ${cuts.length}`);
    const [cutA, cutB] = cuts;
    const ctx = { pid, cuts, projectName };

    // Cut A: an edit is auto-saved to the cut's stable path, then Save As opens a copy in a new tab.
    await clickCut(page, cutA.id);
    const stableA = `workflows/${shotWorkflowRelPathById({ projectId: pid, cutId: cutA.id })}`;
    await editActiveGraph(page, `zz-saveas-${runStamp}`);
    await waitForPersistedTab(page, stableA);
    console.log(`cut A edited + auto-saved:\n    ${fmtTabs(await tabState(page))}`);
    const asName = `${TEST_PREFIX} as ${runStamp}`;
    const asPath = await runSaveCommand(page, "Comfy.SaveWorkflowAs", asName);
    const asText = await readUserdataText(page, asPath);
    if (asText == null) throw new Error(`Save As did not write ${asPath}`);
    console.log(`after Save As -> ${asPath}:\n    ${fmtTabs(await tabState(page))}`);
    await clickRepeatedlyAndCheck(page, "after Save As", { ...ctx, cut: cutA, edited: true, savedPath: asPath, savedText: asText });

    // Cut B: Save on its never-saved shot tab, so ComfyUI asks for a name and renames that tab.
    await clickCut(page, cutB.id);
    const saveName = `${TEST_PREFIX} save ${runStamp}`;
    const savePath = await runSaveCommand(page, "Comfy.SaveWorkflow", saveName);
    const saveText = await readUserdataText(page, savePath);
    if (saveText == null) throw new Error(`Save did not write ${savePath}`);
    console.log(`after Save -> ${savePath}:\n    ${fmtTabs(await tabState(page))}`);
    await clickRepeatedlyAndCheck(page, "after Save", { ...ctx, cut: cutB, savedPath: savePath, savedText: saveText });

    // Switching cuts still uses the stable per-cut paths, and both saved files stay untouched.
    for (let i = 0; i < 2; i++) {
      await clickRepeatedlyAndCheck(page, `switch ${i + 1} cut A`, { ...ctx, cut: cutA, edited: true, savedPath: asPath, savedText: asText });
      await clickRepeatedlyAndCheck(page, `switch ${i + 1} cut B`, { ...ctx, cut: cutB, savedPath: savePath, savedText: saveText });
    }
    if ((await readUserdataText(page, asPath)) !== asText) throw new Error("Save As file changed");
    if ((await readUserdataText(page, savePath)) !== saveText) throw new Error("Save file changed");

    console.log("PASS  save / save as keep the cut tab");
  } catch (e) {
    console.error(`FAIL  save / save as: ${e.message || e}`);
    try {
      await page.screenshot({ path: path.join(SCREENS_DIR, "save-as-cut-tab-fail.png") });
    } catch (_) {}
    process.exitCode = 1;
  } finally {
    try {
      await cleanup(page);
    } catch (e) {
      console.warn("cleanup:", e.message);
    }
    await closeBrowser(browser);
  }

  if (blockedPromptAttempts > 0) process.exit(1);
  process.exit(process.exitCode || 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    if (page) await cleanup(page).catch(() => {});
  } catch (_) {}
  await closeBrowser(browser);
  process.exit(2);
});
