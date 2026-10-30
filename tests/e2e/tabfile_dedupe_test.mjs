/**
 * Headless Chrome: id-based shot tab paths do not pile up suffixed workflow files on reload.
 */
import { sanitizeWorkflowIdSegment, shotWorkflowRelPathById } from "../../web/gg_shot_names.js";
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
const TEST_PREFIX = "ZZ tabfile";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const createdProjectIds = [];
let blockedPromptAttempts = 0;
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
  return pickTemplateRef(paths);
}

async function deleteWorkflowFile(page, relPath) {
  const enc = encodeURIComponent(relPath.replace(/^\/+/, ""));
  await page.evaluate(async (p) => {
    await fetch(`${location.origin}/api/userdata/${p}`, { method: "DELETE" });
  }, enc);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-tabfile-${runStamp}`);
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
  await sleep(500);
}

async function getWorkflowTabState(page) {
  return page.evaluate(() => {
    const ws = window.app.extensionManager.workflow;
    const open = ws.openWorkflows || [];
    const owned = open.filter((w) => w.ggGongganOwned);
    return { openCount: open.length, ownedCount: owned.length };
  });
}

function cutWorkflowBasename(cutId) {
  return `${sanitizeWorkflowIdSegment(cutId)}.json`;
}

function normWorkflowRelPath(p) {
  return String(p ?? "")
    .replace(/^\/+/, "")
    .replace(/^workflows\//, "");
}

async function listProjectGongganWorkflowFiles(page, pid) {
  const folder = sanitizeWorkflowIdSegment(pid);
  const dir = `workflows/gonggan/${folder}`;
  const route = `/api/userdata?dir=${encodeURIComponent(dir)}&recurse=true&split=false`;
  const { data, ok } = await getJson(page, route);
  if (!ok) return [];
  const raw = Array.isArray(data) ? data : data && typeof data === "object" ? Object.keys(data) : [];
  return raw
    .map((x) => (typeof x === "string" ? x : x.path || x.name || ""))
    .filter(Boolean)
    .map((p) => {
      const norm = normWorkflowRelPath(p);
      if (norm.startsWith("gonggan/")) return norm;
      const base = norm.replace(/^.*\//, "");
      return `gonggan/${folder}/${base}`;
    });
}

function assertProjectWorkflowFiles(files, cutA, cutB, pid) {
  const normFiles = files.map((p) => normWorkflowRelPath(p));
  if (normFiles.length > 2) {
    throw new Error(`expected at most 2 workflow files, got ${normFiles.length}: ${normFiles.join(", ")}`);
  }
  const allowedBasenames = new Set([cutWorkflowBasename(cutA.id), cutWorkflowBasename(cutB.id)]);
  const folder = sanitizeWorkflowIdSegment(pid);
  for (const p of normFiles) {
    const base = p.replace(/^.*\//, "");
    if (base.includes(" (")) throw new Error(`suffixed workflow file name: ${base}`);
    if (!allowedBasenames.has(base)) {
      throw new Error(`unexpected workflow file ${base}, allowed ${[...allowedBasenames].join(", ")}`);
    }
    const want = `gonggan/${folder}/${base}`;
    if (p !== want) throw new Error(`unexpected workflow path ${p}, want ${want}`);
  }
}

function isRunGongganPath(p) {
  const norm = normWorkflowRelPath(p);
  const m = norm.match(/^gonggan\/([^/]+)(?:\/|$)/);
  if (!m) return false;
  return createdProjectIds.includes(m[1]);
}

async function cleanupNewWorkflows(page) {
  await sleep(800);
  const before = new Set(workflowPathsBefore.map(normWorkflowRelPath));
  let afterList = await fetchWorkflowPaths(page);
  const created = [];
  for (const p of afterList) {
    const n = normWorkflowRelPath(p);
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

async function cleanupProjects(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup delete ${pid}:`, e.message);
    }
  }
}

async function reloadShots(page, pid) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
  await sleep(1200);
  await openShotsTab(page);
  await page.waitForFunction(
    (id) => {
      const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
      return sel && sel.value === id;
    },
    { timeout: 30000 },
    pid
  );
}

let browser;
let page;

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
    page.on("dialog", (d) => { d.accept().catch(() => {}); }); // beforeunload on reload
  await page.setRequestInterception(true);
  attachRequestGuard(page);

  await waitForComfy(page);
  await openShotsTab(page);
  workflowPathsBefore = await fetchWorkflowPaths(page);

  const paths = await fetchWorkflowPaths(page);
  const templateRef = await pickUsableTemplateRef(page, paths);
  const projectName = `${TEST_PREFIX} ${runStamp}`;
  let pid = "";
  let projectRenamed = false;

  try {
    pid = await createProjectViaUi(page, projectName, templateRef || undefined);
    if (!templateRef) throw new Error("need a template workflow");

    await rightClickEmptyShots(page);
    await clickCtxItem(page, "Add Cut");
    await sleep(800);

    const cuts = await timelineCutsSorted(page, pid);
    if (cuts.length < 2) throw new Error(`expected 2 cuts, got ${cuts.length}`);
    const cutA = cuts[0];
    const cutB = cuts[1];

    for (let cycle = 0; cycle < 10; cycle++) {
      if (cycle === 3 && !projectRenamed) {
        await postJson(page, "/gonggan/project/rename", { pid, name: `${projectName} Renamed` });
        projectRenamed = true;
        await page.evaluate(async () => {
          if (typeof globalThis.__gongganReloadShotsData === "function") {
            await globalThis.__gongganReloadShotsData();
          }
        });
        await sleep(400);
      }

      await clickCutById(page, cutA.id);
      await waitForCutLoaded(page, cutA.id);

      await reloadShots(page, pid);
      await reloadShots(page, pid);

      await clickCutById(page, cutB.id);
      await waitForCutLoaded(page, cutB.id);

      const tabs = await getWorkflowTabState(page);
      if (tabs.ownedCount > 1) {
        throw new Error(`cycle ${cycle + 1}: owned tabs ${tabs.ownedCount} > 1`);
      }

      const files = await listProjectGongganWorkflowFiles(page, pid);
      assertProjectWorkflowFiles(files, cutA, cutB, pid);
    }

    console.log("PASS  tabfile dedupe (10 cycles)");
  } catch (e) {
    console.error(`FAIL  tabfile dedupe: ${e.message || e}`);
    try {
      await page.screenshot({ path: path.join(SCREENS_DIR, `tabfile-dedupe-fail.png`) });
    } catch (_) {}
    process.exitCode = 1;
  } finally {
    try {
      await cleanupNewWorkflows(page);
      await cleanupProjects(page);
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
    if (page) await cleanupProjects(page).catch(() => {});
  } catch (_) {}
  await closeBrowser(browser);
  process.exit(2);
});
