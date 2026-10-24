// comfyui-gonggan-cut — "Shots" sidebar tab + "Timeline" bottom panel tab.
// Day 1: static render of real Gonggan projects/cuts (read-only). Trim/reorder come next.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { createProgressTracker, cutStage, projectSummary, formatSummary } from "./gg_progress_core.js";
import {
  formatCutNumber,
  computeEffectiveSec,
  lengthWarning,
  moveCuts,
  shotsDropTarget,
  finalCutList,
  filterCuts,
  fileBaseName,
  projectCompletion,
  formatDueDisplay,
  formatMinSecDot,
  versionIndexFromList,
} from "./gg_cuts_core.js";
import { bindLoadImageUi, installLoadImageQueueGuard, scheduleLoadImageScan } from "./gg_loadimage.js";
import {
  autosaveModifiedTabs,
  normalizeWorkflowPath,
  pickFreeWorkflowPath,
  pathCollides,
} from "./gg_autosave_core.js";

const EXT = "gonggan.cut";
const PID_KEY = "gg.pid";
const TIMELINE_TAB = "gg-timeline";
const SHOTS_TAB = "gg-shots";
const bus = new EventTarget();
const state = { projects: [], pid: localStorage.getItem(PID_KEY) || "", timeline: null, cutId: "", cutSel: new Set(), error: "" };
const shotsUi = { view: "cuts", needsRedoOnly: false, dragSession: null };
const cutFieldUi = { timer: 0, pending: null };
const projectFieldUi = { timer: 0 };
const JOBS_KEY = "gonggan.jobs";
const progressTracker = createProgressTracker();
const progUi = { paintTimer: 0, statusDebounce: 0, timelineReloadTimer: 0, wired: false, handlers: {} };
const PROGRESS_API_EVENTS = [
  "status", "execution_start", "execution_cached", "executing", "progress", "progress_state",
  "executed", "execution_success", "execution_error", "execution_interrupted",
];
let cutSelAnchor = "";
const ctxUi = { el: null, onDoc: null, onKey: null };

(function loadCss() {
  if (document.getElementById("gg-css")) return;
  const link = document.createElement("link");
  link.id = "gg-css";
  link.rel = "stylesheet";
  link.href = new URL("./gonggan.css", import.meta.url).href;
  document.head.appendChild(link);
})();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mediaUrl = (id) => api.apiURL("/gonggan/media?id=" + encodeURIComponent(id));
const posterUrl = (id) => api.apiURL("/gonggan/poster?id=" + encodeURIComponent(id));
const fmt = (t) => {
  t = Math.max(0, Number(t) || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t * 10) % 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${f}`;
};

function thumbHtml(media, cls) {
  if (!media) return `<div class="${cls} gg-thumb-empty">no media</div>`;
  const url = esc(mediaUrl(media.id));
  if (media.kind === "video") {
    // poster from the pack cache; the video itself loads only on hover (preload=none)
    return `<video class="${cls}" src="${url}" poster="${esc(posterUrl(media.id))}" muted playsinline preload="none"></video>`;
  }
  return `<img class="${cls}" src="${esc(posterUrl(media.id))}" loading="lazy" decoding="async" alt="" />`;
}

async function getJson(route) {
  const res = await api.fetchApi(route);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function loadProjects() {
  try {
    const data = await getJson("/gonggan/projects");
    state.projects = data.projects || [];
    state.error = "";
    if (!state.projects.some((p) => p.id === state.pid)) {
      const pick = state.projects.find((p) => p.id === data.active_project_id) || state.projects[0];
      state.pid = pick ? pick.id : "";
    }
  } catch (e) {
    state.error = "Could not load projects: " + e.message;
  }
  bus.dispatchEvent(new Event("projects"));
  await loadTimeline();
}

async function loadTimeline() {
  if (!state.pid) { state.timeline = null; bus.dispatchEvent(new Event("timeline")); return; }
  try {
    state.timeline = await getJson("/gonggan/timeline?pid=" + encodeURIComponent(state.pid));
    state.error = "";
  } catch (e) {
    state.timeline = null;
    state.error = "Could not load timeline: " + e.message;
  }
  bus.dispatchEvent(new Event("timeline"));
}

function selectProject(pid) {
  if (pid === state.pid) return;
  state.pid = pid;
  state.cutId = "";
  state.cutSel.clear();
  cutSelAnchor = "";
  wfLastLoadedCutId = "";
  localStorage.setItem(PID_KEY, pid);
  bus.dispatchEvent(new Event("projects"));
  refreshProjectTemplateFlag();
  loadTimeline();
}

const NATIVE_READONLY_TIP = "Not available for Gonggan-share (read-only) projects";
const NATIVE_ONLY_TIP = "Native projects only";

function currentProject() {
  return state.projects.find((p) => p.id === state.pid) || null;
}

function isNativePid(pid) {
  return typeof pid === "string" && pid.includes("-");
}

function isNativeProject() {
  const p = currentProject();
  if (p && typeof p.native === "boolean") return p.native;
  return isNativePid(state.pid);
}

function projectOptionLabel(p) {
  const prefix = p.native ? "[Native] " : "";
  const suffix = p.native ? "" : " (read-only)";
  return `${prefix}${p.name || p.id} (${p.cut_count ?? 0})${suffix}`;
}

let projectModalEl = null;

function closeProjectModal() {
  if (projectModalEl) {
    projectModalEl.remove();
    projectModalEl = null;
  }
}

function openNewProjectModal() {
  closeProjectModal();
  const wrap = document.createElement("div");
  wrap.className = "gg-modal-backdrop";
  wrap.innerHTML = `
    <form class="gg-modal" role="dialog" aria-label="New project">
      <h3 class="gg-modal-title">New Project</h3>
      <label class="gg-modal-field">Name <input type="text" class="gg-modal-name" required maxlength="120" /></label>
      <label class="gg-modal-field">Template
        <select class="gg-modal-tpl"><option value="">(none)</option></select>
      </label>
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-modal-cancel">Cancel</button>
        <button type="submit" class="gg-btn gg-primary">Create</button>
      </div>
    </form>`;
  document.body.appendChild(wrap);
  projectModalEl = wrap;
  const form = wrap.querySelector("form");
  const nameIn = wrap.querySelector(".gg-modal-name");
  const tplSel = wrap.querySelector(".gg-modal-tpl");
  fetchUserWorkflowPaths().then(() => {
    tplSel.innerHTML = `<option value="">(none)</option>${userWorkflowPaths.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("")}`;
  });
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) closeProjectModal(); });
  wrap.querySelector(".gg-modal-cancel")?.addEventListener("click", closeProjectModal);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameIn.value.trim();
    if (!name) return;
    const template_ref = tplSel.value || undefined;
    try {
      const d = await postJson("/gonggan/project/create", { name, template_ref });
      closeProjectModal();
      await loadProjects();
      if (d.project?.id) selectProject(d.project.id);
      ggToast("Project", `Created "${name}"`, "ok");
    } catch (err) {
      ggToast("Project", err.message, "warn");
    }
  });
  nameIn.focus();
}

async function renameNativeProject() {
  if (!isNativeProject()) return;
  const p = currentProject();
  const cur = p?.name || "";
  const name = prompt("Project name", cur);
  if (name === null || !name.trim()) return;
  try {
    await postJson("/gonggan/project/rename", { pid: state.pid, name: name.trim() });
    await loadProjects();
    ggToast("Project", "Renamed", "ok");
  } catch (e) {
    ggToast("Project", e.message, "warn");
  }
}

async function deleteNativeProject() {
  if (!isNativeProject()) return;
  const p = currentProject();
  const label = p?.name || state.pid;
  if (!confirm(`Delete project "${label}"? It will be moved to trash.`)) return;
  try {
    await postJson("/gonggan/project/delete", { pid: state.pid });
    state.pid = "";
    await loadProjects();
    ggToast("Project", "Project moved to trash", "ok");
  } catch (e) {
    ggToast("Project", e.message, "warn");
  }
}

function openProjectContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  const nat = isNativeProject();
  showCtxMenu(e.clientX, e.clientY, [
    { label: "New Project…", action: () => openNewProjectModal() },
    { label: "Rename Project…", disabled: !nat, title: nat ? "" : NATIVE_ONLY_TIP, action: () => renameNativeProject() },
    { label: "Delete Project", danger: true, disabled: !nat, title: nat ? "" : NATIVE_ONLY_TIP, action: () => deleteNativeProject() },
  ]);
}

const GG_LEGACY_SHOT_WF_FILE = "gonggan-shot.json";
const GG_LEGACY_SHOT_WF_PATH = "workflows/gonggan-shot.json";
const WF_LOAD_DEBOUNCE_MS = 250;

/** Monotonic token; only selectCut bumps it to cancel stale debounced/in-flight loads. */
let wfLoadToken = 0;
let wfLoadDebounce = 0;
let wfLastLoadedCutId = "";
/** ComfyWorkflow tab last opened by Gonggan shot load (never user workflows). */
let ggOwnedShotWorkflow = null;
/** Paths Gonggan created/renamed this session (lowercase); never overwrite unrelated userdata files. */
const ggOwnedWorkflowPaths = new Set();
let ggCutSwitchAutosaveBlocked = false;
let ggToastTimer = 0;

function ggWorkflowStore() {
  return app.extensionManager?.workflow;
}

function workflowBasename(wf) {
  if (!wf) return "";
  return wf.filename || String(wf.path || "").replace(/^.*\//, "");
}

function normalizeWorkflowBasename(name) {
  const b = String(name ?? "").replace(/^.*\//, "");
  return b.toLowerCase().endsWith(".json") ? b.slice(0, -5).toLowerCase() : b.toLowerCase();
}

function isPathGongganOwned(relPath) {
  const p = normalizeWorkflowPath(relPath).toLowerCase();
  return ggOwnedWorkflowPaths.has(p);
}

function markWorkflowGongganOwned(wf, storagePath) {
  if (!wf) return;
  wf.ggGongganOwned = true;
  const p = normalizeWorkflowPath(storagePath || wf.path || "");
  if (p) ggOwnedWorkflowPaths.add(p.toLowerCase());
}

function isGongganOwnedWorkflow(wf) {
  if (!wf) return false;
  if (wf.ggGongganOwned) return true;
  if (wf === ggOwnedShotWorkflow) return true;
  const p = normalizeWorkflowPath(wf.path || "");
  return p && isPathGongganOwned(p);
}

function isLegacyGongganShotTab(wf) {
  if (!wf) return false;
  return (
    wf.path === GG_LEGACY_SHOT_WF_PATH ||
    workflowBasename(wf) === GG_LEGACY_SHOT_WF_FILE ||
    wf.path?.endsWith(`/${GG_LEGACY_SHOT_WF_FILE}`)
  );
}

function collectGongganShotTabs() {
  const ws = ggWorkflowStore();
  if (!ws) return [];
  const out = [];
  const seen = new Set();
  const add = (w) => {
    if (!w || seen.has(w)) return;
    seen.add(w);
    out.push(w);
  };
  add(ggOwnedShotWorkflow);
  for (const w of ws.openWorkflows || []) {
    if (w === ggOwnedShotWorkflow || isLegacyGongganShotTab(w)) add(w);
    else if (w?.ggGongganOwned) add(w);
    else if (w?.path && isPathGongganOwned(w.path)) add(w);
  }
  return out;
}

async function closeGongganOwnedTab(wf) {
  const ws = ggWorkflowStore();
  if (!ws || !wf) return;
  const open = ws.openWorkflows || [];
  if (!open.includes(wf)) {
    if (ggOwnedShotWorkflow === wf) ggOwnedShotWorkflow = null;
    return;
  }
  try {
    await ws.closeWorkflow(wf, { warnIfUnsaved: false });
  } catch (e) {
    console.warn("[gonggan] close shot tab failed", e);
  }
  if (ggOwnedShotWorkflow === wf) ggOwnedShotWorkflow = null;
}

function ensureWorkflowManagerActive() {
  const ws = ggWorkflowStore();
  if (!ws) return;
  const open = ws.openWorkflows || [];
  if (!ws.activeWorkflow && open.length > 0 && typeof ws.setActiveWorkflow === "function") {
    try {
      ws.setActiveWorkflow(open[0]);
    } catch (e) {
      console.warn("[gonggan] setActiveWorkflow failed", e);
    }
  }
}

async function listWorkflowPathsForAutosave() {
  const res = await api.fetchApi("/userdata?dir=workflows&recurse=true&split=false");
  if (!res.ok) throw new Error(`workflow list HTTP ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== "object") throw new Error("invalid workflow listing");
  const paths = [];
  const keys = Array.isArray(data)
    ? data.map((x) => (Array.isArray(x) ? x[0] : (x && x.path) || x))
    : Object.keys(data);
  for (const k of keys) {
    const rel = normalizeWorkflowPath(String(k).replace(/^workflows\//, ""));
    if (rel.toLowerCase().endsWith(".json")) paths.push(rel);
  }
  const ws = ggWorkflowStore();
  for (const w of ws?.openWorkflows || []) {
    if (w?.path && !w.isTemporary) {
      const rel = normalizeWorkflowPath(String(w.path).replace(/^workflows\//, ""));
      if (rel) paths.push(rel);
    }
  }
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function buildAutosaveDeps() {
  const ws = ggWorkflowStore();
  return {
    caseInsensitive: true,
    saveWorkflow: ws && typeof ws.saveWorkflow === "function" ? (wf) => ws.saveWorkflow(wf) : null,
    renameWorkflow: ws && typeof ws.renameWorkflow === "function" ? (wf, p) => ws.renameWorkflow(wf, p) : null,
    getWorkflowByPath:
      ws && typeof ws.getWorkflowByPath === "function" ? (p) => ws.getWorkflowByPath(p) : null,
    listExistingPaths: listWorkflowPathsForAutosave,
    isGongganOwned: isGongganOwnedWorkflow,
    isPathGongganOwned,
    markPathGongganOwned: markWorkflowGongganOwned,
  };
}

async function prepareGongganShotTabReplace() {
  const tabs = collectGongganShotTabs();
  if (tabs.some((w) => w.isModified)) {
    const deps = buildAutosaveDeps();
    if (typeof deps.saveWorkflow !== "function") {
      ggCutSwitchAutosaveBlocked = true;
      ggToast("Auto-save failed. Switch cancelled.", "saveWorkflow unavailable", "warn");
      return false;
    }
    const result = await autosaveModifiedTabs(tabs, deps);
    if (!result.ok) {
      ggCutSwitchAutosaveBlocked = true;
      ggToast("Auto-save failed. Switch cancelled.", result.failed?.error || "save failed", "warn");
      return false;
    }
    for (const s of result.saved) {
      const detail = s.name || s.path.replace(/^.*\//, "") || "workflow";
      ggToast("Saved", detail, "ok");
    }
  }
  ensureWorkflowManagerActive();
  return true;
}

function shotWorkflowFilename(cut) {
  const pos = cut?.pos ?? cut?.index;
  let base = "";
  if (cut?.name && String(cut.name).trim()) {
    base = String(cut.name)
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  if (!base && pos != null) base = `cut${pos + 1}`;
  if (!base) base = "shot";
  if (!base.toLowerCase().endsWith(".json")) base += ".json";
  return base.slice(0, 120);
}

function adoptGongganShotWorkflow(fileName) {
  const ws = ggWorkflowStore();
  if (!ws) return null;
  const target = normalizeWorkflowBasename(fileName);
  const active = ws.activeWorkflow;
  if (active && normalizeWorkflowBasename(workflowBasename(active)) === target) {
    ggOwnedShotWorkflow = active;
    return active;
  }
  for (const p of [fileName, `workflows/${fileName}`]) {
    const w = ws.getWorkflowByPath?.(p);
    if (w) {
      ggOwnedShotWorkflow = w;
      return w;
    }
  }
  const found =
    (ws.openWorkflows || []).find((w) => normalizeWorkflowBasename(workflowBasename(w)) === target) ??
    null;
  ggOwnedShotWorkflow = found;
  return found;
}

async function resolveShotWorkflowStoragePath(fileName) {
  const base = fileName.includes("/") ? fileName : `workflows/${fileName}`;
  const desired = normalizeWorkflowPath(base);
  const existing = await listWorkflowPathsForAutosave();
  const isTaken = (p) => {
    if (isPathGongganOwned(p)) return false;
    if (pathCollides(p, existing, { caseInsensitive: true })) return true;
    const ws = ggWorkflowStore();
    const other = ws?.getWorkflowByPath?.(p);
    if (other && other !== ggOwnedShotWorkflow) return true;
    return false;
  };
  if (!isTaken(desired)) return desired;
  return pickFreeWorkflowPath(desired, existing, { caseInsensitive: true, isTaken });
}

function isGongganShotTabOpenAndActive() {
  const ws = ggWorkflowStore();
  const wf = ggOwnedShotWorkflow;
  if (!ws || !wf) return false;
  if (!(ws.openWorkflows || []).includes(wf)) return false;
  return ws.isActive?.(wf) ?? false;
}

function shouldSkipWorkflowReload(cutId) {
  if (cutId !== wfLastLoadedCutId || !isGongganShotTabOpenAndActive()) return false;
  try {
    const g = app.graph?.extra?.gonggan;
    return g?.cutId === cutId && g?.pid === state.pid;
  } catch {
    return false;
  }
}

function isUiWorkflowGraph(wf) {
  return wf && Array.isArray(wf.nodes);
}

async function loadWorkflowIntoDedicatedTab(workflow, cut) {
  const fileName = shotWorkflowFilename(cut);
  const storagePath = await resolveShotWorkflowStoragePath(fileName);
  const loadName = storagePath.replace(/^workflows\//, "");
  if (!(await prepareGongganShotTabReplace())) return false;
  const ws = ggWorkflowStore();
  if (
    ggOwnedShotWorkflow &&
    (ws?.openWorkflows || []).includes(ggOwnedShotWorkflow) &&
    typeof ws.setActiveWorkflow === "function"
  ) {
    try {
      ws.setActiveWorkflow(ggOwnedShotWorkflow);
    } catch (e) {
      console.warn("[gonggan] focus shot tab failed", e);
    }
  }
  ensureWorkflowManagerActive();
  try {
    if (isUiWorkflowGraph(workflow)) {
      if (typeof app.loadGraphData !== "function") return false;
      await app.loadGraphData(workflow, true, true, loadName, { deferWarnings: true });
    } else if (typeof app.loadApiJson === "function") {
      await app.loadApiJson(workflow, loadName, { deferWarnings: true });
    } else if (typeof app.loadGraphData === "function") {
      await app.loadGraphData(workflow, true, true, loadName, { deferWarnings: true });
    } else {
      return false;
    }
  } catch (e) {
    console.warn("[gonggan] load failed", e);
    ggToast("Workflow", e?.message || String(e), "warn");
    return false;
  }
  adoptGongganShotWorkflow(loadName);
  markWorkflowGongganOwned(ggOwnedShotWorkflow, storagePath);
  scheduleLoadImageScan({ debounceMs: 200 });
  return true;
}

async function loadShotApiIntoDedicatedTab(apiJson, cut) {
  return loadWorkflowIntoDedicatedTab(apiJson, cut);
}

function ggToast(summary, detail, kind = "info") {
  let host = document.getElementById("gg-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "gg-toast-host";
    host.className = "gg-toast-host";
    document.body.appendChild(host);
  }
  clearTimeout(ggToastTimer);
  host.innerHTML = `<div class="gg-toast gg-toast-${kind}"><span class="gg-toast-sum">${esc(summary)}</span><span class="gg-toast-detail">${esc(detail)}</span></div>`;
  host.hidden = false;
  ggToastTimer = setTimeout(() => { host.hidden = true; }, 4500);
}

function cutById(cutId) {
  const tl = state.timeline;
  return tl ? tl.cuts.find((c) => c.id === cutId) : null;
}

function shotTitle(c) {
  if (!c) return "";
  return `${(c.pos ?? c.index) + 1}. ${c.name || "(untitled)"}`;
}

function panelPreviewHtml(c) {
  if (!c || !c.media) return `<div class="gg-panel-preview gg-panel-preview-empty">No media for this shot yet.</div>`;
  const url = esc(mediaUrl(c.media.id));
  if (c.media.kind === "video") {
    return `<div class="gg-panel-preview"><video class="gg-panel-vid" src="${url}" poster="${esc(posterUrl(c.media.id))}" controls muted playsinline preload="metadata"></video></div>`;
  }
  return `<div class="gg-panel-preview"><img class="gg-panel-img" src="${url}" alt="" decoding="async" /></div>`;
}

async function fetchCutWorkflowPayload(cutId) {
  const tl = state.timeline;
  const q = `/gonggan/workflow?pid=${encodeURIComponent(tl.project.id)}&cut_id=${encodeURIComponent(cutId)}`;
  const res = await api.fetchApi(q);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data, message: data.message || `HTTP ${res.status}` };
}

async function fetchProjectTemplatePayload() {
  const tl = state.timeline;
  const d = await getJson(`/gonggan/template?pid=${encodeURIComponent(tl.project.id)}`);
  return d.exists && d.workflow ? d.workflow : null;
}

const SOURCE_TOAST = {
  stored: "stored version workflow",
  template: "project template",
  draft: "draft workflow",
};

async function fetchCutSourceWorkflowPayload(cutId) {
  const tl = state.timeline;
  const q = `/gonggan/cut-source-workflow?pid=${encodeURIComponent(tl.project.id)}&cut=${encodeURIComponent(cutId)}`;
  const res = await api.fetchApi(q);
  if (res.status === 404) {
    const err = new Error("cut-source-workflow unavailable");
    err.status = 404;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (!data.workflow) {
    throw new Error("no workflow for this shot");
  }
  return data;
}

/** Ordered workflow sources for shot click (prepend new sources here). */
const LEGACY_CUT_WORKFLOW_SOURCES = [
  {
    id: "cut",
    async resolve(cutId) {
      const hit = await fetchCutWorkflowPayload(cutId);
      if (!hit.ok) {
        const err = new Error(hit.message);
        err.status = hit.status;
        throw err;
      }
      return { workflow: hit.data.workflow, sdkMsg: `Canvas: ${hit.data.cut_no}. ${hit.data.cut_name} · ${hit.data.model} · seed ${hit.data.seed}`, toastKind: "ok", toastDetail: "draft workflow", toastSummary: "draft" };
    },
  },
  {
    id: "template",
    async resolve(cutId) {
      const wf = await fetchProjectTemplatePayload();
      if (!wf) throw new Error("no project template");
      const c = cutById(cutId);
      const title = shotTitle(c);
      return { workflow: wf, sdkMsg: `Canvas: ${title} (project template)`, toastKind: "ok", toastDetail: "project template", toastSummary: "template" };
    },
  },
];

const CUT_WORKFLOW_SOURCES = [
  {
    id: "stored",
    async resolve(cutId) {
      const data = await fetchCutSourceWorkflowPayload(cutId);
      const c = cutById(cutId);
      const title = shotTitle(c);
      const src = data.source || "stored";
      const label = SOURCE_TOAST[src] || src;
      return {
        workflow: data.workflow,
        sdkMsg: `Canvas: ${title} (${label})`,
        toastKind: "ok",
        toastDetail: label,
        toastSummary: src === "template" ? "template" : src === "draft" ? "draft" : "stored",
      };
    },
  },
  ...LEGACY_CUT_WORKFLOW_SOURCES,
];

async function loadCutWorkflow(cutId, cut, loadToken) {
  const tl = state.timeline;
  if (!tl || !cutId) return;
  if (loadToken !== undefined && loadToken !== wfLoadToken) return;
  if (shouldSkipWorkflowReload(cutId)) return;
  ggCutSwitchAutosaveBlocked = false;
  const cutRec = cut || cutById(cutId);
  const title = shotTitle(cutRec);
  let lastErr = null;
  for (const src of CUT_WORKFLOW_SOURCES) {
    try {
      const hit = await src.resolve(cutId);
      if (loadToken !== wfLoadToken) return;
      const loaded = await loadWorkflowIntoDedicatedTab(hit.workflow, cutRec);
      if (loadToken !== wfLoadToken) return;
      if (ggCutSwitchAutosaveBlocked) return;
      if (!loaded) {
        lastErr = new Error("workflow load failed");
        continue;
      }
      wfLastLoadedCutId = cutId;
      markGraphGongganCut(cutId);
      sdk.msg = hit.sdkMsg;
      bus.dispatchEvent(new Event("sdk"));
      const sum = hit.toastSummary || "Shot";
      const detail = hit.toastDetail ? `${title} — ${hit.toastDetail}` : title;
      ggToast(sum, detail, hit.toastKind);
      return;
    } catch (e) {
      lastErr = e;
      if (src.id === "stored" && e.status === 404) {
        for (const leg of LEGACY_CUT_WORKFLOW_SOURCES) {
          try {
            const hit = await leg.resolve(cutId);
            if (loadToken !== wfLoadToken) return;
            const loaded = await loadWorkflowIntoDedicatedTab(hit.workflow, cutRec);
            if (loadToken !== wfLoadToken) return;
            if (ggCutSwitchAutosaveBlocked) return;
            if (!loaded) {
              lastErr = new Error("workflow load failed");
              continue;
            }
            wfLastLoadedCutId = cutId;
            markGraphGongganCut(cutId);
            sdk.msg = hit.sdkMsg;
            bus.dispatchEvent(new Event("sdk"));
            const sum = hit.toastSummary || "Shot";
            const detail = hit.toastDetail ? `${title} — ${hit.toastDetail}` : title;
            ggToast(sum, detail, hit.toastKind);
            return;
          } catch (le) {
            lastErr = le;
            if (leg.id === "cut" && le.status === 400) continue;
            break;
          }
        }
        break;
      }
      if (src.id === "cut" && e.status === 400) continue;
      break;
    }
  }
  if (loadToken !== wfLoadToken) return;
  const msg = lastErr ? lastErr.message : "workflow unavailable";
  const hasMedia = cut && cut.media;
  sdk.msg = hasMedia ? `Shot: ${title} (preview — no workflow: ${msg})` : `Shot: ${title} — ${msg}`;
  bus.dispatchEvent(new Event("sdk"));
  ggToast("Shot", hasMedia ? `${title} — preview only (${msg})` : `${title} — ${msg}`, "warn");
}

let projectHasTemplate = false;
let projectTemplateRef = "";
let userWorkflowPaths = [];

async function fetchUserWorkflowPaths() {
  try {
    const res = await api.fetchApi("/userdata?dir=workflows&recurse=true&split=false");
    const data = await res.json().catch(() => ({}));
    const paths = [];
    if (data && typeof data === "object") {
      const keys = Array.isArray(data) ? data.map((x) => (Array.isArray(x) ? x[0] : (x && x.path) || x)) : Object.keys(data);
      for (const k of keys) {
        const rel = String(k).replace(/^workflows\//, "");
        if (rel.toLowerCase().endsWith(".json")) paths.push(rel);
      }
    }
    paths.sort((a, b) => a.localeCompare(b));
    userWorkflowPaths = paths;
  } catch (_) {
    userWorkflowPaths = [];
  }
  return userWorkflowPaths;
}

function templateSelectOptionsHtml() {
  const opts = [`<option value="">(none)</option>`];
  const cur = projectTemplateRef || "";
  for (const p of userWorkflowPaths) {
    opts.push(`<option value="${esc(p)}"${p === cur ? " selected" : ""}>${esc(p)}</option>`);
  }
  if (cur && !userWorkflowPaths.includes(cur)) {
    opts.push(`<option value="${esc(cur)}" selected>${esc(cur)}</option>`);
  }
  return opts.join("");
}

async function refreshProjectTemplateFlag() {
  if (!state.pid) {
    projectHasTemplate = false;
    projectTemplateRef = "";
    bus.dispatchEvent(new Event("template"));
    return;
  }
  try {
    const d = await getJson(`/gonggan/template?pid=${encodeURIComponent(state.pid)}`);
    projectHasTemplate = !!d.exists;
    projectTemplateRef = d.ref || "";
  } catch (_) {
    projectHasTemplate = false;
    projectTemplateRef = "";
  }
  bus.dispatchEvent(new Event("template"));
}

async function setProjectTemplateRef(ref) {
  if (!state.pid) {
    ggToast("Template", "Select a project first", "warn");
    return;
  }
  try {
    await postJson("/gonggan/template", { pid: state.pid, ref: ref || "" });
    projectTemplateRef = ref || "";
    projectHasTemplate = !!ref;
    bus.dispatchEvent(new Event("template"));
    ggToast("Template", ref ? `Linked ${ref}` : "Template cleared", "ok");
  } catch (e) {
    ggToast("Template", e.message, "warn");
  }
}

async function addLocalCut() {
  if (!state.pid) {
    ggToast("Cut", "Select a project first", "warn");
    return;
  }
  const active = state.cutId ? cutById(state.cutId) : null;
  const body = { pid: state.pid };
  if (active && active.group_id) body.group = active.group_id;
  if (state.cutId) body.after = state.cutId;
  try {
    const d = await postJson("/gonggan/cut/add", body);
    if (d.timeline) {
      state.timeline = d.timeline;
      bus.dispatchEvent(new Event("timeline"));
    } else {
      await loadTimeline();
    }
    if (d.cut && d.cut.id) {
      wfLastLoadedCutId = "";
      selectCut(d.cut.id);
    }
    if (d.template_copied) {
      ggToast("Cut", `Added ${d.cut.name}`, "ok");
    } else {
      ggToast("Cut", `${d.cut.name} — no project template (empty workflow)`, "warn");
    }
  } catch (e) {
    ggToast("Cut", e.message, "warn");
  }
}

function displayedCutIds() {
  const cuts = state.timeline ? state.timeline.cuts : [];
  const groups = state.timeline ? state.timeline.groups || [] : [];
  const out = [];
  for (const sec of shotsSections(cuts, groups)) {
    for (const c of sec.cuts) out.push(c.id);
  }
  return out;
}

function selectCutRange(fromId, toId) {
  const order = displayedCutIds();
  const i = order.indexOf(fromId);
  const j = order.indexOf(toId);
  if (i < 0 || j < 0) return;
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  state.cutSel.clear();
  for (let k = lo; k <= hi; k++) state.cutSel.add(order[k]);
  state.cutId = toId;
  cutSelAnchor = fromId;
  bus.dispatchEvent(new Event("select"));
  const idx = state.timeline ? state.timeline.cuts.findIndex((c) => c.id === toId) : -1;
  if (idx >= 0 && typeof seek === "function" && !play.on) {
    play.idx = -1;
    seek(startOf(idx) + 0.001);
  }
}

function selectCut(cutId, opts) {
  const range = opts && opts.range;
  const multi = opts && opts.multi;
  if (range) {
    const anchor = cutSelAnchor || state.cutId || cutId;
    selectCutRange(anchor, cutId);
    return;
  }
  const cut = cutById(cutId);
  if (multi) {
    if (state.cutSel.has(cutId)) state.cutSel.delete(cutId);
    else state.cutSel.add(cutId);
    cutSelAnchor = cutId;
  } else {
    state.cutSel.clear();
    cutSelAnchor = cutId;
  }
  state.cutId = cutId;
  bus.dispatchEvent(new Event("select"));
  const i = state.timeline ? state.timeline.cuts.findIndex((c) => c.id === cutId) : -1;
  if (i >= 0 && typeof seek === "function" && !play.on) {
    play.idx = -1;
    seek(startOf(i) + 0.001);
  }
  if (!multi && !range) {
    clearTimeout(wfLoadDebounce);
    try {
      const g = app.graph?.extra?.gonggan;
      if (g?.cutId !== cutId || (state.pid && g?.pid !== state.pid)) {
        wfLastLoadedCutId = "";
      }
    } catch (_) {}
    const loadToken = ++wfLoadToken;
    wfLoadDebounce = setTimeout(() => loadCutWorkflow(cutId, cut, loadToken), WF_LOAD_DEBOUNCE_MS);
  }
}

function closeCtxMenu() {
  if (ctxUi.el) {
    ctxUi.el.remove();
    ctxUi.el = null;
  }
  if (ctxUi.onDoc) {
    document.removeEventListener("mousedown", ctxUi.onDoc, true);
    ctxUi.onDoc = null;
  }
  if (ctxUi.onKey) {
    document.removeEventListener("keydown", ctxUi.onKey, true);
    ctxUi.onKey = null;
  }
}

function showCtxMenu(x, y, items) {
  closeCtxMenu();
  const menu = document.createElement("div");
  menu.className = "gg-ctx";
  menu.setAttribute("role", "menu");
  items.forEach((it) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gg-ctx-item" + (it.danger ? " gg-ctx-danger" : "");
    btn.textContent = it.label;
    btn.disabled = !!it.disabled;
    if (it.title) btn.title = it.title;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeCtxMenu();
      if (!it.disabled && it.action) it.action();
    });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  ctxUi.el = menu;
  const pad = 6;
  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;
  ctxUi.onDoc = (e) => {
    if (!menu.contains(e.target)) closeCtxMenu();
  };
  ctxUi.onKey = (e) => {
    if (e.key === "Escape") closeCtxMenu();
  };
  document.addEventListener("mousedown", ctxUi.onDoc, true);
  document.addEventListener("keydown", ctxUi.onKey, true);
}

function cutsForDelete() {
  const ids = cutSelIds();
  return ids.length ? ids : (state.cutId ? [state.cutId] : []);
}

async function deleteSelectedCuts() {
  const ids = cutsForDelete();
  if (!ids.length || !state.pid) return;
  const msg = ids.length === 1 ? "Delete 1 cut?" : `Delete ${ids.length} cuts?`;
  if (!confirm(msg)) return;
  try {
    const d = await postJson("/gonggan/cut/delete", { pid: state.pid, cuts: ids });
    if (d.timeline) state.timeline = d.timeline;
    state.cutSel.clear();
    cutSelAnchor = "";
    if (ids.includes(state.cutId)) {
      state.cutId = state.timeline?.cuts?.[0]?.id || "";
      wfLastLoadedCutId = "";
    }
    state.error = "";
    bus.dispatchEvent(new Event("timeline"));
    bus.dispatchEvent(new Event("select"));
    ggToast("Delete", `${ids.length} cut(s) hidden`, "ok");
  } catch (e) {
    ggToast("Delete", e.message, "warn");
  }
}

async function addCutAfter(cutId) {
  if (!state.pid) return;
  const c = cutById(cutId);
  const body = { pid: state.pid, after: cutId };
  if (c && c.group_id) body.group = c.group_id;
  try {
    const d = await postJson("/gonggan/cut/add", body);
    if (d.timeline) {
      state.timeline = d.timeline;
      bus.dispatchEvent(new Event("timeline"));
    } else await loadTimeline();
    if (d.cut?.id) {
      wfLastLoadedCutId = "";
      selectCut(d.cut.id);
    }
    ggToast("Cut", d.template_copied ? `Added ${d.cut.name}` : `${d.cut.name} — no template`, d.template_copied ? "ok" : "warn");
  } catch (e) {
    ggToast("Cut", e.message, "warn");
  }
}

function openCutContextMenu(e, cutId) {
  e.preventDefault();
  e.stopPropagation();
  if (!state.cutSel.has(cutId)) {
    state.cutSel.clear();
    state.cutSel.add(cutId);
    cutSelAnchor = cutId;
    state.cutId = cutId;
    bus.dispatchEvent(new Event("select"));
  }
  const ids = cutSelIds();
  const c = cutById(cutId);
  const inScene = !!(c && c.group_id);
  const nat = isNativeProject();
  const redoLabel = c?.needs_redo ? "Clear needs redo" : "Mark needs redo";
  showCtxMenu(e.clientX, e.clientY, [
    { label: "Group into Scene", action: () => createSceneGroup(ids) },
    { label: "Remove from Scene", disabled: !inScene && !ids.some((id) => cutById(id)?.group_id), action: () => ungroupCuts(ids) },
    { label: redoLabel, disabled: !nat, title: nat ? "" : NATIVE_READONLY_TIP, action: () => toggleNeedsRedo(cutId) },
    { label: "Add Cut", action: () => addCutAfter(cutId) },
    { label: "Delete", danger: true, action: () => deleteSelectedCuts() },
  ]);
}

function openSceneContextMenu(e, groupId) {
  e.preventDefault();
  e.stopPropagation();
  showCtxMenu(e.clientX, e.clientY, [
    { label: "Rename", action: () => renameSceneGroup(groupId) },
    { label: "Ungroup", action: () => ungroupSceneGroup(groupId) },
  ]);
}

function openShotsPanelContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  const items = [{ label: "Add Cut", action: () => addLocalCut() }];
  const ids = cutSelIds();
  if (ids.length) items.push({ label: "New Scene", action: () => createSceneGroup(ids) });
  showCtxMenu(e.clientX, e.clientY, items);
}

async function ungroupSceneGroup(groupId) {
  await persistGroups(groupsClone().filter((g) => g.id !== groupId));
}

function cutSelIds() {
  const cuts = state.timeline ? state.timeline.cuts : [];
  const ids = cuts.filter((c) => state.cutSel.has(c.id)).map((c) => c.id);
  if (!ids.length && state.cutId) ids.push(state.cutId);
  return ids;
}

function groupsClone() {
  return JSON.parse(JSON.stringify(state.timeline?.groups || []));
}

async function persistGroups(groups) {
  const tl = state.timeline;
  if (!tl) return;
  const data = await postJson("/gonggan/groups", { pid: tl.project.id, groups });
  state.timeline = data;
  state.error = "";
  bus.dispatchEvent(new Event("timeline"));
}

function stripCutsFromGroups(groups, cutIds) {
  const drop = new Set(cutIds);
  groups.forEach((g) => { g.cut_ids = (g.cut_ids || []).filter((id) => !drop.has(id)); });
  return groups.filter((g) => (g.cut_ids || []).length);
}

function orderCutIds(ids) {
  const cuts = state.timeline ? state.timeline.cuts : [];
  const rank = new Map(cuts.map((c, i) => [c.id, i]));
  return [...ids].sort((a, b) => (rank.get(a) ?? 9999) - (rank.get(b) ?? 9999));
}

async function createSceneGroup(cutIds) {
  let ids = orderCutIds(cutIds && cutIds.length ? cutIds : cutSelIds());
  if (!ids.length && state.cutId) ids = [state.cutId];
  if (!ids.length) return;
  const title = prompt("Scene name", "Scene " + ((state.timeline?.groups?.length || 0) + 1));
  if (title === null || !title.trim()) return;
  let groups = stripCutsFromGroups(groupsClone(), ids);
  groups.push({ id: "s" + Date.now(), name: title.trim().slice(0, 40), cut_ids: ids, collapsed: false });
  state.cutSel.clear();
  cutSelAnchor = "";
  await persistGroups(groups);
}

async function ungroupCuts(cutIds) {
  const ids = cutIds && cutIds.length ? cutIds : cutSelIds();
  state.cutSel.clear();
  cutSelAnchor = "";
  await persistGroups(stripCutsFromGroups(groupsClone(), ids));
}

async function renameSceneGroup(groupId) {
  const g = (state.timeline?.groups || []).find((x) => x.id === groupId);
  if (!g) return;
  const title = prompt("Scene name", g.name || "Scene");
  if (title === null || !title.trim()) return;
  const groups = groupsClone();
  const hit = groups.find((x) => x.id === groupId);
  if (hit) hit.name = title.trim().slice(0, 40);
  await persistGroups(groups);
}

async function deleteSceneGroup(groupId) {
  if (!confirm("Delete this scene? (Cuts become ungrouped)")) return;
  await persistGroups(groupsClone().filter((g) => g.id !== groupId));
}

async function toggleGroupCollapsed(groupId) {
  const groups = groupsClone();
  const g = groups.find((x) => x.id === groupId);
  if (!g) return;
  g.collapsed = !g.collapsed;
  await persistGroups(groups);
}

async function assignCutsToGroup(groupId, cutIds) {
  const ids = orderCutIds(cutIds);
  let groups = stripCutsFromGroups(groupsClone(), ids);
  const g = groups.find((x) => x.id === groupId);
  if (!g) return;
  g.cut_ids = orderCutIds([...(g.cut_ids || []), ...ids]);
  state.cutSel.clear();
  cutSelAnchor = "";
  await persistGroups(groups);
}

async function splitSceneHere(cutId) {
  const tl = state.timeline;
  if (!tl) return;
  const cuts = tl.cuts;
  const idx = cuts.findIndex((c) => c.id === cutId);
  if (idx < 0) return;
  const gid = cuts[idx].group_id;
  const title = prompt("Scene name", cuts[idx].group_name || "Scene");
  if (title === null || !title.trim()) return;
  const moveIds = [];
  for (let i = idx; i < cuts.length; i++) {
    if (!gid || cuts[i].group_id === gid) moveIds.push(cuts[i].id);
    else break;
  }
  let groups = stripCutsFromGroups(groupsClone(), moveIds);
  groups.push({ id: "s" + Date.now(), name: title.trim().slice(0, 40), cut_ids: moveIds, collapsed: false });
  await persistGroups(groups);
}

function groupColor(id) {
  let h = 0;
  for (let i = 0; i < (id || "").length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return [42, 88, 148, 118, 168, 28, 198][Math.abs(h) % 7];
}

function shotsSections(cuts, groups) {
  const rank = new Map(cuts.map((c, i) => [c.id, i]));
  const inGrp = new Set();
  const secs = (groups || []).map((g) => {
    const ids = (g.cut_ids || []).filter((id) => rank.has(id));
    ids.forEach((id) => inGrp.add(id));
    ids.sort((a, b) => rank.get(a) - rank.get(b));
    return { type: "group", group: g, cuts: ids.map((id) => cuts.find((c) => c.id === id)).filter(Boolean) };
  }).filter((s) => s.cuts.length);
  secs.sort((a, b) => rank.get(a.cuts[0].id) - rank.get(b.cuts[0].id));
  const loose = cuts.filter((c) => !inGrp.has(c.id));
  if (loose.length) secs.push({ type: "ungrouped", group: null, cuts: loose });
  return secs;
}

function markGraphGongganCut(cutId) {
  try {
    if (!app.graph) return;
    app.graph.extra = app.graph.extra || {};
    app.graph.extra.gonggan = { pid: state.pid, cutId };
  } catch (_) {}
}

function loadPersistedJobs() {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    for (const j of list.slice(0, 200)) {
      if (j?.promptId && j?.cutId && j?.projectId) {
        progressTracker.registerPrompt(j.promptId, j.cutId, j.projectId);
      }
    }
  } catch (_) {}
}

function persistJob(promptId, cutId, projectId) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(JOBS_KEY) || "[]");
    if (!Array.isArray(list)) list = [];
  } catch (_) {
    list = [];
  }
  list.unshift({ promptId, cutId, projectId, ts: Date.now() });
  const seen = new Set();
  list = list.filter((x) => {
    if (!x?.promptId || seen.has(x.promptId)) return false;
    seen.add(x.promptId);
    return true;
  }).slice(0, 200);
  localStorage.setItem(JOBS_KEY, JSON.stringify(list));
}

function progressPanelsActive() {
  if (document.hidden) return false;
  if (shotsSidebarActive()) return true;
  if (timelineBottomTabActive()) return true;
  const tl = document.querySelector(".gg-timeline");
  return !!(tl && tl.isConnected && tl.offsetParent);
}

function cutByIdTimeline(cutId) {
  const cuts = state.timeline?.cuts || [];
  return cuts.find((c) => c.id === cutId) || null;
}

function liveProgressView(cut) {
  const st = state.pid && cut ? progressTracker.getCutStatus(state.pid, cut.id) : null;
  if (!st) return { show: false, text: "", pct: 0, tip: "", mode: "" };
  if (st.state === "queued") {
    const q = st.queuePos != null ? `Queued #${st.queuePos}` : "Queued";
    return { show: true, text: q, pct: 0, tip: "", mode: "queued" };
  }
  if (st.state === "running") {
    const pct = st.percent != null ? Math.round(st.percent) : 0;
    return { show: true, text: `${pct}%`, pct, tip: st.node || "", mode: "running" };
  }
  if (st.state === "failed") {
    return { show: true, text: "Failed", pct: st.percent ?? 0, tip: st.error || "Failed", mode: "failed" };
  }
  return { show: false, text: "", pct: 0, tip: "", mode: "" };
}

function stagePillTip(kind, met) {
  if (kind === "image") return met ? "Image registered" : "No image yet";
  if (kind === "video") return met ? "Video registered" : "No video yet";
  return met ? "Best cut selected" : "No best cut yet";
}

function firstUnmetStage(s) {
  if (!s.image) return "image";
  if (!s.video) return "video";
  if (!s.best) return "best";
  return null;
}

function applyStageToCutRow(li, cut) {
  if (!li || !cut) return;
  const s = cutStage(cut);
  const next = firstUnmetStage(s);
  const row = li.querySelector(".gg-stage-row");
  if (!row) return;
  row.classList.toggle("gg-stage-all-done", s.stage === "done");
  const glow = row.querySelector(".gg-done-glow");
  if (glow) glow.hidden = s.stage !== "done";
  if (s.stage === "done") row.title = "Done — best cut selected";
  else row.removeAttribute("title");
  for (const pill of row.querySelectorAll(".gg-stage-pill")) {
    const k = pill.dataset.k;
    const met = k === "image" ? s.image : k === "video" ? s.video : s.best;
    pill.classList.toggle("gg-on", met);
    pill.classList.toggle("gg-off", !met);
    pill.classList.toggle("gg-next", k === next);
    pill.title = stagePillTip(k, met);
  }
}

function applyLiveChipToRow(li, cut) {
  const chip = li?.querySelector(".gg-live-chip");
  if (!chip || !cut) return;
  const v = liveProgressView(cut);
  chip.hidden = !v.show;
  chip.classList.toggle("gg-live-run", v.mode === "running");
  chip.classList.toggle("gg-live-queue", v.mode === "queued");
  chip.classList.toggle("gg-live-failed", v.mode === "failed");
  const text = chip.querySelector(".gg-live-text");
  if (text) text.textContent = v.text;
  if (v.tip) chip.title = v.tip;
  else chip.removeAttribute("title");
}

function applyProgressToThumb(li, cut) {
  if (!li || !cut) return;
  applyStageToCutRow(li, cut);
  applyLiveChipToRow(li, cut);
}

function paintProjectSummary(root) {
  const tl = state.timeline;
  const cuts = tl?.cuts || [];
  const sum = projectSummary(cuts);
  const text = formatSummary(sum);
  const comp = projectCompletion(tl || { cuts: [] });
  const due = formatDueDisplay(comp);
  const hosts = [];
  if (root) hosts.push(root);
  else document.querySelectorAll(".gg-root.gg-shots").forEach((el) => hosts.push(el));
  for (const host of hosts) {
    const line = host.querySelector?.(".gg-summary-text");
    const bar = host.querySelector?.(".gg-summary-bar");
    if (line) line.textContent = text;
    if (bar) {
      const t = sum.total || 1;
      const segDone = bar.querySelector(".gg-seg-done");
      const segVideo = bar.querySelector(".gg-seg-video");
      const segImage = bar.querySelector(".gg-seg-image");
      if (segDone) segDone.style.flex = `${sum.done} 0 0`;
      if (segVideo) segVideo.style.flex = `${sum.video} 0 0`;
      if (segImage) segImage.style.flex = `${sum.image} 0 0`;
      bar.hidden = sum.total === 0;
    }
    const cbar = host.querySelector?.(".gg-complete-bar");
    const cpct = host.querySelector?.(".gg-complete-pct");
    if (cbar) {
      const fill = cbar.querySelector(".gg-complete-fill");
      if (fill) fill.style.width = `${comp.percent}%`;
      cbar.title = `Best set on ${comp.done} of ${comp.total} cuts`;
    }
    if (cpct) cpct.textContent = comp.total ? `${comp.percent}%` : "";
    const dueIn = host.querySelector?.(".gg-due-input");
    const dueTxt = host.querySelector?.(".gg-due-text");
    const nat = isNativeProject();
    if (dueIn) {
      dueIn.value = comp.dueDate || "";
      dueIn.disabled = !nat;
      dueIn.title = nat ? "Project due date" : NATIVE_READONLY_TIP;
    }
    if (dueTxt) {
      dueTxt.textContent = due.text;
      dueTxt.classList.toggle("gg-due-over", due.overdue);
      dueTxt.title = due.text;
    }
  }
}

function paintAllCutProgress() {
  document.querySelectorAll(".gg-shots .gg-cut").forEach((li) => {
    const cut = cutByIdTimeline(li.dataset.cutId);
    applyProgressToThumb(li, cut);
  });
  document.querySelectorAll(".gg-timeline .gg-clip").forEach((el) => {
    const cut = cutByIdTimeline(el.dataset.cutId);
    applyProgressToClip(el, cut);
  });
  paintProjectSummary(null);
  updateOtherJobsChip();
}

function clipStageDotClass(stage) {
  if (stage === "done") return "gg-dot-done";
  if (stage === "video") return "gg-dot-video";
  if (stage === "image") return "gg-dot-image";
  return "gg-dot-empty";
}

function applyProgressToClip(el, cut) {
  if (!el || !cut) return;
  const s = cutStage(cut);
  const dot = el.querySelector(".gg-clip-dot");
  if (dot) {
    dot.className = `gg-clip-dot ${clipStageDotClass(s.stage)}`;
    dot.title = s.stage === "done" ? "Done — best cut selected" : "";
  }
  const wrap = el.querySelector(".gg-clip-prog");
  const v = liveProgressView(cut);
  const running = v.show && v.mode === "running";
  if (wrap) {
    wrap.hidden = !running;
    wrap.classList.toggle("gg-prog-run", running);
    const fill = wrap.querySelector(".gg-prog-fill");
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, v.pct))}%`;
    if (v.tip) wrap.title = v.tip;
    else wrap.removeAttribute("title");
  }
}

function scheduleProgressPaint(cutId) {
  if (cutId) progUi.pending = progUi.pending || new Set();
  if (cutId) progUi.pending.add(cutId);
  if (progUi.paintTimer) return;
  progUi.paintTimer = setTimeout(() => {
    progUi.paintTimer = 0;
    const pending = progUi.pending;
    progUi.pending = null;
    if (pending && pending.size) {
      for (const id of pending) {
        document.querySelectorAll(`.gg-cut[data-cut-id="${CSS.escape(id)}"]`).forEach((li) => {
          applyProgressToThumb(li, cutByIdTimeline(id));
        });
        document.querySelectorAll(`.gg-clip[data-cut-id="${CSS.escape(id)}"]`).forEach((el) => {
          applyProgressToClip(el, cutByIdTimeline(id));
        });
      }
    }
    updateOtherJobsChip();
  }, 250);
}

function updateOtherJobsChip() {
  const { running, pending } = progressTracker.getOther();
  const chips = document.querySelectorAll(".gg-other-chip");
  let text = "";
  if (running === 1 && pending === 0) text = "Other job running";
  else if (running > 0 || pending > 0) {
    const parts = [];
    if (running) parts.push(`${running} running`);
    if (pending) parts.push(`${pending} queued`);
    text = `Other jobs: ${parts.join(", ")}`;
  }
  chips.forEach((el) => {
    el.hidden = !text;
    el.textContent = text;
    el.title = "Not started from a Gonggan cut";
  });
}

function scheduleTimelineReload() {
  if (progUi.timelineReloadTimer) return;
  progUi.timelineReloadTimer = setTimeout(() => {
    progUi.timelineReloadTimer = 0;
    if (state.pid) loadTimeline();
  }, 600);
}

function onProgressTrackerEvent(evt) {
  if (!progressPanelsActive()) return;
  if (evt.cutId && evt.projectId) {
    if (evt.state === "done" || evt.state === "failed" || evt.state === "interrupted") {
      scheduleTimelineReload();
    }
    scheduleProgressPaint(evt.cutId);
  } else {
    updateOtherJobsChip();
  }
}

async function syncProgressQueue() {
  try {
    const res = await api.fetchApi("/queue");
    const data = await res.json().catch(() => ({}));
    progressTracker.syncQueue(data);
    scheduleProgressPaint();
    paintAllCutProgress();
  } catch (_) {}
}

async function syncProgressHistory() {
  try {
    const res = await api.fetchApi("/history?max_items=30");
    const data = await res.json().catch(() => ({}));
    progressTracker.syncHistory(data);
    scheduleProgressPaint();
    paintAllCutProgress();
  } catch (_) {}
}

function onProgressStatusEvent(e) {
  progressTracker.handleEvent("status", e.detail);
  if (progUi.statusDebounce) clearTimeout(progUi.statusDebounce);
  progUi.statusDebounce = setTimeout(() => {
    progUi.statusDebounce = 0;
    if (progressPanelsActive()) syncProgressQueue();
  }, 1500);
}

progressTracker.on((evt) => {
  if (progUi.wired) onProgressTrackerEvent(evt);
});

function wireProgressListeners() {
  if (progUi.wired || !progressPanelsActive()) return;
  progUi.wired = true;
  for (const typ of PROGRESS_API_EVENTS) {
    progUi.handlers[typ] = (e) => {
      if (typ === "status") onProgressStatusEvent(e);
      else progressTracker.handleEvent(typ, e.detail);
    };
    api.addEventListener(typ, progUi.handlers[typ]);
  }
  document.addEventListener("visibilitychange", syncProgressWireState);
  syncProgressQueue();
  syncProgressHistory();
  paintAllCutProgress();
}

function unwireProgressListeners() {
  if (!progUi.wired) return;
  progUi.wired = false;
  for (const typ of PROGRESS_API_EVENTS) {
    const fn = progUi.handlers[typ];
    if (fn) api.removeEventListener(typ, fn);
    delete progUi.handlers[typ];
  }
  document.removeEventListener("visibilitychange", syncProgressWireState);
  if (progUi.statusDebounce) {
    clearTimeout(progUi.statusDebounce);
    progUi.statusDebounce = 0;
  }
  if (progUi.paintTimer) {
    clearTimeout(progUi.paintTimer);
    progUi.paintTimer = 0;
  }
}

function syncProgressWireState() {
  if (progressPanelsActive()) wireProgressListeners();
  else unwireProgressListeners();
}

function effectiveLenLabel(c) {
  const sec = computeEffectiveSec(c);
  const s = Number.isInteger(sec) ? String(sec) : sec.toFixed(1);
  return `${s}s`;
}

function applyOrderGroupsLocally(order, groups) {
  const tl = state.timeline;
  if (!tl) return;
  const byId = new Map(tl.cuts.map((c) => [c.id, c]));
  const gById = new Map((groups || []).map((g) => [g.id, g]));
  const membership = new Map();
  for (const g of groups || []) {
    for (const id of g.cut_ids || []) membership.set(id, g.id);
  }
  tl.groups = groups;
  tl.cuts = order.map((id) => byId.get(id)).filter(Boolean);
  let globalNum = 0;
  const scenePos = {};
  tl.cuts.forEach((c, pos) => {
    globalNum += 1;
    c.number = globalNum;
    c.pos = pos;
    const gid = membership.get(c.id) || "";
    c.group_id = gid;
    const g = gById.get(gid);
    c.group_name = g ? g.name : "";
    if (gid) {
      scenePos[gid] = (scenePos[gid] || 0) + 1;
      c.cut_in_scene = scenePos[gid];
    } else {
      c.cut_in_scene = globalNum;
    }
  });
  recomputeCutStarts();
}

async function persistShotsReorder(order, groups) {
  const tl = state.timeline;
  if (!tl || !isNativeProject()) return;
  applyOrderGroupsLocally(order, groups);
  bus.dispatchEvent(new Event("timeline"));
  try {
    const body = {
      pid: tl.project.id,
      order,
      clips: Object.fromEntries(tl.cuts.map((c) => [c.id, { in: c.in, sec: c.sec, pick: c.pick || null }])),
    };
    const res = await api.fetchApi("/gonggan/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    const gRes = await api.fetchApi("/gonggan/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: tl.project.id, groups }),
    });
    const gData = await gRes.json();
    if (!gRes.ok || gData.ok === false) throw new Error(gData.message || `HTTP ${gRes.status}`);
    state.timeline = gData;
    state.error = "";
  } catch (e) {
    state.error = "Reorder failed: " + e.message;
    ggToast("Reorder failed", e.message, "warn");
    await loadTimeline();
    return;
  }
  bus.dispatchEvent(new Event("timeline"));
}

function collectShotRowRects(wrap) {
  const wrapRect = wrap.getBoundingClientRect();
  const rows = [];
  wrap.querySelectorAll(".gg-cut").forEach((li) => {
    const sec = li.closest(".gg-grp-sec");
    const gid = sec?.dataset?.groupId || null;
    const r = li.getBoundingClientRect();
    rows.push({
      id: li.dataset.cutId,
      top: r.top - wrapRect.top + wrap.scrollTop,
      bottom: r.bottom - wrapRect.top + wrap.scrollTop,
      groupId: gid,
    });
  });
  return rows;
}

function bindShotsReorder(root) {
  if (!isNativeProject()) return;
  const wrap = root.querySelector(".gg-grp-wrap");
  if (!wrap) return;
  let indicator = wrap.querySelector(".gg-drag-ind");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "gg-drag-ind";
    indicator.hidden = true;
    wrap.appendChild(indicator);
  }
  root.querySelectorAll(".gg-cut").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      if (!isNativeProject() || e.button || e.target.closest("input, textarea, button, select, a")) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const cutId = el.dataset.cutId;
      let active = false;
      let drop = { toIndex: 0, toGroupId: null, lineY: 0 };
      const movingIds = () => {
        if (state.cutSel.size >= 2 && state.cutSel.has(cutId)) return cutSelIds();
        return [cutId];
      };
      const cancel = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        indicator.hidden = true;
        el.classList.remove("gg-moving");
        root.querySelectorAll(".gg-cut.gg-moving").forEach((n) => n.classList.remove("gg-moving"));
        shotsUi.dragSession = null;
        ed.dragging = false;
      };
      const move = (ev) => {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        if (!active) {
          active = true;
          ed.dragging = true;
          el.classList.add("gg-moving");
          movingIds().forEach((id) => {
            root.querySelector(`.gg-cut[data-cut-id="${CSS.escape(id)}"]`)?.classList.add("gg-moving");
          });
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
        }
        const tl = state.timeline;
        if (!tl) return;
        const order = tl.cuts.map((c) => c.id);
        const rows = collectShotRowRects(wrap);
        drop = shotsDropTarget(order, rows, ev.clientY);
        indicator.hidden = false;
        indicator.style.top = `${drop.lineY}px`;
      };
      const up = async () => {
        const wasActive = active;
        cancel();
        if (!wasActive) return;
        const tl = state.timeline;
        if (!tl) return;
        const order0 = tl.cuts.map((c) => c.id);
        const ids = movingIds();
        const r = moveCuts(order0, groupsClone(), ids, { toIndex: drop.toIndex, toGroupId: drop.toGroupId });
        const same =
          r.order.length === order0.length &&
          r.order.every((id, i) => id === order0[i]) &&
          JSON.stringify(r.groups) === JSON.stringify(tl.groups || []);
        if (same) return;
        await persistShotsReorder(r.order, r.groups);
      };
      shotsUi.dragSession = { cancel };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  });
}

async function saveCutFields(cutId, fields) {
  if (!isNativeProject() || !state.pid) return;
  try {
    const data = await postJson("/gonggan/cut/update", { pid: state.pid, cut_id: cutId, fields });
    if (data.timeline) {
      state.timeline = data.timeline;
      state.error = "";
      bus.dispatchEvent(new Event("timeline"));
    }
  } catch (e) {
    ggToast("Save failed", e.message, "warn");
  }
}

function scheduleCutFieldSave(cutId, fields) {
  clearTimeout(cutFieldUi.timer);
  cutFieldUi.pending = { cutId, fields: { ...(cutFieldUi.pending?.cutId === cutId ? cutFieldUi.pending.fields : {}), ...fields } };
  cutFieldUi.timer = setTimeout(() => {
    const p = cutFieldUi.pending;
    cutFieldUi.pending = null;
    cutFieldUi.timer = 0;
    if (p) saveCutFields(p.cutId, p.fields);
  }, 400);
}

async function saveProjectDue(value) {
  if (!isNativeProject() || !state.pid) return;
  try {
    const data = await postJson("/gonggan/project/update", { pid: state.pid, fields: { due_date: value || null } });
    if (data.timeline) state.timeline = data.timeline;
    if (data.projects) state.projects = data.projects;
    state.error = "";
    bus.dispatchEvent(new Event("projects"));
    bus.dispatchEvent(new Event("timeline"));
    paintProjectSummary(null);
  } catch (e) {
    ggToast("Due date", e.message, "warn");
  }
}

function toggleNeedsRedo(cutId) {
  const c = cutByIdTimeline(cutId);
  if (!c || !isNativeProject()) return;
  const next = !c.needs_redo;
  c.needs_redo = next;
  scheduleCutFieldSave(cutId, { needs_redo: next });
  bus.dispatchEvent(new Event("timeline"));
}

function finalCutListHtml(tl) {
  const r = finalCutList(tl);
  const items = r.items.map((it) => {
    const cut = tl.cuts.find((c) => c.id === it.cutId) || {};
    const warn = lengthWarning(cut);
    const fname = fileBaseName(cut, null, versionIndexFromList(cut.versions_list, it.versionId));
    return `
      <li class="gg-final-item" data-cut-id="${esc(it.cutId)}">
        <span class="gg-num">${formatCutNumber(it.number)}</span>
        <div class="gg-final-thumb">${thumbHtml(cut.media, "gg-thumb")}</div>
        <div class="gg-final-meta">
          <div class="gg-final-name">${esc(it.name)}</div>
          <div class="gg-final-sub">${esc(it.sceneName || "—")} · ${effectiveLenLabel(cut)} · ${esc(fname)} · ${esc(it.versionLabel)}</div>
          ${warn ? `<span class="gg-warn3" title="${esc(warn.message)}">&gt; 3s</span>` : ""}
        </div>
      </li>`;
  }).join("");
  const miss = r.missingBest.length
    ? `<div class="gg-final-miss">${r.missingBest.length} cut${r.missingBest.length === 1 ? "" : "s"} have no Best yet</div>`
    : "";
  return `
    <div class="gg-final-list">
      <ol class="gg-final-items">${items || '<li class="gg-dim">No cuts with Best set yet.</li>'}</ol>
      <footer class="gg-final-total">Total: ${formatMinSecDot(r.totalSec)} (${r.items.length} cut${r.items.length === 1 ? "" : "s"})</footer>
      ${miss}
    </div>`;
}

function bindCutPanelFields(panel, c) {
  if (!c || !panel) return;
  const nat = isNativeProject();
  const roTip = NATIVE_READONLY_TIP;
  const lenIn = panel.querySelector(".gg-len-input");
  const notes = panel.querySelector(".gg-notes");
  const endChk = panel.querySelector("input.gg-endcard-chk");
  const redoChk = panel.querySelector("input.gg-redo-chk");
  const fnameEl = panel.querySelector(".gg-fname");
  const copyBtn = panel.querySelector(".gg-fname-copy");
  const rep = repIdOf(c);
  const vIdx = rep ? versionIndexFromList(c.versions_list, rep) : 1;
  const fname = fileBaseName(c, { scene_index: c.scene_index }, vIdx);
  if (fnameEl) fnameEl.textContent = fname;
  if (copyBtn) {
    copyBtn.disabled = !fname;
    copyBtn.title = nat ? "Copy suggested file base name" : roTip;
    copyBtn.addEventListener("click", () => {
      navigator.clipboard?.writeText(fname).then(() => ggToast("Copied", fname, "ok")).catch(() => {});
    });
  }
  const planned = c.planned_sec;
  if (lenIn) {
    lenIn.value = planned != null && Number.isFinite(planned) ? String(planned) : "";
    lenIn.disabled = !nat;
    lenIn.title = nat ? "Planned length (seconds)" : roTip;
    const onLen = () => {
      const raw = lenIn.value.trim();
      const val = raw === "" ? null : Number(raw);
      if (raw !== "" && (!Number.isFinite(val) || val < 0.5 || val > 600)) return;
      c.planned_sec = val;
      scheduleCutFieldSave(c.id, { planned_sec: val });
      refreshCutRowBadges(c.id);
    };
    lenIn.addEventListener("change", onLen);
    lenIn.addEventListener("blur", onLen);
  }
  if (notes) {
    notes.value = c.notes || "";
    notes.disabled = !nat;
    notes.title = nat ? "Cut notes" : roTip;
    const onNotes = () => {
      c.notes = notes.value;
      scheduleCutFieldSave(c.id, { notes: notes.value });
    };
    notes.addEventListener("change", onNotes);
    notes.addEventListener("blur", onNotes);
  }
  if (endChk) {
    endChk.checked = !!c.end_card;
    endChk.disabled = !nat;
    endChk.title = nat ? "End card (no length warning)" : roTip;
    endChk.addEventListener("change", () => {
      c.end_card = endChk.checked;
      scheduleCutFieldSave(c.id, { end_card: endChk.checked });
      refreshCutRowBadges(c.id);
      bus.dispatchEvent(new Event("timeline"));
    });
  }
  if (redoChk) {
    redoChk.checked = !!c.needs_redo;
    redoChk.disabled = !nat;
    redoChk.title = nat ? "Flag for redo" : roTip;
    redoChk.addEventListener("change", () => {
      c.needs_redo = redoChk.checked;
      scheduleCutFieldSave(c.id, { needs_redo: redoChk.checked });
      refreshCutRowBadges(c.id);
      bus.dispatchEvent(new Event("timeline"));
    });
  }
}

function refreshCutRowBadges(cutId) {
  const c = cutByIdTimeline(cutId);
  if (!c) return;
  document.querySelectorAll(`.gg-cut[data-cut-id="${CSS.escape(cutId)}"]`).forEach((li) => {
    const num = li.querySelector(".gg-num");
    if (num) num.textContent = formatCutNumber(c.number ?? (c.pos ?? 0) + 1);
    const len = li.querySelector(".gg-len-badge");
    if (len) len.textContent = effectiveLenLabel(c);
    const warn = lengthWarning(c);
    let wEl = li.querySelector(".gg-warn3");
    if (warn) {
      if (!wEl) {
        wEl = document.createElement("span");
        wEl.className = "gg-warn3";
        li.querySelector(".gg-cut-badges")?.appendChild(wEl);
      }
      wEl.hidden = false;
      wEl.textContent = "> 3s";
      wEl.title = warn.message;
    } else if (wEl) wEl.hidden = true;
    let ec = li.querySelector(".gg-endcard-badge");
    if (c.end_card) {
      if (!ec) {
        ec = document.createElement("span");
        ec.className = "gg-endcard-badge";
        li.querySelector(".gg-cut-badges")?.appendChild(ec);
      }
      ec.hidden = false;
      ec.textContent = "End card";
    } else if (ec) ec.hidden = true;
    let rd = li.querySelector(".gg-redo-badge");
    if (c.needs_redo) {
      if (!rd) {
        rd = document.createElement("span");
        rd.className = "gg-redo-badge";
        li.querySelector(".gg-cut-badges")?.appendChild(rd);
      }
      rd.hidden = false;
      rd.textContent = "Needs redo";
    } else if (rd) rd.hidden = true;
  });
}

function cutRowHtml(c) {
  const warn = lengthWarning(c);
  const badges = [
    `<span class="gg-len-badge">${effectiveLenLabel(c)}</span>`,
    warn ? `<span class="gg-warn3" title="${esc(warn.message)}">&gt; 3s</span>` : "",
    c.end_card ? `<span class="gg-endcard-badge">End card</span>` : "",
    c.needs_redo ? `<span class="gg-redo-badge">Needs redo</span>` : "",
  ].filter(Boolean).join("");
  return `
    <li class="gg-cut${state.cutSel.has(c.id) ? " gg-sel" : ""}" data-cut-id="${esc(c.id)}" title="${esc(c.story || c.prompt)}">
      <div class="gg-cut-thumb-col">
        <div class="gg-cut-thumb">${thumbHtml(c.media, "gg-thumb")}${c.media && c.media.kind === "video" ? '<span class="gg-badge">▶</span>' : ""}${c.media && c.media.source && c.media.source !== "gonggan" ? `<span class="gg-badge gg-badge-l gg-src-${esc(c.media.source)}">${esc(fmtSrc(c.media.source))}</span>` : ""}</div>
        <div class="gg-stage-row">
          <span class="gg-done-glow" hidden></span>
          <div class="gg-stage-pills">
            <span class="gg-stage-pill gg-off" data-k="image">Image</span>
            <span class="gg-stage-pill gg-off" data-k="video">Video</span>
            <span class="gg-stage-pill gg-off" data-k="best">Best</span>
          </div>
          <div class="gg-live-chip" hidden><span class="gg-live-dot"></span><span class="gg-live-text"></span></div>
        </div>
      </div>
      <div class="gg-cut-text">
        <div class="gg-cut-name"><span class="gg-num">${formatCutNumber(c.number ?? (c.pos ?? c.index ?? 0) + 1)}</span>${esc(c.name || "(untitled)")}</div>
        <div class="gg-cut-sub">${c.group_name ? esc(c.group_name) + " · " : ""}${c.sec.toFixed(1)}s tl${c.versions > 1 ? ` · v${c.versions}` : ""}</div>
        <div class="gg-cut-badges">${badges}</div>
      </div>
    </li>`;
}

function timelinePanelVisible() {
  const el = document.querySelector(".gg-timeline");
  return !!(el && el.isConnected && el.offsetParent);
}

function timelineBottomTabActive() {
  const bp = app.extensionManager?.bottomPanel;
  if (!bp) return false;
  return !!bp.bottomPanelVisible && bp.activeBottomPanelTabId === TIMELINE_TAB;
}

function shotsSidebarActive() {
  return app.extensionManager?.sidebarTab?.activeSidebarTabId === SHOTS_TAB;
}

function openTimelinePanel() {
  const cmd = app.extensionManager?.command;
  if (!cmd?.execute) return;
  if (timelinePanelVisible()) return;
  cmd.execute(`Workspace.ToggleBottomPanelTab.${TIMELINE_TAB}`);
}

function closeTimelinePanel() {
  const cmd = app.extensionManager?.command;
  if (!cmd?.execute) return;
  if (!timelineBottomTabActive()) return;
  cmd.execute(`Workspace.ToggleBottomPanelTab.${TIMELINE_TAB}`);
}

/** Open Timeline when Shots becomes visible; close when Shots sidebar deactivates (if Timeline tab is active). */
function bindShotsTabActivated(hostEl, onCleanup) {
  let wasShown = false;
  const syncDom = () => {
    if (!hostEl.isConnected) return;
    const r = hostEl.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0 && hostEl.offsetParent !== null;
    if (shown && !wasShown) {
      openTimelinePanel();
      syncProgressWireState();
    } else if (wasShown && !shown && !shotsSidebarActive()) closeTimelinePanel();
    wasShown = shown;
  };
  const io = new IntersectionObserver(() => syncDom(), { threshold: 0.01 });
  io.observe(hostEl);
  onCleanup.push(() => io.disconnect());
  requestAnimationFrame(syncDom);

  const sidebar = app.extensionManager?.sidebarTab;
  if (sidebar?.$subscribe) {
    let prevId = sidebar.activeSidebarTabId;
    const unsub = sidebar.$subscribe(() => {
      const id = sidebar.activeSidebarTabId;
      if (prevId === SHOTS_TAB && id !== SHOTS_TAB) closeTimelinePanel();
      prevId = id;
    });
    onCleanup.push(() => {
      unsub();
      if (!shotsSidebarActive()) closeTimelinePanel();
    });
  } else {
    onCleanup.push(() => {
      if (!shotsSidebarActive()) closeTimelinePanel();
    });
  }
}

function updateSelectionBar(root) {
  if (!root) return;
  const bar = root.querySelector(".gg-selbar");
  if (!bar) return;
  const n = state.cutSel.size;
  const show = n >= 2;
  bar.hidden = !show;
  bar.style.display = show ? "" : "none";
  const countEl = bar.querySelector(".gg-sel-count");
  if (countEl) countEl.textContent = String(n);
}

function paintSelection(root) {
  root.querySelectorAll("[data-cut-id]").forEach((el) => {
    el.classList.toggle("gg-on", el.dataset.cutId === state.cutId);
    el.classList.toggle("gg-sel", state.cutSel.has(el.dataset.cutId));
  });
  const on = root.querySelector(`[data-cut-id="${CSS.escape(state.cutId)}"]`);
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
  updateSelectionBar(root);
}

// ---------------- Shots (sidebar) ----------------
// ---- SDK status / versions / regen (Shots tab) ----
const sdk = { st: null, busy: "", msg: "" };

async function refreshSdk(force) {
  try { sdk.st = await (await api.fetchApi("/gonggan/sdk/status" + (force ? "?force=1" : ""))).json(); }
  catch (e) { sdk.st = { ok: false, error: String(e) }; }
  bus.dispatchEvent(new Event("sdk"));
}

function sdkBadge() {
  const st = sdk.st;
  if (!st) return `<span class="gg-sdk gg-sdk-wait" title="checking Comfy SDK…">● SDK</span>`;
  const tip = st.ok
    ? `Comfy SDK ${st.comfy_sdk} → comfy-api-proxy ${st.comfy_api_proxy} at ${st.proxy_url || st.base_url} → ComfyUI (${st.sdk_roundtrip_ms} ms)`
    : (st.error || "SDK not ready");
  return `<span class="gg-sdk ${st.ok ? "gg-sdk-ok" : "gg-sdk-bad"}" title="${esc(tip)}">● SDK${st.ok ? "" : " off"}</span>`;
}

const fmtSrc = (s) => ({ gonggan: "Gonggan", "local-sdk": "SDK", "comfy-history": "Comfy", "comfy-output-folder": "Comfy" }[s] || s || "");

async function postJson(route, body) {
  const res = await api.fetchApi(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function repIdOf(c) {
  return (c && (c.pick || (c.media && c.media.id))) || "";
}

function mediaFromVersion(v) {
  if (!v) return null;
  return { id: v.id, kind: v.kind, width: v.width, height: v.height, seconds: v.seconds, model: v.model, source: v.source };
}

function recomputeCutStarts() {
  const tl = state.timeline;
  if (!tl) return;
  let at = 0;
  for (const c of tl.cuts) {
    c.start = r2(at);
    at += c.sec;
  }
  tl.total_sec = r2(at);
}

/** Optimistic promote: swap timeline media + clamp trim, then persist via /gonggan/edit. */
function applyPickLocally(c, vid) {
  if (!c || !vid || repIdOf(c) === vid) return false;
  const v = (c.versions_list || []).find((x) => x.id === vid);
  if (!v) return false;
  c.pick = vid;
  c.media = mediaFromVersion(v);
  c.src_dur = v.kind === "video" ? Math.max(0, Number(v.seconds) || 0) : 0;
  const clamped = clampClip(c, c.in, c.sec);
  c.in = clamped.in;
  c.sec = clamped.sec;
  c.edited = true;
  recomputeCutStarts();
  play.idx = -1;
  return true;
}

async function setPick(cutId, vid) {
  const c = cutsNow().find((x) => x.id === cutId);
  if (!c) return;
  const prev = {
    pick: c.pick,
    in: c.in,
    sec: c.sec,
    media: c.media ? { ...c.media } : null,
    src_dur: c.src_dur,
    edited: c.edited,
  };
  if (!applyPickLocally(c, vid)) return;
  bus.dispatchEvent(new Event("timeline"));
  bus.dispatchEvent(new Event("select"));
  clearTimeout(ed.saveTimer);
  const ok = await saveEdit();
  if (ok) return;
  const v = (c.versions_list || []).find((x) => x.id === prev.pick);
  c.pick = prev.pick;
  c.media = prev.media || (v ? mediaFromVersion(v) : null);
  c.src_dur = prev.src_dur;
  c.in = prev.in;
  c.sec = prev.sec;
  c.edited = prev.edited;
  recomputeCutStarts();
  play.idx = -1;
  bus.dispatchEvent(new Event("timeline"));
  bus.dispatchEvent(new Event("select"));
  const msg = (state.error || "").replace(/^Save failed:\s*/, "") || "unknown error";
  ggToast("Promote failed", `Reverted to the previous version: ${msg}`, "warn");
}

async function regenCut(cutId) {
  const tl = state.timeline;
  if (!tl) return;
  sdk.busy = "regen"; sdk.msg = "Building + validating workflow (dry run)…"; bus.dispatchEvent(new Event("sdk"));
  try {
    const d = await postJson("/gonggan/regen", { pid: tl.project.id, cut_id: cutId, dry_run: true });
    const p = d.plan, v = d.validation || {};
    sdk.msg = v.ok ? `Dry run OK · ${p.model} · ${p.steps} steps · ~${p.approx_size} · seed ${p.seed}` : "Validation failed: " + (v.problems || [v.error]).join("; ");
    bus.dispatchEvent(new Event("sdk"));
    if (!v.ok) return;
    const ok = confirm(
      `Queue ONE generation job on this PC's GPU?\n\nCut ${p.cut_no}. ${p.cut_name}\nModel: ${p.model}\nSteps: ${p.steps} · CFG ${p.cfg} · ${p.sampler}\n` +
      `Size: ~${p.approx_size} (${p.megapixels} MP, ${p.aspect})\nSeed: ${p.seed}\n\nPrompt:\n${p.prompt.slice(0, 400)}`);
    if (!ok) { sdk.msg = "Not queued (cancelled)."; return; }
    await postJson("/gonggan/regen", { pid: tl.project.id, cut_id: cutId, dry_run: false, confirm: true, seed: p.seed });
    sdk.msg = "Queued through Comfy SDK → proxy → ComfyUI…";
  } catch (e) {
    sdk.msg = "Regenerate failed: " + e.message;
  } finally {
    sdk.busy = "";
    bus.dispatchEvent(new Event("sdk"));
  }
}

async function sendLastOutput(cutId) {
  const tl = state.timeline;
  if (!tl) return;
  sdk.busy = "send"; sdk.msg = "Looking for the last ComfyUI output…"; bus.dispatchEvent(new Event("sdk"));
  try {
    const d = await postJson("/gonggan/send-output", { pid: tl.project.id, cut_id: cutId });
    sdk.msg = `Added ${d.output.name} (${d.output.from}) as a new version.`;
    await loadTimeline();
  } catch (e) {
    sdk.msg = "Send failed: " + e.message;
  } finally {
    sdk.busy = "";
    bus.dispatchEvent(new Event("sdk"));
  }
}

api.addEventListener("gonggan.regen", (e) => {
  const j = e.detail || {};
  if (j.status === "done") { sdk.msg = `New version from SDK job ${j.sdk_job_id || ""}`; loadTimeline(); }
  else if (j.status === "error") sdk.msg = "SDK job failed: " + (j.error || "");
  else if (j.status === "running") sdk.msg = "SDK job running…";
  bus.dispatchEvent(new Event("sdk"));
});

function cutPanelHtml(c) {
  if (!c) return `<div class="gg-panel-empty">Select a cut for versions and actions.</div>`;
  const nat = isNativeProject();
  const regenOff = nat || sdk.busy || !(sdk.st && sdk.st.ok);
  const regenTip = nat
    ? "Not available for native projects yet"
    : "Draft re-render through Comfy SDK → comfy-api-proxy → ComfyUI. Shows the job and asks before queueing.";
  const rep = repIdOf(c);
  const vers = (c.versions_list || []).map((v) => {
    const on = v.id === rep;
    const tip = `${fmtSrc(v.source)} · ${v.model || ""} · ${new Date(v.created * 1000).toLocaleString()}`;
    return `
    <div class="gg-ver-wrap${on ? " gg-rep" : ""}" data-vid="${esc(v.id)}">
      <div class="gg-ver" title="${esc(tip)}">
        <img src="${esc(posterUrl(v.id))}" loading="lazy" alt="" />
        <span class="gg-ver-src gg-src-${esc(v.source)}">${esc(fmtSrc(v.source))}</span>
        ${on ? '<span class="gg-ver-rep">Rep</span>' : ""}
      </div>
      <button type="button" class="gg-btn gg-promote${on ? " gg-on" : ""}" ${on ? "disabled" : ""} title="${on ? "Timeline representative version" : "Set as timeline representative"}">${on ? "Rep" : "Set rep"}</button>
    </div>`;
  }).join("");
  const planned = c.planned_sec;
  const lenVal = planned != null && Number.isFinite(planned) ? String(planned) : "";
  const vIdx = rep ? versionIndexFromList(c.versions_list, rep) : 1;
  const fname = fileBaseName(c, { scene_index: c.scene_index }, vIdx);
  const metaDisabled = nat ? "" : " disabled";
  const metaTip = nat ? "" : ` title="${esc(NATIVE_READONLY_TIP)}"`;
  return `
    <div class="gg-panel-title"><span class="gg-num">${formatCutNumber(c.number ?? c.pos + 1)}</span>${esc(c.name)}</div>
    ${panelPreviewHtml(c)}
    <div class="gg-cut-fields">
      <label class="gg-field-len"${metaTip}>Length (sec)
        <input type="number" class="gg-len-input" min="0.5" max="600" step="0.1" value="${esc(lenVal)}"${metaDisabled} />
      </label>
      <label class="gg-field-end"${metaTip}><input type="checkbox" class="gg-endcard-chk"${c.end_card ? " checked" : ""}${metaDisabled} /> End card</label>
      <label class="gg-field-redo"${metaTip}><input type="checkbox" class="gg-redo-chk"${c.needs_redo ? " checked" : ""}${metaDisabled} /> Needs redo</label>
      <label class="gg-field-notes"${metaTip}>Notes
        <textarea class="gg-notes" rows="2" placeholder="Notes…"${metaDisabled}>${esc(c.notes || "")}</textarea>
      </label>
      <div class="gg-fname-row">
        <span class="gg-fname" title="Suggested export base name (read-only)">${esc(fname)}</span>
        <button type="button" class="gg-btn gg-fname-copy"${nat ? "" : ` disabled title="${esc(NATIVE_READONLY_TIP)}"`}>Copy</button>
      </div>
    </div>
    <div class="gg-vers">${vers || '<span class="gg-dim">no versions yet</span>'}</div>
    <div class="gg-scene-actions">
      <button class="gg-btn gg-scene-new" type="button" title="Group selected shots into a new scene">+ Scene</button>
      <button class="gg-btn gg-scene-split" type="button" title="Start a new scene from this shot">Split scene</button>
      <button class="gg-btn gg-scene-off" type="button" title="Remove selected shots from their scene (ungrouped)">Remove from scene</button>
    </div>
    <div class="gg-actions">
      <button class="gg-btn gg-regen" ${regenOff ? "disabled" : ""} title="${esc(regenTip)}">Regenerate (new version)</button>
      <button class="gg-btn gg-send" ${sdk.busy ? "disabled" : ""} title="Copy ComfyUI's last output (from /history, else newest file in output/) into this cut as a new version">Send last ComfyUI output</button>
    </div>
    <div class="gg-sdk-msg">${esc(sdk.msg)}</div>`;
}

function mountShots(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "gg-root gg-shots";
  el.appendChild(root);
  const extraCleanup = [];
  bindShotsTabActivated(el, extraCleanup);
  // The sidebar host has no definite height; pin the root to the visible viewport so the
  // cut list scrolls and the cut panel stays at the bottom.
  const scroller = () => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e).overflowY;
      if (o === "auto" || o === "scroll" || o === "hidden") return e;
    }
    return null;
  };
  let watched = null;
  const fit = () => {
    const sc = scroller();
    if (sc && sc !== watched) { watched = sc; ro.observe(sc); }
    const r = root.getBoundingClientRect();
    const bottom = sc ? sc.getBoundingClientRect().top + sc.clientHeight : window.innerHeight;
    const h = Math.floor(bottom - r.top - 1);
    if (h > 0) root.style.height = Math.max(200, h) + "px";
  };
  const ro = new ResizeObserver(fit);
  ro.observe(document.body);
  window.addEventListener("resize", fit);
  requestAnimationFrame(fit);
  setTimeout(fit, 300);
  setTimeout(fit, 1500);

  const paintPanel = () => {
    const panel = root.querySelector(".gg-cutpanel");
    const badge = root.querySelector(".gg-sdk-slot");
    if (badge) badge.innerHTML = sdkBadge();
    if (!panel) return;
    const c = state.timeline && state.timeline.cuts.find((x) => x.id === state.cutId);
    panel.innerHTML = cutPanelHtml(c);
    panel.querySelectorAll(".gg-promote").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = b.closest(".gg-ver-wrap");
      if (!b.disabled && wrap) setPick(c.id, wrap.dataset.vid);
    }));
    panel.querySelector(".gg-regen")?.addEventListener("click", () => regenCut(c.id));
    panel.querySelector(".gg-send")?.addEventListener("click", () => sendLastOutput(c.id));
    panel.querySelector(".gg-scene-new")?.addEventListener("click", () => createSceneGroup([c.id]));
    panel.querySelector(".gg-scene-split")?.addEventListener("click", () => splitSceneHere(c.id));
    panel.querySelector(".gg-scene-off")?.addEventListener("click", () => ungroupCuts([c.id]));
    if (c) bindCutPanelFields(panel, c);
  };
  const paint = () => {
    if (shotsUi.dragSession) return;
    const tl = state.timeline;
    const opts = state.projects.map((p) =>
      `<option value="${esc(p.id)}"${p.id === state.pid ? " selected" : ""}>${esc(projectOptionLabel(p))}</option>`).join("");
    let cuts = tl ? tl.cuts : [];
    if (shotsUi.needsRedoOnly) cuts = filterCuts(cuts, { needsRedoOnly: true });
    const groups = tl ? tl.groups || [] : [];
    const sections = shotsSections(cuts, groups);
    const viewFinal = shotsUi.view === "final";
    const listHtml = sections.map((sec) => {
      if (sec.type === "ungrouped") {
        return `<section class="gg-grp-sec gg-grp-loose"><header class="gg-grp-head">Ungrouped <span class="gg-grp-meta">${sec.cuts.length}</span></header><ol class="gg-cutlist">${sec.cuts.map(cutRowHtml).join("")}</ol></section>`;
      }
      const g = sec.group;
      const hue = groupColor(g.id);
      const collapsed = !!g.collapsed;
      return `<section class="gg-grp-sec" data-group-id="${esc(g.id)}" style="--gg-grp:${hue}">
        <header class="gg-grp-head">
          <button type="button" class="gg-grp-fold" title="Collapse or expand">${collapsed ? "▸" : "▾"}</button>
          <span class="gg-grp-title">Scene · ${esc(g.name)}</span>
          <span class="gg-grp-meta">${sec.cuts.length}</span>
          <button type="button" class="gg-grp-ren" title="Rename scene">✎</button>
          <button type="button" class="gg-grp-del" title="Delete scene (cuts become ungrouped)">×</button>
        </header>
        <ol class="gg-cutlist"${collapsed ? " hidden" : ""}>${sec.cuts.map(cutRowHtml).join("")}</ol>
      </section>`;
    }).join("");
    root.innerHTML = `
      <div class="gg-head">
        <select class="gg-proj" title="Project">${opts}</select>
        <label class="gg-tpl-wrap" title="ComfyUI saved workflow used as this project's template">
          <span class="gg-tpl-label">Template:</span>
          <select class="gg-tpl-select">${templateSelectOptionsHtml()}</select>
        </label>
        <span class="gg-sdk-slot"></span>
        <span class="gg-other-chip" hidden title="Not started from a Gonggan cut"></span>
        <button class="gg-btn gg-reload" title="Reload">⟳</button>
      </div>
      ${state.error ? `<div class="gg-error">${esc(state.error)}</div>` : ""}
      <div class="gg-shot-summary">
        <div class="gg-summary-line"><span class="gg-summary-text">${esc(tl ? formatSummary(projectSummary(tl.cuts || [])) : "")}</span></div>
        <div class="gg-summary-bar"${(tl?.cuts?.length || 0) ? "" : " hidden"}><span class="gg-seg gg-seg-done"></span><span class="gg-seg gg-seg-video"></span><span class="gg-seg gg-seg-image"></span></div>
        <div class="gg-complete-row">
          <div class="gg-complete-bar" title="Best set progress"><div class="gg-complete-fill"></div></div>
          <span class="gg-complete-pct"></span>
        </div>
        <div class="gg-due-row">
          <label class="gg-due-label">Due <input type="date" class="gg-due-input" /></label>
          <span class="gg-due-text"></span>
        </div>
      </div>
      <div class="gg-shots-toolbar">
        <div class="gg-view-toggle">
          <button type="button" class="gg-btn gg-view-cuts${viewFinal ? "" : " gg-on"}" data-view="cuts">Cuts</button>
          <button type="button" class="gg-btn gg-view-final${viewFinal ? " gg-on" : ""}" data-view="final">Final cut list</button>
        </div>
        <label class="gg-filter-redo" title="Show only cuts flagged needs redo"><input type="checkbox"${shotsUi.needsRedoOnly ? " checked" : ""}${viewFinal ? " disabled" : ""} /> Needs redo only</label>
      </div>
      <div class="gg-meta">${tl ? `${tl.cuts.length} shots · ${groups.length} scenes · ${fmt(tl.total_sec)}` : ""}</div>
      <div class="gg-selbar" hidden>
        <span class="gg-sel-count">0</span> selected · <button type="button" class="gg-btn gg-sel-group">Group</button> · <button type="button" class="gg-btn gg-sel-ungroup">Ungroup</button> · <button type="button" class="gg-btn gg-sel-x">×</button>
      </div>
      <div class="gg-grp-wrap"${viewFinal ? " hidden" : ""}>${listHtml}</div>
      <div class="gg-final-wrap"${viewFinal ? "" : " hidden"}>${viewFinal && tl ? finalCutListHtml(tl) : ""}</div>
      <div class="gg-cutpanel"></div>`;
    const projSel = root.querySelector(".gg-proj");
    projSel?.addEventListener("change", (e) => selectProject(e.target.value));
    root.querySelector(".gg-head")?.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".gg-proj") || e.target.closest(".gg-head")) openProjectContextMenu(e);
    });
    const tplSel = root.querySelector(".gg-tpl-select");
    tplSel?.addEventListener("focus", () => {
      fetchUserWorkflowPaths().then(() => {
        const cur = tplSel.value;
        tplSel.innerHTML = templateSelectOptionsHtml();
        tplSel.value = cur || projectTemplateRef || "";
      });
    });
    if (tplSel) fetchUserWorkflowPaths().then(() => { tplSel.innerHTML = templateSelectOptionsHtml(); tplSel.value = projectTemplateRef || ""; });
    tplSel?.addEventListener("change", (e) => setProjectTemplateRef(e.target.value));
    root.querySelector(".gg-cut-add")?.addEventListener("click", () => addLocalCut());
    root.querySelector(".gg-reload")?.addEventListener("click", () => { loadProjects(); refreshSdk(true); refreshProjectTemplateFlag(); });
    root.querySelectorAll(".gg-view-toggle .gg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        shotsUi.view = btn.dataset.view === "final" ? "final" : "cuts";
        paint();
      });
    });
    const redoFilter = root.querySelector(".gg-filter-redo input");
    redoFilter?.addEventListener("change", (e) => {
      shotsUi.needsRedoOnly = !!e.target.checked;
      paint();
    });
    const dueIn = root.querySelector(".gg-due-input");
    dueIn?.addEventListener("change", (e) => {
      clearTimeout(projectFieldUi.timer);
      const v = e.target.value;
      projectFieldUi.timer = setTimeout(() => saveProjectDue(v), 300);
    });
    root.querySelectorAll(".gg-final-item").forEach((li) => {
      li.addEventListener("click", () => {
        selectCut(li.dataset.cutId);
        openTimelinePanel();
        paintSelection(root);
        paintPanel();
      });
    });
    root.querySelector(".gg-scene-add")?.addEventListener("click", () => createSceneGroup(cutSelIds()));
    root.querySelector(".gg-sel-group")?.addEventListener("click", () => createSceneGroup(cutSelIds()));
    root.querySelector(".gg-sel-ungroup")?.addEventListener("click", () => ungroupCuts(cutSelIds()));
    root.querySelector(".gg-sel-x")?.addEventListener("click", () => {
      state.cutSel.clear();
      cutSelAnchor = "";
      updateSelectionBar(root);
      paintSelection(root);
      bus.dispatchEvent(new Event("select"));
    });
    root.querySelectorAll(".gg-grp-sec[data-group-id]").forEach((sec) => {
      const gid = sec.dataset.groupId;
      sec.querySelector(".gg-grp-fold")?.addEventListener("click", (e) => { e.stopPropagation(); toggleGroupCollapsed(gid); });
      sec.querySelector(".gg-grp-ren")?.addEventListener("click", (e) => { e.stopPropagation(); renameSceneGroup(gid); });
      sec.querySelector(".gg-grp-del")?.addEventListener("click", (e) => { e.stopPropagation(); deleteSceneGroup(gid); });
    });
    root.querySelectorAll(".gg-cut").forEach((li) => {
      li.addEventListener("click", (e) => {
        const id = li.dataset.cutId;
        if (e.shiftKey) selectCut(id, { range: true });
        else selectCut(id, { multi: e.ctrlKey || e.metaKey });
        openTimelinePanel();
        paintSelection(root);
        paintPanel();
      });
      li.addEventListener("contextmenu", (e) => {
        openCutContextMenu(e, li.dataset.cutId);
        paintSelection(root);
        paintPanel();
      });
    });
    root.querySelectorAll(".gg-grp-sec[data-group-id] .gg-grp-head").forEach((head) => {
      const sec = head.closest(".gg-grp-sec");
      const gid = sec?.dataset?.groupId;
      if (!gid) return;
      head.addEventListener("contextmenu", (e) => openSceneContextMenu(e, gid));
    });
    bindHoverPlay(root);
    bindShotsReorder(root);
    paintSelection(root);
    paintPanel();
    paintProjectSummary(root);
    paintAllCutProgress();
    syncProgressWireState();
    fit();
  };
  const onSel = () => { paintSelection(root); paintPanel(); fit(); };
  const onTemplate = () => paint();
  bus.addEventListener("projects", paint);
  bus.addEventListener("timeline", paint);
  bus.addEventListener("template", onTemplate);
  bus.addEventListener("select", onSel);
  bus.addEventListener("sdk", paintPanel);
  paint();
  if (!state.projects.length) loadProjects();
  refreshProjectTemplateFlag();
  refreshSdk(false);
  const timer = setInterval(() => refreshSdk(false), 20000);
  const onShotsKey = (e) => {
    if (!shotsSidebarActive() && !root.isConnected) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
    if (e.key === "Escape") {
      if (shotsUi.dragSession) {
        shotsUi.dragSession.cancel();
        return;
      }
      closeCtxMenu();
      if (state.cutSel.size) {
        state.cutSel.clear();
        cutSelAnchor = "";
        updateSelectionBar(root);
        paintSelection(root);
        bus.dispatchEvent(new Event("select"));
      }
      return;
    }
    if (e.key === "Delete" && cutsForDelete().length) {
      e.preventDefault();
      deleteSelectedCuts();
    }
  };
  const onShotsEmptyClick = (e) => {
    if (!root.contains(e.target)) return;
    if (e.target.closest(".gg-cut") || e.target.closest(".gg-selbar") || e.target.closest(".gg-ctx")) return;
    if (!state.cutSel.size) return;
    state.cutSel.clear();
    cutSelAnchor = "";
    updateSelectionBar(root);
    paintSelection(root);
    bus.dispatchEvent(new Event("select"));
  };
  const onShotsPanelContextMenu = (e) => {
    if (!root.contains(e.target) || !e.target.closest(".gg-grp-wrap")) return;
    if (e.target.closest(".gg-cut") || e.target.closest(".gg-grp-sec[data-group-id] .gg-grp-head")) return;
    openShotsPanelContextMenu(e);
  };
  root.addEventListener("mousedown", onShotsEmptyClick);
  root.addEventListener("contextmenu", onShotsPanelContextMenu);
  document.addEventListener("keydown", onShotsKey);
  return () => {
    ro.disconnect();
    window.removeEventListener("resize", fit);
    clearInterval(timer);
    root.removeEventListener("mousedown", onShotsEmptyClick);
    root.removeEventListener("contextmenu", onShotsPanelContextMenu);
    document.removeEventListener("keydown", onShotsKey);
    closeCtxMenu();
    bus.removeEventListener("projects", paint);
    bus.removeEventListener("timeline", paint);
    bus.removeEventListener("template", onTemplate);
    bus.removeEventListener("select", onSel);
    bus.removeEventListener("sdk", paintPanel);
    closeProjectModal();
    extraCleanup.forEach((fn) => fn());
    syncProgressWireState();
  };
}

// ---------------- Timeline (bottom panel) ----------------
// Edit model: state.timeline.cuts in edit order, each with in/sec (+ src_dur for video caps).
const ed = {
  px: Number(localStorage.getItem("gg.px")) || 48,      // pixels per second (zoom)
  snap: localStorage.getItem("gg.snap") !== "0",          // on = 1 s steps, off = 0.1 s
  sound: localStorage.getItem("gg.sound") === "1",
  saveTimer: 0,
  saving: false,
  dragging: false,
};
const play = { on: false, t: 0, idx: -1, raf: 0, last: 0 };

const IMG_MIN = 0.5, IMG_MAX = 60, VID_MIN = 0.2;
const r2 = (x) => Math.round(x * 100 + 1e-6) / 100;
const cutsNow = () => (state.timeline ? state.timeline.cuts : []);
const totalSec = () => cutsNow().reduce((a, c) => a + c.sec, 0);
const startOf = (i) => cutsNow().slice(0, i).reduce((a, c) => a + c.sec, 0);
const kindOf = (c) => (c.media ? c.media.kind : null);
const fmtClock = (t) => {
  t = Math.max(0, Number(t) || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 24 + 1e-6);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};

function snapSec(raw) {
  const n = Number(raw) || 0;
  return ed.snap ? Math.round(n) : Math.round(n * 10) / 10;
}

// Same rule as gg_data.clamp_clip (server re-validates on save).
function clampClip(c, tlIn, sec) {
  if (kindOf(c) !== "video") return { in: 0, sec: r2(Math.min(IMG_MAX, Math.max(IMG_MIN, sec))) };
  const dur = Number(c.src_dur) || 0;
  tlIn = Math.max(0, tlIn);
  if (dur) {
    tlIn = Math.min(tlIn, Math.max(0, dur - VID_MIN));
    sec = Math.min(sec, dur - tlIn);
  }
  return { in: r2(tlIn), sec: r2(Math.min(60, Math.max(VID_MIN, sec))) };
}

function scheduleSave() {
  clearTimeout(ed.saveTimer);
  ed.saveTimer = setTimeout(saveEdit, 400);
  bus.dispatchEvent(new Event("dirty"));
}

async function saveEdit() {
  const tl = state.timeline;
  if (!tl) return true;
  ed.saving = true;
  bus.dispatchEvent(new Event("dirty"));
  const body = {
    pid: tl.project.id,
    order: tl.cuts.map((c) => c.id),
    clips: Object.fromEntries(tl.cuts.map((c) => [c.id, { in: c.in, sec: c.sec, pick: c.pick || null }])),
  };
  let ok = true;
  try {
    const res = await api.fetchApi("/gonggan/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    if (!ed.dragging && state.timeline && state.timeline.project.id === data.project.id) {
      state.timeline = data;
      state.error = "";
    }
  } catch (e) {
    ok = false;
    state.error = "Save failed: " + e.message;
  }
  ed.saving = false;
  bus.dispatchEvent(new Event("timeline"));
  return ok;
}

async function resetEdit() {
  const tl = state.timeline;
  if (!tl) return;
  if (!confirm("Reset this timeline to the Gonggan order and lengths? (the current edit is kept as a backup file)")) return;
  stopPlay();
  try {
    const res = await api.fetchApi("/gonggan/edit/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: tl.project.id }) });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    state.timeline = data;
    state.error = "";
  } catch (e) {
    state.error = "Reset failed: " + e.message;
  }
  bus.dispatchEvent(new Event("timeline"));
}

// ---- playback ----
function itemAt(t) {
  const cuts = cutsNow();
  let at = 0;
  for (let i = 0; i < cuts.length; i++) {
    if (t < at + cuts[i].sec - 1e-6) return { i, local: t - at };
    at += cuts[i].sec;
  }
  return cuts.length ? { i: cuts.length - 1, local: cuts[cuts.length - 1].sec } : { i: -1, local: 0 };
}

let viewer = null;  // { box, img, vid, next, label, clock, playBtn, soundBtn }

function showFrame(force) {
  if (!viewer) return;
  if (viewer.mode === "export") { paintHead(); return; }
  const cuts = cutsNow();
  const { i, local } = itemAt(play.t);
  const c = cuts[i];
  const { img, vid, label, blank } = viewer;
  if (i !== play.idx || force) {
    play.idx = i;
    document.querySelectorAll(".gg-timeline .gg-clip").forEach((el) => el.classList.toggle("gg-play", c && el.dataset.cutId === c.id));
    if (!c) { img.hidden = vid.hidden = true; blank.hidden = false; blank.textContent = ""; label.textContent = ""; return; }
    label.textContent = c.group_name ? `Scene · ${c.group_name} — ${c.pos + 1}. ${c.name}` : `${c.pos + 1}. ${c.name}`;
    if (c.media && c.media.kind === "video") {
      img.hidden = true; blank.hidden = true; vid.hidden = false;
      const url = mediaUrl(c.media.id);
      if (vid.dataset.src !== url) { vid.dataset.src = url; vid.src = url; }
    } else if (c.media) {
      vid.pause(); vid.hidden = true; blank.hidden = true; img.hidden = false;
      const url = mediaUrl(c.media.id);
      if (img.dataset.src !== url) { img.dataset.src = url; img.src = url; }
    } else {
      vid.pause(); vid.hidden = true; img.hidden = true; blank.hidden = false;
      blank.textContent = `${c.pos + 1}. ${c.name} — no media`;
    }
    preloadNext(i + 1);
  }
  if (c && c.media && c.media.kind === "video") {
    vid.muted = !ed.sound;
    const want = c.in + local;
    try {
      if (vid.readyState >= 1) {
        const dur = Number(vid.duration);
        if (Number.isFinite(dur) && want >= dur - 0.04) { if (!vid.paused) vid.pause(); }
        else {
          if (Math.abs((vid.currentTime || 0) - want) > (play.on ? 0.15 : 0.02)) vid.currentTime = want;
          if (play.on && vid.paused) vid.play().catch(() => {});
          if (!play.on && !vid.paused) vid.pause();
        }
      } else if (!vid._ggWait) {
        vid._ggWait = true;
        vid.addEventListener("loadedmetadata", () => { vid._ggWait = false; showFrame(); }, { once: true });
      }
    } catch (_) {}
  }
  paintHead();
}

function preloadNext(i) {
  const c = cutsNow()[i];
  if (!viewer || !c || !c.media) return;
  const url = mediaUrl(c.media.id);
  if (c.media.kind === "video") { if (viewer.next.dataset.src !== url) { viewer.next.dataset.src = url; viewer.next.src = url; } }
  else { const im = new Image(); im.src = url; }
}

function paintHead() {
  const total = totalSec();
  document.querySelectorAll(".gg-timeline .gg-head-line").forEach((h) => { h.style.left = play.t * ed.px + "px"; });
  document.querySelectorAll(".gg-timeline .gg-clock").forEach((el) => { el.textContent = `${fmtClock(play.t)} / ${fmtClock(total)}`; });
  document.querySelectorAll(".gg-timeline .gg-play-btn").forEach((b) => { b.textContent = play.on ? "❚❚" : "▶"; b.title = play.on ? "Pause (Space)" : "Play (Space)"; });
  if (play.on) {
    const wrap = document.querySelector(".gg-timeline .gg-tl-scroll");
    if (wrap) {
      const x = play.t * ed.px, sl = wrap.scrollLeft, vw = wrap.clientWidth;
      if (x < sl + 16) wrap.scrollLeft = Math.max(0, x - 16);
      else if (x > sl + vw - 40) wrap.scrollLeft = x - 40;
    }
  }
}

function tick(now) {
  if (!play.on) return;
  const dt = Math.min(0.25, (now - play.last) / 1000);
  play.last = now;
  play.t += dt;
  const total = totalSec();
  if (play.t >= total) { play.t = total; stopPlay(); showFrame(); return; }
  showFrame();
  play.raf = requestAnimationFrame(tick);
}

function leaveExportView() {
  if (!viewer || viewer.mode !== "export") return;
  viewer.mode = "";
  viewer.vid.controls = false;
  viewer.vid.pause();
  viewer.vid.dataset.src = "";
  play.idx = -1;
}

function startPlay() {
  if (!cutsNow().length) return;
  leaveExportView();
  if (play.t >= totalSec() - 0.05) play.t = 0;
  play.on = true;
  play.last = performance.now();
  showFrame(true);
  play.raf = requestAnimationFrame(tick);
}

function stopPlay() {
  play.on = false;
  if (play.raf) cancelAnimationFrame(play.raf);
  play.raf = 0;
  if (viewer) viewer.vid.pause();
  paintHead();
}

function togglePlay() { play.on ? stopPlay() : startPlay(); }

function seek(t) {
  leaveExportView();
  play.t = Math.max(0, Math.min(totalSec(), t));
  play.last = performance.now();
  showFrame();
}

// ---- trim (port of app.js bindTlTrim) ----
function bindTrim(root) {
  root.querySelectorAll(".gg-edge").forEach((edge) => {
    edge.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      e.preventDefault();
      e.stopPropagation();
      const el = edge.closest(".gg-clip");
      const c = cutsNow().find((x) => x.id === el.dataset.cutId);
      if (!c) return;
      const side = edge.dataset.side;
      const startX = e.clientX;
      const startIn = c.in, startSec = c.sec, outPt = startIn + startSec;
      const isVid = kindOf(c) === "video";
      let raf = 0, pendingX = startX;
      ed.dragging = true;
      el.classList.add("gg-trimming");
      const paint = (x) => {
        const dx = x - startX;
        let next;
        if (side === "l" && isVid) {
          const nextIn = Math.max(0, snapSec(startIn + dx / ed.px));
          next = clampClip(c, Math.min(nextIn, outPt - VID_MIN), outPt - Math.min(nextIn, outPt - VID_MIN));
        } else if (side === "l") {
          next = clampClip(c, 0, snapSec(startSec - dx / ed.px));
        } else {
          next = clampClip(c, startIn, snapSec(startSec + dx / ed.px));
        }
        c.in = next.in; c.sec = next.sec;
        layoutClips(root);
        const badge = el.querySelector(".gg-clip-dur");
        if (badge) badge.textContent = `${c.sec.toFixed(1)}s`;
        const inb = el.querySelector(".gg-clip-in");
        if (inb) inb.textContent = isVid && c.in > 0 ? `in ${c.in.toFixed(1)}` : "";
        const tip = root.querySelector(".gg-tip");
        if (tip) tip.textContent = isVid ? `in ${c.in.toFixed(2)}s · len ${c.sec.toFixed(2)}s · src ${c.src_dur ? c.src_dur.toFixed(2) + "s" : "?"}` : `len ${c.sec.toFixed(2)}s (still ${IMG_MIN}–${IMG_MAX}s)`;
      };
      const move = (ev) => {
        pendingX = ev.clientX;
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; paint(pendingX); });
      };
      const up = (ev) => {
        edge.removeEventListener("pointermove", move);
        edge.removeEventListener("pointerup", up);
        edge.removeEventListener("pointercancel", up);
        try { edge.releasePointerCapture(e.pointerId); } catch (_) {}
        if (raf) cancelAnimationFrame(raf);
        paint(ev.clientX || pendingX);
        el.classList.remove("gg-trimming");
        ed.dragging = false;
        c.edited = true;
        play.idx = -1;
        if (startIn !== c.in || startSec !== c.sec) scheduleSave();
        setTimeout(() => { const tip = root.querySelector(".gg-tip"); if (tip && !ed.dragging) tip.textContent = ""; }, 2500);
        bus.dispatchEvent(new Event("timeline"));
      };
      try { edge.setPointerCapture(e.pointerId); } catch (_) {}
      edge.addEventListener("pointermove", move);
      edge.addEventListener("pointerup", up);
      edge.addEventListener("pointercancel", up);
    });
  });
}

// ---- reorder (pointer-based; ComfyUI owns HTML5 drop for workflow files) ----
function bindReorder(root) {
  const track = root.querySelector(".gg-track");
  const marker = root.querySelector(".gg-drop");
  root.querySelectorAll(".gg-clip").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      if (e.button || e.target.closest(".gg-edge")) return;
      const startX = e.clientX, startY = e.clientY;
      let active = false, target = -1;
      const cuts = cutsNow();
      const from = cuts.findIndex((x) => x.id === el.dataset.cutId);
      const slot = (x) => {
        const rect = track.getBoundingClientRect();
        const t = (x - rect.left) / ed.px;
        let at = 0;
        for (let i = 0; i < cuts.length; i++) {
          if (t < at + cuts[i].sec / 2) return i;
          at += cuts[i].sec;
        }
        return cuts.length;
      };
      const move = (ev) => {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        if (!active) { active = true; ed.dragging = true; el.classList.add("gg-moving"); try { el.setPointerCapture(e.pointerId); } catch (_) {} }
        target = slot(ev.clientX);
        marker.hidden = false;
        marker.style.left = startOf(target) * ed.px + "px";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        marker.hidden = true;
        el.classList.remove("gg-moving");
        if (!active) { selectCut(el.dataset.cutId); return; }
        ed.dragging = false;
        if (target >= 0 && target !== from && target !== from + 1) {
          const [m] = cuts.splice(from, 1);
          cuts.splice(target > from ? target - 1 : target, 0, m);
          cuts.forEach((c, i) => { c.pos = i; });
          play.idx = -1;
          scheduleSave();
        }
        bus.dispatchEvent(new Event("timeline"));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  });
}

function layoutClips(root) {
  const cuts = cutsNow();
  const byId = new Map(cuts.map((c) => [c.id, c]));
  root.querySelectorAll(".gg-clip").forEach((el) => {
    const c = byId.get(el.dataset.cutId);
    if (c) el.style.width = c.sec * ed.px + "px";
  });
  paintRuler(root);
}

function paintRuler(root) {
  const total = totalSec();
  const inner = root.querySelector(".gg-tl-inner");
  if (inner) inner.style.width = Math.max(1, Math.ceil((total + 2) * ed.px)) + "px";
  const ruler = root.querySelector(".gg-ruler");
  if (!ruler) return;
  const step = ed.px >= 30 ? 1 : ed.px >= 12 ? 2 : 5;
  const ticks = [];
  for (let s = 0; s <= Math.ceil(total) + 1; s += step) {
    const major = s % (step * 5) === 0;
    ticks.push(`<span class="gg-tick${major ? " gg-major" : ""}" style="left:${s * ed.px}px">${major ? esc(fmtClock(s).slice(0, 5)) : ""}</span>`);
  }
  ruler.innerHTML = ticks.join("");
  const info = root.querySelector(".gg-tl-info");
  if (info) info.textContent = `${cutsNow().length} cuts · ${fmtClock(total)}${state.timeline && state.timeline.edited ? " · edited" : ""}${ed.saving ? " · saving…" : ""}`;
}

function mountTimeline(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "gg-root gg-timeline";
  root.tabIndex = -1;
  el.appendChild(root);
  root.innerHTML = `
    <div class="gg-viewer">
      <div class="gg-screen">
        <img class="gg-v-img" alt="" hidden />
        <video class="gg-v-vid" playsinline preload="auto" hidden></video>
        <video class="gg-v-next" muted preload="auto" hidden></video>
        <div class="gg-v-blank"></div>
        <div class="gg-v-label"></div>
      </div>
      <div class="gg-transport">
        <button class="gg-btn gg-play-btn" title="Play (Space)">▶</button>
        <span class="gg-clock">00:00:00 / 00:00:00</span>
        <button class="gg-btn gg-sound" title="Sound"></button>
      </div>
    </div>
    <div class="gg-editor">
      <div class="gg-tl-tools">
        <span class="gg-tl-title"></span>
        <span class="gg-tl-info"></span>
        <span class="gg-tip"></span>
        <button class="gg-btn gg-snap" title="Snap: 1 s steps (off = 0.1 s)">Snap</button>
        <button class="gg-btn gg-zoom-out" title="Zoom out">−</button>
        <button class="gg-btn gg-zoom-in" title="Zoom in">+</button>
        <button class="gg-btn gg-reset" title="Reset to Gonggan order and lengths">Reset</button>
        <button class="gg-btn gg-reload" title="Reload">⟳</button>
        <span class="gg-sep"></span>
        <select class="gg-ex-preset" title="Export size">
          <option value="480p">480p</option><option value="720p" selected>720p</option><option value="1080p">1080p</option>
        </select>
        <label class="gg-ex-snd" title="Include clip audio (silence for stills)"><input type="checkbox" class="gg-ex-sound" checked /> audio</label>
        <button class="gg-btn gg-export gg-primary" title="Render the timeline to one mp4 (CPU, ffmpeg)">Export mp4</button>
      </div>
      <div class="gg-ex-row" hidden>
        <div class="gg-ex-bar"><div class="gg-ex-fill"></div></div>
        <span class="gg-ex-text"></span>
        <button class="gg-btn gg-ex-cancel">Cancel</button>
        <button class="gg-btn gg-ex-play" hidden>▶ Preview</button>
        <a class="gg-btn gg-ex-open" target="_blank" rel="noopener" hidden>Open</a>
        <span class="gg-ex-path" title="Click to copy path"></span>
        <button class="gg-btn gg-ex-close" title="Hide">×</button>
      </div>
      <div class="gg-error" hidden></div>
      <div class="gg-tl-scroll">
        <div class="gg-tl-inner">
          <div class="gg-ruler" title="Click to seek"></div>
          <div class="gg-track"></div>
          <div class="gg-drop" hidden></div>
          <div class="gg-head-line"></div>
        </div>
      </div>
    </div>`;
  viewer = {
    box: root,
    img: root.querySelector(".gg-v-img"),
    vid: root.querySelector(".gg-v-vid"),
    next: root.querySelector(".gg-v-next"),
    blank: root.querySelector(".gg-v-blank"),
    label: root.querySelector(".gg-v-label"),
  };
  const $r = (q) => root.querySelector(q);
  const paintButtons = () => {
    $r(".gg-snap").classList.toggle("gg-on", ed.snap);
    $r(".gg-sound").textContent = ed.sound ? "🔊" : "🔇";
    $r(".gg-sound").classList.toggle("gg-on", ed.sound);
  };
  $r(".gg-play-btn").addEventListener("click", togglePlay);
  $r(".gg-sound").addEventListener("click", () => { ed.sound = !ed.sound; localStorage.setItem("gg.sound", ed.sound ? "1" : "0"); viewer.vid.muted = !ed.sound; paintButtons(); });
  $r(".gg-snap").addEventListener("click", () => { ed.snap = !ed.snap; localStorage.setItem("gg.snap", ed.snap ? "1" : "0"); paintButtons(); });
  const zoom = (f) => { ed.px = Math.max(6, Math.min(240, Math.round(ed.px * f))); localStorage.setItem("gg.px", String(ed.px)); paintTrack(); };
  $r(".gg-zoom-in").addEventListener("click", () => zoom(1.5));
  $r(".gg-zoom-out").addEventListener("click", () => zoom(1 / 1.5));
  $r(".gg-reset").addEventListener("click", resetEdit);
  $r(".gg-export").addEventListener("click", () => startExport($r(".gg-ex-preset").value, $r(".gg-ex-sound").checked));
  $r(".gg-ex-cancel").addEventListener("click", cancelExport);
  $r(".gg-ex-play").addEventListener("click", () => showExport(exp.job));
  $r(".gg-ex-close").addEventListener("click", () => { exp.hidden = true; paintExport(); });
  $r(".gg-ex-path").addEventListener("click", (e) => { navigator.clipboard?.writeText(e.target.textContent).catch(() => {}); });
  $r(".gg-reload").addEventListener("click", () => loadProjects());
  $r(".gg-ruler").addEventListener("pointerdown", (e) => {
    const rect = $r(".gg-track").getBoundingClientRect();
    const go = (x) => seek((x - rect.left) / ed.px);
    go(e.clientX);
    const move = (ev) => go(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  // The panel host has no definite height; size the root from it so the viewer can fill the panel.
  const host = el.parentElement || el;
  const fit = () => {
    const h = host.clientHeight || el.clientHeight;
    if (h > 60) root.style.height = h + "px";
    const scr = root.querySelector(".gg-screen");
    const w = Math.max(200, Math.min(host.clientWidth * 0.4, ((h || 220) - 46) * 16 / 9));
    if (scr) { scr.style.width = Math.round(w) + "px"; scr.style.height = Math.round(w * 9 / 16) + "px"; }
  };
  const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(host);
  fit();
  root.addEventListener("mouseenter", () => { root._ggHover = true; });
  root.addEventListener("mouseleave", () => { root._ggHover = false; });

  const paintTrack = () => {
    const tl = state.timeline;
    const cuts = cutsNow();
    $r(".gg-tl-title").textContent = tl ? tl.project.name : "No project";
    const err = $r(".gg-error");
    err.hidden = !state.error;
    err.textContent = state.error || "";
    $r(".gg-track").innerHTML = cuts.map((c, i) => {
      const run = c.group_id && (i === 0 || cuts[i - 1].group_id !== c.group_id);
      const hue = c.group_id ? groupColor(c.group_id) : 0;
      const tip = `${c.group_name ? `Scene · ${c.group_name}\n` : ""}${c.pos + 1}. ${c.name}  ${c.sec.toFixed(1)}s${c.src_dur ? ` (src ${c.src_dur}s)` : ""}`;
      return `
      <div class="gg-clip${c.media ? "" : " gg-clip-empty"}${kindOf(c) === "video" ? " gg-clip-video" : ""}${c.pos !== c.index ? " gg-moved" : ""}${c.group_id ? " gg-in-scene" : ""}${run ? " gg-scene-start" : ""}"
           data-cut-id="${esc(c.id)}" style="width:${c.sec * ed.px}px;${c.group_id ? `--gg-grp:${hue}` : ""}"
           title="${esc(tip)}">
        ${run ? `<div class="gg-scene-band">Scene · ${esc(c.group_name)}</div>` : ""}
        ${thumbHtml(c.media, "gg-clip-thumb")}
        <span class="gg-clip-dot gg-dot-empty"></span>
        <div class="gg-clip-label"><span class="gg-no">${c.pos + 1}</span>${esc(c.name)}</div>
        <div class="gg-clip-in">${kindOf(c) === "video" && c.in > 0 ? `in ${c.in.toFixed(1)}` : ""}</div>
        <div class="gg-clip-dur">${c.sec.toFixed(1)}s</div>
        <div class="gg-clip-prog" hidden><div class="gg-prog-bar"><div class="gg-prog-fill"></div></div></div>
        <div class="gg-edge gg-edge-l${i > 0 ? " gg-edge-split" : ""}" data-side="l" title="Trim in"></div>
        <div class="gg-edge gg-edge-r${i < cuts.length - 1 ? " gg-edge-split" : ""}" data-side="r" title="Trim out"></div>
      </div>`;
    }).join("");
    layoutClips(root);
    bindTrim(root);
    bindReorder(root);
    paintSelection(root);
    paintButtons();
    paintAllCutProgress();
    syncProgressWireState();
    if (play.t > totalSec()) play.t = totalSec();
    play.idx = -1;
    showFrame(true);
  };
  const onTimeline = () => { if (!ed.dragging) paintTrack(); };
  const onDirty = () => paintRuler(root);
  const onSel = () => {
    paintSelection(root);
    if (!play.on && state.cutId) {
      const idx = cutsNow().findIndex((c) => c.id === state.cutId);
      if (idx >= 0) {
        play.idx = -1;
        play.t = startOf(idx) + 0.001;
        showFrame(true);
      }
    }
  };
  const onProjects = () => { stopPlay(); play.t = 0; paintTimelineNativeLocks(); };
  bus.addEventListener("timeline", onTimeline);
  bus.addEventListener("projects", onProjects);
  const onTimelineLocks = () => paintTimelineNativeLocks();
  bus.addEventListener("timeline", onTimelineLocks);
  bus.addEventListener("dirty", onDirty);
  bus.addEventListener("select", onSel);
  paintTrack();
  paintExport();
  paintTimelineNativeLocks();
  refreshExport();
  if (!state.projects.length) loadProjects();
  return () => {
    stopPlay();
    if (ro) ro.disconnect();
    bus.removeEventListener("timeline", onTimeline);
    bus.removeEventListener("timeline", onTimelineLocks);
    bus.removeEventListener("projects", onProjects);
    bus.removeEventListener("dirty", onDirty);
    bus.removeEventListener("select", onSel);
    if (viewer && viewer.box === root) viewer = null;
    syncProgressWireState();
  };
}

// ---- export ----
const exp = { job: null, poll: 0, hidden: false };
const exportUrl = (name) => api.apiURL("/gonggan/export/file?name=" + encodeURIComponent(name));
const fmtMB = (b) => (b / 1048576).toFixed(1) + " MB";

function onExportJob(job) {
  if (!job || job.status === "idle") return;
  const was = exp.job && exp.job.status;
  exp.job = job;
  if (job.status === "running") exp.hidden = false;
  paintExport();
  if (job.status === "running" && !exp.poll) exp.poll = setInterval(refreshExport, 1000);
  if (job.status !== "running" && exp.poll) { clearInterval(exp.poll); exp.poll = 0; }
  if (was === "running" && job.status === "done") showExport(job);
}

async function refreshExport() {
  try { const d = await getJson("/gonggan/export/status"); onExportJob(d.job); } catch (_) {}
}

function paintTimelineNativeLocks() {
  const nat = isNativeProject();
  const tip = "Not available for native projects yet";
  document.querySelectorAll(".gg-timeline .gg-export").forEach((btn) => {
    btn.disabled = nat;
    btn.title = nat ? tip : "Render the timeline to one mp4 (CPU, ffmpeg)";
  });
  document.querySelectorAll(".gg-timeline .gg-reset").forEach((btn) => {
    btn.disabled = nat;
    btn.title = nat ? tip : "Reset to Gonggan order and lengths";
  });
  document.querySelectorAll(".gg-timeline .gg-ex-preset, .gg-timeline .gg-ex-sound").forEach((el) => {
    el.disabled = nat;
  });
}

async function startExport(preset, sound) {
  const tl = state.timeline;
  if (!tl || !tl.cuts.length) return;
  if (isNativeProject()) {
    ggToast("Export", "Not available for native projects yet", "warn");
    return;
  }
  clearTimeout(ed.saveTimer);
  if (ed.saving || ed.saveTimer) await saveEdit();   // export what is on screen
  stopPlay();
  try {
    const res = await api.fetchApi("/gonggan/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: tl.project.id, preset, fps: 24, sound }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    exp.hidden = false;
    onExportJob(data.job);
  } catch (e) {
    state.error = "Export failed to start: " + e.message;
    bus.dispatchEvent(new Event("timeline"));
  }
}

async function cancelExport() {
  try { await api.fetchApi("/gonggan/export/cancel", { method: "POST" }); } catch (_) {}
  refreshExport();
}

function showExport(job) {
  if (!viewer || !job || job.status !== "done") return;
  stopPlay();
  viewer.mode = "export";
  const { img, vid, blank, label } = viewer;
  img.hidden = true; blank.hidden = true; vid.hidden = false;
  vid.controls = true;
  vid.muted = !ed.sound;
  const url = exportUrl(job.file);
  vid.dataset.src = url;
  vid.src = url;
  label.textContent = `EXPORT · ${job.file}`;
  document.querySelectorAll(".gg-timeline .gg-clip").forEach((el) => el.classList.remove("gg-play"));
}

function paintExport() {
  const root = document.querySelector(".gg-timeline");
  if (!root) return;
  const row = root.querySelector(".gg-ex-row");
  const job = exp.job;
  const btn = root.querySelector(".gg-export");
  const running = job && job.status === "running";
  btn.disabled = !!running;
  btn.textContent = running ? "Exporting…" : "Export mp4";
  row.hidden = !job || exp.hidden;
  if (!job) return;
  const pct = Math.round((job.progress || 0) * 100);
  row.querySelector(".gg-ex-fill").style.width = (job.status === "done" ? 100 : pct) + "%";
  row.classList.toggle("gg-ex-done", job.status === "done");
  row.classList.toggle("gg-ex-bad", job.status === "error" || job.status === "cancelled");
  const text = row.querySelector(".gg-ex-text");
  if (running) text.textContent = `${job.project} · ${job.preset} · ${job.step || ""} · ${pct}%`;
  else if (job.status === "done") text.textContent = `✓ ${job.preset} · ${fmtClock(job.expected_sec || 0)} · ${fmtMB(job.size || 0)} · ${Math.round((job.finished_at - job.started_at) || 0)}s`;
  else if (job.status === "cancelled") text.textContent = "Export cancelled";
  else if (job.status === "error") text.textContent = "Export failed: " + (job.error || "");
  row.querySelector(".gg-ex-cancel").hidden = !running;
  const done = job.status === "done";
  row.querySelector(".gg-ex-play").hidden = !done;
  const open = row.querySelector(".gg-ex-open");
  open.hidden = !done;
  if (done) open.href = exportUrl(job.file);
  row.querySelector(".gg-ex-path").textContent = done ? job.path : "";
}

api.addEventListener("gonggan.export", (e) => onExportJob(e.detail));

// Space = play/pause, only while the pointer is over (or focus is inside) the Timeline panel,
// so ComfyUI's own space-drag canvas panning keeps working everywhere else.
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const root = document.querySelector(".gg-timeline");
  if (!root || !root.isConnected || !(root._ggHover || root.contains(document.activeElement))) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  e.stopPropagation();
  togglePlay();
}, true);

function bindHoverPlay(root) {
  root.querySelectorAll("video").forEach((v) => {
    const host = v.parentElement;
    host.addEventListener("mouseenter", () => { v.loop = true; v.play().catch(() => {}); });
    host.addEventListener("mouseleave", () => { v.pause(); try { v.currentTime = 0; } catch (_) {} });
  });
}

app.registerExtension({
  name: EXT,
  bottomPanelTabs: [
    { id: TIMELINE_TAB, title: "Timeline", type: "custom", icon: "pi pi-video", render: (el) => mountTimeline(el) },
  ],
  async setup() {
    globalThis.__gongganCutAutosaveOnSwitch = "0.8.1";
    bindLoadImageUi({ ggToast });
    installLoadImageQueueGuard();
    loadPersistedJobs();
    if (!api._ggQueuePatched) {
      api._ggQueuePatched = true;
      const origQueue = api.queuePrompt.bind(api);
      api.queuePrompt = async (...args) => {
        const res = await origQueue(...args);
        try {
          if (res?.prompt_id && wfLastLoadedCutId && state.pid && isGongganShotTabOpenAndActive()) {
            progressTracker.registerPrompt(res.prompt_id, wfLastLoadedCutId, state.pid);
            persistJob(res.prompt_id, wfLastLoadedCutId, state.pid);
            syncProgressWireState();
          }
        } catch (_) {}
        return res;
      };
    }
    app.extensionManager.registerSidebarTab({
      id: SHOTS_TAB,
      icon: "pi pi-images",
      title: "Shots",
      tooltip: "Gonggan shot list",
      type: "custom",
      render: (el) => mountShots(el),
    });
  },
});
