// comfyui-gonggan-cut — "Shots" sidebar tab + "Timeline" bottom panel tab.
// Day 1: static render of real Gonggan projects/cuts (read-only). Trim/reorder come next.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  createProgressTracker,
  cutStage,
  projectSummary,
  formatSummary,
  summaryBarParts,
  sceneBestProgress,
} from "./gg_progress_core.js";
import {
  formatCutNumber,
  computeCutLabels,
  cutDisplayLabel,
  computeEffectiveSec,
  lengthWarning,
  moveCuts,
  shotsDropTarget,
  dropRestIndex,
  clientYToWrapY,
  autoScrollDelta,
  finalCutList,
  filterCuts,
  redoFilterOn,
  shotsViewOf,
  fileBaseName,
  projectCompletion,
  formatDueDisplay,
  formatMinSecDot,
  versionIndexFromList,
  formatCutHeaderLengths,
  formatCutVersionStatus,
  versionRepState,
  plannedLenInputPlaceholder,
  addCutTarget,
} from "./gg_cuts_core.js";
import {
  TRIM_SNAP_PX,
  trimTipText,
  trimSnapTargets,
  pickSnapTarget,
  quantizeTrimDelta,
  trimToSource,
  appliedTrimDelta,
} from "./gg_trim_core.js";
import { GAP, layoutTrack, clipAtTime, edgeSnapTargets, snapMoveStart, placeClip, prevClipEnd } from "./gg_tl_place_core.js";
import {
  trashButtonLabel,
  normalizeTrashItems,
  formatTrashItem,
  movedToTrashToastMessage,
  deleteCutsConfirmMessage,
} from "./gg_trash_core.js";
import { createTimelineGuard, shouldAdoptMutationTimeline } from "./gg_timeline_guard_core.js";
import { createFieldSlots } from "./gg_field_slots_core.js";
import { createEditSaveGate } from "./gg_edit_save_core.js";
import { confirmKeyAction, splitConfirmMessage } from "./gg_confirm_core.js";
import { emptyListHint } from "./gg_empty_hint_core.js";
import {
  cutCardMenuItems,
  timelineClipMenuItems,
  sceneMenuItems,
  sceneCutIds,
  attachMenuActions,
} from "./gg_ctx_menu_core.js";
import {
  regenConfirmMessage,
  regenKnownNodeCount,
  isRegenEmptyCut,
  nativeRegenQueueCheck,
  REGEN_SKIP_MESSAGE,
} from "./gg_native_regen_core.js";
import { bindLoadImageUi, installLoadImageQueueGuard, scheduleLoadImageScan } from "./gg_loadimage.js";
import { REFERENCE_CATEGORIES } from "./gg_import_core.js";
import {
  folderNotCreated,
  loadLastLocation,
  newProjectRequest,
  NO_FOLDER_ROUTE_HINT,
  projectFolderPath,
  saveLastLocation,
} from "./gg_new_project_core.js";
import {
  autosaveModifiedTabs,
  autosaveWorkflow,
  normalizeWorkflowPath,
  pickFreeWorkflowPath,
  pathCollides,
  autosaveStatusMessage,
  workflowLabel,
} from "./gg_autosave_core.js";
import { sentence } from "./gg_text_core.js";
import {
  filterTabsNeedingAutosave,
  workflowTabNeedsAutosave,
} from "./gg_workflow_dirty_core.js";
import { cutBaseKey, stampWip, shouldRestoreWip } from "./gg_wip_core.js";
import { GG_VERSION } from "./gg_version.js";
import {
  extractPngWorkflow,
  isCutEdited,
  loadEditedMap,
  saveEditedMap,
  widgetValuesDiffer,
} from "./gg_wf_source_core.js";
import {
  shotWorkflowRelPathById,
  shouldSkipShotWorkflowReload,
  gongganExtraProjectId,
  workflowPathKey,
  isShotTabAtOwnedPath,
  findWorkflowAtShotPath,
} from "./gg_shot_names.js";
import {
  shouldScheduleCutWorkflowLoad,
  shouldCancelPendingWorkflowLoad,
  shouldResetOpenTabTracking,
  shouldShowOpenTabMarker,
  shotsKeyAction,
  stepCutId,
  selectAllCutIds,
} from "./gg_cut_select_core.js";
import {
  selectedInDisplayOrder,
  batchRenderPlan,
  batchRenderConfirmMessage,
  batchRenderSummary,
  queueButtonState,
  QUEUE_EMPTY_TIP,
  queueDeleteBody,
} from "./gg_batch_render_core.js";
import { shouldClosePreviousShotTab } from "./gg_tab_close_core.js";
import {
  readCutWorkflowKindSwitch,
  repMediaKind,
  resolveEffectiveWorkflowKind,
  shouldTryEmbeddedRepWorkflow,
  workflowSourceToastDetail,
  VERSION_WF_MISSING,
  findCutVersion,
  isOpenVersion,
  versionWorkflowSourceOrder,
  workflowFromVersionRecord,
} from "./gg_rep_wf_core.js";
import {
  cutHeaderParts,
  formatShotTabLabel,
  formatShotTabTitle,
  normalizeTabDescriptor,
  planTabLabels,
  shotTabCutParts,
} from "./gg_tab_label_core.js";
import {
  CARD_EDIT_IDLE_TIP,
  CARD_EDIT_ACTIVE_TIP,
  cardEditKeyAction,
  shouldSkipCardSelect,
  isCardFieldEditing,
} from "./gg_card_edit_core.js";
import {
  CUT_NAME_MAX_LEN,
  canInlineRenameCut,
  inlineRenameKeyAction,
  inlineRenameCommitName,
  shouldDeferListPaint,
} from "./gg_cut_rename_core.js";
import {
  loadListMode,
  saveListMode,
  normalizeListMode,
  scrollTopToReveal,
  rowFullyHidden,
  shouldFollowPlayback,
  applyFieldOverrides,
  classifySaveFailure,
  isCaptionSaveRejected,
  isSilentFieldSave,
  autoHeightPx,
} from "./gg_story_core.js";
import { buildSrt, srtFileName, effectiveCaption, captionEditChanged, captionFieldPlaceholder, captionAtTime } from "./gg_caption_core.js";
import {
  rowContentKind,
  cutRowShellHtml,
  captionRowContentHtml,
  groupedListHtml,
  shotsSections,
  nextSceneName,
  newSceneGroupId,
  withNewEmptyScene,
  stripCutsFromGroups,
} from "./gg_group_list_core.js";
import { decideVideoSync } from "./gg_playback_core.js";
import { noMediaText, noMediaThumbClass, versionMedia } from "./gg_missing_media_core.js";
import {
  needsDurationProbe,
  formatClipDuration,
  versionStripRows,
  versionStripMenuItems,
  showNewestButton,
  stripScrollLeft,
  wheelToScrollLeft,
} from "./gg_version_strip_core.js";
import { resolveSendTarget } from "./gg_send_target_core.js";
import { batchProgressView, createRenderStatus, idleStateView, promptCutTarget, renderBadgeView, renderGlobalView } from "./gg_render_status_core.js";
import { captureRouteMissing, captureToast, createAutoCapture } from "./gg_auto_capture_core.js";
import { selectionBarView, iconRowView, statusPanelView } from "./gg_status_panel_core.js";
import { loadPanelOpen, savePanelOpen } from "./gg_panel_core.js";
import {
  stepMove,
  moveToScene,
  canMoveUp,
  canMoveDown,
  createUndoBurst,
  snapshotOrderGroups,
  dropHighlight,
  moveScene,
  sceneDropBeforeCut,
  sceneDropTarget,
  emptySceneDropTarget,
  listOrder,
} from "./gg_reorder_core.js";
import {
  loadLastTemplate,
  saveLastTemplate,
  pickInitialTemplate,
  shortTemplateName,
  templateComboItems,
} from "./gg_template_pick_core.js";
import { comboFilter, comboActiveIndex, comboKey, comboTypedValue } from "./gg_combo_core.js";
import {
  folderAddressTarget,
  folderListUrl,
  folderListError,
  folderPickerView,
  folderPickTarget,
  startPathCandidates,
} from "./gg_folder_pick_core.js";
import {
  isEmptyCutSourcePayload,
  resolveEmptyCutWorkflow,
} from "./gg_empty_cut_core.js";
import {
  normalizeNameInput,
  SCENE_NAME_MAX_LEN,
  PROJECT_NAME_MAX_LEN,
} from "./gg_ask_text_core.js";
import {
  TIMELINE_MIN_HEIGHT,
  loadTimelineOpen,
  saveTimelineOpen,
  loadTimelineHeight,
  saveTimelineHeight,
  clampHeight,
  firstShowTimelineHeight,
  bottomPanelPercent,
  shouldIgnoreShortcut,
  pluginKeyScopeActive,
  timelineShortcutAllowed,
  timelineToggleTooltip,
} from "./gg_timeline_toggle_core.js";
import {
  ZOOM_KEY_FACTOR,
  clampPx,
  thumbFromScroll,
  scrollFromThumbLeft,
  zoomFromHandle,
  fitPx,
  scrollForZoomAt,
  wheelZoomFactor,
  zoomKeyAction,
} from "./gg_zoombar_core.js";
import {
  normalizeProjectSettings,
  projectSettingsModalPatch,
  folderCheckErrorText,
} from "./gg_project_settings_core.js";
import {
  undoKeyAction,
  undoScope,
  nextUndoArea,
  createUndoHistory,
  sameSnapshot,
  fitOrderGroupsSnapshot,
  shotsCounterpart,
  shotsUndoSteps,
  snapshotTimelineEdit,
  applyTimelineSnapshot,
} from "./gg_undo_core.js";

const EXT = "gonggan.cut";
const PID_KEY = "gg.pid";
const TIMELINE_TAB = "gg-timeline";
const SHOTS_TAB = "gg-shots";
/** Lower-left cut panel (versions, End card, Needs redo, Regen, Send last output). Still rendered, only hidden. */
const SHOW_CUT_PANEL = false;
/** With SHOW_CUT_PANEL off: the same slot shows a status card for the selection with the Queue button. */
const SHOW_STATUS_PANEL = true;
const CUT_PANEL_ROOT_CLASS = SHOW_CUT_PANEL ? "" : SHOW_STATUS_PANEL ? " gg-cutpanel-status" : " gg-cutpanel-off";
/** Large `N selected · Group · Ungroup · ×` bar. Off = not rendered; the icon row takes its place. */
const SHOW_SEL_BAR = false;
/** "Show redo cuts only" option in the Shots toolbar. Off = not shown and the filter is forced off. */
const SHOW_REDO_FILTER = false;
/** "Cuts | Final cut list" toggle in the Shots toolbar. Off = not shown and the view is forced to "cuts". */
const SHOW_FINAL_LIST = false;
const bus = new EventTarget();
const state = { projects: [], projectsLoaded: false, pid: localStorage.getItem(PID_KEY) || "", timeline: null, cutId: "", cutSel: new Set(), error: "" };
// Every assignment to state.timeline that is not a load result counts as a mutation (see gg_timeline_guard_core.js).
const timelineGuard = createTimelineGuard();
let timelineAssignByLoad = false;
{
  let tl = state.timeline;
  Object.defineProperty(state, "timeline", {
    enumerable: true,
    configurable: true,
    get() { return tl; },
    set(v) {
      tl = v;
      if (!timelineAssignByLoad) timelineGuard.markMutation();
    },
  });
}
const shotsUi = {
  view: "cuts",
  needsRedoOnly: false,
  dragSession: null,
  listMode: loadListMode(localStorage),
  playCutId: "",
  composing: false,
  paintDeferred: false,
  /** Open inline cut title field: { cutId, input } or null. */
  inlineRename: null,
  cutWfKind: null,
  cutWfKindCutId: "",
};
const cutFieldUi = { timer: 0, pending: createFieldSlots(), unsaved: {}, routeMissing: false, captionDegraded: false };
let cutFieldSaveFailToastAt = 0;
let routeMissingToastShown = false;
let captionDegradeToastShown = false;
let lastPlayCutAnnounced = "";
let playCutScrollId = "";
const projectFieldUi = { timer: 0 };
const JOBS_KEY = "gonggan.jobs";
const progressTracker = createProgressTracker();
const renderStatus = createRenderStatus();
const autoCapture = createAutoCapture({ isNativePid });
let captureRestartToastShown = false;
const progUi = { paintTimer: 0, statusDebounce: 0, timelineReloadTimer: 0, wired: false, handlers: {} };
const PROGRESS_API_EVENTS = [
  "status", "promptQueued", "execution_start", "execution_cached", "executing", "progress", "progress_state",
  "executed", "execution_success", "execution_error", "execution_interrupted",
];
let cutSelAnchor = "";
const ctxUi = { el: null, sub: null, onDoc: null, onKey: null };
const reorderUndoBurst = createUndoBurst({ windowMs: 1500 });
// Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y: Shots = cut list order + scenes, cut add/delete, cut rename;
// Timeline = clip order + trims.
const shotsHistory = createUndoHistory();
const timelineHistory = createUndoHistory();
let shotsStepChain = Promise.resolve(true);
let undoLastArea = "";  // "shots" | "timeline" | "other" (canvas etc.) | "" — see nextUndoArea
const editGate = createEditSaveGate();  // serializes /gonggan/edit, /groups, /edit/reset and guards stale replies

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
    return `<video class="${cls} gg-thumb-vid" draggable="false" src="${url}" poster="${esc(posterUrl(media.id))}" muted playsinline preload="none"></video>`;
  }
  return `<img class="${cls} gg-thumb-img" draggable="false" src="${esc(posterUrl(media.id))}" loading="lazy" decoding="async" alt="" />`;
}

/** A thumb whose file failed to load becomes the same "no media" placeholder thumbHtml(null) draws. */
function showNoMediaThumb(el) {
  if (!el.isConnected) return;
  const ph = document.createElement("div");
  ph.className = noMediaThumbClass(el.classList);
  ph.textContent = "no media";
  el.closest(".gg-clip")?.classList.add("gg-clip-empty");
  el.replaceWith(ph);
}

function bindThumbFallbacks(root) {
  if (!root) return;
  root.querySelectorAll("video.gg-thumb-vid, img.gg-thumb-img").forEach((el) => {
    if (el._ggThumbErr) return;
    el._ggThumbErr = true;
    el.addEventListener("error", () => showNoMediaThumb(el));
  });
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
    state.projectsLoaded = true;
    state.error = "";
    if (!state.projects.some((p) => p.id === state.pid)) {
      const pick = state.projects.find((p) => p.id === data.active_project_id) || state.projects[0];
      state.pid = pick ? pick.id : "";
    }
  } catch (e) {
    state.error = sentence(`Could not load projects: ${e.message}`, "Check that ComfyUI is running, then reload the page.");
  }
  bus.dispatchEvent(new Event("projects"));
  await loadTimeline();
}

function mergeFieldOverrides() {
  const overrides = { ...cutFieldUi.unsaved };
  for (const { cutId, fields } of cutFieldUi.pending.all()) {
    overrides[cutId] = { ...(overrides[cutId] || {}), ...fields };
  }
  return overrides;
}

function adoptServerTimeline(tl) {
  if (!tl) return null;
  applyFieldOverrides(tl, mergeFieldOverrides());
  return tl;
}

function adoptMutationTimeline(tl, requestPid) {
  // A mutation response belongs to the project it was sent for; never show it under another project.
  if (!shouldAdoptMutationTimeline(tl, requestPid, state.pid)) return false;
  state.timeline = tl;
  return true;
}

async function loadTimeline() {
  if (!state.pid) { state.timeline = null; bus.dispatchEvent(new Event("timeline")); refreshTrashCount(); return; }
  const token = timelineGuard.begin(state.pid);
  let next = null;
  let failure = "";
  try {
    next = adoptServerTimeline(await getJson("/gonggan/timeline?pid=" + encodeURIComponent(token.pid)));
  } catch (e) {
    failure = e.message;
  }
  // A slower, older response must not overwrite a newer timeline (newer load, mutation response, other project).
  if (timelineGuard.isStale(token, state.pid)) return;
  timelineAssignByLoad = true;
  state.timeline = next;
  timelineAssignByLoad = false;
  state.error = failure ? "Could not load timeline: " + failure : "";
  bus.dispatchEvent(new Event("timeline"));
  refreshTrashCount();
  await reloadOpenCutWorkflowIfRepChanged();
}

function refreshTrashCount() {
  clearTimeout(trashRefreshTimer);
  if (!state.pid || !isNativeProject()) {
    trashCount = 0;
    bus.dispatchEvent(new Event("trash"));
    return;
  }
  trashRefreshTimer = setTimeout(async () => {
    try {
      const d = await getJson(`/gonggan/trash?pid=${encodeURIComponent(state.pid)}`);
      trashCount = normalizeTrashItems(d).length;
    } catch (_) {
      trashCount = 0;
    }
    bus.dispatchEvent(new Event("trash"));
  }, 120);
}

function syncTrashButton(root) {
  const btn = root?.querySelector(".gg-trash-btn");
  if (!btn) return;
  const show = isNativeProject() && trashCount > 0;
  btn.hidden = !show;
  btn.textContent = trashButtonLabel(trashCount) || "Trash";
}

function trashMenuLabel() {
  const n = trashCount > 0 ? trashCount : 0;
  return `Trash (${n})…`;
}

async function restoreCutsByIds(ids, { selectFirst = false } = {}) {
  const reqPid = state.pid;
  const d = await postJson("/gonggan/cut/restore", { pid: reqPid, cuts: ids });
  if (d.timeline) {
    adoptMutationTimeline(d.timeline, reqPid);
    state.error = "";
    if (selectFirst) {
      const pick = ids.find((id) => d.timeline.cuts.some((c) => c.id === id)) || d.timeline.cuts?.[0]?.id || "";
      if (pick) {
        state.cutId = pick;
        wfLastLoadedCutId = "";
        wfLastLoadedProjectId = "";
      }
    }
    bus.dispatchEvent(new Event("timeline"));
    bus.dispatchEvent(new Event("select"));
  }
  refreshTrashCount();
  return d;
}

/** Restore + a Shots history entry (Ctrl+Z deletes them again, Ctrl+Y restores them where they were). */
async function restoreCutsRecorded(ids, opts) {
  const pid = state.pid;
  const before = snapshotOrderGroups(state.timeline);
  const d = await restoreCutsByIds(ids, opts);
  if (d.timeline) recordShotsEntry(pid, { kind: "cuts", op: "add", ids: [...ids], before, after: snapshotOrderGroups(state.timeline) });
  return d;
}

async function openTrashModal() {
  if (!state.pid || !isNativeProject()) return;
  let items = [];
  try {
    const d = await getJson(`/gonggan/trash?pid=${encodeURIComponent(state.pid)}`);
    items = normalizeTrashItems(d);
    trashCount = items.length;
    bus.dispatchEvent(new Event("trash"));
  } catch (_) {
    items = [];
  }
  if (!items.length) return;

  const wrap = document.createElement("div");
  wrap.className = "gg-modal-backdrop";
  wrap.innerHTML = `
    <div class="gg-modal gg-modal-trash" role="dialog" aria-label="Trash">
      <h3 class="gg-modal-title">Trash</h3>
      <div class="gg-modal-trash-list"></div>
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-trash-restore-all">Restore all</button>
        <button type="button" class="gg-btn gg-modal-cancel">Close</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const listEl = wrap.querySelector(".gg-modal-trash-list");
  const close = () => wrap.remove();

  const renderList = () => {
    if (!listEl) return;
    const now = Date.now();
    listEl.innerHTML = items
      .map((item) => {
        const { title, sub } = formatTrashItem(item, now);
        return `<div class="gg-trash-row" data-cut-id="${esc(item.id)}">
          <div class="gg-trash-info">
            <div class="gg-trash-name">${esc(title)}</div>
            <div class="gg-trash-sub">${esc(sub)}</div>
          </div>
          <button type="button" class="gg-btn gg-trash-restore-one">Restore</button>
        </div>`;
      })
      .join("");
    listEl.querySelectorAll(".gg-trash-restore-one").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest(".gg-trash-row");
        const cutId = row?.dataset?.cutId;
        if (!cutId) return;
        try {
          await restoreCutsRecorded([cutId]);
          const d = await getJson(`/gonggan/trash?pid=${encodeURIComponent(state.pid)}`);
          items = normalizeTrashItems(d);
          trashCount = items.length;
          bus.dispatchEvent(new Event("trash"));
          if (!items.length) close();
          else renderList();
        } catch (e) {
          ggToast("Restore", e.message, "warn");
        }
      });
    });
  };

  renderList();
  wrap.querySelector(".gg-modal-cancel")?.addEventListener("click", close);
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });
  wrap.querySelector(".gg-trash-restore-all")?.addEventListener("click", async () => {
    const ids = items.map((it) => it.id);
    if (!ids.length) return;
    try {
      await restoreCutsRecorded(ids);
      items = [];
      trashCount = 0;
      bus.dispatchEvent(new Event("trash"));
      close();
    } catch (e) {
      ggToast("Restore", e.message, "warn");
    }
  });
}

function selectProject(pid) {
  if (pid === state.pid) return;
  flushPendingCutFields();
  shotsHistory.clear();
  timelineHistory.clear();
  state.pid = pid;
  state.cutId = "";
  state.cutSel.clear();
  cutSelAnchor = "";
  wfLastLoadedCutId = "";
  wfLastLoadedProjectId = "";
  localStorage.setItem(PID_KEY, pid);
  bus.dispatchEvent(new Event("projects"));
  refreshProjectTemplateFlag();
  loadTimeline();
}

const NATIVE_READONLY_TIP = "Not available for read-only (imported) projects";
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

function projectCaptionLang() {
  return normalizeProjectSettings(state.timeline?.project?.settings).caption_lang;
}

function closeProjectModal() {
  closeFolderPicker();
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
    <form class="gg-modal gg-new-project-modal" role="dialog" aria-label="New project">
      <h3 class="gg-modal-title">New Project</h3>
      <label class="gg-modal-field">Project name
        <input type="text" class="gg-modal-name" required maxlength="120" autocomplete="off" />
      </label>
      <label class="gg-modal-field">Location
        <span class="gg-folder-row">
          <input type="text" class="gg-modal-folder" maxlength="260" spellcheck="false" autocomplete="off" placeholder="e.g. D:\\Films" />
          <button type="button" class="gg-btn gg-modal-folder-browse">Browse…</button>
        </span>
        <span class="gg-modal-hint gg-np-path"></span>
        <span class="gg-modal-hint gg-split-err gg-modal-folder-err" aria-live="polite"></span>
      </label>
      ${templateFieldHtml()}
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-modal-cancel">Cancel</button>
        <button type="submit" class="gg-btn gg-primary gg-modal-create">Create</button>
      </div>
    </form>`;
  document.body.appendChild(wrap);
  projectModalEl = wrap;
  const form = wrap.querySelector("form");
  const nameIn = wrap.querySelector(".gg-modal-name");
  const locIn = wrap.querySelector(".gg-modal-folder");
  const pathHint = wrap.querySelector(".gg-np-path");
  const locErr = wrap.querySelector(".gg-modal-folder-err");
  const createBtn = wrap.querySelector(".gg-modal-create");
  let template = "";
  let templateTouched = false;
  const showTemplate = wireProjectTemplateField(wrap, {
    get: () => template,
    set: (ref) => { template = ref; templateTouched = true; },
  });
  const tplIn = wrap.querySelector(".gg-tpl-combo");
  fetchUserWorkflowPaths().then(() => {
    if (templateTouched || !wrap.isConnected || (tplIn && tplIn.value !== template)) return;
    template = pickInitialTemplate(userWorkflowPaths, loadLastTemplate(localStorage));
    showTemplate();
  });
  const syncPath = () => {
    const p = projectFolderPath(locIn.value, nameIn.value);
    pathHint.textContent = p ? `Project folder: ${p}` : "";
    pathHint.title = p;
  };
  const showLocErr = (msg) => {
    locErr.textContent = msg;
    locIn.focus();
  };
  locIn.value = loadLastLocation(localStorage);
  syncPath();
  nameIn.addEventListener("input", syncPath);
  locIn.addEventListener("input", () => { locErr.textContent = ""; syncPath(); });
  wrap.querySelector(".gg-modal-folder-browse")?.addEventListener("click", () => {
    openFolderPicker(locIn.value, (path) => {
      if (!wrap.isConnected) return;
      locIn.value = path;
      locIn.dispatchEvent(new Event("input", { bubbles: true }));
      locIn.focus();
    });
  });
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) closeProjectModal(); });
  wrap.querySelector(".gg-modal-cancel")?.addEventListener("click", closeProjectModal);
  let submitting = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    const req = newProjectRequest({ name: nameIn.value, location: locIn.value, template });
    if (req.error) {
      if (req.field === "location") showLocErr(req.error);
      else nameIn.focus();
      return;
    }
    const { name, location } = req.body;
    submitting = true;
    createBtn.disabled = true;
    try {
      const d = await postJson("/gonggan/project/create", req.body);
      saveLastLocation(localStorage, location);
      saveLastTemplate(localStorage, template);
      closeProjectModal();
      await loadProjects();
      if (d.project?.id) selectProject(d.project.id);
      if (folderNotCreated(d.project)) ggToast("Project", `Created "${name}". ${NO_FOLDER_ROUTE_HINT}`, "warn");
      else ggToast("Project", `Created "${name}" in ${d.project.folder}`, "ok");
    } catch (err) {
      if (err.status === 400) showLocErr(err.message);
      else ggToast("Project", err.message, "warn");
    } finally {
      submitting = false;
      if (wrap.isConnected) createBtn.disabled = false;
    }
  });
  nameIn.focus();
}

function templateFieldHtml() {
  return `<div class="gg-modal-field" title="ComfyUI saved workflow used as this project's template">
        <span class="gg-tpl-label">Default template</span>
        <span class="gg-tpl-wrap">
          <span class="gg-tpl-box">
            <input type="text" class="gg-tpl-combo" role="combobox" aria-label="Default template" aria-autocomplete="list"
              aria-expanded="false" aria-controls="gg-tpl-list" placeholder="(none)" autocomplete="off" spellcheck="false" />
            <button type="button" class="gg-tpl-toggle" tabindex="-1" aria-label="Show templates" title="Show templates">▼</button>
          </span>
          <button type="button" class="gg-btn gg-tpl-use-last" hidden>Use last</button>
        </span>
        <ul class="gg-tpl-list" id="gg-tpl-list" role="listbox" aria-label="Templates" hidden></ul>
      </div>`;
}

/**
 * Default template editable combobox (Project Settings, New Project): ▼ or a click shows the list, typing filters it,
 * arrows + Enter or a click pick; typed text becomes the value on Enter or when the field loses focus; Escape reverts.
 * Without `field` a pick links the open project's template right away (no Save needed) and the Use last button is
 * offered; with `field` the value lives in field.get / field.set.
 * @param {{ get: () => string, set: (ref: string) => void } | undefined} field
 * @returns {() => void} repaints the shown value
 */
function wireProjectTemplateField(wrap, field) {
  const input = wrap.querySelector(".gg-tpl-combo");
  const list = wrap.querySelector(".gg-tpl-list");
  if (!input || !list) return () => {};
  const ui = { open: false, active: -1, items: [] };
  const current = () => (field ? field.get() : projectTemplateRef) || "";
  const showValue = () => {
    input.value = current();
    input.title = current() || "(none)";
  };
  const render = () => {
    input.setAttribute("aria-expanded", ui.open ? "true" : "false");
    list.hidden = !ui.open;
    input.removeAttribute("aria-activedescendant");
    if (!ui.open) return;
    const cur = current();
    list.innerHTML = ui.items.length
      ? ui.items.map((it, i) => {
        const cls = `gg-combo-opt${i === ui.active ? " gg-active" : ""}${it.value === cur ? " gg-cur" : ""}`;
        return `<li role="option" id="gg-tpl-opt-${i}" class="${cls}" data-i="${i}" aria-selected="${i === ui.active}" title="${esc(it.label)}">${esc(it.label)}</li>`;
      }).join("")
      : `<li class="gg-combo-empty">No matches</li>`;
    if (ui.active >= 0) {
      input.setAttribute("aria-activedescendant", `gg-tpl-opt-${ui.active}`);
      list.children[ui.active]?.scrollIntoView({ block: "nearest" });
    }
  };
  const openList = (query) => {
    ui.items = comboFilter(templateComboItems(userWorkflowPaths, current()), query);
    ui.active = comboActiveIndex(ui.items, current(), query);
    ui.open = true;
    render();
  };
  const close = (revert) => {
    ui.open = false;
    render();
    if (revert) showValue();
  };
  const apply = async (ref) => {
    if (field) field.set(ref);
    else if (ref !== current()) await setProjectTemplateRef(ref);
    if (!wrap.isConnected) return;
    showValue();
    if (!field) syncTplUseLastButton(wrap);
  };
  const pick = (i) => {
    const it = ui.items[i];
    close(!it);
    if (!it) return;
    input.value = it.value;
    void apply(it.value);
  };
  const commitTyped = () => {
    const ref = comboTypedValue(templateComboItems(userWorkflowPaths, current()), input.value);
    if (ref === current()) showValue();
    else void apply(ref);
  };
  const showAll = () => {
    openList("");
    fetchUserWorkflowPaths().then(() => { if (ui.open && wrap.isConnected) openList(input.value === current() ? "" : input.value); });
  };
  input.addEventListener("click", () => {
    if (ui.open) return;
    input.select();
    showAll();
  });
  const toggle = wrap.querySelector(".gg-tpl-toggle");
  toggle?.addEventListener("mousedown", (e) => e.preventDefault());
  toggle?.addEventListener("click", () => {
    if (ui.open) {
      close(false);
      return;
    }
    input.focus();
    showAll();
  });
  input.addEventListener("input", () => openList(input.value));
  input.addEventListener("keydown", (e) => {
    const wasOpen = ui.open;
    const r = comboKey({ open: ui.open, active: ui.active, count: ui.items.length }, e.key);
    if (r.handled) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (r.pick >= 0) pick(r.pick);
    else if (!r.open) {
      if (wasOpen) close(r.revert);
      if (r.commit) commitTyped();
    } else if (!wasOpen) openList(input.value === current() ? "" : input.value);
    else {
      ui.active = r.active;
      render();
    }
  });
  input.addEventListener("blur", () => {
    if (ui.open) close(false);
    commitTyped();
  });
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const li = e.target.closest?.(".gg-combo-opt");
    if (li) pick(Number(li.dataset.i));
  });
  showValue();
  if (field) return showValue;
  fetchUserWorkflowPaths().then(() => { if (wrap.isConnected) syncTplUseLastButton(wrap); });
  syncTplUseLastButton(wrap);
  wrap.querySelector(".gg-tpl-use-last")?.addEventListener("click", (e) => {
    const ref = e.currentTarget?.dataset?.ref;
    if (ref) void apply(ref);
  });
  return showValue;
}

let folderPickerEl = null;

function closeFolderPicker() {
  if (folderPickerEl) {
    folderPickerEl.remove();
    folderPickerEl = null;
  }
}

async function fetchFolderList(path, lastUsed) {
  let res;
  let data = {};
  try {
    res = await api.fetchApi(folderListUrl(path));
    data = await res.json().catch(() => ({}));
  } catch (_) {
    return { ok: false, ...folderListError(0, null) };
  }
  if (!res.ok || data.ok === false) return { ok: false, ...folderListError(res.status, data) };
  return { ok: true, view: folderPickerView(data, lastUsed) };
}

/**
 * In-app folder picker (folders only, server filesystem). Address bar (type or paste a path; Enter / Go / paste
 * opens it), quick folders + drives on the left, subfolders on the right. Opens at `startValue` (or its nearest
 * existing parent, else the drive list).
 */
function openFolderPicker(startValue, onSelect) {
  closeFolderPicker();
  const lastUsed = loadLastLocation(localStorage);
  const wrap = document.createElement("div");
  wrap.className = "gg-modal-backdrop";
  wrap.innerHTML = `
    <div class="gg-modal gg-folder-picker" role="dialog" aria-label="Choose folder">
      <h3 class="gg-modal-title">Choose Folder</h3>
      <div class="gg-fp-bar">
        <button type="button" class="gg-btn gg-fp-up" title="Up one level">Up</button>
        <input type="text" class="gg-fp-addr" aria-label="Folder path" placeholder="Type or paste a folder path"
          spellcheck="false" autocomplete="off" />
        <button type="button" class="gg-btn gg-fp-go" title="Go to this path">Go</button>
      </div>
      <span class="gg-modal-hint gg-split-err gg-fp-err" aria-live="polite"></span>
      <div class="gg-fp-panes">
        <ul class="gg-fp-side" aria-label="Places"></ul>
        <ul class="gg-fp-list" role="listbox" aria-label="Folders" tabindex="0"></ul>
      </div>
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-fp-cancel">Cancel</button>
        <button type="button" class="gg-btn gg-primary gg-fp-select" disabled>Select</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  folderPickerEl = wrap;
  const listEl = wrap.querySelector(".gg-fp-list");
  const sideEl = wrap.querySelector(".gg-fp-side");
  const addrIn = wrap.querySelector(".gg-fp-addr");
  const upBtn = wrap.querySelector(".gg-fp-up");
  const selBtn = wrap.querySelector(".gg-fp-select");
  const errEl = wrap.querySelector(".gg-fp-err");
  let view = null;
  let sel = -1;
  let seq = 0;
  const syncButtons = () => {
    upBtn.disabled = !view?.canUp;
    selBtn.disabled = !folderPickTarget(view, sel);
  };
  const paint = () => {
    addrIn.value = view?.path || "";
    addrIn.title = view?.path || "";
    const place = (p, cls) => `<li class="gg-fp-place ${cls}" data-path="${esc(p.path)}" title="${esc(p.path)}">${esc(p.name)}</li>`;
    sideEl.innerHTML = !view
      ? ""
      : [
        ...view.quick.map((p) => place(p, "gg-fp-quick")),
        view.drives.length ? `<li class="gg-fp-side-head">Drives</li>` : "",
        ...view.drives.map((p) => place(p, "gg-fp-drive")),
      ].join("");
    listEl.innerHTML = !view
      ? ""
      : view.items.length
        ? view.items.map((it, i) => `<li role="option" class="gg-fp-item" data-i="${i}" title="${esc(it.path)}">${esc(it.name)}</li>`).join("")
        : `<li class="gg-fp-empty">No folders</li>`;
    listEl.scrollTop = 0;
    syncButtons();
  };
  const markSel = (i) => {
    sel = i;
    for (const li of listEl.querySelectorAll(".gg-fp-item")) {
      const on = Number(li.dataset.i) === i;
      li.classList.toggle("gg-active", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
    }
    syncButtons();
  };
  const load = async (paths) => {
    const my = ++seq;
    errEl.textContent = "";
    let fail = null;
    for (const p of paths) {
      const r = await fetchFolderList(p, lastUsed);
      if (my !== seq || !wrap.isConnected) return;
      if (r.ok) {
        view = r.view;
        sel = -1;
        paint();
        return;
      }
      fail = r;
      if (r.routeMissing) break;
    }
    errEl.textContent = fail?.message || "";
    syncButtons();
  };
  const go = () => {
    const t = folderAddressTarget(addrIn.value);
    if (t.error) {
      errEl.textContent = t.error;
      return;
    }
    void load([t.path]);
  };
  addrIn.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    go();
  });
  addrIn.addEventListener("input", (e) => {
    errEl.textContent = "";
    if (e.inputType === "insertFromPaste") go();
  });
  let selectOnUp = false;
  addrIn.addEventListener("mousedown", () => { selectOnUp = document.activeElement !== addrIn; });
  addrIn.addEventListener("mouseup", (e) => {
    if (selectOnUp) e.preventDefault();
    selectOnUp = false;
  });
  addrIn.addEventListener("focus", () => addrIn.select());
  wrap.querySelector(".gg-fp-go").addEventListener("click", go);
  sideEl.addEventListener("click", (e) => {
    const li = e.target.closest?.(".gg-fp-place");
    if (li) void load([li.dataset.path]);
  });
  listEl.addEventListener("click", (e) => {
    const li = e.target.closest?.(".gg-fp-item");
    if (li) markSel(Number(li.dataset.i));
  });
  listEl.addEventListener("dblclick", (e) => {
    const li = e.target.closest?.(".gg-fp-item");
    const it = li && view?.items[Number(li.dataset.i)];
    if (it) void load([it.path]);
  });
  upBtn.addEventListener("click", () => { if (view?.canUp) void load([view.parent]); });
  wrap.querySelector(".gg-fp-cancel").addEventListener("click", closeFolderPicker);
  selBtn.addEventListener("click", () => {
    const target = folderPickTarget(view, sel);
    if (!target) return;
    closeFolderPicker();
    onSelect(target);
  });
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) closeFolderPicker(); });
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    closeFolderPicker();
  });
  syncButtons();
  listEl.focus();
  void load(startPathCandidates(startValue));
}

function openProjectSettingsModal() {
  if (!state.pid) return;
  closeProjectModal();
  const nat = isNativeProject();
  const curSettings = normalizeProjectSettings(state.timeline?.project?.settings);
  const wrap = document.createElement("div");
  wrap.className = "gg-modal-backdrop";
  wrap.innerHTML = `
    <form class="gg-modal gg-proj-settings-modal" role="dialog" aria-label="Project settings">
      <h3 class="gg-modal-title">Project Settings</h3>
      ${nat ? `<label class="gg-modal-field">Output folder
        <span class="gg-folder-row">
          <input type="text" class="gg-modal-folder" maxlength="260" spellcheck="false" autocomplete="off" placeholder="e.g. D:\\Films\\My Film" />
          <button type="button" class="gg-btn gg-modal-folder-browse">Browse…</button>
        </span>
        <span class="gg-modal-hint">Generated outputs are saved in its assets folder. Empty = default: the plugin's own projects folder (custom_nodes/comfyui-gonggan-cut/projects).</span>
        <span class="gg-modal-hint gg-split-err gg-modal-folder-err" aria-live="polite"></span>
      </label>` : ""}
      ${templateFieldHtml()}
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-modal-cancel">${nat ? "Cancel" : "Close"}</button>
        ${nat ? `<button type="submit" class="gg-btn gg-primary">Save</button>` : ""}
      </div>
    </form>`;
  document.body.appendChild(wrap);
  projectModalEl = wrap;
  const form = wrap.querySelector("form");
  wireProjectTemplateField(wrap);
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) closeProjectModal(); });
  wrap.querySelector(".gg-modal-cancel")?.addEventListener("click", closeProjectModal);
  const folderIn = wrap.querySelector(".gg-modal-folder");
  if (!nat || !folderIn) {
    form.addEventListener("submit", (e) => e.preventDefault());
    wrap.querySelector(".gg-tpl-combo")?.focus();
    return;
  }
  const folderErr = wrap.querySelector(".gg-modal-folder-err");
  const saveBtn = wrap.querySelector("button[type=submit]");
  const showFolderErr = (msg) => {
    if (folderErr) folderErr.textContent = msg;
    folderIn.focus();
  };
  folderIn.value = curSettings.project_folder;
  folderIn.addEventListener("input", () => { if (folderErr) folderErr.textContent = ""; });
  wrap.querySelector(".gg-modal-folder-browse")?.addEventListener("click", () => {
    openFolderPicker(folderIn.value, (path) => {
      if (!wrap.isConnected) return;
      folderIn.value = path;
      folderIn.dispatchEvent(new Event("input", { bubbles: true }));
      folderIn.focus();
    });
  });
  let saving = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saving) return;
    const patch = projectSettingsModalPatch(curSettings, folderIn.value);
    if (!patch) {
      closeProjectModal();
      return;
    }
    const reqPid = state.pid;
    saving = true;
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (patch.project_folder) {
        try {
          await postJson("/gonggan/folder/check", { path: patch.project_folder });
        } catch (err) {
          showFolderErr(folderCheckErrorText(err));
          return;
        }
      }
      const data = await postJson("/gonggan/project/update", { pid: reqPid, fields: { settings: patch } });
      closeProjectModal();
      if (data.timeline) adoptMutationTimeline(data.timeline, reqPid);
      if (data.projects) state.projects = data.projects;
      await loadProjects();
      bus.dispatchEvent(new Event("projects"));
      bus.dispatchEvent(new Event("timeline"));
      paintProjectSummary(null);
      ggToast("Project", "Settings saved", "ok");
    } catch (err) {
      ggToast("Project", err.message, "warn");
    } finally {
      saving = false;
      if (saveBtn && wrap.isConnected) saveBtn.disabled = false;
    }
  });
  folderIn.focus();
}

let refsModalEl = null;
const refsUi = { cat: "All" };

function closeReferencesModal() {
  if (refsModalEl) {
    refsModalEl.remove();
    refsModalEl = null;
  }
}

function referenceCardHtml(r) {
  const img = r.media
    ? `<img src="${esc(posterUrl(r.media.id))}" loading="lazy" alt="" />`
    : `<span class="gg-ref-empty">No image yet</span>`;
  return `
    <div class="gg-ref" data-ref-id="${esc(r.id)}">
      <div class="gg-ref-thumb">${img}</div>
      <div class="gg-ref-name" title="${esc(r.name)}">${esc(r.name)}</div>
      <div class="gg-ref-cat">${esc(r.category)}</div>
      <div class="gg-ref-actions">
        <button type="button" class="gg-btn gg-ref-gen" title="Open this reference's workflow in a ComfyUI tab. Run it, then click Add last output.">Generate</button>
        <button type="button" class="gg-btn gg-ref-add" title="Use ComfyUI's last output as this reference's image">Add last output</button>
        <button type="button" class="gg-btn gg-ref-rename">Rename</button>
        <button type="button" class="gg-btn gg-ref-del">Delete</button>
      </div>
    </div>`;
}

function paintReferencesModal() {
  const wrap = refsModalEl;
  if (!wrap) return;
  const all = (state.timeline && state.timeline.references) || [];
  const cats = ["All", ...REFERENCE_CATEGORIES];
  if (!cats.includes(refsUi.cat)) refsUi.cat = "All";
  wrap.querySelector(".gg-refs-chips").innerHTML = cats
    .map((c) => {
      const n = c === "All" ? all.length : all.filter((r) => r.category === c).length;
      return `<button type="button" class="gg-ref-chip${c === refsUi.cat ? " gg-on" : ""}" data-cat="${esc(c)}">${esc(c)} ${n}</button>`;
    })
    .join("");
  const shown = refsUi.cat === "All" ? all : all.filter((r) => r.category === refsUi.cat);
  const list = wrap.querySelector(".gg-refs-list");
  list.innerHTML = shown.length
    ? shown.map(referenceCardHtml).join("")
    : `<div class="gg-refs-none">${all.length ? "Nothing in this category." : "No references yet. Add a character, place or prop below."}</div>`;
  const sel = wrap.querySelector(".gg-refs-cat");
  if (sel && refsUi.cat !== "All" && sel.dataset.touched !== "1") sel.value = refsUi.cat;
}

function referenceErrorText(err, what) {
  return err && (err.status === 404 || err.status === 405) ? `Restart ComfyUI to enable ${what}.` : err.message;
}

async function openReferenceWorkflow(refId) {
  const ref = cutById(refId);
  if (!ref) return;
  closeReferencesModal();
  clearTimeout(wfLoadDebounce);
  wfLoadDebounce = 0;
  wfLastLoadedCutId = "";
  wfLastLoadedProjectId = "";
  const loadToken = ++wfLoadToken;
  ggCutLoadsInFlight++;
  try {
    await scheduleLoadCutWorkflow(refId, ref, loadToken);
  } finally {
    ggCutLoadsInFlight--;
  }
}

async function addLastOutputToReference(refId) {
  const ref = cutById(refId);
  try {
    await postJson("/gonggan/send-output", { pid: state.pid, cut_id: refId });
    await loadTimeline();
    paintReferencesModal();
    ggToast("Reference", `Added the last output to ${ref?.name || "the reference"}`, "ok");
  } catch (err) {
    ggToast("Reference", err.message, "warn");
  }
}

async function renameReference(refId) {
  const ref = cutById(refId);
  if (!ref) return;
  const name = await askText({ title: "Rename reference", label: "Name", value: ref.name, okLabel: "Rename", maxLength: 80 });
  const clean = name == null ? "" : normalizeNameInput(name, 80).value;
  if (!clean || clean === ref.name) return;
  try {
    await postJson("/gonggan/cut/rename", { pid: state.pid, cut_id: refId, name: clean });
    await loadTimeline();
    paintReferencesModal();
  } catch (err) {
    ggToast("Reference", referenceErrorText(err, "renaming"), "warn");
  }
}

async function deleteReference(refId) {
  const ref = cutById(refId);
  if (!ref) return;
  if (!(await askConfirm({ message: `Delete reference "${ref.name}"?`, danger: true }))) return;
  try {
    await postJson("/gonggan/cut/delete", { pid: state.pid, cuts: [refId] });
    await loadTimeline();
    paintReferencesModal();
  } catch (err) {
    ggToast("Reference", err.message, "warn");
  }
}

function openReferencesModal() {
  if (!isNativeProject() || !state.pid) return;
  closeProjectModal();
  closeReferencesModal();
  const wrap = document.createElement("div");
  wrap.className = "gg-modal-backdrop";
  wrap.innerHTML = `
    <div class="gg-modal gg-refs" role="dialog" aria-label="References">
      <h3 class="gg-modal-title">References</h3>
      <div class="gg-refs-chips"></div>
      <div class="gg-refs-list"></div>
      <form class="gg-refs-form">
        <input type="text" class="gg-refs-name" maxlength="80" placeholder="New reference name" autocomplete="off" />
        <select class="gg-refs-cat">${REFERENCE_CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>
        <button type="submit" class="gg-btn gg-primary">+ New</button>
      </form>
      <div class="gg-refs-hint">Generate opens the workflow in a ComfyUI tab. Run it, then come back and click Add last output.</div>
      <div class="gg-modal-actions"><button type="button" class="gg-btn gg-refs-close">Close</button></div>
    </div>`;
  document.body.appendChild(wrap);
  refsModalEl = wrap;
  paintReferencesModal();
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) closeReferencesModal(); });
  wrap.querySelector(".gg-refs-close").addEventListener("click", closeReferencesModal);
  wrap.querySelector(".gg-refs-cat").addEventListener("change", (e) => { e.target.dataset.touched = "1"; });
  wrap.addEventListener("click", (e) => {
    const chip = e.target.closest(".gg-ref-chip");
    if (chip) {
      refsUi.cat = chip.dataset.cat;
      const sel = wrap.querySelector(".gg-refs-cat");
      if (sel) sel.dataset.touched = "";
      paintReferencesModal();
      return;
    }
    const card = e.target.closest(".gg-ref");
    const id = card?.dataset.refId;
    if (!id) return;
    if (e.target.closest(".gg-ref-gen")) openReferenceWorkflow(id);
    else if (e.target.closest(".gg-ref-add")) addLastOutputToReference(id);
    else if (e.target.closest(".gg-ref-rename")) renameReference(id);
    else if (e.target.closest(".gg-ref-del")) deleteReference(id);
  });
  wrap.querySelector(".gg-refs-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameIn = wrap.querySelector(".gg-refs-name");
    const name = normalizeNameInput(nameIn.value, 80).value;
    if (!name) return;
    const category = wrap.querySelector(".gg-refs-cat").value;
    try {
      await postJson("/gonggan/reference/add", { pid: state.pid, name, category });
      nameIn.value = "";
      await loadTimeline();
      paintReferencesModal();
    } catch (err) {
      ggToast("Reference", referenceErrorText(err, "References"), "warn");
    }
  });
  wrap.querySelector(".gg-refs-name").focus();
}
let askTextEl = null;

/**
 * @param {{ title: string, label?: string, value?: string, okLabel?: string, maxLength?: number }} opts
 * @returns {Promise<string|null>}
 */
function askText(opts) {
  if (askTextEl) return Promise.resolve(null);
  const title = String(opts?.title ?? "Name");
  const label = String(opts?.label ?? "Name");
  const initial = String(opts?.value ?? "");
  const okLabel = String(opts?.okLabel ?? "OK");
  const maxLength = Number(opts?.maxLength) > 0 ? Math.floor(Number(opts.maxLength)) : SCENE_NAME_MAX_LEN;

  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "gg-modal-backdrop gg-ask-backdrop";
    wrap.innerHTML = `
      <form class="gg-modal gg-ask-dialog" role="dialog" aria-label="${esc(title)}">
        <h3 class="gg-modal-title">${esc(title)}</h3>
        <label class="gg-modal-field">${esc(label)}
          <input type="text" class="gg-ask-input" maxlength="${maxLength}" autocomplete="off" />
        </label>
        <div class="gg-modal-actions">
          <button type="button" class="gg-btn gg-ask-cancel">Cancel</button>
          <button type="submit" class="gg-btn gg-primary gg-ask-ok">${esc(okLabel)}</button>
        </div>
      </form>`;
    document.body.appendChild(wrap);
    askTextEl = wrap;

    const form = wrap.querySelector("form");
    const input = wrap.querySelector(".gg-ask-input");
    const okBtn = wrap.querySelector(".gg-ask-ok");
    if (!form || !input || !okBtn) {
      wrap.remove();
      askTextEl = null;
      resolve(null);
      return;
    }
    input.value = initial;
    input.select();

    const syncOk = () => {
      const norm = normalizeNameInput(input.value, maxLength);
      okBtn.disabled = !norm.ok;
    };
    syncOk();
    input.addEventListener("input", syncOk);

    const finish = (value) => {
      if (!askTextEl) return;
      wrap.remove();
      askTextEl = null;
      resolve(value);
    };

    const trySubmit = () => {
      const norm = normalizeNameInput(input.value, maxLength);
      if (!norm.ok) {
        syncOk();
        input.focus();
        return;
      }
      finish(norm.value);
    };

    wrap.querySelector(".gg-ask-cancel")?.addEventListener("click", () => finish(null));
    wrap.addEventListener("mousedown", (e) => {
      if (e.target === wrap) finish(null);
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      trySubmit();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
        return;
      }
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        trySubmit();
      }
    });
    input.focus();
  });
}

let askConfirmEl = null;

/**
 * In-app replacement for window.confirm (same wording, OK / Cancel). Enter = OK, Esc = Cancel.
 * @param {{ message: string, danger?: boolean }} opts  danger: emphasize the OK button (deletes / reset)
 * @returns {Promise<boolean>}
 */
function askConfirm(opts) {
  if (askConfirmEl) return Promise.resolve(false);
  const { title, body } = splitConfirmMessage(opts?.message);
  const danger = !!opts?.danger;
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "gg-modal-backdrop gg-confirm-backdrop";
    wrap.innerHTML = `
      <div class="gg-modal gg-confirm-dialog" role="alertdialog" aria-label="${esc(title)}">
        <h3 class="gg-modal-title gg-confirm-title">${esc(title)}</h3>
        ${body ? `<div class="gg-confirm-body">${esc(body)}</div>` : ""}
        <div class="gg-modal-actions">
          <button type="button" class="gg-btn gg-confirm-cancel">Cancel</button>
          <button type="button" class="gg-btn gg-confirm-ok ${danger ? "gg-danger" : "gg-primary"}">OK</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    askConfirmEl = wrap;
    const okBtn = wrap.querySelector(".gg-confirm-ok");
    const cancelBtn = wrap.querySelector(".gg-confirm-cancel");
    const finish = (value) => {
      if (askConfirmEl !== wrap) return;
      document.removeEventListener("keydown", onKey, true);
      wrap.remove();
      askConfirmEl = null;
      resolve(value);
    };
    const onKey = (e) => {
      // Keep ComfyUI / Shots hotkeys (Delete, T, arrows ...) from firing behind the dialog.
      e.stopPropagation();
      const act = confirmKeyAction(e);
      if (act) e.preventDefault();
      if (act === "ok") finish(true);
      else if (act === "cancel") finish(false);
    };
    document.addEventListener("keydown", onKey, true);
    okBtn.addEventListener("click", () => finish(true));
    cancelBtn.addEventListener("click", () => finish(false));
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) finish(false); });
    okBtn.focus();
  });
}

async function renameNativeProject() {
  if (!isNativeProject()) return;
  const reqPid = state.pid;
  const cur = currentProject()?.name || state.timeline?.project?.name || "";
  const name = await askText({
    title: "Rename Project",
    label: "Name",
    value: cur,
    okLabel: "Rename",
    maxLength: PROJECT_NAME_MAX_LEN,
  });
  if (name === null || name === cur) return;
  try {
    await postJson("/gonggan/project/rename", { pid: reqPid, name });
    await loadProjects();
    ggToast("Project", `Renamed to "${name}"`, "ok");
  } catch (e) {
    ggToast("Project", e.message, "warn");
  }
}

async function deleteNativeProject() {
  if (!isNativeProject()) return;
  const p = currentProject();
  const label = p?.name || state.pid;
  if (!(await askConfirm({ message: `Delete project "${label}"? It will be moved to trash.`, danger: true }))) return;
  try {
    // Data safety: finish pending field saves and the shot auto-save before the project moves to trash.
    await flushPendingCutFields();
    await runGongganWipAutosave({ force: true });
    await postJson("/gonggan/project/delete", { pid: state.pid });
    state.pid = "";
    await loadProjects();
    ggToast("Project", `"${label}" moved to the plugin trash folder`, "ok");
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
    { label: "References…", disabled: !nat, title: nat ? "" : NATIVE_ONLY_TIP, action: () => openReferencesModal() },
    { label: "Project Settings…", disabled: !state.pid, action: () => openProjectSettingsModal() },
    { label: "Rename Project…", disabled: !nat, title: nat ? "" : NATIVE_ONLY_TIP, action: () => renameNativeProject() },
    { label: "Delete Project", danger: true, disabled: !nat, title: nat ? "" : NATIVE_ONLY_TIP, action: () => deleteNativeProject() },
  ]);
}

const GG_LEGACY_SHOT_WF_FILE = "gonggan-shot.json";
const GG_LEGACY_SHOT_WF_PATH = "workflows/gonggan-shot.json";
const WF_LOAD_DEBOUNCE_MS = 0;
let ggCutLoadSeq = Promise.resolve();

/** Monotonic token; only selectCut bumps it to cancel stale debounced/in-flight loads. */
let wfLoadToken = 0;
let wfLoadDebounce = 0;
let ggCutLoadsInFlight = 0;
let wfLastLoadedCutId = "";
let wfLastLoadedProjectId = "";
let wfLastLoadedRepId = "";
/** Version whose workflow was explicitly opened from its thumbnail; cleared by any other cut load. */
let wfOpenVersion = null;
/** `${projectId}\n${cutId}` -> graph node count when that cut was last opened or left (empty-cut Regen). */
const ggCutGraphNodeCounts = new Map();
/** Last prompt the api.queuePrompt patch registered to a cut. */
let ggLastRegisteredPrompt = null;
/** ComfyWorkflow tab last opened by Gonggan shot load (never user workflows). */
let ggOwnedShotWorkflow = null;
/** Paths Gonggan created/renamed this session (lowercase) -> { projectId, cutId }. */
const ggOwnedWorkflowMeta = new Map();
let ggCutSwitchAutosaveBlocked = false;
const GG_WIP_AUTOSAVE_MIN_MS = 2000;
let ggWipLastAutosaveAt = 0;
let ggWipAutosaveRunning = false;
let ggWipLastFailToastAt = 0;
/** @type {string|null} */
let ggWorkflowBaselineCutId = null;
/** @type {Map<string, object>} */
let ggWorkflowBaselines = new Map();
/** @type {object|null} */
let ggWorkflowBaseline = null;

function ggEditedStorageMap() {
  return loadEditedMap(localStorage);
}

function cutShowsEditedMarker(cut) {
  if (!cut?.id) return false;
  return isCutEdited(ggEditedStorageMap(), cut.id, cutBaseKey(cut));
}

function displayCutName(c) {
  const base = c?.name || "(untitled)";
  return cutShowsEditedMarker(c) ? `${base} *` : base;
}

function markCutEditedInStorage(cut) {
  if (!cut?.id) return;
  const map = ggEditedStorageMap();
  map[cut.id] = cutBaseKey(cut);
  saveEditedMap(localStorage, map);
  bus.dispatchEvent(new Event("timeline"));
  scheduleTabLabelRefresh();
}

function rememberWorkflowBaselineForCut(cutId, workflowJson) {
  ggWorkflowBaselineCutId = cutId || null;
  ggWorkflowBaseline = workflowJson && typeof workflowJson === "object" ? workflowJson : null;
  if (cutId && ggWorkflowBaseline) ggWorkflowBaselines.set(cutId, ggWorkflowBaseline);
}

function captureGraphWorkflowSnapshot() {
  try {
    if (!app.graph || typeof app.graph.serialize !== "function") return null;
    return app.graph.serialize();
  } catch {
    return null;
  }
}

function captureWorkflowSnapshotForTab(wf) {
  const ws = ggWorkflowStore();
  if (wf && wf === ws?.activeWorkflow) {
    return captureGraphWorkflowSnapshot();
  }
  const st = wf?.changeTracker?.activeState ?? wf?.activeState;
  if (st && typeof st === "object" && Array.isArray(st.nodes)) return st;
  return null;
}

function rememberWorkflowBaselineFromActiveGraph(cutId) {
  const snap = captureGraphWorkflowSnapshot();
  if (snap) rememberWorkflowBaselineForCut(cutId, snap);
}

function autosaveContextForWorkflow(wf) {
  const resolved = resolveWorkflowCutForWip(wf);
  const cutId = resolved?.cutId || "";
  const baseline = cutId ? ggWorkflowBaselines.get(cutId) ?? null : ggWorkflowBaseline;
  const baselineCutId = baseline && cutId ? cutId : "";
  const ws = ggWorkflowStore();
  const onActive = wf && wf === ws?.activeWorkflow;
  const graphCutId = onActive ? app.graph?.extra?.gonggan?.cutId || "" : cutId;
  return {
    cutId,
    baselineCutId,
    baseline,
    currentSnapshot: captureWorkflowSnapshotForTab(wf),
    graphCutId,
  };
}

function reconcileModifiedAfterShotLoad(cutId) {
  rememberWorkflowBaselineFromActiveGraph(cutId);
}

function scheduleLoadCutWorkflow(cutId, cut, loadToken) {
  ggCutLoadSeq = ggCutLoadSeq
    .then(async () => {
      if (loadToken !== wfLoadToken) return;
      await loadCutWorkflow(cutId, cut, loadToken);
    })
    .catch((e) => console.warn("[gonggan] cut load failed", e));
  return ggCutLoadSeq;
}

function syncEditedMarkerBeforeSave(cutId, cutRec) {
  const cut = cutRec || cutById(cutId);
  if (!cut?.id || cutId !== ggWorkflowBaselineCutId) return;
  const baseline = ggWorkflowBaselines.get(cutId) ?? ggWorkflowBaseline;
  if (!baseline) return;
  const current = captureGraphWorkflowSnapshot();
  if (!current) return;
  // Only the graph that actually belongs to this cut counts (a graph mid-switch is empty or another cut's).
  if (!Array.isArray(current.nodes) || !current.nodes.length) return;
  if (app.graph?.extra?.gonggan?.cutId !== cutId) return;
  if (widgetValuesDiffer(baseline, current)) {
    markCutEditedInStorage(cut);
  }
}
let ggToastTimer = 0;
let trashCount = 0;
let trashRefreshTimer = 0;

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
  const p = normalizeWorkflowPath(relPath).replace(/^workflows\//, "").toLowerCase();
  return ggOwnedWorkflowMeta.has(p);
}

function markWorkflowGongganOwned(wf, storagePath, meta) {
  if (!wf) return;
  wf.ggGongganOwned = true;
  const p = normalizeWorkflowPath(storagePath || wf.path || "").replace(/^workflows\//, "");
  if (p) {
    const key = p.toLowerCase();
    wf.ggGongganOwnedPath = workflowPathKey(p);
    if (meta?.projectId && meta?.cutId) {
      const m = { projectId: String(meta.projectId), cutId: String(meta.cutId) };
      wf.ggGongganMeta = m;
      ggOwnedWorkflowMeta.set(key, m);
    } else if (!ggOwnedWorkflowMeta.has(key)) {
      ggOwnedWorkflowMeta.set(key, {});
    }
  }
}

function isGongganOwnedWorkflow(wf) {
  return isShotTabAtOwnedPath(wf, (key) => wf === ggOwnedShotWorkflow || isPathGongganOwned(key));
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
  if (ggOwnedShotWorkflow && !isGongganOwnedWorkflow(ggOwnedShotWorkflow)) releaseMovedShotTab(ggOwnedShotWorkflow);
  add(ggOwnedShotWorkflow);
  for (const w of ws.openWorkflows || []) {
    if (w?.ggGongganOwned && !isGongganOwnedWorkflow(w)) releaseMovedShotTab(w);
    else if (isLegacyGongganShotTab(w) || isGongganOwnedWorkflow(w)) add(w);
  }
  return out;
}

/** A shot tab that ComfyUI Save / Rename moved to another file is the user's workflow now. */
function releaseMovedShotTab(wf) {
  delete wf.ggGongganOwned;
  delete wf.ggGongganOwnedPath;
  delete wf.ggGongganMeta;
  delete wf.ggTabLabelCache;
  if (ggOwnedShotWorkflow === wf) ggOwnedShotWorkflow = null;
}

async function pruneExtraGongganShotTabs(keep) {
  for (const w of collectGongganShotTabs()) {
    if (!w || w === keep) continue;
    if (workflowTabNeedsAutosave(w, autosaveContextForWorkflow(w))) continue;
    await closeGongganOwnedTab(w);
  }
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
  bus.dispatchEvent(new Event("gg-opentab"));
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

function resolveWorkflowCutForWip(wf) {
  if (!wf || !isGongganOwnedWorkflow(wf)) return null;
  let cutId = wf.ggGongganMeta?.cutId;
  let projectId = wf.ggGongganMeta?.projectId;
  if (!cutId && wf.path) {
    const key = normalizeWorkflowPath(wf.path).replace(/^workflows\//, "").toLowerCase();
    const mapped = key ? ggOwnedWorkflowMeta.get(key) : null;
    cutId = mapped?.cutId;
    projectId = mapped?.projectId;
  }
  if (!cutId || !projectId || projectId !== state.pid) return null;
  const cut = cutById(cutId);
  return cut ? { cutId, cut } : null;
}

function applyWipStampForWorkflow(wf) {
  const ws = ggWorkflowStore();
  if (!ws || !wf || !app.graph) return;
  if (!workflowTabNeedsAutosave(wf, autosaveContextForWorkflow(wf))) return;
  const active = ws.activeWorkflow === wf || wf === ggOwnedShotWorkflow;
  if (!active) return;
  const resolved = resolveWorkflowCutForWip(wf);
  if (!resolved) return;
  app.graph.extra = stampWip(app.graph.extra || {}, {
    cutId: resolved.cutId,
    baseKey: cutBaseKey(resolved.cut),
  });
}

let ggWipAutosaveFailing = false;
function ggWipAutosaveBlockedNow() {
  if (ggCutSwitchAutosaveBlocked) return true;
  if (wfLoadDebounce || ggCutLoadsInFlight > 0) return true;
  if (ggWipAutosaveRunning) return true;
  return false;
}

async function runGongganWipAutosave(opts = {}) {
  const force = !!opts.force;
  if (ggWipAutosaveBlockedNow()) return;
  const ws = ggWorkflowStore();
  const wf = ggOwnedShotWorkflow;
  if (!ws || !wf || !(ws.openWorkflows || []).includes(wf)) return;
  if (!isGongganOwnedWorkflow(wf)) return;
  if (!workflowTabNeedsAutosave(wf, autosaveContextForWorkflow(wf))) return;
  if (!(ws.isActive?.(wf) ?? ws.activeWorkflow === wf)) return;
  const now = Date.now();
  if (!force && now - ggWipLastAutosaveAt < GG_WIP_AUTOSAVE_MIN_MS) return;

  ggWipAutosaveRunning = true;
  try {
    const resolved = resolveWorkflowCutForWip(wf);
    if (resolved) syncEditedMarkerBeforeSave(resolved.cutId, resolved.cut);
    applyWipStampForWorkflow(wf);
    const deps = buildAutosaveDeps();
    if (typeof deps.saveWorkflow !== "function") throw new Error("saveWorkflow unavailable");
    const savedSnap = captureWorkflowSnapshotForTab(wf);
    await autosaveWorkflow(wf, deps);
    // Saved content is the new baseline: a later switch must not re-stamp it with a newer version key.
    if (resolved?.cutId && savedSnap) ggWorkflowBaselines.set(resolved.cutId, savedSnap);
    ggWipLastAutosaveAt = Date.now();
    const okMsg = autosaveStatusMessage({ failing: false, wasFailing: ggWipAutosaveFailing, label: workflowLabel(wf) });
    ggWipAutosaveFailing = false;
    if (okMsg) {
      sdk.msg = okMsg;
      bus.dispatchEvent(new Event("sdk"));
    }
  } catch (e) {
    console.warn("[gonggan] periodic wip autosave failed", e);
    ggWipAutosaveFailing = true;
    sdk.msg = autosaveStatusMessage({ failing: true, error: e?.message || String(e), label: workflowLabel(wf) });
    bus.dispatchEvent(new Event("sdk"));
    if (Date.now() - ggWipLastFailToastAt >= 60000) {
      ggWipLastFailToastAt = Date.now();
      ggToast("Auto-save failed.", sentence(e?.message || String(e), "Retrying. Press Ctrl+S to save now."), "warn");
    }
  } finally {
    ggWipAutosaveRunning = false;
  }
}

function setupWipPeriodicAutosave() {
  setInterval(() => {
    runGongganWipAutosave().catch(() => {});
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingCutFields();
      flushTimelineEdit();
      runGongganWipAutosave({ force: true }).catch(() => {});
    }
  });
  window.addEventListener("pagehide", () => {
    flushPendingCutFields();
    flushTimelineEdit();
    runGongganWipAutosave({ force: true }).catch(() => {});
  });
}

async function fetchCutWorkingCopyJson(cut) {
  const rel = shotWorkflowRelPathForCut(cut);
  const storage = rel.startsWith("workflows/") ? rel : `workflows/${rel}`;
  const res = await api.fetchApi(`/userdata/${encodeURIComponent(storage)}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function tryRestoreCutWorkingCopy(cutId, cutRec, loadToken) {
  const cut = cutRec || cutById(cutId);
  if (!cut || !cutId) return false;
  try {
    const json = await fetchCutWorkingCopyJson(cut);
    if (loadToken !== undefined && loadToken !== wfLoadToken) return false;
    if (!json || !shouldRestoreWip(json, { cutId, baseKey: cutBaseKey(cut) })) return false;
    const loaded = await loadWorkflowIntoDedicatedTab(json, cut, loadToken);
    if (loadToken !== undefined && loadToken !== wfLoadToken) return false;
    if (ggCutSwitchAutosaveBlocked) return false;
    if (!loaded) return false;
    markWorkflowLoadComplete(cutId, cut);
    markGraphGongganCut(cutId);
    reconcileModifiedAfterShotLoad(cutId);
    sdk.msg = `Canvas: ${shotTitle(cut)} (restored edits)`;
    bus.dispatchEvent(new Event("sdk"));
    bus.dispatchEvent(new Event("gg-opentab"));
    ggToast("Restored your unsaved edits", shotTitle(cut), "info");
    return true;
  } catch (e) {
    console.warn("[gonggan] working copy restore failed", e);
    return false;
  }
}

async function prepareGongganShotTabReplace() {
  const tabs = collectGongganShotTabs();
  const dirtyTabs = filterTabsNeedingAutosave(tabs, autosaveContextForWorkflow);
  if (dirtyTabs.length) {
    for (const w of dirtyTabs) {
      const resolved = resolveWorkflowCutForWip(w);
      if (resolved) syncEditedMarkerBeforeSave(resolved.cutId, resolved.cut);
    }
    for (const w of dirtyTabs) applyWipStampForWorkflow(w);
    const deps = buildAutosaveDeps();
    if (typeof deps.saveWorkflow !== "function") {
      ggCutSwitchAutosaveBlocked = true;
      ggToast("Auto-save failed. Switch cancelled.", "ComfyUI save is not ready. Press Ctrl+S, then switch again.", "warn");
      return false;
    }
    const savedSnaps = dirtyTabs.map((w) => ({
      cutId: resolveWorkflowCutForWip(w)?.cutId || "",
      snap: captureWorkflowSnapshotForTab(w),
    }));
    const result = await autosaveModifiedTabs(dirtyTabs, deps);
    if (!result.ok) {
      ggCutSwitchAutosaveBlocked = true;
      ggToast("Auto-save failed. Switch cancelled.", sentence(result.failed?.error || "Save failed", "Press Ctrl+S, then switch again."), "warn");
      return false;
    }
    // Saved content is the new baseline: such a tab is clean now and may be closed/replaced.
    for (const s of savedSnaps) if (s.cutId && s.snap) ggWorkflowBaselines.set(s.cutId, s.snap);
    for (const s of result.saved) {
      const detail = s.name || s.path.replace(/^.*\//, "") || "workflow";
      ggToast("Saved", detail, "ok");
    }
  }
  ensureWorkflowManagerActive();
  return true;
}

function shotWorkflowRelPathForCut(cut) {
  return shotWorkflowRelPathById({ projectId: state.pid, cutId: cut?.id || "" });
}

function adoptGongganShotWorkflow(relPath) {
  const ws = ggWorkflowStore();
  if (!ws) return null;
  const norm = normalizeWorkflowPath(String(relPath).replace(/^workflows\//, ""));
  const normKey = norm.toLowerCase();
  const active = ws.activeWorkflow;
  if (active) {
    const ap = normalizeWorkflowPath(String(active.path || "").replace(/^workflows\//, ""));
    if (ap.toLowerCase() === normKey) {
      ggOwnedShotWorkflow = active;
      return active;
    }
  }
  for (const p of [norm, `workflows/${norm}`]) {
    const w = ws.getWorkflowByPath?.(p);
    if (w) {
      ggOwnedShotWorkflow = w;
      return w;
    }
  }
  const found =
    (ws.openWorkflows || []).find((w) => {
      const wp = normalizeWorkflowPath(String(w.path || "").replace(/^workflows\//, ""));
      return wp.toLowerCase() === normKey;
    }) ?? null;
  ggOwnedShotWorkflow = found;
  return found;
}

async function resolveShotWorkflowStoragePath(relPath, opts = {}) {
  const desired = normalizeWorkflowPath(String(relPath).replace(/^workflows\//, ""));
  if (opts.idBased) return desired;
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
  if (!ws || !wf || !isGongganOwnedWorkflow(wf)) return false;
  if (!(ws.openWorkflows || []).includes(wf)) return false;
  return ws.isActive?.(wf) ?? false;
}

function shouldSkipWorkflowReload(cutId) {
  try {
    const g = app.graph?.extra?.gonggan;
    return shouldSkipShotWorkflowReload({
      cutId,
      projectId: state.pid,
      lastCutId: wfLastLoadedCutId,
      lastProjectId: wfLastLoadedProjectId,
      graphExtra: g,
      tabActive: isGongganShotTabOpenAndActive(),
    });
  } catch {
    return false;
  }
}

function isUiWorkflowGraph(wf) {
  return wf && Array.isArray(wf.nodes);
}

let ggTabLabelTimer = 0;
let ggTabLabelApplying = false;
let ggTabLabelObserver = null;
let ggTabLabelObservedEl = null;

function resolveShotTabLabel(wf) {
  if (!wf || !isGongganOwnedWorkflow(wf)) return null;
  let meta = wf.ggGongganMeta;
  if (!meta?.projectId || !meta?.cutId) {
    const p = normalizeWorkflowPath(wf.path || "").replace(/^workflows\//, "");
    const key = p.toLowerCase();
    const mapped = key ? ggOwnedWorkflowMeta.get(key) : null;
    if (mapped?.projectId && mapped?.cutId) meta = mapped;
  }
  if (!meta?.projectId || !meta?.cutId) return wf.ggTabLabelCache || null;

  const projectName = state.projects.find((p) => p.id === meta.projectId)?.name;
  if (!projectName) return wf.ggTabLabelCache || null;
  if (meta.projectId !== state.pid || !state.timeline) return wf.ggTabLabelCache || null;

  const c = cutById(meta.cutId);
  if (!c) return wf.ggTabLabelCache || null;
  const label = formatShotTabLabel({
    projectName,
    ...shotTabCutParts(c, state.timeline),
    edited: cutShowsEditedMarker(c),
  });
  if (label) wf.ggTabLabelCache = label;
  return label;
}

function resolveShotTabTitle(wf) {
  if (!wf || !isGongganOwnedWorkflow(wf)) return null;
  let meta = wf.ggGongganMeta;
  if (!meta?.projectId || !meta?.cutId) {
    const p = normalizeWorkflowPath(wf.path || "").replace(/^workflows\//, "");
    const key = p.toLowerCase();
    const mapped = key ? ggOwnedWorkflowMeta.get(key) : null;
    if (mapped?.projectId && mapped?.cutId) meta = mapped;
  }
  if (!meta?.projectId || !meta?.cutId) return null;

  const projectName = state.projects.find((p) => p.id === meta.projectId)?.name;
  if (!projectName) return null;
  if (meta.projectId !== state.pid || !state.timeline) return null;

  const c = cutById(meta.cutId);
  if (!c) return null;
  return formatShotTabTitle({
    projectName,
    ...shotTabCutParts(c, state.timeline),
    cutName: c.name,
  });
}

function applyTabLabels() {
  if (ggTabLabelApplying) return;
  try {
    const ws = ggWorkflowStore();
    const open = ws?.openWorkflows || [];
    const workflows = open.map((wf) => ({
      filename: workflowBasename(wf) || wf.filename || "",
      label: resolveShotTabLabel(wf),
    }));
    const tabEls = [...document.querySelectorAll('[data-testid="workflow-tab"]')];
    const tabs = tabEls.map((el) => {
      const span = el.querySelector(".workflow-label");
      const rawText = span?.textContent ?? "";
      const rawOrig = span?.dataset?.ggOrig ?? "";
      const rawSet = span?.dataset?.ggSet ?? "";
      const norm = normalizeTabDescriptor({ text: rawText, orig: rawOrig, set: rawSet });
      if (span && rawOrig && norm.orig === "") {
        delete span.dataset.ggOrig;
        delete span.dataset.ggSet;
      }
      return {
        span,
        text: norm.text,
        orig: norm.orig,
      };
    });
    const plan = planTabLabels({
      tabs: tabs.map((t) => ({ text: t.text, orig: t.orig })),
      workflows,
    });
    ggTabLabelApplying = true;
    for (const act of plan) {
      if (act.action === "none") continue;
      const row = tabs[act.index];
      const span = row?.span;
      const tabEl = tabEls[act.index];
      if (!span) continue;
      if (act.action === "set") {
        const stillOurLabel =
          span.dataset.ggSet && span.textContent === span.dataset.ggSet;
        if (!stillOurLabel || !span.dataset.ggOrig) span.dataset.ggOrig = row.text;
        span.dataset.ggSet = act.text;
        if (span.textContent !== act.text) span.textContent = act.text;
        const tip = resolveShotTabTitle(open[act.index]);
        if (tabEl) {
          if (tip) { if (tabEl.title !== tip) tabEl.title = tip; }
          else tabEl.removeAttribute("title");
        }
      } else if (act.action === "restore") {
        if (span.textContent !== act.text) span.textContent = act.text;
        delete span.dataset.ggOrig;
        delete span.dataset.ggSet;
        tabEl?.removeAttribute("title");
      }
    }
  } catch (e) {
    console.warn("[gonggan] tab label apply failed", e);
    try {
      document.querySelectorAll(".workflow-label[data-gg-orig]").forEach((span) => {
        span.textContent = span.dataset.ggOrig;
        delete span.dataset.ggOrig;
        delete span.dataset.ggSet;
      });
    } catch (_) {}
  } finally {
    ggTabLabelApplying = false;
    try {
      ggTabLabelObserver?.takeRecords();
    } catch (_) {}
  }
}

function scheduleTabLabelRefresh() {
  clearTimeout(ggTabLabelTimer);
  ggTabLabelTimer = setTimeout(() => applyTabLabels(), 80);
}

function findWorkflowTabContainer() {
  const tab = document.querySelector('[data-testid="workflow-tab"]');
  return tab?.parentElement || document.body;
}

function ensureTabLabelObserver() {
  const container = findWorkflowTabContainer();
  if (ggTabLabelObservedEl === container && ggTabLabelObserver) return;
  try {
    ggTabLabelObserver?.disconnect();
  } catch (_) {}
  ggTabLabelObservedEl = container;
  ggTabLabelObserver = new MutationObserver(() => {
    if (ggTabLabelApplying) return;
    scheduleTabLabelRefresh();
  });
  ggTabLabelObserver.observe(container, { childList: true, subtree: true, characterData: true });
}

function setupTabLabels() {
  ensureTabLabelObserver();
  applyTabLabels();
  setInterval(() => {
    ensureTabLabelObserver();
    applyTabLabels();
  }, 1000);
  for (const ev of ["select", "gg-opentab", "projects", "timeline"]) {
    bus.addEventListener(ev, () => scheduleTabLabelRefresh());
  }
}

function isLoadTokenStale(loadToken) {
  return loadToken !== undefined && loadToken !== wfLoadToken;
}

async function loadWorkflowIntoDedicatedTab(workflow, cut, loadToken) {
  const relPath = shotWorkflowRelPathForCut(cut);
  const storagePath = await resolveShotWorkflowStoragePath(relPath, { idBased: true });
  if (isLoadTokenStale(loadToken)) return false;
  const loadName = storagePath.replace(/^workflows\//, "");
  const shotMeta = { projectId: state.pid, cutId: cut?.id || "" };
  noteLeavingCutGraphNodeCount();
  if (!(await prepareGongganShotTabReplace())) return false;
  if (isLoadTokenStale(loadToken)) return false;
  const previous = ggOwnedShotWorkflow;
  const ws = ggWorkflowStore();
  adoptGongganShotWorkflow(loadName);
  // The tab object, not the path: ComfyUI reuses a same-path tab for a path string only while it is active.
  const existingAtPath = findWorkflowAtShotPath(ws, loadName);
  ensureWorkflowManagerActive();
  if (isLoadTokenStale(loadToken)) return false;
  const tabCountBefore = (ws?.openWorkflows || []).length;
  try {
    if (isUiWorkflowGraph(workflow)) {
      if (typeof app.loadGraphData !== "function") return false;
      await app.loadGraphData(workflow, true, true, existingAtPath || loadName, { deferWarnings: true });
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
  if (isLoadTokenStale(loadToken)) {
    adoptGongganShotWorkflow(loadName);
    const orphan = ggOwnedShotWorkflow;
    const openAfter = ws?.openWorkflows || [];
    if (orphan && orphan !== previous && openAfter.includes(orphan)) {
      await closeGongganOwnedTab(orphan);
    } else if ((openAfter.length || 0) > tabCountBefore) {
      const extra = openAfter[openAfter.length - 1];
      if (extra && extra !== previous && isGongganOwnedWorkflow(extra)) {
        await closeGongganOwnedTab(extra);
      }
    }
    return false;
  }
  adoptGongganShotWorkflow(loadName);
  markWorkflowGongganOwned(ggOwnedShotWorkflow, storagePath, shotMeta);
  try {
    const open = ws?.openWorkflows || [];
    const newTab = ggOwnedShotWorkflow;
    if (previous && previous !== newTab && open.includes(previous) && isGongganOwnedWorkflow(previous)) {
      let prevDirty = workflowTabNeedsAutosave(previous, autosaveContextForWorkflow(previous));
      if (prevDirty) {
        const deps = buildAutosaveDeps();
        if (typeof deps.saveWorkflow === "function") {
          try {
            if (typeof ws.setActiveWorkflow === "function") ws.setActiveWorkflow(previous);
            const resolved = resolveWorkflowCutForWip(previous);
            if (resolved) syncEditedMarkerBeforeSave(resolved.cutId, resolved.cut);
            applyWipStampForWorkflow(previous);
            const result = await autosaveModifiedTabs([previous], deps);
            if (result.ok) {
              prevDirty = false;
              for (const s of result.saved) {
                const detail = s.name || s.path.replace(/^.*\//, "") || "workflow";
                ggToast("Saved", detail, "ok");
              }
            }
          } catch (e) {
            console.warn("[gonggan] save previous shot tab failed", e);
          }
        }
      }
      if (prevDirty) {
        ggToast("Previous shot tab kept open.", "It has unsaved changes. Save it (Ctrl+S) or close it.", "warn");
      } else {
        const active = ws?.isActive?.(previous) ?? ws?.activeWorkflow === previous;
        const decision = shouldClosePreviousShotTab({
          previousOpen: true,
          previousOwned: true,
          previousIsNew: false,
          previousActive: !!active,
          previousModified: false,
          loadOk: true,
        });
        if (decision.close) await closeGongganOwnedTab(previous);
      }
    }
  } catch (e) {
    console.warn("[gonggan] close previous shot tab failed", e);
  }
  scheduleTabLabelRefresh();
  scheduleLoadImageScan({ debounceMs: 200 });
  if (cut?.id) reconcileModifiedAfterShotLoad(cut.id);
  if (isLoadTokenStale(loadToken)) return false;
  await pruneExtraGongganShotTabs(ggOwnedShotWorkflow);
  return true;
}

async function loadShotApiIntoDedicatedTab(apiJson, cut) {
  return loadWorkflowIntoDedicatedTab(apiJson, cut);
}

function ggToast(summary, detail, kind = "info", opts = null) {
  let host = document.getElementById("gg-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "gg-toast-host";
    host.className = "gg-toast-host";
    document.body.appendChild(host);
  }
  clearTimeout(ggToastTimer);
  const actionLabel = opts && opts.actionLabel;
  const onAction = opts && opts.onAction;
  const hasAction = actionLabel && typeof onAction === "function";
  const ttl = hasAction ? (opts.ttlMs ?? 10000) : (opts?.ttlMs ?? 4500);
  const actionBtn = hasAction
    ? `<button type="button" class="gg-toast-action">${esc(actionLabel)}</button>`
    : "";
  host.innerHTML = `<div class="gg-toast gg-toast-${kind}"><span class="gg-toast-sum">${esc(summary)}</span><span class="gg-toast-detail">${esc(detail)}</span>${actionBtn}</div>`;
  host.hidden = false;
  if (hasAction) {
    host.querySelector(".gg-toast-action")?.addEventListener("click", () => {
      clearTimeout(ggToastTimer);
      host.hidden = true;
      onAction();
    });
  }
  ggToastTimer = setTimeout(() => { host.hidden = true; }, ttl);
}

function cutById(cutId) {
  const tl = state.timeline;
  if (!tl) return null;
  return tl.cuts.find((c) => c.id === cutId) || (tl.references || []).find((c) => c.id === cutId) || null;
}

function shotTitle(c) {
  if (!c) return "";
  if (c.kind === "reference") return `Reference: ${c.name || "(untitled)"}`;
  return `${(c.pos ?? c.index) + 1}. ${c.name || "(untitled)"}`;
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

function userWorkflowKindSwitch(cutId) {
  const fromUi =
    shotsUi.cutWfKindCutId === cutId && shotsUi.cutWfKind ? shotsUi.cutWfKind : null;
  return readCutWorkflowKindSwitch(localStorage, cutId) || fromUi || null;
}

function workflowKindForCut(cut) {
  if (!cut) return null;
  return resolveEffectiveWorkflowKind({
    userKind: userWorkflowKindSwitch(cut.id),
    repKind: repMediaKind(cut),
  });
}

function markWorkflowLoadComplete(cutId, cutRec, openedVid) {
  wfLastLoadedCutId = cutId;
  wfLastLoadedProjectId = state.pid;
  wfLastLoadedRepId = repIdOf(cutRec || cutById(cutId));
  wfOpenVersion = openedVid ? { projectId: state.pid, cutId, vid: openedVid } : null;
  ggCutGraphNodeCounts.set(`${state.pid}\n${cutId}`, activeGraphNodeCount());
}

function activeGraphNodeCount() {
  const g = app.graph;
  return (g?._nodes || g?.nodes || []).length;
}

/** Live node count when the cut's graph is the active shot tab, else null. */
function liveCutGraphNodeCount(cutId) {
  const g = app.graph?.extra?.gonggan;
  if (!cutId || g?.cutId !== cutId || wfLastLoadedCutId !== cutId || wfLastLoadedProjectId !== state.pid) return null;
  if (!isGongganShotTabOpenAndActive()) return null;
  return activeGraphNodeCount();
}

/** Remember the node count of the cut graph about to be replaced (it may have been edited since it opened). */
function noteLeavingCutGraphNodeCount() {
  const n = liveCutGraphNodeCount(wfLastLoadedCutId);
  if (n !== null) ggCutGraphNodeCounts.set(`${state.pid}\n${wfLastLoadedCutId}`, n);
}

function regenEmptyCut(cutId) {
  const c = cutById(cutId);
  const nodeCount = regenKnownNodeCount({
    live: liveCutGraphNodeCount(cutId),
    remembered: ggCutGraphNodeCounts.get(`${state.pid}\n${cutId}`),
  });
  return isRegenEmptyCut({ versionCount: (c?.versions_list || []).length || c?.versions || 0, nodeCount });
}

async function reloadOpenCutWorkflowIfRepChanged() {
  const cutId = wfLastLoadedCutId;
  if (!cutId || !state.pid || wfLastLoadedProjectId !== state.pid) return;
  if (!isGongganShotTabOpenAndActive()) return;
  const cut = cutById(cutId);
  if (!cut) return;
  const rep = repIdOf(cut);
  if (rep === wfLastLoadedRepId) return;
  const loadToken = ++wfLoadToken;
  await loadCutWorkflow(cutId, cut, loadToken);
}

async function fetchCutSourceWorkflowPayload(cutId, cutRec) {
  const tl = state.timeline;
  const cut = cutRec || cutById(cutId);
  const effectiveKind = workflowKindForCut(cut);
  let q = `/gonggan/cut-source-workflow?pid=${encodeURIComponent(tl.project.id)}&cut=${encodeURIComponent(cutId)}`;
  if (effectiveKind) q += `&kind=${encodeURIComponent(effectiveKind)}`;
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
    if (isEmptyCutSourcePayload(data)) return data;
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
      const c = cutById(cutId);
      const data = await fetchCutSourceWorkflowPayload(cutId, c);
      if (isEmptyCutSourcePayload(data)) {
        const err = new Error("empty cut");
        err.ggEmptyCut = true;
        throw err;
      }
      const title = shotTitle(c);
      const src = data.source || "stored";
      const label = SOURCE_TOAST[src] || src;
      const detail = workflowSourceToastDetail(label, data.fallback);
      return {
        workflow: data.workflow,
        sdkMsg: `Canvas: ${title} (${detail})`,
        toastKind: "ok",
        toastDetail: detail,
        toastSummary: src === "template" ? "template" : src === "draft" ? "draft" : "stored",
      };
    },
  },
  ...LEGACY_CUT_WORKFLOW_SOURCES,
];

async function tryLoadEmbeddedRepWorkflow(cutId, cutRec, loadToken, effectiveKind) {
  const cut = cutRec || cutById(cutId);
  if (!shouldTryEmbeddedRepWorkflow(cut, effectiveKind)) return false;
  try {
    const res = await api.fetchApi(`/gonggan/media?id=${encodeURIComponent(cut.media.id)}`);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    const wf = extractPngWorkflow(buf);
    if (!wf || !isUiWorkflowGraph(wf)) return false;
    if (loadToken !== undefined && loadToken !== wfLoadToken) return false;
    const loaded = await loadWorkflowIntoDedicatedTab(wf, cut, loadToken);
    if (loadToken !== undefined && loadToken !== wfLoadToken) return false;
    if (ggCutSwitchAutosaveBlocked) return false;
    if (!loaded) return false;
    markWorkflowLoadComplete(cutId, cut);
    markGraphGongganCut(cutId);
    const title = shotTitle(cut);
    sdk.msg = `Canvas: ${title} (embedded in result)`;
    bus.dispatchEvent(new Event("sdk"));
    bus.dispatchEvent(new Event("gg-opentab"));
    ggToast("Shot", `${title} — embedded in result`, "ok");
    return true;
  } catch (e) {
    console.warn("[gonggan] embedded rep workflow load failed", e);
    return false;
  }
}

async function loadEmptyCutWorkflow(cutId, cutRec, loadToken, title) {
  if (loadToken !== undefined && loadToken !== wfLoadToken) return false;
  let templateWf = null;
  try {
    templateWf = await fetchProjectTemplatePayload();
  } catch (_) {}
  const { kind, workflow } = resolveEmptyCutWorkflow({ templateWorkflow: templateWf });
  const loaded = await loadWorkflowIntoDedicatedTab(workflow, cutRec, loadToken);
  if (loadToken !== undefined && loadToken !== wfLoadToken) return false;
  if (ggCutSwitchAutosaveBlocked) return false;
  if (!loaded) return false;
  markWorkflowLoadComplete(cutId, cutRec);
  markGraphGongganCut(cutId);
  const label = kind === "template" ? "project template" : "empty canvas";
  sdk.msg = `Canvas: ${title} (${label})`;
  bus.dispatchEvent(new Event("sdk"));
  bus.dispatchEvent(new Event("gg-opentab"));
  ggToast("Shot", `${title} — ${label}`, kind === "template" ? "ok" : "info");
  return true;
}

async function loadCutWorkflow(cutId, cut, loadToken) {
  const tl = state.timeline;
  if (!tl || !cutId) return;
  if (loadToken !== undefined && loadToken !== wfLoadToken) return;
  if (shouldSkipWorkflowReload(cutId)) return;
  ggCutSwitchAutosaveBlocked = false;
  const cutRec = cut || cutById(cutId);
  const title = shotTitle(cutRec);
  const effectiveKind = workflowKindForCut(cutRec);
  if (await tryRestoreCutWorkingCopy(cutId, cutRec, loadToken)) return;
  if (await tryLoadEmbeddedRepWorkflow(cutId, cutRec, loadToken, effectiveKind)) return;
  let lastErr = null;
  for (const src of CUT_WORKFLOW_SOURCES) {
    try {
      const hit = await src.resolve(cutId);
      if (loadToken !== wfLoadToken) return;
      const loaded = await loadWorkflowIntoDedicatedTab(hit.workflow, cutRec, loadToken);
      if (loadToken !== wfLoadToken) return;
      if (ggCutSwitchAutosaveBlocked) return;
      if (!loaded) {
        lastErr = new Error("workflow load failed");
        continue;
      }
      markWorkflowLoadComplete(cutId, cutRec);
      markGraphGongganCut(cutId);
      sdk.msg = hit.sdkMsg;
      bus.dispatchEvent(new Event("sdk"));
      bus.dispatchEvent(new Event("gg-opentab"));
      const sum = hit.toastSummary || "Shot";
      const detail = hit.toastDetail ? `${title} — ${hit.toastDetail}` : title;
      ggToast(sum, detail, hit.toastKind);
      return;
    } catch (e) {
      if (e.ggEmptyCut) {
        if (await loadEmptyCutWorkflow(cutId, cutRec, loadToken, title)) return;
        lastErr = e;
        break;
      }
      lastErr = e;
      if (src.id === "stored" && e.status === 404) {
        for (const leg of LEGACY_CUT_WORKFLOW_SOURCES) {
          try {
            const hit = await leg.resolve(cutId);
            if (loadToken !== wfLoadToken) return;
            const loaded = await loadWorkflowIntoDedicatedTab(hit.workflow, cutRec, loadToken);
            if (loadToken !== wfLoadToken) return;
            if (ggCutSwitchAutosaveBlocked) return;
            if (!loaded) {
              lastErr = new Error("workflow load failed");
              continue;
            }
            markWorkflowLoadComplete(cutId, cutRec);
            markGraphGongganCut(cutId);
            sdk.msg = hit.sdkMsg;
            bus.dispatchEvent(new Event("sdk"));
            bus.dispatchEvent(new Event("gg-opentab"));
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
  if (await loadEmptyCutWorkflow(cutId, cutRec, loadToken, title)) return;
  const msg = lastErr ? lastErr.message : "workflow unavailable";
  const hasMedia = cut && cut.media;
  sdk.msg = hasMedia ? `Shot: ${title} (preview — no workflow: ${msg})` : `Shot: ${title} — ${msg}`;
  bus.dispatchEvent(new Event("sdk"));
  ggToast("Shot", hasMedia ? `${title} — preview only (${msg})` : `${title} — ${msg}`, "warn");
}

async function fetchEmbeddedVersionWorkflow(vid) {
  const res = await api.fetchApi(`/gonggan/media?id=${encodeURIComponent(vid)}`);
  if (!res.ok) return null;
  const wf = extractPngWorkflow(await res.arrayBuffer());
  return wf && isUiWorkflowGraph(wf) ? wf : null;
}

async function fetchStoredVersionWorkflow(cutId, vid) {
  const pid = state.timeline?.project?.id || state.pid;
  const q = `/gonggan/version-workflow?pid=${encodeURIComponent(pid)}&cut=${encodeURIComponent(cutId)}&vid=${encodeURIComponent(vid)}`;
  const res = await api.fetchApi(q);
  if (!res.ok) return null;
  return workflowFromVersionRecord(await res.json().catch(() => null));
}

const VERSION_SOURCE_DETAIL = { embedded: "embedded in result", stored: "stored version workflow" };

/** Thumbnail click: open that version's own workflow in the shot tab. Never touches the pick. */
async function loadVersionWorkflow(cutId, vid, loadToken) {
  const cut = cutById(cutId);
  const ver = findCutVersion(cut, vid);
  if (!cut || !ver) return;
  ggCutSwitchAutosaveBlocked = false;
  const name = `${shotTitle(cut)} · v${versionIndexFromList(cut.versions_list, vid)}`;
  for (const src of versionWorkflowSourceOrder(ver)) {
    let wf = null;
    try {
      wf = src === "embedded" ? await fetchEmbeddedVersionWorkflow(vid) : await fetchStoredVersionWorkflow(cutId, vid);
    } catch (e) {
      console.warn(`[gonggan] version workflow (${src}) failed`, e);
    }
    if (isLoadTokenStale(loadToken)) return;
    if (!wf) continue;
    const loaded = await loadWorkflowIntoDedicatedTab(wf, cut, loadToken);
    if (isLoadTokenStale(loadToken) || ggCutSwitchAutosaveBlocked || !loaded) return;
    markWorkflowLoadComplete(cutId, cut, vid);
    markGraphGongganCut(cutId);
    sdk.msg = `Canvas: ${name} (${VERSION_SOURCE_DETAIL[src]})`;
    bus.dispatchEvent(new Event("sdk"));
    bus.dispatchEvent(new Event("gg-opentab"));
    ggToast("Shot", `${name} — ${VERSION_SOURCE_DETAIL[src]}`, "ok");
    return;
  }
  ggToast("Workflow", sentence(VERSION_WF_MISSING, name), "warn");
}

function openVersionWorkflow(cutId, vid) {
  if (!cutId || !vid) return;
  clearTimeout(wfLoadDebounce);
  wfLoadDebounce = 0;
  const loadToken = ++wfLoadToken;
  ggCutLoadsInFlight++;
  ggCutLoadSeq = ggCutLoadSeq
    .then(async () => {
      if (loadToken !== wfLoadToken) return;
      await loadVersionWorkflow(cutId, vid, loadToken);
    })
    .catch((e) => console.warn("[gonggan] version workflow load failed", e))
    .finally(() => {
      ggCutLoadsInFlight--;
    });
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

function syncTplUseLastButton(root) {
  const btn = root?.querySelector(".gg-tpl-use-last");
  if (!btn) return;
  const last = loadLastTemplate(localStorage);
  const show = !projectTemplateRef && typeof last === "string" && !!last && userWorkflowPaths.includes(last);
  btn.hidden = !show;
  if (!show) return;
  btn.title = `Link last used template: ${last}`;
  btn.textContent = `Use ${shortTemplateName(last, 24)}`;
  btn.dataset.ref = last;
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
    ggToast("Template", "Pick a project in the list first.", "warn");
    return;
  }
  saveLastTemplate(localStorage, ref || "");
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
    ggToast("Cut", "Pick a project in the list first.", "warn");
    return;
  }
  const cuts = state.timeline ? state.timeline.cuts : [];
  const { after, group } = addCutTarget({ timelineCuts: cuts, activeCutId: state.cutId, looseWhenNone: isNativeProject() });
  const body = { pid: state.pid };
  if (group) body.group = group;
  if (after) body.after = after;
  const before = snapshotOrderGroups(state.timeline);
  try {
    const d = await postJson("/gonggan/cut/add", body);
    if (d.timeline) {
      adoptMutationTimeline(d.timeline, body.pid);
      bus.dispatchEvent(new Event("timeline"));
    } else {
      await loadTimeline();
    }
    recordCutAdded(body.pid, d.cut?.id, before);
    if (d.cut && d.cut.id) {
      wfLastLoadedCutId = "";
      wfLastLoadedProjectId = "";
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
  const t = clipStartOf(toId);
  if (t != null && typeof seek === "function" && !play.on) {
    play.idx = -1;
    seek(t + 0.001);
  }
}

function selectCut(cutId, opts) {
  const range = opts && opts.range;
  const multi = opts && opts.multi;
  const fromTimeline = !!(opts && opts.fromTimeline);
  if (range) {
    const anchor = cutSelAnchor || state.cutId || cutId;
    selectCutRange(anchor, cutId);
    return;
  }
  const cut = cutById(cutId);
  if (multi) {
    // The plainly-selected ("current") cut counts as selected: Ctrl-click on a 2nd card makes a pair.
    if (!state.cutSel.size && state.cutId && state.cutId !== cutId && cutById(state.cutId)) state.cutSel.add(state.cutId);
    if (state.cutSel.has(cutId)) state.cutSel.delete(cutId);
    else state.cutSel.add(cutId);
    cutSelAnchor = cutId;
  } else {
    state.cutSel.clear();
    cutSelAnchor = cutId;
  }
  state.cutId = cutId;
  bus.dispatchEvent(new Event("select"));
  const t = clipStartOf(cutId);
  if (t != null && typeof seek === "function" && !play.on) {
    play.idx = -1;
    seek(t + 0.001);
  }
  if (shouldCancelPendingWorkflowLoad({ fromTimeline })) {
    clearTimeout(wfLoadDebounce);
    wfLoadDebounce = 0;
    ++wfLoadToken;
  }
  if (shouldScheduleCutWorkflowLoad({ multi, range, fromTimeline })) {
    clearTimeout(wfLoadDebounce);
    try {
      const g = app.graph?.extra?.gonggan;
      const gp = gongganExtraProjectId(g);
      if (
        shouldResetOpenTabTracking({
          multi,
          range,
          fromTimeline,
          cutId,
          graphCutId: g?.cutId || "",
          projectId: state.pid,
          graphProjectId: gp || "",
        })
      ) {
        wfLastLoadedCutId = "";
        wfLastLoadedProjectId = "";
      }
    } catch (_) {}
    const loadToken = ++wfLoadToken;
    const runLoad = () => {
      wfLoadDebounce = 0;
      ggCutLoadsInFlight++;
      scheduleLoadCutWorkflow(cutId, cut, loadToken).finally(() => {
        ggCutLoadsInFlight--;
      });
    };
    if (WF_LOAD_DEBOUNCE_MS > 0) {
      wfLoadDebounce = setTimeout(runLoad, WF_LOAD_DEBOUNCE_MS);
    } else {
      runLoad();
    }
  }
}

function closeCtxMenu() {
  if (ctxUi.sub) {
    ctxUi.sub.remove();
    ctxUi.sub = null;
  }
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

function openCtxSubmenu(anchorBtn, subItems) {
  if (ctxUi.sub) {
    ctxUi.sub.remove();
    ctxUi.sub = null;
  }
  const sub = document.createElement("div");
  sub.className = "gg-ctx gg-ctx-sub";
  sub.setAttribute("role", "menu");
  subItems.forEach((it) => {
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
    sub.appendChild(btn);
  });
  document.body.appendChild(sub);
  ctxUi.sub = sub;
  const pad = 6;
  const a = anchorBtn.getBoundingClientRect();
  const sr = sub.getBoundingClientRect();
  let left = a.right + 2;
  let top = a.top;
  if (left + sr.width > window.innerWidth - pad) left = a.left - sr.width - 2;
  if (top + sr.height > window.innerHeight - pad) top = window.innerHeight - sr.height - pad;
  sub.style.left = `${Math.max(pad, left)}px`;
  sub.style.top = `${Math.max(pad, top)}px`;
}

function showCtxMenu(x, y, items) {
  closeCtxMenu();
  const menu = document.createElement("div");
  menu.className = "gg-ctx";
  menu.setAttribute("role", "menu");
  items.forEach((it) => {
    if (it.separator) {
      const sep = document.createElement("div");
      sep.className = "gg-ctx-sep";
      sep.setAttribute("role", "separator");
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gg-ctx-item" + (it.danger ? " gg-ctx-danger" : "") + (it.submenu ? " gg-ctx-parent" : "");
    btn.textContent = it.label;
    btn.disabled = !!it.disabled;
    if (it.title) btn.title = it.title;
    if (it.submenu) {
      const openSub = () => {
        if (!it.disabled) openCtxSubmenu(btn, it.submenu);
      };
      btn.addEventListener("mouseenter", openSub);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSub();
      });
    } else {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeCtxMenu();
        if (!it.disabled && it.action) it.action();
      });
    }
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
    const t = e.target;
    if (menu.contains(t) || ctxUi.sub?.contains(t)) return;
    closeCtxMenu();
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

/** Soft delete (to Trash) without a toast or history entry. */
async function deleteCutsByIds(ids) {
  const reqPid = state.pid;
  const d = await postJson("/gonggan/cut/delete", { pid: reqPid, cuts: ids });
  if (d.timeline) adoptMutationTimeline(d.timeline, reqPid);
  else await loadTimeline();
  state.cutSel.clear();
  cutSelAnchor = "";
  if (ids.includes(state.cutId)) {
    state.cutId = state.timeline?.cuts?.[0]?.id || "";
    wfLastLoadedCutId = "";
    wfLastLoadedProjectId = "";
  }
  state.error = "";
  bus.dispatchEvent(new Event("timeline"));
  bus.dispatchEvent(new Event("select"));
  refreshTrashCount();
  return d;
}

async function deleteSelectedCuts() {
  const ids = cutsForDelete();
  if (!ids.length || !state.pid) return;
  const deletedIds = [...ids];
  const n = deletedIds.length;
  const reqPid = state.pid;
  const entry = { kind: "cuts", op: "delete", ids: deletedIds, before: snapshotOrderGroups(state.timeline) };
  try {
    await deleteCutsByIds(deletedIds);
    recordShotsEntry(reqPid, entry);
    ggToast(movedToTrashToastMessage(n), "", "ok", {
      actionLabel: "Undo",
      onAction: async () => {
        try {
          if (shotsHistory.peekUndo(reqPid) === entry) {
            if (await stepShotsHistory("undo")) ggToast(`Restored ${n} cut(s)`, "", "ok");
            return;
          }
          await restoreCutsRecorded(deletedIds, { selectFirst: true });
          ggToast(`Restored ${n} cut(s)`, "", "ok");
        } catch (e) {
          ggToast("Restore", e.message, "warn");
        }
      },
    });
  } catch (e) {
    ggToast("Delete", e.message, "warn");
  }
}

async function addCutAfter(cutId) {
  if (!state.pid) return;
  const cuts = state.timeline ? state.timeline.cuts : [];
  const { after, group } = addCutTarget({ timelineCuts: cuts, activeCutId: cutId });
  const body = { pid: state.pid };
  if (after) body.after = after;
  if (group) body.group = group;
  const before = snapshotOrderGroups(state.timeline);
  try {
    const d = await postJson("/gonggan/cut/add", body);
    if (d.timeline) {
      adoptMutationTimeline(d.timeline, body.pid);
      bus.dispatchEvent(new Event("timeline"));
    } else await loadTimeline();
    recordCutAdded(body.pid, d.cut?.id, before);
    if (d.cut?.id) {
      wfLastLoadedCutId = "";
      wfLastLoadedProjectId = "";
      selectCut(d.cut.id);
    }
    ggToast("Cut", d.template_copied ? `Added ${d.cut.name}` : `${d.cut.name} — no template`, d.template_copied ? "ok" : "warn");
  } catch (e) {
    ggToast("Cut", e.message, "warn");
  }
}

function cutGroupMembership(ids) {
  const grps = state.timeline?.groups || [];
  const mem = new Map();
  for (const g of grps) {
    for (const id of g.cut_ids || []) mem.set(id, g.id);
  }
  const allIn = (gid) => ids.every((id) => (mem.get(id) || null) === gid);
  return { allIn };
}

function buildMoveToSceneSubmenu(ids) {
  const tl = state.timeline;
  if (!tl) return [];
  const { allIn } = cutGroupMembership(ids);
  const items = [
    { label: "Ungrouped", disabled: allIn(null), action: () => applyMoveToScene(ids, null) },
  ];
  for (const g of tl.groups || []) {
    items.push({
      label: g.name,
      disabled: allIn(g.id),
      action: () => applyMoveToScene(ids, g.id),
    });
  }
  return items;
}

async function applyMoveToScene(ids, sceneIdOrNull) {
  const tl = state.timeline;
  if (!tl || !isNativeProject()) return;
  const r = moveToScene(tl.cuts.map((c) => c.id), groupsClone(), ids, sceneIdOrNull);
  if (!r.changed) return;
  await commitShotsReorder(r.order, r.groups);
}

async function applyStepMove(dir) {
  const tl = state.timeline;
  if (!tl || !isNativeProject()) return;
  const ids = cutSelIds();
  if (!ids.length) return;
  const r = stepMove(tl.cuts.map((c) => c.id), groupsClone(), ids, dir);
  if (!r.changed) return;
  await commitShotsReorder(r.order, r.groups);
}

async function applyCutMoveBtn(cutId, dir) {
  const tl = state.timeline;
  if (!tl || !isNativeProject() || !cutId) return;
  const order = tl.cuts.map((c) => c.id);
  const ids = [cutId];
  if (dir < 0 && !canMoveUp(order, ids)) return;
  if (dir > 0 && !canMoveDown(order, ids)) return;
  const r = stepMove(order, groupsClone(), ids, dir);
  if (!r.changed) return;
  await commitShotsReorder(r.order, r.groups, { moveCount: 1 });
}

function scrollMovedCutsIntoView() {
  const ids = cutSelIds();
  const wrap = document.querySelector(".gg-shots .gg-grp-wrap");
  if (!wrap || !ids.length) return;
  const row = wrap.querySelector(`.gg-cut[data-cut-id="${CSS.escape(ids[0])}"]`);
  row?.scrollIntoView({ block: "nearest" });
}

function enqueueReorderPersist(fn) {
  // A timeline trim still waiting must be saved before this reply replaces the timeline.
  return editGate.runAfterPending(takePendingTimelineSave, fn);
}

function takePendingTimelineSave() {
  if (!ed.savePending) return null;
  clearTimeout(ed.saveTimer);
  ed.savePending = false;
  return saveEditNow;
}

/** Cut list order + scenes before a Shots edit, for Ctrl+Z. */
function recordShotsUndo() {
  if (!state.timeline || !isNativeProject()) return;
  shotsHistory.record(state.pid, snapshotOrderGroups(state.timeline));
}

/** A cut add / delete / rename entry, only while its project is still the open one. */
function recordShotsEntry(pid, entry) {
  if (!pid || pid !== state.pid || !state.timeline || !isNativeProject()) return;
  shotsHistory.record(pid, entry);
}

function recordCutAdded(pid, cutId, before) {
  if (!cutId) return;
  recordShotsEntry(pid, { kind: "cuts", op: "add", ids: [cutId], before, after: snapshotOrderGroups(state.timeline) });
}

/** Persist one undo/redo step through the same routes as the edit itself. */
async function runShotsStep(step, pid) {
  if (state.pid !== pid || !state.timeline) return false;
  if (step.type === "layout") {
    const current = snapshotOrderGroups(state.timeline);
    const fit = fitOrderGroupsSnapshot(step.snap, current);
    if (sameSnapshot(fit, current)) return true;
    return enqueueReorderPersist(() => persistShotsReorder(fit.order, fit.groups));
  }
  try {
    if (step.type === "restore") await restoreCutsByIds(step.ids, { selectFirst: true });
    else if (step.type === "delete") await deleteCutsByIds(step.ids);
    else if (step.type === "rename") {
      await postJson("/gonggan/cut/rename", { pid, cut_id: step.cut_id, name: step.name });
      await loadTimeline();
    }
    return true;
  } catch (e) {
    ggToast("Undo", e.message, "warn");
    await loadTimeline();
    return false;
  }
}

async function stepShotsHistoryNow(action) {
  const tl = state.timeline;
  if (!tl || !isNativeProject()) return false;
  const pid = state.pid;
  const current = snapshotOrderGroups(tl);
  const counterpart = (entry) => shotsCounterpart(entry, current);
  const entry = action === "redo" ? shotsHistory.redo(pid, counterpart) : shotsHistory.undo(pid, counterpart);
  if (!entry) {
    ggToast(action === "redo" ? "Nothing to redo" : "Nothing to undo", "", "info", { ttlMs: 1500 });
    return false;
  }
  reorderUndoBurst.reset();
  for (const step of shotsUndoSteps(entry, action)) {
    if (!(await runShotsStep(step, pid))) {
      shotsHistory.clear();
      return false;
    }
  }
  return true;
}

/** Ctrl+Z / Ctrl+Shift+Z in Shots, one step at a time (each step reads the list as the previous one left it). */
function stepShotsHistory(action) {
  const run = shotsStepChain.then(() => stepShotsHistoryNow(action));
  shotsStepChain = run.catch(() => false);
  return run;
}

async function commitShotsReorder(order, groups, opts = {}) {
  const { recordUndo = true, moveCount } = opts;
  if (!state.timeline || !isNativeProject()) return false;
  let undoTarget = null;
  if (recordUndo) {
    const snap = snapshotOrderGroups(state.timeline);
    if (snap) undoTarget = reorderUndoBurst.push(snap, Date.now());
    recordShotsUndo();
  }
  const ok = await enqueueReorderPersist(() => persistShotsReorder(order, groups));
  if (!ok) return false;
  scrollMovedCutsIntoView();
  if (recordUndo && undoTarget) {
    const n = moveCount ?? Math.max(1, cutSelIds().length);
    ggToast(`Moved ${n} cut(s)`, "", "ok", {
      ttlMs: 8000,
      actionLabel: "Undo",
      onAction: async () => {
        reorderUndoBurst.reset();
        recordShotsUndo();
        const restored = await enqueueReorderPersist(() => persistShotsReorder(undoTarget.order, undoTarget.groups));
        if (restored) ggToast("Undone", "", "ok");
      },
    });
  }
  return true;
}

function selectOnlyCut(cutId) {
  state.cutSel.clear();
  state.cutSel.add(cutId);
  cutSelAnchor = cutId;
  state.cutId = cutId;
  bus.dispatchEvent(new Event("select"));
}

function cutMenuCtx(cutId, multi) {
  const native = isNativeProject();
  return {
    native,
    multi,
    needsRedo: !!cutById(cutId)?.needs_redo,
    sdkBusy: !!sdk.busy,
    sdkOk: !!(sdk.st && sdk.st.ok),
    emptyCut: native && regenEmptyCut(cutId),
    readonlyTip: NATIVE_READONLY_TIP,
  };
}

function cutMenuActions(cutId) {
  return {
    redo: () => toggleNeedsRedo(cutId),
    rename: () => renameCut(cutId),
    regen: () => (isNativeProject() ? regenNativeCut(cutId) : regenCut(cutId)),
    send: () => sendLastOutput(cutId),
  };
}

function openCutContextMenu(e, cutId) {
  e.preventDefault();
  e.stopPropagation();
  if (!state.cutSel.has(cutId)) selectOnlyCut(cutId);
  const ids = cutSelIds();
  const c = cutById(cutId);
  const nat = isNativeProject();
  const order = state.timeline ? state.timeline.cuts.map((x) => x.id) : [];
  const failedIds = ids.filter((id) => renderStatus.isFailed(state.pid, id));
  const items = cutCardMenuItems({
    ...cutMenuCtx(cutId, ids.length > 1),
    canMoveUp: canMoveUp(order, ids),
    canMoveDown: canMoveDown(order, ids),
    inScene: !!(c && c.group_id),
    anyInScene: ids.some((id) => cutById(id)?.group_id),
    trashLabel: trashMenuLabel(),
    trashCount,
    queueCount: ids.length,
    queuedCount: ids.filter((id) => renderStatus.queuedPromptIds(state.pid, id).length).length,
    failedCount: failedIds.length,
  });
  showCtxMenu(
    e.clientX,
    e.clientY,
    attachMenuActions(
      items,
      {
        ...cutMenuActions(cutId),
        queueSel: () => queueSelectedCuts(),
        removeQueue: () => removeCutsFromQueue(ids),
        requeue: () => queueSelectedCuts(failedIds),
        moveUp: () => applyStepMove(-1),
        moveDown: () => applyStepMove(1),
        group: () => createSceneGroup(ids),
        split: () => splitSceneHere(cutId),
        ungroup: () => ungroupCuts(ids),
        addCut: () => addCutAfter(cutId),
        del: () => deleteSelectedCuts(),
        trash: () => openTrashModal(),
      },
      nat ? { moveToScene: buildMoveToSceneSubmenu(ids) } : {},
    ),
  );
}

function openClipContextMenu(e, cutId) {
  e.preventDefault();
  e.stopPropagation();
  if (ed.dragging || !cutById(cutId)) return;
  showCtxMenu(
    e.clientX,
    e.clientY,
    attachMenuActions(timelineClipMenuItems(cutMenuCtx(cutId, false)), {
      ...cutMenuActions(cutId),
      open: () => selectCut(cutId),
      // These two are Shots history edits: the next Ctrl+Z (pointer not back over the Timeline) undoes them.
      applyOrder: () => {
        undoLastArea = "shots";
        applyTimelineOrderToCuts();
      },
      del: () => {
        undoLastArea = "shots";
        selectOnlyCut(cutId);
        deleteSelectedCuts();
      },
    }),
  );
}

/** Shots cut list follows the timeline clip order (server keeps scenes together); the timeline is unchanged. */
async function applyTimelineOrderToCuts() {
  const tl = state.timeline;
  if (!tl || !isNativeProject()) return;
  if (!(await askConfirm({ message: "Cut numbers will be renumbered. Continue?" }))) return;
  if (ed.savePending) {
    clearTimeout(ed.saveTimer);
    ed.savePending = false;
    await saveEdit();
  }
  const reqPid = tl.project.id;
  recordShotsUndo();
  await editGate.run(async () => {
    try {
      const data = await postJson("/gonggan/timeline/apply_order", { pid: reqPid });
      editGate.bump();
      adoptMutationTimeline(data, reqPid);
      state.error = "";
    } catch (e) {
      ggToast("Apply order failed", e.message, "warn");
    }
  });
  bus.dispatchEvent(new Event("timeline"));
  bus.dispatchEvent(new Event("select"));
}

function openSceneContextMenu(e, groupId) {
  e.preventDefault();
  e.stopPropagation();
  const g = (state.timeline?.groups || []).find((x) => x.id === groupId);
  if (!g) return;
  const ids = sceneCutIds(state.timeline.cuts, g);
  const first = ids[0];
  const last = ids[ids.length - 1];
  showCtxMenu(
    e.clientX,
    e.clientY,
    attachMenuActions(sceneMenuItems({ collapsed: !!g.collapsed, cutCount: ids.length }), {
      addCut: () => (last ? addCutAfter(last) : addCutToScene(groupId)),
      selectCuts: () => selectCutRange(first, last),
      toggleCollapse: () => toggleGroupCollapsed(groupId),
      rename: () => renameSceneGroup(groupId),
      ungroup: () => ungroupSceneGroup(groupId),
    }),
  );
}

function openShotsPanelContextMenu(e) {
  if (state.projectsLoaded && !state.projects.length) {
    openProjectContextMenu(e); // nothing to add cuts to yet: offer New Project…
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const nat = isNativeProject();
  const items = [{ label: "Add Cut", action: () => addLocalCut() }];
  const ids = cutSelIds();
  if (ids.length) items.push({ label: "New Scene", action: () => createSceneGroup(ids) });
  if (nat) {
    items.push({
      label: trashMenuLabel(),
      disabled: trashCount <= 0,
      title: "Deleted cuts – click to restore",
      action: () => openTrashModal(),
    });
  }
  showCtxMenu(e.clientX, e.clientY, items);
}

async function ungroupSceneGroup(groupId) {
  recordShotsUndo();
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
  adoptMutationTimeline(data, tl.project.id);
  state.error = "";
  bus.dispatchEvent(new Event("timeline"));
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
  const title = await askText({
    title: "Scene name",
    label: "Name",
    value: isNativeProject() ? nextSceneName(state.timeline?.groups) : "Scene " + ((state.timeline?.groups?.length || 0) + 1),
    okLabel: "Create scene",
    maxLength: SCENE_NAME_MAX_LEN,
  });
  if (title === null) return;
  let groups = stripCutsFromGroups(groupsClone(), ids);
  groups.push({ id: newSceneGroupId(), name: title, cut_ids: ids, collapsed: false });
  state.cutSel.clear();
  cutSelAnchor = "";
  recordShotsUndo();
  await persistGroups(groups);
}

/**
 * Icon row New scene on a native project: one more empty scene at the end of the scenes (above
 * Ungrouped) on every click. Runs on the Shots undo/redo chain so fast clicks each build on the
 * previous save instead of all cloning the same groups.
 */
function addEmptyScene() {
  const run = shotsStepChain.then(() => addEmptySceneNow());
  shotsStepChain = run.catch(() => false);
  return run;
}

async function addEmptySceneNow() {
  const tl = state.timeline;
  if (!tl || !state.pid || !isNativeProject()) return false;
  const { groups, scene } = withNewEmptyScene(groupsClone(), newSceneGroupId());
  recordShotsUndo();
  try {
    await persistGroups(groups);
  } catch (e) {
    ggToast("Scene", e.message, "warn");
    return false;
  }
  document
    .querySelector(`.gg-shots .gg-grp-sec[data-group-id="${CSS.escape(scene.id)}"]`)
    ?.scrollIntoView({ block: "nearest" });
  return true;
}

/** Scene menu Add Cut on an empty scene: the new cut goes into that scene. */
async function addCutToScene(groupId) {
  if (!state.pid) return;
  const body = { pid: state.pid, group: groupId };
  const before = snapshotOrderGroups(state.timeline);
  try {
    const d = await postJson("/gonggan/cut/add", body);
    if (d.timeline) {
      adoptMutationTimeline(d.timeline, body.pid);
      bus.dispatchEvent(new Event("timeline"));
    } else await loadTimeline();
    recordCutAdded(body.pid, d.cut?.id, before);
    if (d.cut?.id) {
      wfLastLoadedCutId = "";
      wfLastLoadedProjectId = "";
      selectCut(d.cut.id);
    }
    ggToast("Cut", d.template_copied ? `Added ${d.cut.name}` : `${d.cut.name} — no template`, d.template_copied ? "ok" : "warn");
  } catch (e) {
    ggToast("Cut", e.message, "warn");
  }
}

async function ungroupCuts(cutIds) {
  const ids = cutIds && cutIds.length ? cutIds : cutSelIds();
  state.cutSel.clear();
  cutSelAnchor = "";
  recordShotsUndo();
  await persistGroups(stripCutsFromGroups(groupsClone(), ids));
}

async function renameCut(cutId) {
  const c = cutById(cutId);
  if (!c || !state.pid) return;
  const name = await askText({ title: "Cut name", label: "Name", value: c.name || "", okLabel: "Rename", maxLength: CUT_NAME_MAX_LEN });
  if (name === null || name === c.name) return;
  await saveCutName(cutId, name);
}

/** Shared save for the F2 dialog and the inline title field: rename route, reload, Shots undo entry. */
async function saveCutName(cutId, name) {
  const c = cutById(cutId);
  if (!c || !state.pid || name === c.name) return;
  const pid = state.pid;
  const from = c.name || "";
  try {
    await postJson("/gonggan/cut/rename", { pid, cut_id: cutId, name });
    await loadTimeline();
    const to = cutById(cutId)?.name ?? name;
    if (from && to !== from) recordShotsEntry(pid, { kind: "rename", cut_id: cutId, from, to });
  } catch (err) {
    const hint = err.status === 404 || err.status === 405 ? "Restart ComfyUI to enable renaming." : err.message;
    ggToast("Cut", hint, "warn");
  }
}

async function renameSceneGroup(groupId) {
  const g = (state.timeline?.groups || []).find((x) => x.id === groupId);
  if (!g) return;
  const title = await askText({
    title: "Scene name",
    label: "Name",
    value: g.name || "Scene",
    okLabel: "Rename",
    maxLength: SCENE_NAME_MAX_LEN,
  });
  if (title === null || title === g.name) return;
  const groups = groupsClone();
  const hit = groups.find((x) => x.id === groupId);
  if (hit) hit.name = title;
  recordShotsUndo();
  await persistGroups(groups);
}

async function deleteSceneGroup(groupId) {
  if (!(await askConfirm({ message: "Delete this scene? (Cuts become ungrouped)", danger: true }))) return;
  recordShotsUndo();
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
  recordShotsUndo();
  await persistGroups(groups);
}

async function splitSceneHere(cutId) {
  const tl = state.timeline;
  if (!tl) return;
  const cuts = tl.cuts;
  const idx = cuts.findIndex((c) => c.id === cutId);
  if (idx < 0) return;
  const gid = cuts[idx].group_id;
  const title = await askText({
    title: "Scene name",
    label: "Name",
    value: cuts[idx].group_name || "Scene",
    okLabel: "Create scene",
    maxLength: SCENE_NAME_MAX_LEN,
  });
  if (title === null) return;
  const moveIds = [];
  for (let i = idx; i < cuts.length; i++) {
    if (!gid || cuts[i].group_id === gid) moveIds.push(cuts[i].id);
    else break;
  }
  let groups = stripCutsFromGroups(groupsClone(), moveIds);
  groups.push({ id: "s" + Date.now(), name: title, cut_ids: moveIds, collapsed: false });
  recordShotsUndo();
  await persistGroups(groups);
}

function groupColor(id) {
  let h = 0;
  for (let i = 0; i < (id || "").length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return [42, 88, 148, 118, 168, 28, 198][Math.abs(h) % 7];
}

function markGraphGongganCut(cutId) {
  try {
    if (!app.graph) return;
    app.graph.extra = app.graph.extra || {};
    app.graph.extra.gonggan = { pid: state.pid, projectId: state.pid, cutId };
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
        renderStatus.link(j.promptId, j.cutId, j.projectId);
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
  li.classList.toggle("gg-stage-all-done", s.stage === "done");
  row.classList.toggle("gg-stage-all-done", s.stage === "done");
  if (s.stage === "done") row.title = "Done — best cut selected";
  else row.removeAttribute("title");
  for (const dot of row.querySelectorAll(".gg-stage-dot")) {
    const k = dot.dataset.k;
    const met = k === "image" ? s.image : k === "video" ? s.video : s.best;
    dot.classList.toggle("gg-on", met);
    dot.classList.toggle("gg-off", !met);
    dot.classList.toggle("gg-next", k === next);
    dot.title = stagePillTip(k, met);
  }
}

function applyLiveChipToRow(li, cut) {
  const chip = li?.querySelector(".gg-live-chip");
  if (!chip || !cut) return;
  const v = liveProgressView(cut);
  chip.hidden = !v.show || v.mode !== "failed";
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

function paintSceneProgressHeaders(tl, scope) {
  if (!tl) return;
  const cuts = tl.cuts || [];
  const rank = new Map(cuts.map((c, i) => [c.id, i]));
  const root = scope || document;
  for (const g of tl.groups || []) {
    const sec = root.querySelector?.(`.gg-grp-sec[data-group-id="${CSS.escape(g.id)}"]`);
    if (!sec) continue;
    const ids = (g.cut_ids || []).filter((id) => rank.has(id));
    const sceneCuts = ids.map((id) => cuts.find((c) => c.id === id)).filter(Boolean);
    const { best, total } = sceneBestProgress(sceneCuts);
    const el = sec.querySelector(".gg-grp-prog");
    if (el) {
      el.textContent = `${best}/${total}`;
      el.title = total ? `Best ${best} of ${total} cuts in this scene` : "";
    }
  }
}

function paintProjectSummary(root) {
  const tl = state.timeline;
  const cuts = tl?.cuts || [];
  const sum = projectSummary(cuts);
  const parts = summaryBarParts(cuts);
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
      const segBest = bar.querySelector(".gg-seg-best") || bar.querySelector(".gg-seg-done");
      const segVideo = bar.querySelector(".gg-seg-video");
      const segImage = bar.querySelector(".gg-seg-image");
      const segEmpty = bar.querySelector(".gg-seg-empty");
      if (segBest) segBest.style.flex = `${parts.best} 0 0`;
      if (segVideo) segVideo.style.flex = `${parts.video} 0 0`;
      if (segImage) segImage.style.flex = `${parts.image} 0 0`;
      if (segEmpty) segEmpty.style.flex = `${parts.empty} 0 0`;
      const tip = text;
      bar.title = tip;
      if (segBest) segBest.title = parts.total ? `Best ${sum.done}/${parts.total}` : "";
      if (segVideo) segVideo.title = parts.total ? `Video ${sum.video}/${parts.total}` : "";
      if (segImage) segImage.title = parts.total ? `Image ${sum.image}/${parts.total}` : "";
      if (segEmpty) segEmpty.title = parts.empty ? `Empty ${parts.empty}/${parts.total}` : "";
      bar.hidden = sum.total === 0;
    }
    paintSceneProgressHeaders(tl, host);
    const cpct = host.querySelector?.(".gg-complete-pct");
    if (cpct) {
      cpct.textContent = comp.total ? `${comp.percent}%` : "";
      cpct.title = comp.total ? `Best set on ${comp.done} of ${comp.total} cuts` : "";
    }
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
  paintAllRenderStatus();
}

function paintRenderBadge(badge, v) {
  if (!badge) return;
  const key = v.show ? `${v.mode}|${v.text}|${v.pos || ""}|${v.title}` : "";
  if (badge.dataset.rs === key) return;
  badge.dataset.rs = key;
  badge.hidden = !v.show;
  badge.classList.toggle("gg-rs-rendering", v.mode === "rendering");
  badge.classList.toggle("gg-rs-queued", v.mode === "queued");
  badge.classList.toggle("gg-rs-failed", v.mode === "failed");
  const text = badge.querySelector(".gg-rs-text");
  if (text) text.textContent = v.text;
  const pos = badge.querySelector(".gg-rs-pos");
  if (pos) pos.textContent = v.pos || "";
  if (v.title) badge.title = v.title;
  else badge.removeAttribute("title");
}

function paintRenderGlobal() {
  const v = renderGlobalView(renderStatus.globalView(state.pid));
  document.querySelectorAll(".gg-shots .gg-render-global").forEach((el) => paintRenderBadge(el, v));
  const b = batchProgressView(renderStatus.batchView());
  document.querySelectorAll(".gg-shots .gg-batch-prog").forEach((el) => {
    el.hidden = !b.show;
    el.textContent = b.text;
    el.title = b.title;
  });
}

/** Badge-only update for the given cuts (cut cards + timeline clips) and the header indicator. */
function paintRenderStatus(cutIds) {
  for (const id of cutIds || []) {
    const v = renderBadgeView(renderStatus.cutView(state.pid, id));
    const sel = `.gg-cut[data-cut-id="${CSS.escape(id)}"] .gg-render-badge, .gg-clip[data-cut-id="${CSS.escape(id)}"] .gg-render-badge`;
    document.querySelectorAll(sel).forEach((el) => paintRenderBadge(el, v));
  }
  if (!SHOW_CUT_PANEL && SHOW_STATUS_PANEL) document.querySelectorAll(".gg-shots .gg-cutpanel").forEach(paintStatusPanel);
  paintRenderGlobal();
}

function paintAllRenderStatus() {
  const ids = new Set();
  document.querySelectorAll(".gg-shots .gg-cut[data-cut-id], .gg-timeline .gg-clip[data-cut-id]").forEach((el) => ids.add(el.dataset.cutId));
  paintRenderStatus(ids);
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
  }, 250);
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
  }
}

async function syncProgressQueue() {
  try {
    const res = await api.fetchApi("/queue");
    const data = await res.json().catch(() => ({}));
    progressTracker.syncQueue(data);
    renderStatus.syncQueue(data);
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
      if (typ === "status" || typ === "promptQueued") onProgressStatusEvent(e);
      else progressTracker.handleEvent(typ, e.detail);
      paintRenderStatus(renderStatus.handle(typ, e.detail));
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
  editGate.bump();
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

async function persistShotsReorder(order0, groups) {
  const tl = state.timeline;
  if (!tl || !isNativeProject()) return true;
  const order = listOrder(order0, groups);
  applyOrderGroupsLocally(order, groups);
  const mySeq = editGate.seq;
  bus.dispatchEvent(new Event("timeline"));
  try {
    // Order matters: scene membership (/groups) first, then the flat order (/cut/reorder). The server
    // lays cuts out as "scenes in list order, then ungrouped"; applying the order first would use the
    // OLD membership and a cut that leaves/enters a scene would snap back to its old position.
    // The timeline keeps its own clip order (/edit never touches the cut list and vice versa).
    const gRes = await api.fetchApi("/gonggan/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: tl.project.id, groups }),
    });
    const gData = await gRes.json();
    if (!gRes.ok || gData.ok === false) throw new Error(gData.message || `HTTP ${gRes.status}`);
    const payload = JSON.stringify({ pid: tl.project.id, order });
    // keepalive lets the save finish if the page closes; browsers cap keepalive bodies at 64 KB.
    const res = await api.fetchApi("/gonggan/cut/reorder", { method: "POST", keepalive: payload.length < 60000, headers: { "Content-Type": "application/json" }, body: payload });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    // A newer local trim/reorder happened while this request was out: keep the newer local state
    // (its own save is already queued) instead of replacing it with this older answer.
    if (editGate.isCurrent(mySeq)) adoptMutationTimeline(data, tl.project.id);
    state.error = "";
  } catch (e) {
    const msg = e?.message || String(e);
    console.warn("[gonggan-cut] Reorder failed:", msg);
    state.error = sentence("Reorder not saved: " + msg, "The previous order is back. Try again.");
    ggToast("Reorder failed. Previous order restored.", msg, "warn");
    await loadTimeline();
    return false;
  }
  bus.dispatchEvent(new Event("timeline"));
  return true;
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

/** Scene sections with no cut rows (New scene), in wrap-content coordinates. */
function collectEmptySceneRects(wrap) {
  const wrapRect = wrap.getBoundingClientRect();
  return [...wrap.querySelectorAll(".gg-grp-sec[data-group-id]")]
    .filter((s) => !s.querySelector(".gg-cut"))
    .map((s) => {
      const r = s.getBoundingClientRect();
      return {
        groupId: s.dataset.groupId,
        top: r.top - wrapRect.top + wrap.scrollTop,
        bottom: r.bottom - wrapRect.top + wrap.scrollTop,
      };
    });
}

function bindShotsReorder(root) {
  if (!isNativeProject()) return;
  const wrap = root.querySelector(".gg-grp-wrap");
  if (!wrap) return;
  if (!wrap._ggDragKill) {
    wrap._ggDragKill = true;
    wrap.addEventListener(
      "dragstart",
      (e) => {
        const cut = e.target.closest(".gg-cut");
        if (!cut) return;
        const field = e.target.closest("textarea, input");
        if (field && isCardFieldEditing(field)) return;
        e.preventDefault();
      },
      true,
    );
  }
  let indicator = wrap.querySelector(".gg-drag-ind");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "gg-drag-ind";
    indicator.hidden = true;
    wrap.appendChild(indicator);
  }
  root.querySelectorAll(".gg-cut").forEach((el) => {
    if (!el._ggReorderMd) {
      el._ggReorderMd = true;
      el.addEventListener(
        "mousedown",
        (e) => {
          if (e.button !== 0) return;
          const blocker = e.target.closest("input, textarea, button, select, a");
          if (blocker) {
            if (blocker.tagName === "TEXTAREA" && !isCardFieldEditing(blocker)) {
              e.preventDefault();
              return;
            }
            return;
          }
          e.preventDefault();
        },
        true,
      );
    }
    el.addEventListener("pointerdown", (e) => {
      if (!isNativeProject() || e.button) return;
      const blocker = e.target.closest("input, textarea, button, select, a");
      // Card caption textareas only block a drag while they are in edit mode (double-click).
      if (blocker && !(blocker.tagName === "TEXTAREA" && !isCardFieldEditing(blocker))) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const cutId = el.dataset.cutId;
      let active = false;
      let aborted = false;
      let drop = { toIndex: 0, toGroupId: null, lineY: 0 };
      let lastClientY = startY;
      const movingIds = () => {
        if (state.cutSel.size >= 2 && state.cutSel.has(cutId)) return cutSelIds();
        return [cutId];
      };
      let scrollRaf = 0;
      let scrollLoop = false;
      let dropSec = null;
      const setDropSec = (sec, cross) => {
        if (dropSec && dropSec !== sec) dropSec.classList.remove("gg-drop-target", "gg-drop-cross");
        dropSec = sec || null;
        if (!dropSec) return;
        dropSec.classList.add("gg-drop-target");
        dropSec.classList.toggle("gg-drop-cross", !!cross);
      };
      const refreshDropIndicator = () => {
        const tl = state.timeline;
        if (!tl) return;
        const order = tl.cuts.map((c) => c.id);
        const rows = collectShotRowRects(wrap);
        const wr = wrap.getBoundingClientRect();
        const wrapY = clientYToWrapY(lastClientY, wr.top, wrap.scrollTop);
        const empty = emptySceneDropTarget(collectEmptySceneRects(wrap), wrapY);
        if (empty) {
          drop = { toIndex: 0, toGroupId: empty.groupId, lineY: 0, emptyScene: true };
          indicator.hidden = true;
        } else {
          drop = shotsDropTarget(order, rows, wrapY);
          indicator.hidden = false;
          indicator.style.top = `${drop.lineY}px`;
        }
        const hi = dropHighlight(tl.groups || [], movingIds(), drop.toGroupId);
        const sec = hi.groupId
          ? wrap.querySelector(`.gg-grp-sec[data-group-id="${CSS.escape(hi.groupId)}"]`)
          : wrap.querySelector(".gg-grp-sec.gg-grp-loose");
        setDropSec(sec, hi.crossScene);
      };
      const tickAutoScroll = () => {
        if (!scrollLoop) return;
        const wr = wrap.getBoundingClientRect();
        const delta = autoScrollDelta(lastClientY, wr.top, wr.bottom, 48, 16);
        if (delta !== 0) wrap.scrollTop += delta;
        refreshDropIndicator();
        scrollRaf = requestAnimationFrame(tickAutoScroll);
      };
      const stopScrollLoop = () => {
        scrollLoop = false;
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = 0;
      };
      const startScrollLoop = () => {
        if (scrollLoop) return;
        scrollLoop = true;
        scrollRaf = requestAnimationFrame(tickAutoScroll);
      };
      const onEsc = (ev) => {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        aborted = true;
        cancel();
      };
      const cancel = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        window.removeEventListener("keydown", onEsc);
        stopScrollLoop();
        indicator.hidden = true;
        setDropSec(null);
        wrap.classList.remove("gg-reorder-dragging");
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
          wrap.classList.add("gg-reorder-dragging");
          el.classList.add("gg-moving");
          movingIds().forEach((id) => {
            root.querySelector(`.gg-cut[data-cut-id="${CSS.escape(id)}"]`)?.classList.add("gg-moving");
          });
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
          window.addEventListener("keydown", onEsc);
          startScrollLoop();
        }
        lastClientY = ev.clientY;
        refreshDropIndicator();
      };
      const up = async () => {
        const wasActive = active;
        cancel();
        if (!wasActive || aborted) return;
        const tl = state.timeline;
        if (!tl) return;
        const order0 = tl.cuts.map((c) => c.id);
        const ids = movingIds();
        const r = drop.emptyScene
          ? moveToScene(order0, groupsClone(), ids, drop.toGroupId)
          : moveCuts(order0, groupsClone(), ids, { toIndex: dropRestIndex(order0, ids, drop.toIndex), toGroupId: drop.toGroupId });
        const order = listOrder(r.order, r.groups);
        const same =
          order.length === order0.length &&
          order.every((id, i) => id === order0[i]) &&
          JSON.stringify(r.groups) === JSON.stringify(tl.groups || []);
        if (same) return;
        await commitShotsReorder(order, r.groups, { moveCount: ids.length });
      };
      shotsUi.dragSession = { cancel };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  });
  bindSceneHeadReorder(root, wrap, indicator);
}

/** Drag a scene header to move the whole scene between other scenes (same save/undo path as cut drags). */
function bindSceneHeadReorder(root, wrap, indicator) {
  root.querySelectorAll(".gg-grp-sec[data-group-id] > .gg-grp-head").forEach((head) => {
    const sec = head.closest(".gg-grp-sec");
    const gid = sec?.dataset?.groupId;
    if (!gid || head._ggSceneDrag) return;
    head._ggSceneDrag = true;
    head.classList.add("gg-grp-drag");
    head.addEventListener("mousedown", (e) => {
      if (e.button === 0 && !e.target.closest("button")) e.preventDefault();
    });
    head.addEventListener("pointerdown", (e) => {
      if (!isNativeProject() || e.button) return;
      if (e.target.closest("input, textarea, button, select, a")) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let active = false;
      let aborted = false;
      let drop = null;
      let lastClientY = startY;
      let scrollRaf = 0;
      const otherSections = () => {
        const wr = wrap.getBoundingClientRect();
        return [...wrap.querySelectorAll(".gg-grp-sec[data-group-id]")]
          .filter((s) => s.dataset.groupId !== gid)
          .map((s) => {
            const r = s.getBoundingClientRect();
            return {
              groupId: s.dataset.groupId,
              top: r.top - wr.top + wrap.scrollTop,
              bottom: r.bottom - wr.top + wrap.scrollTop,
            };
          });
      };
      const refreshDropIndicator = () => {
        const wr = wrap.getBoundingClientRect();
        drop = sceneDropTarget(otherSections(), clientYToWrapY(lastClientY, wr.top, wrap.scrollTop));
        indicator.hidden = !drop;
        if (drop) indicator.style.top = `${drop.lineY}px`;
      };
      const tickAutoScroll = () => {
        const wr = wrap.getBoundingClientRect();
        const delta = autoScrollDelta(lastClientY, wr.top, wr.bottom, 48, 16);
        if (delta !== 0) wrap.scrollTop += delta;
        refreshDropIndicator();
        scrollRaf = requestAnimationFrame(tickAutoScroll);
      };
      const onEsc = (ev) => {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        aborted = true;
        cancel();
      };
      const cancel = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        window.removeEventListener("keydown", onEsc);
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = 0;
        indicator.hidden = true;
        wrap.classList.remove("gg-reorder-dragging");
        sec.classList.remove("gg-grp-moving");
        shotsUi.dragSession = null;
        ed.dragging = false;
      };
      const move = (ev) => {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        if (!active) {
          active = true;
          ed.dragging = true;
          wrap.classList.add("gg-reorder-dragging");
          sec.classList.add("gg-grp-moving");
          try { head.setPointerCapture(e.pointerId); } catch (_) {}
          window.addEventListener("keydown", onEsc);
          scrollRaf = requestAnimationFrame(tickAutoScroll);
        }
        lastClientY = ev.clientY;
        refreshDropIndicator();
      };
      const up = async () => {
        const wasActive = active;
        cancel();
        if (!wasActive || aborted || !drop) return;
        const tl = state.timeline;
        if (!tl) return;
        const order0 = tl.cuts.map((c) => c.id);
        const groups0 = groupsClone();
        const beforeCutId = sceneDropBeforeCut(order0, groups0, gid, drop.beforeGroupId);
        const r = moveScene(order0, groups0, gid, { beforeCutId });
        if (!r.changed) return;
        const moving = new Set(groups0.find((g) => g.id === gid)?.cut_ids || []);
        await commitShotsReorder(r.order, r.groups, { moveCount: order0.filter((id) => moving.has(id)).length });
      };
      shotsUi.dragSession = { cancel };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  });
}

function refreshFieldTextUnsavedClasses() {
  const capDegraded = cutFieldUi.captionDegraded;
  document.querySelectorAll(".gg-shots .gg-caption-text").forEach((ta) => {
    const id = ta.closest(".gg-cut")?.dataset?.cutId;
    const pending = id && (cutFieldUi.unsaved[id] || (cutFieldUi.pending.get(id)?.fields || null));
    const unsaved = capDegraded || (pending && Object.keys(pending).length);
    ta.classList.toggle("gg-field-unsaved", !!unsaved);
    if (capDegraded) {
      ta.title = "Not saved yet – server restart needed";
    } else if (isCardFieldEditing(ta)) {
      ta.title = CARD_EDIT_ACTIVE_TIP;
    } else if (!ta.disabled) {
      ta.title = CARD_EDIT_IDLE_TIP;
    }
  });
}

function showCaptionDegradeToast() {
  if (captionDegradeToastShown) return;
  captionDegradeToastShown = true;
  ggToast(
    "Captions can't be saved yet",
    "The server needs a one-time ComfyUI restart to enable captions. Your text stays in this page until you reload.",
    "warn",
  );
}

async function saveCutFields(cutId, fields, reqPid = state.pid) {
  // reqPid is fixed when the edit was made (the debounce timer may fire after a project switch).
  if (!reqPid || !isNativePid(reqPid)) return;
  cutFieldUi.unsaved[cutId] = { ...(cutFieldUi.unsaved[cutId] || {}), ...fields };
  refreshFieldTextUnsavedClasses();
  if (cutFieldUi.routeMissing && !fields.caption) return;
  if (cutFieldUi.captionDegraded && Object.keys(fields).length > 0 && Object.keys(fields).every((k) => k === "caption")) return;
  try {
    const data = await postJson("/gonggan/cut/update", { pid: reqPid, cut_id: cutId, fields });
    if (data.timeline) {
      const row = (data.timeline.cuts || []).find((c) => c.id === cutId);
      if (fields.caption != null && row && !Object.prototype.hasOwnProperty.call(row, "caption")) {
        cutFieldUi.captionDegraded = true;
        showCaptionDegradeToast();
      }
      if (reqPid === state.pid) {
        adoptMutationTimeline(adoptServerTimeline(data.timeline), reqPid);
        state.error = "";
      }
      const keys = Object.keys(fields);
      if (reqPid === state.pid && !isSilentFieldSave(fields)) bus.dispatchEvent(new Event("timeline"));
      const bucket = cutFieldUi.unsaved[cutId];
      if (bucket) {
        for (const k of keys) {
          if (k === "caption" && cutFieldUi.captionDegraded) continue;
          delete bucket[k];
        }
        if (!Object.keys(bucket).length) delete cutFieldUi.unsaved[cutId];
      }
      refreshFieldTextUnsavedClasses();
    }
  } catch (e) {
    const kind = classifySaveFailure(e.status);
    if (kind === "route-missing") {
      cutFieldUi.routeMissing = true;
      if (!routeMissingToastShown) {
        routeMissingToastShown = true;
        ggToast(
          "Changes can't be saved yet",
          "The server needs a one-time ComfyUI restart to enable saving. Your edits stay in this page until you reload.",
          "warn",
        );
      }
      refreshFieldTextUnsavedClasses();
      return;
    }
    if (fields.caption != null && isCaptionSaveRejected(e.status, e.message)) {
      cutFieldUi.captionDegraded = true;
      showCaptionDegradeToast();
      refreshFieldTextUnsavedClasses();
      return;
    }
    const now = Date.now();
    if (now - cutFieldSaveFailToastAt >= 10000) {
      cutFieldSaveFailToastAt = now;
      ggToast("Save failed", e.message, "warn");
    }
  }
}

function scheduleCutFieldSave(cutId, fields) {
  cutFieldUi.unsaved[cutId] = { ...(cutFieldUi.unsaved[cutId] || {}), ...fields };
  refreshFieldTextUnsavedClasses();
  clearTimeout(cutFieldUi.timer);
  cutFieldUi.pending.add(cutId, state.pid, fields);
  cutFieldUi.timer = setTimeout(flushPendingCutFields, 400);
}

// Send any debounced field edit right now (project switch, page hide, ...).
function flushPendingCutFields() {
  clearTimeout(cutFieldUi.timer);
  cutFieldUi.timer = 0;
  // Returns a promise so callers that are about to remove the project can wait for the saves.
  return Promise.allSettled(Array.from(cutFieldUi.pending.takeAll(), (p) => saveCutFields(p.cutId, p.fields, p.pid)));
}

async function saveProjectDue(value) {
  if (!isNativeProject() || !state.pid) return;
  try {
    const reqPid = state.pid;
    const data = await postJson("/gonggan/project/update", { pid: reqPid, fields: { due_date: value || null } });
    if (data.timeline) adoptMutationTimeline(data.timeline, reqPid);
    if (data.projects) state.projects = data.projects;
    state.error = "";
    bus.dispatchEvent(new Event("projects"));
    bus.dispatchEvent(new Event("timeline"));
    paintProjectSummary(null);
  } catch (e) {
    ggToast("Due date", e.message, "warn");
  }
}

function exportCaptionsSrt() {
  const tl = state.timeline;
  if (!tl) return;
  const srt = buildSrt(tl.cuts || []);
  if (!srt.trim()) {
    ggToast("No captions to export", "Add Caption text to at least one cut first.", "warn");
    return;
  }
  const name = srtFileName(tl.project?.name || "captions");
  const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
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
  const labels = computeCutLabels(tl);
  const r = finalCutList(tl);
  const items = r.items.map((it) => {
    const cut = tl.cuts.find((c) => c.id === it.cutId) || {};
    const warn = lengthWarning(cut);
    const fname = fileBaseName(cut, null, versionIndexFromList(cut.versions_list, it.versionId));
    const capLine = effectiveCaption(cut).replace(/\s+/g, " ").trim();
    return `
      <li class="gg-final-item" data-cut-id="${esc(it.cutId)}">
        <span class="gg-num">${esc(cutDisplayLabel(cut, labels))}</span>
        <div class="gg-final-thumb">${thumbHtml(cut.media, "gg-thumb")}</div>
        <div class="gg-final-meta">
          <div class="gg-final-name">${esc(it.name)}</div>
          <div class="gg-final-sub">${esc(it.sceneName || "—")} · ${effectiveLenLabel(cut)} · ${esc(fname)} · ${esc(it.versionLabel)}</div>
          ${capLine ? `<div class="gg-final-cap" title="${esc(capLine)}">${esc(capLine)}</div>` : ""}
          ${warn ? `<span class="gg-warn3" title="${esc(warn.message)}">&gt; 3s</span>` : ""}
        </div>
      </li>`;
  }).join("");
  const miss = r.missingBest.length
    ? `<div class="gg-final-miss">${r.missingBest.length} cut${r.missingBest.length === 1 ? "" : "s"} have no Best yet</div>`
    : "";
  return `
    <div class="gg-final-list">
      <div class="gg-final-head">
        <button type="button" class="gg-btn gg-export-srt" title="Download an .srt of the Caption texts, timed from the current cut order and lengths. In Premiere: File &gt; Import.">Export captions (.srt)</button>
      </div>
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
    lenIn.placeholder = plannedLenInputPlaceholder(c);
    lenIn.title = nat ? "Planned length (seconds). Leave empty to use the default." : roTip;
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
  const labels = computeCutLabels(state.timeline);
  const head = cutHeaderParts(c, state.timeline, labels);
  document.querySelectorAll(`.gg-cut[data-cut-id="${CSS.escape(cutId)}"]`).forEach((li) => {
    const num = li.querySelector(".gg-num");
    if (num) num.textContent = head.cutLabel;
    const len = li.querySelector(".gg-cut-len");
    if (len) {
      const liInfo = formatCutHeaderLengths(c);
      len.textContent = liInfo.text;
      len.title = liInfo.title;
    }
    const warn = lengthWarning(c);
    let wEl = li.querySelector(".gg-warn3");
    if (warn) {
      if (!wEl) {
        wEl = document.createElement("span");
        wEl.className = "gg-warn3";
        li.querySelector(".gg-cut-header-badges")?.appendChild(wEl);
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
        li.querySelector(".gg-cut-header-badges")?.appendChild(ec);
      }
      ec.hidden = false;
      ec.textContent = "End card";
    } else if (ec) ec.hidden = true;
    let rd = li.querySelector(".gg-redo-badge");
    if (c.needs_redo) {
      if (!rd) {
        rd = document.createElement("span");
        rd.className = "gg-redo-badge";
        li.querySelector(".gg-cut-header-badges")?.appendChild(rd);
      }
      rd.hidden = false;
      rd.textContent = "Needs redo";
    } else if (rd) rd.hidden = true;
  });
}

function cutRowHtml(c, labels) {
  const kind = rowContentKind(shotsUi.listMode);
  const content = kind === "caption" ? captionRowContent(c) : infoRowContent(c, labels);
  return cutRowShellHtml({ id: c.id, kind, selected: state.cutSel.has(c.id), content });
}

function captionRowContent(c) {
  const nat = isNativeProject();
  return captionRowContentHtml({
    thumb: cutThumbHtml(c),
    text: effectiveCaption(c),
    placeholder: captionFieldPlaceholder(projectCaptionLang()),
    title: nat ? CARD_EDIT_IDLE_TIP : NATIVE_READONLY_TIP,
    native: nat,
  });
}

function cutThumbHtml(c) {
  return `<div class="gg-cut-thumb">${thumbHtml(c.media, "gg-thumb")}${c.media && c.media.kind === "video" ? '<span class="gg-badge">▶</span>' : ""}${c.media && c.media.source && c.media.source !== "gonggan" ? `<span class="gg-badge gg-badge-l gg-src-${esc(c.media.source)}">${esc(fmtSrc(c.media.source))}</span>` : ""}</div>`;
}

function infoRowContent(c, labels) {
  const nat = isNativeProject();
  const timelineOrder = state.timeline?.cuts?.map((x) => x.id) ?? [];
  const canUp = nat && canMoveUp(timelineOrder, [c.id]);
  const canDown = nat && canMoveDown(timelineOrder, [c.id]);
  const warn = lengthWarning(c);
  const lenInfo = formatCutHeaderLengths(c);
  const verInfo = formatCutVersionStatus(c);
  const head = cutHeaderParts(c, state.timeline, labels);
  const idle = idleStateView(!!c.media?.id);
  const nameTitle = `${c.story || c.prompt || c.name || ""}`.trim();
  const headName = head.name && cutShowsEditedMarker(c) ? `${head.name} *` : head.name;
  const headerBadges = [
    warn ? `<span class="gg-warn3" title="${esc(warn.message)}">&gt; 3s</span>` : "",
    c.end_card ? `<span class="gg-endcard-badge">End card</span>` : "",
    c.needs_redo ? `<span class="gg-redo-badge">Needs redo</span>` : "",
  ].filter(Boolean).join("");
  const stageDots = `<span class="gg-stage-dot gg-off" data-k="image"></span><span class="gg-stage-dot gg-off" data-k="video"></span><span class="gg-stage-dot gg-off" data-k="best"></span>`;
  return `
      <div class="gg-cut-thumb-col">
        ${cutThumbHtml(c)}
        <div class="gg-live-chip" hidden><span class="gg-live-dot"></span><span class="gg-live-text"></span></div>
      </div>
      <div class="gg-cut-text">
        <div class="gg-cut-header" title="${esc(nameTitle)}">
          ${isNativeProject() ? '<span class="gg-drag-handle" title="Drag to reorder (or Alt+Up/Down)" aria-hidden="true">\u22EE\u22EE</span>' : ""}
          <span class="gg-cut-head"><span class="gg-num">${esc(head.cutLabel)}</span> <span class="gg-cut-title">${esc(headName)}</span></span>
          ${headerBadges ? `<span class="gg-cut-header-badges">${headerBadges}</span>` : ""}
          <div class="gg-stage-row" title="">${stageDots}</div>
        </div>
        <div class="gg-cut-status">
          <span class="gg-cut-state"><span class="gg-render-badge" hidden><span class="gg-rs-dot"></span><span class="gg-rs-text"></span><span class="gg-rs-pos"></span></span><span class="gg-cut-idle" title="${esc(idle.title)}">${esc(idle.text)}</span></span>
          <span class="gg-cut-cur" title="${esc(verInfo.title)}">${esc(verInfo.text || "—")}</span>
          <span class="gg-cut-ver" title="${esc(verInfo.title)}">${esc(verInfo.detail)}</span>
          <span class="gg-cut-len" title="${esc(lenInfo.title)}">${esc(lenInfo.text)}</span>
        </div>
      </div>
      ${nat ? `<div class="gg-move-col">
          <button type="button" class="gg-move-btn gg-move-up" title="Move up" aria-label="Move up"${canUp ? "" : " disabled"}>\u25B2</button>
          <button type="button" class="gg-move-btn gg-move-down" title="Move down" aria-label="Move down"${canDown ? "" : " disabled"}>\u25BC</button>
        </div>` : ""}`;
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

function isTimelinePanelOpen() {
  const bp = app.extensionManager?.bottomPanel;
  return !!(bp?.bottomPanelVisible && bp.activeBottomPanelTabId === TIMELINE_TAB);
}

function shotsSidebarActive() {
  return app.extensionManager?.sidebarTab?.activeSidebarTabId === SHOTS_TAB;
}

/** Hover flag (mouseenter/mouseleave) counts only while the element is still laid out. */
function ggElHovered(el) {
  return !!(el && el._ggHover && el.isConnected && el.getClientRects().length > 0);
}

function ggElHasFocus(el) {
  const ae = document.activeElement;
  return !!(el && ae && ae !== document.body && el.contains(ae));
}

function ggModalOpen() {
  return !!document.querySelector(".gg-modal-backdrop");
}

function comfyPromptDialogOpen() {
  return !!document.querySelector(".p-dialog-mask, .p-dialog-enter-active, .p-dialog-visible");
}

function measureBottomPanelHeight() {
  const panel = document.querySelector(".bottom-panel");
  if (!panel || !isTimelinePanelOpen()) return 0;
  return panel.getBoundingClientRect().height;
}

let timelineHeightRestoreRaf = 0;
let timelineHeightObserver = null;
// No saved height yet: the first Timeline show shrinks ComfyUI's default bottom panel height by half.
let timelineFirstShowPending = loadTimelineHeight(localStorage) == null;

function canvasSplitter() {
  const gutter = document.querySelector('[data-testid="graph-canvas-gutter"]');
  return gutter?.closest(".p-splitter") || null;
}

/** Shrink the bottom panel to `want` px: same flex-basis form PrimeVue's Splitter writes, plus its saved state. */
function shrinkBottomPanelTo(panel, want) {
  const splitter = canvasSplitter();
  const total = splitter ? splitter.getBoundingClientRect().height : 0;
  if (!splitter || total <= want + 40) return;
  const panes = [...splitter.children].filter((x) => x.getAttribute("data-pc-name") === "splitterpanel");
  const bi = panes.indexOf(panel);
  if (panes.length !== 2 || bi < 0) return;
  const bottomPct = bottomPanelPercent(want, total);
  const basis = (el, pct) => {
    const cur = el.style.flexBasis || "";
    el.style.flexBasis = /^calc\(\s*[\d.]+%/.test(cur) ? cur.replace(/^calc\(\s*[\d.]+%/, `calc(${pct}%`) : `${pct}%`;
  };
  basis(panes[bi], bottomPct);
  basis(panes[1 - bi], 100 - bottomPct);
  try {
    localStorage.setItem("bottom-panel-splitter", JSON.stringify(bi === 1 ? [100 - bottomPct, bottomPct] : [bottomPct, 100 - bottomPct]));
  } catch (_) {}
}

function applyStoredTimelinePanelHeight() {
  if (!isTimelinePanelOpen()) return;
  const panel = document.querySelector(".bottom-panel");
  if (!panel) return;
  const cur = panel.getBoundingClientRect().height;
  if (timelineFirstShowPending) {
    if (cur < 60) return;  // not laid out yet
    timelineFirstShowPending = false;
    const want = firstShowTimelineHeight(cur, window.innerHeight);
    if (want < cur - 8) shrinkBottomPanelTo(panel, want);
    panel.style.minHeight = `${want}px`;
    saveTimelineHeight(localStorage, want);
    window.dispatchEvent(new Event("resize"));
    return;
  }
  const stored = loadTimelineHeight(localStorage);
  const want = clampHeight(stored || TIMELINE_MIN_HEIGHT, window.innerHeight, TIMELINE_MIN_HEIGHT);
  if (cur >= want - 8 && cur >= TIMELINE_MIN_HEIGHT) return;
  const splitter = canvasSplitter();
  if (splitter) {
    const total = splitter.getBoundingClientRect().height;
    if (total > want + 40) {
      const bottomPct = bottomPanelPercent(want, total);
      try {
        localStorage.setItem("bottom-panel-splitter", JSON.stringify([100 - bottomPct, bottomPct]));
      } catch (_) {}
    }
  }
  panel.style.minHeight = `${want}px`;
  window.dispatchEvent(new Event("resize"));
}

function scheduleRestoreTimelinePanelHeight() {
  cancelAnimationFrame(timelineHeightRestoreRaf);
  let frames = 0;
  const step = () => {
    applyStoredTimelinePanelHeight();
    frames += 1;
    if (frames < 10) timelineHeightRestoreRaf = requestAnimationFrame(step);
  };
  timelineHeightRestoreRaf = requestAnimationFrame(step);
}

function startTimelineHeightObserver() {
  if (timelineHeightObserver) return;
  const panel = document.querySelector(".bottom-panel");
  if (!panel || !window.ResizeObserver) return;
  timelineHeightObserver = new ResizeObserver(() => {
    if (!isTimelinePanelOpen() || timelineFirstShowPending) return;
    const h = measureBottomPanelHeight();
    if (h >= TIMELINE_MIN_HEIGHT) {
      saveTimelineHeight(localStorage, clampHeight(h, window.innerHeight, TIMELINE_MIN_HEIGHT));
    }
  });
  timelineHeightObserver.observe(panel);
}

function syncTimelineToggleButtons() {
  const open = loadTimelineOpen(localStorage);
  document.querySelectorAll(".gg-timeline-toggle").forEach((btn) => {
    btn.setAttribute("aria-pressed", open ? "true" : "false");
    btn.classList.toggle("gg-on", open);
    btn.title = timelineToggleTooltip(open);
  });
}

function openTimelinePanelInternal() {
  const cmd = app.extensionManager?.command;
  if (!cmd?.execute) return;
  if (isTimelinePanelOpen()) {
    scheduleRestoreTimelinePanelHeight();
    return;
  }
  cmd.execute(`Workspace.ToggleBottomPanelTab.${TIMELINE_TAB}`);
  scheduleRestoreTimelinePanelHeight();
  requestAnimationFrame(startTimelineHeightObserver);
}

function openTimelinePanelIfAllowed() {
  if (!loadTimelineOpen(localStorage)) return;
  openTimelinePanelInternal();
}

function closeTimelinePanel() {
  const cmd = app.extensionManager?.command;
  if (!cmd?.execute) return;
  if (!isTimelinePanelOpen()) return;
  const h = measureBottomPanelHeight();
  if (h >= TIMELINE_MIN_HEIGHT && !timelineFirstShowPending) {
    saveTimelineHeight(localStorage, clampHeight(h, window.innerHeight, TIMELINE_MIN_HEIGHT));
  }
  cmd.execute(`Workspace.ToggleBottomPanelTab.${TIMELINE_TAB}`);
}

function setTimelineUserOpen(open) {
  saveTimelineOpen(localStorage, open);
  if (open) openTimelinePanelInternal();
  else closeTimelinePanel();
  syncTimelineToggleButtons();
}

function toggleTimelinePanel() {
  setTimelineUserOpen(!loadTimelineOpen(localStorage));
}

function onTimelineToggleKey(e) {
  if (shouldIgnoreShortcut({
    key: e.key,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
    target: e.target,
    isComposing: e.isComposing,
    modalOpen: ggModalOpen(),
    promptDialogOpen: comfyPromptDialogOpen(),
  })) return;
  const shots = [...document.querySelectorAll(".gg-root.gg-shots")];
  const tls = [...document.querySelectorAll(".gg-timeline")];
  const allowed = timelineShortcutAllowed({
    hoverShots: shots.some(ggElHovered),
    focusShots: shots.some(ggElHasFocus),
    hoverTimeline: tls.some(ggElHovered),
    focusTimeline: tls.some(ggElHasFocus),
  });
  if (!allowed) return;
  e.preventDefault();
  e.stopPropagation();
  toggleTimelinePanel();
}

// Window capture, like Shots Ctrl+A: ComfyUI's own Ctrl+Z (graph undo) must not run while the pointer or
// focus is in Shots / Timeline, or one of them was clicked last; otherwise (canvas clicked last, inputs,
// menus, dialogs) the key is left alone.
function onUndoRedoKey(e) {
  const action = undoKeyAction(e);
  if (!action) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""))) return;
  const ae = document.activeElement;
  if (ae && ae !== t && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName || ""))) return;
  if (ggModalOpen() || comfyPromptDialogOpen() || ctxUi.el) return;
  if (document.querySelector(".p-contextmenu, .p-menu-overlay, .p-tieredmenu-overlay, .p-select-overlay")) return;
  const shots = [...document.querySelectorAll(".gg-root.gg-shots")];
  const tls = [...document.querySelectorAll(".gg-root.gg-timeline")];
  const shown = (el) => el.isConnected && el.getClientRects().length > 0;
  const lastShown = (undoLastArea === "shots" && shots.some(shown)) || (undoLastArea === "timeline" && tls.some(shown));
  const scope = undoScope({
    hoverShots: shots.some(ggElHovered),
    focusShots: shots.some(ggElHasFocus),
    hoverTimeline: tls.some(ggElHovered),
    focusTimeline: tls.some(ggElHasFocus),
    last: lastShown || !undoLastArea ? undoLastArea : "other",
  });
  if (!scope) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat || ed.dragging || shotsUi.dragSession) return;
  if (scope === "timeline") stepTimelineHistory(action);
  else void stepShotsHistory(action);
}

function trackUndoArea(e) {
  const t = e.target;
  if (!(t instanceof Element)) return;
  undoLastArea = nextUndoArea(undoLastArea, {
    overlay: !!t.closest(".gg-ctx, .gg-modal-backdrop, .gg-toast-host"),
    timeline: !!t.closest(".gg-root.gg-timeline"),
    shots: !!t.closest(".gg-root.gg-shots"),
    focus: e.type === "focusin",
  });
}

/** Open Timeline when Shots becomes visible; close when Shots sidebar deactivates (if Timeline tab is active). */
function bindShotsTabActivated(hostEl, onCleanup) {
  let wasShown = false;
  const syncDom = () => {
    if (!hostEl.isConnected) return;
    const r = hostEl.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0 && hostEl.offsetParent !== null;
    if (shown && !wasShown) {
      openTimelinePanelIfAllowed();
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

/**
 * Bottom bars of the Shots sidebar (selection bar when SHOW_SEL_BAR, icon row): always shown at a fixed
 * height so the list never shifts; actions off with nothing selected. Also sets the status panel Queue
 * button, which acts on the same selection.
 */
function updateSelectionBar(root) {
  if (!root) return;
  const tlIds = new Set((state.timeline?.cuts || []).map((c) => c.id));
  const ids = state.timeline ? cutSelIds().filter((id) => tlIds.has(id)) : [];
  const n = ids.length;
  const setBtn = (scope, sel, disabled, title) => {
    const b = scope.querySelector(sel);
    if (!b) return;
    b.disabled = !!disabled;
    if (title !== undefined) b.title = title;
  };
  const bar = root.querySelector(".gg-selbar");
  if (bar) {
    const v = selectionBarView({ count: n, anyGrouped: ids.some((id) => cutById(id)?.group_id), selSize: state.cutSel.size });
    bar.className = v.className;
    const countEl = bar.querySelector(".gg-sel-count");
    if (countEl) countEl.textContent = v.countText;
    setBtn(bar, ".gg-sel-group", v.group.disabled);
    setBtn(bar, ".gg-sel-ungroup", v.ungroup.disabled);
    setBtn(bar, ".gg-sel-x", v.clear.disabled);
  }
  const hasProject = !!currentProject();
  const row = root.querySelector(".gg-iconrow");
  if (row) {
    const r = iconRowView({ count: n, hasProject, native: isNativeProject() });
    setBtn(row, ".gg-ir-scene", r.scene.disabled, r.scene.title);
    setBtn(row, ".gg-ir-cut", r.cut.disabled, r.cut.title);
    setBtn(row, ".gg-ir-del", r.del.disabled, r.del.title);
  }
  const q = queueButtonState({ count: n, native: isNativeProject(), busy: !!sdk.busy, hasProject });
  const queueBtn = root.querySelector(".gg-queue-btn");
  if (queueBtn) {
    queueBtn.disabled = q.disabled;
    queueBtn.title = q.title;
  }
}

function paintSelection(root) {
  const shotTabOpen = isGongganShotTabOpenAndActive();
  const openCutId = wfLastLoadedCutId;
  const sameProject =
    !wfLastLoadedProjectId || !state.pid || wfLastLoadedProjectId === state.pid;
  root.querySelectorAll("[data-cut-id]").forEach((el) => {
    const id = el.dataset.cutId;
    el.classList.toggle("gg-on", id === state.cutId);
    el.classList.toggle("gg-sel", state.cutSel.has(id));
    if (el.classList.contains("gg-cut")) {
      const showOpen = shouldShowOpenTabMarker({
        cutId: id,
        openCutId,
        selectedCutId: state.cutId,
        shotTabOpen,
        sameProject,
      });
      el.classList.toggle("gg-open-tab", showOpen);
      const thumb = el.querySelector(".gg-cut-thumb");
      if (thumb) {
        if (showOpen) thumb.title = "Open in canvas";
        else thumb.removeAttribute("title");
      }
    }
  });
  const on = root.querySelector(`[data-cut-id="${CSS.escape(state.cutId)}"]`);
  const view = on?.closest(".gg-grp-wrap, .gg-final-wrap");
  if (on && view) {
    const r = on.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    if (rowFullyHidden({ viewTop: v.top, viewBottom: v.bottom, rowTop: r.top, rowBottom: r.bottom })) {
      on.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
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

const fmtSrc = (s) => ({ gonggan: "Import", "local-sdk": "SDK", "comfy-history": "Comfy", "comfy-output-folder": "Comfy" }[s] || s || "");

async function postJson(route, body) {
  const res = await api.fetchApi(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function repIdOf(c) {
  return (c && (c.pick || (c.media && c.media.id))) || "";
}

function recomputeCutStarts() {
  const tl = state.timeline;
  if (!tl) return;
  const clips = trackClips();
  const { starts, total } = layoutTrack(clips, isFreeTrack());
  clips.forEach((c, i) => { c.start = starts[i]; });
  tl.total_sec = total;
}

/** Optimistic promote: swap timeline media + clamp trim, then persist via /gonggan/edit. */
function applyPickLocally(c, vid) {
  if (!c || !vid || c.pick === vid) return false;
  const v = (c.versions_list || []).find((x) => x.id === vid);
  if (!v) return false;
  c.pick = vid;
  c.media = versionMedia(v);
  c.src_dur = c.media && c.media.kind === "video" ? Math.max(0, Number(v.seconds) || 0) : 0;
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
  if (ok) {
    if (
      cutId === wfLastLoadedCutId &&
      state.pid === wfLastLoadedProjectId &&
      isGongganShotTabOpenAndActive()
    ) {
      const loadToken = ++wfLoadToken;
      loadCutWorkflow(cutId, c, loadToken).catch((e) => console.warn("[gonggan] rep workflow reload failed", e));
    }
    return;
  }
  const v = (c.versions_list || []).find((x) => x.id === prev.pick);
  c.pick = prev.pick;
  c.media = prev.media || versionMedia(v);
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
    const ok = await askConfirm({ message:
      `Queue ONE generation job on this PC's GPU?\n\nCut ${p.cut_no}. ${p.cut_name}\nModel: ${p.model}\nSteps: ${p.steps} · CFG ${p.cfg} · ${p.sampler}\n` +
      `Size: ~${p.approx_size} (${p.megapixels} MP, ${p.aspect})\nSeed: ${p.seed}\n\nPrompt:\n${p.prompt.slice(0, 400)}` });
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

/** Resolves once no cut/version workflow load is queued or debounced. */
async function waitCutLoadsSettled() {
  for (;;) {
    const seq = ggCutLoadSeq;
    await seq;
    if (seq === ggCutLoadSeq && !wfLoadDebounce) return;
  }
}

function nativeRegenCheck(cutId, token) {
  const g = app.graph?.extra?.gonggan;
  return nativeRegenQueueCheck({
    token,
    currentToken: wfLoadToken,
    cutId,
    projectId: state.pid,
    loadedCutId: wfLastLoadedCutId,
    loadedProjectId: wfLastLoadedProjectId,
    graphCutId: g?.cutId || "",
    graphProjectId: gongganExtraProjectId(g) || "",
    tabActive: isGongganShotTabOpenAndActive(),
    nodeCount: activeGraphNodeCount(),
  });
}

/**
 * Native Regen: open the cut's current workflow through the normal cut-open path (the same cut already
 * open is queued as is), confirm, then queue it like ComfyUI's Queue button so the prompt is tied to the cut.
 */
async function regenNativeCut(cutId) {
  const cut = cutById(cutId);
  if (!cut || !state.timeline || sdk.busy) return;
  const title = shotTitle(cut);
  sdk.busy = "regen";
  bus.dispatchEvent(new Event("sdk"));
  try {
    selectCut(cutId);
    const token = wfLoadToken;
    await waitCutLoadsSettled();
    let check = nativeRegenCheck(cutId, token);
    if (check.ok) {
      if (!(await askConfirm({ message: regenConfirmMessage(title) }))) {
        sdk.msg = "Not queued (cancelled).";
        return;
      }
      check = nativeRegenCheck(cutId, token);
    }
    if (!check.ok) {
      sdk.msg = REGEN_SKIP_MESSAGE[check.reason];
      ggToast("Regen", `${title} — ${sdk.msg}`, "warn");
      return;
    }
    const before = ggLastRegisteredPrompt;
    await app.queuePrompt(0, 1);
    const reg = ggLastRegisteredPrompt;
    if (reg && reg !== before && reg.cutId === cutId && reg.projectId === state.pid) {
      sdk.msg = `Queued: ${title}`;
      ggToast("Queued", title, "ok");
    }
  } catch (e) {
    sdk.msg = "Regen failed: " + (e?.message || e);
    ggToast("Regen", sdk.msg, "warn");
  } finally {
    sdk.busy = "";
    bus.dispatchEvent(new Event("sdk"));
  }
}

const batchRenderUi = { running: false };

/** Cut ids in Shots list order (final cut list view or scene sections) and the ones hidden in collapsed scenes. */
function shotsNavOrder() {
  const tl = state.timeline;
  if (!tl) return { order: [], hidden: [] };
  if (shotsViewOf(SHOW_FINAL_LIST, shotsUi.view) === "final") return { order: finalCutList(tl).items.map((it) => it.cutId), hidden: [] };
  const cuts = redoFilterOn(SHOW_REDO_FILTER, shotsUi.needsRedoOnly) ? filterCuts(tl.cuts, { needsRedoOnly: true }) : tl.cuts;
  const order = [];
  const hidden = [];
  for (const sec of shotsSections(cuts, tl.groups || [])) {
    for (const c of sec.cuts) {
      order.push(c.id);
      if (sec.group?.collapsed) hidden.push(c.id);
    }
  }
  return { order, hidden };
}

/**
 * Queue: queue each selected cut's current workflow in Shots display order, through the native Regen
 * path (open the cut in its shot tab, then queue like ComfyUI's Queue button). One confirm for the batch;
 * empty cuts are skipped. The selection is restored afterwards. `cutIds` (Re-queue) replaces the selection.
 */
async function queueSelectedCuts(cutIds) {
  const tl = state.timeline;
  if (!tl || !isNativeProject() || sdk.busy || batchRenderUi.running) return;
  const selected = cutIds || cutSelIds();
  const ids = selectedInDisplayOrder(shotsNavOrder().order, tl.cuts.map((c) => c.id), selected);
  if (!ids.length) return;
  const plan = batchRenderPlan(ids, (id) => {
    const c = cutById(id);
    return {
      versionCount: (c?.versions_list || []).length || c?.versions || 0,
      nodeCount: regenKnownNodeCount({
        live: liveCutGraphNodeCount(id),
        remembered: ggCutGraphNodeCounts.get(`${state.pid}\n${id}`),
      }),
    };
  });
  let skipped = plan.skipped.length;
  if (!plan.queue.length) {
    const s = batchRenderSummary({ skipped });
    ggToast(s.summary, s.detail, s.kind);
    return;
  }
  const labels = plan.queue.map((id) => shotTitle(cutById(id)));
  if (!(await askConfirm({ message: batchRenderConfirmMessage(labels, skipped) }))) return;
  const pid = state.pid;
  const keepSel = [...state.cutSel];
  const total = plan.queue.length;
  let queued = 0;
  let failed = 0;
  let stopped = false;
  let i = 0;
  batchRenderUi.running = true;
  sdk.busy = "regen";
  renderStatus.startBatch();
  paintRenderGlobal();
  bus.dispatchEvent(new Event("sdk"));
  try {
    for (; i < total; i++) {
      const cutId = plan.queue[i];
      if (state.pid !== pid || !cutById(cutId)) break;
      sdk.msg = `Queue ${i + 1}/${total}: ${shotTitle(cutById(cutId))}`;
      selectCut(cutId);
      const token = wfLoadToken;
      await waitCutLoadsSettled();
      const check = nativeRegenCheck(cutId, token);
      if (check.reason === "superseded") {
        stopped = true;
        break;
      }
      if (!check.ok) {
        if (check.reason === "empty") skipped++;
        else failed++;
        continue;
      }
      const before = ggLastRegisteredPrompt;
      await app.queuePrompt(0, 1);
      const reg = ggLastRegisteredPrompt;
      if (reg && reg !== before && reg.cutId === cutId && reg.projectId === pid) {
        const changed = renderStatus.queued(reg.promptId, { cutId, projectId: pid });
        renderStatus.addToBatch(reg.promptId);
        paintRenderStatus(changed);
        queued++;
      } else failed++;
    }
  } catch (e) {
    console.warn("[gonggan] queue selected failed", e);
  } finally {
    failed += total - Math.min(i, total);
    batchRenderUi.running = false;
    sdk.busy = "";
    if (state.pid === pid && !stopped && keepSel.length) {
      state.cutSel.clear();
      for (const id of keepSel) if (cutById(id)) state.cutSel.add(id);
      bus.dispatchEvent(new Event("select"));
    }
    const s = batchRenderSummary({ queued, skipped, failed, stopped });
    sdk.msg = [s.summary, s.detail].filter(Boolean).join(" ");
    bus.dispatchEvent(new Event("sdk"));
    ggToast(s.summary, s.detail, s.kind);
  }
}

/** Cut menu Remove from queue: delete the cuts' still-waiting prompts (POST /queue) and clear their badges. */
async function removeCutsFromQueue(cutIds) {
  const pid = state.pid;
  const promptIds = cutIds.flatMap((id) => renderStatus.queuedPromptIds(pid, id));
  if (!promptIds.length) return;
  try {
    const res = await api.fetchApi("/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queueDeleteBody(promptIds)),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    ggToast("Remove from queue failed", String(e?.message || e), "warn");
    return;
  }
  paintRenderStatus(renderStatus.removed(promptIds));
  ggToast(`Removed ${promptIds.length} from queue`, "", "ok");
  syncProgressQueue();
}

function readJobsList() {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

async function sendLastOutput(cutId) {
  const tl = state.timeline;
  if (!tl) return;
  sdk.busy = "send"; sdk.msg = "Looking for the last ComfyUI output…"; bus.dispatchEvent(new Event("sdk"));
  try {
    let lastPromptId = null;
    try {
      const lo = await getJson("/gonggan/last-output");
      lastPromptId = lo?.output?.prompt_id ?? lo?.output?.promptId ?? null;
    } catch (_) {}
    const cutIds = tl.cuts.map((c) => c.id);
    const { cutId: targetId, redirected } = resolveSendTarget({
      lastPromptId,
      jobs: readJobsList(),
      projectId: tl.project.id,
      selectedCutId: cutId,
      cutIds,
    });
    const sendId = targetId || cutId;
    const d = await postJson("/gonggan/send-output", { pid: tl.project.id, cut_id: sendId });
    const targetCut = tl.cuts.find((c) => c.id === sendId);
    const num = cutDisplayLabel(targetCut, computeCutLabels(tl));
    const name = targetCut?.name || "";
    const age = Number(d.output?.age_sec);
    const ageTxt = Number.isFinite(age) ? `, made ${age < 90 ? `${Math.round(age)} s` : age < 5400 ? `${Math.round(age / 60)} min` : `${Math.round(age / 3600)} h`} ago` : "";
    sdk.msg = `Added ${d.output.name} (${d.output.from}${ageTxt}) to cut ${num}. ${name}${redirected ? " (the cut that queued it)" : ""}`;
    await loadTimeline();
  } catch (e) {
    sdk.msg = "Send failed: " + e.message;
  } finally {
    sdk.busy = "";
    bus.dispatchEvent(new Event("sdk"));
  }
}

/** execution_success of a prompt queued from a native cut: its output becomes a version of that cut. */
async function captureFinishedPrompt(promptId) {
  const t = autoCapture.take(promptId, readJobsList());
  if (!t) return;
  let res;
  let d = {};
  try {
    res = await api.fetchApi("/gonggan/capture-output", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: t.projectId, cut_id: t.cutId, prompt_id: String(promptId) }),
    });
    d = await res.json().catch(() => ({}));
  } catch (e) {
    d = { ok: false, message: String(e?.message || e) };
  }
  if (res && captureRouteMissing(res.status, d)) {
    if (!captureRestartToastShown) {
      captureRestartToastShown = true;
      ggToast("Render not added to its cut", "Restart ComfyUI to add finished renders automatically. For now use right-click > Send last output.", "warn");
    }
    return;
  }
  const tl = state.timeline;
  const shown = state.pid === t.projectId && tl?.project?.id === t.projectId;
  const cut = shown ? tl.cuts.find((c) => c.id === t.cutId) : null;
  const cutText = cut ? `${cutDisplayLabel(cut, computeCutLabels(tl))} ${cut.name || ""}`.trim() : "";
  const msg = captureToast(d, cutText);
  if (msg) ggToast(msg.summary, msg.detail, msg.kind);
  if (d?.ok && !d.duplicate && state.pid === t.projectId) await loadTimeline();
}

api.addEventListener("gonggan.regen", (e) => {
  const j = e.detail || {};
  if (j.status === "done") { sdk.msg = `New version from SDK job ${j.sdk_job_id || ""}`; loadTimeline(); }
  else if (j.status === "error") sdk.msg = "SDK job failed: " + (j.error || "");
  else if (j.status === "running") sdk.msg = "SDK job running…";
  bus.dispatchEvent(new Event("sdk"));
});

function ownedShotTabOpen() {
  const ws = ggWorkflowStore();
  return isGongganOwnedWorkflow(ggOwnedShotWorkflow) && (ws?.openWorkflows || []).includes(ggOwnedShotWorkflow);
}

/** One version thumbnail (cut panel and version row): Best / latest / open-in-canvas classes, tip, image or no-media placeholder. */
function versionThumbParts(c, v, tabOpen) {
  const repState = versionRepState(c, v.id);
  const open = isOpenVersion(wfOpenVersion, { projectId: state.pid, cutId: c.id, vid: v.id, tabOpen });
  return {
    on: repState === "manual",
    wrapCls: `gg-ver-wrap${repState === "manual" ? " gg-rep" : repState === "implicit" ? " gg-implicit" : ""}${open ? " gg-ver-open" : ""}`,
    tip: `${fmtSrc(v.source)} · ${v.model || ""} · ${new Date(v.created * 1000).toLocaleString()}`,
    img: v.missing ? thumbHtml(null, "gg-ver-img") : `<img class="gg-ver-img gg-thumb-img" draggable="false" src="${esc(posterUrl(v.id))}" loading="lazy" alt="" />`,
  };
}

function cutPanelHtml(c, labels) {
  if (!c) return `<div class="gg-panel-empty">Select a cut for versions and actions.</div>`;
  const nat = isNativeProject();
  const panelOpen = loadPanelOpen(localStorage);
  const regenOff = sdk.busy || !(sdk.st && sdk.st.ok);
  const regenTip = "Draft re-render through Comfy SDK → comfy-api-proxy → ComfyUI. Shows the job and asks before queueing.";
  const sendTip = "Copy ComfyUI's last output (from /history, else newest file in output/) into this cut as a new version";
  const rep = repIdOf(c);
  const tabOpen = ownedShotTabOpen();
  const vers = (c.versions_list || []).map((v) => {
    const { on, wrapCls, tip, img } = versionThumbParts(c, v, tabOpen);
    return `
    <div class="${wrapCls}" data-vid="${esc(v.id)}">
      <div class="gg-ver" title="${esc(tip)}">
        ${img}
        <span class="gg-ver-src gg-src-${esc(v.source)}">${esc(fmtSrc(v.source))}</span>
        ${on ? '<span class="gg-ver-rep">Rep</span>' : ""}
      </div>
      <button type="button" class="gg-btn gg-promote${on ? " gg-on" : ""}" ${on ? "disabled" : ""} title="${on ? "Timeline representative version" : "Set as timeline representative"}">${on ? "Rep" : "Set rep"}</button>
    </div>`;
  }).join("");
  const planned = c.planned_sec;
  const lenVal = planned != null && Number.isFinite(planned) ? String(planned) : "";
  const lenPh = lenVal ? "" : plannedLenInputPlaceholder(c);
  const vIdx = rep ? versionIndexFromList(c.versions_list, rep) : 1;
  const fname = fileBaseName(c, { scene_index: c.scene_index }, vIdx);
  const metaDisabled = nat ? "" : " disabled";
  const metaTip = nat ? "" : ` title="${esc(NATIVE_READONLY_TIP)}"`;
  const dotEnd = c.end_card ? '<span class="gg-panel-dot gg-panel-dot-end" title="End card">●</span>' : "";
  const dotRedo = c.needs_redo ? '<span class="gg-panel-dot gg-panel-dot-redo" title="Needs redo">●</span>' : "";
  const regenBtn = nat
    ? ""
    : `<button type="button" class="gg-btn gg-regen" ${regenOff ? "disabled" : ""} title="${esc(regenTip)}">Regen</button>`;
  const sdkMsg = sdk.msg || "";
  return `
    <header class="gg-panel-head">
      <button type="button" class="gg-panel-fold" title="Collapse or expand panel">${panelOpen ? "▾" : "▸"}</button>
      <span class="gg-num">${esc(cutDisplayLabel(c, labels))}</span>
      <span class="gg-panel-name">${esc(displayCutName(c))}</span>
      <span class="gg-panel-len">${esc(effectiveLenLabel(c))}</span>
      <span class="gg-panel-dots">${dotEnd}${dotRedo}</span>
      <div class="gg-panel-tools">
        ${regenBtn}
        <button type="button" class="gg-btn gg-send" ${sdk.busy ? "disabled" : ""} title="${esc(sendTip)}">Send last output</button>
      </div>
    </header>
    <div class="gg-panel-body"${panelOpen ? "" : " hidden"}>
      <div class="gg-cut-fields">
        <div class="gg-cut-meta-row">
          <label class="gg-field-len"${metaTip}>Length (sec)
            <input type="number" class="gg-len-input" min="0.5" max="600" step="0.1" value="${esc(lenVal)}"${lenPh ? ` placeholder="${esc(lenPh)}"` : ""} title="${nat ? "Planned length (seconds). Leave empty to use the default." : esc(NATIVE_READONLY_TIP)}"${metaDisabled} />
          </label>
          <label class="gg-field-end"${metaTip}><input type="checkbox" class="gg-endcard-chk"${c.end_card ? " checked" : ""}${metaDisabled} /> End card</label>
          <label class="gg-field-redo"${metaTip}><input type="checkbox" class="gg-redo-chk"${c.needs_redo ? " checked" : ""}${metaDisabled} /> Needs redo</label>
        </div>
        <div class="gg-fname-row">
          <span class="gg-fname" title="Suggested export base name (read-only)">${esc(fname)}</span>
          <button type="button" class="gg-btn gg-fname-copy"${nat ? "" : ` disabled title="${esc(NATIVE_READONLY_TIP)}"`}>Copy</button>
        </div>
      </div>
      <div class="gg-vers">${vers || '<span class="gg-dim">no versions yet</span>'}</div>
    </div>
    <div class="gg-sdk-msg"${sdkMsg ? ` title="${esc(sdkMsg)}"` : ""}>${esc(sdkMsg)}</div>`;
}

/** Video lengths read in the browser for versions the server sent without one (vid -> seconds, 0 = unreadable). */
const stripProbe = { dur: new Map(), queue: [], busy: false };

/** Reads one video's metadata at a time (preload=metadata, nothing decoded) and fills its strip label. */
function runStripProbe() {
  if (stripProbe.busy) return;
  const vid = stripProbe.queue.shift();
  if (!vid) return;
  stripProbe.busy = true;
  const el = document.createElement("video");
  el.preload = "metadata";
  el.muted = true;
  let finished = false;
  const done = (sec) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    el.removeAttribute("src");
    el.load();
    const n = Number(sec);
    stripProbe.dur.set(vid, Number.isFinite(n) && n > 0 ? n : 0);
    stripProbe.busy = false;
    const txt = formatClipDuration(n);
    document.querySelectorAll(`.gg-vstrip .gg-ver-wrap[data-vid="${CSS.escape(vid)}"] .gg-vs-dur`).forEach((s) => {
      s.textContent = txt;
      s.hidden = !txt;
    });
    runStripProbe();
  };
  const timer = setTimeout(() => done(0), 8000);
  el.addEventListener("loadedmetadata", () => done(el.duration));
  el.addEventListener("error", () => done(0));
  el.src = mediaUrl(vid);
}

function probeStripDurations(c) {
  for (const v of c?.versions_list || []) {
    if (needsDurationProbe(v, c, stripProbe.dur) && !stripProbe.queue.includes(v.id)) stripProbe.queue.push(v.id);
  }
  runStripProbe();
}

/** Version row below the icon row: the selected cut's versions, newest on the left. */
function versionStripHtml(c) {
  if (!c) return '<div class="gg-vs-empty gg-dim">Select a cut to see its versions</div>';
  const rows = versionStripRows(c, stripProbe.dur);
  if (!rows.length) return '<div class="gg-vs-empty gg-dim">No versions</div>';
  const tabOpen = ownedShotTabOpen();
  const byId = new Map((c.versions_list || []).map((v) => [v.id, v]));
  return rows.map((r) => {
    const { wrapCls, tip, img } = versionThumbParts(c, byId.get(r.id), tabOpen);
    const title = r.state ? `${r.state} · ${tip}` : tip;
    return `<div class="${wrapCls} gg-vs-item${r.best ? " gg-vs-best" : ""}" data-vid="${esc(r.id)}">
      <div class="gg-ver" title="${esc(title)}">
        ${img}
        <button type="button" class="gg-vs-star${r.best ? " gg-on" : ""}" title="${esc(r.starTitle)}" aria-label="${esc(r.starTitle)}"${r.best ? ' aria-pressed="true"' : ""}>${r.best ? "★" : "☆"}</button>
        ${r.video ? `<span class="gg-vs-dur"${r.duration ? "" : " hidden"}>${esc(r.duration)}</span>` : ""}
      </div>
    </div>`;
  }).join("");
}

function statusPanelHtml() {
  const tl = state.timeline;
  const tlIds = new Set((tl?.cuts || []).map((c) => c.id));
  const ids = tl ? cutSelIds().filter((id) => tlIds.has(id)) : [];
  const cut = ids.length === 1 ? cutById(ids[0]) : null;
  const head = cut ? cutHeaderParts(cut, tl, computeCutLabels(tl)) : null;
  const v = statusPanelView({
    count: ids.length,
    cut,
    cutLabel: head?.cutLabel,
    name: head?.name,
    render: cut ? renderStatus.cutView(state.pid, cut.id) : null,
  });
  if (v.kind === "multi") return `<div class="gg-sp-title gg-sp-count">${esc(v.text)}</div>`;
  if (v.kind !== "cut") return `<div class="gg-sp-empty">${esc(v.text)}</div>`;
  return `
    <div class="gg-sp-title" title="${esc(v.title)}"><span class="gg-num">${esc(v.label)}</span> <span class="gg-sp-name">${esc(v.name)}</span></div>
    <div class="gg-sp-status"><span class="gg-sp-chip gg-sp-${esc(v.status.mode)}" title="${esc(v.status.title)}"><span class="gg-sp-dot"></span>${esc(v.status.text)}</span></div>
    <div class="gg-sp-meta"><span class="gg-sp-len" title="${esc(v.length.title)}">${esc(v.length.text)}</span><span class="gg-sp-ver" title="${esc(v.version.title)}">${esc(v.version.text)}</span></div>`;
}

const ICON_SVG_ATTRS = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_FOLDER = `<svg ${ICON_SVG_ATTRS}><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/></svg>`;
const ICON_NEW_PAGE = `<svg ${ICON_SVG_ATTRS}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15h6"/></svg>`;
const ICON_TRASH = `<svg ${ICON_SVG_ATTRS}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>`;

/** Lower-left icon row of the Shots sidebar (fixed height, above the version row): plugin version on the left; New scene, New cut, Delete on the right. */
function iconRowHtml() {
  const btn = (cls, tip, icon) =>
    `<button type="button" class="gg-btn gg-ir-btn ${cls}" title="${tip}" aria-label="${tip}" disabled>${icon}</button>`;
  return `<div class="gg-iconrow">
        <span class="gg-version" title="Shots plugin version — if this is not the latest, press Ctrl+F5">v${esc(GG_VERSION)}</span>
        ${btn("gg-ir-scene", "New scene", ICON_FOLDER)}
        ${btn("gg-ir-cut", "New cut", ICON_NEW_PAGE)}
        ${btn("gg-ir-del", "Delete", ICON_TRASH)}
      </div>`;
}

/** Icon row Delete: the same soft delete as the cut menu / Delete key, after the in-app confirm. */
async function confirmDeleteSelectedCuts() {
  const n = cutsForDelete().length;
  if (!n) return;
  if (!(await askConfirm({ message: deleteCutsConfirmMessage(n), danger: true }))) return;
  await deleteSelectedCuts();
}

/** Status panel body: selection info on top, queue status + batch counter + Queue (right-aligned) in a row below. */
function statusPanelShellHtml() {
  return `
        <div class="gg-sp-info"></div>
        <div class="gg-sp-actions">
          <span class="gg-render-badge gg-render-global" hidden><span class="gg-rs-dot"></span><span class="gg-rs-text"></span></span>
          <span class="gg-batch-prog" hidden></span>
          <button type="button" class="gg-btn gg-primary gg-queue-btn" disabled title="${esc(QUEUE_EMPTY_TIP)}">Queue</button>
        </div>`;
}

function paintStatusPanel(panel) {
  const info = panel?.querySelector(".gg-sp-info");
  if (!info) return;
  const html = statusPanelHtml();
  if (info.dataset.sp === html) return;
  info.dataset.sp = html;
  info.innerHTML = html;
}

function mountShots(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = `gg-root gg-shots${CUT_PANEL_ROOT_CLASS}`;
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

  const stripScroll = { cutId: "", left: 0 };
  const syncStripNewest = () => {
    const list = root.querySelector(".gg-vs-list");
    const btn = root.querySelector(".gg-vs-newest");
    if (btn && list) btn.hidden = !showNewestButton(list.scrollLeft);
  };
  const bindStripItems = (list, c) => {
    const rows = new Map(versionStripRows(c, stripProbe.dur).map((r) => [r.id, r]));
    list.querySelectorAll(".gg-ver-wrap").forEach((wrap) => {
      const vid = wrap.dataset.vid;
      const row = rows.get(vid);
      if (!row) return;
      wrap.querySelector(".gg-ver")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openVersionWorkflow(c.id, vid);
      });
      wrap.querySelector(".gg-vs-star")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!row.best) setPick(c.id, vid);
      });
      wrap.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, attachMenuActions(versionStripMenuItems(row), { best: () => setPick(c.id, vid) }));
      });
    });
  };
  const paintVersionStrip = () => {
    const list = root.querySelector(".gg-vstrip .gg-vs-list");
    if (!list) return;
    const c = state.timeline ? state.timeline.cuts.find((x) => x.id === state.cutId) || null : null;
    const cutId = c?.id || "";
    const html = versionStripHtml(c);
    const key = `${cutId}\n${html}`;
    if (list.dataset.html === key) return;
    const left = stripScrollLeft(stripScroll, cutId);
    stripScroll.cutId = cutId;
    stripScroll.left = left;
    list.dataset.html = key;
    list.innerHTML = html;
    list.scrollLeft = left;
    syncStripNewest();
    if (!c) return;
    bindThumbFallbacks(list);
    bindStripItems(list, c);
    probeStripDurations(c);
  };
  const paintPanel = () => {
    paintVersionStrip();
    const panel = root.querySelector(".gg-cutpanel");
    const badge = root.querySelector(".gg-sdk-slot");
    if (badge) badge.innerHTML = sdkBadge();
    updateSelectionBar(root);
    if (!panel) return;
    if (!SHOW_CUT_PANEL) {
      if (SHOW_STATUS_PANEL) paintStatusPanel(panel);
      return;
    }
    const c = state.timeline && state.timeline.cuts.find((x) => x.id === state.cutId);
    const labels = computeCutLabels(state.timeline);
    panel.innerHTML = cutPanelHtml(c, labels);
    bindThumbFallbacks(panel);
    panel.querySelectorAll(".gg-promote").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = b.closest(".gg-ver-wrap");
      if (!b.disabled && wrap) setPick(c.id, wrap.dataset.vid);
    }));
    panel.querySelectorAll(".gg-ver-wrap > .gg-ver").forEach((t) => t.addEventListener("click", (e) => {
      e.stopPropagation();
      const vid = t.closest(".gg-ver-wrap")?.dataset?.vid;
      if (c && vid) openVersionWorkflow(c.id, vid);
    }));
    panel.querySelector(".gg-regen")?.addEventListener("click", () => regenCut(c.id));
    panel.querySelector(".gg-send")?.addEventListener("click", () => sendLastOutput(c.id));
    panel.querySelector(".gg-panel-fold")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !loadPanelOpen(localStorage);
      savePanelOpen(localStorage, open);
      const body = panel.querySelector(".gg-panel-body");
      const fold = panel.querySelector(".gg-panel-fold");
      if (body) body.hidden = !open;
      if (fold) fold.textContent = open ? "▾" : "▸";
    });
    if (c) bindCutPanelFields(panel, c);
  };
  const FIELD_TEXT_SEL = ".gg-caption-text";

  function captureFieldTextFocus() {
    const el = document.activeElement;
    if (!el || !root.contains(el)) return null;
    if (!el.classList.contains("gg-caption-text")) return null;
    const li = el.closest(".gg-cut");
    return {
      cutId: li?.dataset?.cutId || "",
      field: "caption",
      value: el.value,
      selectionStart: el.selectionStart,
      selectionEnd: el.selectionEnd,
      scrollTop: el.scrollTop,
      editing: isCardFieldEditing(el),
    };
  }

  function restoreFieldTextFocus(cap) {
    if (!cap?.cutId) return;
    const ta = root.querySelector(`.gg-cut[data-cut-id="${CSS.escape(cap.cutId)}"] .gg-caption-text`);
    if (!ta) return;
    ta.value = cap.value;
    const c = cutByIdTimeline(cap.cutId);
    if (c && captionEditChanged(c, cap.value)) {
      c.caption = cap.value;
      scheduleCutFieldSave(cap.cutId, { caption: cap.value });
    }
    const nat = isNativeProject() && !ta.disabled;
    if (cap.editing && nat) {
      ta.readOnly = false;
      ta.dataset.editing = "1";
      ta.classList.add("gg-field-editing");
      ta.title = CARD_EDIT_ACTIVE_TIP;
    } else if (nat) {
      ta.readOnly = true;
      delete ta.dataset.editing;
      ta.classList.remove("gg-field-editing");
      ta.title = CARD_EDIT_IDLE_TIP;
    }
    ta.focus({ preventScroll: true });
    try {
      ta.setSelectionRange(cap.selectionStart, cap.selectionEnd);
    } catch (_) {}
    ta.scrollTop = cap.scrollTop;
    autoSizeFieldTextarea(ta);
  }

  let repaintAfterCompose = () => {};
  let listSizeRo = null;
  let listSizeRoRaf = 0;

  function fieldTextMinMaxPx(ta) {
    const cs = getComputedStyle(ta);
    const fs = parseFloat(cs.fontSize) || 11;
    const lh = parseFloat(cs.lineHeight) || fs * 1.3;
    const pad =
      (parseFloat(cs.paddingTop) || 0) +
      (parseFloat(cs.paddingBottom) || 0) +
      (parseFloat(cs.borderTopWidth) || 0) +
      (parseFloat(cs.borderBottomWidth) || 0);
    return { minPx: lh * 3 + pad, maxPx: window.innerHeight * 0.45 };
  }

  function autoSizeFieldTextarea(ta) {
    if (!ta || !ta.isConnected) return;
    ta.style.height = "auto";
    const { minPx, maxPx } = fieldTextMinMaxPx(ta);
    ta.style.height = `${autoHeightPx({ scrollHeight: ta.scrollHeight, minPx, maxPx })}px`;
  }

  function autoSizeAllFieldTextareas() {
    root.querySelectorAll(FIELD_TEXT_SEL).forEach(autoSizeFieldTextarea);
  }

  function observeListWrapForFieldHeight() {
    if (typeof ResizeObserver === "undefined") return;
    listSizeRo?.disconnect();
    const wrap = root.querySelector(".gg-grp-wrap");
    if (!wrap) return;
    listSizeRo = new ResizeObserver(() => {
      cancelAnimationFrame(listSizeRoRaf);
      listSizeRoRaf = requestAnimationFrame(() => {
        const w = root.querySelector(".gg-grp-wrap");
        if (!w) return;
        const st = w.scrollTop;
        autoSizeAllFieldTextareas();
        w.scrollTop = st;
      });
    });
    listSizeRo.observe(wrap);
  }

  function bindCutFieldTextareas() {
    root.querySelectorAll(FIELD_TEXT_SEL).forEach((ta) => {
      const li = ta.closest(".gg-cut");
      const id = li?.dataset?.cutId;
      if (!id) return;
      const nat = isNativeProject() && !ta.disabled;

      const exitCardFieldEdit = () => {
        if (!isCardFieldEditing(ta)) return;
        delete ta.dataset.editing;
        ta.classList.remove("gg-field-editing");
        if (nat) ta.readOnly = true;
        ta.title = CARD_EDIT_IDLE_TIP;
        autoSizeFieldTextarea(ta);
        refreshFieldTextUnsavedClasses();
      };

      const enterCardFieldEdit = () => {
        if (!nat) return;
        ta.readOnly = false;
        ta.dataset.editing = "1";
        ta.classList.add("gg-field-editing");
        ta.title = CARD_EDIT_ACTIVE_TIP;
        ta.focus({ preventScroll: true });
        const end = ta.value.length;
        try {
          ta.setSelectionRange(end, end);
        } catch (_) {}
        autoSizeFieldTextarea(ta);
      };

      ta.addEventListener("mousedown", (e) => {
        if (isCardFieldEditing(ta)) e.stopPropagation();
        else {
          e.preventDefault();
          const a = document.activeElement;
          if (a && a !== ta && isCardFieldEditing(a)) a.blur();
        }
      });
      ta.addEventListener("pointerdown", (e) => {
        if (isCardFieldEditing(ta)) e.stopPropagation();
      });
      ta.addEventListener("click", (e) => {
        if (isCardFieldEditing(ta)) e.stopPropagation();
      });
      ta.addEventListener("contextmenu", (e) => {
        if (isCardFieldEditing(ta)) e.stopPropagation();
      });
      ta.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (nat) enterCardFieldEdit();
      });
      ta.addEventListener("keydown", (e) => {
        if (!isCardFieldEditing(ta)) return;
        e.stopPropagation();
        const action = cardEditKeyAction({
          key: e.key,
          shiftKey: e.shiftKey,
          isComposing: shotsUi.composing || e.isComposing,
        });
        if (action === "commit") {
          e.preventDefault();
          exitCardFieldEdit();
          ta.blur();
        }
      });
      ta.addEventListener("compositionstart", () => {
        shotsUi.composing = true;
      });
      ta.addEventListener("compositionend", () => {
        shotsUi.composing = false;
        repaintAfterCompose();
      });
      ta.addEventListener("focus", () => {
        if (nat && ta.readOnly && !isCardFieldEditing(ta)) {
          enterCardFieldEdit();
          return;
        }
        autoSizeFieldTextarea(ta);
      });
      ta.addEventListener("blur", () => {
        flushPendingCutFields();
        if (isCardFieldEditing(ta)) exitCardFieldEdit();
        else autoSizeFieldTextarea(ta);
      });
      ta.addEventListener("input", () => {
        const c = cutByIdTimeline(id);
        if (c) c.caption = ta.value;
        scheduleCutFieldSave(id, { caption: ta.value });
        autoSizeFieldTextarea(ta);
        paintViewerCaption();
      });
    });
    refreshFieldTextUnsavedClasses();
  }

  function applyPlayCutHighlight() {
    root.querySelectorAll(".gg-cut.gg-playing").forEach((el) => el.classList.remove("gg-playing"));
    if (normalizeListMode(shotsUi.listMode) !== "caption") return;
    const id = shotsUi.playCutId;
    if (!id) return;
    root.querySelector(`.gg-cut[data-cut-id="${CSS.escape(id)}"]`)?.classList.add("gg-playing");
  }

  function scrollPlayCutIntoView() {
    const cutId = shotsUi.playCutId || "";
    const row = root.querySelector(`.gg-cut[data-cut-id="${CSS.escape(cutId)}"]`);
    const groupCollapsed = row
      ? !!row.closest(".gg-cutlist[hidden], .gg-cutlist.hidden")
      : false;
    const typing = document.activeElement?.classList?.contains("gg-caption-text");
    const { scroll } = shouldFollowPlayback({
      mode: shotsUi.listMode,
      cutId,
      lastCutId: playCutScrollId,
      typingInStory: typing,
      groupCollapsed,
    });
    playCutScrollId = cutId;
    if (!scroll || !row) return;
    const wrap = root.querySelector(".gg-grp-wrap");
    if (!wrap) return;
    const rowTop = row.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
    const next = scrollTopToReveal({
      viewHeight: wrap.clientHeight,
      rowTop,
      rowHeight: row.offsetHeight,
      scrollTop: wrap.scrollTop,
      margin: 4,
    });
    if (next !== wrap.scrollTop) wrap.scrollTop = next;
  }

  const onPlayCut = () => {
    applyPlayCutHighlight();
    scrollPlayCutIntoView();
  };

  const paint = () => {
    if (shotsUi.dragSession) return;
    if (shouldDeferListPaint({ composing: shotsUi.composing, inlineRenaming: !!shotsUi.inlineRename })) {
      shotsUi.paintDeferred = true;
      return;
    }
    const storyCap = captureFieldTextFocus();
    const tl = state.timeline;
    const opts = state.projects.map((p) =>
      `<option value="${esc(p.id)}"${p.id === state.pid ? " selected" : ""}>${esc(projectOptionLabel(p))}</option>`).join("");
    let cuts = tl ? tl.cuts : [];
    if (redoFilterOn(SHOW_REDO_FILTER, shotsUi.needsRedoOnly)) cuts = filterCuts(cuts, { needsRedoOnly: true });
    const groups = tl ? tl.groups || [] : [];
    const sections = shotsSections(cuts, groups);
    const cutLabels = computeCutLabels(tl || { cuts: [] });
    const viewFinal = shotsViewOf(SHOW_FINAL_LIST, shotsUi.view) === "final";
    const listCaption = normalizeListMode(shotsUi.listMode) === "caption";
    const hintInfo = emptyListHint({ projectsLoaded: state.projectsLoaded, projectCount: state.projects.length, timeline: tl, native: !!tl && isNativeProject() });
    const emptyHint = !hintInfo
      ? ""
      : hintInfo.button
        ? `<div class="gg-dim gg-list-empty gg-no-projects"><span>${esc(hintInfo.text)}</span>
            <button type="button" class="gg-btn gg-primary gg-new-project-btn">${esc(hintInfo.button)}</button></div>`
        : `<div class="gg-dim gg-list-empty">${esc(hintInfo.text)}</div>`;
    const listHtml = emptyHint || groupedListHtml(sections, {
      cutHtml: (c) => cutRowHtml(c, cutLabels),
      groupHue: groupColor,
      groupProgress: (secCuts) => {
        const { best, total } = sceneBestProgress(secCuts);
        return `${best}/${total}`;
      },
    });
    root.className = `gg-root gg-shots${listCaption ? " gg-list-caption" : ""}${CUT_PANEL_ROOT_CLASS}`;
    root.innerHTML = `
      <div class="gg-head">
        <span class="gg-sdk-slot"></span>
        <div class="gg-proj-row">
          <label class="gg-proj-wrap">
            <span class="gg-proj-label">Project:</span>
            <select class="gg-proj" title="Project">${opts}</select>
          </label>
          <button type="button" class="gg-btn gg-proj-settings" title="Project settings" aria-label="Project settings"${state.pid ? "" : " disabled"}>⚙</button>
          <button class="gg-btn gg-reload" title="Reload">⟳</button>
        </div>
      </div>
      ${state.error ? `<div class="gg-error">${esc(state.error)}</div>` : ""}
      <div class="gg-shot-summary">
        <div class="gg-summary-top">
          <span class="gg-summary-text">${esc(tl ? formatSummary(projectSummary(tl.cuts || [])) : "")}</span>
          <span class="gg-complete-pct"></span>
          <!-- Due-date field hidden (0.9.49): the saved project.due_date is kept, just not shown or edited. -->
        </div>
        <div class="gg-summary-bar"${(tl?.cuts?.length || 0) ? "" : " hidden"}><span class="gg-seg gg-seg-best"></span><span class="gg-seg gg-seg-video"></span><span class="gg-seg gg-seg-image"></span><span class="gg-seg gg-seg-empty"></span></div>
      </div>
      <div class="gg-shots-toolbar">
        ${SHOW_FINAL_LIST ? `<div class="gg-view-toggle">
          <button type="button" class="gg-btn gg-view-cuts${viewFinal ? "" : " gg-on"}" data-view="cuts">Cuts</button>
          <button type="button" class="gg-btn gg-view-final${viewFinal ? " gg-on" : ""}" data-view="final">Final cut list</button>
        </div>` : ""}
        <div class="gg-list-toggle"${viewFinal ? " hidden" : ""}>
          <button type="button" class="gg-btn${listCaption ? "" : " gg-on"}" data-mode="info" title="Show cut details">Info</button>
          <button type="button" class="gg-btn${listCaption ? " gg-on" : ""}" data-mode="caption" title="Edit dialogue / captions per cut">Caption</button>
        </div>
        ${SHOW_REDO_FILTER ? `<label class="gg-filter-redo" title="Show only cuts marked for redo"><input type="checkbox"${shotsUi.needsRedoOnly ? " checked" : ""}${viewFinal ? " disabled" : ""} /> Show redo cuts only</label>` : ""}
      </div>
      <div class="gg-meta">
        <span class="gg-meta-text">${tl ? `${tl.cuts.length} shots · ${groups.length} scenes · ${fmt(tl.total_sec)}` : ""}</span>
        <button type="button" class="gg-btn gg-trash-btn" hidden title="Deleted cuts – click to restore">${esc(trashButtonLabel(trashCount))}</button>
      </div>
      <div class="gg-grp-wrap"${viewFinal ? " hidden" : ""}>${listHtml}</div>
      <div class="gg-final-wrap"${viewFinal ? "" : " hidden"}>${viewFinal && tl ? finalCutListHtml(tl) : ""}</div>
      ${SHOW_SEL_BAR ? `<div class="gg-selbar">
        <span class="gg-sel-label"><span class="gg-sel-count">0</span> selected</span>
        <button type="button" class="gg-btn gg-sel-group" disabled>Group</button>
        <button type="button" class="gg-btn gg-sel-ungroup" disabled>Ungroup</button>
        <button type="button" class="gg-btn gg-sel-x" disabled title="Clear selection">×</button>
      </div>` : ""}
      ${iconRowHtml()}
      <div class="gg-vstrip" role="group" aria-label="Versions"${tl && !viewFinal ? "" : " hidden"}>
        <div class="gg-vs-list"></div>
        <button type="button" class="gg-btn gg-vs-newest" hidden title="Back to newest" aria-label="Back to newest">‹</button>
      </div>
      <div class="gg-cutpanel">${!SHOW_CUT_PANEL && SHOW_STATUS_PANEL ? statusPanelShellHtml() : ""}</div>
      <button type="button" class="gg-btn gg-timeline-toggle gg-on" aria-pressed="true" title="Timeline: on (T)">Timeline</button>`;
    const projSel = root.querySelector(".gg-proj");
    projSel?.addEventListener("change", (e) => selectProject(e.target.value));
    root.querySelector(".gg-head")?.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".gg-proj") || e.target.closest(".gg-head")) openProjectContextMenu(e);
    });
    root.querySelector(".gg-proj-settings")?.addEventListener("click", () => openProjectSettingsModal());
    root.querySelector(".gg-new-project-btn")?.addEventListener("click", () => openNewProjectModal());
    root.querySelector(".gg-cut-add")?.addEventListener("click", () => addLocalCut());
    root.querySelector(".gg-reload")?.addEventListener("click", () => { loadProjects(); refreshSdk(true); refreshProjectTemplateFlag(); });
    root.querySelectorAll(".gg-view-toggle .gg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        shotsUi.view = btn.dataset.view === "final" ? "final" : "cuts";
        paint();
      });
    });
    root.querySelectorAll(".gg-list-toggle .gg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = normalizeListMode(btn.dataset.mode);
        shotsUi.listMode = mode;
        saveListMode(localStorage, mode);
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
    root.querySelector(".gg-export-srt")?.addEventListener("click", (e) => {
      e.stopPropagation();
      exportCaptionsSrt();
    });
    root.querySelectorAll(".gg-final-item").forEach((li) => {
      li.addEventListener("click", () => {
        selectCut(li.dataset.cutId);
        openTimelinePanelIfAllowed();
        paintSelection(root);
        paintPanel();
      });
    });
    root.querySelector(".gg-trash-btn")?.addEventListener("click", () => openTrashModal());
    syncTrashButton(root);
    syncTimelineToggleButtons();
    root.querySelector(".gg-timeline-toggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTimelinePanel();
    });
    root.querySelector(".gg-scene-add")?.addEventListener("click", () => createSceneGroup(cutSelIds()));
    root.querySelector(".gg-sel-group")?.addEventListener("click", () => createSceneGroup(cutSelIds()));
    root.querySelector(".gg-sel-ungroup")?.addEventListener("click", () => ungroupCuts(cutSelIds()));
    root.querySelector(".gg-ir-scene")?.addEventListener("click", () =>
      isNativeProject() ? void addEmptyScene() : createSceneGroup(cutSelIds()));
    root.querySelector(".gg-ir-cut")?.addEventListener("click", () => addLocalCut());
    root.querySelector(".gg-ir-del")?.addEventListener("click", () => void confirmDeleteSelectedCuts());
    root.querySelector(".gg-queue-btn")?.addEventListener("click", () => void queueSelectedCuts());
    const vsList = root.querySelector(".gg-vs-list");
    vsList?.addEventListener("scroll", () => {
      stripScroll.left = vsList.scrollLeft;
      syncStripNewest();
    }, { passive: true });
    vsList?.addEventListener("wheel", (e) => {
      const dx = wheelToScrollLeft(e.deltaX, e.deltaY);
      if (!dx || vsList.scrollWidth <= vsList.clientWidth) return;
      e.preventDefault();
      vsList.scrollLeft += dx;
    }, { passive: false });
    root.querySelector(".gg-vs-newest")?.addEventListener("click", (e) => {
      e.stopPropagation();
      vsList?.scrollTo({ left: 0, behavior: "smooth" });
    });
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
        const fieldEl = e.target.closest(FIELD_TEXT_SEL);
        if (fieldEl && shouldSkipCardSelect({ inEditMode: isCardFieldEditing(fieldEl) })) return;
        const id = li.dataset.cutId;
        if (e.shiftKey) selectCut(id, { range: true });
        else selectCut(id, { multi: e.ctrlKey || e.metaKey });
        openTimelinePanelIfAllowed();
        if (isTimelinePanelOpen()) scheduleRestoreTimelinePanelHeight();
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
    bindThumbFallbacks(root);
    bindShotsReorder(root);
    root.querySelectorAll(".gg-move-btn").forEach((btn) => {
      const cutId = btn.closest(".gg-cut")?.dataset?.cutId;
      const dir = btn.classList.contains("gg-move-up") ? -1 : 1;
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("mousedown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        void applyCutMoveBtn(cutId, dir);
      });
    });
    bindCutFieldTextareas();
    restoreFieldTextFocus(storyCap);
    autoSizeAllFieldTextareas();
    observeListWrapForFieldHeight();
    paintSelection(root);
    paintPanel();
    paintProjectSummary(root);
    paintAllCutProgress();
    syncProgressWireState();
    applyPlayCutHighlight();
    fit();
  };
  repaintAfterCompose = () => {
    setTimeout(() => {
      if (shotsUi.paintDeferred) {
        shotsUi.paintDeferred = false;
        paint();
      }
    }, 0);
  };
  const startInlineCutRename = (titleEl) => {
    const head = titleEl.closest(".gg-cut-head");
    const cutId = titleEl.closest(".gg-cut")?.dataset?.cutId || "";
    if (shotsUi.inlineRename || !head || !canInlineRenameCut({ native: isNativeProject(), cutId })) return;
    const c = cutById(cutId);
    if (!c) return;
    const pid = state.pid;
    const current = c.name || "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "gg-cut-title-input";
    input.maxLength = CUT_NAME_MAX_LEN;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = current;
    input.title = "Enter to save, Esc to cancel";
    input.setAttribute("aria-label", "Cut name");
    input.dataset.editing = "1";
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const name = commit && state.pid === pid ? inlineRenameCommitName(current, input.value) : null;
      shotsUi.inlineRename = null;
      if (name !== null) titleEl.textContent = name;
      input.remove();
      titleEl.hidden = false;
      head.classList.remove("gg-renaming");
      if (name !== null) void saveCutName(cutId, name);
      repaintAfterCompose();
    };
    shotsUi.inlineRename = { cutId, input, finish };
    for (const type of ["mousedown", "pointerdown", "click", "dblclick", "contextmenu"]) {
      input.addEventListener(type, (e) => e.stopPropagation());
    }
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      const action = inlineRenameKeyAction({ key: e.key, isComposing: e.isComposing || shotsUi.composing });
      if (action === "none") return;
      e.preventDefault();
      finish(action === "commit");
    });
    input.addEventListener("blur", () => finish(true));
    titleEl.hidden = true;
    head.classList.add("gg-renaming");
    titleEl.after(input);
    input.focus({ preventScroll: true });
    input.select();
  };
  const onShotsTitleDblClick = (e) => {
    const title = e.target.closest?.(".gg-cut-title");
    if (!title || !root.contains(title) || !isNativeProject()) return;
    e.preventDefault();
    e.stopPropagation();
    startInlineCutRename(title);
  };
  const onSel = () => { paintSelection(root); paintPanel(); fit(); };
  const onOpenTab = () => paintSelection(root);
  const onTemplate = () => paint();
  bus.addEventListener("projects", paint);
  bus.addEventListener("timeline", paint);
  bus.addEventListener("trash", () => syncTrashButton(root));
  bus.addEventListener("template", onTemplate);
  bus.addEventListener("select", onSel);
  bus.addEventListener("gg-opentab", onOpenTab);
  bus.addEventListener("gg-playcut", onPlayCut);
  bus.addEventListener("sdk", paintPanel);
  paint();
  if (!state.projects.length) loadProjects();
  refreshProjectTemplateFlag();
  refreshSdk(false);
  const timer = setInterval(() => refreshSdk(false), 20000);
  const selectCutFromKeys = (cutId) => {
    selectCut(cutId);
    openTimelinePanelIfAllowed();
    if (isTimelinePanelOpen()) scheduleRestoreTimelinePanelHeight();
    paintSelection(root);
    paintPanel();
    const sel = CSS.escape(cutId);
    root.querySelector(`.gg-cut[data-cut-id="${sel}"], .gg-final-item[data-cut-id="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const onShotsKey = (e) => {
    if (e.key === "Escape" && shotsUi.dragSession) {
      shotsUi.dragSession.cancel();
      return;
    }
    if (!pluginKeyScopeActive({ hoverShots: ggElHovered(root), focusShots: ggElHasFocus(root) })) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
    const ae = document.activeElement;
    const action = shotsKeyAction({
      key: e.key,
      code: e.code,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      isComposing: e.isComposing,
      repeat: e.repeat,
      modalOpen: ggModalOpen() || comfyPromptDialogOpen(),
      menuOpen: !!ctxUi.el,
      fieldEditing: !!(ae && isCardFieldEditing(ae)),
    });
    if (!action) return;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (action === "escape") {
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
    if (action === "delete") {
      if (!cutsForDelete().length) return;
      handled();
      deleteSelectedCuts();
      return;
    }
    if (!state.timeline) return;
    const ids = cutSelIds();
    switch (action) {
      case "move-up":
      case "move-down":
        if (!shotsSidebarActive() || !isNativeProject() || !ids.length) return;
        handled();
        void applyStepMove(action === "move-up" ? -1 : 1);
        return;
      case "prev":
      case "next": {
        const { order, hidden } = shotsNavOrder();
        if (!order.length) return;
        handled();
        const id = stepCutId(order, state.cutId, action === "prev" ? -1 : 1, hidden);
        if (id) selectCutFromKeys(id);
        return;
      }
      case "open":
        if (e.target?.closest?.("button, a[href], summary, [role='button']")) return;
        if (ids.length !== 1) return;
        handled();
        selectCutFromKeys(ids[0]);
        return;
      case "rename":
        if (!isNativeProject() || ids.length !== 1) return;
        handled();
        void renameCut(ids[0]);
        return;
      case "group":
        if (!ids.length) return;
        handled();
        void createSceneGroup(ids);
        return;
      case "ungroup":
        if (!ids.some((id) => cutById(id)?.group_id)) return;
        handled();
        void ungroupCuts(ids);
        return;
      case "add":
        if (!state.pid) return;
        handled();
        void (state.cutId && cutById(state.cutId) ? addCutAfter(state.cutId) : addLocalCut());
        return;
    }
  };
  // Window capture: a focused graph canvas runs ComfyUI's Ctrl+A (select all nodes) and stops the event
  // before it bubbles, so with the pointer over Shots this handler has to see it first.
  const onShotsSelectAllKey = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (!pluginKeyScopeActive({ hoverShots: ggElHovered(root), focusShots: ggElHasFocus(root) })) return;
    const t = e.target;
    const tag = (t && t.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
    const ae = document.activeElement;
    const action = shotsKeyAction({
      key: e.key,
      code: e.code,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      isComposing: e.isComposing,
      repeat: e.repeat,
      modalOpen: ggModalOpen() || comfyPromptDialogOpen(),
      menuOpen: !!ctxUi.el,
      fieldEditing: !!(ae && isCardFieldEditing(ae)),
    });
    if (action !== "select-all" || !state.timeline) return;
    e.preventDefault();
    e.stopPropagation();
    const { order, hidden } = shotsNavOrder();
    const ids = selectAllCutIds(order, hidden);
    if (!ids.length) return;
    state.cutSel.clear();
    for (const id of ids) state.cutSel.add(id);
    cutSelAnchor = state.cutSel.has(state.cutId) ? state.cutId : ids[0];
    bus.dispatchEvent(new Event("select"));
  };
  const onShotsEmptyClick = (e) => {
    if (!root.contains(e.target)) return;
    if (e.target.closest(".gg-cut") || e.target.closest(".gg-selbar") || e.target.closest(".gg-iconrow") || e.target.closest(".gg-vstrip") || e.target.closest(".gg-cutpanel") || e.target.closest(".gg-ctx")) return;
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
  root.addEventListener("mouseenter", () => { root._ggHover = true; });
  root.addEventListener("mouseleave", () => { root._ggHover = false; });
  root.addEventListener("mousedown", onShotsEmptyClick);
  root.addEventListener("contextmenu", onShotsPanelContextMenu);
  root.addEventListener("dblclick", onShotsTitleDblClick);
  document.addEventListener("keydown", onShotsKey);
  window.addEventListener("keydown", onShotsSelectAllKey, true);
  return () => {
    shotsUi.inlineRename?.finish(true);
    shotsUi.composing = false;
    shotsUi.paintDeferred = false;
    listSizeRo?.disconnect();
    listSizeRo = null;
    cancelAnimationFrame(listSizeRoRaf);
    ro.disconnect();
    window.removeEventListener("resize", fit);
    clearInterval(timer);
    root.removeEventListener("mousedown", onShotsEmptyClick);
    root.removeEventListener("contextmenu", onShotsPanelContextMenu);
    root.removeEventListener("dblclick", onShotsTitleDblClick);
    document.removeEventListener("keydown", onShotsKey);
    window.removeEventListener("keydown", onShotsSelectAllKey, true);
    closeCtxMenu();
    bus.removeEventListener("projects", paint);
    bus.removeEventListener("timeline", paint);
    bus.removeEventListener("template", onTemplate);
    bus.removeEventListener("select", onSel);
    bus.removeEventListener("gg-opentab", onOpenTab);
    bus.removeEventListener("gg-playcut", onPlayCut);
    bus.removeEventListener("sdk", paintPanel);
    closeProjectModal();
    extraCleanup.forEach((fn) => fn());
    syncProgressWireState();
  };
}

// ---------------- Timeline (bottom panel) ----------------
// Edit model: state.timeline.cuts in edit order, each with in/sec (+ src_dur for video caps).
const ed = {
  px: clampPx(Number(localStorage.getItem("gg.px")) || 48), // pixels per second (zoom)
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
/** Native timelines have their own clip order and start times (gaps allowed); imported ones are the cut list, packed. */
const isFreeTrack = () => !!(state.timeline && Array.isArray(state.timeline.track_order));
function trackClips() {
  const tl = state.timeline;
  if (!tl) return [];
  if (!Array.isArray(tl.track_order)) return tl.cuts;
  const byId = new Map(tl.cuts.map((c) => [c.id, c]));
  const out = tl.track_order.map((id) => byId.get(id)).filter(Boolean);
  const seen = new Set(out);
  for (const c of tl.cuts) if (!seen.has(c)) out.push(c);
  return out;
}
const totalSec = () => layoutTrack(trackClips(), isFreeTrack()).total;
const startOf = (i) => {
  const clips = trackClips();
  return clips[i] ? layoutTrack(clips, isFreeTrack()).starts[i] : totalSec();
};
function clipStartOf(cutId) {
  const i = trackClips().findIndex((c) => c.id === cutId);
  return i >= 0 ? startOf(i) : null;
}
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
  editGate.bump();
  clearTimeout(ed.saveTimer);
  ed.savePending = true;
  ed.saveTimer = setTimeout(() => {
    ed.savePending = false;
    saveEdit();
  }, 400);
  bus.dispatchEvent(new Event("dirty"));
}

/** `before` = snapshotTimelineEdit() taken before the edit; recorded only if the edit changed something. */
function recordTimelineUndo(before) {
  if (!before || !state.timeline) return;
  if (sameSnapshot(before, snapshotTimelineEdit(state.timeline))) return;
  timelineHistory.record(state.pid, before);
}

/** Ctrl+Z / Ctrl+Shift+Z in the Timeline: put clip order + trims back and save through POST /gonggan/edit. */
function stepTimelineHistory(action) {
  const tl = state.timeline;
  if (!tl || ed.dragging) return;
  const current = snapshotTimelineEdit(tl);
  const snap = action === "redo" ? timelineHistory.redo(state.pid, current) : timelineHistory.undo(state.pid, current);
  if (!snap) {
    ggToast(action === "redo" ? "Nothing to redo" : "Nothing to undo", "", "info", { ttlMs: 1500 });
    return;
  }
  if (!applyTimelineSnapshot(tl, snap)) return;
  recomputeCutStarts();
  play.idx = -1;
  scheduleSave();
  bus.dispatchEvent(new Event("timeline"));
}

// Data safety: a timeline edit made just before the page is hidden or closed is saved right away.
function flushTimelineEdit() {
  if (!ed.savePending) return;
  clearTimeout(ed.saveTimer);
  ed.savePending = false;
  saveEdit();
}

function saveEdit() {
  return editGate.run(saveEditNow);
}

async function saveEditNow() {
  // The body is built when this write actually starts (after earlier writes finished), so it
  // always carries the newest local order/trims.
  const tl = state.timeline;
  if (!tl) return true;
  ed.saving = true;
  bus.dispatchEvent(new Event("dirty"));
  const mySeq = editGate.seq;
  const clips = trackClips();
  const free = isFreeTrack();
  const body = {
    pid: tl.project.id,
    order: clips.map((c) => c.id),
    clips: Object.fromEntries(clips.map((c) => [c.id, { in: c.in, sec: c.sec, pick: c.pick || null, ...(free ? { start: c.start } : {}) }])),
  };
  let ok = true;
  try {
    const payload = JSON.stringify(body);
    // keepalive lets the save finish if the page closes; browsers cap keepalive bodies at 64 KB.
    const res = await api.fetchApi("/gonggan/edit", { method: "POST", keepalive: payload.length < 60000, headers: { "Content-Type": "application/json" }, body: payload });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    if (!ed.dragging && editGate.isCurrent(mySeq) && state.timeline && state.timeline.project.id === data.project.id) {
      state.timeline = adoptServerTimeline(data);
      state.error = "";
    }
  } catch (e) {
    ok = false;
    state.error = sentence("Timeline not saved: " + e.message, "Your change is still on screen. Edit again to retry.");
  }
  ed.saving = false;
  bus.dispatchEvent(new Event("timeline"));
  return ok;
}

async function resetEdit() {
  const tl = state.timeline;
  if (!tl) return;
  if (!(await askConfirm({ message: "Reset this timeline to the original order and lengths? (the current edit is kept as a backup file)", danger: true }))) return;
  stopPlay();
  clearTimeout(ed.saveTimer);  // a trim still waiting to be saved must not undo the reset
  ed.saveTimer = 0;
  const before = snapshotTimelineEdit(tl);
  await editGate.run(async () => {
    try {
      const res = await api.fetchApi("/gonggan/edit/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: tl.project.id }) });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
      editGate.bump();
      if (adoptMutationTimeline(data, tl.project.id)) recordTimelineUndo(before);
      state.error = "";
    } catch (e) {
      state.error = sentence("Reset failed: " + e.message, "Try again.");
    }
  });
  bus.dispatchEvent(new Event("timeline"));
}

// ---- playback ----
function itemAt(t) {
  return clipAtTime(trackClips(), t);
}

let viewer = null;  // { box, img, vid, next, label, clock, playBtn, soundBtn }

function paintViewerCaption() {
  if (!viewer) return;
  const text = viewer.mode === "export" ? "" : captionAtTime(trackClips(), play.t);
  if (viewer.caption.textContent !== text) viewer.caption.textContent = text;
}

function showFrame(force) {
  if (!viewer) return;
  paintViewerCaption();
  if (viewer.mode === "export") { paintHead(); return; }
  const cuts = trackClips();
  const { i, local } = itemAt(play.t);
  const c = cuts[i];
  const { img, vid, label, blank } = viewer;
  if (i !== play.idx || force) {
    play.idx = i;
    const playId = c ? c.id : "";
    if (playId !== lastPlayCutAnnounced) {
      lastPlayCutAnnounced = playId;
      shotsUi.playCutId = playId;
      bus.dispatchEvent(new Event("gg-playcut"));
    }
    document.querySelectorAll(".gg-timeline .gg-clip").forEach((el) => el.classList.toggle("gg-play", c && el.dataset.cutId === c.id));
    if (!c) {
      vid.pause(); img.hidden = vid.hidden = true; blank.hidden = false; blank.textContent = ""; label.textContent = "";
      if (i === GAP) paintHead();  // empty timeline gap: black while the playhead keeps moving
      return;
    }
    const dispNum = cutDisplayLabel(c, computeCutLabels(state.timeline));
    label.textContent = c.group_name ? `Scene · ${c.group_name} — ${dispNum}. ${c.name}` : `${dispNum}. ${c.name}`;
    if (c.media && c.media.kind === "video") {
      img.hidden = true; blank.hidden = true; vid.hidden = false;
      const url = mediaUrl(c.media.id);
      if (vid.dataset.src !== url) { vid.dataset.src = url; vid.src = url; vid._ggSeekAt = 0; }
    } else if (c.media) {
      vid.pause(); vid.hidden = true; blank.hidden = true; img.hidden = false;
      const url = mediaUrl(c.media.id);
      if (img.dataset.src !== url) { img.dataset.src = url; img.src = url; }
    } else {
      vid.pause(); vid.hidden = true; img.hidden = true; blank.hidden = false;
      blank.textContent = noMediaText(dispNum, c.name);
    }
    preloadNext(i + 1);
  }
  if (c && c.media && c.media.kind === "video") {
    vid.muted = !ed.sound;
    const want = c.in + local;
    try {
      if (vid.readyState >= 1) {
        const sync = decideVideoSync({
          want,
          current: vid.currentTime || 0,
          duration: vid.duration,
          playing: play.on,
          paused: vid.paused,
          seeking: vid.seeking,
          readyState: vid.readyState,
          lastSeekAt: vid._ggSeekAt || 0,
          now: performance.now(),
        });
        if (sync.seekTo != null) {
          vid.currentTime = sync.seekTo;
          vid._ggSeekAt = performance.now();
        }
        if (sync.pause) vid.pause();
        if (sync.play) vid.play().catch(() => {});
      } else if (!vid._ggWait) {
        // One wait listener per src; cleared on error/emptied/abort (wireViewerMedia).
        vid._ggWait = true;
        const onMeta = () => {
          vid._ggWait = false;
          showFrame();
        };
        vid.addEventListener("loadedmetadata", onMeta, { once: true });
      }
    } catch (_) {}
  }
  paintHead();
}

function preloadNext(i) {
  const c = trackClips()[i];
  if (!viewer || !c || !c.media) return;
  const url = mediaUrl(c.media.id);
  if (c.media.kind === "video") {
    if (viewer.next.dataset.src !== url) {
      viewer.next.dataset.src = url;
      viewer.next._ggWait = false;
      viewer.next.src = url;
    }
  } else {
    const im = new Image();
    im.src = url;
  }
}

/** The current clip's file failed to load (e.g. deleted on disk): show the same blank as a cut with no media. */
function showViewerNoMedia(el) {
  if (!viewer || viewer.mode === "export") return false;
  const c = trackClips()[play.idx];
  if (!c || !c.media || el.dataset.src !== mediaUrl(c.media.id)) return false;
  const { img, vid, blank } = viewer;
  vid.pause(); vid.hidden = true; img.hidden = true; blank.hidden = false;
  blank.textContent = noMediaText(cutDisplayLabel(c, computeCutLabels(state.timeline)), c.name);
  return true;
}

/** Viewer main + preload video: surface load failures; clear stuck _ggWait on abort/emptied. */
function wireViewerMedia(vid, next, blank, img) {
  if (!vid || vid._ggMediaWired) return;
  vid._ggMediaWired = true;
  const clearWait = () => {
    vid._ggWait = false;
  };
  vid.addEventListener("error", () => {
    clearWait();
    if (showViewerNoMedia(vid)) return;
    const err = vid.error;
    const detail = err ? `${err.message || "error"} (code ${err.code})` : "unknown error";
    if (blank) {
      blank.hidden = false;
      blank.textContent = `Video failed to load: ${detail}`;
    }
    vid.hidden = true;
  });
  img?.addEventListener("error", () => showViewerNoMedia(img));
  vid.addEventListener("emptied", clearWait);
  vid.addEventListener("abort", clearWait);
  if (next && !next._ggMediaWired) {
    next._ggMediaWired = true;
    next.addEventListener("error", () => { next._ggWait = false; });
    next.addEventListener("emptied", () => { next._ggWait = false; });
    next.addEventListener("abort", () => { next._ggWait = false; });
  }
}

function paintHead() {
  if (!document.querySelector(".gg-timeline")?.isConnected) return;
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
  viewer.vid._ggSeekAt = 0;
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
      const clips = trackClips();
      const c = clips.find((x) => x.id === el.dataset.cutId);
      if (!c) return;
      const side = edge.dataset.side;
      const startX = e.clientX;
      const startIn = c.in, startSec = c.sec;
      const before = snapshotTimelineEdit(state.timeline);
      const isVid = kindOf(c) === "video";
      const idx = clips.indexOf(c);
      const free = isFreeTrack();
      const start0 = startOf(idx);
      const origin = start0 + (side === "r" ? startSec : 0);
      const targets = free ? edgeSnapTargets(clips, idx, play.t) : trimSnapTargets(clips.map((x) => x.sec), idx, play.t);
      // Free placement: trims never move other clips except a longer clip pushing later ones; the left
      // edge keeps the clip's end and stops at the previous clip.
      const baseStarts = new Map(clips.map((x) => [x.id, x.start]));
      const minLeftDelta = free && side === "l" ? prevClipEnd(clips, idx) - start0 : -Infinity;
      const inner = root.querySelector(".gg-tl-inner");
      const marker = root.querySelector(".gg-drop");
      const float = document.createElement("div");
      float.className = "gg-trim-tip";
      float.textContent = trimTipText(0, startSec);
      float.style.left = startX - inner.getBoundingClientRect().left + "px";
      inner.appendChild(float);
      let raf = 0, pendingX = startX;
      ed.dragging = true;
      el.classList.add("gg-trimming");
      edge.classList.add("gg-edge-active");
      const paint = (x) => {
        const raw = (x - startX) / ed.px;
        const hit = pickSnapTarget(origin + raw, targets, TRIM_SNAP_PX / ed.px);
        const delta = Math.max(minLeftDelta, hit != null ? hit - origin : quantizeTrimDelta(side, isVid, startIn, startSec, raw, snapSec));
        const want = trimToSource({ side, isVideo: isVid, startIn, startSec, srcDur: c.src_dur, deltaSec: delta, vidMin: VID_MIN, imgMin: IMG_MIN, imgMax: IMG_MAX });
        const next = clampClip(c, want.in, want.sec);
        c.in = next.in; c.sec = next.sec;
        if (free) {
          for (const x of clips) x.start = baseStarts.get(x.id);
          if (side === "l") c.start = r2(start0 + startSec - next.sec);
        }
        layoutClips(root);
        const applied = appliedTrimDelta(side, isVid, startIn, startSec, next);
        const snapped = hit != null && Math.abs(origin + applied - hit) < 0.011;
        marker.classList.toggle("gg-snap-hit", snapped);
        marker.hidden = !snapped;
        if (snapped) marker.style.left = hit * ed.px + "px";
        const badge = el.querySelector(".gg-clip-dur");
        if (badge) badge.textContent = `${c.sec.toFixed(1)}s`;
        const inb = el.querySelector(".gg-clip-in");
        if (inb) inb.textContent = isVid && c.in > 0 ? `in ${c.in.toFixed(1)}` : "";
        const tip = root.querySelector(".gg-tip");
        if (tip) tip.textContent = isVid ? `in ${c.in.toFixed(2)}s · len ${c.sec.toFixed(2)}s · src ${c.src_dur ? c.src_dur.toFixed(2) + "s" : "?"}` : `len ${c.sec.toFixed(2)}s (still ${IMG_MIN}–${IMG_MAX}s)`;
        float.textContent = trimTipText(applied, c.sec);
        float.style.left = x - inner.getBoundingClientRect().left + "px";
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
        float.remove();
        marker.hidden = true;
        marker.classList.remove("gg-snap-hit");
        edge.classList.remove("gg-edge-active");
        el.classList.remove("gg-trimming");
        ed.dragging = false;
        c.edited = true;
        play.idx = -1;
        if (startIn !== c.in || startSec !== c.sec) {
          recordTimelineUndo(before);
          scheduleSave();
        }
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
  if (isFreeTrack()) { bindMove(root); return; }
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
        if (!active) { selectCut(el.dataset.cutId, { fromTimeline: true }); return; }
        ed.dragging = false;
        if (target >= 0 && target !== from && target !== from + 1) {
          const before = snapshotTimelineEdit(state.timeline);
          const [m] = cuts.splice(from, 1);
          cuts.splice(target > from ? target - 1 : target, 0, m);
          cuts.forEach((c, i) => { c.pos = i; });
          recordTimelineUndo(before);
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

/** Native timeline: drag a clip to any time (gap left behind), snapping to clip edges / playhead, never overlapping. */
function bindMove(root) {
  const marker = root.querySelector(".gg-drop");
  root.querySelectorAll(".gg-clip").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      if (e.button || e.target.closest(".gg-edge")) return;
      const startX = e.clientX, startY = e.clientY;
      const clips = trackClips();
      const idx = clips.findIndex((x) => x.id === el.dataset.cutId);
      if (idx < 0) return;
      const c = clips[idx];
      const start0 = startOf(idx);
      const targets = edgeSnapTargets(clips, idx, play.t);
      let active = false, res = null;
      const move = (ev) => {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        if (!active) { active = true; ed.dragging = true; el.classList.add("gg-moving"); try { el.setPointerCapture(e.pointerId); } catch (_) {} }
        const snap = snapMoveStart(start0 + (ev.clientX - startX) / ed.px, c.sec, targets, TRIM_SNAP_PX / ed.px);
        res = placeClip(clips, idx, snap.start);
        el.style.transform = `translateX(${(res.start - start0) * ed.px}px)`;
        const snapped = snap.hit != null && Math.abs(res.start - snap.start) < 0.011;
        marker.classList.toggle("gg-snap-hit", snapped);
        marker.hidden = !snapped;
        if (snapped) marker.style.left = snap.hit * ed.px + "px";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        marker.hidden = true;
        marker.classList.remove("gg-snap-hit");
        el.classList.remove("gg-moving");
        el.style.transform = "";
        if (!active) { selectCut(el.dataset.cutId, { fromTimeline: true }); return; }
        ed.dragging = false;
        const tl = state.timeline;
        if (res && tl && (res.start !== start0 || res.order.join() !== clips.map((x) => x.id).join())) {
          const before = snapshotTimelineEdit(tl);
          tl.track_order = res.order;
          for (const x of clips) if (res.starts[x.id] != null) x.start = res.starts[x.id];
          recomputeCutStarts();
          recordTimelineUndo(before);
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
  recomputeCutStarts();
  const byId = new Map(trackClips().map((c) => [c.id, c]));
  let prevEnd = 0;
  root.querySelectorAll(".gg-clip").forEach((el) => {
    const c = byId.get(el.dataset.cutId);
    if (!c) return;
    el.style.width = c.sec * ed.px + "px";
    el.style.marginLeft = Math.max(0, c.start - prevEnd) * ed.px + "px";
    prevEnd = c.start + c.sec;
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
  paintZoomBar(root);
}

function paintZoomBar(root) {
  const wrap = root.querySelector(".gg-tl-scroll");
  const bar = root.querySelector(".gg-zoombar");
  const thumb = bar && bar.querySelector(".gg-zb-thumb");
  if (!wrap || !thumb) return;
  const { left, width } = thumbFromScroll({
    scrollLeft: wrap.scrollLeft,
    scrollWidth: wrap.scrollWidth,
    clientWidth: wrap.clientWidth,
    barW: bar.clientWidth,
  });
  thumb.style.left = left + "px";
  thumb.style.width = width + "px";
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
        <div class="gg-v-cap"></div>
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
        <button class="gg-btn gg-reset" title="Reset to original order and lengths">Reset</button>
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
      <div class="gg-zoombar" title="Drag to scroll · drag an end to zoom · double-click to fit (Alt+wheel, = / -)">
        <div class="gg-zb-thumb"><span class="gg-zb-handle gg-zb-l" data-side="l"></span><span class="gg-zb-handle gg-zb-r" data-side="r"></span></div>
      </div>
    </div>`;
  viewer = {
    box: root,
    img: root.querySelector(".gg-v-img"),
    vid: root.querySelector(".gg-v-vid"),
    next: root.querySelector(".gg-v-next"),
    blank: root.querySelector(".gg-v-blank"),
    label: root.querySelector(".gg-v-label"),
    caption: root.querySelector(".gg-v-cap"),
  };
  wireViewerMedia(viewer.vid, viewer.next, viewer.blank, viewer.img);
  const $r = (q) => root.querySelector(q);
  const paintButtons = () => {
    $r(".gg-snap").classList.toggle("gg-on", ed.snap);
    $r(".gg-sound").textContent = ed.sound ? "🔊" : "🔇";
    $r(".gg-sound").classList.toggle("gg-on", ed.sound);
  };
  $r(".gg-play-btn").addEventListener("click", togglePlay);
  $r(".gg-sound").addEventListener("click", () => { ed.sound = !ed.sound; localStorage.setItem("gg.sound", ed.sound ? "1" : "0"); viewer.vid.muted = !ed.sound; paintButtons(); });
  $r(".gg-snap").addEventListener("click", () => { ed.snap = !ed.snap; localStorage.setItem("gg.snap", ed.snap ? "1" : "0"); paintButtons(); });
  const tlWrap = $r(".gg-tl-scroll");
  const zoomBar = $r(".gg-zoombar");
  const zoomThumb = $r(".gg-zb-thumb");
  const scrollPad = () => {
    const cs = getComputedStyle(tlWrap);
    return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
  };
  const setZoom = (px, scrollLeft) => {
    ed.px = clampPx(px);
    localStorage.setItem("gg.px", String(ed.px));
    layoutClips(root);
    paintHead();
    if (scrollLeft != null) tlWrap.scrollLeft = scrollLeft;
    paintZoomBar(root);
  };
  const zoomAt = (factor, x) => {
    const next = clampPx(ed.px * factor);
    if (next === ed.px) return;
    setZoom(next, scrollForZoomAt({ px: ed.px, nextPx: next, scrollLeft: tlWrap.scrollLeft, x, padLeft: scrollPad().l }));
  };
  const zoomToFit = () => {
    const p = scrollPad();
    setZoom(fitPx({ seqSec: totalSec() + 2, clientWidth: tlWrap.clientWidth, pad: p.l + p.r }), 0);
  };
  tlWrap.addEventListener("scroll", () => paintZoomBar(root), { passive: true });
  zoomThumb.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    e.preventDefault();
    e.stopPropagation();
    const side = e.target.closest(".gg-zb-handle")?.dataset.side || "";
    const barW = zoomBar.clientWidth;
    const x0 = e.clientX;
    const left0 = parseFloat(zoomThumb.style.left) || 0;
    const width0 = parseFloat(zoomThumb.style.width) || barW;
    const C = tlWrap.clientWidth, W0 = Math.max(1, tlWrap.scrollWidth), sl0 = tlWrap.scrollLeft;
    const startFrac = sl0 / W0, endFrac = Math.min(1, (sl0 + C) / W0);
    const p = scrollPad();
    let raf = 0, pendingX = x0;
    const apply = (x) => {
      const dx = x - x0;
      if (!side) {
        tlWrap.scrollLeft = scrollFromThumbLeft({ left: left0 + dx, width: width0, barW, maxScroll: tlWrap.scrollWidth - tlWrap.clientWidth });
        paintZoomBar(root);
        return;
      }
      const edgeFrac = (side === "l" ? startFrac : endFrac) + dx / Math.max(1, barW);
      const r = zoomFromHandle({ side, edgeFrac, startFrac, endFrac, seqSec: totalSec() + 2, clientWidth: C, pad: p.l + p.r });
      setZoom(r.px, r.scrollLeft);
    };
    const move = (ev) => {
      pendingX = ev.clientX;
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; apply(pendingX); });
    };
    const up = () => {
      zoomThumb.removeEventListener("pointermove", move);
      zoomThumb.removeEventListener("pointerup", up);
      zoomThumb.removeEventListener("pointercancel", up);
      try { zoomThumb.releasePointerCapture(e.pointerId); } catch (_) {}
      if (raf) { cancelAnimationFrame(raf); raf = 0; apply(pendingX); }
      zoomThumb.classList.remove("gg-zb-drag");
    };
    zoomThumb.classList.add("gg-zb-drag");
    try { zoomThumb.setPointerCapture(e.pointerId); } catch (_) {}
    zoomThumb.addEventListener("pointermove", move);
    zoomThumb.addEventListener("pointerup", up);
    zoomThumb.addEventListener("pointercancel", up);
  });
  zoomThumb.addEventListener("dblclick", (e) => { e.preventDefault(); zoomToFit(); });
  $r(".gg-editor").addEventListener("wheel", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const x = e.clientX - tlWrap.getBoundingClientRect().left - tlWrap.clientLeft;
    zoomAt(wheelZoomFactor(e.deltaY || e.deltaX, e.deltaMode), x);
  }, { passive: false });
  // '=' / '-' zoom around the playhead (or the view centre when it is off-screen), Timeline scope only.
  const onZoomKey = (e) => {
    const act = zoomKeyAction(e);
    if (!act) return;
    if (!pluginKeyScopeActive({ hoverTimeline: ggElHovered(root), focusTimeline: ggElHasFocus(root) })) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (ggModalOpen() || comfyPromptDialogOpen() || ctxUi.el) return;
    e.preventDefault();
    e.stopPropagation();
    const headX = play.t * ed.px + scrollPad().l - tlWrap.scrollLeft;
    const x = headX >= 0 && headX <= tlWrap.clientWidth ? headX : tlWrap.clientWidth / 2;
    zoomAt(act === "zoom-in" ? ZOOM_KEY_FACTOR : 1 / ZOOM_KEY_FACTOR, x);
  };
  window.addEventListener("keydown", onZoomKey, true);
  const zoomRo = window.ResizeObserver ? new ResizeObserver(() => paintZoomBar(root)) : null;
  if (zoomRo) { zoomRo.observe(tlWrap); zoomRo.observe(zoomBar); }
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
  $r(".gg-track").addEventListener("contextmenu", (e) => {
    const clip = e.target.closest(".gg-clip");
    if (clip) openClipContextMenu(e, clip.dataset.cutId);
  });
  // The panel host has no definite height; size the root from it so the viewer can fill the panel.
  const host = el.parentElement || el;
  const fit = () => {
    const raw = host.clientHeight || el.clientHeight;
    const h = raw > 60 ? Math.max(raw, TIMELINE_MIN_HEIGHT) : raw;
    if (h > 60) root.style.height = h + "px";
    const scr = root.querySelector(".gg-screen");
    const w = Math.max(200, Math.min(host.clientWidth * 0.4, ((h || TIMELINE_MIN_HEIGHT) - 46) * 16 / 9));
    if (scr) { scr.style.width = Math.round(w) + "px"; scr.style.height = Math.round(w * 9 / 16) + "px"; }
  };
  const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(host);
  fit();
  root.addEventListener("mouseenter", () => { root._ggHover = true; });
  root.addEventListener("mouseleave", () => { root._ggHover = false; });

  const paintTrack = () => {
    const tl = state.timeline;
    const cuts = trackClips();
    const cutLabels = computeCutLabels(tl || { cuts: [] });
    $r(".gg-tl-title").textContent = tl ? tl.project.name : "No project";
    const err = $r(".gg-error");
    err.hidden = !state.error;
    err.textContent = state.error || "";
    $r(".gg-track").innerHTML = cuts.map((c, i) => {
      const run = c.group_id && (i === 0 || cuts[i - 1].group_id !== c.group_id);
      const hue = c.group_id ? groupColor(c.group_id) : 0;
      const tip = `${c.group_name ? `Scene · ${c.group_name}\n` : ""}${cutDisplayLabel(c, cutLabels)}. ${c.name}  ${c.sec.toFixed(1)}s${c.src_dur ? ` (src ${c.src_dur}s)` : ""}${(() => {
        const cap = effectiveCaption(c).trim();
        return cap ? `\n${cap}` : "";
      })()}`;
      return `
      <div class="gg-clip${c.media ? "" : " gg-clip-empty"}${kindOf(c) === "video" ? " gg-clip-video" : ""}${c.pos !== c.index ? " gg-moved" : ""}${c.group_id ? " gg-in-scene" : ""}${run ? " gg-scene-start" : ""}"
           data-cut-id="${esc(c.id)}" style="width:${c.sec * ed.px}px;${c.group_id ? `--gg-grp:${hue}` : ""}"
           title="${esc(tip)}">
        ${run ? `<div class="gg-scene-band">Scene · ${esc(c.group_name)}</div>` : ""}
        ${thumbHtml(c.media, "gg-clip-thumb")}
        <span class="gg-clip-dot gg-dot-empty"></span>
        <div class="gg-clip-label"><span class="gg-no">${esc(cutDisplayLabel(c, cutLabels))}</span>${esc(displayCutName(c))}</div>
        <div class="gg-clip-in">${kindOf(c) === "video" && c.in > 0 ? `in ${c.in.toFixed(1)}` : ""}</div>
        <div class="gg-clip-dur">${c.sec.toFixed(1)}s</div>
        <span class="gg-render-badge gg-clip-rs" hidden><span class="gg-rs-dot"></span><span class="gg-rs-text"></span></span>
        <div class="gg-clip-prog" hidden><div class="gg-prog-bar"><div class="gg-prog-fill"></div></div></div>
        <div class="gg-edge gg-edge-l${i > 0 ? " gg-edge-split" : ""}" data-side="l" title="Trim in"></div>
        <div class="gg-edge gg-edge-r${i < cuts.length - 1 ? " gg-edge-split" : ""}" data-side="r" title="Trim out"></div>
      </div>`;
    }).join("");
    bindThumbFallbacks($r(".gg-track"));
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
      const t = clipStartOf(state.cutId);
      if (t != null) {
        play.idx = -1;
        play.t = t + 0.001;
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
  const onOpenTab = () => paintSelection(root);
  bus.addEventListener("select", onSel);
  bus.addEventListener("gg-opentab", onOpenTab);
  paintTrack();
  paintExport();
  paintTimelineNativeLocks();
  refreshExport();
  if (!state.projects.length) loadProjects();
  return () => {
    stopPlay();
    if (ro) ro.disconnect();
    if (zoomRo) zoomRo.disconnect();
    window.removeEventListener("keydown", onZoomKey, true);
    bus.removeEventListener("timeline", onTimeline);
    bus.removeEventListener("timeline", onTimelineLocks);
    bus.removeEventListener("projects", onProjects);
    bus.removeEventListener("dirty", onDirty);
    bus.removeEventListener("select", onSel);
    bus.removeEventListener("gg-opentab", onOpenTab);
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
    btn.disabled = false;
    btn.title = nat ? "Rebuild the timeline from the cut list (order, original lengths, no gaps)" : "Reset to original order and lengths";
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
    state.error = sentence("Export did not start: " + e.message, "Check that ComfyUI is running, then try again.");
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
  vid._ggSeekAt = 0;
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
  root.querySelectorAll("video.gg-thumb-vid").forEach((v) => {
    if (v._ggHoverBound) return;
    v._ggHoverBound = true;
    const host = v.parentElement;
    if (!host) return;
    host.addEventListener("mouseenter", () => {
      if (!v.isConnected) return;
      v.preload = "auto";
      v.loop = true;
      v.play().catch(() => {});
    });
    host.addEventListener("mouseleave", () => {
      v.pause();
      try {
        v.currentTime = 0;
      } catch (_) {}
    });
  });
}

app.registerExtension({
  name: EXT,
  bottomPanelTabs: [
    { id: TIMELINE_TAB, title: "Timeline", type: "custom", icon: "pi pi-video", render: (el) => mountTimeline(el) },
  ],
  async setup() {
    globalThis.__gongganCutAutosaveOnSwitch = "0.8.2";
    globalThis.__gongganProjectFolders = "0.8.2";
    globalThis.__gongganTimelineNoTabSwitch = "0.8.3";
    globalThis.__gongganTabLabel = "0.8.4";
    globalThis.__gongganStoryToggle = "0.9.0";
    globalThis.__gongganInfoPanelTidy = "0.9.1";
    globalThis.__gongganStoryLayout = "0.9.2";
    globalThis.__gongganCaptionMode = "0.9.3";
    globalThis.__gongganHeaderLine = "0.9.3";
    globalThis.__gongganTrimArrows = "0.9.5";
    globalThis.__gongganUxTidy = "0.9.6";
    globalThis.__gongganTabLabelRefresh = applyTabLabels;
    globalThis.__gongganReloadShotsData = () => loadProjects();
    setupTabLabels();
    setupWipPeriodicAutosave();
    window.addEventListener("keydown", onTimelineToggleKey, true);
    window.addEventListener("keydown", onUndoRedoKey, true);
    window.addEventListener("pointerdown", trackUndoArea, true);
    window.addEventListener("focusin", trackUndoArea, true);
    if (!loadTimelineOpen(localStorage)) {
      queueMicrotask(() => {
        if (isTimelinePanelOpen()) closeTimelinePanel();
        syncTimelineToggleButtons();
      });
    } else {
      syncTimelineToggleButtons();
    }
    requestAnimationFrame(startTimelineHeightObserver);
    let lastShotTabActive = isGongganShotTabOpenAndActive();
    setInterval(() => {
      const active = isGongganShotTabOpenAndActive();
      if (active !== lastShotTabActive) {
        lastShotTabActive = active;
        bus.dispatchEvent(new Event("gg-opentab"));
      }
    }, 500);
    bindLoadImageUi({ ggToast });
    installLoadImageQueueGuard();
    loadPersistedJobs();
    if (!api._ggQueuePatched) {
      api._ggQueuePatched = true;
      const origQueue = api.queuePrompt.bind(api);
      api.queuePrompt = async (...args) => {
        const res = await origQueue(...args);
        try {
          if (res?.prompt_id) {
            const target = promptCutTarget({
              graphExtra: args[1]?.workflow?.extra?.gonggan ?? app.graph?.extra?.gonggan,
              loadedCutId: wfLastLoadedCutId,
              currentProjectId: state.pid,
              shotTabActive: isGongganShotTabOpenAndActive(),
            });
            paintRenderStatus(renderStatus.queued(res.prompt_id, target));
            autoCapture.remember(res.prompt_id, target);
          }
        } catch (_) {}
        try {
          // wfLastLoadedCutId is only set by loadCutWorkflow (Shots list path); timeline selectCut({fromTimeline}) never changes it.
          if (res?.prompt_id && wfLastLoadedCutId && state.pid && isGongganShotTabOpenAndActive()) {
            progressTracker.registerPrompt(res.prompt_id, wfLastLoadedCutId, state.pid);
            persistJob(res.prompt_id, wfLastLoadedCutId, state.pid);
            ggLastRegisteredPrompt = { promptId: res.prompt_id, cutId: wfLastLoadedCutId, projectId: state.pid };
            syncProgressWireState();
          }
        } catch (_) {}
        return res;
      };
      api.addEventListener("execution_success", (e) => { captureFinishedPrompt(e.detail?.prompt_id).catch(() => {}); });
      for (const typ of ["execution_error", "execution_interrupted"]) {
        api.addEventListener(typ, (e) => autoCapture.forget(e.detail?.prompt_id));
      }
    }
    app.extensionManager.registerSidebarTab({
      id: SHOTS_TAB,
      icon: "pi pi-images",
      title: "Shots",
      tooltip: "Vidot Studio – Cut Manager",
      type: "custom",
      render: (el) => mountShots(el),
    });
  },
});
