// comfyui-gonggan-cut — "Shots" sidebar tab + "Timeline" bottom panel tab.
// Day 1: static render of real Gonggan projects/cuts (read-only). Trim/reorder come next.
import { effectiveImageTemplate } from "./gg_project_settings_core.js";
import {
  projectSelectOptionsHtml,
  shouldRefreshProjectList,
} from "./gg_proj_list_refresh_core.js";
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
  formatCutListLength,
  formatCutInfoLengthField,
  cutGenerationPromptText,
  formatCutVersionStatus,
  versionRepState,
  plannedLenInputPlaceholder,
  addCutTarget,
  addCutTargetAtListEnd,
} from "./gg_cuts_core.js";
import { videoTooLongMessage } from "./gg_ltx_duration_core.js";
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
  aiMakeCutMenuItem,
  MAKE_SCENE_LABEL,
  REMOVE_FROM_SCENE_LABEL,
  REMOVE_FROM_SCENE_TIP,
} from "./gg_ctx_menu_core.js";
import {
  regenConfirmMessage,
  regenKnownNodeCount,
  isRegenEmptyCut,
  nativeRegenQueueCheck,
  sdkRegenErrorMessage,
  sdkPlanSummary,
  sdkJobToast,
  sdkCutStatusView,
  i2vConfirmMessage,
  i2vErrorMessage,
} from "./gg_native_regen_core.js";
import { cutCardIdleWord, cutCardRenderView } from "./gg_cut_card_status_core.js";
import { bindLoadImageUi, installLoadImageQueueGuard, scheduleLoadImageScan } from "./gg_loadimage.js";
import { REFERENCE_CATEGORIES } from "./gg_import_core.js";
import {
  folderNotCreated,
  loadLastLocation,
  newProjectFolderPreviewText,
  newProjectRequest,
  NO_FOLDER_ROUTE_HINT,
  defaultProjectLocationPlaceholder,
  defaultProjectStorageHint,
  projectCreatedFolderToastDetail,
  projectFolderPath,
  saveLastLocation,
  userVisiblePathTooltip,
} from "./gg_new_project_core.js";
import {
  autosaveModifiedTabs,
  autosaveWorkflow,
  normalizeWorkflowPath,
  pickFreeWorkflowPath,
  pathCollides,
  autosaveStatusMessage,
  looksLikeRawIdText,
  savedCutHumanLabel,
  savedShotWorkflowToastDetail,
  workflowLabel,
} from "./gg_autosave_core.js";
import { sentence } from "./gg_text_core.js";
import { sanitizeUserMessage, sanitizeUserPath } from "./gg_ui_text_core.js";
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
  queueDeleteBody,
  saveRandomSeedOn,
  queueRandomSeedOn,
  RANDOM_SEED_LABEL,
} from "./gg_batch_render_core.js";
import {
  loadQueueMode,
  saveQueueMode,
  queueBatchPlan,
  queuePlanTooltip,
  QUEUE_MODE_LABELS,
  QUEUE_MODES,
} from "./gg_queue_mode_core.js";
import { shouldClosePreviousShotTab } from "./gg_tab_close_core.js";
import {
  graphFitsKind,
  shouldTryEmbeddedRepWorkflow,
  workflowSourceToastDetail,
  VERSION_WF_MISSING,
  findCutVersion,
  isOpenVersion,
  versionWorkflowSourceOrder,
  workflowFromVersionRecord,
} from "./gg_rep_wf_core.js";
import {
  createProjectMemory,
  cutWorkflowKind,
  shouldReuseOpenWorkflow,
  workflowContentKey,
} from "./gg_project_store_core.js";
import { findStartImageNode, syncSavedVideoStartImage } from "./gg_start_image_core.js";
import { findImageWidget } from "./gg_loadimage_core.js";
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
  SCENE_NAME_MAX_LEN as SCENE_RENAME_MAX,
  canInlineRenameScene,
  inlineSceneRenameCommitName,
  SCENE_HEADER_INPUT_CLASS,
} from "./gg_scene_rename_core.js";
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
  EXPORT_PLAY_LABEL,
  EXPORT_FOLDER_LABEL,
  exportPanelActions,
  exportDoneToastBody,
  EXPORT_DONE_TOAST_TITLE,
  EXPORT_FAIL_TOAST_TITLE,
} from "./gg_export_ui_core.js";
import {
  EXPORT_REMOTE_EXPLORER_MSG,
  exportFolderCheckError,
  exportOutputDisplayPath,
} from "./gg_export_folder_core.js";
import { EXPORT_TAB_ID, EXPORT_TAB_TITLE } from "./gg_export_tab_core.js";
import {
  rowContentKind,
  cutRowShellHtml,
  captionRowContentHtml,
  promptRowContentHtml,
  groupedListHtml,
  shotsSections,
  nextSceneName,
  resolveSceneName,
  newSceneGroupId,
  withNewEmptyScene,
  stripCutsFromGroups,
} from "./gg_group_list_core.js";
import {
  fieldExpandModalShellHtml,
  promptExpandFullscreenTitle,
  promptExpandKeyAction,
  promptTextareaCaretIndex,
} from "./gg_prompt_expand_core.js";
import {
  bumpPlaybackGen,
  decideVideoSync,
  guardResolvedPlay,
  pauseAllTimelineMedia,
  scheduleVideoPlay,
  registerTimelineMedia,
  guardMediaWithTransport,
  tickIsCurrent,
} from "./gg_playback_core.js";
import {
  animatedScrubFrameIndex,
  animatedViewerMode,
  decideVideoSyncScrub,
  edgeScrollSpeed,
  followPlayheadScroll,
  previewFrameAttr,
  timelineSecFromClientX,
  videoPreviewFrameIndex,
} from "./gg_timeline_scrub_core.js";
import { routeTimelineClipPointerDown } from "./gg_timeline_pointer_core.js";
import { isSceneRunStart, showTimelineSceneBand } from "./gg_timeline_scene_core.js";
import {
  timelineClipTypeBadgeHtml,
  timelineClipTypeClassSuffix,
} from "./gg_timeline_clip_type_core.js";
import { animatedWebpFrameBytes, parseAnimatedWebp } from "./gg_webp_anim_core.js";
import { noMediaText, noMediaThumbClass, playsAsVideo, isAnimatedImage, versionMedia } from "./gg_missing_media_core.js";
import {
  needsDurationProbe,
  formatClipDuration,
  versionStripRows,
  versionStripMenuItems,
  showNewestButton,
  stripScrollLeft,
  wheelToScrollLeft,
  IMPORT_ACCEPT,
  IMPORT_TILE_TIP,
  cutHasStartImage,
  isStillVersion,
  stripSelectedVid,
  SET_BEST_LABEL,
  importButtonState,
  MAKE_VIDEO_LABEL,
  makeVideoPlanOk,
  MAKE_VIDEO_OLD_SERVER,
} from "./gg_version_strip_core.js";
import { versionInfoFields, versionInfoPanelRows } from "./gg_version_info_core.js";
import { resolveSendTarget } from "./gg_send_target_core.js";
import { batchProgressView, createRenderStatus, promptCutTarget, renderBadgeView, renderGlobalView } from "./gg_render_status_core.js";
import { captureRouteMissing, captureToast, createAutoCapture } from "./gg_auto_capture_core.js";
import { selectionBarView, iconRowView } from "./gg_status_panel_core.js";
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
  shortTemplateName,
  templateComboItems,
  templateLabel,
  isBuiltinTemplate,
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
  normalizeSceneCreateDialogInput,
  SCENE_NAME_MAX_LEN,
  PROJECT_NAME_MAX_LEN,
} from "./gg_ask_text_core.js";
import {
  loadTimelineOpen,
  saveTimelineOpen,
  shouldIgnoreShortcut,
  pluginKeyScopeActive,
  timelineShortcutAllowed,
  timelineToggleTooltip,
} from "./gg_timeline_toggle_core.js";
import {
  fixedTimelineBodyHeight,
  fixedPanelChrome,
  fixedBottomPanelHeight,
  anchoredBottomPanelBox,
  normalModePreviewSize,
  editModeTimelineRow,
} from "./gg_bottom_panel_layout_core.js";
import {
  JOB_HISTORY_DOCK_SETTING_ID,
  readHeldDock,
  writeHeldDock,
  planDockOnCutManagerOpen,
  planDockOnCutManagerClose,
  resolveSettingApi,
} from "./gg_job_history_dock_core.js";
import {
  EDIT_MODE_LABEL,
  EDIT_MODE_ON_CLASS,
  editPreviewAtPlayhead,
  editPreviewOverlayRect,
  loadEditPreviewMode,
  saveEditPreviewMode,
} from "./gg_edit_preview_core.js";
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
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
  projectSettingsModalPatch,
  folderCheckErrorText,
  GEN_ASPECT_RATIOS,
  GEN_RESOLUTION_CUSTOM,
  dimensionsFromGenSettings,
  genFormFromResolutionChoice,
  resolutionDropdownItems,
  resolutionChoiceValue,
  randomSeedFromProjectSettings,
} from "./gg_project_settings_core.js";
import {
  SETTINGS_TAB_LABELS,
  SETTINGS_TAB_PROJECT,
  settingsTabPanes,
} from "./gg_settings_tabs_core.js";
import { dialogEscapeAction, modalEscapeState } from "./gg_dialog_escape_core.js";
import {
  cutSplitModelOptions,
  cutSplitModelOptionsHtml,
  cutSplitModelScanDirsText,
  AI_MODEL_VL_HINT,
  cutSplitModelLoadErrorText,
  cutSplitUseAi,
  aiCutSplitButtonState,
  aiMakeCutIconButtonState,
  cutSplitSettingsPatch,
  cutSplitMissingModel,
  cutSplitMissingModelHtml,
  cutSplitMemoryConfirm,
  cutSplitPrecheckStep,
  USE_AI_LABEL,
  USE_AI_FEATURES_HINT,
  USE_AI_OFF_TIP,
} from "./gg_cut_split_model_core.js";
import {
  undoKeyAction,
  undoScope,
  nextUndoArea,
  sameSnapshot,
  fitOrderGroupsSnapshot,
  shotsCounterpart,
  shotsUndoSteps,
  snapshotTimelineEdit,
  applyTimelineSnapshot,
} from "./gg_undo_core.js";
import {
  createProjectHistory,
  historyStepId,
  fieldHistoryLabel,
  clampHistorySteps,
  HISTORY_STEPS_DEFAULT,
} from "./gg_history_core.js";
import {
  cutListWorkflow,
  parseCutList,
  aiCutSplitStatusText,
  aiMakeCutResultPreview,
  createCutsConfirmMessage,
  cutListPayload,
  runAiMakeCutJob,
  aiMakeCutProgressText,
  aiMakeCutErrorText,
  aiMakeCutResumable,
  aiMakeCutUsedStorageKey,
  saveAiMakeCutJob,
  loadAiMakeCutJob,
  clearAiMakeCutJob,
  markAiMakeCutOffered,
  shouldOfferStoredAiMakeCut,
  AI_MAKE_CUT_LABEL,
  AI_MAKE_CUT_WAIT_MS,
  AI_MAKE_CUT_TIMEOUT_TEXT,
  AI_MAKE_CUT_CAPTIONS_KEY,
  CAPTION_MODE_CHOICES,
  CAPTION_MODE_DEFAULT,
  readCaptionMode,
} from "./gg_cut_list_core.js";
import {
  generateAllOrder,
  generateAllCutView,
  generateAllProgressView,
  generateAllConfirmMessage,
  generateAllFinishedToast,
  isGenerateAllRunning,
} from "./gg_generate_all_core.js";

const EXT = "gonggan.cut";
const PID_KEY = "gg.pid";
const TIMELINE_TAB = "gg-timeline";
const EXPORT_TAB = EXPORT_TAB_ID;
const SHOTS_TAB = "gg-shots";
/** Lower-left cut panel (versions, End card, Needs redo, Regen, Send last output). Still rendered, only hidden. */
const SHOW_CUT_PANEL = false;
/** With SHOW_CUT_PANEL off: the same slot shows a status card for the selection with the Queue button. */
const SHOW_STATUS_PANEL = true;
const CUT_PANEL_ROOT_CLASS = SHOW_CUT_PANEL ? "" : SHOW_STATUS_PANEL ? " gg-cutpanel-status" : " gg-cutpanel-off";
/** Large selection bar (Make Scene / Remove from Scene). Off = not rendered; the icon row takes its place. */
const SHOW_SEL_BAR = false;
/** "Show redo cuts only" option in the Shots toolbar. Off = not shown and the filter is forced off. */
const SHOW_REDO_FILTER = false;
/** "Cuts | Final cut list" toggle in the Shots toolbar. Off = not shown and the view is forced to "cuts". */
const SHOW_FINAL_LIST = false;
/**
 * AI Make Cut (internally "cut split") in the UI: the Shots toolbar button, the cut list right-click entry and the
 * Project Settings AI section (Use AI, model, pre-check). Off = none of it is shown and nothing calls
 * /gonggan/cut-split/*; code and server routes are kept.
 */
const AI_CUT_SPLIT_VISIBLE = true;
const bus = new EventTarget();
const state = { projects: [], projectsLoaded: false, pid: localStorage.getItem(PID_KEY) || "", timeline: null, cutId: "", cutSel: new Set(), error: "" };
/** Workflow graphs for the open project. Cut switches read this; only open/reload/save fill it. */
const projectMemory = createProjectMemory();
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
  /** Open inline cut title field: { cutId, input, finish } or null. */
  inlineRename: null,
  /** Open inline scene header field: { groupId, input, finish } or null. */
  inlineSceneRename: null,
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
/** Server Generate All batch snapshot (GET /gonggan/generate-all/status, `gonggan.generate_all` events). */
const genAll = { batch: null, starting: false };
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
// One project History for Shots and Timeline. ComfyUI's own graph undo is left alone on the canvas.
const projectHistory = createProjectHistory({ limit: HISTORY_STEPS_DEFAULT });
let historyStepsLimit = HISTORY_STEPS_DEFAULT;
let histEpoch = 0;
let historyLoadPid = "";
let historyLoaded = false;
let historySaveTimer = 0;
let historyApplying = false;
const historyPurgeIds = [];
const fieldHistFrom = new Map();
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
  if (playsAsVideo(media)) {
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
  if (!res.ok || data.ok === false) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
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

let projectListRefreshLastAt = 0;
let projectListRefreshInFlight = null;

function syncProjectSelectElements(selectedId = state.pid) {
  const pid = selectedId || "";
  const html = projectSelectOptionsHtml(state.projects, pid, esc, projectOptionLabel);
  document.querySelectorAll("select.gg-proj").forEach((sel) => {
    const focused = document.activeElement === sel;
    sel.innerHTML = html;
    if (pid && state.projects.some((p) => p.id === pid)) sel.value = pid;
    if (focused) sel.focus();
  });
}

async function refreshProjectListForDropdown() {
  if (projectListRefreshInFlight) return projectListRefreshInFlight;
  const now = Date.now();
  if (!shouldRefreshProjectList(now, projectListRefreshLastAt)) return;
  projectListRefreshLastAt = now;
  const keepPid = state.pid;
  projectListRefreshInFlight = (async () => {
    try {
      const data = await getJson("/gonggan/projects");
      state.projects = data.projects || [];
      state.projectsLoaded = true;
      state.error = "";
      if (!state.projects.some((p) => p.id === keepPid)) {
        const pick = state.projects.find((p) => p.id === data.active_project_id) || state.projects[0];
        state.pid = pick ? pick.id : "";
        bus.dispatchEvent(new Event("projects"));
        await loadTimeline();
      } else {
        syncProjectSelectElements(keepPid);
      }
    } catch (e) {
      state.error = sentence(`Could not load projects: ${e.message}`, "Check that ComfyUI is running, then reload the page.");
    }
    refreshSdk(true);
    refreshProjectTemplateFlag();
    refreshCutSplitUseAi();
  })();
  try {
    await projectListRefreshInFlight;
  } finally {
    projectListRefreshInFlight = null;
  }
}

function onProjectSelectOpenIntent() {
  void refreshProjectListForDropdown();
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
  syncRandomSeedToolbar(document);
  return true;
}

async function loadTimeline(opts) {
  if (!state.pid) { state.timeline = null; bus.dispatchEvent(new Event("timeline")); return; }
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
  if (next && token.pid === state.pid) {
    syncProjectMemory(token.pid, next.cuts || [], { reload: !!(opts && opts.reloadWorkflows) });
  }
  bus.dispatchEvent(new Event("timeline"));
  syncRandomSeedToolbar(document);
  void ensureProjectHistory(token.pid);
  void refreshExportOutputPath();
  await reloadOpenCutWorkflowIfRepChanged();
  void offerStoredAiMakeCutResult();
}

async function offerStoredAiMakeCutResult() {
  if (!state.pid || !isNativeProject() || !AI_CUT_SPLIT_VISIBLE) return;
  const storedId = loadAiMakeCutJob(localStorage, state.pid);
  if (!storedId) return;
  const usedId = localStorage.getItem(aiMakeCutUsedStorageKey(state.pid)) || "";
  let job = null;
  try {
    job = (await getJson(`/gonggan/ai-cut-split/status?job=${encodeURIComponent(storedId)}`)).job;
  } catch (_) {
    return;
  }
  if (!shouldOfferStoredAiMakeCut(localStorage, state.pid, job, storedId, usedId)) return;
  markAiMakeCutOffered(localStorage, state.pid, job.id);
  const n = job.cuts?.length || 0;
  ggToast(AI_MAKE_CUT_LABEL, `Finished with ${n} cut${n === 1 ? "" : "s"}. Open ${AI_MAKE_CUT_LABEL} to review and create them.`, "ok", {
    actionLabel: "Open",
    onAction: () => openAiCutSplitModal(),
  });
}

function paintHistoryLists() {
  document.querySelectorAll(".gg-root.gg-shots .gg-history-list").forEach((list) => {
    const root = list.closest(".gg-root");
    if (root) fillHistoryList(list);
  });
}

function fillHistoryList(list) {
  const rows = state.pid ? projectHistory.rows() : [];
  const cursor = projectHistory.sizes().cursor;
  const openCls = cursor < 0 ? " gg-history-current" : "";
  const open = rows.length
    ? `<button type="button" class="gg-history-step${openCls}" data-hist-index="-1">Open</button>`
    : "";
  const items = rows.map((r) =>
    `<button type="button" class="gg-history-step${r.current ? " gg-history-current" : ""}${r.future ? " gg-history-future" : ""}" data-hist-index="${r.index}">${esc(r.label)}</button>`).join("");
  list.innerHTML = rows.length ? open + items : `<div class="gg-history-empty gg-dim">No history yet</div>`;
  const cur = list.querySelector(".gg-history-current");
  if (cur) {
    const top = cur.offsetTop - list.offsetTop;
    const bottom = top + cur.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }
}

function historyListHtml() {
  return `<div class="gg-history-title">History</div>
    <div class="gg-history-list" role="listbox"></div>`;
}

let historyPopCleanup = null;

function closeHistoryPopover() {
  if (historyPopCleanup) {
    historyPopCleanup();
    historyPopCleanup = null;
  }
  document.querySelectorAll(".gg-history-pop").forEach((el) => el.remove());
}

function positionHistoryPopover(pop, btn) {
  const pad = 6;
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  let left = r.right - w;
  let top = r.bottom + 4;
  if (left < pad) left = pad;
  if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
  if (top + h > window.innerHeight - pad) top = r.top - h - 4;
  if (top < pad) top = pad;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function openHistoryPopover(btn) {
  const root = btn.closest(".gg-root");
  if (!root) return;
  closeHistoryPopover();
  const pop = document.createElement("div");
  pop.className = "gg-history gg-history-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "History");
  pop.innerHTML = historyListHtml();
  root.appendChild(pop);
  pop.addEventListener("mousedown", (e) => e.stopPropagation());
  const list = pop.querySelector(".gg-history-list");
  fillHistoryList(list);
  list?.addEventListener("click", (e) => {
    const step = e.target.closest?.(".gg-history-step");
    if (!step) return;
    e.stopPropagation();
    const index = Number(step.dataset.histIndex);
    if (!Number.isFinite(index)) return;
    void jumpProjectHistory(index);
  });
  positionHistoryPopover(pop, btn);
  btn.setAttribute("aria-expanded", "true");
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    closeHistoryPopover();
  };
  const onPointer = (e) => {
    if (e.target.closest?.(".gg-history-pop") || e.target.closest?.(".gg-history-btn")) return;
    closeHistoryPopover();
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("mousedown", onPointer, true);
  historyPopCleanup = () => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onPointer, true);
    btn.setAttribute("aria-expanded", "false");
    pop.remove();
  };
}

function toggleHistoryPopover(btn) {
  if (btn.closest(".gg-root")?.querySelector(".gg-history-pop")) closeHistoryPopover();
  else openHistoryPopover(btn);
}

function noteHistoryDropped(rows) {
  for (const s of rows || []) {
    const id = s && s.id;
    if (id && !historyPurgeIds.includes(id)) historyPurgeIds.push(id);
  }
}

function noteHistoryChange() {
  histEpoch++;
  bus.dispatchEvent(new Event("history"));
  scheduleHistorySave();
}

function scheduleHistorySave() {
  clearTimeout(historySaveTimer);
  const pid = state.pid;
  const epoch = histEpoch;
  if (!pid) return;
  historySaveTimer = setTimeout(() => { void saveProjectHistory(pid, epoch); }, 400);
}

async function saveProjectHistory(pid, epoch) {
  if (!pid || epoch !== histEpoch || state.pid !== pid) return;
  const snap = projectHistory.snapshot();
  try {
    const purge = historyPurgeIds.slice(0, 500);
    const saved = await postJson("/gonggan/history", {
      pid, cursor: snap.cursor, steps: snap.steps, loaded: historyLoaded, purge,
    });
    for (let i = historyPurgeIds.length - 1; i >= 0; i--) {
      if (purge.includes(historyPurgeIds[i])) historyPurgeIds.splice(i, 1);
    }
    if (epoch !== histEpoch || state.pid !== pid || !saved || saved.ok === false) return;
    if (typeof saved.limit === "number") {
      historyStepsLimit = clampHistorySteps(saved.limit);
      projectHistory.setLimit(historyStepsLimit);
    }
    const now = projectHistory.snapshot();
    if (now.steps.length !== (saved.steps || []).length || now.cursor !== saved.cursor) {
      projectHistory.load(pid, saved);
      bus.dispatchEvent(new Event("history"));
    }
  } catch (_) {}
}

async function ensureProjectHistory(pid) {
  if (!pid || historyLoadPid === pid) return;
  historyLoadPid = pid;
  const epoch = histEpoch;
  try {
    const d = await getJson(`/gonggan/history?pid=${encodeURIComponent(pid)}`);
    if (state.pid !== pid) return;
    if (typeof d.limit === "number") {
      historyStepsLimit = clampHistorySteps(d.limit);
      projectHistory.capOnly(historyStepsLimit);
    }
    const dropped = epoch !== histEpoch && projectHistory.sizes().steps
      ? projectHistory.mergeLoaded(pid, d)
      : projectHistory.load(pid, d);
    noteHistoryDropped(dropped);
    historyLoaded = true;
    bus.dispatchEvent(new Event("history"));
    if (dropped.length) scheduleHistorySave();
  } catch (_) {
    if (historyLoadPid === pid && state.pid === pid) historyLoadPid = "";
  }
}

async function restoreCutsByIds(ids, { selectFirst = false, historyStep = null } = {}) {
  const reqPid = state.pid;
  const body = { pid: reqPid, cuts: ids };
  if (historyStep) body.history_step = historyStep;
  const d = await postJson("/gonggan/cut/restore", body);
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
  return d;
}

function selectProject(pid) {
  if (pid === state.pid) return;
  flushPendingCutFields();
  projectHistory.clear();
  histEpoch++;
  historyLoadPid = "";
  historyLoaded = false;
  historyPurgeIds.length = 0;
  clearTimeout(historySaveTimer);
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
const NATIVE_ONLY_TIP = "Not available for read-only (imported) projects";

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
  const suffix = p.native ? "" : " (read-only)";
  return `${p.name || p.id}${suffix}`;
}

let projectModalEl = null;
let projectModalEsc = null;

function projectCaptionLang() {
  return normalizeProjectSettings(state.timeline?.project?.settings).caption_lang;
}

function unbindProjectModalEscape() {
  if (!projectModalEsc) return;
  document.removeEventListener("keydown", projectModalEsc, true);
  projectModalEsc = null;
}

/** Escape cancels Settings / New Project (no save). Capture so an open menu is seen before it handles the key. */
function bindProjectModalEscape(wrap) {
  unbindProjectModalEscape();
  projectModalEsc = (e) => {
    if (projectModalEl !== wrap || !wrap.isConnected) return;
    const backdrops = [...document.querySelectorAll(".gg-modal-backdrop")];
    const sel = e.target?.closest?.("select");
    let selectOpen = false;
    if (sel && wrap.contains(sel)) {
      try { selectOpen = sel.matches(":open"); } catch (_) { selectOpen = false; }
    }
    const view = modalEscapeState({
      backdropCount: backdrops.length,
      dialogIndex: backdrops.indexOf(wrap),
      expandedCombos: wrap.querySelectorAll('.gg-tpl-combo[aria-expanded="true"]').length,
      selectOpen,
    });
    const act = dialogEscapeAction({
      key: e.key,
      defaultPrevented: e.defaultPrevented,
      ...view,
    });
    if (act !== "close") return;
    e.preventDefault();
    e.stopPropagation();
    closeProjectModal();
  };
  document.addEventListener("keydown", projectModalEsc, true);
}

function closeProjectModal() {
  closeFolderPicker();
  unbindProjectModalEscape();
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
      ${templateFieldHtml("image")}
      ${templateFieldHtml("video")}
      ${genSettingsModalHtml(DEFAULT_PROJECT_SETTINGS)}
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-modal-cancel">Cancel</button>
        <button type="submit" class="gg-btn gg-primary gg-modal-create">Create</button>
      </div>
    </form>`;
  document.body.appendChild(wrap);
  projectModalEl = wrap;
  bindProjectModalEscape(wrap);
  const form = wrap.querySelector("form");
  const nameIn = wrap.querySelector(".gg-modal-name");
  const locIn = wrap.querySelector(".gg-modal-folder");
  const pathHint = wrap.querySelector(".gg-np-path");
  const locErr = wrap.querySelector(".gg-modal-folder-err");
  const createBtn = wrap.querySelector(".gg-modal-create");
  const kindTemplates = { image: DEFAULT_PROJECT_SETTINGS.image_template, video: DEFAULT_PROJECT_SETTINGS.video_template };
  for (const kind of ["image", "video"]) {
    wireProjectTemplateField(wrap.querySelector(`[data-tpl="${kind}"]`), {
      get: () => kindTemplates[kind],
      set: (ref) => { kindTemplates[kind] = ref; },
    });
  }
  const syncPath = () => {
    const locForPath = locIn.value.trim() || defaultStorageHint;
    const p = projectFolderPath(locForPath, nameIn.value);
    if (p) {
      pathHint.textContent = newProjectFolderPreviewText(p);
      const tip = userVisiblePathTooltip(p);
      if (tip) pathHint.title = tip;
      else pathHint.removeAttribute("title");
    } else if (!locIn.value.trim()) {
      pathHint.textContent = defaultProjectStorageHint(defaultStorageHint);
      const tip = userVisiblePathTooltip(defaultStorageHint);
      if (tip) pathHint.title = tip;
      else pathHint.removeAttribute("title");
    } else {
      pathHint.textContent = "";
      pathHint.removeAttribute("title");
    }
  };
  let defaultStorageHint = "";
  const applyDefaultStorageHint = (dir) => {
    defaultStorageHint = String(dir || "").trim();
    locIn.placeholder = defaultProjectLocationPlaceholder(defaultStorageHint);
    syncPath();
  };
  getJson("/gonggan/settings")
    .then((d) => applyDefaultStorageHint(d.default_project_location))
    .catch(() => applyDefaultStorageHint(""));
  const showLocErr = (msg) => {
    locErr.textContent = msg;
    locIn.focus();
  };
  locIn.value = loadLastLocation(localStorage);
  syncPath();
  wrap.querySelector(".gg-modal-gen-res")?.addEventListener("change", () => syncGenResolutionFields(wrap));
  wrap.querySelector(".gg-modal-gen-aspect")?.addEventListener("change", () => syncGenResolutionFields(wrap));
  nameIn.addEventListener("input", syncPath);
  locIn.addEventListener("input", () => { locErr.textContent = ""; syncPath(); });
  wrap.querySelector(".gg-modal-folder-browse")?.addEventListener("click", () => {
    openFolderPicker(locIn.value.trim() || defaultStorageHint, (path) => {
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
    const req = newProjectRequest({
      name: nameIn.value,
      location: locIn.value,
      imageTemplate: kindTemplates.image,
      videoTemplate: kindTemplates.video,
      gen: genFormFromResolutionChoice({
        gen_aspect: wrap.querySelector(".gg-modal-gen-aspect")?.value,
        resolution: wrap.querySelector(".gg-modal-gen-res")?.value,
        width: wrap.querySelector(".gg-modal-gen-width")?.value,
        height: wrap.querySelector(".gg-modal-gen-height")?.value,
        random_seed: !!wrap.querySelector(".gg-modal-random-seed")?.checked,
      }),
    });
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
      closeProjectModal();
      await loadProjects();
      if (d.project?.id) selectProject(d.project.id);
      if (folderNotCreated(d.project)) ggToast("Project", `Created "${name}". ${NO_FOLDER_ROUTE_HINT}`, "warn");
      else ggToast("Project", `Created "${name}" ${projectCreatedFolderToastDetail(d.project.folder)}`, "ok");
    } catch (err) {
      if (err.status === 400 && !/template/i.test(err.message || "")) showLocErr(err.message);
      else ggToast("Project", err.message, "warn");
    } finally {
      submitting = false;
      if (wrap.isConnected) createBtn.disabled = false;
    }
  });
  nameIn.focus();
}

const TEMPLATE_FIELDS = {
  default: { label: "Default template", title: "ComfyUI saved workflow used as this project's template", none: true },
  image: { label: "Image template", title: "Workflow for new image cuts and Generate All (a cut's own workflow wins)", none: false },
  video: {
    label: "Video template",
    title: AI_CUT_SPLIT_VISIBLE ? `Workflow for ${AI_MAKE_CUT_LABEL} cuts and Image to Video` : "Workflow for Image to Video",
    none: false,
  },
};

function templateFieldHtml(key = "default") {
  const f = TEMPLATE_FIELDS[key];
  const listId = key === "default" ? "gg-tpl-list" : `gg-tpl-list-${key}`;
  return `<div class="gg-modal-field gg-tpl-field" data-tpl="${key}" title="${esc(f.title)}">
        <span class="gg-tpl-label">${esc(f.label)}</span>
        <span class="gg-tpl-wrap">
          <span class="gg-tpl-box">
            <input type="text" class="gg-tpl-combo" role="combobox" aria-label="${esc(f.label)}" aria-autocomplete="list"
              aria-expanded="false" aria-controls="${listId}" placeholder="${f.none ? "(none)" : esc(templateLabel(DEFAULT_PROJECT_SETTINGS[`${key}_template`]))}" autocomplete="off" spellcheck="false" />
            <button type="button" class="gg-tpl-toggle" tabindex="-1" aria-label="Show templates" title="Show templates">▼</button>
          </span>
          ${key === "default" ? `<button type="button" class="gg-btn gg-tpl-use-last" hidden>Use last</button>` : ""}
        </span>
        <ul class="gg-tpl-list" id="${listId}" role="listbox" aria-label="Templates" hidden></ul>
      </div>`;
}

/**
 * Template editable combobox (Project Settings, New Project): ▼ or a click shows the list, typing filters it,
 * arrows + Enter or a click pick; typed text becomes the value on Enter or when the field loses focus; Escape reverts.
 * Built-in templates show their label; typing a label picks its ref.
 * Without `field` a pick links the open project's Default template right away (no Save needed) and the Use last button
 * is offered; with `field` the value lives in field.get / field.set.
 * @param {Element | null} wrap the field from templateFieldHtml
 * @param {{ get: () => string, set: (ref: string) => void } | undefined} field
 * @returns {() => void} repaints the shown value
 */
function wireProjectTemplateField(wrap, field) {
  const input = wrap?.querySelector(".gg-tpl-combo");
  const list = wrap?.querySelector(".gg-tpl-list");
  if (!input || !list) return () => {};
  const key = wrap.dataset.tpl || "default";
  const none = TEMPLATE_FIELDS[key]?.none !== false;
  const ui = { open: false, active: -1, items: [] };
  const current = () => (field ? field.get() : projectTemplateRef) || "";
  const shown = () => (current() ? templateLabel(current()) : "");
  const comboItems = () => templateComboItems(userWorkflowPaths, current(), { none });
  const showValue = () => {
    input.value = shown();
    input.title = current() || "(none)";
  };
  let overlayListeners = null;
  const clearOverlayListeners = () => {
    if (!overlayListeners) return;
    window.removeEventListener("scroll", overlayListeners.reposition, true);
    window.removeEventListener("resize", overlayListeners.reposition);
    document.removeEventListener("mousedown", overlayListeners.outside, true);
    overlayListeners = null;
  };
  const syncListOverlay = () => {
    if (!ui.open) {
      list.style.cssText = "";
      clearOverlayListeners();
      return;
    }
    const r = input.getBoundingClientRect();
    list.style.position = "fixed";
    list.style.left = `${Math.round(r.left)}px`;
    list.style.top = `${Math.round(r.bottom + 2)}px`;
    list.style.width = `${Math.round(r.width)}px`;
    list.style.minWidth = `${Math.round(r.width)}px`;
    list.style.zIndex = "10100";
    list.style.maxHeight = "200px";
    list.style.overflowY = "auto";
    if (!overlayListeners) {
      const reposition = () => { if (ui.open) syncListOverlay(); };
      const outside = (e) => {
        if (!ui.open) return;
        const t = e.target;
        if (wrap.contains(t) || list.contains(t)) return;
        close(true);
      };
      overlayListeners = { reposition, outside };
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
      document.addEventListener("mousedown", outside, true);
    }
  };
  const render = () => {
    input.setAttribute("aria-expanded", ui.open ? "true" : "false");
    list.hidden = !ui.open;
    input.removeAttribute("aria-activedescendant");
    if (!ui.open) {
      syncListOverlay();
      return;
    }
    const cur = current();
    list.innerHTML = ui.items.length
      ? ui.items.map((it, i) => {
        const cls = `gg-combo-opt${i === ui.active ? " gg-active" : ""}${it.value === cur ? " gg-cur" : ""}`;
        return `<li role="option" id="gg-tpl-opt-${key}-${i}" class="${cls}" data-i="${i}" aria-selected="${i === ui.active}" title="${esc(it.label)}">${esc(it.label)}</li>`;
      }).join("")
      : `<li class="gg-combo-empty">No matches</li>`;
    if (ui.active >= 0) {
      input.setAttribute("aria-activedescendant", `gg-tpl-opt-${key}-${ui.active}`);
      list.children[ui.active]?.scrollIntoView({ block: "nearest" });
    }
    syncListOverlay();
  };
  const openList = (query) => {
    ui.items = comboFilter(comboItems(), query);
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
    input.value = it.label;
    void apply(it.value);
  };
  const commitTyped = () => {
    const ref = comboTypedValue(comboItems(), input.value) || (none ? "" : current());
    if (ref === current()) showValue();
    else void apply(ref);
  };
  const showAll = () => {
    openList("");
    fetchUserWorkflowPaths().then(() => { if (ui.open && wrap.isConnected) openList(input.value === shown() ? "" : input.value); });
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
    } else if (!wasOpen) openList(input.value === shown() ? "" : input.value);
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
        <button type="button" class="gg-btn gg-primary gg-fp-select" disabled>Select this folder</button>
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
    const parentRow = view?.parentEntry
      ? `<li role="option" class="gg-fp-item gg-fp-parent" data-up="1" title="${esc(view.parentEntry.path)}">${esc(view.parentEntry.name)}</li>`
      : "";
    const itemRows = view?.items.length
      ? view.items.map((it, i) => `<li role="option" class="gg-fp-item" data-i="${i}" title="${esc(it.path)}">${esc(it.name)}</li>`).join("")
      : "";
    listEl.innerHTML = !view
      ? ""
      : (parentRow || itemRows)
        ? parentRow + itemRows
        : `<li class="gg-fp-empty">No folders</li>`;
    listEl.scrollTop = 0;
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
    if (!li) return;
    if (li.dataset.up && view?.parentEntry) {
      void load([view.parentEntry.path]);
      return;
    }
    const it = view?.items[Number(li.dataset.i)];
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

function projectRandomSeedOn() {
  return randomSeedFromProjectSettings(state.timeline?.project?.settings, localStorage);
}

function syncRandomSeedToolbar(root) {
  const cb = (root || document).querySelector?.(".gg-random-seed-cb");
  if (cb) cb.checked = projectRandomSeedOn();
}

async function persistRandomSeedToProject(on) {
  saveRandomSeedOn(localStorage, on);
  if (!state.pid || !isNativeProject()) return;
  try {
    const reqPid = state.pid;
    const data = await postJson("/gonggan/project/update", {
      pid: reqPid,
      fields: { settings: { random_seed: on } },
    });
    if (data.timeline) adoptMutationTimeline(data.timeline, reqPid);
  } catch (_) {
    /* toolbar still reflects localStorage */
  }
}

function syncGenResolutionFields(wrap) {
  const sel = wrap.querySelector(".gg-modal-gen-res");
  const box = wrap.querySelector(".gg-gen-custom");
  if (!sel || !box) return;
  const custom = sel.value === GEN_RESOLUTION_CUSTOM;
  box.hidden = !custom;
  if (custom) return;
  const dims = dimensionsFromGenSettings(wrap.querySelector(".gg-modal-gen-aspect")?.value, sel.value);
  const wIn = wrap.querySelector(".gg-modal-gen-width");
  const hIn = wrap.querySelector(".gg-modal-gen-height");
  if (wIn) wIn.value = String(dims.width);
  if (hIn) hIn.value = String(dims.height);
}

function genSettingsModalHtml(curSettings) {
  const s = normalizeProjectSettings(curSettings);
  const aspectOpts = GEN_ASPECT_RATIOS.map(
    (a) => `<option value="${esc(a)}"${a === s.gen_aspect ? " selected" : ""}>${esc(a)}</option>`,
  ).join("");
  const choice = resolutionChoiceValue(s.resolution_short);
  const resOpts = resolutionDropdownItems().map(
    (item) => `<option value="${esc(item.value)}"${item.value === choice ? " selected" : ""}>${esc(item.label)}</option>`,
  ).join("");
  return `<fieldset class="gg-gen-settings">
    <legend>Generation</legend>
    <label class="gg-modal-field">Aspect ratio
      <select class="gg-modal-gen-aspect">${aspectOpts}</select>
    </label>
    <label class="gg-modal-field">Resolution
      <select class="gg-modal-gen-res">${resOpts}</select>
      <span class="gg-modal-hint">Short side presets follow the aspect ratio. Custom uses the width and height you enter. Sizes snap to multiples of 8.</span>
    </label>
    <div class="gg-gen-custom"${choice === GEN_RESOLUTION_CUSTOM ? "" : " hidden"}>
      <div class="gg-gen-custom-dims">
        <label class="gg-modal-field">Width
          <input type="number" class="gg-modal-gen-width" min="8" max="4096" step="8" value="${Number(s.width) || 0}" />
        </label>
        <label class="gg-modal-field">Height
          <input type="number" class="gg-modal-gen-height" min="8" max="4096" step="8" value="${Number(s.height) || 0}" />
        </label>
      </div>
      <span class="gg-modal-hint">Saved with this project. Aspect ratio does not change a custom size.</span>
    </div>
    <label class="gg-modal-field gg-modal-random-seed-field">
      <span class="gg-switch-row"><input type="checkbox" class="gg-modal-random-seed"${s.random_seed ? " checked" : ""} /> ${esc(RANDOM_SEED_LABEL)}</span>
      <span class="gg-modal-hint">Same as the Queue toolbar toggle: new sampler seeds per job when on.</span>
    </label>
  </fieldset>`;
}

function openProjectSettingsModal() {
  if (!state.pid) return;
  closeProjectModal();
  const nat = isNativeProject();
  const curSettings = normalizeProjectSettings(state.timeline?.project?.settings);
  const initialTabs = settingsTabPanes(SETTINGS_TAB_PROJECT);
  const wrap = document.createElement("div");
  wrap.className = "gg-modal-backdrop";
  wrap.innerHTML = `
    <form class="gg-modal gg-proj-settings-modal" role="dialog" aria-label="Project settings">
      <h3 class="gg-modal-title">Project Settings</h3>
      <div class="gg-settings-tabs" role="tablist" aria-label="Settings">
        <button type="button" class="gg-btn gg-settings-tab${initialTabs.project ? " gg-on" : ""}" role="tab" id="gg-settings-tab-project" aria-selected="${initialTabs.project ? "true" : "false"}" aria-controls="gg-settings-pane-project" data-settings-tab="project">${esc(SETTINGS_TAB_LABELS.project)}</button>
        <button type="button" class="gg-btn gg-settings-tab${initialTabs.global ? " gg-on" : ""}" role="tab" id="gg-settings-tab-global" aria-selected="${initialTabs.global ? "true" : "false"}" aria-controls="gg-settings-pane-global" data-settings-tab="global">${esc(SETTINGS_TAB_LABELS.global)}</button>
      </div>
      <div class="gg-settings-pane" role="tabpanel" id="gg-settings-pane-project" aria-labelledby="gg-settings-tab-project" data-settings-pane="project"${initialTabs.project ? "" : " hidden"}>
      ${nat ? `<label class="gg-modal-field">Output folder
        <span class="gg-folder-row">
          <input type="text" class="gg-modal-folder" maxlength="260" spellcheck="false" autocomplete="off" placeholder="e.g. D:\\Films\\My Film" />
          <button type="button" class="gg-btn gg-modal-folder-browse">Browse…</button>
        </span>
        <span class="gg-modal-hint">Generated outputs are saved in its assets folder. Empty = default: the plugin's projects folder.</span>
        <span class="gg-modal-hint gg-split-err gg-modal-folder-err" aria-live="polite"></span>
      </label>` : ""}
      ${nat ? "" : templateFieldHtml()}
      ${nat ? `${templateFieldHtml("image")}${templateFieldHtml("video")}` : ""}
      ${nat ? genSettingsModalHtml(curSettings) : ""}
      </div>
      <div class="gg-settings-pane" role="tabpanel" id="gg-settings-pane-global" aria-labelledby="gg-settings-tab-global" data-settings-pane="global"${initialTabs.global ? "" : " hidden"}>
      <label class="gg-modal-field gg-history-steps-field">History steps
        <input type="number" class="gg-modal-history-steps" min="1" max="500" step="1" value="${HISTORY_STEPS_DEFAULT}" />
        <span class="gg-modal-hint">How many History steps to keep for each project. Older steps are removed and their hidden files are deleted.</span>
      </label>
      ${nat && AI_CUT_SPLIT_VISIBLE ? `<label class="gg-modal-field gg-use-ai-field">
        <span class="gg-switch-row">${esc(USE_AI_LABEL)}
          <input type="checkbox" class="gg-switch gg-modal-use-ai" role="switch" disabled />
        </span>
        <span class="gg-modal-hint">${esc(USE_AI_FEATURES_HINT)}</span>
      </label>
      <label class="gg-modal-field gg-cut-split-model-field">AI model<span class="gg-ai-model-vl-hint"> ${esc(AI_MODEL_VL_HINT)}</span>
        <select class="gg-modal-cut-split-model" disabled><option>Loading…</option></select>
        <span class="gg-modal-hint gg-ai-model-dirs"></span>
      </label>` : ""}
      </div>
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-modal-cancel">Cancel</button>
        <button type="submit" class="gg-btn gg-primary">Save</button>
      </div>
    </form>`;
  document.body.appendChild(wrap);
  projectModalEl = wrap;
  bindProjectModalEscape(wrap);
  const showSettingsTab = (id) => {
    const panes = settingsTabPanes(id);
    wrap.querySelectorAll("[data-settings-tab]").forEach((btn) => {
      const on = panes[btn.dataset.settingsTab] === true;
      btn.classList.toggle("gg-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    wrap.querySelectorAll("[data-settings-pane]").forEach((pane) => {
      pane.hidden = panes[pane.dataset.settingsPane] !== true;
    });
  };
  wrap.querySelector(".gg-settings-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-settings-tab]");
    if (!btn) return;
    if (document.activeElement?.classList?.contains("gg-tpl-combo")) document.activeElement.blur();
    showSettingsTab(btn.dataset.settingsTab);
  });
  const form = wrap.querySelector("form");
  wireProjectTemplateField(wrap.querySelector('[data-tpl="default"]'));
  // 0.9.135: no Default template field; an old project-level template shows (and saves) as its Image template.
  const kindTemplates = { image: effectiveImageTemplate(curSettings.image_template, projectTemplateRef), video: curSettings.video_template };
  for (const kind of ["image", "video"]) {
    wireProjectTemplateField(wrap.querySelector(`[data-tpl="${kind}"]`), {
      get: () => kindTemplates[kind],
      set: (ref) => { kindTemplates[kind] = ref; },
    });
  }
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) closeProjectModal(); });
  wrap.querySelector(".gg-modal-cancel")?.addEventListener("click", closeProjectModal);
  const histIn = wrap.querySelector(".gg-modal-history-steps");
  let historyStepsInitial = historyStepsLimit;
  if (histIn) {
    histIn.value = String(historyStepsLimit);
    void getJson("/gonggan/settings").then((d) => {
      if (!wrap.isConnected || !histIn) return;
      historyStepsInitial = clampHistorySteps(d.history_steps);
      histIn.value = String(historyStepsInitial);
    }).catch(() => {});
  }
  async function saveHistoryStepsIfChanged() {
    if (!histIn) return false;
    const next = clampHistorySteps(histIn.value);
    histIn.value = String(next);
    if (next === historyStepsInitial) return false;
    const saved = await postJson("/gonggan/history/settings", { steps: next });
    historyStepsInitial = clampHistorySteps(saved.history_steps ?? next);
    historyStepsLimit = historyStepsInitial;
    const dropped = projectHistory.setLimit(historyStepsLimit);
    noteHistoryDropped(dropped);
    if (state.pid && (dropped.length || projectHistory.sizes().steps)) scheduleHistorySave();
    return true;
  }
  const folderIn = wrap.querySelector(".gg-modal-folder");
  if (!nat || !folderIn) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await saveHistoryStepsIfChanged();
        closeProjectModal();
        ggToast("Settings", "Settings saved", "ok");
      } catch (err) {
        ggToast("Settings", err.message, "warn");
      }
    });
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
  const modalRandomSeed = wrap.querySelector(".gg-modal-random-seed");
  modalRandomSeed?.addEventListener("change", () => {
    saveRandomSeedOn(localStorage, !!modalRandomSeed.checked);
    syncRandomSeedToolbar(document);
  });
  wrap.querySelector(".gg-modal-gen-res")?.addEventListener("change", () => syncGenResolutionFields(wrap));
  wrap.querySelector(".gg-modal-gen-aspect")?.addEventListener("change", () => syncGenResolutionFields(wrap));
  wrap.querySelector(".gg-modal-folder-browse")?.addEventListener("click", () => {
    openFolderPicker(folderIn.value, (path) => {
      if (!wrap.isConnected) return;
      folderIn.value = path;
      folderIn.dispatchEvent(new Event("input", { bubbles: true }));
      folderIn.focus();
    });
  });
  const modelSel = wrap.querySelector(".gg-modal-cut-split-model");
  const modelField = wrap.querySelector(".gg-cut-split-model-field");
  const useAiIn = wrap.querySelector(".gg-modal-use-ai");
  let modelInitial = "";
  let useAiInitial = null;
  const syncModelField = () => {
    const off = !!useAiIn && !useAiIn.checked;
    if (modelSel) modelSel.disabled = !modelInitial || off;
    modelField?.classList.toggle("gg-off", off);
    if (modelField) modelField.title = off ? USE_AI_OFF_TIP : "";
  };
  useAiIn?.addEventListener("change", syncModelField);
  if (modelSel) void getJson("/gonggan/cut-split/model").then(
    (d) => {
      if (!wrap.isConnected || !modelSel) return;
      const opts = cutSplitModelOptions(d);
      modelSel.innerHTML = cutSplitModelOptionsHtml(opts, esc);
      modelInitial = opts.find((o) => o.selected)?.value || "";
      const dirsEl = wrap.querySelector(".gg-ai-model-dirs");
      if (dirsEl) dirsEl.textContent = cutSplitModelScanDirsText(d);
      if (useAiIn) {
        useAiInitial = cutSplitUseAi(d);
        useAiIn.checked = useAiInitial;
        useAiIn.disabled = false;
      }
      syncModelField();
    },
    (err) => {
      if (modelSel) modelSel.innerHTML = `<option>${esc(cutSplitModelLoadErrorText(err))}</option>`;
    },
  );
  let saving = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saving) return;
    const patch = projectSettingsModalPatch(curSettings, folderIn.value, {
      image_template: kindTemplates.image,
      video_template: kindTemplates.video,
    }, genFormFromResolutionChoice({
      gen_aspect: wrap.querySelector(".gg-modal-gen-aspect")?.value,
      resolution: wrap.querySelector(".gg-modal-gen-res")?.value,
      width: wrap.querySelector(".gg-modal-gen-width")?.value,
      height: wrap.querySelector(".gg-modal-gen-height")?.value,
      random_seed: !!wrap.querySelector(".gg-modal-random-seed")?.checked,
    }));
    const aiPatch = cutSplitSettingsPatch({
      modelInitial,
      model: modelSel?.value,
      useAiInitial,
      useAi: useAiIn?.checked,
    });
    let historyChanged = false;
    try {
      historyChanged = await saveHistoryStepsIfChanged();
    } catch (err) {
      ggToast("Settings", err.message, "warn");
      return;
    }
    if (!patch && !aiPatch) {
      closeProjectModal();
      if (historyChanged) ggToast("Settings", "Settings saved", "ok");
      return;
    }
    const reqPid = state.pid;
    saving = true;
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (patch?.project_folder) {
        try {
          await postJson("/gonggan/folder/check", { path: patch.project_folder });
        } catch (err) {
          showFolderErr(folderCheckErrorText(err));
          return;
        }
      }
      if (aiPatch) {
        const saved = await postJson("/gonggan/cut-split/model", aiPatch);
        if (aiPatch.clip_name) modelInitial = aiPatch.clip_name;
        useAiInitial = cutSplitUseAi(saved);
        setCutSplitUseAi(useAiInitial);
      }
      if (!patch) {
        closeProjectModal();
        ggToast("Project", "Settings saved", "ok");
        return;
      }
      const data = await postJson("/gonggan/project/update", { pid: reqPid, fields: { settings: patch } });
      closeProjectModal();
      if (data.timeline) adoptMutationTimeline(data.timeline, reqPid);
      if (data.projects) state.projects = data.projects;
      await loadProjects();
      bus.dispatchEvent(new Event("projects"));
      bus.dispatchEvent(new Event("timeline"));
      paintProjectSummary(null);
      syncRandomSeedToolbar(document);
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
 * @param {{ title: string, label?: string, value?: string, okLabel?: string, maxLength?: number, allowEmpty?: boolean }} opts
 * @returns {Promise<string|null>}
 */
function askText(opts) {
  if (askTextEl) return Promise.resolve(null);
  const title = String(opts?.title ?? "Name");
  const label = String(opts?.label ?? "Name");
  const initial = String(opts?.value ?? "");
  const okLabel = String(opts?.okLabel ?? "OK");
  const maxLength = Number(opts?.maxLength) > 0 ? Math.floor(Number(opts.maxLength)) : SCENE_NAME_MAX_LEN;
  const allowEmpty = !!opts?.allowEmpty;
  const normInput = (raw) =>
    allowEmpty ? normalizeSceneCreateDialogInput(raw, maxLength) : normalizeNameInput(raw, maxLength);

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
      const norm = normInput(input.value);
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
      const norm = normInput(input.value);
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
 * @param {{ message: string, danger?: boolean, okLabel?: string }} opts  danger: emphasize the OK button (deletes / reset)
 * @returns {Promise<boolean>}
 */
function askConfirm(opts) {
  if (askConfirmEl) return Promise.resolve(false);
  const { title, body } = splitConfirmMessage(opts?.message);
  const danger = !!opts?.danger;
  const okLabel = opts?.okLabel || "OK";
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "gg-modal-backdrop gg-confirm-backdrop";
    wrap.innerHTML = `
      <div class="gg-modal gg-confirm-dialog" role="alertdialog" aria-label="${esc(title)}">
        <h3 class="gg-modal-title gg-confirm-title">${esc(title)}</h3>
        ${body ? `<div class="gg-confirm-body">${esc(body)}</div>` : ""}
        <div class="gg-modal-actions">
          <button type="button" class="gg-btn gg-confirm-cancel">Cancel</button>
          <button type="button" class="gg-btn gg-confirm-ok ${danger ? "gg-danger" : "gg-primary"}">${esc(okLabel)}</button>
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
  delete wf.ggCutDisplayName;
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
  // The last open tab must stay. Closing it makes ComfyUI replace the cut workflow with a blank one.
  if (open.length < 2) return;
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
    if (resolved?.cutId && savedSnap) {
      ggWorkflowBaselines.set(resolved.cutId, savedSnap);
      rememberWorkflowInMemory(resolved.cutId, resolved.cut, savedSnap);
    }
    ggWipLastAutosaveAt = Date.now();
    const okMsg = autosaveStatusMessage({ failing: false, wasFailing: ggWipAutosaveFailing, label: autosaveStatusLabelForWorkflow(wf) });
    ggWipAutosaveFailing = false;
    if (okMsg) {
      sdk.msg = okMsg;
      bus.dispatchEvent(new Event("sdk"));
    }
  } catch (e) {
    console.warn("[gonggan] periodic wip autosave failed", e);
    ggWipAutosaveFailing = true;
    sdk.msg = autosaveStatusMessage({ failing: true, error: e?.message || String(e), label: autosaveStatusLabelForWorkflow(wf) });
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

async function fetchCutWorkingCopyJson(cut, kind) {
  const rel = shotWorkflowRelPathById({
    projectId: state.pid,
    cutId: cut?.id || "",
    kind: kind || workflowKindForCut(cut),
  });
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
    if (!graphFitsKind(json, workflowKindForCut(cut))) return false;
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

function autosaveToastDetail(saved, cutId) {
  const cut = cutId ? cutById(cutId) : null;
  const labels = state.timeline ? computeCutLabels(state.timeline) : null;
  const cutLabel = cut && labels ? cutDisplayLabel(cut, labels) : "";
  const cutName = cut?.name ? String(cut.name).trim() : "";
  return savedShotWorkflowToastDetail(saved, { cutLabel, cutName });
}

function autosaveStatusLabelForWorkflow(wf) {
  const resolved = resolveWorkflowCutForWip(wf);
  if (!resolved?.cut) return workflowLabel(wf);
  const labels = state.timeline ? computeCutLabels(state.timeline) : null;
  const human = savedCutHumanLabel(
    labels ? cutDisplayLabel(resolved.cut, labels) : "",
    resolved.cut.name ? String(resolved.cut.name).trim() : "",
  );
  return human || "workflow";
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
    for (const s of savedSnaps) {
      if (!s.cutId || !s.snap) continue;
      ggWorkflowBaselines.set(s.cutId, s.snap);
      rememberWorkflowInMemory(s.cutId, cutById(s.cutId), s.snap);
    }
    for (const s of result.saved) {
      ggToast("Saved", autosaveToastDetail(s, s.cutId), "ok");
    }
  }
  ensureWorkflowManagerActive();
  return true;
}

function shotWorkflowRelPathForCut(cut) {
  return shotWorkflowRelPathById({ projectId: state.pid, cutId: cut?.id || "", kind: workflowKindForCut(cut) });
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
      loadedKind: wfLastLoadedKind,
      wantKind: workflowKindForCut(cutById(cutId)),
      lastNodeTypes: wfLastLoadedNodeTypes,
      liveNodeTypes: liveGraphNodeTypes(),
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
  if (!meta?.projectId || !meta?.cutId) return wf.ggCutDisplayName || wf.ggTabLabelCache || null;
  if (meta.projectId !== state.pid || !state.timeline) return wf.ggCutDisplayName || wf.ggTabLabelCache || null;

  const c = cutById(meta.cutId);
  if (!c) return wf.ggCutDisplayName || wf.ggTabLabelCache || null;
  const label = tabNameForCut(c);
  if (label) {
    wf.ggTabLabelCache = label;
    wf.ggCutDisplayName = label;
  }
  return label || wf.ggCutDisplayName || wf.ggTabLabelCache || null;
}

/** Visible workflow-tab text: the cut's display label, never its internal id. */
function tabNameForCut(cut) {
  if (!cut) return "";
  const projectName =
    state.projects.find((p) => p.id === state.pid)?.name ||
    state.timeline?.project?.name ||
    "";
  let formatted = "";
  if (projectName && state.timeline) {
    formatted = formatShotTabLabel({
      projectName,
      ...shotTabCutParts(cut, state.timeline),
      edited: cutShowsEditedMarker(cut),
    }) || "";
  }
  if (formatted && !looksLikeRawIdText(formatted)) return formatted;
  const named = cut.name && String(cut.name).trim() ? displayCutName(cut) : "";
  if (named && !looksLikeRawIdText(named)) return named;
  return formatted || named || "";
}

function paintShotTabLabelNow(cut) {
  const wf = ggOwnedShotWorkflow;
  const label = (wf && resolveShotTabLabel(wf)) || tabNameForCut(cut);
  if (!label) return;
  const ws = ggWorkflowStore();
  const open = ws?.openWorkflows || [];
  const idx = wf ? open.indexOf(wf) : -1;
  const tabs = [...document.querySelectorAll('[data-testid="workflow-tab"]')];
  const tabEl = idx >= 0 ? tabs[idx] : null;
  const span = tabEl?.querySelector(".workflow-label");
  if (!span) return;
  if (span.textContent !== label) {
    if (!span.dataset.ggSet || span.textContent !== span.dataset.ggSet) span.dataset.ggOrig = span.textContent;
    span.textContent = label;
  }
  span.dataset.ggSet = label;
  const tip = wf ? resolveShotTabTitle(wf) : null;
  if (tabEl) {
    if (tip) tabEl.title = tip;
  }
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
        if (looksLikeRawIdText(act.text)) continue;
        if (span.textContent !== act.text) span.textContent = act.text;
        delete span.dataset.ggOrig;
        delete span.dataset.ggSet;
        tabEl?.removeAttribute("title");
      }
    }
    tabEls.forEach((tabEl, i) => {
      const span = tabs[i]?.span;
      if (!span || !looksLikeRawIdText(span.textContent || "")) return;
      const idMatch = String(span.textContent).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      const cut = idMatch ? cutById(idMatch[0]) : null;
      const fromTab = open[i] && isGongganOwnedWorkflow(open[i]) ? resolveShotTabLabel(open[i]) : "";
      const label = fromTab || (cut ? tabNameForCut(cut) : "") || open[i]?.ggCutDisplayName || "";
      if (!label || looksLikeRawIdText(label) || span.textContent === label) return;
      if (!span.dataset.ggOrig) span.dataset.ggOrig = span.textContent;
      span.dataset.ggSet = label;
      span.textContent = label;
      const tip = open[i] ? resolveShotTabTitle(open[i]) : null;
      if (tip) tabEl.title = tip;
    });
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

/** A cancelled switch loaded a graph, so the next click must not treat the old identity as current. */
function invalidateLoadedCutWorkflow() {
  wfLastLoadedCutId = "";
  wfLastLoadedProjectId = "";
  wfLastLoadedKind = null;
  wfLastLoadedWorkflowKey = "";
  wfLastLoadedNodeTypes = "";
}

/**
 * Move an unsaved shot tab onto this cut's path. Temporary only: a saved file is not renamed,
 * and the path is updated through the workflow store so the tab stays one entry.
 */
async function pointTemporaryShotTabAt(wf, loadName) {
  if (!wf?.isTemporary || !loadName) return;
  const rel = String(loadName).replace(/^\/+/, "").replace(/^workflows\//i, "");
  const desired = `workflows/${rel}`;
  if (workflowPathKey(wf.path) === workflowPathKey(desired)) return;
  const ws = ggWorkflowStore();
  if (typeof ws?.renameWorkflow !== "function") return;
  try {
    await ws.renameWorkflow(wf, desired);
  } catch (e) {
    console.warn("[gonggan] retarget shot tab path failed", e);
  }
}

/** The tab loadGraphData just filled. A path string can open a different temporary than the path we asked for. */
function claimLoadedShotTab(loadName, reused) {
  if (reused && typeof reused === "object") {
    ggOwnedShotWorkflow = reused;
    return ggOwnedShotWorkflow;
  }
  adoptGongganShotWorkflow(loadName);
  const ws = ggWorkflowStore();
  const active = ws?.activeWorkflow;
  const open = ws?.openWorkflows || [];
  if (active && open.includes(active) && (!ggOwnedShotWorkflow || !open.includes(ggOwnedShotWorkflow))) {
    ggOwnedShotWorkflow = active;
  }
  return ggOwnedShotWorkflow;
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
  // A path string opens a new temporary tab (unsaved dot) whenever that path is not the active tab.
  // Pass the tab object: this cut's tab if it is already open, otherwise the one Cut Manager tab.
  const existingAtPath = findWorkflowAtShotPath(ws, loadName);
  const openList = ws?.openWorkflows || [];
  const ownedOpen =
    previous &&
    previous !== existingAtPath &&
    openList.includes(previous) &&
    isGongganOwnedWorkflow(previous)
      ? previous
      : null;
  let loadTarget = existingAtPath || null;
  if (!loadTarget && ownedOpen?.isTemporary) {
    loadTarget = ownedOpen;
  } else if (!loadTarget) {
    // Leave a saved shot tab open until the replacement tab exists. Closing it first
    // drops the only tab when a newer click cancels this switch.
    loadTarget = loadName;
  }
  const reusedTab = typeof loadTarget === "object" ? loadTarget : null;
  ensureWorkflowManagerActive();
  if (isLoadTokenStale(loadToken)) return false;
  syncSavedVideoStartImage(workflow);
  const wantTypes = workflowNodeTypes(workflow);
  try {
    if (isUiWorkflowGraph(workflow)) {
      if (typeof app.loadGraphData !== "function") return false;
      await app.loadGraphData(workflow, true, true, loadTarget, { deferWarnings: true });
    } else if (typeof app.loadApiJson === "function") {
      await app.loadApiJson(workflow, loadTarget, { deferWarnings: true });
    } else if (typeof app.loadGraphData === "function") {
      await app.loadGraphData(workflow, true, true, loadTarget, { deferWarnings: true });
    } else {
      return false;
    }
  } catch (e) {
    console.warn("[gonggan] load failed", e);
    if (isLoadTokenStale(loadToken)) invalidateLoadedCutWorkflow();
    else ggToast("Workflow", e?.message || String(e), "warn");
    return false;
  } finally {
    if (loadToken !== undefined && loadToken === wfLoadToken) ggCutSwitchAutosaveBlocked = false;
  }
  // This switch lost to a newer click. Leave every open tab in place; the latest click loads next.
  if (isLoadTokenStale(loadToken)) {
    invalidateLoadedCutWorkflow();
    return false;
  }
  if (wantTypes && liveGraphNodeTypes() !== wantTypes) {
    console.warn("[gonggan] cut workflow load mismatch", { wantTypes, live: liveGraphNodeTypes(), cutId: cut?.id });
    return false;
  }
  claimLoadedShotTab(loadName, reusedTab);
  await pointTemporaryShotTabAt(ggOwnedShotWorkflow, loadName);
  if (isLoadTokenStale(loadToken)) {
    invalidateLoadedCutWorkflow();
    return false;
  }
  markWorkflowGongganOwned(ggOwnedShotWorkflow, ggOwnedShotWorkflow?.path || storagePath, shotMeta);
  if (ggOwnedShotWorkflow?.isModified) ggOwnedShotWorkflow.isModified = false;
  if (ggOwnedShotWorkflow && cut) {
    const shown = tabNameForCut(cut);
    if (shown) ggOwnedShotWorkflow.ggCutDisplayName = shown;
  }
  try {
    const open = ws?.openWorkflows || [];
    const newTab = ggOwnedShotWorkflow;
    if (previous && newTab && previous !== newTab && open.includes(previous) && open.includes(newTab) && isGongganOwnedWorkflow(previous)) {
      // A temporary tab's dot is "never saved", not an edit. The new graph is already on another tab.
      if (previous.isTemporary) {
        await closeGongganOwnedTab(previous);
      } else {
      let prevDirty = workflowTabNeedsAutosave(previous, autosaveContextForWorkflow(previous));
      if (prevDirty) {
        const deps = buildAutosaveDeps();
        if (typeof deps.saveWorkflow === "function") {
          try {
            if (typeof ws.setActiveWorkflow === "function") ws.setActiveWorkflow(previous);
            const resolved = resolveWorkflowCutForWip(previous);
            if (resolved) syncEditedMarkerBeforeSave(resolved.cutId, resolved.cut);
            applyWipStampForWorkflow(previous);
            const prevSnap = captureWorkflowSnapshotForTab(previous);
            const result = await autosaveModifiedTabs([previous], deps);
            if (result.ok) {
              prevDirty = false;
              if (resolved?.cutId && prevSnap) rememberWorkflowInMemory(resolved.cutId, resolved.cut, prevSnap);
              for (const s of result.saved) {
                ggToast("Saved", autosaveToastDetail(s, resolveWorkflowCutForWip(previous)?.cutId || ""), "ok");
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
    }
  } catch (e) {
    console.warn("[gonggan] close previous shot tab failed", e);
  }
  if (isLoadTokenStale(loadToken)) {
    invalidateLoadedCutWorkflow();
    return false;
  }
  scheduleTabLabelRefresh();
  paintShotTabLabelNow(cut);
  scheduleLoadImageScan({ debounceMs: 200 });
  if (cut?.id) reconcileModifiedAfterShotLoad(cut.id);
  if (isLoadTokenStale(loadToken)) {
    invalidateLoadedCutWorkflow();
    return false;
  }
  await pruneExtraGongganShotTabs(ggOwnedShotWorkflow);
  if (isLoadTokenStale(loadToken)) {
    invalidateLoadedCutWorkflow();
    return false;
  }
  return true;
}

async function loadShotApiIntoDedicatedTab(apiJson, cut) {
  return loadWorkflowIntoDedicatedTab(apiJson, cut);
}

function ggToast(summary, detail, kind = "info", opts = null) {
  summary = sanitizeUserMessage(summary);
  detail = sanitizeUserMessage(detail);
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

/** Cut whose tab Make Video switched to its video workflow; cleared when its selected version changes. */
let ggMakeVideoCutId = "";
/** Image / video kind of the media whose workflow the shot tab last opened. */
let wfLastLoadedKind = null;
/** workflowContentKey of the graph currently on the shot tab. */
let wfLastLoadedWorkflowKey = "";
/** Sorted node type list when a cut load last completed (skip reload guard). */
let wfLastLoadedNodeTypes = "";

/**
 * One rule for every cut workflow tab: a video cut opens the project Video workflow,
 * an image cut the Image workflow. Make Video forces video until the cut's media is video.
 */
function workflowKindForCut(cut) {
  if (!cut) return "image";
  const force = ggMakeVideoCutId && ggMakeVideoCutId === cut.id ? "video" : null;
  return cutWorkflowKind(cut, force);
}

function markWorkflowLoadComplete(cutId, cutRec, openedVid, openedKind) {
  const cut = cutRec || cutById(cutId);
  wfLastLoadedCutId = cutId;
  wfLastLoadedProjectId = state.pid;
  wfLastLoadedRepId = repIdOf(cut);
  wfLastLoadedKind = openedKind || (openedVid ? findCutVersion(cut, openedVid)?.kind : workflowKindForCut(cut)) || null;
  wfOpenVersion = openedVid ? { projectId: state.pid, cutId, vid: openedVid } : null;
  ggCutGraphNodeCounts.set(`${state.pid}\n${cutId}`, activeGraphNodeCount());
  wfLastLoadedNodeTypes = liveGraphNodeTypes();
}

function activeGraphNodeCount() {
  const g = app.graph;
  return (g?._nodes || g?.nodes || []).length;
}

function liveGraphNodeTypes() {
  const g = app.graph;
  const nodes = g?._nodes || g?.nodes || [];
  return nodes
    .map((n) => n.type || n.comfyClass || "")
    .filter(Boolean)
    .sort()
    .join(",");
}

function workflowNodeTypes(wf) {
  if (!wf || !Array.isArray(wf.nodes)) return "";
  return wf.nodes
    .map((n) => n.type || "")
    .filter(Boolean)
    .sort()
    .join(",");
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
  if (ggMakeVideoCutId === cutId) ggMakeVideoCutId = "";
  const loadToken = ++wfLoadToken;
  await loadCutWorkflow(cutId, cut, loadToken);
}

async function fetchCutSourceWorkflowPayload(cutId, cutRec, kind) {
  const tl = state.timeline;
  const cut = cutRec || cutById(cutId);
  const effectiveKind = kind || workflowKindForCut(cut);
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

function rememberWorkflowInMemory(cutId, cut, workflow) {
  if (!cutId || !workflow || typeof workflow !== "object") return;
  const kind = workflowKindForCut(cut);
  const key = workflowContentKey(workflow);
  projectMemory.setWorkflow(cutId, {
    kind,
    workflow,
    source: "stored",
    fallback: "",
    key,
  }, projectMemory.generation());
  if (cutId === wfLastLoadedCutId) wfLastLoadedWorkflowKey = key;
}

function workflowEntryReady(entry, kind) {
  return !!(entry && entry.kind === kind && (entry.workflow || entry.empty));
}

/** Fill one cut's graph in the project memory. Does not touch the canvas. */
async function storeCutWorkflow(cut, gen, forceKind) {
  if (!cut?.id) return null;
  const kind = cutWorkflowKind(cut, forceKind || (ggMakeVideoCutId === cut.id ? "video" : null));
  let entry = { kind, workflow: null, source: "empty", fallback: "", key: "", empty: true };
  try {
    const json = await fetchCutWorkingCopyJson(cut, kind);
    if (projectMemory.generation() !== gen) return null;
    if (json && shouldRestoreWip(json, { cutId: cut.id, baseKey: cutBaseKey(cut) }) && graphFitsKind(json, kind)) {
      entry = { kind, workflow: json, source: "wip", fallback: "", key: workflowContentKey(json) };
      projectMemory.setWorkflow(cut.id, entry, gen);
      return entry;
    }
  } catch (_) {}
  if (projectMemory.generation() !== gen) return null;
  try {
    const data = await fetchCutSourceWorkflowPayload(cut.id, cut, kind);
    if (projectMemory.generation() !== gen) return null;
    if (data?.workflow) {
      entry = {
        kind,
        workflow: data.workflow,
        source: data.source || "stored",
        fallback: data.fallback || "",
        key: workflowContentKey(data.workflow),
      };
    } else if (isEmptyCutSourcePayload(data)) {
      entry = { kind, workflow: null, source: "empty", fallback: "", key: "", empty: true };
    }
  } catch (e) {
    if (projectMemory.generation() !== gen) return null;
    if (e?.status === 404) {
      try {
        const hit = await fetchCutWorkflowPayload(cut.id);
        if (projectMemory.generation() !== gen) return null;
        if (hit.ok && hit.data?.workflow && graphFitsKind(hit.data.workflow, kind)) {
          entry = { kind, workflow: hit.data.workflow, source: "draft", fallback: "", key: workflowContentKey(hit.data.workflow) };
        }
      } catch (_) {}
      if (!entry.workflow) {
        const tpl = projectMemory.template();
        if (tpl && graphFitsKind(tpl, kind)) {
          entry = { kind, workflow: tpl, source: "template", fallback: "", key: workflowContentKey(tpl) };
        }
      }
    }
  }
  if (projectMemory.generation() !== gen) return null;
  projectMemory.setWorkflow(cut.id, entry, gen);
  return entry;
}

/** Keep graphs for cuts that appeared after the open fill, without clearing graphs already in memory. */
function syncProjectMemory(pid, cuts, { reload = false } = {}) {
  if (!pid) return;
  if (reload || projectMemory.pid() !== pid) {
    refreshProjectMemoryFromServer(pid, cuts);
    return;
  }
  const gen = projectMemory.generation();
  for (const cut of cuts || []) {
    if (!cut?.id) continue;
    if (projectMemory.getWorkflow(cut.id) || projectMemory.inflight(cut.id)) continue;
    projectMemory.track(cut.id, storeCutWorkflow(cut, gen).catch(() => null));
  }
}

/** One fill of every cut workflow when the project is opened or reloaded from the server. No prefetch. */
function refreshProjectMemoryFromServer(pid, cuts) {
  const gen = projectMemory.begin(pid);
  const templatePromise = (async () => {
    try {
      const wf = await fetchProjectTemplatePayload();
      projectMemory.setTemplate(wf, gen);
    } catch (_) {}
  })();
  projectMemory.trackTemplate(templatePromise);
  for (const cut of cuts || []) {
    if (!cut?.id) continue;
    const p = storeCutWorkflow(cut, gen).catch((e) => {
      console.warn("[gonggan] cut workflow store failed", cut.id, e);
      return null;
    });
    projectMemory.track(cut.id, p);
  }
  return gen;
}

async function retargetOpenShotTab(cut, kind, key, loadToken) {
  if (isLoadTokenStale(loadToken)) return false;
  const rel = shotWorkflowRelPathById({ projectId: state.pid, cutId: cut?.id || "", kind });
  const wf = ggOwnedShotWorkflow;
  if (wf) {
    const loadName = String(rel).replace(/^workflows\//, "");
    // Do not assign wf.path here. The workflow store keys tabs by path; a direct write leaves the old tab open.
    await pointTemporaryShotTabAt(wf, loadName);
    if (isLoadTokenStale(loadToken)) return false;
    markWorkflowGongganOwned(wf, wf.path || loadName, { projectId: state.pid, cutId: cut.id });
    const shown = tabNameForCut(cut);
    if (shown) wf.ggCutDisplayName = shown;
  }
  if (isLoadTokenStale(loadToken)) return false;
  markGraphGongganCut(cut.id);
  markWorkflowLoadComplete(cut.id, cut, null, kind);
  wfLastLoadedWorkflowKey = key || "";
  applyTabLabels();
  paintShotTabLabelNow(cut);
  bus.dispatchEvent(new Event("gg-opentab"));
  return true;
}

async function openStoredCutWorkflow(cutId, cutRec, loadToken, entry) {
  const title = shotTitle(cutRec);
  const kind = entry?.kind || workflowKindForCut(cutRec);
  let workflow = entry?.workflow || null;
  let toastSummary = entry?.source === "template" ? "template" : entry?.source === "draft" ? "draft" : entry?.source === "wip" ? "Restored your unsaved edits" : "stored";
  let toastDetail = entry?.source === "wip" ? "restored edits" : (SOURCE_TOAST[entry?.source] || entry?.source || "stored");
  let toastKind = entry?.source === "wip" ? "info" : "ok";
  if (entry?.fallback) toastDetail = workflowSourceToastDetail(SOURCE_TOAST[entry.source] || toastDetail, entry.fallback);
  if (!workflow) {
    let templateWf = kind === "video" ? null : projectMemory.template();
    if (kind !== "video" && !templateWf) {
      const pending = projectMemory.templateInflight();
      if (pending) {
        await pending;
        if (isLoadTokenStale(loadToken)) return;
        templateWf = projectMemory.template();
      }
    }
    const resolved = resolveEmptyCutWorkflow({ templateWorkflow: templateWf });
    workflow = resolved.workflow;
    toastSummary = resolved.kind === "template" ? "template" : "Shot";
    toastDetail = resolved.kind === "template" ? "project template" : "empty canvas";
    toastKind = resolved.kind === "template" ? "ok" : "info";
  }
  if (isLoadTokenStale(loadToken)) return;
  const key = workflowContentKey(workflow);
  const openWf = ggOwnedShotWorkflow;
  const openDirty = !!(openWf && workflowTabNeedsAutosave(openWf, autosaveContextForWorkflow(openWf)));
  if (!openDirty && shouldReuseOpenWorkflow({
    tabActive: isGongganShotTabOpenAndActive(),
    openKind: wfLastLoadedKind,
    openKey: wfLastLoadedWorkflowKey,
    nextKind: kind,
    nextKey: key,
  })) {
    if (!(await retargetOpenShotTab(cutRec, kind, key, loadToken))) return;
    sdk.msg = `Canvas: ${title}`;
    bus.dispatchEvent(new Event("sdk"));
    return;
  }
  ggCutSwitchAutosaveBlocked = false;
  const loaded = await loadWorkflowIntoDedicatedTab(workflow, cutRec, loadToken);
  if (isLoadTokenStale(loadToken) || ggCutSwitchAutosaveBlocked || !loaded) return;
  markWorkflowLoadComplete(cutId, cutRec, null, kind);
  wfLastLoadedWorkflowKey = key;
  markGraphGongganCut(cutId);
  if (ggOwnedShotWorkflow) {
    const shown = tabNameForCut(cutRec);
    if (shown) ggOwnedShotWorkflow.ggCutDisplayName = shown;
  }
  paintShotTabLabelNow(cutRec);
  sdk.msg = `Canvas: ${title} (${toastDetail})`;
  bus.dispatchEvent(new Event("sdk"));
  bus.dispatchEvent(new Event("gg-opentab"));
  ggToast(toastSummary, toastDetail ? `${title} — ${toastDetail}` : title, toastKind);
}

async function loadCutWorkflow(cutId, cut, loadToken) {
  const tl = state.timeline;
  if (!tl || !cutId) return;
  if (isLoadTokenStale(loadToken)) return;
  const cutRec = cut || cutById(cutId);
  if (!cutRec) return;
  const kind = workflowKindForCut(cutRec);
  const gen = projectMemory.generation();
  let entry = projectMemory.getWorkflow(cutId);
  if (workflowEntryReady(entry, kind)) {
    if (shouldSkipWorkflowReload(cutId) && (!entry.key || entry.key === wfLastLoadedWorkflowKey)) return;
    // This cut's graph is already on the tab (including unsaved edits). Do not reload it from memory.
    if (
      wfLastLoadedCutId === cutId &&
      wfLastLoadedProjectId === state.pid &&
      wfLastLoadedKind === kind &&
      isGongganShotTabOpenAndActive() &&
      (!entry.key || entry.key === wfLastLoadedWorkflowKey)
    ) return;
  } else {
    const pending = projectMemory.inflight(cutId);
    if (pending) {
      await pending;
    } else {
      const p = storeCutWorkflow(cutRec, gen, kind);
      projectMemory.track(cutId, p);
      await p;
    }
    if (isLoadTokenStale(loadToken) || projectMemory.generation() !== gen) return;
    entry = projectMemory.getWorkflow(cutId);
    if (entry && entry.kind !== kind) {
      const p = storeCutWorkflow(cutRec, gen, kind);
      projectMemory.track(cutId, p);
      await p;
      if (isLoadTokenStale(loadToken) || projectMemory.generation() !== gen) return;
      entry = projectMemory.getWorkflow(cutId);
    }
  }
  if (isLoadTokenStale(loadToken)) return;
  await openStoredCutWorkflow(cutId, cutRec, loadToken, entry);
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
    const kind = cutWorkflowKind(cut, ver.kind === "image" || ver.kind === "video" ? ver.kind : null);
    if (!wf || !graphFitsKind(wf, kind)) continue;
    const loaded = await loadWorkflowIntoDedicatedTab(wf, cut, loadToken);
    if (isLoadTokenStale(loadToken) || ggCutSwitchAutosaveBlocked || !loaded) return;
    markWorkflowLoadComplete(cutId, cut, vid, kind);
    wfLastLoadedWorkflowKey = workflowContentKey(wf);
    markGraphGongganCut(cutId);
    sdk.msg = `Canvas: ${name} (${VERSION_SOURCE_DETAIL[src]})`;
    bus.dispatchEvent(new Event("sdk"));
    bus.dispatchEvent(new Event("gg-opentab"));
    ggToast("Shot", `${name} — ${VERSION_SOURCE_DETAIL[src]}`, "ok");
    return;
  }
  if (await loadVersionKindWorkflow(cut, ver, name, loadToken)) return;
  if (isLoadTokenStale(loadToken)) return;
  ggToast("Workflow", sentence(VERSION_WF_MISSING, name), "warn");
}

/** A version with no workflow of its own: open the cut's workflow of that version's kind (image or video). */
async function loadVersionKindWorkflow(cut, ver, name, loadToken) {
  const kind = cutWorkflowKind(cut, ver.kind === "image" || ver.kind === "video" ? ver.kind : null);
  let entry = projectMemory.getWorkflow(cut.id);
  if (!workflowEntryReady(entry, kind)) {
    const gen = projectMemory.generation();
    const pending = projectMemory.inflight(cut.id);
    if (pending) await pending;
    if (isLoadTokenStale(loadToken)) return false;
    entry = projectMemory.getWorkflow(cut.id);
    if (!workflowEntryReady(entry, kind)) {
      const p = storeCutWorkflow(cut, gen, kind);
      projectMemory.track(cut.id, p);
      await p;
      if (isLoadTokenStale(loadToken)) return false;
      entry = projectMemory.getWorkflow(cut.id);
    }
  }
  if (isLoadTokenStale(loadToken) || !entry?.workflow) return false;
  const loaded = await loadWorkflowIntoDedicatedTab(entry.workflow, cut, loadToken);
  if (isLoadTokenStale(loadToken) || ggCutSwitchAutosaveBlocked || !loaded) return false;
  markWorkflowLoadComplete(cut.id, cut, ver.id, kind);
  wfLastLoadedWorkflowKey = entry.key || workflowContentKey(entry.workflow);
  markGraphGongganCut(cut.id);
  const label = SOURCE_TOAST[entry.source] || entry.source || "stored";
  const detail = workflowSourceToastDetail(label, entry.fallback);
  sdk.msg = `Canvas: ${name} (${detail})`;
  bus.dispatchEvent(new Event("sdk"));
  bus.dispatchEvent(new Event("gg-opentab"));
  ggToast("Shot", `${name} — ${detail}`, "ok");
  return true;
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
  const show = !projectTemplateRef && typeof last === "string" && !!last && (userWorkflowPaths.includes(last) || isBuiltinTemplate(last));
  btn.hidden = !show;
  if (!show) return;
  btn.title = `Link last used template: ${templateLabel(last)}`;
  btn.textContent = `Use ${shortTemplateName(templateLabel(last), 24)}`;
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

/** Project Settings › Use AI (global, gonggan_settings.json). Missing or unknown counts as off. */
let cutSplitUseAiOn = false;

async function refreshCutSplitUseAi() {
  if (!AI_CUT_SPLIT_VISIBLE) return;
  try {
    cutSplitUseAiOn = cutSplitUseAi(await getJson("/gonggan/cut-split/model"));
  } catch (_) {
    cutSplitUseAiOn = false;
  }
  bus.dispatchEvent(new Event("cut-split-use-ai"));
}

function setCutSplitUseAi(on) {
  cutSplitUseAiOn = !!on;
  bus.dispatchEvent(new Event("cut-split-use-ai"));
}

function syncAiSplitButton(root) {
  const btn = root?.querySelector(".gg-ai-split");
  if (!btn) return;
  const s = aiMakeCutIconButtonState(cutSplitUseAiOn);
  btn.disabled = s.disabled;
  btn.title = s.title;
  btn.setAttribute("aria-label", s.ariaLabel);
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
  const groups = state.timeline ? state.timeline.groups || [] : [];
  const { after, group } = addCutTargetAtListEnd({ timelineCuts: cuts, groups });
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
      requestAnimationFrame(() => {
        document
          .querySelector(`.gg-shots .gg-cut[data-cut-id="${CSS.escape(d.cut.id)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
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

/**
 * AI Make Cut create path: confirm `Create N cuts?`, then POST /gonggan/cut/add-list (after the last cut).
 * Returns true when the cuts were created; throws on a server error.
 */
async function createCutsFromList(reqPid, cuts, wf) {
  if (!(await askConfirm({ message: createCutsConfirmMessage(cuts, wf.label) }))) return false;
  if (state.pid !== reqPid) return false;
  const order = displayedCutIds();
  const before = snapshotOrderGroups(state.timeline);
  const d = await postJson("/gonggan/cut/add-list", cutListPayload(reqPid, cuts, wf.id, order[order.length - 1]));
  if (d.timeline && adoptMutationTimeline(d.timeline, reqPid)) bus.dispatchEvent(new Event("timeline"));
  else await loadTimeline();
  const ids = d.cut_ids || [];
  if (ids.length) {
    recordShotsEntry(reqPid, { kind: "cuts", op: "add", ids, before, after: snapshotOrderGroups(state.timeline) }, ids.length === 1 ? "Add cut" : `Add ${ids.length} cuts`);
    selectCut(ids[0]);
  }
  ggToast(`Created ${ids.length} cut${ids.length === 1 ? "" : "s"}`, "Each cut has the project's Video template with its prompt field set. Select them and press Queue to render in order.", "ok");
  return true;
}

const AI_SPLIT_IDLE_HINT = "Runs a local text model (TextGenerate) in ComfyUI through the Comfy SDK, then unloads it so the VRAM is free for video.";

/**
 * AI Make Cut: story -> POST /gonggan/ai-cut-split {background: true} (TextGenerate in ComfyUI through the Comfy SDK)
 * -> poll GET /gonggan/ai-cut-split/status until the validated cuts are ready -> `Create N cuts?` -> new cuts with the
 * project's Video template. Nothing is queued. The server keeps the last result, so reopening the dialog picks up a
 * run that is still going or finished while the dialog was closed.
 */
function openAiCutSplitModal() {
  if (!AI_CUT_SPLIT_VISIBLE || !isNativeProject() || document.querySelector(".gg-aisplit-modal")) return;
  if (!cutSplitUseAiOn) {
    ggToast(AI_MAKE_CUT_LABEL, USE_AI_OFF_TIP, "warn");
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "gg-modal-backdrop";
  wrap.innerHTML = `
    <div class="gg-modal gg-aisplit-modal" role="dialog" aria-label="${esc(AI_MAKE_CUT_LABEL)}">
      <h3 class="gg-modal-title">${esc(AI_MAKE_CUT_LABEL)}</h3>
      <label class="gg-modal-field">Story
        <textarea class="gg-aisplit-story" rows="10" placeholder="Write or paste your story. A local text model splits it into cuts of at most 3 seconds."></textarea>
      </label>
      <label class="gg-modal-field">Captions
        <select class="gg-aisplit-captions">${CAPTION_MODE_CHOICES.map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join("")}</select>
        <span class="gg-modal-hint">Cut caption field when creating cuts. Pre-split scripts keep dialogue verbatim.</span>
      </label>
      <span class="gg-modal-hint gg-aisplit-status" aria-live="polite">${esc(AI_SPLIT_IDLE_HINT)}</span>
      <div class="gg-split-preview gg-aisplit-preview" aria-live="polite"></div>
      <span class="gg-modal-hint gg-split-err gg-aisplit-err" aria-live="polite"></span>
      <div class="gg-mm-notice" role="alert" hidden></div>
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-modal-cancel">Cancel</button>
        <button type="button" class="gg-btn gg-primary gg-aisplit-run" disabled>Split</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const story = wrap.querySelector(".gg-aisplit-story");
  const captionsSel = wrap.querySelector(".gg-aisplit-captions");
  captionsSel.value = readCaptionMode(localStorage.getItem(AI_MAKE_CUT_CAPTIONS_KEY));
  captionsSel.addEventListener("change", () => {
    localStorage.setItem(AI_MAKE_CUT_CAPTIONS_KEY, captionsSel.value);
  });
  const status = wrap.querySelector(".gg-aisplit-status");
  const preview = wrap.querySelector(".gg-aisplit-preview");
  const err = wrap.querySelector(".gg-aisplit-err");
  const notice = wrap.querySelector(".gg-mm-notice");
  const runBtn = wrap.querySelector(".gg-aisplit-run");
  const showMissing = (missing) => {
    const info = cutSplitMissingModel(missing);
    notice.innerHTML = info ? cutSplitMissingModelHtml(info, esc) : "";
    notice.hidden = !info;
    return !!info;
  };
  /** GET /gonggan/cut-split/precheck; true = go ahead. A failed check (e.g. older server) does not block. */
  const precheckOk = async () => {
    let pre = null;
    try {
      pre = await getJson("/gonggan/cut-split/precheck");
    } catch (_) {
      return true;
    }
    const step = cutSplitPrecheckStep(pre);
    if (step === "off") {
      setCutSplitUseAi(false);
      err.textContent = USE_AI_OFF_TIP;
      return false;
    }
    if (step === "missing") return !showMissing(pre.missing);
    if (step === "confirm") {
      const c = cutSplitMemoryConfirm(pre.memory, pre.model);
      return askConfirm({ message: c.message, okLabel: c.okLabel });
    }
    return true;
  };
  let busy = false;
  /** A run is going on the server (closing the dialog does not stop it). */
  let running = false;
  /** A finished answer waiting for `Create N cuts?`; kept until the story is edited, so it is never lost. */
  let result = null;
  const close = () => {
    if (running) {
      ggToast(AI_MAKE_CUT_LABEL, `Still running in ComfyUI. Open ${AI_MAKE_CUT_LABEL} again to get the result.`, "ok");
    }
    wrap.remove();
  };
  const sync = () => {
    const n = result ? result.cuts.length : 0;
    runBtn.disabled = busy || (!result && !story.value.trim());
    runBtn.textContent = busy ? "Working…" : result ? `Create ${n} cut${n === 1 ? "" : "s"}` : "Split";
    story.disabled = busy;
    if (captionsSel) captionsSel.disabled = busy;
  };
  story.addEventListener("input", () => {
    if (result) {
      result = null;
      status.textContent = AI_SPLIT_IDLE_HINT;
      if (preview) preview.textContent = "";
    }
    sync();
  });
  wrap.querySelector(".gg-modal-cancel")?.addEventListener("click", close);
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap && !busy) close(); });
  wrap.addEventListener("keydown", (e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); close(); } });

  /** Keep a finished run's cuts in the dialog (checked again with the same cut list rules). */
  const takeResult = (job, prefix = "") => {
    const parsed = parseCutList(JSON.stringify(job.cuts || []));
    if (!parsed.ok) throw new Error(parsed.errors.slice(0, 4).join("\n"));
    result = { id: job.id || "", cuts: parsed.cuts };
    if (job.id && state.pid) saveAiMakeCutJob(localStorage, state.pid, job.id);
    status.textContent = prefix + aiCutSplitStatusText(parsed, { model: job.model, attempts: job.attempts });
    if (preview) preview.textContent = aiMakeCutResultPreview(parsed.cuts);
  };
  /** Start (`start`) or resume (`job`) a background run and wait for it; true = `result` is set. */
  const follow = async ({ start = null, job = null }) => {
    const wrappedStart = start
      ? async () => {
          const d = await start();
          if (d?.job?.id && state.pid) saveAiMakeCutJob(localStorage, state.pid, d.job.id);
          return d;
        }
      : null;
    try {
      const out = await runAiMakeCutJob({
        start: wrappedStart,
        job,
        poll: (id) => getJson(`/gonggan/ai-cut-split/status?job=${encodeURIComponent(id)}`),
        onProgress: (j) => {
          running = true;
          if (wrap.isConnected) status.textContent = aiMakeCutProgressText(j);
        },
        isActive: () => wrap.isConnected,
      });
      running = false;
      if (out.kind === "done") {
        takeResult(out.job);
        return true;
      }
      if (out.kind === "timeout") {
        status.textContent = AI_SPLIT_IDLE_HINT;
        err.textContent = AI_MAKE_CUT_TIMEOUT_TEXT;
      }
    } catch (e) {
      running = false;
      status.textContent = AI_SPLIT_IDLE_HINT;
      if (e.code === "disabled") setCutSplitUseAi(false);
      if (!(e.code === "missing_model" && showMissing(e.data?.missing))) err.textContent = aiMakeCutErrorText(e);
    }
    return false;
  };
  const createFromResult = async () => {
    if (!result || !wrap.isConnected) return;
    if (!isNativeProject()) {
      err.textContent = "Pick a project you can edit, then click Create again.";
      return;
    }
    try {
      if (await createCutsFromList(state.pid, result.cuts, cutListWorkflow(state.timeline?.project?.settings))) {
        if (result.id) localStorage.setItem(aiMakeCutUsedStorageKey(state.pid), result.id);
        clearAiMakeCutJob(localStorage, state.pid);
        result = null;
        close();
      }
    } catch (e) {
      err.textContent = e.message;
    }
  };

  runBtn.addEventListener("click", async () => {
    if (busy || runBtn.disabled) return;
    err.textContent = "";
    if (result) {
      await createFromResult();
      return;
    }
    busy = true;
    showMissing(null);
    status.textContent = "Checking the text model…";
    sync();
    let ok = false;
    try {
      if (await precheckOk() && wrap.isConnected) {
        status.textContent = "Starting… (loading the text model can take a minute)";
        ok = await follow({
          start: () => postJson("/gonggan/ai-cut-split", {
            story: story.value,
            captions: captionsSel.value,
            background: true,
            pid: state.pid,
          }, { timeoutMs: AI_MAKE_CUT_WAIT_MS }),
        });
      } else {
        status.textContent = AI_SPLIT_IDLE_HINT;
      }
    } finally {
      busy = false;
      if (wrap.isConnected) sync();
    }
    if (ok) await createFromResult();
  });

  /** On open: follow a run that is still going, or offer a finished one whose cuts were not created yet. */
  const resume = async () => {
    let job = null;
    const storedId = loadAiMakeCutJob(localStorage, state.pid);
    const q = storedId ? `/gonggan/ai-cut-split/status?job=${encodeURIComponent(storedId)}` : "/gonggan/ai-cut-split/status";
    try {
      job = (await getJson(q)).job;
    } catch (_) {
      return; // older server: nothing to resume
    }
    if (!job || (job.pid && job.pid !== state.pid)) return;
    if (!job || busy || result || !wrap.isConnected || story.value.trim()) return;
    if (job.state === "running") {
      story.value = job.story || "";
      busy = true;
      sync();
      status.textContent = aiMakeCutProgressText(job);
      let ok = false;
      try {
        ok = await follow({ job });
      } finally {
        busy = false;
        if (wrap.isConnected) sync();
      }
      if (ok) await createFromResult();
    } else if (aiMakeCutResumable(job, localStorage.getItem(aiMakeCutUsedStorageKey(state.pid)) || "")) {
      story.value = job.story || "";
      try {
        takeResult(job, "Finished earlier: ");
      } catch (_) {
        result = null;
      }
      sync();
    }
  };
  story.focus();
  void resume();
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
  const shotTabActive = fromTimeline && isGongganShotTabOpenAndActive();
  if (shouldCancelPendingWorkflowLoad({ fromTimeline, shotTabActive })) {
    clearTimeout(wfLoadDebounce);
    wfLoadDebounce = 0;
    ++wfLoadToken;
  }
  if (shouldScheduleCutWorkflowLoad({ multi, range, fromTimeline, shotTabActive })) {
    clearTimeout(wfLoadDebounce);
    try {
      const g = app.graph?.extra?.gonggan;
      const gp = gongganExtraProjectId(g);
      if (
        shouldResetOpenTabTracking({
          multi,
          range,
          fromTimeline,
          shotTabActive,
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

function fillCtxMenuItem(btn, it) {
  btn.className =
    "gg-ctx-item" +
    (it.danger ? " gg-ctx-danger" : "") +
    (it.submenu ? " gg-ctx-parent" : "");
  btn.replaceChildren();
  const label = document.createElement("span");
  label.className = "gg-ctx-label";
  label.textContent = it.label;
  btn.appendChild(label);
  if (it.shortcut) {
    const kbd = document.createElement("span");
    kbd.className = "gg-ctx-kbd";
    kbd.textContent = it.shortcut;
    btn.appendChild(kbd);
  }
  btn.disabled = !!it.disabled;
  if (it.title) btn.title = it.title;
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
    fillCtxMenuItem(btn, it);
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
    fillCtxMenuItem(btn, it);
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

/** Hide cuts (files go to the project's History folder when historyStep is set). No History entry here. */
async function deleteCutsByIds(ids, historyStep = null) {
  const reqPid = state.pid;
  const body = { pid: reqPid, cuts: ids };
  if (historyStep) body.history_step = historyStep;
  const d = await postJson("/gonggan/cut/delete", body);
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
  return d;
}

async function deleteSelectedCuts() {
  const ids = cutsForDelete();
  if (!ids.length || !state.pid) return;
  const deletedIds = [...ids];
  const n = deletedIds.length;
  const reqPid = state.pid;
  const stepId = historyStepId();
  const entry = { kind: "cuts", op: "delete", ids: deletedIds, before: snapshotOrderGroups(state.timeline), history_step: stepId };
  try {
    await deleteCutsByIds(deletedIds, stepId);
    recordShotsEntry(reqPid, entry, n === 1 ? "Delete cut" : `Delete ${n} cuts`);
    ggToast(movedToTrashToastMessage(n), "", "ok", {
      actionLabel: "Undo",
      onAction: async () => {
        try {
          const top = projectHistory.peekUndo(reqPid);
          if (top && top.entry === entry) {
            if (await stepProjectHistory("undo")) ggToast(`Restored ${n} cut(s)`, "", "ok");
            return;
          }
          await restoreCutsByIds(deletedIds, { selectFirst: true, historyStep: stepId });
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

/** One project-wide History step. `entry` is the diff Ctrl+Z restores. */
function recordProjectStep(pid, { label, scope, entry }) {
  if (historyApplying || !pid || pid !== state.pid || !entry) return;
  noteHistoryDropped(projectHistory.record(pid, { id: entry.history_step || historyStepId(), label, scope, entry }));
  noteHistoryChange();
}

/** Cut list order + scenes before a Shots edit, for Ctrl+Z. */
function recordShotsUndo(label = "Edit") {
  if (!state.timeline || !isNativeProject()) return;
  const snap = snapshotOrderGroups(state.timeline);
  if (!snap) return;
  recordProjectStep(state.pid, { label, scope: "shots", entry: snap });
}

/** A cut add / delete / rename / info entry, only while its project is still the open one. */
function recordShotsEntry(pid, entry, label = "Edit") {
  if (!pid || pid !== state.pid || !state.timeline || !isNativeProject()) return;
  recordProjectStep(pid, { label, scope: "shots", entry });
}

function recordCutAdded(pid, cutId, before) {
  if (!cutId) return;
  recordShotsEntry(pid, { kind: "cuts", op: "add", ids: [cutId], before, after: snapshotOrderGroups(state.timeline) }, "Add cut");
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
    if (step.type === "restore") await restoreCutsByIds(step.ids, { selectFirst: true, historyStep: step.history_step });
    else if (step.type === "delete") await deleteCutsByIds(step.ids, step.history_step);
    else if (step.type === "rename") {
      await postJson("/gonggan/cut/rename", { pid, cut_id: step.cut_id, name: step.name });
      await loadTimeline();
    } else if (step.type === "fields") {
      await postJson("/gonggan/cut/update", { pid, cut_id: step.cut_id, fields: step.fields });
      await loadTimeline();
    } else if (step.type === "pick") {
      const c = (state.timeline.cuts || []).find((x) => x.id === step.cut_id);
      if (c && step.clip && typeof step.clip === "object") {
        if (step.clip.in != null) c.in = step.clip.in;
        if (step.clip.sec != null) c.sec = step.clip.sec;
      }
      await setPick(step.cut_id, step.vid ?? null, { record: false });
    } else if (step.type === "deleteVersion" || step.type === "restoreVersion") {
      const path = step.type === "deleteVersion" ? "/gonggan/version/delete" : "/gonggan/version/restore";
      await postJson(path, {
        pid,
        cut_id: step.cut_id,
        version_id: step.version_id,
        history_step: step.history_step,
      });
      await loadTimeline();
    }
    return true;
  } catch (e) {
    ggToast("Undo", e.message, "warn");
    await loadTimeline();
    return false;
  }
}

function historyCurrentFor(step) {
  if (step?.scope === "timeline") return snapshotTimelineEdit(state.timeline);
  const layout = snapshotOrderGroups(state.timeline);
  return step?.entry?.kind ? shotsCounterpart(step.entry, layout) : layout;
}

function shotsRedoSteps(step) {
  if (step?.entry?.kind) return shotsUndoSteps(step.entry, "redo");
  if (step?.after) return [{ type: "layout", snap: step.after }];
  return [];
}

async function applyHistoryStep(step, action) {
  const pid = state.pid;
  if (!step || !state.timeline || state.pid !== pid) return false;
  if (step.scope === "timeline") {
    const snap = action === "undo" ? step.entry : step.after;
    if (!snap || !applyTimelineSnapshot(state.timeline, snap)) return false;
    recomputeCutStarts();
    play.idx = -1;
    scheduleSave();
    bus.dispatchEvent(new Event("timeline"));
    return true;
  }
  const parts = action === "undo" ? shotsUndoSteps(step.entry, "undo") : shotsRedoSteps(step);
  if (!parts.length) return false;
  for (const part of parts) {
    if (!(await runShotsStep(part, pid))) return false;
  }
  return true;
}

async function stepProjectHistoryNow(action) {
  const tl = state.timeline;
  if (!tl || historyApplying) return false;
  const pid = state.pid;
  historyApplying = true;
  let step = null;
  try {
    step = action === "redo" ? projectHistory.redo(pid) : projectHistory.undo(pid, historyCurrentFor);
    if (!step) {
      ggToast(action === "redo" ? "Nothing to redo" : "Nothing to undo", "", "info", { ttlMs: 1500 });
      return false;
    }
    reorderUndoBurst.reset();
    const ok = await applyHistoryStep(step, action);
    if (!ok) {
      if (action === "redo") projectHistory.abortRedo();
      else projectHistory.abortUndo();
      return false;
    }
    noteHistoryChange();
    return true;
  } finally {
    historyApplying = false;
  }
}

/** Ctrl+Z / Ctrl+Shift+Z: the newest project edit, whichever panel it came from. */
function stepProjectHistory(action) {
  const run = shotsStepChain.then(() => stepProjectHistoryNow(action));
  shotsStepChain = run.catch(() => false);
  return run;
}

async function jumpProjectHistory(index) {
  const run = shotsStepChain.then(async () => {
    const ops = projectHistory.planJump(state.pid, index);
    for (const action of ops) {
      if (!(await stepProjectHistoryNow(action))) return false;
    }
    return true;
  });
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
    recordShotsUndo("Reorder");
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
        const top = projectHistory.peekUndo(state.pid);
        if (top && sameSnapshot(top.entry, undoTarget)) {
          if (await stepProjectHistory("undo")) ggToast("Undone", "", "ok");
          return;
        }
        recordShotsUndo("Undo");
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
    importBusy: stripImportBusy,
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
  const moveOrder = state.timeline ? state.timeline.cuts.map((x) => x.id) : [];
  const failedIds = ids.filter((id) => renderStatus.isFailed(state.pid, id));
  const { order, hidden } = shotsNavOrder();
  const visible = selectAllCutIds(order, hidden);
  const items = cutCardMenuItems({
    ...cutMenuCtx(cutId, ids.length > 1),
    canMoveUp: canMoveUp(moveOrder, ids),
    canMoveDown: canMoveDown(moveOrder, ids),
    inScene: !!(c && c.group_id),
    anyInScene: ids.some((id) => cutById(id)?.group_id),
    queueCount: timelineSelectedCutIds().length || ids.length,
    queuedCount: ids.filter((id) => renderStatus.queuedPromptIds(state.pid, id).length).length,
    failedCount: failedIds.length,
    hasImage: cutHasStartImage(c),
    hasVersion: !!(c?.versions_list || []).length,
    hasListCuts: visible.length > 0,
    aiMakeCut: AI_CUT_SPLIT_VISIBLE,
    useAi: cutSplitUseAiOn,
  });
  showCtxMenu(
    e.clientX,
    e.clientY,
    attachMenuActions(
      items,
      {
        ...cutMenuActions(cutId),
        importVer: () => pickVersionImportFiles(cutId),
        i2v: () => imageToVideoCut(cutId),
        setBest: () => {
          const cut = cutById(cutId);
          if (!cut) return;
          const vid = stripSelectedVersionId(cut);
          if (vid) setPick(cutId, vid);
        },
        queueSel: () => void queueButtonClick(),
        removeQueue: () => removeCutsFromQueue(ids),
        requeue: () => queueSelectedCuts(failedIds),
        moveUp: () => applyStepMove(-1),
        moveDown: () => applyStepMove(1),
        group: () => createSceneGroup(ids),
        split: () => splitSceneHere(cutId),
        ungroup: () => ungroupCuts(ids),
        addCut: () => addCutAfter(cutId),
        aiMakeCut: () => openAiCutSplitModal(),
        del: () => deleteSelectedCuts(),
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
  recordShotsUndo("Apply order");
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
  if (ids.length) items.push({ label: MAKE_SCENE_LABEL, action: () => createSceneGroup(ids) });
  if (nat && AI_CUT_SPLIT_VISIBLE) {
    const { key: _k, ...ai } = aiMakeCutMenuItem(cutSplitUseAiOn);
    items.push({ ...ai, action: () => openAiCutSplitModal() });
  }
  showCtxMenu(e.clientX, e.clientY, items);
}

async function ungroupSceneGroup(groupId) {
  recordShotsUndo("Delete scene");
  await persistGroups(groupsClone().filter((g) => g.id !== groupId));
}

function cutSelIds() {
  const cuts = state.timeline ? state.timeline.cuts : [];
  const ids = cuts.filter((c) => state.cutSel.has(c.id)).map((c) => c.id);
  if (!ids.length && state.cutId) ids.push(state.cutId);
  return ids;
}

/** Selected cuts only (no single-cut fallback), in Shots display order. */
function timelineSelectedCutIds() {
  const tl = state.timeline;
  if (!tl) return [];
  if (!state.cutSel.size) return state.cutId && tl.cuts.some((c) => c.id === state.cutId) ? [state.cutId] : [];
  const { order } = shotsNavOrder();
  return selectedInDisplayOrder(order, tl.cuts.map((c) => c.id), state.cutSel);
}

/** Ctrl/Cmd+A: every cut shown in the list (not offered in the right-click menu). */
function selectAllListCuts() {
  const { order, hidden } = shotsNavOrder();
  const ids = selectAllCutIds(order, hidden);
  if (!ids.length) return false;
  state.cutSel.clear();
  for (const id of ids) state.cutSel.add(id);
  cutSelAnchor = state.cutSel.has(state.cutId) ? state.cutId : ids[0];
  bus.dispatchEvent(new Event("select"));
  return true;
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
    value: nextSceneName(state.timeline?.groups),
    okLabel: "Create scene",
    maxLength: SCENE_NAME_MAX_LEN,
    allowEmpty: true,
  });
  if (title === null) return;
  let groups = stripCutsFromGroups(groupsClone(), ids);
  groups.push({ id: newSceneGroupId(), name: resolveSceneName(state.timeline?.groups, title), cut_ids: ids, collapsed: false });
  state.cutSel.clear();
  cutSelAnchor = "";
  recordShotsUndo("New scene");
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
  recordShotsUndo("New scene");
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
  recordShotsUndo("Remove from scene");
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
    if (from && to !== from) recordShotsEntry(pid, { kind: "rename", cut_id: cutId, from, to }, "Rename");
  } catch (err) {
    const hint = err.status === 404 || err.status === 405 ? "Restart ComfyUI to enable renaming." : err.message;
    ggToast("Cut", hint, "warn");
  }
}

async function saveSceneGroupName(groupId, name) {
  const g = (state.timeline?.groups || []).find((x) => x.id === groupId);
  if (!g || !state.pid || name === g.name) return;
  const groups = groupsClone();
  const hit = groups.find((x) => x.id === groupId);
  if (!hit) return;
  hit.name = name;
  recordShotsUndo("Rename scene");
  try {
    await persistGroups(groups);
  } catch (err) {
    ggToast("Scene", err.message, "warn");
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
  await saveSceneGroupName(groupId, title);
}

async function deleteSceneGroup(groupId) {
  if (!(await askConfirm({ message: "Delete this scene?\nCuts become ungrouped. You can restore it from History.", danger: true }))) return;
  recordShotsUndo("Delete scene");
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
  recordShotsUndo("Move to scene");
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
    value: nextSceneName(state.timeline?.groups),
    okLabel: "Create scene",
    maxLength: SCENE_NAME_MAX_LEN,
    allowEmpty: true,
  });
  if (title === null) return;
  const sceneName = resolveSceneName(state.timeline?.groups, title);
  const moveIds = [];
  for (let i = idx; i < cuts.length; i++) {
    if (!gid || cuts[i].group_id === gid) moveIds.push(cuts[i].id);
    else break;
  }
  let groups = stripCutsFromGroups(groupsClone(), moveIds);
  groups.push({ id: "s" + Date.now(), name: sceneName, cut_ids: moveIds, collapsed: false });
  recordShotsUndo("New scene");
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
  badge.classList.toggle("gg-rs-done", v.mode === "done");
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
  document.querySelectorAll(".gg-shots").forEach(paintJobQueue);
}

/** A cut's render state: ComfyUI queue, Generate All, GET /gonggan/regen/status job, or Comfy progress on the cut. */
function cutRenderView(cutId) {
  return cutCardRenderView({
    projectId: state.pid,
    cutId,
    comfyCutView: renderStatus.cutView(state.pid, cutId),
    generateAllBatch: genAll.batch,
    regenJob: sdk.lastJob,
    sdkBusyCutId: sdk.busy === "regen" ? sdk.regenCutId : null,
    progressCut: state.pid && cutId ? progressTracker.getCutStatus(state.pid, cutId) : null,
  });
}

function linkRunningQueueToSdkCut(queueJson) {
  const j = sdk.lastJob;
  if (!j || j.status !== "running" || !j.native || !j.cut_id || !j.pid) return;
  const running = queueJson?.queue_running;
  if (!Array.isArray(running) || running.length !== 1) return;
  const entry = running[0];
  if (!Array.isArray(entry) || entry[1] == null) return;
  const promptId = String(entry[1]);
  renderStatus.link(promptId, j.cut_id, j.pid);
  progressTracker.registerPrompt(promptId, j.cut_id, j.pid);
  paintRenderStatus([j.cut_id]);
}

let regenPollTimer = 0;

function syncRegenJobFromServer(job) {
  if (!job || typeof job !== "object") return;
  const prev = sdk.lastJob;
  sdk.lastJob = job;
  const cutId = job.cut_id;
  if (cutId && job.pid === state.pid) {
    paintRenderStatus([cutId]);
  }
  if (job.status === "running" && job.native && cutId) scheduleRegenPoll();
  else if (regenPollTimer) {
    clearInterval(regenPollTimer);
    regenPollTimer = 0;
  }
  if (prev?.status === "running" && job.status !== "running" && cutId && job.pid === state.pid) {
    bus.dispatchEvent(new Event("sdk"));
    void syncProgressQueue();
  }
}

function scheduleRegenPoll() {
  if (regenPollTimer) return;
  regenPollTimer = setInterval(() => {
    void refreshRegenJob();
  }, 1500);
}

async function refreshRegenJob() {
  try {
    const d = await getJson("/gonggan/regen/status");
    const job = d.job;
    if (!job || job.status === "idle") {
      if (regenPollTimer) {
        clearInterval(regenPollTimer);
        regenPollTimer = 0;
      }
      const prev = sdk.lastJob;
      if (prev?.status === "running" && prev.cut_id && prev.pid === state.pid) {
        syncRegenJobFromServer({ ...prev, status: "idle" });
        void syncProgressQueue();
      }
      return;
    }
    syncRegenJobFromServer(job);
  } catch (_) {}
}

/** Badge-only update for the given cuts (cut cards + timeline clips) and the header indicator. */
function paintRenderStatus(cutIds) {
  for (const id of cutIds || []) {
    const v = renderBadgeView(cutRenderView(id));
    const sel = `.gg-cut[data-cut-id="${CSS.escape(id)}"] .gg-render-badge, .gg-clip[data-cut-id="${CSS.escape(id)}"] .gg-render-badge`;
    document.querySelectorAll(sel).forEach((badge) => {
      paintRenderBadge(badge, v);
      const idle = badge.closest(".gg-cut-state")?.querySelector(".gg-cut-idle");
      if (idle) {
        const cut = cutByIdTimeline(id);
        const word = cutCardIdleWord({
          hasMedia: !!cut?.media?.id,
          badge: v,
          regenJob: sdk.lastJob,
          sdkBusyCutId: sdk.busy === "regen" ? sdk.regenCutId : null,
          projectId: state.pid,
          cutId: id,
        });
        idle.textContent = word.text;
        idle.title = word.title;
      }
    });
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

function sdkRegenStillRunningForCut(projectId, cutId) {
  const j = sdk.lastJob;
  return !!(
    j?.native &&
    j.status === "running" &&
    j.cut_id &&
    j.pid &&
    String(j.cut_id) === String(cutId) &&
    String(j.pid) === String(projectId)
  );
}

function onProgressTrackerEvent(evt) {
  if (!progressPanelsActive()) return;
  if (evt.cutId && evt.projectId) {
    if (evt.state === "done" || evt.state === "failed" || evt.state === "interrupted") {
      if (!sdkRegenStillRunningForCut(evt.projectId, evt.cutId)) scheduleTimelineReload();
    }
    scheduleProgressPaint(evt.cutId);
    paintRenderStatus([evt.cutId]);
  }
}

async function syncProgressQueue() {
  try {
    const res = await api.fetchApi("/queue");
    const data = await res.json().catch(() => ({}));
    progressTracker.syncQueue(data);
    renderStatus.syncQueue(data);
    linkRunningQueueToSdkCut(data);
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
  if (SHOW_STATUS_PANEL && evt?.cutId) {
    document.querySelectorAll(".gg-shots .gg-cutpanel").forEach(paintStatusPanel);
  }
});

function wireProgressListeners() {
  if (progUi.wired || !progressPanelsActive()) return;
  progUi.wired = true;
  for (const typ of PROGRESS_API_EVENTS) {
    progUi.handlers[typ] = (e) => {
      if (typ === "status" || typ === "promptQueued") onProgressStatusEvent(e);
      else progressTracker.handleEvent(typ, e.detail);
      paintRenderStatus(renderStatus.handle(typ, e.detail));
      if (SHOW_STATUS_PANEL) document.querySelectorAll(".gg-shots .gg-cutpanel").forEach(paintStatusPanel);
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
      if (reqPid === state.pid && (fields.prompt != null || fields.notes != null || fields.caption != null)) {
        const showing = cutId === wfLastLoadedCutId && wfLastLoadedProjectId === reqPid && isGongganShotTabOpenAndActive();
        const cutNow = (data.timeline.cuts || []).find((c) => c.id === cutId);
        if (!showing && cutNow) {
          const gen = projectMemory.generation();
          projectMemory.track(cutId, storeCutWorkflow(cutNow, gen).catch(() => null));
        }
      }
      const bucket = cutFieldUi.unsaved[cutId];
      if (bucket) {
        for (const k of keys) {
          if (k === "caption" && cutFieldUi.captionDegraded) continue;
          delete bucket[k];
        }
        if (!Object.keys(bucket).length) delete cutFieldUi.unsaved[cutId];
      }
      refreshFieldTextUnsavedClasses();
      const hist = takeFieldHistory(cutId);
      if (hist && reqPid === state.pid && !historyApplying) {
        const fromFields = {};
        const toFields = {};
        for (const k of Object.keys(fields)) {
          if (Object.prototype.hasOwnProperty.call(hist.from, k) && hist.from[k] !== fields[k]) {
            fromFields[k] = hist.from[k];
            toFields[k] = fields[k];
          }
        }
        if (Object.keys(fromFields).length) {
          recordShotsEntry(reqPid, { kind: "fields", cut_id: cutId, from: fromFields, to: toFields }, fieldHistoryLabel(toFields));
        }
      }
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

function noteFieldHistory(cutId, from, fields) {
  if (historyApplying || !cutId) return;
  let row = fieldHistFrom.get(cutId);
  if (!row) {
    row = { from: {}, to: {} };
    fieldHistFrom.set(cutId, row);
  }
  if (from && typeof from === "object") {
    for (const k of Object.keys(from)) {
      if (!Object.prototype.hasOwnProperty.call(row.from, k)) row.from[k] = from[k];
    }
  }
  Object.assign(row.to, fields || {});
}

function takeFieldHistory(cutId) {
  const row = fieldHistFrom.get(cutId);
  fieldHistFrom.delete(cutId);
  return row || null;
}

function scheduleCutFieldSave(cutId, fields, from) {
  noteFieldHistory(cutId, from, fields);
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
  const prev = !!c.needs_redo;
  const next = !prev;
  c.needs_redo = next;
  scheduleCutFieldSave(cutId, { needs_redo: next }, { needs_redo: prev });
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
  if (lenIn) {
    const infoLen = formatCutInfoLengthField(c);
    lenIn.value = infoLen.text;
    lenIn.readOnly = true;
    lenIn.tabIndex = -1;
    lenIn.placeholder = infoLen.placeholder || "";
    lenIn.title = infoLen.title;
    lenIn.classList.toggle("gg-len-drift", infoLen.drift);
  }
  if (endChk) {
    endChk.checked = !!c.end_card;
    endChk.disabled = !nat;
    endChk.title = nat ? "End card (no length warning)" : roTip;
    endChk.addEventListener("change", () => {
      const next = endChk.checked;
      c.end_card = next;
      scheduleCutFieldSave(c.id, { end_card: next }, { end_card: !next });
      refreshCutRowBadges(c.id);
      bus.dispatchEvent(new Event("timeline"));
    });
  }
  if (redoChk) {
    redoChk.checked = !!c.needs_redo;
    redoChk.disabled = !nat;
    redoChk.title = nat ? "Flag for redo" : roTip;
    redoChk.addEventListener("change", () => {
      const next = redoChk.checked;
      c.needs_redo = next;
      scheduleCutFieldSave(c.id, { needs_redo: next }, { needs_redo: !next });
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
      const liInfo = formatCutListLength(c);
      len.textContent = liInfo.text;
      len.title = liInfo.title;
      len.classList.toggle("gg-len-drift", liInfo.drift);
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
  let content;
  if (kind === "caption") content = captionRowContent(c);
  else if (kind === "prompt") content = promptRowContent(c);
  else content = infoRowContent(c, labels);
  return cutRowShellHtml({ id: c.id, kind, selected: state.cutSel.has(c.id), content });
}

function promptRowContent(c) {
  const nat = isNativeProject();
  return promptRowContentHtml({
    thumb: cutThumbHtml(c),
    text: cutGenerationPromptText(c),
    placeholder: "Prompt for Generate…",
    title: nat ? CARD_EDIT_IDLE_TIP : NATIVE_READONLY_TIP,
    native: nat,
  });
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
  return `<div class="gg-cut-thumb">${thumbHtml(c.media, "gg-thumb")}${c.media && c.media.kind === "video" ? '<span class="gg-badge">▶</span>' : ""}${c.media && c.media.source && fmtSrc(c.media.source) && c.media.source !== "gonggan" ? `<span class="gg-badge gg-badge-l gg-src-${esc(c.media.source)}">${esc(fmtSrc(c.media.source))}</span>` : ""}</div>`;
}

function infoRowContent(c, labels) {
  const nat = isNativeProject();
  const warn = lengthWarning(c);
  const lenInfo = formatCutListLength(c);
  const verInfo = formatCutVersionStatus(c);
  const head = cutHeaderParts(c, state.timeline, labels);
  const rv = cutRenderView(c.id);
  const badgeInit = renderBadgeView(rv);
  const idle = cutCardIdleWord({
    hasMedia: !!c.media?.id,
    badge: badgeInit,
    regenJob: sdk.lastJob,
    sdkBusyCutId: sdk.busy === "regen" ? sdk.regenCutId : null,
    projectId: state.pid,
    cutId: c.id,
  });
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
          <span class="gg-cut-len${lenInfo.drift ? " gg-len-drift" : ""}" title="${esc(lenInfo.title)}">${esc(lenInfo.text)}</span>
        </div>
      </div>`;
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

function openFieldExpandModal(ta, cutId) {
  if (!ta || !cutId || ggModalOpen() || !isNativeProject()) return;
  const kind = ta.classList.contains("gg-caption-text") ? "caption" : "prompt";
  const initial = ta.value;
  let fullscreen = false;
  const wrap = document.createElement("div");
  wrap.className = "gg-modal-backdrop gg-prompt-edit-backdrop";
  wrap.innerHTML = fieldExpandModalShellHtml(kind);
  document.body.appendChild(wrap);
  const modal = wrap.querySelector(".gg-prompt-edit-modal");
  const editor = wrap.querySelector(".gg-prompt-edit-text");
  const fsBtn = wrap.querySelector(".gg-prompt-edit-fs");
  if (!modal || !editor || !fsBtn) {
    wrap.remove();
    return;
  }
  editor.value = initial;

  const close = (apply) => {
    if (apply) {
      const text = editor.value;
      if (text !== ta.value) {
        ta.value = text;
        const c = cutByIdTimeline(cutId);
        if (c) {
          if (kind === "caption") {
            c.caption = text;
            scheduleCutFieldSave(cutId, { caption: text }, { caption: initial });
            paintViewerCaption();
          } else {
            c.prompt = text;
            scheduleCutFieldSave(cutId, { prompt: text }, { prompt: initial });
          }
        }
        void flushPendingCutFields();
      }
    }
    wrap.remove();
  };

  fsBtn.addEventListener("click", () => {
    fullscreen = !fullscreen;
    modal.classList.toggle("gg-prompt-edit-fullscreen", fullscreen);
    const t = promptExpandFullscreenTitle(fullscreen);
    fsBtn.title = t;
    fsBtn.setAttribute("aria-label", t);
  });

  wrap.querySelector(".gg-modal-cancel")?.addEventListener("click", () => close(false));
  wrap.querySelector(".gg-prompt-edit-ok")?.addEventListener("click", () => close(true));
  editor.addEventListener("keydown", (e) => {
    const action = promptExpandKeyAction(e);
    if (action === "cancel") {
      e.preventDefault();
      close(false);
    } else if (action === "confirm") {
      e.preventDefault();
      close(true);
    }
  });

  editor.focus();
  try {
    editor.setSelectionRange(editor.value.length, editor.value.length);
  } catch (_) {}
}

function openPromptExpandModal(ta, cutId) {
  openFieldExpandModal(ta, cutId);
}

function comfyPromptDialogOpen() {
  return !!document.querySelector(".p-dialog-mask, .p-dialog-enter-active, .p-dialog-visible");
}

let timelineHeightRestoreRaf = 0;
let timelineHeightObserver = null;
let timelineEditModeOn = loadEditPreviewMode(localStorage);
let editPreviewLayoutRaf = 0;
let editPreviewObserver = null;
let editPreviewLoadToken = 0;
let bottomAnchorLock = false;
let bottomAnchorHoldOff = false;

function canvasSplitter() {
  const panel = document.querySelector(".bottom-panel");
  const fromPanel = panel?.closest(".p-splitter");
  if (fromPanel) return fromPanel;
  const gutter = document.querySelector('[data-testid="graph-canvas-gutter"]');
  return gutter?.closest(".p-splitter") || null;
}

function bottomPanelShown() {
  return !!app.extensionManager?.bottomPanel?.bottomPanelVisible;
}

function rememberInlineStyle(el) {
  if (!el || el.dataset.ggStyleSaved === "1") return;
  el.dataset.ggStyleSaved = "1";
  el.dataset.ggStylePrev = el.getAttribute("style") || "";
}

function restoreInlineStyle(el) {
  if (!el || el.dataset.ggStyleSaved !== "1") return;
  const prev = el.dataset.ggStylePrev || "";
  if (prev) el.setAttribute("style", prev);
  else el.removeAttribute("style");
  delete el.dataset.ggStyleSaved;
  delete el.dataset.ggStylePrev;
}

function clearAnchoredBottomPanel() {
  document.documentElement.classList.remove("gg-bottom-anchored");
  const panel = document.querySelector(".bottom-panel");
  const splitter = canvasSplitter();
  const gutter = document.querySelector('[data-testid="graph-canvas-gutter"]');
  restoreInlineStyle(panel);
  restoreInlineStyle(splitter);
  restoreInlineStyle(gutter);
  if (panel) delete panel.dataset.ggBottomAnchor;
}

function readAnchorChrome(panel, timelineEl) {
  const pr = panel.getBoundingClientRect();
  const tr = timelineEl.getBoundingClientRect();
  const tablist = panel.querySelector("[role='tablist']");
  const tabH = tablist ? tablist.getBoundingClientRect().height : 0;
  return fixedPanelChrome({ top: pr.top, bottom: pr.bottom }, { top: tr.top, bottom: tr.bottom }, tabH);
}

/** Hide the in-panel left preview in Edit mode so the timeline fills that width. */
function applyEditModeTimelineRow(root) {
  const rows = root ? [root] : [...document.querySelectorAll(".gg-root.gg-timeline")];
  for (const rowRoot of rows) {
    if (!rowRoot) continue;
    const host = rowRoot.parentElement || rowRoot;
    const screen = rowRoot.querySelector(".gg-screen");
    const previewWidth = parseFloat(screen?.style.width) || 0;
    const row = editModeTimelineRow({
      editMode: timelineEditModeOn,
      hostWidth: host.clientWidth || rowRoot.clientWidth || 0,
      previewWidth,
    });
    const viewerEl = rowRoot.querySelector(".gg-viewer");
    const editorEl = rowRoot.querySelector(".gg-editor");
    const transport = rowRoot.querySelector(".gg-transport");
    const tools = rowRoot.querySelector(".gg-tl-tools");
    // H2 hides .gg-viewer. The play button lives in .gg-transport, so park it on the tools row
    // while Edit mode is on, and put it back under the preview when Edit mode is off.
    if (transport && tools && viewerEl) {
      if (row.hideLeftPreview) tools.prepend(transport);
      else viewerEl.appendChild(transport);
    }
    if (viewerEl) viewerEl.style.display = row.hideLeftPreview ? row.viewerDisplay : "";
    if (editorEl) {
      editorEl.style.flex = row.hideLeftPreview ? row.editorFlex : "";
      editorEl.style.minWidth = row.hideLeftPreview ? "0" : "";
      editorEl.style.width = row.hideLeftPreview ? "100%" : "";
    }
  }
}

/** Fixed height, no resize handle, glued to the screen bottom. Edit mode uses the same height. */
function applyAnchoredBottomPanel() {
  if (bottomAnchorLock || bottomAnchorHoldOff) return;
  const panel = document.querySelector(".bottom-panel");
  if (!panel || !bottomPanelShown()) {
    if (panel?.dataset.ggBottomAnchor === "1") clearAnchoredBottomPanel();
    return;
  }
  const timelineEl = document.querySelector(".gg-timeline");
  if (!timelineEl || !timelineEl.getClientRects().length) return;
  const chrome = readAnchorChrome(panel, timelineEl);
  const body = fixedTimelineBodyHeight();
  const panelH = fixedBottomPanelHeight(chrome, timelineEditModeOn);
  const splitter = canvasSplitter();
  const sr = splitter?.getBoundingClientRect();
  const pr = panel.getBoundingClientRect();
  const box = anchoredBottomPanelBox({
    viewportHeight: window.innerHeight,
    height: panelH,
    left: sr && sr.width > 8 ? sr.left : pr.left,
    width: sr && sr.width > 8 ? sr.width : pr.width,
  });
  if (box.width < 8) return;
  const padOk = !splitter || (parseFloat(splitter.style.paddingBottom) || 0) === box.height;
  const placed =
    panel.dataset.ggBottomAnchor === "1" &&
    Math.abs(pr.height - box.height) <= 1 &&
    Math.abs(pr.left - box.left) <= 1 &&
    Math.abs(pr.width - box.width) <= 1 &&
    Math.abs(window.innerHeight - pr.bottom - box.bottom) <= 1;
  const timelineSized = Math.abs((parseFloat(timelineEl.style.height) || 0) - body) <= 0.5;
  if (placed && timelineSized && padOk) return;
  bottomAnchorLock = true;
  try {
    timelineEl.style.height = `${body}px`;
    timelineEl.style.minHeight = `${body}px`;
    timelineEl.style.maxHeight = `${body}px`;
    timelineEl.style.flex = "0 0 auto";
    rememberInlineStyle(panel);
    rememberInlineStyle(splitter);
    panel.dataset.ggBottomAnchor = "1";
    panel.style.setProperty("position", box.position, "important");
    panel.style.setProperty("bottom", `${box.bottom}px`, "important");
    panel.style.setProperty("left", `${box.left}px`, "important");
    panel.style.setProperty("width", `${box.width}px`, "important");
    panel.style.setProperty("height", `${box.height}px`, "important");
    panel.style.setProperty("min-height", `${box.height}px`, "important");
    panel.style.setProperty("max-height", `${box.height}px`, "important");
    panel.style.setProperty("flex-shrink", "0", "important");
    panel.style.setProperty("z-index", "20", "important");
    document.documentElement.classList.add("gg-bottom-anchored");
    if (splitter) {
      splitter.style.setProperty("box-sizing", "border-box", "important");
      splitter.style.setProperty("padding-bottom", `${box.height}px`, "important");
    }
    const gutter = document.querySelector('[data-testid="graph-canvas-gutter"]');
    if (gutter) {
      rememberInlineStyle(gutter);
      gutter.style.setProperty("pointer-events", "none", "important");
      gutter.style.setProperty("flex-basis", "0px", "important");
      gutter.style.setProperty("height", "0px", "important");
      gutter.style.setProperty("min-height", "0px", "important");
      gutter.style.setProperty("overflow", "hidden", "important");
      gutter.style.setProperty("margin", "0", "important");
    }
  } finally {
    bottomAnchorLock = false;
  }
}

function scheduleRestoreTimelinePanelHeight() {
  cancelAnimationFrame(timelineHeightRestoreRaf);
  let frames = 0;
  const step = () => {
    applyAnchoredBottomPanel();
    frames += 1;
    if (frames < 12) timelineHeightRestoreRaf = requestAnimationFrame(step);
  };
  timelineHeightRestoreRaf = requestAnimationFrame(step);
}

function startTimelineHeightObserver() {
  if (timelineHeightObserver) return;
  const panel = document.querySelector(".bottom-panel");
  if (!panel || !window.ResizeObserver) return;
  timelineHeightObserver = new ResizeObserver(() => {
    if (bottomAnchorLock || bottomAnchorHoldOff) return;
    if (!bottomPanelShown()) {
      if (panel.dataset.ggBottomAnchor === "1") clearAnchoredBottomPanel();
      return;
    }
    applyAnchoredBottomPanel();
  });
  timelineHeightObserver.observe(panel);
  const splitter = canvasSplitter();
  if (splitter) timelineHeightObserver.observe(splitter);
}

if (!globalThis.__ggBottomPanelAnchorResize) {
  globalThis.__ggBottomPanelAnchorResize = true;
  window.addEventListener("resize", () => {
    applyAnchoredBottomPanel();
  });
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
  bottomAnchorHoldOff = false;
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
  bottomAnchorHoldOff = true;
  cancelAnimationFrame(timelineHeightRestoreRaf);
  clearAnchoredBottomPanel();
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
// focus is in Shots / Timeline, or one of them was clicked last. One project History undoes the newest
// edit from either panel. Canvas, inputs, menus and dialogs keep the key.
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
  void stepProjectHistory(action);
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

/** User's Job History docked flag while Cut Manager forces the dock on. null = not holding. */
let jobHistoryDockHeld = null;
let jobHistoryDockChain = Promise.resolve();

function enqueueJobHistoryDock(task) {
  jobHistoryDockChain = jobHistoryDockChain.then(task, task);
  return jobHistoryDockChain;
}

function jobHistorySettingApi() {
  return resolveSettingApi(app.extensionManager?.setting);
}

function currentJobHistoryDockHeld() {
  if (jobHistoryDockHeld === true || jobHistoryDockHeld === false) return jobHistoryDockHeld;
  try {
    return readHeldDock(localStorage);
  } catch (_) {
    return null;
  }
}

function rememberJobHistoryDockHeld(held) {
  jobHistoryDockHeld = held === true || held === false ? held : null;
  try {
    writeHeldDock(localStorage, jobHistoryDockHeld);
  } catch (_) {}
}

/** Cut Manager opened: save ComfyUI Docked Job History, then force it on. */
function onCutManagerJobHistoryOpen() {
  enqueueJobHistoryDock(async () => {
    const api = jobHistorySettingApi();
    if (!api) return;
    let current;
    try {
      current = api.get(JOB_HISTORY_DOCK_SETTING_ID);
    } catch (_) {
      return;
    }
    const plan = planDockOnCutManagerOpen(currentJobHistoryDockHeld(), current);
    if (plan.held === true || plan.held === false) rememberJobHistoryDockHeld(plan.held);
    if (plan.setTo == null) return;
    try {
      await api.set(JOB_HISTORY_DOCK_SETTING_ID, plan.setTo);
    } catch (_) {}
  });
}

/** Cut Manager closed: put Docked Job History back to the saved flag. */
function onCutManagerJobHistoryClose() {
  enqueueJobHistoryDock(async () => {
    const plan = planDockOnCutManagerClose(currentJobHistoryDockHeld());
    if (plan.setTo == null) return;
    const api = jobHistorySettingApi();
    if (!api) return;
    try {
      await api.set(JOB_HISTORY_DOCK_SETTING_ID, plan.setTo);
    } catch (_) {
      return;
    }
    rememberJobHistoryDockHeld(null);
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
      onCutManagerJobHistoryOpen();
    } else if (wasShown && !shown && !shotsSidebarActive()) {
      closeTimelinePanel();
      onCutManagerJobHistoryClose();
    }
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
      if (prevId === SHOTS_TAB && id !== SHOTS_TAB) {
        closeTimelinePanel();
        onCutManagerJobHistoryClose();
      }
      prevId = id;
    });
    onCleanup.push(() => {
      unsub();
      if (!shotsSidebarActive()) {
        closeTimelinePanel();
        onCutManagerJobHistoryClose();
      }
    });
  } else {
    onCleanup.push(() => {
      if (!shotsSidebarActive()) {
        closeTimelinePanel();
        onCutManagerJobHistoryClose();
      }
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
    const groupBtn = bar.querySelector(".gg-sel-group");
    if (groupBtn) groupBtn.textContent = MAKE_SCENE_LABEL;
    const ungroupBtn = bar.querySelector(".gg-sel-ungroup");
    if (ungroupBtn) {
      ungroupBtn.textContent = REMOVE_FROM_SCENE_LABEL;
      ungroupBtn.title = REMOVE_FROM_SCENE_TIP;
    }
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
  const queueIds = timelineSelectedCutIds();
  const allCount = generateAllCutIds().length;
  const allRunning = isGenerateAllRunning(genAll.batch);
  const qPlan = queueIds.length ? queuePlanForSelectedIds(queueIds) : null;
  const q = queueButtonState({
    count: queueIds.length,
    native: isNativeProject(),
    busy: !!sdk.busy || batchRenderUi.running || genAll.starting,
    hasProject,
    allRunning,
    batch: genAll.batch,
    projectId: state.pid,
    queuePlan: qPlan ? { actionable: qPlan.actionable, tooltip: qPlan.tooltip } : null,
  });
  syncQueueModeUi(root, qPlan?.mode);
  const queueBtn = root.querySelector(".gg-queue-btn");
  if (queueBtn) {
    queueBtn.disabled = q.disabled;
    if (q.title) queueBtn.title = q.title;
    else queueBtn.removeAttribute("title");
    queueBtn.textContent = q.label;
    queueBtn.classList.toggle("gg-queue-stop", q.mode === "stop");
  }
  paintGenerateAllProgress(root);
}

function paintGenerateAllProgress(root) {
  const p = generateAllProgressView(genAll.batch, state.pid);
  const prog = root.querySelector(".gg-genall-prog");
  if (prog) {
    prog.hidden = !p.show;
    prog.textContent = p.text;
    prog.title = p.title;
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
const sdk = { st: null, busy: "", msg: "", lastJob: null, regenCutId: null };

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

const fmtSrc = (s) => ({ gonggan: "Import", "local-sdk": "SDK", "comfy-history": "Comfy", "comfy-output-folder": "Comfy" }[s] || "");

/** `timeoutMs`: abort the request after that long (the error's name is "AbortError"); default = no limit. */
async function postJson(route, body, { timeoutMs = 0 } = {}) {
  const ctl = timeoutMs > 0 ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
  let res;
  try {
    res = await api.fetchApi(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(ctl ? { signal: ctl.signal } : {}),
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    err.data = data;
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

/** Optimistic display version: swap timeline media + clamp trim, then persist via /gonggan/edit. Does not change Best. */
function applyDisplayVersionLocally(c, vid) {
  if (!c || !vid) return false;
  const v = (c.versions_list || []).find((x) => x.id === vid);
  if (!v) return false;
  if (c.display === vid && c.media?.id === vid) return false;
  c.display = vid;
  c.media = versionMedia(v);
  c.src_dur = c.media && c.media.kind === "video" ? Math.max(0, Number(v?.seconds) || 0) : 0;
  const clamped = clampClip(c, c.in, c.sec);
  c.in = clamped.in;
  c.sec = clamped.sec;
  c.edited = true;
  recomputeCutStarts();
  play.idx = -1;
  return true;
}

async function setDisplayVersion(cutId, vid) {
  const c = cutsNow().find((x) => x.id === cutId);
  if (!c) return;
  const prev = {
    display: c.display,
    in: c.in,
    sec: c.sec,
    media: c.media ? { ...c.media } : null,
    src_dur: c.src_dur,
    edited: c.edited,
  };
  if (!applyDisplayVersionLocally(c, vid)) return;
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
      loadCutWorkflow(cutId, c, loadToken).catch((e) => console.warn("[gonggan] display workflow reload failed", e));
    }
    return;
  }
  c.display = prev.display;
  c.media = prev.media;
  c.src_dur = prev.src_dur;
  c.in = prev.in;
  c.sec = prev.sec;
  c.edited = prev.edited;
  recomputeCutStarts();
  play.idx = -1;
  bus.dispatchEvent(new Event("timeline"));
  bus.dispatchEvent(new Event("select"));
  const msg = (state.error || "").replace(/^Save failed:\s*/, "") || "unknown error";
  ggToast("Version not applied", `Reverted to the previous version: ${msg}`, "warn");
}

/** Optimistic promote: swap timeline media + clamp trim, then persist via /gonggan/edit. `vid` null = clear
 * Best, so the newest version is current again (same as the server). */
function applyPickLocally(c, vid) {
  const clear = vid === null;
  if (!c || (clear ? !c.pick : !vid || c.pick === vid)) return false;
  const v = clear ? (c.versions_list || []).find((x) => x && x.id) : (c.versions_list || []).find((x) => x.id === vid);
  if (!v && !clear) return false;
  c.pick = clear ? null : vid;
  if (clear) c.display = v?.id || null;
  else c.display = vid;
  c.media = versionMedia(v);
  c.src_dur = c.media && c.media.kind === "video" ? Math.max(0, Number(v?.seconds) || 0) : 0;
  const clamped = clampClip(c, c.in, c.sec);
  c.in = clamped.in;
  c.sec = clamped.sec;
  c.edited = true;
  recomputeCutStarts();
  play.idx = -1;
  return true;
}

/** Version row Best: sets Best on the version, or clears it when that version already is the Best. */
function toggleBest(cutId, vid) {
  const c = cutsNow().find((x) => x.id === cutId);
  if (!c || !vid) return;
  void setPick(cutId, c.pick === vid ? null : vid);
}

async function setPick(cutId, vid, opts = {}) {
  const c = cutsNow().find((x) => x.id === cutId);
  if (!c) return;
  const prev = {
    pick: c.pick,
    display: c.display,
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
    if (opts.record !== false && isNativeProject() && !historyApplying) {
      recordShotsEntry(state.pid, {
        kind: "pick",
        cut_id: cutId,
        from: prev.pick ?? null,
        to: vid ?? null,
        fromClip: { in: prev.in, sec: prev.sec },
        toClip: { in: c.in, sec: c.sec },
      }, vid ? "Set Best" : "Clear Best");
    }
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
  c.display = prev.display;
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

const versionDeleteBusy = new Set();

/** Hide one output thumbnail. Files stay in this History step until the step is dropped. */
async function deleteVersion(cutId, versionId) {
  if (!state.pid || !cutId || !versionId || !isNativeProject()) return;
  const busyKey = `${cutId}\n${versionId}`;
  if (versionDeleteBusy.has(busyKey)) return;
  versionDeleteBusy.add(busyKey);
  const stepId = historyStepId();
  const pid = state.pid;
  try {
    const d = await postJson("/gonggan/version/delete", {
      pid, cut_id: cutId, version_id: versionId, history_step: stepId,
    });
    if (stripPick.pid === pid && stripPick.cutId === cutId && stripPick.vid === versionId) stripPick.vid = "";
    if (wfOpenVersion && wfOpenVersion.projectId === pid && wfOpenVersion.cutId === cutId && wfOpenVersion.vid === versionId) {
      wfOpenVersion = null;
    }
    if (d.timeline) adoptMutationTimeline(d.timeline, pid);
    else await loadTimeline();
    recordShotsEntry(pid, {
      kind: "version", op: "delete", cut_id: cutId, version_id: versionId, history_step: stepId,
    }, "Delete version");
    bus.dispatchEvent(new Event("timeline"));
  } catch (e) {
    ggToast("Delete version", e.message, "warn");
  } finally {
    versionDeleteBusy.delete(busyKey);
  }
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

/** Dry run of a native SDK job; a UI-only workflow falls back to the API prompt of that cut's open shot tab. */
async function planNativeSdkJob(pid, cutId, mode) {
  const body = { pid, cut_id: cutId, mode, dry_run: true };
  try {
    return (await postJson("/gonggan/regen", body)).plan;
  } catch (e) {
    if (e.code !== "ui_only") throw e;
    if (!nativeRegenCheck(cutId, wfLoadToken).ok) return (await postJson("/gonggan/regen", { ...body, convert: true })).plan;
    const p = await app.graphToPrompt();
    return (await postJson("/gonggan/regen", { ...body, api_workflow: p.output })).plan;
  }
}

/**
 * Native Regen (new random seeds) / Queue (saved seeds): run the cut's current saved workflow through the
 * Comfy SDK path without opening a tab. The server adds the finished output as a new version of the cut.
 */
async function sdkGenerateNativeCut(cutId, { newSeed }) {
  const cut = cutById(cutId);
  if (!cut || !state.timeline || sdk.busy) return;
  const tooLong = videoTooLongMessage(computeEffectiveSec(cut));
  if (tooLong) {
    ggToast("Queue", tooLong, "warn");
    return;
  }
  const title = shotTitle(cut);
  const pid = state.pid;
  sdk.busy = "regen";
  sdk.regenCutId = cutId;
  sdk.msg = `Preparing ${title}…`;
  bus.dispatchEvent(new Event("sdk"));
  try {
    const plan = await planNativeSdkJob(pid, cutId, newSeed ? "regen" : "queue");
    sdk.msg = `${title}: ${sdkPlanSummary(plan)}`;
    bus.dispatchEvent(new Event("sdk"));
    const message = newSeed ? regenConfirmMessage(title) : batchRenderConfirmMessage([title]);
    if (!(await askConfirm({ message }))) {
      sdk.msg = "Not queued (cancelled).";
      return;
    }
    await postJson("/gonggan/regen", { pid, cut_id: cutId, dry_run: false, confirm: true, plan: plan.plan });
    syncRegenJobFromServer({ native: true, status: "running", pid, cut_id: cutId });
    scheduleRegenPoll();
    void refreshRegenJob();
    sdk.msg = `Queued through Comfy SDK: ${title}`;
    ggToast("Queued", `${title} (Comfy SDK)`, "ok");
  } catch (e) {
    sdk.msg = `${newSeed ? "Regen" : "Queue"} failed: ${sdkRegenErrorMessage(e?.message || e)}`;
    ggToast(newSeed ? "Regen" : "Queue", `${title} — ${sdkRegenErrorMessage(e?.message || e)}`, "warn");
  } finally {
    sdk.busy = "";
    sdk.regenCutId = null;
    bus.dispatchEvent(new Event("sdk"));
  }
}

function regenNativeCut(cutId) {
  return sdkGenerateNativeCut(cutId, { newSeed: true });
}

/**
 * Image to Video: the project's Video template with this cut's Best (else selected, else newest) image as start
 * image and its description as prompt, through the Comfy SDK path without opening a tab; the server adds the
 * video as a new version of the same cut. `startVid` (version row Make Video): exactly that image version.
 */
async function imageToVideoCut(cutId, { startVid = "" } = {}) {
  const cut = cutById(cutId);
  if (!cut || !state.timeline || !isNativeProject() || sdk.busy) return;
  const tooLong = videoTooLongMessage(computeEffectiveSec(cut));
  if (tooLong) {
    ggToast(MAKE_VIDEO_LABEL, tooLong, "warn");
    return;
  }
  const title = shotTitle(cut);
  const pid = state.pid;
  const open = wfOpenVersion;
  const selectedVid = startVid || (open && open.projectId === pid && open.cutId === cutId ? open.vid : "");
  const what = startVid ? MAKE_VIDEO_LABEL : "Image to Video";
  sdk.busy = "regen";
  sdk.regenCutId = cutId;
  sdk.msg = `Preparing ${what} for ${title}…`;
  bus.dispatchEvent(new Event("sdk"));
  try {
    const plan = (await postJson("/gonggan/image-to-video", {
      pid,
      cut_id: cutId,
      ...(selectedVid ? { selected_vid: selectedVid } : {}),
      ...(startVid ? { start_vid: startVid } : {}),
    })).plan;
    if (!makeVideoPlanOk(plan, startVid)) throw new Error(MAKE_VIDEO_OLD_SERVER);
    sdk.msg = `${title}: ${sdkPlanSummary(plan)}`;
    bus.dispatchEvent(new Event("sdk"));
    if (!(await askConfirm({ message: i2vConfirmMessage(title, plan) }))) {
      sdk.msg = "Not queued (cancelled).";
      return;
    }
    await postJson("/gonggan/regen", { pid, cut_id: cutId, dry_run: false, confirm: true, plan: plan.plan });
    syncRegenJobFromServer({ native: true, status: "running", pid, cut_id: cutId });
    scheduleRegenPoll();
    void refreshRegenJob();
    sdk.msg = `Queued through Comfy SDK: ${title} (${what})`;
    ggToast("Queued", `${title}: ${what} (Comfy SDK)`, "ok");
    if (wfLastLoadedCutId === cutId && wfLastLoadedProjectId === pid && isGongganShotTabOpenAndActive()) {
      ggMakeVideoCutId = cutId;
      wfLastLoadedCutId = "";
      const cutNow = cutById(cutId);
      if (cutNow) await loadCutWorkflow(cutId, cutNow, ++wfLoadToken);
    }
  } catch (e) {
    sdk.msg = `${what} failed: ${i2vErrorMessage(e)}`;
    ggToast(what, `${title} — ${i2vErrorMessage(e)}`, "warn");
  } finally {
    sdk.busy = "";
    sdk.regenCutId = null;
    bus.dispatchEvent(new Event("sdk"));
  }
}

/** Status panel Queue: mode-aware jobs per selected cut (Image / Video / Auto). */
function queueContextForCut(cutId) {
  const picked = stripPick.pid === state.pid && stripPick.cutId === cutId ? stripPick.vid : "";
  const o = wfOpenVersion;
  const open = o && o.projectId === state.pid && o.cutId === cutId ? o.vid : "";
  return { picked, open };
}

function queuePlanForSelectedIds(ids) {
  const mode = loadQueueMode(localStorage);
  const tl = state.timeline;
  const { order } = shotsNavOrder();
  const ordered = selectedInDisplayOrder(order, (tl?.cuts || []).map((c) => c.id), ids);
  const cuts = ordered.map((id) => cutById(id)).filter(Boolean);
  const batch = queueBatchPlan(cuts, mode, (cutId) => queueContextForCut(cutId));
  return { ...batch, mode, tooltip: queuePlanTooltip(batch.counts) };
}

try {
  globalThis.__gongganQueuePlan = (ids) => queuePlanForSelectedIds(Array.isArray(ids) && ids.length ? ids : timelineSelectedCutIds());
} catch (_) {}

function syncQueueModeUi(root, mode) {
  const m = mode || loadQueueMode(localStorage);
  root.querySelectorAll(".gg-queue-mode .gg-qm-seg").forEach((btn) => {
    const on = btn.dataset.mode === m;
    btn.classList.toggle("gg-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

async function runQueueJobItem(item, { newSeed }) {
  const cutId = item.cut_id;
  const cut = cutById(cutId);
  if (!cut || !state.timeline || !isNativeProject() || sdk.busy) return;
  const tooLong = videoTooLongMessage(computeEffectiveSec(cut));
  if (tooLong) {
    ggToast("Queue", tooLong, "warn");
    return;
  }
  const title = shotTitle(cut);
  const pid = state.pid;
  const sdkMode = newSeed ? "regen" : "queue";
  sdk.busy = "regen";
  sdk.regenCutId = cutId;
  sdk.msg = `Preparing ${title}…`;
  bus.dispatchEvent(new Event("sdk"));
  try {
    let plan;
    if (item.job === "video") {
      plan = (
        await postJson("/gonggan/image-to-video", {
          pid,
          cut_id: cutId,
          selected_vid: item.selected_vid,
          start_vid: item.selected_vid,
          random_seed: newSeed,
        })
      ).plan;
    } else {
      plan = (
        await postJson("/gonggan/regen", {
          pid,
          cut_id: cutId,
          mode: sdkMode,
          dry_run: true,
          job: item.job,
          selected_vid: item.selected_vid || undefined,
        })
      ).plan;
    }
    sdk.msg = `${title}: ${sdkPlanSummary(plan)}`;
    bus.dispatchEvent(new Event("sdk"));
    if (!(await askConfirm({ message: batchRenderConfirmMessage([title]) }))) {
      sdk.msg = "Not queued (cancelled).";
      return;
    }
    await postJson("/gonggan/regen", { pid, cut_id: cutId, dry_run: false, confirm: true, plan: plan.plan });
    syncRegenJobFromServer({ native: true, status: "running", pid, cut_id: cutId });
    scheduleRegenPoll();
    void refreshRegenJob();
    sdk.msg = `Queued through Comfy SDK: ${title}`;
    ggToast("Queued", `${title} (Comfy SDK)`, "ok");
  } catch (e) {
    sdk.msg = `Queue failed: ${sdkRegenErrorMessage(e?.message || e)}`;
    ggToast("Queue", `${title} — ${sdkRegenErrorMessage(e?.message || e)}`, "warn");
  } finally {
    sdk.busy = "";
    sdk.regenCutId = null;
    bus.dispatchEvent(new Event("sdk"));
  }
}

/** Status panel Queue: one selected cut = one mode job; two or more = generate-all of those jobs; Stop while that batch runs. */
function queueButtonClick() {
  if (isGenerateAllRunning(genAll.batch) && genAll.batch?.pid === state.pid && !genAll.batch?.stop) {
    return stopGenerateAll();
  }
  const ids = timelineSelectedCutIds();
  if (!ids.length || !isNativeProject()) return;
  const plan = queuePlanForSelectedIds(ids);
  if (!plan.actionable) return;
  const newSeed = queueRandomSeedOn(localStorage, state.timeline?.project?.settings);
  if (plan.jobs.length === 1) return void runQueueJobItem(plan.jobs[0], { newSeed });
  return startGenerateAll(ids, { items: plan.jobs, randomSeed: newSeed });
}

/** Every cut of the shown native project in Shots list order (collapsed scenes included). */
function generateAllCutIds() {
  const tl = state.timeline;
  if (!tl || !isNativeProject()) return [];
  return generateAllOrder(displayedCutIds(), tl.cuts);
}

function setGenerateAllBatch(batch) {
  const prev = genAll.batch;
  genAll.batch = batch && Array.isArray(batch.items) ? batch : null;
  const ids = new Set([...(prev?.items || []), ...(genAll.batch?.items || [])].map((it) => it.cut_id));
  paintRenderStatus(ids);
  document.querySelectorAll(".gg-shots").forEach((root) => updateSelectionBar(root));
}

async function refreshGenerateAll() {
  try {
    const d = await getJson("/gonggan/generate-all/status");
    setGenerateAllBatch(d.batch);
  } catch (_) {}
}

/**
 * Generate All: every cut in list order, one Comfy SDK job at a time on the server (each cut's own saved
 * workflow and seed, the output added as a new version). Runs without the workflow tab; Stop cancels the rest.
 */
async function startGenerateAll(cutIds, opts = {}) {
  if (!isNativeProject() || sdk.busy || batchRenderUi.running || genAll.starting || isGenerateAllRunning(genAll.batch)) return;
  const tl = state.timeline;
  const { order } = shotsNavOrder();
  const ids = Array.isArray(cutIds) && cutIds.length
    ? selectedInDisplayOrder(order, tl.cuts.map((c) => c.id), cutIds)
    : generateAllCutIds();
  if (!ids.length) return;
  const pid = state.pid;
  if (!(await askConfirm({ message: generateAllConfirmMessage(ids.map((id) => shotTitle(cutById(id)))) }))) return;
  if (state.pid !== pid) return;
  genAll.starting = true;
  document.querySelectorAll(".gg-shots").forEach((root) => updateSelectionBar(root));
  try {
    const body = {
      pid,
      confirm: true,
      random_seed: opts.randomSeed ?? queueRandomSeedOn(localStorage, state.timeline?.project?.settings),
    };
    if (opts.items?.length) {
      body.items = opts.items.map((j) => ({
        cut_id: j.cut_id,
        job: j.job,
        ...(j.selected_vid ? { selected_vid: j.selected_vid } : {}),
      }));
    } else {
      body.cut_ids = ids;
    }
    const d = await postJson("/gonggan/generate-all", body);
    setGenerateAllBatch(d.batch);
    sdk.msg = `Generate All: ${ids.length} cut${ids.length === 1 ? "" : "s"} queued through Comfy SDK`;
    ggToast("Generate All started", `${ids.length} cut${ids.length === 1 ? "" : "s"}, one at a time in list order`, "ok");
  } catch (e) {
    const msg = e.status === 404 && !e.code ? "Restart ComfyUI to use Generate All (new server route)." : e.message;
    if (e.data?.batch) setGenerateAllBatch(e.data.batch);
    ggToast("Generate All", msg, "warn");
  } finally {
    genAll.starting = false;
    bus.dispatchEvent(new Event("sdk"));
    document.querySelectorAll(".gg-shots").forEach((root) => updateSelectionBar(root));
  }
}

async function stopGenerateAll() {
  try {
    const d = await postJson("/gonggan/generate-all/stop", {});
    setGenerateAllBatch(d.batch);
    ggToast("Stopping batch", "The cut generating now finishes; the rest are cancelled.", "ok");
  } catch (e) {
    ggToast("Stop failed", e.message, "warn");
  }
}

api.addEventListener("gonggan.generate_all", (e) => {
  const b = e.detail || {};
  const wasRunning = isGenerateAllRunning(genAll.batch) && genAll.batch?.id === b.id;
  setGenerateAllBatch(b);
  if (wasRunning && !isGenerateAllRunning(b)) {
    const t = generateAllFinishedToast(b);
    if (t) ggToast(t.summary, t.detail, t.kind);
  }
});

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
    await loadTimeline({ reloadWorkflows: true });
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
  if (d?.ok && !d.duplicate && state.pid === t.projectId) await loadTimeline({ reloadWorkflows: true });
}

api.addEventListener("gonggan.regen", (e) => {
  const j = e.detail || {};
  syncRegenJobFromServer(j);
  const shown = !j.native || state.pid === j.pid;
  if (j.status === "done") { sdk.msg = `New version from SDK job ${j.sdk_job_id || ""}`; if (shown) loadTimeline({ reloadWorkflows: true }); }
  else if (j.status === "error") sdk.msg = "SDK job failed: " + (j.error || "");
  else if (j.status === "running") sdk.msg = "SDK job running…";
  const cut = shown && j.native ? cutById(j.cut_id) : null;
  const t = sdkJobToast(j, cut ? shotTitle(cut) : "");
  if (t) ggToast(t.summary, t.detail, t.kind);
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
    tip: [v.failed ? `Failed: ${v.error || "black video"}` : "", fmtSrc(v.source), v.model || "", new Date(v.created * 1000).toLocaleString()].filter(Boolean).join(" · "),
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
        ${fmtSrc(v.source) ? `<span class="gg-ver-src gg-src-${esc(v.source)}">${esc(fmtSrc(v.source))}</span>` : ""}
        ${on ? '<span class="gg-ver-rep">Rep</span>' : ""}
      </div>
      <button type="button" class="gg-btn gg-promote${on ? " gg-on" : ""}" ${on ? "disabled" : ""} title="${on ? "Timeline representative version" : "Set as timeline representative"}">${on ? "Rep" : "Set rep"}</button>
    </div>`;
  }).join("");
  const lenDrift = c && formatCutInfoLengthField(c);
  const lenVal = lenDrift?.text || "";
  const lenPh = lenDrift?.placeholder || "";
  const lenDriftCls = lenDrift?.drift ? " gg-len-drift" : "";
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
            <input type="number" class="gg-len-input${lenDriftCls}" min="0.5" max="600" step="0.1" value="${esc(lenVal)}"${lenPh ? ` placeholder="${esc(lenPh)}"` : ""} title="Planned length (seconds). Read-only." readonly tabindex="-1" />
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

let stripImportBusy = false;

/** Version row Import: native file picker; each picked file becomes a new version of the cut. */
function pickVersionImportFiles(cutId) {
  const pid = state.pid;
  if (!cutId || !isNativeProject() || stripImportBusy) return;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = IMPORT_ACCEPT;
  input.addEventListener("change", () => void importVersionFiles(pid, cutId, [...(input.files || [])]));
  input.click();
}

/** One upload per file in pick order, so the last picked file ends up newest (left). */
async function importVersionFiles(pid, cutId, files) {
  if (!files.length) return;
  stripImportBusy = true;
  bus.dispatchEvent(new Event("sdk"));
  const failed = [];
  let added = 0;
  try {
    for (const file of files) {
      const form = new FormData();
      form.append("pid", pid);
      form.append("cut_id", cutId);
      form.append("file", file, file.name);
      try {
        const res = await api.fetchApi("/gonggan/import-version", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (res.status === 404 || res.status === 405) throw new Error("Restart ComfyUI to enable Import");
        if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
        added++;
        const vid = data.version && data.version.id;
        if (vid && state.pid === pid) {
          const stepId = historyStepId();
          recordShotsEntry(pid, { kind: "version", op: "add", cut_id: cutId, version_id: vid, history_step: stepId }, "Import version");
        }
      } catch (e) {
        failed.push(`${file.name}: ${e.message}`);
      }
    }
  } finally {
    stripImportBusy = false;
    if (added && state.pid === pid) await loadTimeline({ reloadWorkflows: true });
    bus.dispatchEvent(new Event("sdk"));
  }
  if (failed.length) ggToast(`Imported ${added} of ${files.length}`, failed.join("\n"), "warn");
  else ggToast(`Imported ${added} file${added === 1 ? "" : "s"}`, "", "ok");
}

/** Thumbnail clicked last in the version row (the row's selected version until another cut or project). */
const stripPick = { pid: "", cutId: "", vid: "" };

const IMAGE_MIME_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function extForImageMime(mime) {
  const m = String(mime || "").split(";")[0].trim().toLowerCase();
  return IMAGE_MIME_EXT[m] || ".png";
}

/** Live graph node that receives the i2v start frame (title "Start Image", else the first LoadImage). */
function liveStartImageNode() {
  const nodes = app.graph?._nodes || app.graph?.nodes || [];
  const hit = findStartImageNode({
    nodes: nodes.map((n) => ({
      id: n?.id,
      type: n?.type || n?.comfyClass || "",
      title: n?.title,
      mode: n?.mode,
    })),
  });
  if (!hit) return null;
  return nodes.find((n) => n && String(n.id) === hit.id) || null;
}

function setLiveLoadImageWidget(node, imageName) {
  const widget = findImageWidget(node);
  if (!widget) return false;
  const values = widget.options?.values;
  if (Array.isArray(values) && !values.includes(imageName)) values.push(imageName);
  widget.value = imageName;
  try { app.canvas?.setDirty?.(true, true); } catch (_) {}
  return true;
}

/** Copy a version image into ComfyUI input/gonggan and return the Load Image name. */
async function copyVersionImageToInput(vid) {
  const res = await api.fetchApi(`/gonggan/media?id=${encodeURIComponent(vid)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const ext = extForImageMime(res.headers.get("Content-Type") || blob.type);
  const filename = `start_${vid}${ext}`;
  const form = new FormData();
  form.append("image", new File([blob], filename, { type: blob.type || "image/png" }));
  form.append("overwrite", "true");
  form.append("type", "input");
  form.append("subfolder", "gonggan");
  const up = await api.fetchApi("/upload/image", { method: "POST", body: form });
  if (!up.ok) throw new Error(`upload HTTP ${up.status}`);
  const data = await up.json().catch(() => ({}));
  const name = String(data.name || filename).replace(/\\/g, "/");
  const sub = String(data.subfolder || "gonggan").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!sub || name.startsWith(`${sub}/`)) return name;
  return `${sub}/${name}`;
}

/**
 * Video-cut queue only: the cut's selected still image becomes the Load Image start frame.
 * No selected image, or the copy fails: leave the graph alone and queue as before.
 * Image cuts return immediately.
 */
async function feedVideoCutStartImage() {
  const extra = app.graph?.extra?.gonggan;
  const cutId = extra?.cutId;
  const pid = extra?.pid || extra?.projectId;
  if (!cutId || !pid || pid !== state.pid || !isNativeProject()) return;
  const cut = cutById(cutId);
  if (!cut || workflowKindForCut(cut) !== "video") return;
  const ver = findCutVersion(cut, stripSelectedVersionId(cut));
  if (!isStillVersion(ver)) {
    console.warn("[gonggan] video queue: no selected image result; queuing without a start frame", cutId);
    return;
  }
  const node = liveStartImageNode();
  if (!node) {
    console.warn("[gonggan] video queue: no Load Image node; queuing without a start frame", cutId);
    return;
  }
  let imageName = "";
  try {
    imageName = await copyVersionImageToInput(ver.id);
  } catch (e) {
    console.warn("[gonggan] video queue: could not copy the selected image; queuing as before", cutId, e);
    return;
  }
  if (!setLiveLoadImageWidget(node, imageName)) {
    console.warn("[gonggan] video queue: Load Image has no image widget; queuing as before", cutId);
  }
}

/** Selected version of the row for this cut (see stripSelectedVid). */
function stripSelectedVersionId(c) {
  if (!c) return "";
  const picked = stripPick.pid === state.pid && stripPick.cutId === c.id ? stripPick.vid : "";
  const o = wfOpenVersion;
  const open = o && o.projectId === state.pid && o.cutId === c.id && ownedShotTabOpen() ? o.vid : "";
  return stripSelectedVid(c, { picked, open });
}

/** Thumbnails of the selected cut's versions (+ import tile first); Best via star or border. */
function versionStripHtml(c, selVid) {
  if (!c) return '<div class="gg-vs-empty gg-dim">Select a cut to see its versions</div>';
  const importSt = importButtonState({ hasCut: !!c, native: isNativeProject(), busy: stripImportBusy });
  const tileDis = importSt.disabled ? " disabled" : "";
  const tile = `<button type="button" class="gg-vs-import-tile"${tileDis} title="${esc(IMPORT_TILE_TIP)}">+</button>`;
  const rows = versionStripRows(c, stripProbe.dur);
  if (!rows.length) return tile + '<div class="gg-vs-empty gg-dim">No versions</div>';
  const tabOpen = ownedShotTabOpen();
  const byId = new Map((c.versions_list || []).map((v) => [v.id, v]));
  const thumbs = rows.map((r) => {
    const { wrapCls, tip, img } = versionThumbParts(c, byId.get(r.id), tabOpen);
    const title = r.state ? `${r.state} · ${tip}` : tip;
    const sel = r.id === selVid;
    const failed = !!byId.get(r.id)?.failed;
    const starOn = r.best ? " gg-on" : "";
    const xBtn = isNativeProject()
      ? `<button type="button" class="gg-vs-x" title="Hide this version. History can restore it." aria-label="Delete">×</button>`
      : "";
    return `<div class="${wrapCls} gg-vs-item${failed ? " gg-vs-failed" : ""}${r.best ? " gg-vs-best" : ""}${sel && !r.best ? " gg-vs-sel" : ""}" data-vid="${esc(r.id)}"${sel ? ' aria-selected="true"' : ""}>
      <div class="gg-ver" title="${esc(title)}">
        <button type="button" class="gg-vs-star${starOn}" title="${esc(SET_BEST_LABEL)}" aria-pressed="${r.best ? "true" : "false"}">★</button>
        ${xBtn}
        ${img}
        ${r.video ? `<span class="gg-vs-dur"${r.duration ? "" : " hidden"}>${esc(r.duration)}</span>` : ""}
      </div>
    </div>`;
  }).join("");
  return tile + thumbs;
}

function versionInfoPanelHtml(c, selVid) {
  if (!c || !selVid) return '<div class="gg-vs-info-empty gg-dim">Select a version thumbnail</div>';
  const v = (c.versions_list || []).find((x) => x && x.id === selVid);
  const pf = Number(state.timeline?.project?.settings?.fps);
  const fields = versionInfoFields(v, c, stripProbe.dur, Number.isFinite(pf) ? pf : undefined);
  const rows = versionInfoPanelRows(fields);
  return rows.map(({ label, value }) =>
    `<span class="gg-vs-info-k">${esc(label)}</span><span class="gg-vs-info-v">${esc(value)}</span>`,
  ).join("");
}

const ICON_SVG_ATTRS = 'width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_FOLDER = `<svg ${ICON_SVG_ATTRS}><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/></svg>`;
const ICON_NEW_PAGE = `<svg ${ICON_SVG_ATTRS}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15h6"/></svg>`;
const ICON_TRASH = `<svg ${ICON_SVG_ATTRS}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>`;
const ICON_WAND = `<svg ${ICON_SVG_ATTRS}><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9"/></svg>`;

/** Lower-left icon row of the Shots sidebar (fixed height, above the version row): plugin version on the left; AI Make Cut, New scene, New cut, Delete on the right. */
function iconRowHtml() {
  const btn = (cls, tip, icon) =>
    `<button type="button" class="gg-btn gg-ir-btn ${cls}" title="${esc(tip)}" aria-label="${esc(tip)}" disabled>${icon}</button>`;
  const aiWand =
    AI_CUT_SPLIT_VISIBLE && isNativeProject()
      ? (() => {
          const s = aiMakeCutIconButtonState(cutSplitUseAiOn);
          return `<button type="button" class="gg-btn gg-ir-btn gg-ir-aicut gg-ai-split" title="${esc(s.title)}" aria-label="${esc(s.ariaLabel)}"${s.disabled ? " disabled" : ""}>${ICON_WAND}</button>`;
        })()
      : "";
  return `<div class="gg-iconrow">
        <span class="gg-version" title="Shots plugin version — if this is not the latest, press Ctrl+F5">v${esc(GG_VERSION)}</span>
        ${aiWand}
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

/** Status panel: job queue (when active) + Queue toolbar (cut details stay in the list / version info). */
function statusPanelShellHtml() {
  return `
        <div class="gg-job-queue" hidden aria-label="Job queue">
          <ul class="gg-job-queue-list"></ul>
        </div>
        <div class="gg-sp-actions">
          <div class="gg-sp-side">
            <span class="gg-render-badge gg-render-global" hidden><span class="gg-rs-dot"></span><span class="gg-rs-text"></span></span>
            <span class="gg-batch-prog" hidden></span>
            <span class="gg-genall-prog" hidden></span>
            <label class="gg-random-seed" title="When on, each Queue run uses new random sampler seeds">
              <input type="checkbox" class="gg-random-seed-cb" /> ${esc(RANDOM_SEED_LABEL)}
            </label>
          </div>
          <div class="gg-queue-mode" role="group" aria-label="Queue mode">
            ${QUEUE_MODES.map((m) => `<button type="button" class="gg-btn gg-qm-seg${m === "auto" ? " gg-on" : ""}" data-mode="${esc(m)}" aria-pressed="${m === "auto" ? "true" : "false"}">${esc(QUEUE_MODE_LABELS[m])}</button>`).join("")}
          </div>
          <button type="button" class="gg-btn gg-primary gg-queue-btn" disabled>Queue</button>
        </div>`;
}

function paintStatusPanel(panel) {
  if (!panel) return;
  paintJobQueue(panel.closest(".gg-shots") || panel);
}

function jobQueueRowHtml(row) {
  const cut = row.cutId ? cutById(row.cutId) : null;
  const label = cut ? shotTitle(cut) : String(row.cutId || "Cut");
  const st =
    row.state === "rendering"
      ? `Rendering${Number.isFinite(row.percent) ? ` ${Math.round(row.percent)}%` : ""}`
      : `Queued${row.position ? ` #${row.position}` : ""}`;
  return `<li class="gg-job-row" data-prompt-id="${esc(row.promptId)}"><span class="gg-job-cut">${esc(label)}</span><span class="gg-job-st">${esc(st)}</span></li>`;
}

/** Scrollable list of active ComfyUI jobs for this project; fixed outer panel height. */
function paintJobQueue(shotsRoot) {
  const root = shotsRoot?.classList?.contains("gg-shots") ? shotsRoot : shotsRoot?.querySelector?.(".gg-shots") || shotsRoot;
  const wrap = root?.querySelector?.(".gg-job-queue");
  const list = root?.querySelector?.(".gg-job-queue-list");
  if (!wrap || !list) return;
  const rows = state.pid ? renderStatus.listProjectJobs(state.pid) : [];
  wrap.hidden = rows.length === 0;
  const html = rows.map(jobQueueRowHtml).join("");
  if (list.dataset.jq === html) return;
  list.dataset.jq = html;
  list.innerHTML = html;
}

function mountShots(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = `gg-root gg-shots${CUT_PANEL_ROOT_CLASS}`;
  el.appendChild(root);
  const extraCleanup = [];
  bindShotsTabActivated(el, extraCleanup);
  if (!root._ggProjOpenRefresh) {
    root._ggProjOpenRefresh = true;
    const onProjOpen = (e) => {
      if (e.target.matches?.(".gg-proj")) onProjectSelectOpenIntent();
    };
    root.addEventListener("mousedown", onProjOpen, true);
    root.addEventListener("pointerdown", onProjOpen, true);
    root.addEventListener("focusin", onProjOpen, true);
  }
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
    list.querySelector(".gg-vs-import-tile")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.currentTarget.disabled) return;
      pickVersionImportFiles(c.id);
    });
    list.querySelectorAll(".gg-ver-wrap").forEach((wrap) => {
      const vid = wrap.dataset.vid;
      const row = rows.get(vid);
      if (!row) return;
      wrap.querySelector(".gg-vs-star")?.addEventListener("click", (e) => {
        e.stopPropagation();
        Object.assign(stripPick, { pid: state.pid, cutId: c.id, vid });
        toggleBest(c.id, vid);
      });
      wrap.querySelector(".gg-vs-x")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void deleteVersion(c.id, vid);
      });
      wrap.addEventListener("click", (e) => {
        if (e.target.closest(".gg-vs-star, .gg-vs-x")) return;
        e.stopPropagation();
        selectStripVersion(c.id, vid);
      });
      wrap.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, attachMenuActions(versionStripMenuItems(row), {
          best: () => setPick(c.id, vid),
          del: () => { void deleteVersion(c.id, vid); },
        }));
      });
    });
  };
  const stripCut = () => (state.timeline ? state.timeline.cuts.find((x) => x.id === state.cutId) || null : null);
  /** Thumbnail click: displayed version (preview + timeline) and open in the shot tab. */
  const selectStripVersion = (cutId, vid) => {
    Object.assign(stripPick, { pid: state.pid, cutId, vid });
    void setDisplayVersion(cutId, vid);
    openVersionWorkflow(cutId, vid);
    paintVersionStrip();
  };
  const paintVersionStrip = () => {
    const list = root.querySelector(".gg-vstrip .gg-vs-list");
    const info = root.querySelector(".gg-vstrip .gg-vs-info");
    if (!list) return;
    const c = stripCut();
    const cutId = c?.id || "";
    const selVid = stripSelectedVersionId(c);
    const html = versionStripHtml(c, selVid);
    const key = `${cutId}\n${html}`;
    if (list.dataset.html !== key) {
      const left = stripScrollLeft(stripScroll, cutId);
      stripScroll.cutId = cutId;
      stripScroll.left = left;
      list.dataset.html = key;
      list.innerHTML = html;
      list.scrollLeft = left;
      syncStripNewest();
      if (c) {
        bindThumbFallbacks(list);
        bindStripItems(list, c);
        probeStripDurations(c);
      }
    }
    if (info) {
      const ihtml = versionInfoPanelHtml(c, selVid);
      if (info.dataset.html !== ihtml) {
        info.dataset.html = ihtml;
        info.innerHTML = ihtml;
      }
    }
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
  const FIELD_TEXT_SEL = ".gg-caption-text, .gg-prompt-text";

  function fieldTextKind(el) {
    if (el?.classList?.contains("gg-prompt-text")) return "prompt";
    if (el?.classList?.contains("gg-caption-text")) return "caption";
    return "";
  }

  function captureFieldTextFocus() {
    const el = document.activeElement;
    if (!el || !root.contains(el)) return null;
    const field = fieldTextKind(el);
    if (!field) return null;
    const li = el.closest(".gg-cut");
    return {
      cutId: li?.dataset?.cutId || "",
      field,
      value: el.value,
      selectionStart: el.selectionStart,
      selectionEnd: el.selectionEnd,
      scrollTop: el.scrollTop,
      editing: isCardFieldEditing(el),
    };
  }

  function restoreFieldTextFocus(cap) {
    if (!cap?.cutId || !cap.field) return;
    const sel = cap.field === "prompt" ? ".gg-prompt-text" : ".gg-caption-text";
    const ta = root.querySelector(`.gg-cut[data-cut-id="${CSS.escape(cap.cutId)}"] ${sel}`);
    if (!ta) return;
    ta.value = cap.value;
    const c = cutByIdTimeline(cap.cutId);
    if (c) {
      if (cap.field === "caption" && captionEditChanged(c, cap.value)) {
        const prev = c.caption;
        c.caption = cap.value;
        scheduleCutFieldSave(cap.cutId, { caption: cap.value }, { caption: prev });
      } else if (cap.field === "prompt" && String(c.prompt || "") !== cap.value) {
        const prev = c.prompt;
        c.prompt = cap.value;
        scheduleCutFieldSave(cap.cutId, { prompt: cap.value }, { prompt: prev });
      }
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
    if (ta.classList.contains("gg-prompt-text") || ta.classList.contains("gg-caption-text")) return;
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

      const enterCardFieldEdit = (caretAt) => {
        if (!nat) return;
        ta.readOnly = false;
        ta.dataset.editing = "1";
        ta.classList.add("gg-field-editing");
        ta.title = CARD_EDIT_ACTIVE_TIP;
        ta.focus({ preventScroll: true });
        const pos =
          caretAt != null && Number.isFinite(Number(caretAt)) ? Math.min(Math.max(0, Number(caretAt)), ta.value.length) : ta.value.length;
        try {
          ta.setSelectionRange(pos, pos);
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
        if (!nat) return;
        const pos = promptTextareaCaretIndex(ta, e.clientX, e.clientY);
        enterCardFieldEdit(pos);
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
        const kind = fieldTextKind(ta);
        if (c && kind === "caption") {
          const prev = c.caption;
          c.caption = ta.value;
          scheduleCutFieldSave(id, { caption: ta.value }, { caption: prev });
          paintViewerCaption();
        } else if (c && kind === "prompt") {
          const prev = c.prompt;
          c.prompt = ta.value;
          scheduleCutFieldSave(id, { prompt: ta.value }, { prompt: prev });
        }
        autoSizeFieldTextarea(ta);
      });
    });
    root.querySelectorAll(".gg-prompt-expand-bar").forEach((bar) => {
      bar.addEventListener("mousedown", (e) => e.stopPropagation());
      bar.addEventListener("click", (e) => {
        e.stopPropagation();
        const wrap = bar.closest(".gg-prompt-field-wrap");
        const ta = wrap?.querySelector("textarea");
        const cutId = bar.closest(".gg-cut")?.dataset?.cutId || wrap?.dataset?.cutId;
        if (cutId && ta) openFieldExpandModal(ta, cutId);
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
    if (shouldDeferListPaint({ composing: shotsUi.composing, inlineRenaming: !!shotsUi.inlineRename || !!shotsUi.inlineSceneRename })) {
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
    const listMode = normalizeListMode(shotsUi.listMode);
    const listCaption = listMode === "caption";
    const listPrompt = listMode === "prompt";
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
    root.className = `gg-root gg-shots${listCaption ? " gg-list-caption" : ""}${listPrompt ? " gg-list-prompt" : ""}${CUT_PANEL_ROOT_CLASS}`;
    root.innerHTML = `
      <div class="gg-head">
        <span class="gg-sdk-slot"></span>
        <div class="gg-proj-row">
          <label class="gg-proj-wrap">
            <span class="gg-proj-label">Project:</span>
            <select class="gg-proj" title="Project">${opts}</select>
          </label>
          <button type="button" class="gg-btn gg-new-project-head" title="New Project" aria-label="New Project">+</button>
          <button type="button" class="gg-btn gg-proj-settings" title="Project settings" aria-label="Project settings"${state.pid ? "" : " disabled"}>⚙</button>
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
          <button type="button" class="gg-btn${listMode === "info" ? " gg-on" : ""}" data-mode="info" title="Show cut details">Info</button>
          <button type="button" class="gg-btn${listPrompt ? " gg-on" : ""}" data-mode="prompt" title="Edit prompts per cut">Prompt</button>
          <button type="button" class="gg-btn${listCaption ? " gg-on" : ""}" data-mode="caption" title="Edit dialogue per cut">Caption</button>
        </div>
        ${SHOW_REDO_FILTER ? `<label class="gg-filter-redo" title="Show only cuts marked for redo"><input type="checkbox"${shotsUi.needsRedoOnly ? " checked" : ""}${viewFinal ? " disabled" : ""} /> Show redo cuts only</label>` : ""}
      </div>
      <div class="gg-meta">
        <span class="gg-meta-text">${tl ? `${tl.cuts.length} shots · ${groups.length} scenes · ${fmt(tl.total_sec)}` : ""}</span>
        <button type="button" class="gg-btn gg-history-btn" title="History" aria-label="History" aria-haspopup="dialog" aria-expanded="false">History</button>
      </div>
      <div class="gg-grp-wrap"${viewFinal ? " hidden" : ""}>${listHtml}</div>
      <div class="gg-final-wrap"${viewFinal ? "" : " hidden"}>${viewFinal && tl ? finalCutListHtml(tl) : ""}</div>
      ${SHOW_SEL_BAR ? `<div class="gg-selbar">
        <span class="gg-sel-label"><span class="gg-sel-count">0</span> selected</span>
        <button type="button" class="gg-btn gg-sel-group" disabled>${esc(MAKE_SCENE_LABEL)}</button>
        <button type="button" class="gg-btn gg-sel-ungroup" disabled title="${esc(REMOVE_FROM_SCENE_TIP)}">${esc(REMOVE_FROM_SCENE_LABEL)}</button>
        <button type="button" class="gg-btn gg-sel-x" disabled title="Clear selection">×</button>
      </div>` : ""}
      ${iconRowHtml()}
      <div class="gg-vstrip" role="group" aria-label="Versions"${tl && !viewFinal ? "" : " hidden"}>
        <div class="gg-vs-body">
          <div class="gg-vs-list"></div>
          <button type="button" class="gg-btn gg-vs-newest" hidden title="Back to newest" aria-label="Back to newest">‹</button>
        </div>
        <div class="gg-vs-info" aria-live="polite"></div>
      </div>
      <div class="gg-cutpanel">${!SHOW_CUT_PANEL && SHOW_STATUS_PANEL ? statusPanelShellHtml() : ""}</div>
      <button type="button" class="gg-btn gg-timeline-toggle gg-on" aria-pressed="true" title="Timeline: on (T)">Timeline</button>`;
    const projSel = root.querySelector(".gg-proj");
    projSel?.addEventListener("change", (e) => selectProject(e.target.value));
    root.querySelector(".gg-head")?.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".gg-proj") || e.target.closest(".gg-head")) openProjectContextMenu(e);
    });
    root.querySelector(".gg-proj-settings")?.addEventListener("click", () => openProjectSettingsModal());
    root.querySelector(".gg-new-project-head")?.addEventListener("click", () => openNewProjectModal());
    root.querySelector(".gg-new-project-btn")?.addEventListener("click", () => openNewProjectModal());
    root.querySelector(".gg-cut-add")?.addEventListener("click", () => addLocalCut());
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
    closeHistoryPopover();
    const historyBtn = root.querySelector(".gg-history-btn");
    historyBtn?.addEventListener("mousedown", (e) => e.stopPropagation());
    historyBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleHistoryPopover(e.currentTarget);
    });
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
    root.querySelector(".gg-ai-split")?.addEventListener("click", () => openAiCutSplitModal());
    root.querySelector(".gg-ir-del")?.addEventListener("click", () => void confirmDeleteSelectedCuts());
    root.querySelector(".gg-queue-btn")?.addEventListener("click", () => void queueButtonClick());
    const randomSeedCb = root.querySelector(".gg-random-seed-cb");
    if (randomSeedCb && !randomSeedCb.dataset.bound) {
      randomSeedCb.dataset.bound = "1";
      randomSeedCb.checked = projectRandomSeedOn();
      randomSeedCb.addEventListener("change", () => void persistRandomSeedToProject(randomSeedCb.checked));
    }
    root.querySelectorAll(".gg-queue-mode .gg-qm-seg").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        saveQueueMode(localStorage, btn.dataset.mode);
        syncQueueModeUi(root, btn.dataset.mode);
        updateSelectionBar(root);
      });
    });
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
  const startInlineSceneRename = (titleEl) => {
    const head = titleEl.closest(".gg-grp-head");
    const groupId = titleEl.closest(".gg-grp-sec")?.dataset?.groupId || "";
    if (shotsUi.inlineSceneRename || shotsUi.inlineRename || !head || !canInlineRenameScene({ native: isNativeProject(), groupId })) return;
    const g = (state.timeline?.groups || []).find((x) => x.id === groupId);
    if (!g) return;
    const pid = state.pid;
    const current = g.name || "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = SCENE_HEADER_INPUT_CLASS;
    input.maxLength = SCENE_RENAME_MAX;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = current;
    input.title = "Enter to save, Esc to cancel";
    input.setAttribute("aria-label", "Scene name");
    input.dataset.editing = "1";
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const name = commit && state.pid === pid ? inlineSceneRenameCommitName(current, input.value) : null;
      shotsUi.inlineSceneRename = null;
      if (name !== null) titleEl.textContent = name;
      input.remove();
      titleEl.hidden = false;
      head.classList.remove("gg-grp-renaming");
      if (name !== null) void saveSceneGroupName(groupId, name);
      repaintAfterCompose();
    };
    shotsUi.inlineSceneRename = { groupId, input, finish };
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
    head.classList.add("gg-grp-renaming");
    titleEl.after(input);
    input.focus({ preventScroll: true });
    input.select();
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
    const sceneTitle = e.target.closest?.(".gg-grp-sec[data-group-id] .gg-grp-title");
    if (sceneTitle && root.contains(sceneTitle) && isNativeProject()) {
      e.preventDefault();
      e.stopPropagation();
      startInlineSceneRename(sceneTitle);
      return;
    }
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
  bus.addEventListener("timeline", () => {
    paint();
    paintAllRenderStatus();
  });
  bus.addEventListener("history", () => {
    const list = root.querySelector(".gg-history-list");
    if (list) fillHistoryList(list);
  });
  const onUseAi = () => syncAiSplitButton(root);
  bus.addEventListener("cut-split-use-ai", onUseAi);
  bus.addEventListener("template", onTemplate);
  bus.addEventListener("select", onSel);
  bus.addEventListener("gg-opentab", onOpenTab);
  bus.addEventListener("gg-playcut", onPlayCut);
  bus.addEventListener("sdk", () => {
    paintPanel();
    paintAllRenderStatus();
  });
  paint();
  if (!state.projects.length) loadProjects();
  refreshProjectTemplateFlag();
  refreshCutSplitUseAi();
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
      const overStrip = !!root.querySelector(".gg-vstrip:hover");
      if (overStrip && isNativeProject() && state.timeline) {
        const c = state.timeline.cuts.find((x) => x.id === state.cutId) || null;
        const vid = stripSelectedVersionId(c);
        if (c && vid) {
          handled();
          if (!e.repeat) void deleteVersion(c.id, vid);
          return;
        }
      }
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
        void addLocalCut();
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
    selectAllListCuts();
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
    closeHistoryPopover();
    shotsUi.inlineRename?.finish(true);
    shotsUi.inlineSceneRename?.finish(true);
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
    bus.removeEventListener("cut-split-use-ai", onUseAi);
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
  scrubbing: false,
  scrubResumePlay: false,
  tlResizing: false,
};
const play = { on: false, t: 0, idx: -1, raf: 0, last: 0, gen: 0, tickGen: 0 };

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
function recordTimelineUndo(before, label = "Edit timeline") {
  if (!before || !state.timeline || historyApplying) return;
  if (sameSnapshot(before, snapshotTimelineEdit(state.timeline))) return;
  recordProjectStep(state.pid, { label, scope: "timeline", entry: before });
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
    clips: Object.fromEntries(clips.map((c) => [c.id, {
      in: c.in,
      sec: c.sec,
      pick: c.pick || null,
      ...(isNativeProject() ? { display: c.display || null } : {}),
      ...(free ? { start: c.start } : {}),
    }])),
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
      if (adoptMutationTimeline(data, tl.project.id)) recordTimelineUndo(before, "Reset timeline");
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
    if (i !== play.idx) pauseAllTimelineMedia(viewer, viewer?.box);
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
      refreshEditPreviewStill(null);
      return;
    }
    const dispNum = cutDisplayLabel(c, computeCutLabels(state.timeline));
    label.textContent = `${dispNum} ${c.name}`;
    if (playsAsVideo(c.media)) {
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
  if (c && playsAsVideo(c.media)) {
    vid.muted = !ed.sound;
    const want = c.in + local;
    try {
      if (vid.readyState >= 1) {
        const baseSync = {
          want,
          current: vid.currentTime || 0,
          duration: vid.duration,
          playing: play.on,
          paused: vid.paused,
          seeking: vid.seeking,
          readyState: vid.readyState,
          lastSeekAt: vid._ggSeekAt || 0,
          now: performance.now(),
        };
        const sync = ed.scrubbing
          ? (decideVideoSyncScrub({ ...baseSync, scrubbing: true }) || decideVideoSync(baseSync))
          : decideVideoSync(baseSync);
        if (sync.seekTo != null) {
          vid.currentTime = sync.seekTo;
          vid._ggSeekAt = performance.now();
        }
        if (sync.pause) vid.pause();
        if (sync.play) scheduleVideoPlay(vid, play.gen, play);
        if ((!play.on || ed.scrubbing) && !vid.seeking && vid.readyState >= 2) {
          setPreviewFrameIndex(videoPreviewFrameIndex(vid.currentTime));
        }
      } else if (!vid._ggWait) {
        // One wait listener per src; cleared on error/emptied/abort (wireViewerMedia).
        vid._ggWait = true;
        const metaGen = play.gen;
        const onMeta = () => {
          vid._ggWait = false;
          guardResolvedPlay(vid, metaGen, play);
          showFrame();
        };
        vid.addEventListener("loadedmetadata", onMeta, { once: true });
      }
    } catch (_) {}
    if (play.on && !ed.scrubbing && viewer?.box) viewer.box.dataset.ggFrame = "";
  }
  syncAnimatedStill(c, local);
  if (c && isAnimatedImage(c.media)) {
    const cache = animScrubBytesCache.get(mediaUrl(c.media.id));
    const idx = computeScrubFrameIndex(c, local, cache?.ready ? cache : null);
    if (idx != null) setPreviewFrameIndex(idx);
  }
  paintHead();
  refreshEditPreviewStill(c);
}

const animScrubBytesCache = new Map();
let animScrubPaintGen = 0;

function setPreviewFrameIndex(frameIndex) {
  if (!viewer?.box) return;
  viewer.box.dataset.ggFrame = previewFrameAttr(frameIndex);
}

function scrubFrameCount(c) {
  const n = Number(c?.media?.frames);
  if (n > 0) return n | 0;
  return 0;
}

function scrubMetaForFrameIndex(c, local, cache) {
  return {
    localSec: local,
    clipIn: c.in,
    clipSec: c.sec,
    sourceSeconds: c.media?.seconds,
    srcDur: c.src_dur,
    mediaFrames: scrubFrameCount(c),
    cacheFrameCount: cache?.frameCount,
    durationsMs: cache?.durationsMs ?? cache?.parsed?.durationsMs,
  };
}

function computeScrubFrameIndex(c, local, cache) {
  if (!c || !isAnimatedImage(c.media)) return null;
  return animatedScrubFrameIndex(scrubMetaForFrameIndex(c, local, cache));
}

async function ensureAnimScrubCache(url, c) {
  let cache = animScrubBytesCache.get(url);
  if (cache?.ready) return cache;
  if (!cache) {
    cache = {
      buf: null,
      parsed: null,
      decoder: null,
      frameCount: scrubFrameCount(c),
      durationsMs: null,
      ready: false,
      loading: null,
    };
    animScrubBytesCache.set(url, cache);
  }
  if (!cache.loading) {
    cache.loading = (async () => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      cache.buf = buf;
      cache.parsed = parseAnimatedWebp(buf);
      if (cache.parsed) {
        cache.durationsMs = cache.parsed.durationsMs;
        if (!cache.frameCount) cache.frameCount = cache.parsed.frames;
      }
      if (typeof ImageDecoder !== "undefined") {
        try {
          cache.decoder = new ImageDecoder({ data: buf, type: "image/webp" });
          await cache.decoder.completed;
          const n = cache.decoder.tracks?.selectedTrack?.frameCount;
          if (n > 0) cache.frameCount = n;
        } catch (_) {
          cache.decoder = null;
        }
      }
      if (!cache.frameCount && cache.parsed) cache.frameCount = cache.parsed.frames;
      cache.ready = true;
    })();
  }
  await cache.loading;
  return cache;
}

async function decodeAnimatedScrubFrame(cache, frameIdx) {
  const frameCount = Math.max(1, cache.frameCount || cache.parsed?.frames || 1);
  const idx = Math.min(frameCount - 1, Math.max(0, frameIdx | 0));
  if (cache.decoder) {
    const result = await cache.decoder.decode({ frameIndex: idx });
    try {
      return { bmp: await createImageBitmap(result.image), frameIdx: idx };
    } finally {
      result.image.close?.();
    }
  }
  const bytes = cache.parsed?.frameWebps?.[idx] ?? animatedWebpFrameBytes(cache.buf, idx);
  if (!bytes) throw new Error("frame unavailable");
  const bmp = await createImageBitmap(new Blob([bytes], { type: "image/webp" }));
  return { bmp, frameIdx: idx };
}

async function paintAnimatedScrubFrame(c, local) {
  if (!viewer?.still || !c?.media || !isAnimatedImage(c.media)) return;
  const url = mediaUrl(c.media.id);
  let cache = animScrubBytesCache.get(url);
  const idxEarly = computeScrubFrameIndex(c, local, cache?.ready ? cache : null);
  const { still } = viewer;
  if (idxEarly != null) {
    const key = `${url}#${idxEarly}`;
    if (still._ggKey === key && !still.hidden) {
      setPreviewFrameIndex(idxEarly);
      mirrorEditPreviewFrame(still, idxEarly);
      return;
    }
  }
  const gen = ++animScrubPaintGen;
  try {
    cache = await ensureAnimScrubCache(url, c);
    if (gen !== animScrubPaintGen || !viewer) return;
    const idx = computeScrubFrameIndex(c, local, cache);
    if (idx == null) return;
    const key = `${url}#${idx}`;
    if (still._ggKey === key && !still.hidden) {
      setPreviewFrameIndex(idx);
      mirrorEditPreviewFrame(still, idx);
      return;
    }
    const { bmp, frameIdx } = await decodeAnimatedScrubFrame(cache, idx);
    if (gen !== animScrubPaintGen || !viewer) {
      bmp.close?.();
      return;
    }
    still.width = bmp.width;
    still.height = bmp.height;
    still.getContext("2d").drawImage(bmp, 0, 0);
    still.hidden = false;
    still._ggKey = key;
    mirrorEditPreviewFrame(still, frameIdx);
    bmp.close?.();
    setPreviewFrameIndex(frameIdx);
  } catch (_) {}
}

/** Animated WebP/GIF clips: playhead-synced decoded frame on canvas (paused, scrub, playback). */
function syncAnimatedStill(c, local) {
  if (!viewer || !viewer.still) return;
  const { img, still } = viewer;
  const mode = animatedViewerMode(c && c.media, play.on, viewer.mode === "export", ed.scrubbing);
  if (mode !== "canvas") {
    if (!still.hidden) still.hidden = true;
    still._ggKey = "";
    setPreviewFrameIndex(null);
    return;
  }
  img.hidden = true;
  paintAnimatedScrubFrame(c, local);
}

/** Copy the timeline's decoded frame onto the Edit overlay. The in-panel canvas is display:none in Edit mode. */
function mirrorEditPreviewFrame(still, frameIdx) {
  if (!timelineEditModeOn || !still || still.width < 1 || still.height < 1) return;
  const el = document.querySelector(".gg-edit-preview");
  const canvas = el?.querySelector(".gg-edit-preview-still");
  if (!el || !canvas || el.dataset.previewMode !== "frames") return;
  canvas.width = still.width;
  canvas.height = still.height;
  canvas.getContext("2d").drawImage(still, 0, 0);
  canvas.hidden = false;
  const img = el.querySelector("img");
  if (img) img.hidden = true;
  const vid = el.querySelector("video");
  if (vid) vid.hidden = true;
  el.dataset.previewReady = "1";
  if (frameIdx != null) el.dataset.ggFrame = previewFrameAttr(frameIdx);
}

function preloadNext(i) {
  const c = trackClips()[i];
  if (!viewer || !c || !c.media) return;
  const url = mediaUrl(c.media.id);
  if (playsAsVideo(c.media)) {
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
  vid.addEventListener("seeked", () => {
    if (!viewer || viewer.vid !== vid) return;
    const cuts = trackClips();
    const { i } = itemAt(play.t);
    const c = cuts[i];
    if (c && playsAsVideo(c.media)) {
      setPreviewFrameIndex(videoPreviewFrameIndex(vid.currentTime));
    }
    showFrame();
  });
  if (next && !next._ggMediaWired) {
    next._ggMediaWired = true;
    next.addEventListener("error", () => { next._ggWait = false; });
    next.addEventListener("emptied", () => { next._ggWait = false; });
    next.addEventListener("abort", () => { next._ggWait = false; });
  }
}

function paintPlayTransport() {
  document.querySelectorAll(".gg-timeline .gg-play-btn").forEach((b) => {
    b.textContent = play.on ? "❚❚" : "▶";
    b.title = play.on ? "Pause (Space)" : "Play (Space)";
  });
}

function paintHead() {
  if (!document.querySelector(".gg-timeline")?.isConnected) return;
  const total = totalSec();
  document.querySelectorAll(".gg-timeline .gg-head-line").forEach((h) => { h.style.left = play.t * ed.px + "px"; });
  document.querySelectorAll(".gg-timeline .gg-clock").forEach((el) => { el.textContent = `${fmtClock(play.t)} / ${fmtClock(total)}`; });
  if (!ed.scrubbing) paintPlayTransport();
  if (play.on && !ed.scrubbing) {
    const wrap = document.querySelector(".gg-timeline .gg-tl-scroll");
    if (wrap) {
      const next = followPlayheadScroll({
        headX: play.t * ed.px + (parseFloat(getComputedStyle(wrap).paddingLeft) || 0),
        scrollLeft: wrap.scrollLeft,
        viewW: wrap.clientWidth,
        maxScroll: wrap.scrollWidth - wrap.clientWidth,
      });
      if (next != null) wrap.scrollLeft = next;
    }
  }
}

function tick(now) {
  if (!tickIsCurrent(play, play.tickGen) || ed.scrubbing) return;
  const dt = Math.min(0.25, (now - play.last) / 1000);
  play.last = now;
  play.t += dt;
  const total = totalSec();
  if (play.t >= total) { play.t = total; stopPlay(); showFrame(); return; }
  showFrame();
  if (play.on) play.raf = requestAnimationFrame(tick);
}

function leaveExportView() {
  if (!viewer || viewer.mode !== "export") return;
  viewer.mode = "";
  viewer.vid.controls = false;
  pauseAllTimelineMedia(viewer, viewer.box);
  viewer.vid.dataset.src = "";
  viewer.vid._ggSeekAt = 0;
  play.idx = -1;
}

function startPlay() {
  if (!cutsNow().length) return;
  leaveExportView();
  if (play.t >= totalSec() - 0.05) play.t = 0;
  if (play.raf) cancelAnimationFrame(play.raf);
  bumpPlaybackGen(play);
  play.tickGen = play.gen;
  play.on = true;
  play.last = performance.now();
  showFrame(true);
  play.raf = requestAnimationFrame(tick);
}

function stopPlay() {
  bumpPlaybackGen(play);
  play.on = false;
  if (play.raf) cancelAnimationFrame(play.raf);
  play.raf = 0;
  pauseAllTimelineMedia(viewer, null);
  document.querySelectorAll(".gg-timeline").forEach((r) => pauseAllTimelineMedia(null, r));
  showFrame(true);
  paintHead();
}

function togglePlay() { play.on ? stopPlay() : startPlay(); }

function seek(t, opts) {
  leaveExportView();
  const scrubbing = !!opts?.scrubbing;
  if (play.on && !scrubbing) stopPlay();
  play.t = Math.max(0, Math.min(totalSec(), t));
  play.last = performance.now();
  showFrame();
}

function timelineInnerLeft(root) {
  const inner = root.querySelector(".gg-tl-inner");
  return inner?.getBoundingClientRect().left ?? 0;
}

function clipPointerIsPlayheadScrub(root, clientX) {
  return (
    routeTimelineClipPointerDown({
      clientX,
      innerLeft: timelineInnerLeft(root),
      playheadSec: play.t,
      px: ed.px,
    }) === "scrub"
  );
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
        refreshCutRowBadges(c.id);
        if (state.cutId === c.id) paintStatusPanel(document.querySelector(".gg-shots .gg-cutpanel"));
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
          recordTimelineUndo(before, "Trim");
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
      if (clipPointerIsPlayheadScrub(root, e.clientX)) return;
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
          recordTimelineUndo(before, "Reorder clips");
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
      if (clipPointerIsPlayheadScrub(root, e.clientX)) return;
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
          recordTimelineUndo(before, "Move clip");
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

function graphWorkAreaElement() {
  return (
    document.querySelector("#graph-canvas-container") ||
    document.querySelector("#graph-canvas") ||
    document.querySelector("canvas[data-lgraphcanvas]")
  );
}

function editPreviewBox(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

/** Bottom of the graph's top toolbar row (Run, workflow tabs, right-docker buttons). */
function measureEditPreviewToolbarBottom(graphRect) {
  if (!graphRect) return null;
  let bottom = null;
  const consider = (el) => {
    if (!el || el === document.body || el === document.documentElement) return;
    const r = el.getBoundingClientRect();
    if (r.height < 8 || r.height > 88 || r.width < 8) return;
    if (r.bottom < graphRect.top - 8) return;
    if (r.top > graphRect.top + 120) return;
    if (r.bottom > graphRect.bottom - 80) return;
    bottom = bottom == null ? r.bottom : Math.max(bottom, r.bottom);
  };
  const wfTab = document.querySelector('[data-testid="workflow-tab"]');
  if (wfTab) {
    consider(wfTab);
    consider(wfTab.closest("header"));
    consider(wfTab.parentElement);
  }
  for (const el of document.querySelectorAll("button")) {
    const aria = (el.getAttribute("aria-label") || el.title || "").trim();
    const text = (el.textContent || "").trim();
    const isRun = /^run$/i.test(text) || /^run$/i.test(aria) || (/^run\b/i.test(text) && text.length <= 24);
    if (!isRun && !/toggle properties panel|workflow overview/i.test(aria)) continue;
    consider(el);
    consider(el.parentElement);
  }
  return bottom;
}

/** Open left/right side panels that the preview must stay inside. */
function measureEditPreviewSides(graphRect) {
  let left = null;
  let right = null;
  if (!graphRect) return { left, right };
  const mid = graphRect.left + graphRect.width * 0.5;
  for (const pane of document.querySelectorAll(".p-splitterpanel")) {
    const r = pane.getBoundingClientRect();
    if (r.width < 48 || r.width > 560 || r.height < 64) continue;
    if (r.bottom < graphRect.top + 24 || r.top > graphRect.bottom - 24) continue;
    if (r.right <= mid && r.right > graphRect.left - 4) {
      left = left == null ? r.right : Math.max(left, r.right);
    } else if (r.left >= mid - 4 && r.left < graphRect.right + 8) {
      right = right == null ? r.left : Math.min(right, r.left);
    }
  }
  const shots = document.querySelector(".gg-root.gg-shots");
  if (shots) {
    const r = shots.getBoundingClientRect();
    if (r.width > 8 && r.height > 8) left = left == null ? r.right : Math.max(left, r.right);
  }
  return { left, right };
}

/** Left edge of a right docker strip that hangs below the toolbar. Toolbar buttons are ignored. */
function measureRightDockerLeft(graphRect, toolbarBottom) {
  if (!graphRect) return null;
  const barBottom = Number.isFinite(Number(toolbarBottom)) ? Number(toolbarBottom) : graphRect.top;
  let edge = null;
  for (const el of document.querySelectorAll("button")) {
    const aria = `${el.getAttribute("aria-label") || ""} ${el.title || ""}`;
    if (!/toggle properties panel|workflow overview/i.test(aria)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.bottom <= barBottom + 6) continue;
    if (r.left < graphRect.left + graphRect.width * 0.45) continue;
    edge = edge == null ? r.left : Math.min(edge, r.left);
  }
  return edge;
}

function currentEditPreviewCut() {
  const cuts = trackClips();
  const { i } = itemAt(play.t);
  if (cuts[i]) return cuts[i];
  if (state.cutId) return cuts.find((c) => c.id === state.cutId) || null;
  return null;
}

function paintEditPreviewButton() {
  document.querySelectorAll(".gg-timeline .gg-edit-mode").forEach((btn) => {
    btn.classList.toggle("gg-on", timelineEditModeOn);
    btn.setAttribute("aria-pressed", timelineEditModeOn ? "true" : "false");
  });
}

function ensureEditPreviewEl() {
  let el = document.querySelector(".gg-edit-preview");
  if (!el) {
    el = document.createElement("div");
    el.className = "gg-edit-preview";
    el.setAttribute("role", "img");
    el.innerHTML = `<img alt="" /><video class="gg-edit-preview-vid" playsinline muted preload="auto" hidden></video><canvas class="gg-edit-preview-still" hidden></canvas><div class="gg-edit-preview-label"></div><div class="gg-edit-preview-empty" hidden></div>`;
    document.body.appendChild(el);
  } else if (!el.querySelector("video")) {
    const vid = document.createElement("video");
    vid.className = "gg-edit-preview-vid";
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "auto";
    vid.hidden = true;
    el.querySelector("img")?.after(vid);
  }
  if (el && !el.querySelector(".gg-edit-preview-still")) {
    const canvas = document.createElement("canvas");
    canvas.className = "gg-edit-preview-still";
    canvas.hidden = true;
    (el.querySelector("video") || el.querySelector("img"))?.after(canvas);
  }
  return el;
}

/** Playhead time inside `cut` when the playhead is on that cut; otherwise the cut in-point. */
function editPreviewPlayheadTiming(cut) {
  const { i, local } = itemAt(play.t);
  const at = trackClips()[i];
  if (cut && at && String(cut.id) === String(at.id)) {
    return { clipIn: Number(cut.in) || 0, localSec: local };
  }
  return { clipIn: Number(cut?.in) || 0, localSec: 0 };
}

function clearEditPreviewVideo(vid) {
  if (!vid) return;
  try { vid.pause(); } catch (_) {}
  vid.hidden = true;
  vid._ggWant = null;
  vid._ggWait = false;
  vid._ggSeekAt = 0;
  vid._ggGen = (vid._ggGen | 0) + 1;
  vid._ggSeekGen = -1;
  vid.removeAttribute("src");
  try { vid.load(); } catch (_) {}
  delete vid.dataset.src;
}

function showEditPreviewVideoFrame(el, vid) {
  vid.hidden = false;
  el.dataset.previewReady = "1";
  const empty = el.querySelector(".gg-edit-preview-empty");
  if (empty) empty.hidden = true;
}

function wireEditPreviewVideo(vid) {
  if (!vid || vid._ggEditWired) return;
  vid._ggEditWired = true;
  vid.addEventListener("seeked", () => {
    const box = vid.closest(".gg-edit-preview");
    if (!box || box.dataset.previewMode !== "video") return;
    if (vid.dataset.src !== box.dataset.previewUrl) return;
    if ((vid._ggSeekGen | 0) !== (vid._ggGen | 0)) return;
    showEditPreviewVideoFrame(box, vid);
  });
  vid.addEventListener("error", () => {
    vid._ggWait = false;
    const box = vid.closest(".gg-edit-preview");
    if (!box || box.dataset.previewMode !== "video") return;
    if (!vid.dataset.src || vid.dataset.src !== box.dataset.previewUrl) return;
    vid.hidden = true;
    box.dataset.previewReady = "0";
    const empty = box.querySelector(".gg-edit-preview-empty");
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Video failed to load";
    }
  });
  vid.addEventListener("emptied", () => { vid._ggWait = false; });
  vid.addEventListener("abort", () => { vid._ggWait = false; });
}

/** Seek or play the overlay video so its picture matches the playhead. Muted: the timeline viewer owns sound. */
function followEditPreviewVideo(el, vid) {
  const want = Number(vid._ggWant) || 0;
  const baseSync = {
    want,
    current: vid.currentTime || 0,
    duration: vid.duration,
    playing: !!play.on,
    paused: vid.paused,
    seeking: vid.seeking,
    readyState: vid.readyState,
    lastSeekAt: vid._ggSeekAt || 0,
    now: performance.now(),
  };
  const sync = ed.scrubbing
    ? (decideVideoSyncScrub({ ...baseSync, scrubbing: true }) || decideVideoSync(baseSync))
    : decideVideoSync(baseSync);
  if (sync.seekTo != null) {
    try {
      vid._ggSeekGen = vid._ggGen | 0;
      vid.currentTime = sync.seekTo;
      vid._ggSeekAt = performance.now();
    } catch (_) {}
  }
  if (sync.pause) {
    try { vid.pause(); } catch (_) {}
  }
  if (sync.play) scheduleVideoPlay(vid, play.gen, play);
  if (sync.seekTo == null && vid.readyState >= 2 && !vid.seeking) {
    showEditPreviewVideoFrame(el, vid);
  }
}

function applyEditPreviewVideo(el, vid, plan) {
  wireEditPreviewVideo(vid);
  vid.muted = true;
  const img = el.querySelector("img");
  if (img) {
    img.hidden = true;
    if (img.getAttribute("src")) {
      img.removeAttribute("src");
      delete img.dataset.src;
    }
  }
  const empty = el.querySelector(".gg-edit-preview-empty");
  if (empty && empty.textContent) {
    empty.hidden = true;
    empty.textContent = "";
  }
  if (plan.clearPrevious) {
    try { vid.pause(); } catch (_) {}
    vid.hidden = true;
    vid._ggWait = false;
    vid._ggSeekAt = 0;
    vid.removeAttribute("src");
    delete vid.dataset.src;
  }
  vid._ggWant = plan.want;
  const url = plan.url;
  if (!url) {
    vid.hidden = true;
    el.dataset.previewReady = "0";
    el.dataset.ggFrame = "";
    return;
  }
  const reveal = () => {
    if (el.dataset.previewMode !== "video") return;
    if (vid.dataset.src !== el.dataset.previewUrl) return;
    followEditPreviewVideo(el, vid);
  };
  if (plan.clearPrevious || vid.dataset.src !== url) {
    vid.hidden = true;
    el.dataset.previewReady = "0";
    vid._ggGen = (vid._ggGen | 0) + 1;
    const gen = vid._ggGen;
    vid._ggSeekGen = -1;
    vid.dataset.src = url;
    vid._ggSeekAt = 0;
    let revealed = false;
    const onData = () => {
      if (revealed || vid._ggGen !== gen) return;
      revealed = true;
      vid._ggWait = false;
      reveal();
    };
    vid.addEventListener("loadeddata", onData, { once: true });
    vid.src = url;
    if (vid.readyState >= 2) onData();
  } else {
    reveal();
  }
  el.dataset.ggFrame = previewFrameAttr(plan.frame);
}

function refreshEditPreviewStill(cut) {
  if (!timelineEditModeOn) return;
  const el = document.querySelector(".gg-edit-preview");
  if (!el) return;
  const c = cut === undefined ? currentEditPreviewCut() : cut;
  const mediaId = c?.media?.id != null && String(c.media.id) !== "" ? String(c.media.id) : "";
  const timing = editPreviewPlayheadTiming(c);
  const plan = editPreviewAtPlayhead(
    {
      mode: el.dataset.previewMode || "",
      cutId: el.dataset.previewCut || "",
      mediaId: el.dataset.previewMedia || "",
      url: el.dataset.previewUrl || "",
      loaded: el.dataset.previewReady === "1",
    },
    {
      cutId: c?.id != null ? String(c.id) : "",
      media: c?.media || null,
      url: mediaId ? mediaUrl(mediaId) : "",
      posterUrl: mediaId ? posterUrl(mediaId) : "",
      clipIn: timing.clipIn,
      localSec: timing.localSec,
    },
  );
  const img = el.querySelector("img");
  const vid = el.querySelector("video");
  const label = el.querySelector(".gg-edit-preview-label");
  const empty = el.querySelector(".gg-edit-preview-empty");
  const labels = computeCutLabels(state.timeline || { cuts: [] });
  const name = c ? `${cutDisplayLabel(c, labels)} ${c.name || ""}`.trim() : "";
  if (label && label.textContent !== name) label.textContent = name;
  const aria = name ? `Edit preview, ${name}` : "Edit preview";
  if (el.getAttribute("aria-label") !== aria) el.setAttribute("aria-label", aria);
  el.dataset.previewMode = plan.mode === "video" || plan.mode === "frames" ? plan.mode : (plan.showEmpty ? "empty" : "still");
  el.dataset.previewCut = plan.cutId;
  el.dataset.previewMedia = plan.mediaId;
  el.dataset.previewUrl = plan.url;
  const frameCanvas = el.querySelector(".gg-edit-preview-still");
  if (frameCanvas && plan.mode !== "frames") frameCanvas.hidden = true;
  if (plan.mode === "frames") {
    if (img) img.hidden = true;
    if (plan.hideVideo) clearEditPreviewVideo(vid);
    else if (vid) {
      try { vid.pause(); } catch (_) {}
      vid.hidden = true;
    }
    if (empty) empty.hidden = true;
    if (frameCanvas) frameCanvas.hidden = false;
    const still = viewer?.still;
    const key = String(still?._ggKey || "");
    if (still && plan.url && key.startsWith(plan.url + "#")) mirrorEditPreviewFrame(still, null);
    return;
  }
  if (plan.mode === "video" && vid) {
    if (plan.changed) editPreviewLoadToken += 1;
    applyEditPreviewVideo(el, vid, plan);
    return;
  }
  if (plan.hideVideo) clearEditPreviewVideo(vid);
  else if (vid) vid.hidden = true;
  el.dataset.ggFrame = "";
  if (!img || !empty) return;
  if (plan.showImage) {
    el.dataset.previewReady = "1";
    img.hidden = false;
    empty.hidden = true;
    return;
  }
  // Hide first so the previous bitmap cannot stay on screen while the new still loads.
  el.dataset.previewReady = "0";
  img.hidden = true;
  if (plan.showEmpty) {
    empty.hidden = false;
    empty.textContent = c ? noMediaText(cutDisplayLabel(c, labels), c.name) : "";
  } else {
    empty.hidden = true;
    empty.textContent = "";
  }
  if (!plan.srcSteps.length) return;
  const token = ++editPreviewLoadToken;
  let assigned = "";
  for (const step of plan.srcSteps) {
    if (step === "clear") {
      img.removeAttribute("src");
      delete img.dataset.src;
    } else {
      assigned = step;
    }
  }
  if (!assigned) return;
  img.alt = name;
  img.dataset.src = assigned;
  const reveal = () => {
    if (token !== editPreviewLoadToken) return;
    if (el.dataset.previewMode === "video") return;
    if (img.dataset.src !== assigned) return;
    if (el.dataset.previewUrl !== assigned) return;
    el.dataset.previewReady = "1";
    img.hidden = false;
    empty.hidden = true;
  };
  img.addEventListener("load", reveal, { once: true });
  img.src = assigned;
  if (img.complete && img.naturalWidth > 0) reveal();
}

function bindEditPreviewObserver() {
  if (!window.ResizeObserver) return;
  if (!editPreviewObserver) {
    editPreviewObserver = new ResizeObserver(() => {
      if (timelineEditModeOn) scheduleEditPreviewLayout();
    });
  }
  const watch = (el) => { if (el) editPreviewObserver.observe(el); };
  watch(graphWorkAreaElement());
  watch(document.querySelector(".bottom-panel"));
  watch(document.querySelector(".gg-root.gg-shots"));
  for (const pane of document.querySelectorAll(".p-splitterpanel")) watch(pane);
  const wfTab = document.querySelector('[data-testid="workflow-tab"]');
  watch(wfTab?.closest("header"));
  watch(wfTab?.parentElement);
}

function unbindEditPreviewObserver() {
  editPreviewObserver?.disconnect();
  editPreviewObserver = null;
}

function applyEditPreviewLayout() {
  document.documentElement.classList.toggle(EDIT_MODE_ON_CLASS, !!timelineEditModeOn);
  if (!timelineEditModeOn || !isTimelinePanelOpen()) {
    document.querySelector(".gg-edit-preview")?.remove();
    return;
  }
  const graph = editPreviewBox(graphWorkAreaElement());
  const panel = document.querySelector(".bottom-panel");
  const panelBox = panel?.getBoundingClientRect();
  if (!graph || !panelBox || panelBox.height < 8) {
    document.querySelector(".gg-edit-preview")?.remove();
    return;
  }
  const toolbarBottom = measureEditPreviewToolbarBottom(graph);
  const sides = measureEditPreviewSides(graph);
  const rect = editPreviewOverlayRect({
    graphRect: graph,
    toolbarBottom,
    shotsRect: sides.left != null ? { right: sides.left, width: 100 } : null,
    rightPanelLeft: sides.right,
    rightDockerLeft: measureRightDockerLeft(graph, toolbarBottom ?? graph.top),
    bottomPanelTop: panelBox.top,
  });
  if (!rect) {
    document.querySelector(".gg-edit-preview")?.remove();
    return;
  }
  const el = ensureEditPreviewEl();
  if (!el) return;
  el.style.left = `${Math.round(rect.left)}px`;
  el.style.top = `${Math.round(rect.top)}px`;
  el.style.width = `${Math.round(rect.width)}px`;
  el.style.height = `${Math.round(rect.height)}px`;
  refreshEditPreviewStill();
  bindEditPreviewObserver();
}

function scheduleEditPreviewLayout() {
  cancelAnimationFrame(editPreviewLayoutRaf);
  editPreviewLayoutRaf = requestAnimationFrame(() => {
    editPreviewLayoutRaf = 0;
    applyEditPreviewLayout();
  });
}

function setTimelineEditMode(on) {
  timelineEditModeOn = !!on;
  saveEditPreviewMode(localStorage, timelineEditModeOn);
  document.documentElement.classList.toggle(EDIT_MODE_ON_CLASS, timelineEditModeOn);
  paintEditPreviewButton();
  applyEditModeTimelineRow();
  if (timelineEditModeOn) {
    bindEditPreviewObserver();
    applyEditPreviewLayout();
  } else {
    unbindEditPreviewObserver();
    document.querySelector(".gg-edit-preview")?.remove();
  }
}

if (!globalThis.__ggEditPreviewResize) {
  globalThis.__ggEditPreviewResize = true;
  window.addEventListener("resize", () => {
    if (timelineEditModeOn) scheduleEditPreviewLayout();
  });
}

function mountExport(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "gg-root gg-export-panel";
  el.appendChild(root);
  root.innerHTML = `
    <div class="gg-export-tools">
      <span class="gg-export-title">Timeline mp4</span>
      <select class="gg-ex-preset" title="Export size">
        <option value="480p">480p</option><option value="720p" selected>720p</option><option value="1080p">1080p</option>
      </select>
      <label class="gg-ex-snd" title="Include clip audio (silence for stills)"><input type="checkbox" class="gg-ex-sound" checked /> audio</label>
      <button type="button" class="gg-btn gg-export gg-primary" title="Render the timeline to one mp4 (CPU, ffmpeg)">Export mp4</button>
    </div>
    <div class="gg-ex-out">
      <span class="gg-ex-out-label">Output folder</span>
      <span class="gg-ex-out-path"></span>
      <button type="button" class="gg-btn gg-ex-out-browse" title="Choose where Export mp4 saves files">Browse…</button>
      <button type="button" class="gg-btn gg-ex-show-folder" title="Show the output folder in Explorer">Show in folder</button>
    </div>
    <p class="gg-ex-out-err gg-modal-hint gg-split-err" aria-live="polite"></p>
    <div class="gg-ex-row" hidden>
      <div class="gg-ex-bar"><div class="gg-ex-fill"></div></div>
      <span class="gg-ex-text"></span>
      <button type="button" class="gg-btn gg-ex-cancel">Cancel</button>
      <button type="button" class="gg-btn gg-ex-play" disabled title="Export an mp4 first">${EXPORT_PLAY_LABEL}</button>
      <button type="button" class="gg-btn gg-ex-folder" disabled title="Export an mp4 first">${EXPORT_FOLDER_LABEL}</button>
      <span class="gg-ex-path" title="Click to copy path"></span>
      <button type="button" class="gg-btn gg-ex-close" title="Hide">×</button>
    </div>`;
  const $r = (q) => root.querySelector(q);
  $r(".gg-export").addEventListener("click", () => startExport($r(".gg-ex-preset").value, $r(".gg-ex-sound").checked));
  $r(".gg-ex-out-browse").addEventListener("click", () => {
    openFolderPicker(exp.exportFolder || exp.outputPath || "", (path) => { void saveExportFolder(path); });
  });
  $r(".gg-ex-show-folder").addEventListener("click", () => { void showExportOutputFolder(); });
  $r(".gg-ex-cancel").addEventListener("click", cancelExport);
  $r(".gg-ex-play").addEventListener("click", () => { if (exp.job?.status === "done") showExport(exp.job); });
  $r(".gg-ex-folder").addEventListener("click", () => { void showExportOutputFolder(true); });
  $r(".gg-ex-close").addEventListener("click", () => { exp.hidden = true; paintExport(); });
  $r(".gg-ex-path").addEventListener("click", (e) => { navigator.clipboard?.writeText(e.target.textContent).catch(() => {}); });
  paintExportPanelLocks();
  paintExport();
  void refreshExport();
  void refreshExportOutputPath();
  return () => {};
}

function mountTimeline(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "gg-root gg-timeline";
  root.tabIndex = -1;
  const timelineBodyPx = fixedTimelineBodyHeight();
  root.style.height = `${timelineBodyPx}px`;
  root.style.minHeight = `${timelineBodyPx}px`;
  root.style.maxHeight = `${timelineBodyPx}px`;
  root.style.flex = "0 0 auto";
  el.appendChild(root);
  root.innerHTML = `
    <div class="gg-tl-main">
    <div class="gg-viewer">
      <div class="gg-screen">
        <img class="gg-v-img" alt="" hidden />
        <canvas class="gg-v-still" hidden></canvas>
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
        <button type="button" class="gg-btn gg-edit-mode" title="Current cut over the graph. Video follows the playhead." aria-pressed="false">${EDIT_MODE_LABEL}</button>
        <button class="gg-btn gg-snap" title="Snap: 1 s steps (off = 0.1 s)">Snap</button>
        <button class="gg-btn gg-reset" title="Reset to original order and lengths">Reset</button>
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
    </div>
    </div>`;
  viewer = {
    box: root,
    img: root.querySelector(".gg-v-img"),
    still: root.querySelector(".gg-v-still"),
    vid: root.querySelector(".gg-v-vid"),
    next: root.querySelector(".gg-v-next"),
    blank: root.querySelector(".gg-v-blank"),
    label: root.querySelector(".gg-v-label"),
    caption: root.querySelector(".gg-v-cap"),
  };
  wireViewerMedia(viewer.vid, viewer.next, viewer.blank, viewer.img);
  {
    const v = viewer;
    registerTimelineMedia(v.vid);
    registerTimelineMedia(v.next);
    guardMediaWithTransport(v.vid, play, () => viewer === v && v.mode === "export");
    guardMediaWithTransport(v.next, play, () => false);
  }
  const $r = (q) => root.querySelector(q);
  const paintButtons = () => {
    $r(".gg-snap").classList.toggle("gg-on", ed.snap);
    $r(".gg-sound").textContent = ed.sound ? "🔊" : "🔇";
    $r(".gg-sound").classList.toggle("gg-on", ed.sound);
    paintEditPreviewButton();
  };
  $r(".gg-play-btn").addEventListener("click", togglePlay);
  $r(".gg-sound").addEventListener("click", () => { ed.sound = !ed.sound; localStorage.setItem("gg.sound", ed.sound ? "1" : "0"); viewer.vid.muted = !ed.sound; paintButtons(); });
  $r(".gg-snap").addEventListener("click", () => { ed.snap = !ed.snap; localStorage.setItem("gg.snap", ed.snap ? "1" : "0"); paintButtons(); });
  $r(".gg-edit-mode")?.addEventListener("click", () => setTimelineEditMode(!timelineEditModeOn));
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
  scheduleRestoreTimelinePanelHeight();
  const beginTimelineScrub = (e) => {
    if (e.button) return;
    e.preventDefault();
    e.stopPropagation();
    const ruler = $r(".gg-ruler");
    if (!ruler) return;
    ed.scrubbing = true;
    ed.scrubResumePlay = play.on;
    if (play.on) {
      bumpPlaybackGen(play);
      play.on = false;
      if (play.raf) cancelAnimationFrame(play.raf);
      play.raf = 0;
      pauseAllTimelineMedia(viewer, viewer?.box);
    }
    const overlay = document.createElement("div");
    overlay.className = "gg-tl-scrub-overlay";
    document.body.appendChild(overlay);
    const secAt = (clientX) => {
      const inner = root.querySelector(".gg-tl-inner");
      return Math.max(0, Math.min(totalSec(), timelineSecFromClientX(clientX, inner, ed.px)));
    };
    // Held near / past an edge of the visible timeline: scroll that way and keep the playhead at the edge.
    const viewX = (clientX) => {
      const r = tlWrap.getBoundingClientRect();
      return Math.max(r.left + tlWrap.clientLeft, Math.min(r.left + tlWrap.clientLeft + tlWrap.clientWidth - 1, clientX));
    };
    const go = (clientX) => {
      seek(secAt(viewX(clientX)), { scrubbing: true });
      paintHead();
    };
    let lastX = e.clientX;
    let edgeRaf = 0;
    let edgeLast = 0;
    const edgeStep = (now) => {
      edgeRaf = 0;
      if (!ed.scrubbing) return;
      const r = tlWrap.getBoundingClientRect();
      const left = r.left + tlWrap.clientLeft;
      const v = edgeScrollSpeed({ x: lastX, left, right: left + tlWrap.clientWidth });
      if (!v) { edgeLast = 0; return; }
      const dt = edgeLast ? Math.min(0.05, (now - edgeLast) / 1000) : 1 / 60;
      edgeLast = now;
      const max = tlWrap.scrollWidth - tlWrap.clientWidth;
      const before = tlWrap.scrollLeft;
      tlWrap.scrollLeft = Math.max(0, Math.min(max, before + v * dt));
      if (tlWrap.scrollLeft !== before) go(lastX);
      edgeRaf = requestAnimationFrame(edgeStep);
    };
    const edgeKick = () => { if (!edgeRaf) edgeRaf = requestAnimationFrame(edgeStep); };
    go(e.clientX);
    const move = (ev) => { lastX = ev.clientX; go(lastX); edgeKick(); };
    const end = (ev) => {
      ed.scrubbing = false;
      if (edgeRaf) cancelAnimationFrame(edgeRaf);
      edgeRaf = 0;
      overlay.removeEventListener("pointermove", move);
      overlay.removeEventListener("pointerup", end);
      overlay.removeEventListener("pointercancel", end);
      try { overlay.releasePointerCapture(ev.pointerId); } catch (_) {}
      overlay.remove();
      const resume = ed.scrubResumePlay;
      ed.scrubResumePlay = false;
      go(ev.clientX || e.clientX);
      paintPlayTransport();
      showFrame(true);
      if (resume) startPlay();
    };
    try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
    overlay.addEventListener("pointermove", move);
    overlay.addEventListener("pointerup", end);
    overlay.addEventListener("pointercancel", end);
  };
  $r(".gg-ruler").addEventListener("pointerdown", beginTimelineScrub);
  const headLine = $r(".gg-head-line");
  headLine?.addEventListener("pointerdown", beginTimelineScrub, true);
  headLine?.addEventListener("pointerdown", beginTimelineScrub);
  $r(".gg-track").addEventListener("contextmenu", (e) => {
    const clip = e.target.closest(".gg-clip");
    if (clip) openClipContextMenu(e, clip.dataset.cutId);
  });
  const host = el.parentElement || el;
  const fit = () => {
    const bodyH = fixedTimelineBodyHeight();
    const h = root.getBoundingClientRect().height || host.clientHeight || bodyH;
    const scr = root.querySelector(".gg-screen");
    const box = normalModePreviewSize({ bodyHeight: h || bodyH, hostWidth: host.clientWidth });
    if (scr) { scr.style.width = `${box.width}px`; scr.style.height = `${box.height}px`; }
    applyEditModeTimelineRow(root);
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
      const run = isSceneRunStart(c, i > 0 ? cuts[i - 1] : null);
      const hue = c.group_id ? groupColor(c.group_id) : 0;
      const showBand = showTimelineSceneBand(c);
      const tip = `${c.group_name ? `${c.group_name}\n` : ""}${cutDisplayLabel(c, cutLabels)}. ${c.name}  ${c.sec.toFixed(1)}s${c.src_dur ? ` (src ${c.src_dur}s)` : ""}${(() => {
        const cap = effectiveCaption(c).trim();
        return cap ? `\n${cap}` : "";
      })()}`;
      return `
      <div class="gg-clip${c.media ? "" : " gg-clip-empty"}${timelineClipTypeClassSuffix(c)}${c.pos !== c.index ? " gg-moved" : ""}${c.group_id ? " gg-in-scene" : ""}${run ? " gg-scene-start" : ""}"
           data-cut-id="${esc(c.id)}" style="width:${c.sec * ed.px}px;${c.group_id ? `--gg-grp:${hue}` : ""}"
           title="${esc(tip)}">
        ${showBand ? `<div class="gg-scene-band">${esc(c.group_name)}</div>` : ""}
        ${thumbHtml(c.media, "gg-clip-thumb")}
        ${timelineClipTypeBadgeHtml(c, esc)}
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
  const onTimeline = () => { if (!ed.dragging && !ed.scrubbing && !ed.tlResizing) paintTrack(); };
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
    if (!play.on) refreshEditPreviewStill(state.cutId ? cutById(state.cutId) || null : null);
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
  if (timelineEditModeOn) {
    bindEditPreviewObserver();
    applyEditPreviewLayout();
    requestAnimationFrame(applyEditPreviewLayout);
  }
  return () => {
    stopPlay();
    document.querySelector(".gg-edit-preview")?.remove();
    unbindEditPreviewObserver();
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
const exp = { job: null, poll: 0, hidden: false, exportFolder: "", outputPath: "", outputErr: "" };
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
  if (was === "running" && job.status === "done") {
    ggToast(EXPORT_DONE_TOAST_TITLE, exportDoneToastBody(job.file), "ok");
  }
  if (was === "running" && job.status === "error") {
    ggToast(EXPORT_FAIL_TOAST_TITLE, job.error || "Unknown error", "err");
  }
}

async function refreshExport() {
  try { const d = await getJson("/gonggan/export/status"); onExportJob(d.job); } catch (_) {}
}

function paintExportPanelLocks() {
  document.querySelectorAll(".gg-export-panel .gg-export").forEach((btn) => {
    btn.disabled = false;
    btn.title = "Render the timeline to one mp4 (CPU, ffmpeg)";
  });
  document.querySelectorAll(".gg-export-panel .gg-ex-preset, .gg-export-panel .gg-ex-sound").forEach((el) => {
    el.disabled = false;
  });
}

function paintTimelineNativeLocks() {
  const nat = isNativeProject();
  document.querySelectorAll(".gg-timeline .gg-reset").forEach((btn) => {
    btn.disabled = false;
    btn.title = nat ? "Rebuild the timeline from the cut list (order, original lengths, no gaps)" : "Reset to original order and lengths";
  });
  paintExportPanelLocks();
}

function paintExportOutputFolder() {
  const root = document.querySelector(".gg-export-panel");
  if (!root) return;
  const pathEl = root.querySelector(".gg-ex-out-path");
  const errEl = root.querySelector(".gg-ex-out-err");
  const showBtn = root.querySelector(".gg-ex-show-folder");
  if (!pathEl) return;
  const display = exportOutputDisplayPath({ exportFolder: exp.exportFolder, effectivePath: exp.outputPath });
  pathEl.textContent = display;
  const tip = sanitizeUserPath(exp.exportFolder || exp.outputPath || "");
  pathEl.title = tip || display;
  if (errEl) errEl.textContent = exp.outputErr || "";
  if (showBtn) showBtn.disabled = !(exp.outputPath || exp.exportFolder);
}

async function refreshExportOutputPath() {
  const tl = state.timeline;
  if (!tl?.project?.id) return;
  try {
    const data = await getJson(`/gonggan/export/output-path?pid=${encodeURIComponent(tl.project.id)}`);
    exp.exportFolder = data.export_folder || "";
    exp.outputPath = data.effective_path || "";
    paintExportOutputFolder();
  } catch (_) {}
}

async function saveExportFolder(path) {
  const tl = state.timeline;
  if (!tl?.project?.id) return false;
  const trimmed = String(path ?? "").trim();
  try {
    await postJson("/gonggan/export/folder/check", { path: trimmed });
  } catch (e) {
    exp.outputErr = sanitizeUserMessage(e.message || exportFolderCheckError({ ok: false }));
    paintExportOutputFolder();
    return false;
  }
  try {
    const data = await postJson("/gonggan/project/update", {
      pid: tl.project.id,
      fields: { settings: { export_folder: trimmed } },
    });
    if (data.timeline) state.timeline = data.timeline;
    exp.outputErr = "";
    await refreshExportOutputPath();
    return true;
  } catch (e) {
    exp.outputErr = sanitizeUserMessage(e.message || "Could not save export folder");
    paintExportOutputFolder();
    return false;
  }
}

async function showExportOutputFolder(withLastFile = false) {
  const tl = state.timeline;
  if (!tl?.project?.id) return;
  const job = exp.job;
  const body = { pid: tl.project.id };
  if (withLastFile && job?.status === "done" && job.file) body.name = job.file;
  try {
    const res = await api.fetchApi("/gonggan/export/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    if (data.remote_host) ggToast("", EXPORT_REMOTE_EXPLORER_MSG, "info");
  } catch (e) {
    ggToast("Show in folder", sentence(String(e.message || e), "Restart ComfyUI once if this button was just added."), "warn");
  }
}

async function startExport(preset, sound) {
  const tl = state.timeline;
  if (!tl || !tl.cuts.length) {
    ggToast("Export", "Add at least one cut with a generated version before exporting", "warn");
    return;
  }
  clearTimeout(ed.saveTimer);
  if (ed.saving || ed.saveTimer) await saveEdit();   // export what is on screen
  stopPlay();
  if (exp.exportFolder) {
    try {
      await postJson("/gonggan/export/folder/check", { path: exp.exportFolder });
    } catch (e) {
      exp.outputErr = sanitizeUserMessage(e.message || "Invalid export folder");
      paintExportOutputFolder();
      state.error = sentence("Export did not start: " + exp.outputErr, "Choose a writable folder and try again.");
      bus.dispatchEvent(new Event("timeline"));
      return;
    }
  }
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
  const root = document.querySelector(".gg-export-panel");
  if (!root) return;
  paintExportOutputFolder();
  const row = root.querySelector(".gg-ex-row");
  const job = exp.job;
  const btn = root.querySelector(".gg-export");
  const act = exportPanelActions(job || {});
  const running = act.running;
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
  else if (job.status === "done") {
    text.textContent = `✓ ${job.preset} · ${fmtClock(job.expected_sec || 0)} · ${fmtMB(job.size || 0)} · ${Math.round((job.finished_at - job.started_at) || 0)}s`;
    if (job.path) text.title = job.path;
  }
  else if (job.status === "cancelled") text.textContent = "Export cancelled";
  else if (job.status === "error") text.textContent = "Export failed: " + (job.error || "");
  row.querySelector(".gg-ex-cancel").hidden = !running;
  const play = row.querySelector(".gg-ex-play");
  const folder = row.querySelector(".gg-ex-folder");
  play.hidden = false;
  folder.hidden = false;
  play.disabled = act.playDisabled;
  folder.disabled = act.folderDisabled;
  play.title = act.playTip;
  folder.title = act.folderTip;
  play.textContent = EXPORT_PLAY_LABEL;
  folder.textContent = EXPORT_FOLDER_LABEL;
  row.querySelector(".gg-ex-path").textContent = act.hasFile ? (job.path || "") : "";
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
// A focused button (e.g. Play) is "clicked" by Space on keyup, which toggled playback right back on.
window.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  const root = document.querySelector(".gg-timeline");
  if (!root || !root.isConnected || !(root._ggHover || root.contains(document.activeElement))) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  e.stopPropagation();
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
    { id: EXPORT_TAB, title: EXPORT_TAB_TITLE, type: "custom", icon: "pi pi-download", render: (el) => mountExport(el) },
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
      queueMicrotask(() => {
        if (loadTimelineOpen(localStorage) && isTimelinePanelOpen()) scheduleRestoreTimelinePanelHeight();
      });
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
    if (!app._ggVideoStartWrapped) {
      app._ggVideoStartWrapped = true;
      const origQueue = app.queuePrompt.bind(app);
      app.queuePrompt = async function ggVideoStartQueue(...args) {
        try {
          await feedVideoCutStartImage();
        } catch (e) {
          console.warn("[gonggan] video queue: start image step failed; queuing as before", e);
        }
        return origQueue(...args);
      };
    }
    loadPersistedJobs();
    void refreshGenerateAll();
    void refreshRegenJob();
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

/* I2c: native bottom-panel X leaves our anchored (fixed) frame behind; clear it when the timeline tab is no longer shown. */
if (!globalThis.__ggBottomPanelCloseWatch) {
  globalThis.__ggBottomPanelCloseWatch = setInterval(() => {
    try {
      const panel = document.querySelector(".bottom-panel");
      if (panel?.dataset.ggBottomAnchor !== "1") return;
      if (isTimelinePanelOpen()) return;
      clearAnchoredBottomPanel();
      if (!app.extensionManager?.bottomPanel?.bottomPanelVisible && loadTimelineOpen(localStorage)) {
        saveTimelineOpen(localStorage, false);
        syncTimelineToggleButtons();
      }
    } catch (_) {}
  }, 300);
}
