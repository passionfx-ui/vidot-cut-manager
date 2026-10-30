/**
 * Empty-cut shot load: one owned tab, template or blank canvas.
 * ZZ-test- projects only. Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { fillNewProjectModal, NEW_PROJECT_MODAL } from "./new_project_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-empty-cut";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-empty-cut-${runStamp}`);
const createdProjectIds = [];
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
    (p) => base(p).endsWith(".json") && !/^cut\d+\.json$/i.test(base(p)) && !norm(p).startsWith("gonggan/") && !/_api\.json$/i.test(base(p))
  );
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

async function launchPersistentBrowser() {
  fs.mkdirSync(PERSISTENT_USER_DATA_DIR, { recursive: true });
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: PERSISTENT_USER_DATA_DIR,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
}

async function newGuardedPage(browser) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  return page;
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

async function openNewProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await page.waitForSelector(`${NEW_PROJECT_MODAL} .gg-tpl-combo`, { timeout: 10000 });
}

async function createProjectViaUi(page, name, templateRef) {
  await openNewProjectModal(page);
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

async function reloadShotsData(page) {
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") {
      await globalThis.__gongganReloadShotsData();
    }
  });
  await sleep(400);
}

async function addCutViaApi(page, pid, after) {
  const body = { pid };
  if (after) body.after = after;
  const d = await postJson(page, "/gonggan/cut/add", body);
  await reloadShotsData(page);
  await selectProject(page, pid);
  return d.cut;
}

async function clickCutById(page, cutId) {
  const sel = `.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"]`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
}

async function waitForCutLoaded(page, cutId) {
  await page.waitForFunction(
    (id) => window.app.graph?.extra?.gonggan?.cutId === id,
    { timeout: 90000 },
    cutId
  );
  await sleep(500);
}

async function graphNodeCount(page) {
  return page.evaluate(() => window.app.graph?._nodes?.length || 0);
}

async function countOwnedTabs(page) {
  return page.evaluate(() => {
    const ws = window.app.extensionManager.workflow;
    const open = ws.openWorkflows || [];
    return open.filter((w) => w.ggGongganOwned).length;
  });
}

async function openTabCount(page) {
  return page.evaluate(() => {
    const ws = window.app.extensionManager.workflow;
    return (ws.openWorkflows || []).length;
  });
}

async function cleanupProjects(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
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
      console.log(`SKIP: ${e.message}`);
      process.exit(0);
    }
    throw e;
  }

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);

  try {
    await waitForComfy(page);
    await openShotsTab(page);
    const paths = await fetchWorkflowPaths(page);
    const templateRef = await pickUsableTemplateRef(page, paths);
    if (!templateRef) throw new Error("need a usable workflow template");

    const tplProject = `${TEST_PREFIX}-tpl ${runStamp}`;
    const pidTpl = await createProjectViaUi(page, tplProject, templateRef);
    const { data: tlTpl } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pidTpl)}`);
    const firstCut = (tlTpl?.cuts || [])[0];
    if (!firstCut?.id) throw new Error("template project: missing first cut");
    const emptyCut = await addCutViaApi(page, pidTpl, firstCut.id);
    if (!emptyCut?.id) throw new Error("add cut failed");
    await clickCutById(page, emptyCut.id);
    await waitForCutLoaded(page, emptyCut.id);
    const nodesTpl = await graphNodeCount(page);
    if (nodesTpl <= 0) throw new Error(`empty cut with template: expected nodes > 0, got ${nodesTpl}`);
    if ((await countOwnedTabs(page)) !== 1) throw new Error("template empty cut: owned tab count !== 1");

    const noneProject = `${TEST_PREFIX}-none ${runStamp}`;
    const pidNone = await createProjectViaUi(page, noneProject, "");
    const { data: tlNone } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pidNone)}`);
    const loneCut = (tlNone?.cuts || [])[0];
    if (!loneCut?.id) throw new Error("none project: missing cut");
    await clickCutById(page, loneCut.id);
    await waitForCutLoaded(page, loneCut.id);
    const nodesNone = await graphNodeCount(page);
    if (nodesNone !== 0) throw new Error(`none project empty cut: expected 0 nodes, got ${nodesNone}`);
    if ((await countOwnedTabs(page)) !== 1) throw new Error("none empty cut: owned tab count !== 1");

    await selectProject(page, pidTpl);
    const cutA = firstCut.id;
    const cutB = emptyCut.id;
    await clickCutById(page, cutA);
    await waitForCutLoaded(page, cutA);
    const initialOpen = await openTabCount(page);
    const sequence = [cutB, cutA, cutB, cutA, cutB, cutA];
    for (const id of sequence) {
      await clickCutById(page, id);
      await waitForCutLoaded(page, id);
      await sleep(300);
      const owned = await countOwnedTabs(page);
      const open = await openTabCount(page);
      if (owned !== 1) throw new Error(`tab invariant: owned ${owned} !== 1 after cut ${id}`);
      if (open > initialOpen + 1) {
        throw new Error(`tab invariant: open tabs ${open} > initial+1 (${initialOpen + 1})`);
      }
    }

    await openNewProjectModal(page);
    await sleep(1500);
    const modalTpl = await page.$eval(".gg-tpl-combo", (el) => el.value);
    if (modalTpl !== "") throw new Error(`expected modal template (none), got "${modalTpl}"`);
    await page.click(".gg-modal-cancel");

    console.log("PASS  empty cut: owned tab, template/blank canvas, tab invariant, None memory");
  } finally {
    try {
      await cleanupProjects(page);
    } catch (_) {}
    await browser.close().catch(() => {});
    try {
      fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }

  if (blockedPromptAttempts > 0) throw new Error(`Unsafe POST (${blockedPromptAttempts})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
