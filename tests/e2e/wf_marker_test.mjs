/**
 * Headless Chrome: edited marker (*) after widget change; clears on new version.
 * ZZ-test- project only. Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { fillNewProjectModal } from "./new_project_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-wf-marker";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-wf-marker-${runStamp}`);
const createdProjectIds = [];
/** @type {Map<string, object>} */
const timelineMocks = new Map();
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
    const btn = await page.waitForSelector('[aria-label="Vidot Cut Manager"]', { timeout: 15000 });
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

async function clickCutById(page, cutId) {
  const sel = `.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"]`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
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
    return { ok: !!wf?.isModified, err: wf?.isModified ? "" : "isModified still false" };
  }, marker);
  if (!ok.ok) throw new Error(ok.err || "failed to modify workflow");
}

async function cutCardTitle(page, cutId) {
  return page.$eval(
    `.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"] .gg-cut-title`,
    (el) => el.textContent || ""
  );
}

async function activeWorkflowTabLabel(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-testid="workflow-tab"]')];
    const active = tabs.find((t) => t.classList.contains("active") || t.getAttribute("aria-selected") === "true") || tabs[tabs.length - 1];
    const span = active?.querySelector(".workflow-label");
    return span?.textContent?.trim() || "";
  });
}

function buildTimelineWithExtraVersion(timelinePayload, cutId) {
  const tl = JSON.parse(JSON.stringify(timelinePayload));
  const cut = (tl.cuts || []).find((c) => c.id === cutId);
  if (!cut) throw new Error(`version bump mock: cut ${cutId} missing`);
  const newVid = `ver-bump-${Date.now()}`;
  cut.versions_list = [
    ...(cut.versions_list || []),
    { id: newVid, kind: "image", source: "native", created: Date.now(), seconds: 0, width: 64, height: 64 },
  ];
  cut.pick = newVid;
  cut.media = { id: newVid, kind: "image" };
  return tl;
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

    const projectName = `${TEST_PREFIX} ${runStamp}`;
    const pid = await createProjectViaUi(page, projectName, templateRef);
    const { data: tl0 } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const cut = (tl0?.cuts || [])[0];
    if (!cut?.id) throw new Error("expected one cut");

    await clickCutById(page, cut.id);
    await waitForCutLoaded(page, cut.id);

    const titleBefore = await cutCardTitle(page, cut.id);
    if (titleBefore.includes("*")) throw new Error("expected no * before edit");

    const marker = `ZZ_WF_MARKER_${runStamp}`;
    await modifyWorkflowViaWidget(page, marker);
    await sleep(4000);

    const titleAfter = await cutCardTitle(page, cut.id);
    if (!titleAfter.includes("*")) throw new Error("expected * on cut card title after autosave mark");
    const tabAfter = await activeWorkflowTabLabel(page);
    if (!tabAfter.includes("*")) throw new Error("expected * on workflow tab label after edit");

    const { data: tlData } = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    timelineMocks.set(pid, buildTimelineWithExtraVersion(tlData, cut.id));
    await reloadTimelineInUi(page, pid);
    timelineMocks.delete(pid);
    await sleep(500);

    const titleFresh = await cutCardTitle(page, cut.id);
    if (titleFresh.includes("*")) {
      throw new Error("expected * to disappear after timeline refresh with new version");
    }

    console.log("PASS  wf marker: * on edit, cleared by new version");
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
