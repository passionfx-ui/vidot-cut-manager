// comfyui-gonggan-cut — "Shots" sidebar tab + our own bottom strip (Timeline, Export).
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
  cutGenerationSec,
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
import { GAP, layoutTrack, clipAtTime, edgeSnapTargets, snapMoveStart, prevClipEnd, moveClipBlock, placeSelection, closeGaps } from "./gg_tl_place_core.js";
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
  applyMention,
  displayRefLinks,
  injectPromptText,
  mentionAutocomplete,
  mentionToken,
  referenceUseMode,
  referencesConfirmLine,
  stripMention,
} from "./gg_reference_core.js";
import { applyQwenRefImages, qwenRefWarning, workflowHasQwenEdit } from "./gg_qwen_ref_core.js";
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
  templateKindForNewCut,
  queueBatchPlan,
  queuePlanTooltip,
  QUEUE_MODE_LABELS,
  QUEUE_MODES,
} from "./gg_queue_mode_core.js";
import { shouldClosePreviousShotTab } from "./gg_tab_close_core.js";
import {
  graphFitsKind,
  shouldTryEmbeddedRepWorkflow,
  workflowGraphKind,
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
import { findStartImageNode, findVideoImageTarget, listLoadImageChoices, syncSavedVideoStartImage } from "./gg_start_image_core.js";
import {
  applyCutData,
  cloneGraph,
  cutSlotIds,
  extractCutData,
  extractTakeSnapshot,
  framesForSeconds,
  hasLoadImageNode,
  hasPromptNode,
  isImageFileName,
  LOAD_IMAGE_NODE_MISSING,
  PROMPT_NODE_MISSING,
  stripCutData,
} from "./gg_cut_data_core.js";
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
  expandableFieldWrapHtml,
  fieldExpandModalShellHtml,
  promptExpandFullscreenTitle,
  promptExpandKeyAction,
  promptTextareaCaretIndex,
} from "./gg_prompt_expand_core.js";
import {
  bumpPlaybackGen,
  decideVideoSync,
  guardResolvedPlay,
  animatedStillMode,
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
import { loadTakeWorkflowLabel, mergeLegacyTake, sceneHue, takeNoun, takesNoun } from "./gg_take_core.js";
import {
  timelineClipTypeBadgeHtml,
  timelineClipTypeClassSuffix,
} from "./gg_timeline_clip_type_core.js";
import { animatedWebpFrameBytes, parseAnimatedWebp } from "./gg_webp_anim_core.js";
import { noMediaText, noMediaThumbClass, playsAsVideo, isAnimatedImage, versionMedia, timelineClipVersionId } from "./gg_missing_media_core.js";
import {
  needsDurationProbe,
  formatClipDuration,
  versionStripRows,
  versionStripMenuItems,
  showNewestButton,
  stripScrollLeft,
  wheelToScrollLeft,
  IMPORT_ACCEPT,
  IMPORT_IMAGE_EXTS,
  IMPORT_TILE_TIP,
  importUploadName,
  isImportMediaFile,
  isImportImageFile,
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
  isAppWorkflowFile,
  templateListPaths,
  defaultVideoTemplate,
} from "./gg_template_pick_core.js";
import { clearLinearMode, expandLinearOutputIds, hasLinearModeFlag, linearBindings } from "./gg_app_mode_core.js";
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
  emptyCutBlankGraph,
  isEmptyCutSourcePayload,
  resolveEmptyCutWorkflow,
  workflowNodeCount,
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
  parseTimelineHeight,
  clampHeight,
  timelineHeightFromDrag,
  shouldIgnoreShortcut,
  pluginKeyScopeActive,
  timelineShortcutAllowed,
  timelineToggleTooltip,
} from "./gg_timeline_toggle_core.js";
import {
  fixedTimelineBodyHeight,
  fixedBottomPanelHeight,
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
  EDIT_PREVIEW_GAP_PX,
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
  AI_FEATURES_LABEL,
  AI_FEATURES_HINT,
  loadAiFeatures,
  saveAiFeatures,
  aiFeaturesChoiceSaved,
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
 * I27: AI features (Project Settings) is a second gate, default off. Off hides that UI and skips its init.
 */
const AI_CUT_SPLIT_VISIBLE = true;
let aiFeaturesOn = loadAiFeatures(localStorage);
let aiFeaturesAdopted = false;

function aiFeaturesActive() {
  return AI_CUT_SPLIT_VISIBLE && aiFeaturesOn;
}
const bus = new EventTarget();
const state = { projects: [], projectsLoaded: false, pid: localStorage.getItem(PID_KEY) || "", timeline: null, cutId: "", cutSel: new Set(), groupSel: new Set(), error: "" };
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
function loadRefTab() {
  try { return localStorage.getItem("gg.refTab") === "1"; } catch { return false; }
}

function saveRefTab(on) {
  try { localStorage.setItem("gg.refTab", on ? "1" : "0"); } catch { /* keep this session */ }
}

const shotsUi = {
  view: "cuts",
  needsRedoOnly: false,
  dragSession: null,
  listMode: loadListMode(localStorage),
  refTab: loadRefTab(),
  playCutId: "",
  composing: false,
  paintDeferred: false,
  /** Open inline cut title field: { cutId, input, finish } or null. */
  inlineRename: null,
  /** Open inline scene header field: { groupId, input, finish } or null. */
  inlineSceneRename: null,
  cutWfKind: null,
  cutWfKindCutId: "",
  /** Header click selected a whole scene or reference group. New Cut / New Reference then goes at the end of it. */
  selFromGroup: false,
  selGroupKey: "",
  /** "list" = cuts/references, "versions" = the version row. Delete follows the last one. */
  selTarget: "list",
  blockHeadSelect: false,
  /** Last real cut, so leaving the Reference tab can show that cut's link row again. */
  lastShotId: "",
};
/** Version-row multi-select for the cut or reference currently shown in the row. */
const verSel = { cutId: "", anchor: "", ids: new Set() };
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
let groupSelAnchor = "";
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
    // Same still as a timeline cut: preload a real frame, keep the element
    // invisible (gg-vid-hold) until that frame is on a canvas. Chromium paints
    // an empty green surface while preload=none, and again at currentTime 0.
    return `<video class="${cls} gg-thumb-vid gg-vid-hold" draggable="false" src="${url}" poster="${esc(posterUrl(media.id))}" muted playsinline preload="auto"></video>`;
  }
  if (isAnimatedImage(media)) {
    // Do not put the animated file in the <img> until hover. A resting <img>
    // keeps playing WebP/GIF. The still is drawn onto a canvas.
    return `<span class="${cls} gg-anim-thumb" data-gg-anim-id="${esc(media.id)}"><canvas class="gg-anim-still" hidden></canvas><img class="gg-anim-live" draggable="false" alt="" hidden /></span>`;
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
        // A version write can make the project list miss the open project for a moment.
        // Keep the project the timeline is already showing.
        if (keepPid && state.timeline?.project?.id === keepPid) {
          syncProjectSelectElements(keepPid);
        } else {
          const pick = state.projects.find((p) => p.id === data.active_project_id) || state.projects[0];
          state.pid = pick ? pick.id : "";
          bus.dispatchEvent(new Event("projects"));
          await loadTimeline();
        }
      } else {
        syncProjectSelectElements(keepPid);
      }
    } catch (e) {
      state.error = sentence(`Could not load projects: ${e.message}`, "Check that ComfyUI is running, then reload the page.");
    }
    refreshSdk(true);
    refreshProjectTemplateFlag();
    void adoptServerAiFeaturesIfUnset();
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

function knownProjectPid(id) {
  const text = String(id || "");
  if (!text || !state.projectsLoaded) return "";
  return state.projects.some((p) => p.id === text) ? text : "";
}

/** A queued graph's extra.gonggan wins only when that id is the open project. A workflow or subgraph id is not. */
function queueCutTarget(graphExtra) {
  const target = promptCutTarget({
    graphExtra,
    loadedCutId: wfLastLoadedCutId,
    currentProjectId: state.pid,
    shotTabActive: isGongganShotTabOpenAndActive(),
  });
  if (!target) return null;
  if (!state.projectsLoaded) return target;
  if (knownProjectPid(target.projectId)) return target;
  const current = knownProjectPid(state.pid);
  if (!current) return null;
  return { cutId: target.cutId, projectId: current };
}

/** Timeline reloads use the open project, not a workflow id or a cut id left on the graph. */
function currentTimelinePid() {
  const known = knownProjectPid(state.pid);
  if (known) return known;
  const shown = state.timeline?.project?.id;
  const shownKnown = knownProjectPid(shown);
  if (shownKnown) {
    state.pid = shownKnown;
    try { localStorage.setItem(PID_KEY, shownKnown); } catch (_) {}
    return shownKnown;
  }
  return state.pid;
}

async function loadTimeline(opts) {
  const pid = currentTimelinePid();
  if (!pid) { state.timeline = null; bus.dispatchEvent(new Event("timeline")); return; }
  const token = timelineGuard.begin(pid);
  let next = null;
  let failure = "";
  try {
    next = adoptServerTimeline(await getJson("/gonggan/timeline?pid=" + encodeURIComponent(token.pid)));
  } catch (e) {
    failure = e.message;
  }
  // A slower, older response must not overwrite a newer timeline (newer load, mutation response, other project).
  if (timelineGuard.isStale(token, state.pid)) return;
  if (failure === "project not found" && !(opts && opts._retried)) {
    await new Promise((r) => setTimeout(r, 200));
    if (!timelineGuard.isStale(token, state.pid)) return loadTimeline({ ...(opts || {}), _retried: true });
  }
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
  if (!state.pid || !isNativeProject() || !aiFeaturesActive()) return;
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
  state.groupSel.clear();
  groupSelAnchor = "";
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
  const kindTemplates = {
    image: DEFAULT_PROJECT_SETTINGS.image_template,
    video: defaultVideoTemplate(userWorkflowPathsLoaded ? userWorkflowPaths : null),
  };
  let videoStillDefault = true;
  const repaintTemplate = {};
  for (const kind of ["image", "video"]) {
    repaintTemplate[kind] = wireProjectTemplateField(wrap.querySelector(`[data-tpl="${kind}"]`), {
      get: () => kindTemplates[kind],
      set: (ref) => {
        if (kind === "video") videoStillDefault = false;
        kindTemplates[kind] = ref;
      },
    });
  }
  const applyDefaultVideoTemplate = () => {
    if (!videoStillDefault || !wrap.isConnected) return;
    const next = defaultVideoTemplate(userWorkflowPathsLoaded ? userWorkflowPaths : null);
    if (next === kindTemplates.video) return;
    kindTemplates.video = next;
    repaintTemplate.video?.();
  };
  if (!userWorkflowPathsLoaded) fetchUserWorkflowPaths().then(() => applyDefaultVideoTemplate());
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
      if (templateKindForNewCut(loadQueueMode(localStorage), null) === "video") req.body.kind = "video";
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
  const title = key === "video" && !aiFeaturesActive() ? "Workflow for Image to Video" : f.title;
  const listId = key === "default" ? "gg-tpl-list" : `gg-tpl-list-${key}`;
  return `<div class="gg-modal-field gg-tpl-field" data-tpl="${key}" title="${esc(title)}">
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
    if (input.value.trim() === shown()) {
      showValue();
      return;
    }
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
      ${AI_CUT_SPLIT_VISIBLE ? `<label class="gg-modal-field gg-ai-features-field">
        <span class="gg-switch-row">${esc(AI_FEATURES_LABEL)}
          <input type="checkbox" class="gg-switch gg-modal-ai-features" role="switch"${aiFeaturesOn ? " checked" : ""} />
        </span>
        <span class="gg-modal-hint">${esc(AI_FEATURES_HINT)}</span>
      </label>` : ""}
      ${nat && AI_CUT_SPLIT_VISIBLE ? `<div class="gg-ai-features-panel"${aiFeaturesOn ? "" : " hidden"}><label class="gg-modal-field gg-use-ai-field">
        <span class="gg-switch-row">${esc(USE_AI_LABEL)}
          <input type="checkbox" class="gg-switch gg-modal-use-ai" role="switch" disabled />
        </span>
        <span class="gg-modal-hint">${esc(USE_AI_FEATURES_HINT)}</span>
      </label>
      <label class="gg-modal-field gg-cut-split-model-field">AI model<span class="gg-ai-model-vl-hint"> ${esc(AI_MODEL_VL_HINT)}</span>
        <select class="gg-modal-cut-split-model" disabled><option>Loading…</option></select>
        <span class="gg-modal-hint gg-ai-model-dirs"></span>
      </label></div>` : ""}
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
  const aiFeatIn = wrap.querySelector(".gg-modal-ai-features");
  const aiFeaturesInitial = aiFeaturesOn;
  const folderIn = wrap.querySelector(".gg-modal-folder");
  if (!nat || !folderIn) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await saveHistoryStepsIfChanged();
        await saveAiFeaturesIfChanged(aiFeatIn, aiFeaturesInitial);
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
  const aiPanel = wrap.querySelector(".gg-ai-features-panel");
  let modelListStarted = false;
  const loadCutSplitModelList = () => {
    if (modelListStarted || !modelSel) return;
    modelListStarted = true;
    void getJson("/gonggan/cut-split/model").then(
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
  };
  const syncAiFeaturesPanel = () => {
    const on = !!aiFeatIn?.checked;
    if (aiPanel) aiPanel.hidden = !on;
    if (on) loadCutSplitModelList();
  };
  aiFeatIn?.addEventListener("change", syncAiFeaturesPanel);
  syncAiFeaturesPanel();
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
      random_seed: curSettings.random_seed,
    }));
    const wantAi = !!aiFeatIn?.checked;
    const aiPatch = wantAi ? cutSplitSettingsPatch({
      modelInitial,
      model: modelSel?.value,
      useAiInitial,
      useAi: useAiIn?.checked,
    }) : null;
    let historyChanged = false;
    let featuresChanged = false;
    try {
      historyChanged = await saveHistoryStepsIfChanged();
      featuresChanged = await saveAiFeaturesIfChanged(aiFeatIn, aiFeaturesInitial);
    } catch (err) {
      ggToast("Settings", err.message, "warn");
      return;
    }
    if (featuresChanged && wantAi && !aiPatch) void refreshCutSplitUseAi();
    if (!patch && !aiPatch) {
      closeProjectModal();
      if (historyChanged || featuresChanged) ggToast("Settings", "Settings saved", "ok");
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

const refsUi = { collapsed: {}, groupId: "" };
const REF_IMAGE_ACCEPT = [...IMPORT_IMAGE_EXTS, "image/png", "image/jpeg", "image/gif", "image/webp"].join(",");

function activeReferences() {
  return (state.timeline?.references || []).filter((r) => r && r.id);
}

function referenceById(id) {
  return activeReferences().find((r) => r.id === id) || null;
}

function selectedReference() {
  const id = state.cutId;
  if (!id || !state.timeline) return null;
  if ((state.timeline.cuts || []).some((c) => c.id === id)) return null;
  return referenceById(id);
}

function cutPromptNow(cut) {
  const open = cut && state.cutId === cut.id
    ? document.querySelector(`#gg-root .gg-cut[data-cut-id="${CSS.escape(cut.id)}"] textarea.gg-prompt-text:not(.gg-desc-text)`)
    : null;
  if (open && document.activeElement === open) return open.value;
  return cut?.prompt || "";
}

function cutRefRows(cut) {
  if (!cut) return [];
  return displayRefLinks(cutPromptNow(cut), cut.ref_links, activeReferences());
}

function loadImageChoicesForCut(cutId) {
  const wf = cutId && cutId === state.cutId ? state.cutWorkflow : null;
  if (!wf) return [];
  let exclude = "";
  try {
    exclude = findVideoImageTarget(wf)?.id || "";
  } catch {
    exclude = "";
  }
  return listLoadImageChoices(wf, exclude);
}

function referenceThumbHtml(media) {
  return media?.id
    ? thumbHtml(media, "gg-ref-face")
    : `<span class="gg-ref-empty">No image yet</span>`;
}

function selectedShot() {
  const id = state.cutId;
  if (!id || !state.timeline) return null;
  return (state.timeline.cuts || []).find((c) => c && c.id === id) || null;
}

function noteLastShot(id) {
  if (!id || !state.timeline) return;
  if ((state.timeline.cuts || []).some((c) => c && c.id === id)) shotsUi.lastShotId = id;
}

/** Cut to show again after the Reference tab. Falls back to the first cut. */
function shotIdToRestore() {
  const cuts = state.timeline?.cuts || [];
  const back = shotsUi.lastShotId;
  if (back && cuts.some((c) => c.id === back)) return back;
  return cuts[0]?.id || "";
}

function refSquareHtml(row, { unlink }) {
  const name = row.missing ? `${row.name || "Reference"} missing` : (row.name || "Reference");
  const face = row.missing ? `<span class="gg-ref-empty">?</span>` : referenceThumbHtml(row.media);
  const x = unlink
    ? `<button type="button" class="gg-refthumb-x" data-ref-unlink="${esc(row.ref_id)}" title="Unlink" aria-label="Unlink">×</button>`
    : "";
  return `<span class="gg-refthumb${row.missing ? " missing" : ""}" title="${esc(name)}" data-ref-id="${esc(row.ref_id)}"><span class="gg-refthumb-face">${face}</span>${x}</span>`;
}

function cutCardRefThumbsInner(cut) {
  return cutRefRows(cut).map((row) => refSquareHtml(row, { unlink: false })).join("");
}

function cutRefStripInnerHtml(cut) {
  const thumbs = cutRefRows(cut).map((row) => refSquareHtml(row, { unlink: true })).join("");
  return `${thumbs}<button type="button" class="gg-refthumb gg-refthumb-add" title="Link reference" aria-label="Link reference"></button>`;
}

/** Built-in categories plus saved groups, then any category that still has a reference. */
function referenceGroupSections() {
  const sections = REFERENCE_CATEGORIES.map((name) => ({
    id: `cat:${name}`,
    name,
    builtin: true,
    collapsed: !!refsUi.collapsed[`cat:${name}`],
  }));
  const names = new Set(sections.map((g) => g.name.toLowerCase()));
  for (const g of state.timeline?.reference_groups || []) {
    const name = String(g?.name || "").trim();
    if (!g?.id || !name || names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    sections.push({ id: String(g.id), name, builtin: false, collapsed: !!g.collapsed });
  }
  for (const r of activeReferences()) {
    const name = String(r?.category || "Other").trim() || "Other";
    if (names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    sections.push({
      id: `cat:${name}`,
      name,
      builtin: true,
      collapsed: !!refsUi.collapsed[`cat:${name}`],
    });
  }
  return sections;
}

function referenceGroupById(id) {
  return referenceGroupSections().find((g) => g.id === id) || null;
}

/** Group the next New Reference uses: the clicked group, else the selected reference's group, else the last group. */
function selectedReferenceGroup() {
  const sections = referenceGroupSections();
  if (!sections.length) return null;
  const picked = referenceGroupById(refsUi.groupId);
  if (picked) return picked;
  const ref = selectedReference();
  if (ref) {
    const hit = sections.find((g) => g.name === (ref.category || "Other"));
    if (hit) return hit;
  }
  return sections[sections.length - 1];
}

function nextReferenceGroupName(sections) {
  const used = new Set((sections || []).map((g) => String(g?.name || "").trim().toLowerCase()));
  let n = 1;
  while (used.has(`group ${n}`)) n += 1;
  return `Group ${n}`;
}

function nextReferenceName(category) {
  const used = new Set(
    activeReferences()
      .filter((r) => (r.category || "Other") === category)
      .map((r) => String(r.name || "").trim().toLowerCase()),
  );
  let name = "New reference";
  let n = 2;
  while (used.has(name.toLowerCase())) {
    name = `New reference ${n}`;
    n += 1;
  }
  return name;
}

function referenceCategoryOptions(selected) {
  const names = referenceGroupSections().map((g) => g.name);
  if (selected && !names.includes(selected)) names.push(selected);
  return names.map((c) => `<option${c === selected ? " selected" : ""}>${esc(c)}</option>`).join("");
}

function referenceVersionThumbsHtml(ref) {
  const list = Array.isArray(ref?.versions_list) ? ref.versions_list.filter((v) => v && v.id) : [];
  if (!list.length) return `<div class="gg-ref-versions gg-dim">No versions yet</div>`;
  const cells = list.map((v) => {
    const best = ref.pick === v.id ? " best" : "";
    const face = v.missing
      ? `<span class="gg-ref-empty">?</span>`
      : thumbHtml(versionMedia(v), "gg-ref-face");
    const label = ref.pick === v.id ? "Best" : (v.kind === "video" ? "Video" : "Image");
    return `<button type="button" class="gg-ref-ver${best}" data-vid="${esc(v.id)}" title="${esc(label)}">${face}</button>`;
  }).join("");
  return `<div class="gg-ref-versions">${cells}</div>`;
}

function referenceLibraryHtml() {
  const all = activeReferences();
  const sections = referenceGroupSections().map((g) => {
    const rows = all.filter((r) => (r.category || "Other") === g.name);
    const cards = rows.map((r) =>
      `<li class="gg-cut gg-cut-reference${state.cutId === r.id ? " gg-sel" : ""}" data-cut-id="${esc(r.id)}" data-kind="reference"><div class="gg-ref-card-main">${infoRowContent(r)}</div>${referenceVersionThumbsHtml(r)}${referenceEditorsHtml(r)}</li>`
    ).join("");
    const on = refsUi.groupId === g.id ? " gg-on" : "";
    return `<section class="gg-grp-sec gg-ref-sec${on}" data-ref-group="${esc(g.id)}" data-ref-cat="${esc(g.name)}">
      <header class="gg-grp-head" title="Click to select all references in this group">
        <button type="button" class="gg-grp-fold" title="Collapse or expand">${g.collapsed ? "▸" : "▾"}</button>
        <span class="gg-grp-title">${esc(g.name)}</span>
        <span class="gg-grp-meta">${rows.length}</span>
      </header>
      <ol class="gg-cutlist"${g.collapsed ? " hidden" : ""}>${cards}</ol>
    </section>`;
  }).join("");
  return `<div class="gg-ref-library">${sections}</div>`;
}

function refSlotOptions(cut, row) {
  const choices = loadImageChoicesForCut(cut.id);
  const cur = row.slot || "";
  const opts = [`<option value="">None</option>`].concat(choices.map((c) =>
    `<option value="${esc(c.id)}"${c.id === cur ? " selected" : ""}>${esc(c.label)}</option>`
  ));
  if (cur && !choices.some((c) => c.id === cur)) {
    opts.push(`<option value="${esc(cur)}" selected>${esc(cur)}</option>`);
  }
  return opts.join("");
}

function selectionDetailHtml() {
  return "";
}

/** Description and prompt on the reference card, same editors as the Info and Prompt cut cards. No create dialog. */
function referenceEditorsHtml(ref) {
  const nat = isNativeProject();
  const tip = nat ? CARD_EDIT_IDLE_TIP : NATIVE_READONLY_TIP;
  const ro = nat ? " readonly" : " disabled";
  return `<div class="gg-ref-fields">
    <label class="gg-ref-field"><span>Description</span>
      <textarea class="gg-prompt-text gg-desc-text" rows="3" placeholder="Description" maxlength="4000"${ro} title="${esc(tip)}">${esc(ref.description || "")}</textarea>
    </label>
    <label class="gg-ref-field"><span>Prompt</span>
      ${expandableFieldWrapHtml({
        textareaClass: "gg-prompt-text",
        text: ref.prompt || "",
        placeholder: "Prompt for Generate…",
        title: tip,
        native: nat,
        cutId: ref.id,
      })}
    </label>
  </div>`;
}

function referenceErrorText(err, fallback) {
  const msg = err?.message || "";
  if (/already exists/i.test(msg)) return "A reference with that name already exists in this category.";
  if (/not a reference/i.test(msg)) return "That item is not a reference.";
  if (/category must be|valid category|group name/i.test(msg)) return "Choose a reference group.";
  return msg || fallback;
}

function customReferenceGroupsPayload(nextCollapsedId) {
  return referenceGroupSections()
    .filter((g) => !g.builtin)
    .map((g) => ({
      id: g.id,
      name: g.name,
      collapsed: g.id === nextCollapsedId ? !g.collapsed : !!g.collapsed,
    }));
}

async function persistReferenceGroups(groups) {
  const pid = state.pid;
  const data = await postJson("/gonggan/reference/groups", { pid, groups });
  if (data && state.pid === pid) {
    if (data.cuts || data.references) adoptMutationTimeline(data, pid);
    else if (data.timeline) adoptMutationTimeline(data.timeline, pid);
    bus.dispatchEvent(new Event("timeline"));
  }
}

/** Icon-row New Group: one more empty group, same instant create as New scene. */
async function addReferenceGroup() {
  if (!state.pid || !isNativeProject()) return;
  const sections = referenceGroupSections();
  const id = `rg${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
  const name = nextReferenceGroupName(sections);
  const groups = customReferenceGroupsPayload().concat([{ id, name, collapsed: false }]);
  try {
    await persistReferenceGroups(groups);
    refsUi.groupId = id;
    bus.dispatchEvent(new Event("timeline"));
    requestAnimationFrame(() => {
      document.querySelector(`.gg-shots .gg-ref-sec[data-ref-group="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  } catch (e) {
    const missing = e.status === 404 || e.status === 405;
    ggToast("Reference", missing ? "Restart ComfyUI to add a reference group." : referenceErrorText(e, "Could not add a group."), "warn");
  }
}

/** Id to insert a new reference after, or "" when nothing is selected (keep name order). */
function referenceInsertAfterId() {
  const order = referenceDisplayOrder();
  if (shotsUi.selFromGroup && shotsUi.selGroupKey) {
    const group = referenceGroupById(shotsUi.selGroupKey);
    if (!group) return "";
    const inGroup = order.filter((id) => (referenceById(id)?.category || "Other") === group.name);
    return inGroup.length ? inGroup[inGroup.length - 1] : "";
  }
  if (referenceById(state.cutId)) return state.cutId;
  const picked = order.filter((id) => state.cutSel.has(id));
  return picked.length ? picked[picked.length - 1] : "";
}

/** Icon-row New Reference: a new reference in the selected group, image template copied like a new image cut. */
async function addReferenceInSelectedGroup() {
  if (!state.pid || !isNativeProject()) return;
  const group = selectedReferenceGroup();
  if (!group) return;
  const name = nextReferenceName(group.name);
  refsUi.groupId = group.id;
  const afterId = referenceInsertAfterId();
  const body = { pid: state.pid, name, category: group.name };
  if (afterId) body.after = afterId;
  try {
    const d = await postJson("/gonggan/reference/add", body);
    if (d.timeline) adoptMutationTimeline(d.timeline, state.pid);
    else await loadTimeline({ keepView: true });
    bus.dispatchEvent(new Event("timeline"));
    const id = d.reference?.id;
    if (id) {
      wfLastLoadedCutId = "";
      wfLastLoadedProjectId = "";
      selectReference(id);
      requestAnimationFrame(() => {
        document.querySelector(`.gg-shots .gg-cut[data-cut-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
    }
    ggToast("Reference", `Added ${d.reference?.name || name}`, "ok");
  } catch (e) {
    ggToast("Reference", referenceErrorText(e, "Could not add a reference."), "warn");
  }
}

function selectReference(id) {
  const ref = referenceById(id);
  if (!ref) return;
  const group = referenceGroupSections().find((g) => g.name === (ref.category || "Other"));
  if (group) refsUi.groupId = group.id;
  state.cutSel = new Set();
  selectCut(id);
}

async function renameReference(id, nextName) {
  const ref = referenceById(id);
  if (!ref) return;
  const name = nextName != null
    ? normalizeNameInput(nextName, 80).value
    : await askText({ title: "Rename reference", label: "Name", value: ref.name, okLabel: "Rename", maxLength: 80 });
  if (!name || name === ref.name) return;
  await saveCutName(id, name);
}

async function changeReferenceCategory(id, category) {
  const names = referenceGroupSections().map((g) => g.name);
  if (!names.includes(category)) return;
  await saveCutFields(id, { category });
  if (state.cutId === id) {
    const group = referenceGroupSections().find((g) => g.name === category);
    if (group) refsUi.groupId = group.id;
  }
}

async function deleteReference(id) {
  const ref = referenceById(id);
  if (!ref) return;
  const ok = await askConfirm({
    message: `Delete reference "${ref.name}"?\nIt will be moved to trash.`,
    okLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  await deleteCutsByIds([id], historyStepId());
}

async function setReferenceBest(id) {
  const ref = referenceById(id);
  const vid = stripSelectedVersionId(ref) || ref?.media?.id || ref?.versions_list?.[0]?.id;
  if (!ref || !vid) {
    ggToast("Reference", "Import or generate an image before setting Best.", "warn");
    return;
  }
  await saveCutFields(id, { pick_version_id: vid });
}

/** Photo files become versions of this reference. Same import route as a cut version, not a new cut. */
async function importReferenceVersionFiles(pid, refId, files) {
  const images = (files || []).filter(isImportImageFile);
  if (!images.length || !refId) {
    if ((files || []).length) ggToast("Reference", "Choose an image file.", "warn");
    return;
  }
  stripImportBusy = true;
  bus.dispatchEvent(new Event("sdk"));
  const failed = [];
  let added = 0;
  try {
    for (const file of images) {
      const body = new FormData();
      body.append("pid", pid);
      body.append("cut_id", refId);
      body.append("file", file, importUploadName(file));
      try {
        const res = await api.fetchApi("/gonggan/import-version", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (res.status === 404 || res.status === 405) throw new Error("Restart ComfyUI to enable Import");
        if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
        added += 1;
      } catch (e) {
        failed.push(`${file.name}: ${e.message}`);
      }
    }
  } finally {
    stripImportBusy = false;
    if (added && state.pid === pid) await loadTimeline({ keepView: true });
    bus.dispatchEvent(new Event("sdk"));
  }
  if (failed.length) ggToast(`Imported ${added} of ${images.length}`, failed.join("\n"), "warn");
  else if (added) ggToast(`Imported ${added} image${added === 1 ? "" : "s"}`, "", "ok");
}

function pickReferenceVersionFiles(refId) {
  const pid = state.pid;
  if (!refId || !isNativeProject() || stripImportBusy) return;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = REF_IMAGE_ACCEPT;
  input.addEventListener("change", () => void importReferenceVersionFiles(pid, refId, [...(input.files || [])]));
  input.click();
}

async function useLastOutputOnReference(id) {
  const ref = referenceById(id);
  if (!ref) return;
  const out = await postJson("/gonggan/send-output", { pid: state.pid, cut_id: id });
  if (!out?.ok) {
    ggToast("Reference", "No output image to use.", "warn");
    return;
  }
  await loadTimeline({ keepView: true });
}

function openReferenceMenu(id, x, y) {
  const ref = referenceById(id);
  if (!ref) return;
  if (!state.cutSel.has(id)) selectReference(id);
  const cats = referenceGroupSections().map((g) => g.name).filter((c) => c !== ref.category).map((c) => ({
    label: c,
    action: () => changeReferenceCategory(id, c).catch((e) => ggToast("Reference", referenceErrorText(e, "References"), "warn")),
  }));
  showCtxMenu(x, y, [
    { label: "Load template…", submenu: templateChoicesForCut(id) },
    { label: "Import Media…", action: () => pickReferenceVersionFiles(id) },
    { label: "Generate Selected", action: () => generateReference(id) },
    { label: "Set as Best", action: () => setReferenceBest(id).catch((e) => ggToast("Reference", e.message || "Could not set Best.", "warn")) },
    { label: "Use Last Output", action: () => useLastOutputOnReference(id).catch((e) => ggToast("Reference", e.message || "Could not use the last output.", "warn")) },
    { label: "Rename", shortcut: "F2", action: () => renameReference(id).catch((e) => ggToast("Reference", referenceErrorText(e, "References"), "warn")) },
    cats.length ? { label: "Change Category", submenu: cats } : null,
    { separator: true },
    { label: "Delete", danger: true, action: () => { void confirmDeleteSelectedCuts(); } },
  ].filter(Boolean));
}

async function generateReference(id) {
  if (!referenceById(id)) return;
  await queueSelectedCuts([id], { resolved: true });
}

function saveReferenceLinks(cutId, rows, prompt) {
  const links = rows.map((row) => ({
    ref_id: row.ref_id,
    source: row.source === "mention" ? "mention" : "manual",
    ...(row.slot ? { slot: row.slot } : {}),
  }));
  const fields = { ref_links: links };
  if (typeof prompt === "string") fields.prompt = prompt;
  return saveCutFields(cutId, fields);
}

function linkReferencesToCut(cut, refIds) {
  if (!cut) return;
  const rows = cutRefRows(cut).slice();
  const have = new Set(rows.map((row) => row.ref_id));
  for (const id of refIds || []) {
    const ref = referenceById(id);
    if (!ref || have.has(ref.id)) continue;
    rows.push({ ref_id: ref.id, source: "manual", slot: null, name: ref.name });
    have.add(ref.id);
  }
  cut.ref_links = rows.map((row) => ({
    ref_id: row.ref_id,
    source: row.source === "mention" ? "mention" : "manual",
    ...(row.slot ? { slot: row.slot } : {}),
  }));
  refreshOpenCutRefChips();
  saveReferenceLinks(cut.id, rows).catch((e) => ggToast("References", e.message || "Could not link.", "warn"));
}

function linkReferenceToCut(cut, refId) {
  linkReferencesToCut(cut, [refId]);
}

let refPickerEl = null;
let refPickerDoc = null;

function closeRefPicker() {
  if (refPickerEl) {
    refPickerEl.remove();
    refPickerEl = null;
  }
  document.removeEventListener("keydown", onRefPickerKey, true);
  if (refPickerDoc) {
    document.removeEventListener("mousedown", refPickerDoc, true);
    refPickerDoc = null;
  }
}

function onRefPickerKey(e) {
  if (e.key !== "Escape" || !refPickerEl) return;
  e.preventDefault();
  e.stopPropagation();
  closeRefPicker();
}

function openRefPicker(anchor, cut) {
  closeRefPicker();
  if (!anchor || !cut) return;
  const picked = new Set();
  let cat = "All";
  const wrap = document.createElement("div");
  wrap.className = "gg-refpick";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Link reference");
  document.body.appendChild(wrap);
  refPickerEl = wrap;
  const place = () => {
    const rect = anchor.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    wrap.style.left = `${left}px`;
    wrap.style.width = `${w}px`;
    const h = wrap.offsetHeight || 220;
    let top = rect.top - h - 6;
    if (top < 8) top = Math.min(window.innerHeight - h - 8, rect.bottom + 6);
    wrap.style.top = `${Math.max(8, top)}px`;
  };
  const render = () => {
    const all = activeReferences();
    const linked = new Set(cutRefRows(cut).map((row) => row.ref_id));
    const shown = cat === "All" ? all : all.filter((r) => (r.category || "Other") === cat);
    const chips = ["All", ...referenceGroupSections().map((g) => g.name)].map((c) =>
      `<button type="button" class="gg-ref-filter${c === cat ? " on" : ""}" data-ref-filter="${esc(c)}">${esc(c)}</button>`
    ).join("");
    const cells = shown.map((r) => {
      const locked = linked.has(r.id);
      const on = locked || picked.has(r.id);
      return `<button type="button" class="gg-refpick-item${on ? " on" : ""}${locked ? " gg-locked" : ""}" data-ref-id="${esc(r.id)}" title="${esc(r.name)}"${locked ? " disabled" : ""}>
        <span class="gg-refthumb"><span class="gg-refthumb-face">${referenceThumbHtml(r.media)}</span></span>
        <span class="gg-refpick-name">${esc(r.name)}</span>
      </button>`;
    }).join("") || `<div class="gg-ref-none">${all.length ? "No references in this category." : "No references yet."}</div>`;
    wrap.innerHTML = `
      <div class="gg-refpick-filters">${chips}</div>
      <div class="gg-refpick-grid">${cells}</div>
      <div class="gg-refpick-actions">
        <button type="button" class="gg-btn gg-refpick-cancel">Cancel</button>
        <button type="button" class="gg-btn gg-primary gg-refpick-ok"${picked.size ? "" : " disabled"}>Link</button>
      </div>`;
    bindHoverPlay(wrap);
    bindThumbFallbacks(wrap);
    place();
    wrap.querySelectorAll("[data-ref-filter]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        cat = btn.dataset.refFilter || "All";
        render();
      });
    });
    wrap.querySelectorAll(".gg-refpick-item:not(.gg-locked)").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.refId;
        if (!id) return;
        if (picked.has(id)) picked.delete(id);
        else picked.add(id);
        render();
      });
    });
    wrap.querySelector(".gg-refpick-cancel")?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeRefPicker();
    });
    wrap.querySelector(".gg-refpick-ok")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const ids = [...picked];
      closeRefPicker();
      if (ids.length) linkReferencesToCut(cut, ids);
    });
  };
  render();
  document.addEventListener("keydown", onRefPickerKey, true);
  refPickerDoc = (e) => {
    if (!refPickerEl || refPickerEl.contains(e.target) || anchor.contains?.(e.target)) return;
    closeRefPicker();
  };
  setTimeout(() => document.addEventListener("mousedown", refPickerDoc, true), 0);
}

function unlinkReferenceFromCut(cut, refId) {
  const row = cutRefRows(cut).find((r) => r.ref_id === refId);
  if (!cut || !row) return;
  let prompt = cutPromptNow(cut);
  if (row.name) prompt = stripMention(prompt, row.name);
  const ta = document.querySelector(`#gg-root .gg-cut[data-cut-id="${CSS.escape(cut.id)}"] textarea.gg-prompt-text:not(.gg-desc-text)`);
  if (ta && ta.value !== prompt) ta.value = prompt;
  const rows = displayRefLinks(prompt, cut.ref_links, activeReferences()).filter((r) => r.ref_id !== refId);
  const links = rows.map((item) => ({
    ref_id: item.ref_id,
    source: item.source === "mention" ? "mention" : "manual",
    ...(item.slot ? { slot: item.slot } : {}),
  }));
  const prev = { prompt: cut.prompt || "", ref_links: cut.ref_links || [] };
  cut.prompt = prompt;
  cut.ref_links = links;
  scheduleCutFieldSave(cut.id, { ref_links: links, prompt }, prev);
  refreshOpenCutRefChips();
}

function setReferenceSlot(cut, refId, slot) {
  const rows = cutRefRows(cut).map((row) => row.ref_id === refId ? { ...row, slot: slot || null } : row);
  saveReferenceLinks(cut.id, rows).catch((e) => ggToast("References", e.message || "Could not set the slot.", "warn"));
}

function referencesLineForCut(cut) {
  if (!cut) return "";
  return referencesConfirmLine(cutRefRows(cut));
}

function bindMentionField(field) {
  if (!field || field.dataset.mentionBound) return;
  field.dataset.mentionBound = "1";
  field.addEventListener("input", () => {
    showMentionPopup(field);
    refreshOpenCutRefChips();
  });
  field.addEventListener("keydown", (e) => {
    const pop = mentionPopupEl;
    if (!pop) return;
    const items = [...pop.querySelectorAll("[data-mention-name]")];
    const cur = items.findIndex((el) => el.classList.contains("on"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === "ArrowDown" ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur - 1);
      items.forEach((el, i) => el.classList.toggle("on", i === next));
    } else if (e.key === "Enter" || e.key === "Tab") {
      const pick = items[cur] || items[0];
      if (!pick) return;
      e.preventDefault();
      e.stopPropagation();
      commitMention(field, pick.dataset.mentionName);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMentionPopup();
    }
  }, true);
  field.addEventListener("blur", () => setTimeout(closeMentionPopup, 120));
}

let mentionPopupEl = null;

function closeMentionPopup() {
  if (mentionPopupEl) {
    mentionPopupEl.remove();
    mentionPopupEl = null;
  }
}

function showMentionPopup(field) {
  closeMentionPopup();
  const hit = mentionAutocomplete(field.value, field.selectionStart || 0, activeReferences());
  if (!hit || !hit.items.length) return;
  const pop = document.createElement("div");
  pop.className = "gg-mention-pop";
  pop.innerHTML = hit.items.map((r, i) => {
    const ref = referenceById(r.id);
    return `<button type="button" data-mention-name="${esc(r.name)}" class="${i === 0 ? "on" : ""}">@${esc(mentionToken(r.name))} <small>${esc(ref?.category || "Other")}</small></button>`;
  }).join("");
  document.body.appendChild(pop);
  const rect = field.getBoundingClientRect();
  pop.style.left = `${Math.max(8, rect.left)}px`;
  pop.style.top = `${rect.bottom + 4}px`;
  pop.querySelectorAll("[data-mention-name]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      commitMention(field, btn.dataset.mentionName);
    });
  });
  mentionPopupEl = pop;
}

function commitMention(field, name) {
  const hit = mentionAutocomplete(field.value, field.selectionStart || 0, activeReferences());
  closeMentionPopup();
  if (!hit) return;
  const next = applyMention(field.value, hit.at, field.selectionStart || 0, mentionToken(name));
  field.value = next.text;
  field.focus();
  field.setSelectionRange(next.caret, next.caret);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function withReferenceConfirm(message, cuts) {
  const list = (cuts || []).filter(Boolean);
  const lines = [];
  for (const cut of list) {
    const line = referencesLineForCut(cut);
    if (!line) continue;
    lines.push(list.length > 1 ? `${shotTitle(cut)} — ${line}` : line);
  }
  if (!lines.length) return message;
  return `${message}\n${lines.join("\n")}`;
}

function repaintShots() {
  bus.dispatchEvent(new Event("timeline"));
}

function bindReferenceGroup(root) {
  const group = root.querySelector(".gg-ref-library");
  if (!group) return;
  group.querySelectorAll(".gg-ref-sec").forEach((sec) => {
    const id = sec.dataset.refGroup || "";
    sec.querySelector(".gg-grp-head")?.addEventListener("click", (e) => {
      if (e.target.closest(".gg-grp-fold, button, input, textarea")) return;
      if (shotsUi.blockHeadSelect) {
        shotsUi.blockHeadSelect = false;
        return;
      }
      e.stopPropagation();
      const ids = [...sec.querySelectorAll(".gg-cut")].map((li) => li.dataset.cutId).filter(Boolean);
      refsUi.groupId = id;
      selectListedGroup(ids, { multi: !!(e.ctrlKey || e.metaKey), range: !!e.shiftKey, groupKey: id });
    });
    sec.querySelector(".gg-grp-fold")?.addEventListener("click", (e) => {
      e.stopPropagation();
      refsUi.groupId = id;
      const section = referenceGroupById(id);
      if (section && !section.builtin) {
        persistReferenceGroups(customReferenceGroupsPayload(id))
          .catch((err) => ggToast("Reference", referenceErrorText(err, "Could not collapse the group."), "warn"));
        return;
      }
      refsUi.collapsed[id] = !refsUi.collapsed[id];
      repaintShots();
    });
  });
}

function bindSelectionDetail(root) {
  const detail = root.querySelector(".gg-sel-detail");
  if (!detail || detail.dataset.bound) return;
  detail.dataset.bound = "1";
  detail.querySelectorAll("[data-field='prompt'], .gg-prompt-text").forEach((el) => bindMentionField(el));
  detail.addEventListener("change", (e) => {
    const ref = selectedReference();
    if (!ref) return;
    const field = e.target?.dataset?.field;
    if (field === "name") {
      renameReference(ref.id, e.target.value).catch((err) => ggToast("Reference", referenceErrorText(err, "References"), "warn"));
    } else if (field === "category") {
      changeReferenceCategory(ref.id, e.target.value).catch((err) => ggToast("Reference", referenceErrorText(err, "References"), "warn"));
    }
  });
  detail.addEventListener("input", (e) => {
    const ref = selectedReference();
    const field = e.target?.dataset?.field;
    if (!ref || (field !== "description" && field !== "prompt")) return;
    const prev = ref[field] || "";
    if (field === "prompt") {
      ref.prompt = e.target.value;
      syncPromptNodeFromField(ref.id, e.target.value);
    }
    scheduleCutFieldSave(ref.id, { [field]: e.target.value }, { [field]: prev });
  });
}

function paintCutRefStrip(root) {
  const host = root?.querySelector?.(".gg-cut-reflinks") || document.querySelector("#gg-root .gg-cut-reflinks");
  if (!host) return;
  const cut = selectedShot();
  const show = !!(cut && isNativeProject());
  host.hidden = !show;
  if (!show) {
    host.dataset.html = "";
    host.innerHTML = "";
    return;
  }
  const html = cutRefStripInnerHtml(cut);
  if (host.dataset.html !== html) {
    host.dataset.html = html;
    host.innerHTML = html;
    bindHoverPlay(host);
    bindThumbFallbacks(host);
  }
}

function refreshOpenCutRefChips() {
  const cut = selectedShot();
  paintCutRefStrip(document.querySelector("#gg-root"));
  if (!cut) return;
  const row = document.querySelector(`#gg-root .gg-cut[data-cut-id="${CSS.escape(cut.id)}"] .gg-cut-refthumbs`);
  if (row) {
    row.innerHTML = cutCardRefThumbsInner(cut);
    bindHoverPlay(row);
    bindThumbFallbacks(row);
  }
  placeEditTakesStrip();
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
    const ok = await persistOpenGraphEdits();
    if (!ok) throw new Error("save failed");
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
    flushCutWorkflowFiles();
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
  const persisted = await persistOpenGraphEdits();
  if (!persisted) {
    ggCutSwitchAutosaveBlocked = true;
    ggToast("Auto-save failed. Switch cancelled.", "Could not save this cut. Press Ctrl+S, then switch again.", "warn");
    return false;
  }
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
  wfLastLoadedStructureKey = "";
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

/** ComfyUI keeps App mode on a reused shot tab unless this workflow object says graph. */
function pinLoadedWorkflowToGraph(workflow) {
  if (!workflow || typeof workflow !== "object") return;
  try {
    workflow.initialMode = "graph";
    workflow.activeMode = "graph";
  } catch (_) {}
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
  // App templates set extra.linearMode. False opens the graph editor; linearData stays.
  const opensInGraph = hasLinearModeFlag(workflow);
  let graphToLoad = workflow;
  if (workflow?.extra?.linearMode === true) {
    graphToLoad = cloneGraph(workflow) || workflow;
    clearLinearMode(graphToLoad);
  }
  if (opensInGraph) pinLoadedWorkflowToGraph(loadTarget);
  const wantTypes = workflowNodeTypes(graphToLoad);
  try {
    if (isUiWorkflowGraph(workflow)) {
      if (typeof app.loadGraphData !== "function") return false;
      await app.loadGraphData(graphToLoad, true, true, loadTarget, { deferWarnings: true });
    } else if (typeof app.loadApiJson === "function") {
      await app.loadApiJson(graphToLoad, loadTarget, { deferWarnings: true });
    } else if (typeof app.loadGraphData === "function") {
      await app.loadGraphData(graphToLoad, true, true, loadTarget, { deferWarnings: true });
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
  if (opensInGraph) {
    pinLoadedWorkflowToGraph(ggOwnedShotWorkflow);
    clearLinearMode(app.graph);
  }
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
/** Structure-only key of the shared template on the shot tab (prompt/seed/image ignored). */
let wfLastLoadedStructureKey = "";
/** True while cut data is being written into the open graph (autosave must not treat that as an edit). */
let ggApplyingCutData = false;
/** Held for a whole cut switch so the outgoing prompt cannot be saved onto the incoming cut. */
let ggCutDataLock = 0;
/** Uploaded Load Image name for the video queue currently being serialized. */
let ggQueuedStartFile = "";
/** LoadImage node id chosen for that upload (linearData input, else the LoadImage node). */
let ggQueuedStartNode = "";
/** Snapshot taken just before queuePrompt, attached to the returned prompt_id. */
let ggPendingQueueSnap = null;
let ggQueuedRefFiles = [];
/** image1..image3 filenames for a Qwen Image Edit queue. null = this queue is not that template. */
let ggQueuedQwenImages = null;
let ggQueuedPromptPack = null;
/** Per-cut negative prompt, seed, input image, and frames. Positive prompt stays on the cut. */
const cutDataMap = new Map();
let cutDataFileTimer = 0;
/** null = not tried, true = server accepts the extra fields, false = this server does not. */
let cutDataServerOk = null;
let runSnapshots = { byPrompt: {}, byVersion: {} };
let runSnapTimer = 0;
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
  const { kind, workflow } = resolveEmptyCutWorkflow({ templateWorkflow: null });
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
    if (data?.workflow && data.source !== "template") {
      entry = {
        kind,
        workflow: data.workflow,
        source: data.source || "stored",
        fallback: "",
        key: workflowContentKey(data.workflow),
      };
    } else {
      const blank = emptyCutBlankGraph();
      entry = { kind, workflow: blank, source: "empty", fallback: "", key: workflowContentKey(blank), empty: true };
    }
  } catch (e) {
    if (projectMemory.generation() !== gen) return null;
    if (e?.status === 404) {
      const blank = emptyCutBlankGraph();
      entry = { kind, workflow: blank, source: "empty", fallback: "", key: workflowContentKey(blank), empty: true };
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
  void loadProjectCutData(pid, gen);
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
  if (!workflow || workflowNodeCount(workflow) === 0) {
    workflow = emptyCutBlankGraph();
    toastSummary = "Shot";
    toastDetail = "empty canvas";
    toastKind = "info";
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

function cutDataRel(pid) {
  return `workflows/gonggan/${pid}/cut-data.json`;
}

function templateFileRel(pid, kind) {
  return `workflows/gonggan/${pid}/template-${kind}.json`;
}

function runSnapRel(pid) {
  return `workflows/gonggan/${pid}/run-snapshots.json`;
}

function isWorkflowGraph(wf) {
  if (!wf || typeof wf !== "object") return false;
  if (Array.isArray(wf.nodes)) return true;
  return Object.values(wf).some((n) => n && typeof n === "object" && n.class_type);
}

async function readUserdataJson(rel) {
  try {
    const res = await api.fetchApi(`/userdata/${encodeURIComponent(rel)}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function writeUserdataJson(rel, obj) {
  const res = await api.fetchApi(`/userdata/${encodeURIComponent(rel)}?overwrite=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function loadProjectCutData(pid, gen) {
  const file = await readUserdataJson(cutDataRel(pid));
  if (projectMemory.generation() !== gen || projectMemory.pid() !== pid) return;
  cutDataMap.clear();
  const cuts = file?.cuts;
  if (cuts && typeof cuts === "object") {
    for (const [id, row] of Object.entries(cuts)) {
      if (row && typeof row === "object") cutDataMap.set(id, { ...row });
    }
  }
  for (const c of state.timeline?.cuts || []) {
    if (!c?.id) continue;
    const row = { ...(cutDataMap.get(c.id) || {}) };
    if (row.negative == null && typeof c.negative === "string" && c.negative) row.negative = c.negative;
    if (row.seed == null && c.seed != null) row.seed = c.seed;
    if (row.input_image == null && c.input_image) row.input_image = c.input_image;
    if (row.frames == null && c.frames != null) row.frames = c.frames;
    if (Object.keys(row).length) cutDataMap.set(c.id, row);
  }
  const snaps = await readUserdataJson(runSnapRel(pid));
  if (projectMemory.generation() !== gen || projectMemory.pid() !== pid) return;
  runSnapshots = snaps && typeof snaps === "object"
    ? { byPrompt: snaps.byPrompt || {}, byVersion: snaps.byVersion || {} }
    : { byPrompt: {}, byVersion: {} };
}

function scheduleCutDataFile() {
  clearTimeout(cutDataFileTimer);
  const pid = state.pid;
  cutDataFileTimer = setTimeout(() => {
    cutDataFileTimer = 0;
    if (!pid || pid !== state.pid) return;
    const cuts = {};
    for (const [id, row] of cutDataMap) cuts[id] = row;
    writeUserdataJson(cutDataRel(pid), { cuts }).catch((e) => console.warn("[gonggan] cut data save failed", e));
  }, 400);
}

function scheduleRunSnapFile() {
  clearTimeout(runSnapTimer);
  const pid = state.pid;
  runSnapTimer = setTimeout(() => {
    runSnapTimer = 0;
    if (!pid || pid !== state.pid) return;
    writeUserdataJson(runSnapRel(pid), runSnapshots).catch((e) => console.warn("[gonggan] run snapshot save failed", e));
  }, 400);
}

async function pushCutExtra(cutId, patch) {
  if (!cutId || !state.pid || cutDataServerOk === false) return;
  const fields = {};
  if (patch.negative != null) fields.negative = patch.negative;
  if (patch.seed != null && patch.seed !== "") fields.seed = Number(patch.seed);
  if (patch.input_image != null) fields.input_image = patch.input_image;
  if (patch.frames != null && patch.frames !== "") fields.frames = Number(patch.frames);
  if (!Object.keys(fields).length) return;
  try {
    await postJson("/gonggan/cut/update", { pid: state.pid, cut_id: cutId, fields });
    cutDataServerOk = true;
  } catch (e) {
    if (String(e?.message || "").includes("unsupported")) cutDataServerOk = false;
  }
}

function rememberCutExtra(cutId, patch) {
  if (!cutId || !patch) return;
  const row = { ...(cutDataMap.get(cutId) || {}) };
  for (const key of ["negative", "seed", "input_image", "frames", "image_take", "video_take"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) row[key] = patch[key];
  }
  cutDataMap.set(cutId, row);
  const c = cutById(cutId);
  if (c) {
    if (patch.negative != null) c.negative = patch.negative;
    if (patch.seed != null) c.seed = patch.seed;
    if (patch.input_image != null) c.input_image = patch.input_image;
    if (patch.frames != null) c.frames = patch.frames;
  }
  scheduleCutDataFile();
  const serverPatch = {};
  for (const key of ["negative", "seed", "input_image", "frames"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) serverPatch[key] = patch[key];
  }
  if (Object.keys(serverPatch).length) void pushCutExtra(cutId, serverPatch);
}

/** The still image Take used as a video's start frame. A selected video Take is never used. */
function selectedImageTakeId(cut) {
  if (!cut) return "";
  const row = cutDataMap.get(cut.id) || {};
  const picked = row.image_take || "";
  if (picked && isStillVersion(findCutVersion(cut, picked))) return picked;
  const stills = (cut.versions_list || []).filter(isStillVersion);
  return stills[0]?.id || "";
}

function noteTakeKind(cut, vid) {
  if (!cut || !vid) return;
  const ver = findCutVersion(cut, vid);
  if (!ver) return;
  if (isStillVersion(ver)) rememberCutExtra(cut.id, { image_take: vid });
  else if (ver.kind === "video" || ver.animated) rememberCutExtra(cut.id, { video_take: vid });
}

function readCutData(cut) {
  const row = cut?.id ? cutDataMap.get(cut.id) || {} : {};
  const storedImage = row.input_image != null ? row.input_image : (cut?.input_image || "");
  const imageTake = selectedImageTakeId(cut);
  const inputImage = imageTake || storedImage || "";
  let seed = row.seed != null ? row.seed : cut?.seed;
  seed = seed != null && seed !== "" ? Number(seed) : null;
  let frames = row.frames != null ? row.frames : cut?.frames;
  if (frames == null || frames === "") frames = framesForSeconds(cutGenerationSec(cut), 24);
  frames = frames != null && frames !== "" ? Number(frames) : null;
  return {
    positive: cut?.prompt != null ? String(cut.prompt) : "",
    negative: row.negative != null ? String(row.negative) : String(cut?.negative || ""),
    seed: Number.isFinite(seed) ? seed : null,
    inputImage: inputImage || "",
    frames: Number.isFinite(frames) ? frames : null,
  };
}

function structureKeyOf(graph) {
  const stripped = stripCutData(graph);
  return stripped ? workflowContentKey(stripped) : "";
}

async function ensureKindTemplate(kind, cut) {
  const cached = projectMemory.kindTemplate(kind);
  if (cached) return cached;
  const pid = state.pid;
  const gen = projectMemory.generation();
  const saved = await readUserdataJson(templateFileRel(pid, kind));
  if (projectMemory.generation() !== gen) return null;
  if (isWorkflowGraph(saved)) {
    projectMemory.setKindTemplate(kind, saved, gen);
    return saved;
  }
  const settings = state.timeline?.project?.settings || {};
  const ref = kind === "video" ? settings.video_template : settings.image_template;
  if (ref && !String(ref).startsWith("builtin:")) {
    const wf = await readUserdataJson(`workflows/${String(ref).replace(/^workflows\//, "")}`);
    if (projectMemory.generation() !== gen) return null;
    if (isWorkflowGraph(wf)) {
      projectMemory.setKindTemplate(kind, wf, gen);
      return wf;
    }
  }
  if (kind !== "video") {
    let legacy = projectMemory.template();
    if (!legacy) {
      const pending = projectMemory.templateInflight();
      if (pending) {
        await pending;
        legacy = projectMemory.template();
      }
    }
    if (!legacy) {
      try { legacy = await fetchProjectTemplatePayload(); } catch (_) {}
    }
    if (projectMemory.generation() !== gen) return null;
    if (isWorkflowGraph(legacy)) {
      projectMemory.setKindTemplate(kind, legacy, gen);
      return legacy;
    }
  }
  if (!cut?.id) return null;
  try {
    const data = await fetchCutSourceWorkflowPayload(cut.id, cut, kind);
    if (projectMemory.generation() !== gen) return null;
    if (isWorkflowGraph(data?.workflow)) {
      projectMemory.setKindTemplate(kind, data.workflow, gen);
      return data.workflow;
    }
  } catch (_) {}
  return null;
}

function liveNodeById(id) {
  if (!id) return null;
  const nodes = app.graph?._nodes || app.graph?.nodes || [];
  return nodes.find((n) => n && String(n.id) === String(id)) || null;
}

function setLiveTextNode(id, text) {
  const node = liveNodeById(id);
  if (!node) return;
  const value = text == null ? "" : String(text);
  const widgets = node.widgets || [];
  const w = widgets.find((x) => x && (x.name === "text" || x.name === "prompt"))
    || widgets.find((x) => x && typeof x.value === "string");
  if (w) {
    w.value = value;
    const el = w.element || w.inputEl;
    if (el && "value" in el && el.value !== value) el.value = value;
  }
  if (Array.isArray(node.widgets_values)) {
    const i = node.widgets_values.findIndex((v) => typeof v === "string");
    if (i >= 0) node.widgets_values[i] = value;
  }
  const named = node.widgets_values_named;
  if (named && typeof named === "object" && !Array.isArray(named)) {
    if (typeof named.text === "string") named.text = value;
    if (typeof named.prompt === "string") named.prompt = value;
  }
}

function setLiveSeedNodes(ids, seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return;
  const idSet = new Set((ids || []).map(String));
  if (!idSet.size) return;
  const nodes = app.graph?._nodes || app.graph?.nodes || [];
  for (const node of nodes) {
    if (!node || !idSet.has(String(node.id))) continue;
    for (const w of node.widgets || []) {
      if (w && (w.name === "seed" || w.name === "noise_seed")) w.value = n;
    }
  }
}

function widgetNameHit(widget, widgetName) {
  if (!widget) return false;
  const want = String(widgetName || "");
  return widget.name === want || widget.label === want || widget.sourceWidgetName === want;
}

function findLiveWidget(nodeId, widgetName) {
  const id = String(nodeId || "");
  const want = String(widgetName || "");
  if (!id || !want) return null;
  const direct = liveNodeById(id);
  const onNode = (node, sourceId) => {
    if (!node) return null;
    return (node.widgets || []).find((w) => {
      if (!widgetNameHit(w, want)) return false;
      const src = w.sourceNodeId != null && w.sourceNodeId !== "" ? String(w.sourceNodeId) : "";
      if (sourceId) return src === sourceId;
      return !src;
    }) || null;
  };
  const directHit = onNode(direct, "");
  if (directHit) return directHit;
  for (const node of liveGraphNodes()) {
    const promoted = onNode(node, id);
    if (promoted) return promoted;
    const innerList = node?.subgraph?._nodes || node?.subgraph?.nodes || [];
    const inner = innerList.find((n) => n && String(n.id) === id);
    const innerHit = onNode(inner, "");
    if (innerHit) return innerHit;
  }
  return null;
}

function readLiveWidgetValue(nodeId, widgetName) {
  const w = findLiveWidget(nodeId, widgetName);
  return w ? w.value : undefined;
}

function writeLiveWidget(widget, value) {
  if (!widget) return;
  widget.value = value;
  const values = widget.options?.values;
  if (Array.isArray(values) && value != null && value !== "" && !values.includes(value)) values.push(value);
  const el = widget.element || widget.inputEl;
  if (!el) return;
  if (el.type === "checkbox") el.checked = !!value;
  else if ("value" in el) {
    const shown = value == null ? "" : String(value);
    if (el.value !== shown) el.value = shown;
  }
}

function writeNamedOnNode(node, widgetName, value, sourceId) {
  if (!node) return false;
  const want = String(widgetName || "");
  let hit = false;
  for (const w of node.widgets || []) {
    if (!widgetNameHit(w, want)) continue;
    const src = w.sourceNodeId != null && w.sourceNodeId !== "" ? String(w.sourceNodeId) : "";
    if (sourceId) {
      if (src !== sourceId) continue;
    } else if (src) continue;
    writeLiveWidget(w, value);
    hit = true;
  }
  const named = node.widgets_values_named;
  if (hit && named && typeof named === "object" && !Array.isArray(named)) {
    named[want] = value;
  }
  return hit;
}

/**
 * Write a linearData input onto the live graph.
 * Root nodes are written directly. A subgraph input is the promoted widget
 * (`sourceNodeId` / `sourceWidgetName`) and the inner node. That is the value
 * graphToPrompt sends.
 */
function setLiveBoundWidget(binding, value) {
  const id = String(binding?.nodeId ?? "");
  const want = String(binding?.widget || binding?.label || "");
  const graphId = String(binding?.graphId || "");
  if (!id || !want) return false;
  let ok = false;
  if (!graphId) {
    const direct = liveNodeById(id);
    if (direct && writeNamedOnNode(direct, want, value, "")) ok = true;
    if (ok) {
      try { app.canvas?.setDirty?.(true, true); } catch (_) {}
      return true;
    }
  }
  for (const node of liveGraphNodes()) {
    const sub = node?.subgraph;
    const type = String(node?.type || node?.comfyClass || "");
    const subId = String(sub?.id || "");
    if (graphId && type !== graphId && subId !== graphId) continue;
    if (!graphId && !sub) continue;
    if (writeNamedOnNode(node, want, value, id)) ok = true;
    const innerList = sub?._nodes || sub?.nodes || [];
    const inner = innerList.find((n) => n && String(n.id) === id);
    if (inner && writeNamedOnNode(inner, want, value, "")) ok = true;
  }
  if (!ok) ok = writeBoundWidgetFallback(id, want, value, graphId);
  if (ok) {
    try { app.canvas?.setDirty?.(true, true); } catch (_) {}
  }
  return ok;
}

/** Promoted subgraph widgets sometimes miss sourceNodeId. Write the named value anyway. */
function writeBoundWidgetFallback(nodeId, widgetName, value, graphId) {
  const id = String(nodeId || "");
  const want = String(widgetName || "");
  let ok = false;
  const writeStore = (node) => {
    if (!node) return false;
    let hit = false;
    const named = node.widgets_values_named;
    if (named && typeof named === "object" && !Array.isArray(named) && Object.prototype.hasOwnProperty.call(named, want)
      && (named[want] == null || typeof named[want] !== "object")) {
      named[want] = value;
      if (Array.isArray(node.widgets_values)) {
        const idx = Object.keys(named).indexOf(want);
        if (idx >= 0 && idx < node.widgets_values.length) node.widgets_values[idx] = value;
      }
      hit = true;
    }
    for (const w of node.widgets || []) {
      if (!widgetNameHit(w, want)) continue;
      writeLiveWidget(w, value);
      hit = true;
    }
    return hit;
  };
  if (!graphId) {
    return writeStore(liveNodeById(id));
  }
  for (const node of liveGraphNodes()) {
    const type = String(node?.type || node?.comfyClass || "");
    const subId = String(node?.subgraph?.id || "");
    if (type !== graphId && subId !== graphId) continue;
    if (writeStore(node)) ok = true;
    const innerList = node?.subgraph?._nodes || node?.subgraph?.nodes || [];
    const inner = innerList.find((n) => n && String(n.id) === id);
    if (writeStore(inner)) ok = true;
  }
  return ok;
}

/** Write one widget on the live node (root graph, or the promoted subgraph widget). */
function setLiveNamedWidget(nodeId, widgetName, value) {
  return setLiveBoundWidget({ nodeId, widget: widgetName }, value);
}

function workflowSnapshotForCut(cutId) {
  if (!cutId) return null;
  if (
    wfLastLoadedCutId === cutId &&
    wfLastLoadedProjectId === state.pid &&
    app.graph?.extra?.gonggan?.cutId === cutId
  ) {
    const live = captureGraphWorkflowSnapshot();
    if (live) return live;
  }
  const stored = cutWorkflowMap.get(cutWorkflowKey(state.pid, cutId));
  return stored || null;
}

/**
 * The cut whose graph is being queued.
 * A stale or empty extra.gonggan pid (a workflow id, a subgraph id) must not skip the write
 * when this shot tab is the current project. The stamp is put back to state.pid.
 */
function openQueuedCut() {
  const extra = app.graph?.extra?.gonggan;
  const cutId = extra?.cutId ? String(extra.cutId) : "";
  if (!cutId || !state.pid || !isNativeProject()) return null;
  const cut = cutById(cutId);
  if (!cut) return null;
  const stamped = String(extra?.pid || extra?.projectId || "");
  const loadedHere = wfLastLoadedCutId === cutId && wfLastLoadedProjectId === state.pid;
  const stampOk = !stamped || stamped === state.pid;
  if (!loadedHere && !stampOk) return null;
  if (!loadedHere && !isGongganShotTabOpenAndActive()) return null;
  if (extra && (extra.pid !== state.pid || extra.projectId !== state.pid)) {
    extra.pid = state.pid;
    extra.projectId = state.pid;
  }
  return cut;
}

function openCutForLinear() {
  return openQueuedCut();
}

/** Prompt tab text for this cut. The visible field wins over the stored value. */
function promptTextForQueue(cut) {
  if (!cut) return "";
  const stored = cut.prompt != null ? String(cut.prompt) : "";
  const ta = document.querySelector(`.gg-cut[data-cut-id="${CSS.escape(cut.id)}"] textarea.gg-prompt-text:not(.gg-desc-text)`)
    || (cut.kind === "reference" ? document.querySelector("#gg-root .gg-sel-detail .gg-ref-prompt") : null);
  if (!ta || typeof ta.value !== "string") return stored;
  if (ta.value === stored || document.activeElement === ta) return ta.value;
  return stored;
}

/**
 * Copy the prompt tab into the linearData text widgets on the live nodes.
 * No linear positive binding: leave the graph alone (I13 / I14).
 * @returns {object | null}
 */
function applyLinearPromptsForOpenCut() {
  const cut = openCutForLinear();
  if (!cut) return null;
  const binding = linearBindings(captureGraphWorkflowSnapshot());
  if (!binding?.positive) return binding;
  const pack = ggQueuedPromptPack || queuePromptPack(cut);
  setLiveBoundWidget(binding.positive, liveQueuePrompt(pack));
  if (binding.negative) {
    const data = readCutData(cut);
    setLiveBoundWidget(binding.negative, data.negative || "");
  }
  return binding;
}

/** Slot values kept on the shared template (a cut with no value of its own falls back to these). */
function kindSlotDefaults(kind) {
  const tmpl = projectMemory.kindTemplate(kind);
  return tmpl ? extractCutData(tmpl) : { positive: "", negative: "", seed: null, inputImage: "", frames: null };
}

function setLiveFrames(id, frames) {
  const node = liveNodeById(id);
  if (!node) return;
  const n = Number(frames);
  if (!Number.isFinite(n)) return;
  const w = (node.widgets || []).find((x) => x && x.name === "length");
  if (w) w.value = n;
  else if (node.widgets && node.widgets[2]) node.widgets[2].value = n;
}

function syncPromptFieldFromGraph(cutId, text) {
  const c = cutById(cutId);
  if (!c || String(c.prompt || "") === String(text ?? "")) return;
  const before = c.prompt;
  c.prompt = text == null ? "" : String(text);
  scheduleCutFieldSave(cutId, { prompt: c.prompt }, { prompt: before || "" });
  const ta = document.querySelector(`.gg-cut[data-cut-id="${CSS.escape(cutId)}"] textarea.gg-prompt-text:not(.gg-desc-text)`);
  if (ta && document.activeElement !== ta) ta.value = c.prompt;
}

function syncPromptNodeFromField(cutId, text) {
  if (ggApplyingCutData || ggCutDataLock) return;
  if (wfLastLoadedCutId !== cutId || wfLastLoadedProjectId !== state.pid) return;
  if (!isGongganShotTabOpenAndActive()) return;
  const snap = captureGraphWorkflowSnapshot();
  const binding = linearBindings(snap);
  const value = text == null ? "" : String(text);
  if (binding?.positive) {
    ggApplyingCutData = true;
    try {
      setLiveBoundWidget(binding.positive, value);
      rememberWorkflowBaselineFromActiveGraph(cutId);
    } finally {
      ggApplyingCutData = false;
    }
    return;
  }
  const id = snap ? cutSlotIds(snap).promptId : "";
  if (!id) return;
  ggApplyingCutData = true;
  try {
    setLiveTextNode(id, text);
    rememberWorkflowBaselineFromActiveGraph(cutId);
  } finally {
    ggApplyingCutData = false;
  }
}

async function applyLiveCutData(cut, data, loadToken) {
  if (isLoadTokenStale(loadToken)) return;
  const snap = captureGraphWorkflowSnapshot();
  const ids = snap ? cutSlotIds(snap) : null;
  const kind = workflowKindForCut(cut);
  const base = kindSlotDefaults(kind);
  const seed = data.seed != null ? data.seed : base.seed;
  const frames = data.frames != null ? data.frames : base.frames;
  const fileImage = isImageFileName(data.inputImage)
    ? String(data.inputImage).trim()
    : (isImageFileName(base.inputImage) ? String(base.inputImage).trim() : "");
  ggApplyingCutData = true;
  try {
    if (ids?.promptId) setLiveTextNode(ids.promptId, data.positive);
    if (ids?.negativeId) setLiveTextNode(ids.negativeId, data.negative);
    if (seed != null) setLiveSeedNodes(ids?.seedIds, seed);
    if (frames != null) setLiveFrames(ids?.lengthId, frames);
    if (kind === "video") {
      const ver = findCutVersion(cut, data.inputImage);
      if (isStillVersion(ver)) {
        try {
          const name = await copyVersionImageToInput(ver.id);
          if (!isLoadTokenStale(loadToken)) applyLiveVideoImage(findVideoImageTarget(snap), name);
        } catch (e) {
          console.warn("[gonggan] cut start image", e);
        }
      } else if (fileImage) {
        applyLiveVideoImage(findVideoImageTarget(snap), fileImage);
      }
    } else if (fileImage) {
      const node = liveNodeById(ids?.imageId) || liveStartImageNode();
      if (node) setLiveLoadImageWidget(node, fileImage);
    }
  } finally {
    ggApplyingCutData = false;
  }
  if (!isLoadTokenStale(loadToken) && cut?.id) rememberWorkflowBaselineFromActiveGraph(cut.id);
}

function cutWorkflowKey(pid, cutId) {
  return `${pid}\n${cutId}`;
}

function cutWorkflowRel(pid, cutId) {
  return `workflows/gonggan/${pid}/cut-workflows/${cutId}.json`;
}

/** cutId -> full graph saved this session. */
const cutWorkflowMap = new Map();
const cutWorkflowTimers = new Map();

function scheduleCutWorkflowFile(cutId) {
  const pid = state.pid;
  const key = cutWorkflowKey(pid, cutId);
  clearTimeout(cutWorkflowTimers.get(key));
  cutWorkflowTimers.set(key, setTimeout(() => {
    cutWorkflowTimers.delete(key);
    const wf = cutWorkflowMap.get(key);
    if (!wf || pid !== state.pid) return;
    writeUserdataJson(cutWorkflowRel(pid, cutId), { workflow: wf, updated: Date.now() }).catch((e) => {
      console.warn("[gonggan] cut workflow save failed", e);
    });
  }, 400));
}

function flushCutWorkflowFiles() {
  const pid = state.pid;
  if (!pid) return;
  for (const [key, timer] of cutWorkflowTimers) {
    if (!key.startsWith(`${pid}\n`)) continue;
    clearTimeout(timer);
    cutWorkflowTimers.delete(key);
    const wf = cutWorkflowMap.get(key);
    const cutId = key.slice(pid.length + 1);
    if (wf) {
      writeUserdataJson(cutWorkflowRel(pid, cutId), { workflow: wf, updated: Date.now() }).catch(() => {});
    }
  }
}

function pushCutWorkflow(pid, cutId, workflow) {
  postJson("/gonggan/cut/workflow", { pid, cut_id: cutId, workflow }).catch((e) => {
    if (e?.status && e.status !== 404) console.warn("[gonggan] cut workflow route", e);
  });
}

/**
 * Write the live graph onto `cutId` only.
 * Refuses the write when the open graph belongs to a different cut, so a switch cannot
 * store the outgoing graph as the incoming cut.
 */
async function saveCutWorkflowNow(cutId, { flush = false } = {}) {
  if (!cutId || ggApplyingCutData) return true;
  const graphCut = app.graph?.extra?.gonggan?.cutId || "";
  if (graphCut !== cutId || wfLastLoadedCutId !== cutId || wfLastLoadedProjectId !== state.pid) return true;
  if (!isGongganShotTabOpenAndActive()) return true;
  clearLinearMode(app.graph);
  const current = captureGraphWorkflowSnapshot();
  if (!current || !Array.isArray(current.nodes)) return true;
  const baseline = ggWorkflowBaselines.get(cutId) || null;
  let changed = !baseline;
  if (baseline) {
    try {
      changed = workflowContentKey(current) !== workflowContentKey(baseline);
    } catch {
      changed = true;
    }
    const now = extractCutData(current);
    const prev = extractCutData(baseline);
    if (!linearBindings(current)?.positive && now.positive !== prev.positive) syncPromptFieldFromGraph(cutId, now.positive);
  }
  if (!changed) return true;
  const copy = cloneGraph(current);
  if (!copy) return false;
  clearLinearMode(copy);
  const pid = state.pid;
  const key = cutWorkflowKey(pid, cutId);
  cutWorkflowMap.set(key, copy);
  rememberWorkflowInMemory(cutId, cutById(cutId), copy);
  rememberWorkflowBaselineForCut(cutId, copy);
  pushCutWorkflow(pid, cutId, copy);
  if (!flush) {
    scheduleCutWorkflowFile(cutId);
    return true;
  }
  clearTimeout(cutWorkflowTimers.get(key));
  cutWorkflowTimers.delete(key);
  try {
    await writeUserdataJson(cutWorkflowRel(pid, cutId), { workflow: copy, updated: Date.now() });
    return true;
  } catch (e) {
    console.warn("[gonggan] cut workflow save failed", e);
    return false;
  }
}

async function persistOpenGraphEdits() {
  if (ggApplyingCutData || ggCutDataLock) return true;
  const cutId = app.graph?.extra?.gonggan?.cutId || "";
  if (!cutId) return true;
  return saveCutWorkflowNow(cutId);
}

/** I9 shared-template injection is off. Cut switch loads the cut's own graph. */
async function openCutOnSharedTemplate() {
  return "miss";
}

async function resolveCutOwnWorkflow(cut) {
  const pid = state.pid;
  const key = cutWorkflowKey(pid, cut.id);
  if (cutWorkflowMap.has(key)) return cutWorkflowMap.get(key);
  const file = await readUserdataJson(cutWorkflowRel(pid, cut.id));
  if (file && isWorkflowGraph(file.workflow)) {
    cutWorkflowMap.set(key, file.workflow);
    return file.workflow;
  }
  try {
    const json = await fetchCutWorkingCopyJson(cut);
    if (json && shouldRestoreWip(json, { cutId: cut.id, baseKey: cutBaseKey(cut) }) && isWorkflowGraph(json)) {
      return json;
    }
  } catch (_) {}
  try {
    const data = await fetchCutSourceWorkflowPayload(cut.id, cut);
    if (data?.workflow && data.source !== "template" && isWorkflowGraph(data.workflow)) return data.workflow;
  } catch (_) {}
  return emptyCutBlankGraph();
}

async function loadCutWorkflow(cutId, cut, loadToken) {
  const tl = state.timeline;
  if (!tl || !cutId) return;
  if (isLoadTokenStale(loadToken)) return;
  const cutRec = cut || cutById(cutId);
  if (!cutRec) return;
  if (
    wfLastLoadedCutId === cutId &&
    wfLastLoadedProjectId === state.pid &&
    isGongganShotTabOpenAndActive()
  ) return;
  const outgoingId = wfLastLoadedCutId;
  if (
    outgoingId &&
    outgoingId !== cutId &&
    wfLastLoadedProjectId === state.pid &&
    app.graph?.extra?.gonggan?.cutId === outgoingId
  ) {
    const saved = await saveCutWorkflowNow(outgoingId, { flush: true });
    if (isLoadTokenStale(loadToken)) return;
    if (saved === false) {
      ggCutSwitchAutosaveBlocked = true;
      ggToast("Auto-save failed. Switch cancelled.", "Could not save this cut. Press Ctrl+S, then switch again.", "warn");
      return;
    }
  }
  if (isLoadTokenStale(loadToken)) return;
  ggCutDataLock++;
  try {
    const workflow = await resolveCutOwnWorkflow(cutRec);
    if (isLoadTokenStale(loadToken)) return;
    const kind = workflowKindForCut(cutRec);
    const entry = {
      kind,
      workflow: workflow || emptyCutBlankGraph(),
      source: workflowNodeCount(workflow) ? "stored" : "empty",
      fallback: "",
      key: workflowContentKey(workflow || emptyCutBlankGraph()),
      empty: workflowNodeCount(workflow) === 0,
    };
    projectMemory.setWorkflow(cutId, entry, projectMemory.generation());
    await openStoredCutWorkflow(cutId, cutRec, loadToken, entry);
    if (!isLoadTokenStale(loadToken)) await adoptStoredCutFieldsIfBlank(cutRec, loadToken);
  } finally {
    ggCutDataLock--;
  }
}

/** If this cut's graph has no prompt yet, copy the cut's saved prompt and seed in once. */
async function adoptStoredCutFieldsIfBlank(cut, loadToken) {
  if (!cut || isLoadTokenStale(loadToken)) return;
  if (wfLastLoadedCutId !== cut.id || app.graph?.extra?.gonggan?.cutId !== cut.id) return;
  const snap = captureGraphWorkflowSnapshot();
  if (!snap || !Array.isArray(snap.nodes) || !snap.nodes.length) return;
  const binding = linearBindings(snap);
  if (binding?.positive) {
    const data = readCutData(cut);
    const text = data.positive;
    ggApplyingCutData = true;
    try {
      if (text) setLiveNamedWidget(binding.positive.nodeId, binding.positive.widget, text);
      else {
        const current = readLiveWidgetValue(binding.positive.nodeId, binding.positive.widget);
        if (typeof current === "string" && current.trim()) syncPromptFieldFromGraph(cut.id, current);
      }
      if (binding.negative && data.negative) {
        setLiveNamedWidget(binding.negative.nodeId, binding.negative.widget, data.negative);
      }
    } finally {
      ggApplyingCutData = false;
    }
    rememberWorkflowBaselineFromActiveGraph(cut.id);
    return;
  }
  const now = extractCutData(snap);
  if (now.positive) return;
  const data = readCutData(cut);
  if (!data.positive && !data.negative && data.seed == null) return;
  const ids = cutSlotIds(snap);
  ggApplyingCutData = true;
  try {
    if (ids.promptId && data.positive) setLiveTextNode(ids.promptId, data.positive);
    if (ids.negativeId && data.negative) setLiveTextNode(ids.negativeId, data.negative);
    if (data.seed != null && ids.seedIds?.length) setLiveSeedNodes(ids.seedIds, data.seed);
  } finally {
    ggApplyingCutData = false;
  }
  await saveCutWorkflowNow(cut.id);
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

/** Explicit "Load workflow from this take": that Take's graph becomes this cut's current workflow. */
async function loadWorkflowFromTake(cutId, vid) {
  const cut = cutById(cutId);
  if (!cut || !vid || !isNativeProject()) return;
  const label = loadTakeWorkflowLabel(captionLangNow());
  let wf = null;
  try {
    const snap = runSnapshots.byVersion?.[vid];
    const merged = mergeLegacyTake(findCutVersion(cut, vid)?.gen, snap);
    if (merged.workflow && isWorkflowGraph(merged.workflow)) wf = merged.workflow;
    if (!wf) wf = await fetchEmbeddedVersionWorkflow(vid);
    if (!wf) wf = await fetchStoredVersionWorkflow(cutId, vid);
  } catch (e) {
    console.warn("[gonggan] take workflow failed", e);
  }
  if (!wf || !isWorkflowGraph(wf)) {
    ggToast(label, "This take has no stored workflow.", "warn");
    return;
  }
  const outgoingId = wfLastLoadedCutId;
  if (outgoingId && outgoingId !== cutId && app.graph?.extra?.gonggan?.cutId === outgoingId) {
    await saveCutWorkflowNow(outgoingId, { flush: true });
  }
  const loadToken = ++wfLoadToken;
  ggCutDataLock++;
  try {
    const loaded = await loadWorkflowIntoDedicatedTab(cloneGraph(wf), cut, loadToken);
    if (isLoadTokenStale(loadToken) || !loaded) return;
    markWorkflowLoadComplete(cutId, cut);
    markGraphGongganCut(cutId);
    wfOpenVersion = { projectId: state.pid, cutId, vid };
    await saveCutWorkflowNow(cutId, { flush: true });
    ggToast(label, shotTitle(cut), "ok");
    bus.dispatchEvent(new Event("gg-opentab"));
  } finally {
    ggCutDataLock--;
  }
}

async function loadVersionWorkflow(cutId, vid) {
  await loadWorkflowFromTake(cutId, vid);
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
let userWorkflowPathsLoaded = false;

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
  } finally {
    userWorkflowPathsLoaded = true;
  }
  return userWorkflowPaths;
}

function syncTplUseLastButton(root) {
  const btn = root?.querySelector(".gg-tpl-use-last");
  if (!btn) return;
  const last = loadLastTemplate(localStorage);
  const show = !projectTemplateRef && typeof last === "string" && !!last && (isBuiltinTemplate(last) || isAppWorkflowFile(last));
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

async function saveAiFeaturesIfChanged(input, initial) {
  if (!input) return false;
  const next = !!input.checked;
  if (next === !!initial) return false;
  saveAiFeatures(localStorage, next);
  try {
    await postJson("/gonggan/ai-features", { enabled: next });
  } catch (err) {
    if (err?.status !== 404 && err?.status !== 405) throw err;
  }
  aiFeaturesOn = next;
  aiFeaturesAdopted = true;
  bus.dispatchEvent(new Event("ai-features"));
  if (next) void offerStoredAiMakeCutResult();
  return true;
}

async function adoptServerAiFeaturesIfUnset() {
  if (aiFeaturesAdopted || aiFeaturesChoiceSaved(localStorage)) {
    aiFeaturesAdopted = true;
    return;
  }
  aiFeaturesAdopted = true;
  try {
    const d = await getJson("/gonggan/settings");
    if (typeof d?.ai_features !== "boolean" || d.ai_features === aiFeaturesOn) return;
    aiFeaturesOn = d.ai_features;
    bus.dispatchEvent(new Event("ai-features"));
    if (aiFeaturesOn) {
      void refreshCutSplitUseAi();
      void offerStoredAiMakeCutResult();
    }
  } catch (_) {}
}

async function refreshCutSplitUseAi() {
  if (!aiFeaturesActive()) return;
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

/** Where New Cut goes. Null means nothing is selected, so the list-end behavior stays. */
function selectedCutInsert() {
  const cuts = state.timeline?.cuts || [];
  const groups = state.timeline?.groups || [];
  if (shotsUi.selFromGroup && shotsUi.selGroupKey && !shotsUi.refTab) {
    const sections = shotsSections(cuts, groups);
    if (shotsUi.selGroupKey === "ungrouped") {
      const loose = sections.find((s) => s.type === "ungrouped");
      const last = loose?.cuts?.[loose.cuts.length - 1];
      return last?.id ? { after: last.id, group: null } : null;
    }
    const sec = sections.find((s) => s.group && s.group.id === shotsUi.selGroupKey);
    if (!sec) return null;
    const last = sec.cuts[sec.cuts.length - 1];
    return { after: last?.id || null, group: shotsUi.selGroupKey };
  }
  const id = state.cutId && cuts.some((c) => c.id === state.cutId) ? state.cutId : (cutSelIds()[0] || "");
  if (!id) return null;
  const cut = cuts.find((c) => c.id === id);
  if (!cut) return null;
  return { after: cut.id, group: cut.group_id || null };
}

async function addLocalCut() {
  if (!state.pid) {
    ggToast("Cut", "Pick a project in the list first.", "warn");
    return;
  }
  const cuts = state.timeline ? state.timeline.cuts : [];
  const groups = state.timeline ? state.timeline.groups || [] : [];
  const placed = selectedCutInsert();
  const { after, group } = placed || addCutTargetAtListEnd({ timelineCuts: cuts, groups });
  const body = { pid: state.pid };
  if (group) body.group = group;
  if (after) body.after = after;
  const newKind = templateKindForNewCut(loadQueueMode(localStorage), state.cutId ? workflowKindForCut(cutById(state.cutId)) : null);
  if (newKind === "video") body.kind = "video";
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

/** Confirm label for AI Make Cut: Video template when the new cuts are video cuts, otherwise Image. */
function cutListTemplateForNewCuts(settings) {
  const kind = templateKindForNewCut(loadQueueMode(localStorage), state.cutId ? workflowKindForCut(cutById(state.cutId)) : null);
  if (kind === "video") return cutListWorkflow(settings);
  const ref = String(settings?.image_template || "").trim();
  return { id: "", label: `Project Image template (${templateLabel(ref)})` };
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
  const listBody = cutListPayload(reqPid, cuts, wf.id, order[order.length - 1]);
  const listKind = templateKindForNewCut(loadQueueMode(localStorage), state.cutId ? workflowKindForCut(cutById(state.cutId)) : null);
  if (listKind === "video") listBody.kind = "video";
  const d = await postJson("/gonggan/cut/add-list", listBody);
  if (d.timeline && adoptMutationTimeline(d.timeline, reqPid)) bus.dispatchEvent(new Event("timeline"));
  else await loadTimeline();
  const ids = d.cut_ids || [];
  if (ids.length) {
    recordShotsEntry(reqPid, { kind: "cuts", op: "add", ids, before, after: snapshotOrderGroups(state.timeline) }, ids.length === 1 ? "Add cut" : `Add ${ids.length} cuts`);
    selectCut(ids[0]);
  }
  const listTemplate = listKind === "video" ? "Video" : "Image";
  ggToast(`Created ${ids.length} cut${ids.length === 1 ? "" : "s"}`, `Each cut has the project's ${listTemplate} template with its prompt field set. Select them and press Queue to render in order.`, "ok");
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
  if (!aiFeaturesActive() || !isNativeProject() || document.querySelector(".gg-aisplit-modal")) return;
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
      if (await createCutsFromList(state.pid, result.cuts, cutListTemplateForNewCuts(state.timeline?.project?.settings))) {
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

/** Reference cards in group order. Collapsed groups stay out of Shift-range and Select All. */
function referenceDisplayOrder({ includeHidden = false } = {}) {
  const ids = [];
  for (const g of referenceGroupSections()) {
    if (!includeHidden && g.collapsed) continue;
    for (const r of activeReferences()) {
      if ((r.category || "Other") === g.name) ids.push(r.id);
    }
  }
  return ids;
}

function selectionListOrder() {
  if (shotsUi.refTab && isNativeProject()) return referenceDisplayOrder();
  return displayedCutIds();
}

function selectCutRange(fromId, toId) {
  clearSceneGroupSelection();
  const order = selectionListOrder();
  const i = order.indexOf(fromId);
  const j = order.indexOf(toId);
  if (i < 0 || j < 0) return;
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  state.cutSel.clear();
  for (let k = lo; k <= hi; k++) state.cutSel.add(order[k]);
  state.cutId = toId;
  noteLastShot(toId);
  cutSelAnchor = fromId;
  bus.dispatchEvent(new Event("select"));
  const t = clipStartOf(toId);
  if (t != null && typeof seek === "function" && selectionMovesPlayhead()) {
    play.idx = -1;
    seek(t + 0.001);
  }
}

function rememberReferenceGroup(id) {
  const ref = referenceById(id);
  if (!ref) return;
  const group = referenceGroupSections().find((g) => g.name === (ref.category || "Other"));
  if (group) refsUi.groupId = group.id;
}

/** Scene ids in cut-list order, including empty scenes. */
function sceneGroupOrder() {
  const cuts = state.timeline?.cuts || [];
  const groups = state.timeline?.groups || [];
  return shotsSections(cuts, groups).filter((s) => s.type === "group" && s.group?.id).map((s) => s.group.id);
}

function selectedSceneGroupIds() {
  const have = state.groupSel;
  return sceneGroupOrder().filter((id) => have.has(id));
}

/** Keep New Cut aimed at a single selected scene. Leave reference-group selection alone. */
function syncGroupSelectionFlags(focusId) {
  const ids = selectedSceneGroupIds();
  if (ids.length === 1) {
    shotsUi.selFromGroup = true;
    shotsUi.selGroupKey = ids[0];
    return;
  }
  if (ids.length > 1) {
    shotsUi.selFromGroup = false;
    shotsUi.selGroupKey = focusId && ids.includes(focusId) ? focusId : ids[ids.length - 1];
    return;
  }
  if ((state.timeline?.groups || []).some((g) => g.id === shotsUi.selGroupKey)) {
    shotsUi.selFromGroup = false;
    shotsUi.selGroupKey = "";
  }
}

function clearSceneGroupSelection() {
  if (!state.groupSel.size && !groupSelAnchor) {
    syncGroupSelectionFlags("");
    return;
  }
  state.groupSel.clear();
  groupSelAnchor = "";
  syncGroupSelectionFlags("");
}

/** Replace the scene selection. `keepCuts` leaves a marquee's cut selection in place. */
function setSceneGroupSelection(ids, { keepCuts = false, focusId = "" } = {}) {
  const have = new Set(ids || []);
  state.groupSel.clear();
  for (const id of sceneGroupOrder()) if (have.has(id)) state.groupSel.add(id);
  const picked = selectedSceneGroupIds();
  groupSelAnchor = picked[0] || "";
  if (!keepCuts) {
    state.cutSel.clear();
    cutSelAnchor = "";
  }
  shotsUi.selTarget = "list";
  syncGroupSelectionFlags(focusId || picked[picked.length - 1] || "");
  bus.dispatchEvent(new Event("select"));
}

/** Click a scene header or timeline scene bar. Ctrl toggles, Shift extends, like cuts. */
function selectSceneGroup(groupId, { multi = false, range = false } = {}) {
  const order = sceneGroupOrder();
  if (!order.includes(groupId)) return;
  shotsUi.selTarget = "list";
  if (range) {
    const anchor = groupSelAnchor && order.includes(groupSelAnchor) ? groupSelAnchor : (selectedSceneGroupIds()[0] || groupId);
    const i = order.indexOf(anchor);
    const j = order.indexOf(groupId);
    const lo = Math.min(i < 0 ? j : i, j);
    const hi = Math.max(i < 0 ? j : i, j);
    state.groupSel.clear();
    for (let k = lo; k <= hi; k++) state.groupSel.add(order[k]);
    groupSelAnchor = anchor;
  } else if (multi) {
    if (state.groupSel.has(groupId)) state.groupSel.delete(groupId);
    else state.groupSel.add(groupId);
    groupSelAnchor = groupId;
  } else {
    state.groupSel.clear();
    state.groupSel.add(groupId);
    groupSelAnchor = groupId;
  }
  state.cutSel.clear();
  cutSelAnchor = "";
  syncGroupSelectionFlags(groupId);
  bus.dispatchEvent(new Event("select"));
}

/** Click a scene or reference-group header: select every item in it. Ctrl toggles, Shift extends. */
function selectListedGroup(ids, { multi = false, range = false, groupKey = "" } = {}) {
  clearSceneGroupSelection();
  const order = selectionListOrder();
  const raw = ids.filter(Boolean);
  const inOrder = order.filter((id) => raw.includes(id));
  const groupIds = inOrder.length ? inOrder : raw;
  shotsUi.selTarget = "list";
  shotsUi.selGroupKey = groupKey;
  if (!groupIds.length) {
    shotsUi.selFromGroup = true;
    state.cutSel.clear();
    cutSelAnchor = "";
    bus.dispatchEvent(new Event("select"));
    return;
  }
  if (range && inOrder.length) {
    const anchor = cutSelAnchor || state.cutId || groupIds[0];
    const marks = groupIds.map((id) => order.indexOf(id)).filter((i) => i >= 0);
    const ai = order.indexOf(anchor);
    const start = Math.min(ai >= 0 ? ai : marks[0], ...marks);
    const end = Math.max(ai >= 0 ? ai : marks[0], ...marks);
    state.cutSel.clear();
    for (let i = start; i <= end; i++) if (order[i]) state.cutSel.add(order[i]);
    state.cutId = groupIds[groupIds.length - 1];
    cutSelAnchor = anchor;
    shotsUi.selFromGroup = false;
  } else if (multi) {
    if (!state.cutSel.size && state.cutId) state.cutSel.add(state.cutId);
    const allOn = groupIds.every((id) => state.cutSel.has(id));
    if (allOn) groupIds.forEach((id) => state.cutSel.delete(id));
    else groupIds.forEach((id) => state.cutSel.add(id));
    state.cutId = groupIds[groupIds.length - 1];
    cutSelAnchor = groupIds[0];
    shotsUi.selFromGroup = false;
  } else {
    state.cutSel.clear();
    groupIds.forEach((id) => state.cutSel.add(id));
    state.cutId = groupIds[groupIds.length - 1];
    cutSelAnchor = groupIds[0];
    shotsUi.selFromGroup = true;
  }
  rememberReferenceGroup(state.cutId);
  noteLastShot(state.cutId);
  bus.dispatchEvent(new Event("select"));
  const t = clipStartOf(state.cutId);
  if (t != null && typeof seek === "function" && selectionMovesPlayhead()) {
    play.idx = -1;
    seek(t + 0.001);
  }
}

/** Selection seeks the playhead, except while a playback stop is applying the cut under it. */
function selectionMovesPlayhead() {
  return !play.on && !selectionHoldsPlayhead;
}

function selectCut(cutId, opts) {
  const range = opts && opts.range;
  const multi = opts && opts.multi;
  const fromTimeline = !!(opts && opts.fromTimeline);
  clearSceneGroupSelection();
  shotsUi.selFromGroup = false;
  shotsUi.selTarget = "list";
  if (range) {
    const anchor = cutSelAnchor || state.cutId || cutId;
    selectCutRange(anchor, cutId);
    rememberReferenceGroup(cutId);
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
  noteLastShot(cutId);
  rememberReferenceGroup(cutId);
  bus.dispatchEvent(new Event("select"));
  const keepPlayhead = !!(opts && opts.keepPlayhead);
  const t = clipStartOf(cutId);
  if (t != null && typeof seek === "function" && selectionMovesPlayhead() && !keepPlayhead) {
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

function referenceSelIds() {
  const refs = activeReferences();
  const order = referenceDisplayOrder({ includeHidden: true });
  const ids = order.filter((id) => state.cutSel.has(id) && refs.some((r) => r.id === id));
  if (!ids.length && referenceById(state.cutId)) ids.push(state.cutId);
  return ids;
}

function cutsForDelete() {
  if (shotsUi.refTab && isNativeProject()) return referenceSelIds();
  return cutSelIds();
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
    noteLastShot(state.cutId);
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
    const refNoun = shotsUi.refTab ? "reference" : "cut";
    recordShotsEntry(reqPid, entry, n === 1 ? `Delete ${refNoun}` : `Delete ${n} ${refNoun}s`);
    const toast = shotsUi.refTab
      ? (n === 1 ? "Deleted 1 reference" : `Deleted ${n} references`)
      : movedToTrashToastMessage(n);
    ggToast(toast, "", "ok", {
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
  const addedKind = templateKindForNewCut(loadQueueMode(localStorage), workflowKindForCut(cutById(cutId)));
  if (addedKind === "video") body.kind = "video";
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
  if (step?.scope === "timeline") {
    const snap = snapshotTimelineEdit(state.timeline);
    if (snap && step.entry?.list) snap.list = snapshotOrderGroups(state.timeline);
    return snap;
  }
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
    if (snap.list && Array.isArray(snap.list.order)) {
      clearTimeout(ed.saveTimer);
      ed.savePending = true;
      await enqueueReorderPersist(() => persistShotsReorder(snap.list.order, snap.list.groups || []));
    } else {
      scheduleSave();
    }
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
  clearSceneGroupSelection();
  state.cutSel.clear();
  state.cutSel.add(cutId);
  cutSelAnchor = cutId;
  state.cutId = cutId;
  noteLastShot(cutId);
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
    workflowEmpty: cutWorkflowIsEmpty(cutId),
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

function cutWorkflowIsEmpty(cutId) {
  const key = cutWorkflowKey(state.pid, cutId);
  if (cutWorkflowMap.has(key)) return workflowNodeCount(cutWorkflowMap.get(key)) === 0;
  const live = liveCutGraphNodeCount(cutId);
  if (live != null) return live === 0;
  return false;
}

function templateChoicesForCut(cutId) {
  const settings = state.timeline?.project?.settings || {};
  const items = [
    { label: "Image template", action: () => { void loadTemplateIntoCut(cutId, settings.image_template); } },
    { label: "Video template", action: () => { void loadTemplateIntoCut(cutId, settings.video_template); } },
  ];
  const used = new Set(
    [settings.image_template, settings.video_template].map((r) => String(r || "").trim()).filter(Boolean),
  );
  for (const p of templateListPaths(userWorkflowPaths)) {
    if (used.has(p)) continue;
    used.add(p);
    items.push({
      label: shortTemplateName(p, 42),
      title: p,
      action: () => { void loadTemplateIntoCut(cutId, p); },
    });
  }
  if (!items.length) return [{ label: "No templates", disabled: true }];
  return items;
}

async function fetchTemplateGraph(ref) {
  const wanted = String(ref || "").trim();
  if (!wanted) return null;
  const pid = state.pid;
  try {
    const d = await getJson(`/gonggan/template?pid=${encodeURIComponent(pid)}&ref=${encodeURIComponent(wanted)}`);
    if (d && d.ref === wanted && isWorkflowGraph(d.workflow)) return d.workflow;
  } catch (_) {}
  if (!wanted.startsWith("builtin:")) {
    const wf = await readUserdataJson(`workflows/${wanted.replace(/^workflows\//, "")}`);
    if (isWorkflowGraph(wf)) return wf;
  }
  const kind = wanted.includes("video") ? "video" : "image";
  const saved = await readUserdataJson(templateFileRel(pid, kind));
  return isWorkflowGraph(saved) ? saved : null;
}

/** Copy a template into an empty cut. The template file itself is not changed. */
async function loadTemplateIntoCut(cutId, ref) {
  const cut = cutById(cutId);
  if (!cut || !isNativeProject()) return;
  if (!cutWorkflowIsEmpty(cutId)) {
    ggToast("Load template", "This cut already has a workflow.", "warn");
    return;
  }
  const graph = await fetchTemplateGraph(ref);
  if (!graph) {
    ggToast("Load template", "Could not read that template.", "warn");
    return;
  }
  const filled = applyCutData(cloneGraph(graph), readCutData(cut)) || graph;
  const loadToken = ++wfLoadToken;
  ggCutDataLock++;
  try {
    const loaded = await loadWorkflowIntoDedicatedTab(filled, cut, loadToken);
    if (isLoadTokenStale(loadToken) || !loaded) return;
    markWorkflowLoadComplete(cutId, cut);
    markGraphGongganCut(cutId);
    const videoRef = String(state.timeline?.project?.settings?.video_template || "").trim();
    const usingVideo = (videoRef && String(ref || "").trim() === videoRef) || queueGraphIsVideo(cut) || graphLooksLikeVideo(filled);
    if (usingVideo) {
      if (videoRef && String(ref || "").trim() === videoRef) wfLastLoadedKind = "video";
      ggApplyingCutData = true;
      try { await feedVideoCutStartImage({ force: true }); } catch (_) {}
      ggApplyingCutData = false;
    }
    await saveCutWorkflowNow(cutId, { flush: true });
    ggToast("Load template", shotTitle(cut), "ok");
  } finally {
    ggCutDataLock--;
  }
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
    aiMakeCut: aiFeaturesActive(),
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
        loadTemplate: () => loadTemplateIntoCut(cutId),
        aiMakeCut: () => openAiCutSplitModal(),
        del: () => { void confirmDeleteSelectedCuts(); },
      },
      {
        ...(nat ? { moveToScene: buildMoveToSceneSubmenu(ids) } : {}),
        loadTemplate: templateChoicesForCut(cutId),
      },
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
        void confirmDeleteSelectedCuts();
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
  if (shotsUi.refTab && isNativeProject() && state.projects.length) {
    e.preventDefault();
    e.stopPropagation();
    showCtxMenu(e.clientX, e.clientY, [
      { label: "New Group", action: () => { void addReferenceGroup(); } },
      { label: "New Reference", action: () => { void addReferenceInSelectedGroup(); } },
    ]);
    return;
  }
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
  if (nat && aiFeaturesActive()) {
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
  // An empty scene/group is the selection. Do not fall back to the previously current cut.
  if (!ids.length && shotsUi.selFromGroup && shotsUi.selGroupKey) return [];
  if (!ids.length && state.cutId && cuts.some((c) => c.id === state.cutId)) ids.push(state.cutId);
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
  if (shotsUi.refTab && isNativeProject()) {
    const ids = referenceDisplayOrder();
    if (!ids.length) return false;
    clearSceneGroupSelection();
    state.cutSel.clear();
    for (const id of ids) state.cutSel.add(id);
    if (!state.cutSel.has(state.cutId)) state.cutId = ids[ids.length - 1];
    cutSelAnchor = state.cutSel.has(state.cutId) ? state.cutId : ids[0];
    shotsUi.selFromGroup = false;
    shotsUi.selTarget = "list";
    rememberReferenceGroup(state.cutId);
    bus.dispatchEvent(new Event("select"));
    return true;
  }
  const { order, hidden } = shotsNavOrder();
  const ids = selectAllCutIds(order, hidden);
  if (!ids.length) return false;
  clearSceneGroupSelection();
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
  if (!ids.length && state.cutId && (state.timeline?.cuts || []).some((c) => c.id === state.cutId)) ids = [state.cutId];
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
  const sceneKind = templateKindForNewCut(loadQueueMode(localStorage), state.cutId ? workflowKindForCut(cutById(state.cutId)) : null);
  if (sceneKind === "video") body.kind = "video";
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

async function deleteSceneGroups(groupIds) {
  const drop = new Set((groupIds || []).filter((id) => (state.timeline?.groups || []).some((g) => g.id === id)));
  const ids = sceneGroupOrder().filter((id) => drop.has(id));
  if (!ids.length) return;
  const message = ids.length === 1
    ? "Delete this scene?\nCuts become ungrouped. You can restore it from History."
    : `Delete ${ids.length} scenes?\nCuts become ungrouped. You can restore them from History.`;
  if (!(await askConfirm({ message, danger: true }))) return;
  recordShotsUndo(ids.length === 1 ? "Delete scene" : `Delete ${ids.length} scenes`);
  await persistGroups(groupsClone().filter((g) => !drop.has(g.id)));
  state.groupSel.clear();
  groupSelAnchor = "";
  syncGroupSelectionFlags("");
  bus.dispatchEvent(new Event("select"));
}

async function deleteSceneGroup(groupId) {
  await deleteSceneGroups([groupId]);
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
  return sceneHue(id);
}

function captionLangNow() {
  return state.timeline?.project?.settings?.caption_lang || "";
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
        if (wasActive) shotsUi.blockHeadSelect = true;
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
    li.querySelectorAll(".gg-warn3").forEach((wEl) => wEl.remove());
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
  const asRef = c?.kind === "reference";
  const lenInfo = asRef && !(c.media?.kind === "video" && Number(c.media?.seconds) > 0)
    ? { text: "—", title: "No duration", drift: false }
    : formatCutListLength(c);
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
  const headerBadges = asRef ? "" : [
    c.end_card ? `<span class="gg-endcard-badge">End card</span>` : "",
    c.needs_redo ? `<span class="gg-redo-badge">Needs redo</span>` : "",
  ].filter(Boolean).join("");
  const titleInner = asRef
    ? `<span class="gg-cut-title">${esc(c.name || "Reference")}</span>`
    : `<span class="gg-num">${esc(head.cutLabel)}</span> <span class="gg-cut-title">${esc(headName)}</span>`;
  const stageDots = `<span class="gg-stage-dot gg-off" data-k="image"></span><span class="gg-stage-dot gg-off" data-k="video"></span><span class="gg-stage-dot gg-off" data-k="best"></span>`;
  const refThumbs = asRef ? "" : `<div class="gg-cut-refthumbs">${cutCardRefThumbsInner(c)}</div>`;
  return `
      <div class="gg-cut-thumb-col">
        ${cutThumbHtml(c)}
        <div class="gg-live-chip" hidden><span class="gg-live-dot"></span><span class="gg-live-text"></span></div>
      </div>
      <div class="gg-cut-text">
        <div class="gg-cut-main">
          <div class="gg-cut-header" title="${esc(nameTitle)}">
            ${asRef || !isNativeProject() ? "" : '<span class="gg-drag-handle" title="Drag to reorder (or Alt+Up/Down)" aria-hidden="true">\u22EE\u22EE</span>'}
            <span class="gg-cut-head">${titleInner}</span>
            ${asRef ? "" : `<span class="gg-cut-header-badges">${headerBadges}</span>`}
            <span class="gg-cut-verline" title="${esc(verInfo.title)}">
              <span class="gg-cut-cur">${esc(verInfo.text || "—")}</span>
              <span class="gg-cut-ver">${esc(verInfo.detail)}</span>
            </span>
            <div class="gg-stage-row" title="">${stageDots}</div>
          </div>
          ${refThumbs}
        </div>
        <div class="gg-cut-side">
          <span class="gg-cut-len${lenInfo.drift ? " gg-len-drift" : ""}" title="${esc(lenInfo.title)}">${esc(lenInfo.text)}</span>
          <span class="gg-cut-state"><span class="gg-render-badge" hidden><span class="gg-rs-dot"></span><span class="gg-rs-text"></span><span class="gg-rs-pos"></span></span><span class="gg-cut-idle" title="${esc(idle.title)}">${esc(idle.text)}</span></span>
        </div>
      </div>`;
}

function timelinePanelVisible() {
  const el = document.querySelector(".gg-timeline");
  return !!(el && el.isConnected && el.offsetParent);
}

function timelineBottomTabActive() {
  return isTimelinePanelOpen();
}

/** Timeline tab inside our strip (not the native bottom panel). */
function isTimelinePanelOpen() {
  return isOwnStripShown() && ownStripTabId === TIMELINE_TAB;
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
        const c = kind === "caption" ? cutByIdTimeline(cutId) : cutById(cutId);
        if (c) {
          if (kind === "caption") {
            c.caption = text;
            scheduleCutFieldSave(cutId, { caption: text }, { caption: initial });
            paintViewerCaption();
          } else {
            c.prompt = text;
            scheduleCutFieldSave(cutId, { prompt: text }, { prompt: initial });
            syncPromptNodeFromField(cutId, text);
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

let timelineEditModeOn = loadEditPreviewMode(localStorage);
document.documentElement.classList.toggle(EDIT_MODE_ON_CLASS, !!timelineEditModeOn);
let editPreviewLayoutRaf = 0;
let editPreviewObserver = null;
let editPreviewProxyRO = null;
let editPreviewProxyMO = null;
let editPreviewProxyWatched = new WeakSet();
let editPreviewProxySyncing = false;
let editPreviewLoadToken = 0;
let editPreviewAnimating = false;
let editPreviewChromeHold = null;
let editPreviewFilmGen = 0;
let editPreviewWheelAcc = 0;
let editPreviewWheelAt = 0;

/** Persisted height of our strip. Separate from older gg.timelineHeight values. */
const STRIP_HEIGHT_KEY = "gg.stripHeight";
/** Used only before the tab row has been measured. Resize handle is 6px, tabs about 28px. */
const STRIP_CHROME_FALLBACK = 34;
let ownStripEl = null;
let ownStripTabId = TIMELINE_TAB;
let ownStripDrag = null;

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

/**
 * I18 layout: Timeline and Export stay out of `#comfyui-body-bottom`. That slot
 * is a full-width grid row, so using it shortens the left icon bar and the cut
 * list. The strip is fixed to the bottom of the center graph column only
 * (between the side panels). Padding on that column reserves the same height
 * so the canvas toolbar, which sits at the bottom of `.graph-canvas-panel`,
 * stays above the strip. Closing the strip removes the element and those
 * inline reserves. The native Logs panel is not restyled. No grid-row or
 * grid-column changes.
 * Height is `gg.stripHeight`, or the I14 default `fixedBottomPanelHeight`
 * (already ×1.2) when unset.
 */
function graphColumnElement() {
  const gutter = document.querySelector('[data-testid="graph-canvas-gutter"]');
  const column = gutter?.parentElement;
  if (!column || !column.isConnected) return null;
  if (!column.querySelector(".graph-canvas-panel")) return null;
  return column;
}

function releaseStripReserve(el) {
  if (!el) return;
  el.style.paddingBottom = "";
  el.style.minHeight = "";
  el.style.boxSizing = "";
  if (el.dataset.testid === "graph-canvas-gutter") el.style.height = "";
  delete el.dataset.ggStripReserve;
}

function clearStripReserve() {
  document.querySelectorAll("[data-gg-strip-reserve]").forEach(releaseStripReserve);
  if (ownStripEl) {
    ownStripEl.style.left = "";
    ownStripEl.style.width = "";
    ownStripEl.style.top = "";
    ownStripEl.style.marginLeft = "";
  }
}

function setReserveStyle(el, prop, value) {
  if (el.style[prop] !== value) el.style[prop] = value;
}

/** Keep the strip in the graph column and leave that much column height for it. */
function placeOwnStrip(heightPx) {
  const el = ownStripEl;
  if (!el || !el.isConnected || el.hidden) return;
  const column = graphColumnElement();
  const gutter = column?.querySelector(':scope > [data-testid="graph-canvas-gutter"]') || null;
  document.querySelectorAll("[data-gg-strip-reserve]").forEach((node) => {
    if (node !== column && node !== gutter) releaseStripReserve(node);
  });
  if (!column) return;
  const h = Math.max(32, Math.round(Number(heightPx) || 0));
  setReserveStyle(column, "boxSizing", "border-box");
  setReserveStyle(column, "minHeight", "0px");
  setReserveStyle(column, "paddingBottom", `${h}px`);
  column.dataset.ggStripReserve = "1";
  if (gutter) {
    let used = h;
    for (const child of column.children) {
      if (child === gutter) continue;
      used += child.offsetHeight || 0;
    }
    const gs = getComputedStyle(gutter);
    const margin = (parseFloat(gs.marginTop) || 0) + (parseFloat(gs.marginBottom) || 0);
    const next = Math.max(80, Math.round(column.clientHeight - used - margin));
    setReserveStyle(gutter, "boxSizing", "border-box");
    setReserveStyle(gutter, "minHeight", "0px");
    const current = parseFloat(gutter.style.height);
    if (!Number.isFinite(current) || Math.abs(current - next) > 1) gutter.style.height = `${next}px`;
    gutter.dataset.ggStripReserve = "1";
  }
  const box = column.getBoundingClientRect();
  setReserveStyle(el, "left", `${Math.round(box.left)}px`);
  setReserveStyle(el, "width", `${Math.max(32, Math.round(box.width))}px`);
  setReserveStyle(el, "top", `${Math.round(box.bottom - h)}px`);
  setReserveStyle(el, "marginLeft", "");
}

let stripWorkspaceObserver = null;
let stripDomObserver = null;
let stripWatched = new WeakSet();
let stripLayoutLock = false;

function stripWatchTargets() {
  const list = [
    document.getElementById("graph-canvas-container"),
    document.querySelector(".comfyui-body"),
    document.querySelector(".side-tool-bar-container"),
    document.querySelector(".graph-canvas-panel"),
    graphColumnElement(),
  ];
  for (const pane of document.querySelectorAll(".p-splitterpanel")) list.push(pane);
  return list.filter(Boolean);
}

function onStripWorkspaceResize() {
  if (stripLayoutLock || !isOwnStripShown()) return;
  stripLayoutLock = true;
  try {
    ensureStripObservers();
    placeOwnStrip(parseFloat(ownStripEl?.style.height) || desiredStripHeight());
    refreshStripLayoutDependents();
  } finally {
    stripLayoutLock = false;
  }
}

function stripMutationMatters(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.dataset?.testid === "graph-canvas-gutter") return true;
  const cls = typeof node.className === "string" ? node.className : "";
  return /graph-canvas-panel|p-splitter|p-splitterpanel/.test(cls);
}

function onStripDomMutation(records) {
  if (stripLayoutLock || !isOwnStripShown()) return;
  let hit = false;
  for (const rec of records) {
    for (const node of rec.addedNodes) {
      if (stripMutationMatters(node)) { hit = true; break; }
    }
    if (hit) break;
    for (const node of rec.removedNodes) {
      if (stripMutationMatters(node)) { hit = true; break; }
    }
    if (hit) break;
  }
  if (!hit) return;
  const column = graphColumnElement();
  if (column?.dataset.ggStripReserve === "1" && column.style.paddingBottom) return;
  onStripWorkspaceResize();
}

function ensureStripObservers() {
  const root = document.getElementById("graph-canvas-container");
  if (root && !stripDomObserver) {
    stripDomObserver = new MutationObserver((records) => onStripDomMutation(records));
    stripDomObserver.observe(root, { childList: true, subtree: true });
  }
  if (!window.ResizeObserver) return;
  if (!stripWorkspaceObserver) {
    stripWorkspaceObserver = new ResizeObserver(() => onStripWorkspaceResize());
  }
  for (const el of stripWatchTargets()) {
    if (stripWatched.has(el)) continue;
    stripWatched.add(el);
    stripWorkspaceObserver.observe(el);
  }
}

function clearStripObservers() {
  stripWorkspaceObserver?.disconnect();
  stripWorkspaceObserver = null;
  stripDomObserver?.disconnect();
  stripDomObserver = null;
  stripWatched = new WeakSet();
}

function isOwnStripShown() {
  return !!(ownStripEl && ownStripEl.isConnected && !ownStripEl.hidden && ownStripEl.getClientRects().length > 0);
}

function loadStripHeightPx() {
  try {
    return parseTimelineHeight(localStorage.getItem(STRIP_HEIGHT_KEY));
  } catch (_) {
    return null;
  }
}

function saveStripHeightPx(px) {
  try {
    const n = Math.round(Number(px));
    if (!Number.isFinite(n) || n <= 0) return;
    localStorage.setItem(STRIP_HEIGHT_KEY, String(n));
  } catch (_) {}
}

function measureStripChrome() {
  const el = ownStripEl;
  if (!el) return 0;
  const resize = el.querySelector(".gg-strip-resize");
  const tabs = el.querySelector(".gg-strip-tabs");
  const rh = resize?.getBoundingClientRect().height || 0;
  const th = tabs?.getBoundingClientRect().height || 0;
  return Math.round(rh + th);
}

function defaultStripHeightPx() {
  const chrome = measureStripChrome() || STRIP_CHROME_FALLBACK;
  return fixedBottomPanelHeight(chrome, timelineEditModeOn);
}

function desiredStripHeight(explicitPx) {
  const raw = explicitPx == null ? (loadStripHeightPx() ?? defaultStripHeightPx()) : explicitPx;
  return clampHeight(raw, window.innerHeight);
}

function applyOwnStripHeight(explicitPx) {
  const el = ownStripEl;
  if (!el || !el.isConnected) return;
  const next = desiredStripHeight(explicitPx);
  el.style.height = `${next}px`;
  el.style.flex = "0 0 auto";
  placeOwnStrip(next);
}

function ownStripTop() {
  if (!isOwnStripShown()) return null;
  const top = ownStripEl.getBoundingClientRect().top;
  return Number.isFinite(top) ? top : null;
}

/** Read-only. Top of the stock Logs panel when it is actually on screen. */
function nativeBottomPanelTop() {
  const panel = document.querySelector(".bottom-panel");
  if (!panel || !panel.isConnected) return null;
  const cs = getComputedStyle(panel);
  if (cs.display === "none" || cs.visibility === "hidden") return null;
  const r = panel.getBoundingClientRect();
  if (r.height < 8 || r.width < 8) return null;
  return r.top;
}

/**
 * Lowest edge our overlays may use. The strip counts when it overlaps the
 * graph box. The graph column padding already ends the canvas above the strip,
 * so this does not shrink that area a second time unless they still overlap.
 */
function overlayBottomLimit(graphRect) {
  const caps = [];
  const native = nativeBottomPanelTop();
  if (native != null) caps.push(native);
  const stripTop = ownStripTop();
  const graphBottom = Number(graphRect?.bottom);
  if (stripTop != null && Number.isFinite(graphBottom) && stripTop < graphBottom - 1) caps.push(stripTop);
  if (!caps.length) return null;
  return Math.min(...caps);
}

function refreshStripLayoutDependents() {
  try { paintAppControls(); } catch (_) {}
  placeEditTakesStrip();
  if (timelineEditModeOn) scheduleEditPreviewLayout();
}

function syncOwnStripTabs() {
  const el = ownStripEl;
  if (!el) return;
  el.querySelectorAll(".gg-strip-tab").forEach((btn) => {
    const on = btn.dataset.tab === ownStripTabId;
    btn.setAttribute("aria-selected", on ? "true" : "false");
    btn.tabIndex = on ? 0 : -1;
  });
  el.querySelectorAll(".gg-strip-pane").forEach((pane) => {
    pane.hidden = pane.dataset.tab !== ownStripTabId;
  });
}

function selectOwnStripTab(id) {
  if (id !== TIMELINE_TAB && id !== EXPORT_TAB) return;
  if (id === ownStripTabId) return;
  ownStripTabId = id;
  syncOwnStripTabs();
  if (timelineEditModeOn) scheduleEditPreviewLayout();
}

function wireOwnStrip(el) {
  el.querySelectorAll(".gg-strip-tab").forEach((btn) => {
    btn.addEventListener("click", () => selectOwnStripTab(btn.dataset.tab));
  });
  el.querySelector(".gg-strip-close")?.addEventListener("click", () => setTimelineUserOpen(false));
  const handle = el.querySelector(".gg-strip-resize");
  handle?.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startH = el.getBoundingClientRect().height;
    const startY = e.clientY;
    ownStripDrag = { startH, startY };
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    const move = (ev) => {
      if (!ownStripDrag) return;
      applyOwnStripHeight(timelineHeightFromDrag(ownStripDrag.startH, ev.clientY - ownStripDrag.startY, window.innerHeight));
      refreshStripLayoutDependents();
    };
    const end = (ev) => {
      if (!ownStripDrag) return;
      const h = timelineHeightFromDrag(ownStripDrag.startH, (ev.clientY || startY) - ownStripDrag.startY, window.innerHeight);
      ownStripDrag = null;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      applyOwnStripHeight(h);
      saveStripHeightPx(desiredStripHeight(h));
      refreshStripLayoutDependents();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });
}

function ensureOwnStrip() {
  if (ownStripEl) return ownStripEl;
  const el = document.createElement("div");
  el.className = "gg-bottom-strip";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Cut Manager");
  el.innerHTML = `
    <div class="gg-strip-resize" role="separator" aria-orientation="horizontal" title="Drag to resize"></div>
    <div class="gg-strip-tabs" role="tablist" aria-label="Cut Manager">
      <button type="button" class="gg-strip-tab" role="tab" data-tab="${TIMELINE_TAB}" aria-selected="true">Timeline</button>
      <button type="button" class="gg-strip-tab" role="tab" data-tab="${EXPORT_TAB}" aria-selected="false">${EXPORT_TAB_TITLE}</button>
      <button type="button" class="gg-strip-close" aria-label="Collapse" title="Collapse">×</button>
    </div>
    <div class="gg-strip-body"></div>`;
  // Attach before the tabs mount so Edit-on-by-default can lay out the preview
  // in the same turn. Mount used to run while ownStripEl was still unset, so
  // isTimelinePanelOpen() was false and the preview never started.
  ownStripEl = el;
  document.body.appendChild(el);
  applyOwnStripHeight();
  const body = el.querySelector(".gg-strip-body");
  for (const tab of [
    { id: TIMELINE_TAB, mount: mountTimeline },
    { id: EXPORT_TAB, mount: mountExport },
  ]) {
    const pane = document.createElement("div");
    pane.className = "gg-strip-pane";
    pane.dataset.tab = tab.id;
    pane.setAttribute("role", "tabpanel");
    pane.hidden = tab.id !== ownStripTabId;
    body.appendChild(pane);
    tab.mount(pane);
  }
  wireOwnStrip(el);
  syncOwnStripTabs();
  return el;
}

function showOwnStrip(tries = 0) {
  if (!loadTimelineOpen(localStorage)) return;
  if (!graphColumnElement()) {
    if (tries < 30) requestAnimationFrame(() => showOwnStrip(tries + 1));
    return;
  }
  const el = ensureOwnStrip();
  if (!el) return;
  if (el.parentElement !== document.body) document.body.appendChild(el);
  el.hidden = false;
  ensureStripObservers();
  applyOwnStripHeight();
  syncOwnStripTabs();
  requestAnimationFrame(() => {
    if (!isOwnStripShown()) return;
    ensureStripObservers();
    if (loadStripHeightPx() == null) applyOwnStripHeight();
    else placeOwnStrip(parseFloat(el.style.height) || desiredStripHeight());
    refreshStripLayoutDependents();
  });
  refreshStripLayoutDependents();
}

function hideOwnStrip() {
  if (!ownStripEl && !document.querySelector("[data-gg-strip-reserve]")) return;
  ownStripDrag = null;
  clearStripObservers();
  clearStripReserve();
  ownStripEl?.remove();
  refreshStripLayoutDependents();
}

function scheduleRestoreTimelinePanelHeight() {
  if (!isOwnStripShown()) return;
  applyOwnStripHeight();
}

if (!globalThis.__ggOwnStripResize) {
  globalThis.__ggOwnStripResize = true;
  window.addEventListener("resize", () => {
    if (!isOwnStripShown()) return;
    ensureStripObservers();
    applyOwnStripHeight();
    refreshStripLayoutDependents();
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
  ownStripTabId = TIMELINE_TAB;
  showOwnStrip();
}

function openTimelinePanelIfAllowed() {
  if (!loadTimelineOpen(localStorage)) return;
  openTimelinePanelInternal();
}

function closeTimelinePanel() {
  hideOwnStrip();
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
    const refMode = !!(shotsUi.refTab && isNativeProject());
    const sceneTitle = refMode ? "New Group" : r.scene.title;
    const cutTitle = refMode ? "New Reference" : r.cut.title;
    setBtn(row, ".gg-ir-scene", refMode ? !hasProject : r.scene.disabled, sceneTitle);
    setBtn(row, ".gg-ir-cut", refMode ? !hasProject : r.cut.disabled, cutTitle);
    setBtn(row, ".gg-ir-del", r.del.disabled, r.del.title);
    if (!refMode && selectedSceneGroupIds().length) setBtn(row, ".gg-ir-del", false, "Delete");
    if (refMode) setBtn(row, ".gg-ir-del", !cutsForDelete().length, "Delete");
    for (const sel of [".gg-ir-scene", ".gg-ir-cut", ".gg-ir-del"]) {
      const b = row.querySelector(sel);
      if (b && b.title) b.setAttribute("aria-label", b.title);
    }
    const wand = row.querySelector(".gg-ir-aicut");
    if (wand && shotsUi.refTab) {
      wand.disabled = true;
      wand.title = "Switch to Info to use AI Make Cut";
      wand.setAttribute("aria-label", wand.title);
    }
  }
  const refForQueue = shotsUi.refTab ? selectedReference() : null;
  const queueIds = refForQueue ? [refForQueue.id] : timelineSelectedCutIds();
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

/** Empty scene or reference group is the selection (no item ids to highlight). */
function emptyGroupSelectionKey() {
  if (!shotsUi.selFromGroup || state.cutSel.size || !shotsUi.selGroupKey) return "";
  return shotsUi.selGroupKey;
}

function paintSelection(root) {
  const shotTabOpen = isGongganShotTabOpenAndActive();
  const openCutId = wfLastLoadedCutId;
  const sameProject =
    !wfLastLoadedProjectId || !state.pid || wfLastLoadedProjectId === state.pid;
  const emptyKey = emptyGroupSelectionKey();
  root.querySelectorAll("[data-cut-id]").forEach((el) => {
    const id = el.dataset.cutId;
    el.classList.toggle("gg-on", !emptyKey && id === state.cutId);
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
  root.querySelectorAll(".gg-grp-sec").forEach((sec) => {
    const picked = new Set(state.cutSel);
    if (!picked.size && state.cutId && !emptyKey) picked.add(state.cutId);
    const rowIds = [...sec.querySelectorAll(".gg-cut")].map((li) => li.dataset.cutId).filter(Boolean);
    const gid = sec.dataset.groupId || sec.dataset.refGroup || (sec.hasAttribute("data-loose") ? "ungrouped" : "");
    const allRows = rowIds.length > 0 && rowIds.every((id) => picked.has(id));
    const emptyHit = !!emptyKey && gid === emptyKey && rowIds.length === 0;
    const groupOn = !!(sec.dataset.groupId && state.groupSel.has(sec.dataset.groupId));
    sec.classList.toggle("gg-grp-picked", allRows || emptyHit || groupOn);
    if (sec.dataset.refGroup) sec.classList.toggle("gg-on", sec.dataset.refGroup === refsUi.groupId || emptyHit);
  });
  root.querySelectorAll(".gg-tl-group").forEach((el) => {
    el.classList.toggle("gg-sel", state.groupSel.has(el.dataset.groupId || ""));
  });
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

/** Optimistic display version. Best stays the timeline clip, so a different shown take does not retarget trim. */
function applyDisplayVersionLocally(c, vid) {
  if (!c || !vid) return false;
  const v = (c.versions_list || []).find((x) => x.id === vid);
  if (!v) return false;
  if (c.display === vid && c.media?.id === vid) return false;
  const timelineLocked = !!c.pick;
  c.display = vid;
  c.media = versionMedia(v);
  if (!timelineLocked) {
    c.src_dur = c.media && c.media.kind === "video" ? Math.max(0, Number(v?.seconds) || 0) : 0;
    const clamped = clampClip(c, c.in, c.sec);
    c.in = clamped.in;
    c.sec = clamped.sec;
    recomputeCutStarts();
  }
  c.edited = true;
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

/** Optimistic Best. Setting Best also shows that take. Clearing Best leaves the shown take, and the timeline follows it. */
function applyPickLocally(c, vid) {
  const clear = vid === null;
  if (!c || (clear ? !c.pick : !vid || c.pick === vid)) return false;
  if (!clear) {
    const v = (c.versions_list || []).find((x) => x.id === vid);
    if (!v) return false;
    c.pick = vid;
    c.display = vid;
    c.media = versionMedia(v);
    c.src_dur = c.media && c.media.kind === "video" ? Math.max(0, Number(v.seconds) || 0) : 0;
  } else {
    c.pick = null;
    const shown = (c.versions_list || []).find((x) => x && x.id === c.display)
      || (c.versions_list || []).find((x) => x && x.id);
    if (shown) {
      c.display = shown.id;
      c.media = versionMedia(shown);
      c.src_dur = c.media && c.media.kind === "video" ? Math.max(0, Number(shown.seconds) || 0) : 0;
    }
  }
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
  const ref = referenceById(cutId);
  const c = ref || cutsNow().find((x) => x.id === cutId);
  if (!c || !vid) return;
  void setPick(cutId, c.pick === vid ? null : vid);
}

async function setPick(cutId, vid, opts = {}) {
  if (referenceById(cutId)) {
    await saveCutFields(cutId, { pick_version_id: vid || null });
    if (state.pid && state.cutId === cutId) bus.dispatchEvent(new Event("select"));
    return;
  }
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

function versionIdsForDelete(cutId, vid) {
  if (verSel.cutId === cutId && verSel.ids.has(vid) && verSel.ids.size) return [...verSel.ids];
  return vid ? [vid] : [];
}

/** Hide output thumbnails. One confirm when several are selected. Files stay in one History step. */
async function deleteVersions(cutId, versionIds) {
  const ids = [...new Set(versionIds || [])].filter(Boolean);
  if (!state.pid || !cutId || !ids.length || !isNativeProject()) return;
  const busyKey = `${cutId}\n${ids.join(",")}`;
  if (versionDeleteBusy.has(busyKey)) return;
  if (ids.length > 1) {
    const ok = await askConfirm({
      message: `Delete ${ids.length} versions?\nYou can restore them from History.`,
      okLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
  }
  versionDeleteBusy.add(busyKey);
  const stepId = historyStepId();
  const pid = state.pid;
  try {
    let timeline = null;
    for (const versionId of ids) {
      const d = await postJson("/gonggan/version/delete", {
        pid, cut_id: cutId, version_id: versionId, history_step: stepId,
      });
      if (d.timeline) timeline = d.timeline;
      if (stripPick.pid === pid && stripPick.cutId === cutId && stripPick.vid === versionId) stripPick.vid = "";
      if (wfOpenVersion && wfOpenVersion.projectId === pid && wfOpenVersion.cutId === cutId && wfOpenVersion.vid === versionId) {
        wfOpenVersion = null;
      }
    }
    if (verSel.cutId === cutId) {
      ids.forEach((id) => verSel.ids.delete(id));
      if (!verSel.ids.size) verSel.anchor = "";
    }
    if (timeline) adoptMutationTimeline(timeline, pid);
    else await loadTimeline();
    recordShotsEntry(pid, {
      kind: "version",
      op: "delete",
      cut_id: cutId,
      version_id: ids[0],
      version_ids: ids,
      history_step: stepId,
    }, ids.length === 1 ? "Delete version" : `Delete ${ids.length} versions`);
    bus.dispatchEvent(new Event("timeline"));
  } catch (e) {
    ggToast("Delete version", e.message, "warn");
  } finally {
    versionDeleteBusy.delete(busyKey);
  }
}

async function deleteVersion(cutId, versionId) {
  await deleteVersions(cutId, versionIdsForDelete(cutId, versionId));
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
    await flushPendingCutFields();
    const plan = await planNativeSdkJob(pid, cutId, newSeed ? "regen" : "queue");
    sdk.msg = `${title}: ${sdkPlanSummary(plan)}`;
    bus.dispatchEvent(new Event("sdk"));
    const message = newSeed ? regenConfirmMessage(title) : batchRenderConfirmMessage([title]);
    if (!(await askConfirm({ message: withReferenceConfirm(message, [cutById(cutId) || cut]) }))) {
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
  const selectedVid = startVid || selectedImageTakeId(cut);
  const what = startVid ? MAKE_VIDEO_LABEL : "Image to Video";
  sdk.busy = "regen";
  sdk.regenCutId = cutId;
  sdk.msg = `Preparing ${what} for ${title}…`;
  bus.dispatchEvent(new Event("sdk"));
  try {
    await flushPendingCutFields();
    const plan = (await postJson("/gonggan/image-to-video", {
      pid,
      cut_id: cutId,
      ...(selectedVid ? { selected_vid: selectedVid } : {}),
      ...(startVid ? { start_vid: startVid } : {}),
    })).plan;
    if (!makeVideoPlanOk(plan, startVid)) throw new Error(MAKE_VIDEO_OLD_SERVER);
    sdk.msg = `${title}: ${sdkPlanSummary(plan)}`;
    bus.dispatchEvent(new Event("sdk"));
    if (!(await askConfirm({ message: withReferenceConfirm(i2vConfirmMessage(title, plan), [cutById(cutId) || cut]) }))) {
      sdk.msg = "Not queued (cancelled).";
      return;
    }
    await postJson("/gonggan/regen", { pid, cut_id: cutId, dry_run: false, confirm: true, plan: plan.plan });
    syncRegenJobFromServer({ native: true, status: "running", pid, cut_id: cutId });
    scheduleRegenPoll();
    void refreshRegenJob();
    sdk.msg = `Queued through Comfy SDK: ${title} (${what})`;
    ggToast("Queued", `${title}: ${what} (Comfy SDK)`, "ok");
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
  if (ids.length === 1 && referenceById(ids[0]) && !(state.timeline?.cuts || []).some((c) => c.id === ids[0])) {
    const counts = { video: 0, regen: 0, image: 1, skipBest: 0, skipNoImage: 0 };
    return {
      jobs: [{ cut_id: ids[0], job: "image", selected_vid: "" }],
      counts,
      actionable: 1,
      mode: "image",
      tooltip: queuePlanTooltip(counts),
    };
  }
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
    await flushPendingCutFields();
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
    if (!(await askConfirm({ message: withReferenceConfirm(batchRenderConfirmMessage([title]), [cutById(cutId) || cut]) }))) {
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
  if (shotsUi.refTab && isNativeProject()) {
    const ref = selectedReference();
    if (!ref) return;
    return void queueSelectedCuts([ref.id], { resolved: true });
  }
  const ids = timelineSelectedCutIds();
  if (!ids.length || !isNativeProject()) return;
  return void queueSelectedCuts(ids);
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
  await flushPendingCutFields();
  if (!(await askConfirm({ message: withReferenceConfirm(generateAllConfirmMessage(ids.map((id) => shotTitle(cutById(id)))), ids.map((id) => cutById(id))) }))) return;
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
async function queueSelectedCuts(cutIds, opts = {}) {
  const tl = state.timeline;
  if (!tl || !isNativeProject() || sdk.busy || batchRenderUi.running) return;
  const selected = cutIds || cutSelIds();
  const ids = opts.resolved
    ? [...new Set((selected || []).filter((id) => cutById(id)))]
    : selectedInDisplayOrder(shotsNavOrder().order, tl.cuts.map((c) => c.id), selected);
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
  await flushPendingCutFields();
  if (!(await askConfirm({ message: withReferenceConfirm(batchRenderConfirmMessage(labels, skipped), plan.queue.map((id) => cutById(id))) }))) return;
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
  const snap = runSnapshots.byPrompt?.[String(promptId)] || null;
  const projectId = knownProjectPid(t.projectId) || knownProjectPid(state.pid) || state.pid || t.projectId;
  try {
    const body = { pid: projectId, cut_id: t.cutId, prompt_id: String(promptId) };
    if (snap) {
      const merged = mergeLegacyTake(null, snap);
      const outputNodes = expandLinearOutputIds(snap.workflow);
      if (outputNodes) body.output_nodes = outputNodes;
      body.prompt = merged.positive || "";
      body.negative = merged.negative || "";
      if (merged.seed != null && merged.seed !== "") body.seed = merged.seed;
      if (merged.steps != null) body.steps = merged.steps;
      if (merged.cfg != null) body.cfg = merged.cfg;
      if (merged.frames != null) body.frames = merged.frames;
      if (merged.numerics && Object.keys(merged.numerics).length) body.numerics = merged.numerics;
      body.input_image = merged.inputImage || "";
      if (merged.inputImages?.length) body.input_images = merged.inputImages;
      if (merged.sourceImageTake) body.source_image_take = merged.sourceImageTake;
      if (Array.isArray(snap.refs_used) && snap.refs_used.length) body.refs_used = snap.refs_used;
      if (merged.workflow) body.workflow = merged.workflow;
    }
    res = await api.fetchApi("/gonggan/capture-output", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  const shownPid = knownProjectPid(state.pid) || state.pid;
  const shown = shownPid === projectId && tl?.project?.id === shownPid;
  const cut = shown ? tl.cuts.find((c) => c.id === t.cutId) : null;
  const cutText = cut ? `${cutDisplayLabel(cut, computeCutLabels(tl))} ${cut.name || ""}`.trim() : "";
  const msg = captureToast(d, cutText);
  if (msg) ggToast(msg.summary, msg.detail, msg.kind);
  if (d?.ok && d.version?.id && snap) {
    if (!runSnapshots.byVersion) runSnapshots.byVersion = {};
    runSnapshots.byVersion[d.version.id] = snap;
    scheduleRunSnapFile();
  }
  if (d?.ok && !d.duplicate && shownPid && shownPid === projectId) {
    await loadTimeline({ reloadWorkflows: true });
    if (d.version?.id) selectArrivedVersion(shownPid, t.cutId, d.version.id);
  }
}

/** A finished render becomes the cut's selected output (thumbnail + timeline). Best is unchanged. */
function selectArrivedVersion(pid, cutId, vid) {
  if (!pid || !cutId || !vid || state.pid !== pid) return;
  const cut = cutById(cutId);
  if (!cut || !(cut.versions_list || []).some((v) => v && v.id === vid)) return;
  Object.assign(stripPick, { pid, cutId, vid });
  noteTakeKind(cut, vid);
  if (applyDisplayVersionLocally(cut, vid)) {
    bus.dispatchEvent(new Event("timeline"));
    clearTimeout(ed.saveTimer);
    void saveEdit();
  }
  bus.dispatchEvent(new Event("select"));
}

api.addEventListener("gonggan.regen", (e) => {
  const j = e.detail || {};
  syncRegenJobFromServer(j);
  const shown = !j.native || state.pid === j.pid;
  if (j.status === "done") {
    sdk.msg = `New version from SDK job ${j.sdk_job_id || ""}`;
    if (shown) {
      const pid = j.pid || state.pid;
      const cutId = j.cut_id || "";
      loadTimeline({ reloadWorkflows: true }).then(() => {
        const cut = cutId ? cutById(cutId) : null;
        const vid = j.version_id || j.version?.id || cut?.versions_list?.[0]?.id || "";
        if (vid) selectArrivedVersion(pid, cutId, vid);
      }).catch(() => {});
    }
  }
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
    img: thumbHtml(v?.missing ? null : versionMedia(v), "gg-ver-img"),
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

/** Import: native file picker. Each picked file becomes its own cut (no options template). */
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

/** One new cut per file, in pick order, after the selected cut. No options template is copied. */
async function importVersionFiles(pid, cutId, files) {
  if (!files.length) return;
  stripImportBusy = true;
  bus.dispatchEvent(new Event("sdk"));
  const failed = [];
  const created = [];
  const before = snapshotOrderGroups(state.timeline);
  const group = cutById(cutId)?.group_id || "";
  let after = cutId;
  let lastTimeline = null;
  try {
    for (const file of files) {
      const form = new FormData();
      form.append("pid", pid);
      form.append("create_cut", "1");
      if (after) form.append("after", after);
      if (group) form.append("group", group);
      form.append("file", file, importUploadName(file));
      try {
        const res = await api.fetchApi("/gonggan/import-version", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (res.status === 404 || res.status === 405) throw new Error("Restart ComfyUI to enable Import");
        if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
        const newId = data.cut && data.cut.id;
        if (!newId) throw new Error("Import did not create a cut");
        created.push(newId);
        after = newId;
        if (data.timeline) lastTimeline = data.timeline;
      } catch (e) {
        failed.push(`${file.name}: ${e.message}`);
      }
    }
  } finally {
    stripImportBusy = false;
    if (created.length && state.pid === pid) {
      if (lastTimeline) adoptMutationTimeline(lastTimeline, pid);
      recordShotsEntry(
        pid,
        { kind: "cuts", op: "add", ids: created, before, after: snapshotOrderGroups(state.timeline) },
        created.length === 1 ? "Import" : `Import ${created.length}`,
      );
      await loadTimeline({ reloadWorkflows: true });
      const lastId = created[created.length - 1];
      wfLastLoadedCutId = "";
      wfLastLoadedProjectId = "";
      selectCut(lastId);
      requestAnimationFrame(() => {
        document
          .querySelector(`.gg-shots .gg-cut[data-cut-id="${CSS.escape(lastId)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
    }
    bus.dispatchEvent(new Event("sdk"));
  }
  const added = created.length;
  if (failed.length) ggToast(`Imported ${added} of ${files.length}`, failed.join("\n"), "warn");
  else ggToast(`Imported ${added} file${added === 1 ? "" : "s"}`, "", "ok");
}

const IMPORT_DROP_SEL = ".gg-shots, .gg-timeline, .gg-bottom-strip, .gg-vstrip, .gg-edit-preview";

function importDropHost(target) {
  return target && target.closest ? target.closest(IMPORT_DROP_SEL) : null;
}

/** File drop on the cut list, take row, Timeline, or edit preview. Same import as the file picker. */
function installImportDrop() {
  if (window.__ggImportDrop) return;
  window.__ggImportDrop = true;
  const allow = (e) => {
    if (!isNativeProject() || stripImportBusy) return;
    const dt = e.dataTransfer;
    if (!dt || ![...dt.types].includes("Files")) return;
    if (!importDropHost(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    try { dt.dropEffect = "copy"; } catch (_) {}
  };
  window.addEventListener("dragenter", allow, true);
  window.addEventListener("dragover", allow, true);
  window.addEventListener("drop", (e) => {
    if (!importDropHost(e.target)) return;
    const incoming = [...(e.dataTransfer?.files || [])];
    if (!incoming.length) return;
    e.preventDefault();
    const files = incoming.filter(isImportMediaFile);
    if (!files.length || !isNativeProject() || stripImportBusy) return;
    e.stopPropagation();
    const pid = state.pid;
    if (!pid) {
      ggToast("Import", "Open a project first", "warn");
      return;
    }
    const refDrop = shotsUi.refTab || (referenceById(state.cutId) && e.target.closest?.(".gg-vstrip"));
    if (refDrop) {
      const ref = referenceById(state.cutId);
      const images = files.filter(isImportImageFile);
      if (!ref) {
        ggToast("Reference", "Select a reference to add an image.", "warn");
        return;
      }
      if (!images.length) {
        ggToast("Reference", "Drop an image file.", "warn");
        return;
      }
      void importReferenceVersionFiles(pid, ref.id, images);
      return;
    }
    void importVersionFiles(pid, state.cutId || "", files);
  }, true);
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
  const name = String(imageName || "").trim();
  if (!widget || !name) return false;
  const values = widget.options?.values;
  if (Array.isArray(values) && !values.includes(name)) values.push(name);
  widget.value = name;
  if (Array.isArray(node.widgets_values)) {
    if (node.widgets_values.length) node.widgets_values[0] = name;
    else node.widgets_values = [name, "image"];
  }
  const named = node.widgets_values_named;
  if (named && typeof named === "object" && !Array.isArray(named)) named.image = name;
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

function seedControlWidgets() {
  const out = [];
  const nodes = app.graph?._nodes || app.graph?.nodes || [];
  for (const node of nodes) {
    const widgets = node?.widgets || [];
    if (!widgets.some((w) => w && (w.name === "seed" || w.name === "noise_seed"))) continue;
    const control = widgets.find((w) => w && w.name === "control_after_generate");
    if (control) out.push(control);
  }
  return out;
}

function pinSeedControls() {
  const saved = [];
  for (const control of seedControlWidgets()) {
    saved.push({ widget: control, value: control.value });
    control.value = "fixed";
  }
  return saved;
}

function restoreSeedControls(saved) {
  for (const row of saved || []) {
    if (row?.widget) row.widget.value = row.value;
  }
}

function randomQueueSeed() {
  return Math.floor(Math.random() * 1e15);
}

function rememberRunSnapshot(promptId, snap) {
  if (!promptId || !snap?.cutId) return;
  if (!runSnapshots.byPrompt) runSnapshots.byPrompt = {};
  const { controls, ...rest } = snap;
  void controls;
  runSnapshots.byPrompt[String(promptId)] = { ...rest };
  scheduleRunSnapFile();
}

function graphLooksLikeVideo(wf) {
  if (!wf || typeof wf !== "object") return false;
  if (workflowGraphKind(wf) === "video") return true;
  const subs = wf.definitions?.subgraphs;
  return Array.isArray(subs) && subs.some((sg) => sg && workflowGraphKind(sg) === "video");
}

/** The open graph is a video workflow (shared video template), even if the cut's current media is a still. */
function queueGraphIsVideo(cut) {
  if (workflowKindForCut(cut) === "video" || wfLastLoadedKind === "video") return true;
  try {
    return graphLooksLikeVideo(captureGraphWorkflowSnapshot());
  } catch (_) {
    return false;
  }
}

/** The still image Take for a video start frame. A selected video Take is not used. */
function selectedStillTakeId(cut) {
  const sel = stripSelectedVersionId(cut);
  if (isStillVersion(findCutVersion(cut, sel))) return sel;
  return selectedImageTakeId(cut);
}

function liveGraphNodes() {
  return app.graph?._nodes || app.graph?.nodes || [];
}

/** Write the cut image onto the video template's LoadImage (linearData input, else the LoadImage node). */
function applyLiveVideoImage(binding, imageName) {
  const name = String(imageName || "").trim();
  if (!name) return false;
  const names = [...new Set([binding?.widget, binding?.label, "image"].map((n) => String(n || "").trim()).filter(Boolean))];
  let ok = false;
  if (binding?.nodeId) {
    for (const widgetName of names) {
      if (setLiveBoundWidget({ nodeId: binding.nodeId, widget: widgetName, graphId: binding.graphId || "" }, name)) ok = true;
    }
    const direct = liveNodeById(binding.nodeId);
    if (direct && setLiveLoadImageWidget(direct, name)) ok = true;
  }
  if (ok) return true;
  return setLiveLoadImageWidget(liveStartImageNode(), name);
}

function promptLocalId(id) {
  const text = String(id || "");
  const cut = text.lastIndexOf(":");
  return cut >= 0 ? text.slice(cut + 1) : text;
}

/** Write the uploaded still into the API prompt ComfyUI is about to send. */
function patchQueuedStartImage(prompt, imageName, preferId) {
  const output = prompt?.output;
  const name = String(imageName || "").trim();
  if (!output || !name) return;
  const rows = [];
  for (const [id, node] of Object.entries(output)) {
    if (!node || node.class_type !== "LoadImage") continue;
    rows.push({ id: String(id), node, title: String(node._meta?.title || "").trim().toLowerCase() });
  }
  if (!rows.length) return;
  rows.sort((a, b) => {
    const na = /^\d+$/.test(a.id) ? Number(a.id) : Number.MAX_SAFE_INTEGER;
    const nb = /^\d+$/.test(b.id) ? Number(b.id) : Number.MAX_SAFE_INTEGER;
    return na - nb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const wanted = String(preferId || "");
  const wantedLocal = promptLocalId(wanted);
  const nested = wanted.includes(":");
  const preferred = wanted
    ? rows.filter((r) => r.id === wanted || (wantedLocal && (nested ? r.id.endsWith(`:${wantedLocal}`) : r.id === wantedLocal || r.id.endsWith(`:${wantedLocal}`))))
    : [];
  const titled = rows.filter((r) => r.title === "start image");
  const hit = preferred.find((r) => r.id === wanted)
    || preferred.find((r) => r.title === "start image")
    || preferred[0]
    || (titled.length === 1 ? titled[0] : titled.length ? null : rows[0]);
  if (!hit) return;
  const inputs = hit.node.inputs && typeof hit.node.inputs === "object" ? hit.node.inputs : (hit.node.inputs = {});
  if (!Array.isArray(inputs.image)) inputs.image = name;
  const wfNode = Array.isArray(prompt.workflow?.nodes)
    ? prompt.workflow.nodes.find((n) => n && String(n.id) === hit.id)
    : null;
  if (!wfNode) return;
  if (Array.isArray(wfNode.widgets_values) && wfNode.widgets_values.length) wfNode.widgets_values[0] = name;
  const named = wfNode.widgets_values_named;
  if (named && typeof named === "object" && !Array.isArray(named)) named.image = name;
}

function collapsedFieldText(text) {
  const v = String(text ?? "").trim();
  return v ? v.split(/\s+/).join(" ") : "";
}

function queuePromptPack(cut) {
  const raw = promptTextForQueue(cut);
  const base = collapsedFieldText(raw);
  const caption = collapsedFieldText(cut?.caption || "");
  if (!base) return { raw, base, injected: "", video: "", caption };
  const injected = injectPromptText(base, raw, cut.ref_links, activeReferences());
  const video = caption ? `${injected} Dialogue: "${caption}"` : injected;
  return { raw, base, injected, video, caption };
}

/** Text that must land in the prompt widget. References change it; a plain prompt is written too. */
function liveQueuePrompt(pack) {
  if (!pack) return "";
  if (pack.injected && pack.injected !== pack.base) return pack.injected;
  return pack.raw || pack.injected || pack.base || "";
}

function patchQueueString(value, pack) {
  if (typeof value !== "string" || !pack?.injected) return value;
  if (value === pack.raw || value === pack.base) return pack.injected;
  if (pack.caption) {
    const plain = `${pack.base} Dialogue: "${pack.caption}"`;
    const plainRaw = `${pack.raw} Dialogue: "${pack.caption}"`;
    if (value === plain || value === plainRaw) return pack.video;
  }
  return value;
}

function promptNodeMatches(id, binding) {
  if (!binding?.nodeId) return false;
  const sid = String(id);
  const nid = String(binding.nodeId);
  if (sid === nid) return true;
  const local = promptLocalId(nid);
  return sid === local || sid.endsWith(`:${local}`);
}

function writePromptInput(node, widget, text) {
  const inputs = node?.inputs;
  if (!inputs || typeof inputs !== "object" || !text) return false;
  const names = [];
  const widgetName = widget ? String(widget) : "";
  if (widgetName) names.push(widgetName);
  for (const name of ["text", "prompt"]) if (!names.includes(name)) names.push(name);
  for (const name of names) {
    if (typeof inputs[name] === "string") {
      inputs[name] = text;
      return true;
    }
  }
  const title = String(node?._meta?.title || "").trim().toLowerCase();
  if (node?.class_type !== "CLIPTextEncode" && title !== "prompt") return false;
  const key = names.find((name) => name === "text" || name === "prompt" || name === widgetName);
  if (!key || Array.isArray(inputs[key])) return false;
  inputs[key] = text;
  return true;
}

function patchWorkflowPromptWidgets(workflow, binding, text) {
  if (!workflow || !binding?.nodeId || !text) return;
  const wantId = String(binding.nodeId);
  const widget = String(binding.widget || "text");
  const graphs = [];
  if (Array.isArray(workflow.nodes)) graphs.push({ id: "", nodes: workflow.nodes });
  const subs = workflow.definitions?.subgraphs;
  if (Array.isArray(subs)) {
    for (const sg of subs) {
      if (sg && Array.isArray(sg.nodes)) graphs.push({ id: String(sg.id || ""), nodes: sg.nodes });
    }
  }
  const writeNode = (node) => {
    if (!node) return;
    const named = node.widgets_values_named;
    if (named && typeof named === "object" && !Array.isArray(named) && typeof named[widget] === "string") {
      named[widget] = text;
      if (Array.isArray(node.widgets_values)) {
        const idx = Object.keys(named).indexOf(widget);
        if (idx >= 0 && idx < node.widgets_values.length) node.widgets_values[idx] = text;
      }
      return;
    }
    if (Array.isArray(node.widgets_values)) {
      const i = node.widgets_values.findIndex((v) => typeof v === "string");
      if (i >= 0) node.widgets_values[i] = text;
    }
  };
  for (const graph of graphs) {
    if (binding.graphId && graph.id && graph.id !== String(binding.graphId)) continue;
    for (const node of graph.nodes) {
      if (node && String(node.id) === wantId) writeNode(node);
    }
  }
  if (!binding.graphId || !Array.isArray(workflow.nodes)) return;
  for (const node of workflow.nodes) {
    if (!node || String(node.type || "") !== String(binding.graphId)) continue;
    const named = node.widgets_values_named;
    if (!named || typeof named !== "object" || Array.isArray(named) || typeof named[widget] !== "string") continue;
    named[widget] = text;
    if (Array.isArray(node.widgets_values)) {
      const idx = Object.keys(named).indexOf(widget);
      if (idx >= 0 && idx < node.widgets_values.length) node.widgets_values[idx] = text;
    }
  }
}

function patchQueuedReferenceText(prompt, pack) {
  const output = prompt?.output;
  if (!output || !pack) return;
  const text = liveQueuePrompt(pack);
  if (!text) return;
  const binding = pack.binding;
  let wrote = false;
  if (binding?.nodeId) {
    for (const [id, node] of Object.entries(output)) {
      if (!promptNodeMatches(id, binding)) continue;
      const inputs = node?.inputs;
      if (!inputs || typeof inputs !== "object") continue;
      const widget = String(binding.widget || "");
      const current = typeof inputs[widget] === "string" ? inputs[widget]
        : (typeof inputs.text === "string" ? inputs.text : (typeof inputs.prompt === "string" ? inputs.prompt : ""));
      const next = typeof current === "string" && current ? patchQueueString(current, pack) : text;
      if (writePromptInput(node, widget, next === current ? text : next)) wrote = true;
    }
  }
  if (!wrote) {
    const clips = [];
    for (const node of Object.values(output)) {
      const title = String(node?._meta?.title || "").trim().toLowerCase();
      const inputs = node?.inputs;
      if (!inputs) continue;
      const has = typeof inputs.text === "string" || typeof inputs.prompt === "string";
      if (!has) continue;
      if (title === "prompt") {
        const current = typeof inputs.text === "string" ? inputs.text : inputs.prompt;
        const replaced = patchQueueString(current, pack);
        if (writePromptInput(node, "text", replaced !== current ? replaced : text)) {
          wrote = true;
          break;
        }
      }
      if (node.class_type === "CLIPTextEncode" && title !== "negative") clips.push(node);
    }
    if (!wrote && clips.length === 1) {
      const inputs = clips[0].inputs;
      const current = typeof inputs.text === "string" ? inputs.text : inputs.prompt;
      writePromptInput(clips[0], "text", patchQueueString(current, pack) === current ? text : patchQueueString(current, pack));
    }
  }
  if (pack.injected && pack.injected !== pack.base) {
    for (const node of Object.values(output)) {
      const inputs = node?.inputs;
      if (!inputs || typeof inputs !== "object") continue;
      for (const key of Object.keys(inputs)) {
        if (typeof inputs[key] === "string") inputs[key] = patchQueueString(inputs[key], pack);
      }
    }
  }
  patchWorkflowPromptWidgets(prompt.workflow, binding, text);
}

function matchQueuedLoadImage(output, preferId) {
  const wanted = String(preferId || "");
  if (!output || !wanted) return null;
  const wantedLocal = promptLocalId(wanted);
  const nested = wanted.includes(":");
  for (const [id, node] of Object.entries(output)) {
    if (!node || node.class_type !== "LoadImage") continue;
    const sid = String(id);
    if (sid === wanted) return node;
    if (wantedLocal && (nested ? sid.endsWith(`:${wantedLocal}`) : sid === wantedLocal || sid.endsWith(`:${wantedLocal}`))) return node;
  }
  return null;
}

function patchQueuedReferenceImages(prompt, files, startId) {
  const output = prompt?.output;
  if (!output || !files?.length) return;
  const skip = String(startId || "");
  for (const row of files) {
    if (!row?.nodeId || !row.file || String(row.nodeId) === skip) continue;
    const node = matchQueuedLoadImage(output, row.nodeId);
    if (!node) continue;
    const inputs = node.inputs && typeof node.inputs === "object" ? node.inputs : (node.inputs = {});
    if (!Array.isArray(inputs.image)) inputs.image = row.file;
  }
}

async function stageReferenceStill(media) {
  if (!media?.id) return "";
  if (media.kind === "video" || media.animated) {
    const res = await api.fetchApi(`/gonggan/poster?id=${encodeURIComponent(media.id)}`);
    if (!res.ok) return "";
    const blob = await res.blob();
    const filename = `ref_${media.id}.jpg`;
    const form = new FormData();
    form.append("image", new File([blob], filename, { type: blob.type || "image/jpeg" }));
    form.append("overwrite", "true");
    form.append("type", "input");
    form.append("subfolder", "gonggan");
    const up = await api.fetchApi("/upload/image", { method: "POST", body: form });
    if (!up.ok) return "";
    const data = await up.json().catch(() => ({}));
    const name = String(data.name || filename).replace(/\\/g, "/");
    const sub = String(data.subfolder || "gonggan").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!sub || name.startsWith(`${sub}/`)) return name;
    return `${sub}/${name}`;
  }
  return copyVersionImageToInput(media.id);
}

async function stageQwenReferenceQueue(cut, rows) {
  const live = (rows || []).filter((row) => row && !row.missing);
  const warn = qwenRefWarning(live.length);
  if (warn) console.warn(`[gonggan] ${warn}`);
  const chosen = live.slice(0, 3);
  const images = ["", "", ""];
  const used = [];
  for (let i = 0; i < chosen.length; i++) {
    const row = chosen[i];
    let file = "";
    if (row.media?.id) {
      try {
        file = await stageReferenceStill(row.media);
      } catch {
        file = "";
      }
    }
    images[i] = file || "";
    const item = {
      ref_id: row.ref_id,
      name: row.name || "",
      category: row.category || "Other",
      mode: file ? "image" : "text",
    };
    if (file) item.slot = `image${i + 1}`;
    used.push(item);
  }
  for (const row of live.slice(3)) {
    used.push({
      ref_id: row.ref_id,
      name: row.name || "",
      category: row.category || "Other",
      mode: "text",
    });
  }
  if (!images.some(Boolean) && !chosen.length) {
    const ver = findCutVersion(cut, selectedStillTakeId(cut));
    if (isStillVersion(ver)) {
      try {
        images[0] = (await copyVersionImageToInput(ver.id)) || "";
      } catch {
        images[0] = "";
      }
    }
  }
  return { files: [], used, qwenImages: images };
}

async function stageReferenceQueue(cut) {
  const rows = cutRefRows(cut);
  const wf = workflowSnapshotForCut(cut.id);
  if (workflowHasQwenEdit(wf)) return stageQwenReferenceQueue(cut, rows);
  let startId = "";
  try {
    startId = findVideoImageTarget(wf)?.id || "";
  } catch {
    startId = "";
  }
  const files = [];
  const used = [];
  for (const row of rows) {
    if (row.missing) continue;
    let mode = referenceUseMode(row);
    let slot = mode === "image" ? row.slot : "";
    if (slot && startId && String(slot) === String(startId)) {
      mode = "text";
      slot = "";
    }
    if (mode === "image" && slot) {
      try {
        const file = await stageReferenceStill(row.media);
        if (file) files.push({ nodeId: slot, file });
        else {
          mode = "text";
          slot = "";
        }
      } catch {
        mode = "text";
        slot = "";
      }
    }
    const item = {
      ref_id: row.ref_id,
      name: row.name || "",
      category: row.category || "Other",
      mode: mode === "image" ? "image" : "text",
    };
    if (item.mode === "image" && slot) item.slot = slot;
    used.push(item);
  }
  return { files, used, qwenImages: null };
}

/** Queue the graph that is open. A video graph also receives the cut's selected image Take. */
async function injectCutDataForQueue() {
  ggPendingQueueSnap = null;
  const cut = openQueuedCut();
  if (!cut) return true;
  const cutId = cut.id;
  const pid = state.pid;
  await flushPendingCutFields();
  await persistOpenGraphEdits();
  const video = queueGraphIsVideo(cut);
  const controls = projectRandomSeedOn() ? pinSeedControls() : [];
  let sourceImageTake = "";
  ggApplyingCutData = true;
  try {
    const linearSnap = captureGraphWorkflowSnapshot();
    const linear = linearBindings(linearSnap);
    const pack = queuePromptPack(cut);
    const promptText = liveQueuePrompt(pack);
    if (linear?.positive) {
      setLiveBoundWidget(linear.positive, promptText);
      if (linear.negative) {
        setLiveBoundWidget(linear.negative, readCutData(cut).negative || "");
      }
    }
    if (projectRandomSeedOn()) {
      const seed = randomQueueSeed();
      const ids = linearSnap ? cutSlotIds(linearSnap) : null;
      if (ids) setLiveSeedNodes(ids.seedIds, seed);
      for (const c of linear?.controls || []) {
        if (c.seed) setLiveBoundWidget(c, seed);
      }
    }
    ggQueuedStartFile = "";
    ggQueuedStartNode = "";
    if (video) {
      sourceImageTake = selectedStillTakeId(cut);
      ggQueuedStartFile = await feedVideoCutStartImage() || "";
    }
  } catch (e) {
    restoreSeedControls(controls);
    ggApplyingCutData = false;
    throw e;
  }
  const after = captureGraphWorkflowSnapshot();
  const take = extractTakeSnapshot(after);
  const bound = linearBindings(after);
  if (bound) {
    if (bound.positive) take.positive = liveQueuePrompt(queuePromptPack(cut));
    if (bound.negative) take.negative = readCutData(cut).negative || "";
    const numerics = { ...(take.numerics || {}) };
    for (const c of bound.controls) {
      const v = readLiveWidgetValue(c.nodeId, c.widget);
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      numerics[c.widget] = v;
      if (c.seed) take.seed = v;
      if (c.widget === "steps") take.steps = v;
      if (c.widget === "cfg") take.cfg = v;
    }
    take.numerics = numerics;
  }
  const refQueue = await stageReferenceQueue(cut);
  ggQueuedRefFiles = refQueue.files;
  ggQueuedQwenImages = refQueue.qwenImages || null;
  ggQueuedPromptPack = queuePromptPack(cut);
  ggQueuedPromptPack.binding = bound?.positive || linearBindings(captureGraphWorkflowSnapshot())?.positive || null;
  ggPendingQueueSnap = {
    cutId,
    pid,
    positive: take.positive || "",
    negative: take.negative || "",
    seed: take.seed,
    steps: take.steps,
    cfg: take.cfg,
    frames: take.frames,
    numerics: take.numerics || {},
    input_image: take.inputImage || "",
    input_images: take.inputImages || [],
    workflow: after ? cloneGraph(after) : null,
    source_image_take: video ? sourceImageTake : "",
    refs_used: refQueue.used,
    controls,
  };
  return true;
}

/**
 * Video-cut queue only: the cut's selected still image becomes the Load Image start frame.
 * No selected image, or the copy fails: leave the graph alone and queue as before.
 * Image cuts return immediately.
 */
async function feedVideoCutStartImage({ force = false } = {}) {
  const extra = app.graph?.extra?.gonggan;
  const cutId = extra?.cutId;
  const pid = extra?.pid || extra?.projectId;
  if (!cutId || !pid || pid !== state.pid || !isNativeProject()) return "";
  const cut = cutById(cutId);
  if (!cut || (!force && !queueGraphIsVideo(cut))) return "";
  const ver = findCutVersion(cut, selectedStillTakeId(cut));
  if (!isStillVersion(ver)) {
    console.warn("[gonggan] video queue: no selected image result; queuing without a start frame", cutId);
    return "";
  }
  const binding = findVideoImageTarget(captureGraphWorkflowSnapshot());
  ggQueuedStartNode = binding?.nodeId || "";
  if (!binding && !liveStartImageNode()) {
    console.warn("[gonggan] video queue: no Load Image node; queuing without a start frame", cutId);
    return "";
  }
  let imageName = "";
  try {
    imageName = await copyVersionImageToInput(ver.id);
  } catch (e) {
    console.warn("[gonggan] video queue: could not copy the selected image; queuing as before", cutId, e);
    return "";
  }
  if (!applyLiveVideoImage(binding, imageName)) {
    console.warn("[gonggan] video queue: Load Image has no image widget; queuing as before", cutId);
    return "";
  }
  return imageName;
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
  if (!c) {
    const hint = shotsUi.refTab && isNativeProject()
      ? "Select a reference to see its versions"
      : `Select a cut to see its ${takesNoun(captionLangNow())}`;
    return `<div class="gg-vs-empty gg-dim">${esc(hint)}</div>`;
  }
  const importSt = importButtonState({ hasCut: !!c, native: isNativeProject(), busy: stripImportBusy });
  const tileDis = importSt.disabled ? " disabled" : "";
  const tile = `<button type="button" class="gg-vs-import-tile"${tileDis} title="${esc(IMPORT_TILE_TIP)}">+</button>`;
  const rows = versionStripRows(c, stripProbe.dur);
  if (!rows.length) {
    const noun = shotsUi.refTab && isNativeProject() ? "versions" : takesNoun(captionLangNow());
    return tile + `<div class="gg-vs-empty gg-dim">No ${esc(noun)}</div>`;
  }
  const tabOpen = ownedShotTabOpen();
  const byId = new Map((c.versions_list || []).map((v) => [v.id, v]));
  const thumbs = rows.map((r) => {
    const { wrapCls, tip, img } = versionThumbParts(c, byId.get(r.id), tabOpen);
    const title = r.state ? `${r.state} · ${tip}` : tip;
    const inMulti = !!(c && verSel.cutId === c.id && verSel.ids.size);
    const sel = inMulti ? verSel.ids.has(r.id) : r.id === selVid;
    const failed = !!byId.get(r.id)?.failed;
    const starOn = r.best ? " gg-on" : "";
    const xBtn = isNativeProject()
      ? `<button type="button" class="gg-vs-x" title="Hide this version. History can restore it." aria-label="Delete">×</button>`
      : "";
    return `<div class="${wrapCls} gg-vs-item${failed ? " gg-vs-failed" : ""}${r.best ? " gg-vs-best" : ""}${sel ? " gg-vs-sel" : ""}" data-vid="${esc(r.id)}"${sel ? ' aria-selected="true"' : ""}>
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
  const noun = takeNoun(captionLangNow());
  if (!c || !selVid) return `<div class="gg-vs-info-empty gg-dim">Select a ${esc(noun)}</div>`;
  const v = (c.versions_list || []).find((x) => x && x.id === selVid);
  const view = v ? { ...v, seed: v.seed != null ? v.seed : v.gen?.seed } : v;
  const pf = Number(state.timeline?.project?.settings?.fps);
  const fields = versionInfoFields(view, c, stripProbe.dur, Number.isFinite(pf) ? pf : undefined);
  const rows = versionInfoPanelRows(fields);
  const loadLabel = loadTakeWorkflowLabel(captionLangNow());
  return rows.map(({ label, value }) => {
    if (label === "Workflow") {
      return `<span class="gg-vs-info-k">${esc(label)}</span><button type="button" class="gg-btn gg-load-take" title="${esc(loadLabel)}">${esc(loadLabel)}</button>`;
    }
    return `<span class="gg-vs-info-k">${esc(label)}</span><span class="gg-vs-info-v">${esc(value)}</span>`;
  }).join("");
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
    aiFeaturesActive() && isNativeProject()
      ? (() => {
          const s = aiMakeCutIconButtonState(cutSplitUseAiOn);
          return `<button type="button" class="gg-btn gg-ir-btn gg-ir-aicut gg-ai-split" title="${esc(s.title)}" aria-label="${esc(s.ariaLabel)}"${s.disabled ? " disabled" : ""}>${ICON_WAND}</button>`;
        })()
      : "";
  return `<div class="gg-iconrow">
        <span class="gg-version" title="Shots plugin version — if this is not the latest, press Ctrl+F5">v${esc(GG_VERSION)}</span>
        ${aiWand}
        ${btn("gg-ir-scene", shotsUi.refTab ? "New Group" : "New scene", ICON_FOLDER)}
        ${btn("gg-ir-cut", shotsUi.refTab ? "New Reference" : "New cut", ICON_NEW_PAGE)}
        ${btn("gg-ir-del", "Delete", ICON_TRASH)}
      </div>`;
}

/** Icon row Delete: the same soft delete as the cut menu / Delete key, after the in-app confirm. */
async function confirmDeleteSelectedCuts() {
  if (!shotsUi.refTab && selectedSceneGroupIds().length) {
    await deleteSceneGroups(selectedSceneGroupIds());
    return;
  }
  const n = cutsForDelete().length;
  if (!n) return;
  const message = shotsUi.refTab
    ? (n === 1
      ? "Delete 1 reference?\nIt will be moved to trash. You can restore it from History."
      : `Delete ${n} references?\nThey will be moved to trash. You can restore them from History.`)
    : deleteCutsConfirmMessage(n);
  if (!(await askConfirm({ message, danger: true }))) return;
  await deleteSelectedCuts();
}

const APP_CONTROLS_OPEN_KEY = "gonggan-cut.appControlsOpen";
let appControlSaveTimer = 0;

function appControlsOpen() {
  try { return localStorage.getItem(APP_CONTROLS_OPEN_KEY) !== "0"; } catch (_) { return true; }
}

function comboChoices(widget) {
  let values = widget?.options?.values;
  if (typeof values === "function") {
    try { values = values(); } catch (_) { values = []; }
  }
  if (!Array.isArray(values)) return [];
  const cur = widget?.value;
  const list = values.slice(0, 400).map((v) => (v == null ? "" : String(v)));
  if (cur != null && cur !== "" && !list.includes(String(cur))) list.unshift(String(cur));
  return list;
}

function liveControlView(c) {
  const w = findLiveWidget(c.nodeId, c.widget);
  if (!w) return { ...c, missing: true, choices: [] };
  let kind = c.kind || "text";
  const values = w.options?.values;
  if (w.type === "toggle" || w.type === "boolean" || typeof w.value === "boolean") kind = "toggle";
  else if (w.type === "combo" || Array.isArray(values) || typeof values === "function") kind = "combo";
  else if (w.type === "number" || w.type === "slider" || typeof w.value === "number") kind = "number";
  const integer = !!c.integer || w.options?.precision === 0;
  return { ...c, kind, integer, missing: false, choices: kind === "combo" ? comboChoices(w) : [], value: w.value };
}

function appControlRowHtml(c) {
  const view = liveControlView(c);
  const label = view.label || view.widget;
  const title = `Node ${view.nodeId} · ${view.widget}`;
  const attrs = `data-node="${esc(view.nodeId)}" data-widget="${esc(view.widget)}" data-kind="${esc(view.kind)}"${view.integer ? ' data-integer="1"' : ""}${view.seed ? ' data-seed="1"' : ""}`;
  const randomOn = view.seed && projectRandomSeedOn();
  const dis = view.missing || randomOn ? " disabled" : "";
  const tip = view.missing
    ? `${title}. Widget is not on the open graph.`
    : randomOn
      ? "Random seed is on. Queue uses a new seed."
      : title;
  let field = "";
  if (view.kind === "toggle") {
    field = `<input type="checkbox" ${attrs}${view.value ? " checked" : ""}${dis} title="${esc(tip)}" />`;
  } else if (view.kind === "combo" && view.choices.length) {
    const opts = view.choices.map((v) => `<option value="${esc(v)}"${String(view.value) === v ? " selected" : ""}>${esc(v)}</option>`).join("");
    field = `<select ${attrs}${dis} title="${esc(tip)}">${opts}</select>`;
  } else if (view.kind === "number") {
    const step = view.integer ? "1" : "any";
    const shown = typeof view.value === "number" && Number.isFinite(view.value) ? String(view.value) : "";
    field = `<input type="number" step="${step}" ${attrs} value="${esc(shown)}"${dis} title="${esc(tip)}" />`;
  } else {
    field = `<input type="text" ${attrs} value="${esc(view.value == null ? "" : String(view.value))}"${dis} title="${esc(tip)}" />`;
  }
  return `<label class="gg-app-row"><span class="gg-app-k" title="${esc(title)}">${esc(label)}</span>${field}</label>`;
}

function openAppControls() {
  const cut = openCutForLinear();
  if (!cut) return null;
  const binding = linearBindings(captureGraphWorkflowSnapshot());
  if (!binding?.controls?.length) return null;
  return { cutId: cut.id, controls: binding.controls };
}

function ensureAppControlsEl() {
  let el = document.querySelector(".gg-app-controls");
  if (el) return el;
  el = document.createElement("div");
  el.className = "gg-app-controls";
  el.hidden = true;
  el.innerHTML = `<div class="gg-app-head"><button type="button" class="gg-app-fold" aria-label="Collapse inputs"></button><span class="gg-app-title">Inputs</span></div><div class="gg-app-body"></div>`;
  document.body.appendChild(el);
  el.querySelector(".gg-app-fold")?.addEventListener("click", () => {
    const open = !appControlsOpen();
    try { localStorage.setItem(APP_CONTROLS_OPEN_KEY, open ? "1" : "0"); } catch (_) {}
    paintAppControls();
  });
  const onEdit = (e) => onAppControlEdit(e);
  el.addEventListener("input", onEdit);
  el.addEventListener("change", onEdit);
  return el;
}

function placeAppControls(el) {
  const graph = editPreviewBox(graphWorkAreaElement());
  if (!graph) return false;
  const toolbarBottom = measureEditPreviewToolbarBottom(graph);
  const sides = measureEditPreviewSides(graph);
  const docker = measureRightDockerLeft(graph, toolbarBottom);
  const shots = document.querySelector(".gg-root.gg-shots");
  const area = editPreviewOverlayRect({
    graphRect: graph,
    toolbarBottom,
    shotsRect: shots ? shots.getBoundingClientRect() : null,
    rightPanelLeft: sides.right,
    rightDockerLeft: docker,
    bottomPanelTop: editOverlayBottom(graph),
  });
  if (!area) return false;
  const width = Math.min(240, Math.max(168, Math.round(area.width * 0.32)));
  const top = Math.round(area.top + 8);
  el.style.top = `${top}px`;
  el.style.left = `${Math.round(area.right - width - 8)}px`;
  el.style.width = `${width}px`;
  let maxH = Math.max(72, Math.round(area.height - 16));
  const stripTop = ownStripTop();
  if (stripTop != null) maxH = Math.min(maxH, Math.max(72, Math.round(stripTop - top - 8)));
  el.style.maxHeight = `${maxH}px`;
  return true;
}

let inputsTabBtn = null;
let inputsPane = null;
let inputsTabOn = false;
let inputsTabWanted = false;

function cutManagerVisible() {
  const shots = document.querySelector(".gg-root.gg-shots");
  if (!shots?.isConnected) return false;
  const r = shots.getBoundingClientRect();
  return r.width > 40 && r.height > 40;
}

/** The existing right-panel tab row. Never a copy of that row. */
function nativeRightTabRow() {
  const tab = document.getElementById("tab-parameters");
  const row = tab?.parentElement;
  if (!row || !row.querySelector("#tab-nodes") || !row.querySelector("#tab-settings")) return null;
  return row;
}

function removeInputsTab() {
  inputsTabWanted = false;
  inputsTabOn = false;
  inputsTabBtn?.remove();
  if (inputsPane) inputsPane.hidden = true;
  inputsPane?.remove();
}

function applyInputsTabState() {
  if (inputsTabBtn) inputsTabBtn.setAttribute("aria-selected", inputsTabOn ? "true" : "false");
  if (inputsPane) inputsPane.hidden = !inputsTabOn;
}

function selectInputsTab(on) {
  inputsTabOn = !!on && cutManagerVisible();
  applyInputsTabState();
  if (inputsTabOn) paintAppControls();
}

function placeInputsPane() {
  const pane = inputsPane;
  const tab = document.getElementById("tab-parameters");
  const panel = tab?.closest(".p-splitterpanel");
  if (!pane || pane.hidden || !panel) return;
  const nav = panel.querySelector("nav");
  const pr = panel.getBoundingClientRect();
  const top = nav ? nav.getBoundingClientRect().bottom : pr.top + 48;
  const bottom = Math.min(window.innerHeight, pr.bottom);
  pane.style.left = `${Math.round(pr.left)}px`;
  pane.style.top = `${Math.round(top)}px`;
  pane.style.width = `${Math.round(pr.width)}px`;
  pane.style.height = `${Math.max(80, Math.round(bottom - top))}px`;
}

function bindInputsTabOnce() {
  if (globalThis.__ggInputsTabClick) return;
  globalThis.__ggInputsTabClick = true;
  const mo = new MutationObserver(() => {
    if (!inputsTabWanted || !inputsTabBtn || !cutManagerVisible()) return;
    const row = nativeRightTabRow();
    if (!row || inputsTabBtn.parentElement === row) return;
    row.appendChild(inputsTabBtn);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("#gg-tab-inputs, #tab-parameters, #tab-nodes, #tab-settings");
    if (!btn || !cutManagerVisible()) return;
    if (btn.id === "gg-tab-inputs") {
      e.preventDefault();
      e.stopPropagation();
      selectInputsTab(true);
      return;
    }
    selectInputsTab(false);
  }, true);
}

/** One Inputs button on ComfyUI's own right tab row, only while Cut Manager is open. */
function ensureInputsTab() {
  if (!cutManagerVisible()) {
    removeInputsTab();
    return;
  }
  const row = nativeRightTabRow();
  if (!row) return;
  inputsTabWanted = true;
  if (!inputsTabBtn) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "gg-tab-inputs";
    btn.className = "gg-inputs-tab";
    btn.setAttribute("role", "tab");
    btn.textContent = "Inputs";
    btn.title = "Workflow inputs";
    inputsTabBtn = btn;
  }
  if (inputsTabBtn.parentElement !== row) row.appendChild(inputsTabBtn);
  if (!inputsPane) {
    const pane = document.createElement("div");
    pane.className = "gg-inputs-pane gg-app-controls";
    pane.hidden = true;
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-label", "Inputs");
    document.body.appendChild(pane);
    pane.addEventListener("input", onAppControlEdit);
    pane.addEventListener("change", onAppControlEdit);
    inputsPane = pane;
  } else if (!inputsPane.isConnected) {
    document.body.appendChild(inputsPane);
  }
  applyInputsTabState();
  bindInputsTabOnce();
}

function paintAppControls() {
  ensureInputsTab();
  document.querySelectorAll(".gg-app-controls:not(.gg-inputs-pane)").forEach((el) => { el.hidden = true; });
  const pane = inputsPane;
  if (!pane || pane.hidden) return;
  placeInputsPane();
  const spec = openAppControls();
  if (!spec) {
    if (pane.dataset.key !== "empty") {
      pane.dataset.key = "empty";
      pane.dataset.random = "";
      pane.innerHTML = `<p class="gg-inputs-empty">No inputs on this workflow.</p>`;
    }
    return;
  }
  const key = spec.controls.map((c) => `${c.nodeId}:${c.widget}:${c.kind}`).join("|");
  const randomOn = projectRandomSeedOn() ? "1" : "0";
  if (pane.dataset.key !== key || pane.dataset.random !== randomOn) {
    pane.dataset.key = key;
    pane.dataset.random = randomOn;
    pane.innerHTML = spec.controls.map(appControlRowHtml).join("");
    return;
  }
  for (const c of spec.controls) {
    const input = pane.querySelector(`[data-node="${CSS.escape(c.nodeId)}"][data-widget="${CSS.escape(c.widget)}"]`);
    if (!input || document.activeElement === input) continue;
    const view = liveControlView(c);
    if (view.kind === "toggle") input.checked = !!view.value;
    else if (view.value != null && input.value !== String(view.value)) input.value = String(view.value);
    if (c.seed) {
      input.disabled = projectRandomSeedOn();
      input.title = input.disabled ? "Random seed is on. Queue uses a new seed." : `Node ${c.nodeId} · ${c.widget}`;
    }
  }
}

function onAppControlEdit(e) {
  const input = e.target?.closest?.("[data-node][data-widget]");
  if (!input || input.disabled) return;
  const kind = input.dataset.kind || "text";
  let value;
  if (kind === "toggle") {
    if (e.type === "input") return;
    value = !!input.checked;
  } else if (kind === "number") {
    if (input.value.trim() === "" || input.value === "-" || input.value === ".") return;
    const n = Number(input.value);
    if (!Number.isFinite(n)) return;
    value = input.dataset.integer === "1" && e.type === "change" ? Math.round(n) : n;
  } else if (kind === "combo") {
    if (e.type === "input") return;
    value = input.value;
  } else {
    value = input.value;
  }
  setLiveNamedWidget(input.dataset.node, input.dataset.widget, value);
  const cutId = app.graph?.extra?.gonggan?.cutId;
  if (!cutId) return;
  clearTimeout(appControlSaveTimer);
  appControlSaveTimer = setTimeout(() => {
    appControlSaveTimer = 0;
    void saveCutWorkflowNow(cutId);
  }, 400);
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
      if (c.kind === "reference") pickReferenceVersionFiles(c.id);
      else pickVersionImportFiles(c.id);
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
        const order = versionStripRows(c, stripProbe.dur).map((r) => r.id);
        if (verSel.cutId !== c.id) {
          verSel.cutId = c.id;
          verSel.ids = new Set();
          verSel.anchor = "";
        }
        if (e.shiftKey) {
          const anchor = verSel.anchor || stripSelectedVersionId(c) || vid;
          const i = order.indexOf(anchor);
          const j = order.indexOf(vid);
          verSel.ids = new Set();
          if (i < 0 || j < 0) verSel.ids.add(vid);
          else for (let k = Math.min(i, j); k <= Math.max(i, j); k++) verSel.ids.add(order[k]);
          verSel.anchor = anchor;
        } else if (e.ctrlKey || e.metaKey) {
          if (!verSel.ids.size) {
            const cur = stripSelectedVersionId(c);
            if (cur) verSel.ids.add(cur);
          }
          if (verSel.ids.has(vid)) verSel.ids.delete(vid);
          else verSel.ids.add(vid);
          verSel.anchor = vid;
        } else {
          verSel.ids = new Set([vid]);
          verSel.anchor = vid;
        }
        verSel.cutId = c.id;
        shotsUi.selTarget = "versions";
        selectStripVersion(c.id, vid);
      });
      wrap.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!(verSel.cutId === c.id && verSel.ids.has(vid))) {
          verSel.cutId = c.id;
          verSel.ids = new Set([vid]);
          verSel.anchor = vid;
        }
        shotsUi.selTarget = "versions";
        const menuItems = versionStripMenuItems(row).map((it) => (
          it.key === "loadWf" ? { ...it, label: loadTakeWorkflowLabel(captionLangNow()) } : it
        ));
        showCtxMenu(e.clientX, e.clientY, attachMenuActions(menuItems, {
          loadWf: () => { void loadWorkflowFromTake(c.id, vid); },
          best: () => setPick(c.id, vid),
          del: () => { void deleteVersion(c.id, vid); },
        }));
      });
    });
  };
  const stripCut = () => (shotsUi.refTab && isNativeProject() ? selectedReference() : selectedShot());
  /** Thumbnail click: select this Take. The cut workflow stays until "Load workflow from this take". */
  const selectStripVersion = (cutId, vid) => {
    Object.assign(stripPick, { pid: state.pid, cutId, vid });
    noteTakeKind(cutById(cutId), vid);
    void setDisplayVersion(cutId, vid);
    paintVersionStrip();
    if (referenceById(cutId)) bus.dispatchEvent(new Event("select"));
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
        bindHoverPlay(list);
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
        info.querySelector(".gg-load-take")?.addEventListener("click", (e) => {
          e.stopPropagation();
          if (c && selVid) void loadWorkflowFromTake(c.id, selVid);
        });
      }
    }
  };
  const paintDetail = () => {
    const host = root.querySelector(".gg-sel-detail-host");
    if (!host) return;
    const show = !!state.timeline && shotsViewOf(SHOW_FINAL_LIST, shotsUi.view) !== "final";
    const html = show ? selectionDetailHtml() : "";
    host.hidden = !html;
    if (host.contains(document.activeElement) && host.dataset.html) return;
    if (host.dataset.html === html) return;
    host.dataset.html = html;
    host.innerHTML = html;
    bindSelectionDetail(host);
  };
  const paintPanel = () => {
    paintDetail();
    paintCutRefStrip(root);
    paintVersionStrip();
    placeEditTakesStrip();
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
    bindHoverPlay(panel);
    bindThumbFallbacks(panel);
    panel.querySelectorAll(".gg-promote").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = b.closest(".gg-ver-wrap");
      if (!b.disabled && wrap) setPick(c.id, wrap.dataset.vid);
    }));
    panel.querySelectorAll(".gg-ver-wrap > .gg-ver").forEach((t) => t.addEventListener("click", (e) => {
      e.stopPropagation();
      const vid = t.closest(".gg-ver-wrap")?.dataset?.vid;
      if (c && vid) {
        Object.assign(stripPick, { pid: state.pid, cutId: c.id, vid });
        noteTakeKind(c, vid);
        void setDisplayVersion(c.id, vid);
      }
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
  const FIELD_TEXT_SEL = ".gg-caption-text, .gg-prompt-text, .gg-desc-text";

  function fieldTextKind(el) {
    if (el?.classList?.contains("gg-desc-text")) return "description";
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
    const sel = cap.field === "description"
      ? ".gg-desc-text"
      : cap.field === "prompt"
        ? ".gg-prompt-text:not(.gg-desc-text)"
        : ".gg-caption-text";
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

  function captureDetailFocus() {
    const el = document.activeElement;
    if (!el || !root.contains(el) || !el.closest(".gg-sel-detail")) return null;
    const field = el.dataset?.field || "";
    if (!field) return null;
    return {
      cutId: state.cutId,
      field,
      value: el.value,
      selectionStart: el.selectionStart,
      selectionEnd: el.selectionEnd,
      scrollTop: el.scrollTop,
    };
  }

  function restoreDetailFocus(cap) {
    if (!cap?.field || state.cutId !== cap.cutId) return;
    const el = root.querySelector(`.gg-sel-detail [data-field="${CSS.escape(cap.field)}"]`);
    if (!el) return;
    el.value = cap.value;
    el.focus({ preventScroll: true });
    try {
      el.setSelectionRange(cap.selectionStart, cap.selectionEnd);
    } catch (_) {}
    el.scrollTop = cap.scrollTop || 0;
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
      if (ta.classList.contains("gg-prompt-text") && !ta.classList.contains("gg-desc-text")) bindMentionField(ta);
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
      ta._ggEnterEdit = enterCardFieldEdit;

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
        } else if (kind === "prompt") {
          const row = cutById(id);
          if (!row) return;
          const prev = row.prompt;
          row.prompt = ta.value;
          scheduleCutFieldSave(id, { prompt: ta.value }, { prompt: prev });
          syncPromptNodeFromField(id, ta.value);
        } else if (kind === "description") {
          const row = cutById(id);
          if (!row) return;
          const prev = row.description || "";
          row.description = ta.value;
          scheduleCutFieldSave(id, { description: ta.value }, { description: prev });
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
    closeRefPicker();
    if (shouldDeferListPaint({ composing: shotsUi.composing, inlineRenaming: !!shotsUi.inlineRename || !!shotsUi.inlineSceneRename })) {
      shotsUi.paintDeferred = true;
      return;
    }
    const storyCap = captureFieldTextFocus();
    const detailCap = captureDetailFocus();
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
    const refTab = !!shotsUi.refTab && !!tl && isNativeProject() && !viewFinal;
    const listHtml = refTab ? referenceLibraryHtml() : (emptyHint || groupedListHtml(sections, {
      cutHtml: (c) => cutRowHtml(c, cutLabels),
      groupHue: groupColor,
      groupProgress: (secCuts) => {
        const { best, total } = sceneBestProgress(secCuts);
        return `${best}/${total}`;
      },
    }));
    root.className = `gg-root gg-shots${listCaption && !refTab ? " gg-list-caption" : ""}${listPrompt && !refTab ? " gg-list-prompt" : ""}${refTab ? " gg-list-reference" : ""}${CUT_PANEL_ROOT_CLASS}`;
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
          <button type="button" class="gg-btn${!refTab && listMode === "info" ? " gg-on" : ""}" data-mode="info" title="Show cut details">Info</button>
          <button type="button" class="gg-btn${!refTab && listPrompt ? " gg-on" : ""}" data-mode="prompt" title="Edit prompts per cut">Prompt</button>
          <button type="button" class="gg-btn${!refTab && listCaption ? " gg-on" : ""}" data-mode="caption" title="Edit dialogue per cut">Caption</button>
          ${tl && isNativeProject() ? `<button type="button" class="gg-btn${refTab ? " gg-on" : ""}" data-mode="reference" title="References">Reference</button>` : ""}
        </div>
        ${SHOW_REDO_FILTER ? `<label class="gg-filter-redo" title="Show only cuts marked for redo"><input type="checkbox"${shotsUi.needsRedoOnly ? " checked" : ""}${viewFinal ? " disabled" : ""} /> Show redo cuts only</label>` : ""}
      </div>
      <div class="gg-meta">
        <span class="gg-meta-text">${refTab ? `${activeReferences().length} references` : (tl ? `${tl.cuts.length} shots · ${groups.length} scenes · ${fmt(tl.total_sec)}` : "")}</span>
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
      <div class="gg-sel-detail-host"${tl && !viewFinal ? "" : " hidden"}></div>
      <div class="gg-vstrip" role="group" aria-label="${esc(takesNoun(captionLangNow()))}"${tl && !viewFinal ? "" : " hidden"}>
        <div class="gg-vs-body">
          <div class="gg-cut-reflinks" hidden></div>
          <div class="gg-vs-row">
            <div class="gg-vs-list"></div>
            <button type="button" class="gg-btn gg-vs-newest" hidden title="Back to newest" aria-label="Back to newest">‹</button>
          </div>
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
        if (btn.dataset.mode === "reference") {
          if (!shotsUi.refTab) {
            noteLastShot(state.cutId);
            clearSceneGroupSelection();
            shotsUi.selFromGroup = false;
            shotsUi.selGroupKey = "";
          }
          shotsUi.refTab = true;
          saveRefTab(true);
          paint();
          return;
        }
        if (shotsUi.refTab) {
          shotsUi.selFromGroup = false;
          shotsUi.selGroupKey = "";
        }
        shotsUi.refTab = false;
        saveRefTab(false);
        if (referenceById(state.cutId)) {
          const back = shotIdToRestore();
          if (back) selectCut(back);
        }
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
    root.querySelector(".gg-ir-scene")?.addEventListener("click", () => {
      if (shotsUi.refTab && isNativeProject()) {
        void addReferenceGroup();
        return;
      }
      if (isNativeProject()) void addEmptyScene();
      else createSceneGroup(cutSelIds());
    });
    root.querySelector(".gg-ir-cut")?.addEventListener("click", () => {
      if (shotsUi.refTab && isNativeProject()) {
        void addReferenceInSelectedGroup();
        return;
      }
      addLocalCut();
    });
    root.querySelector(".gg-ai-split")?.addEventListener("click", () => openAiCutSplitModal());
    root.querySelector(".gg-ir-del")?.addEventListener("click", () => {
      if (shotsUi.refTab && referenceById(state.cutId)) {
        void deleteReference(state.cutId);
        return;
      }
      void confirmDeleteSelectedCuts();
    });
    root.querySelector(".gg-queue-btn")?.addEventListener("click", () => void queueButtonClick());
    const randomSeedCb = root.querySelector(".gg-random-seed-cb");
    if (randomSeedCb && !randomSeedCb.dataset.bound) {
      randomSeedCb.dataset.bound = "1";
      randomSeedCb.checked = projectRandomSeedOn();
      randomSeedCb.addEventListener("change", () => {
        void persistRandomSeedToProject(randomSeedCb.checked);
        paintAppControls();
      });
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
      clearSceneGroupSelection();
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
    root.querySelector(".gg-cut-reflinks")?.addEventListener("click", (e) => {
      const cut = selectedShot();
      if (!cut) return;
      const x = e.target.closest("[data-ref-unlink]");
      if (x) {
        e.preventDefault();
        e.stopPropagation();
        unlinkReferenceFromCut(cut, x.dataset.refUnlink);
        return;
      }
      const add = e.target.closest(".gg-refthumb-add");
      if (!add) return;
      e.preventDefault();
      e.stopPropagation();
      openRefPicker(add, cut);
    });
    root.querySelectorAll(".gg-cut").forEach((li) => {
      if (li.dataset.kind === "reference") {
        li.addEventListener("click", (e) => {
          const fieldEl = e.target.closest(FIELD_TEXT_SEL);
          if (fieldEl && shouldSkipCardSelect({ inEditMode: isCardFieldEditing(fieldEl) })) return;
          e.stopPropagation();
          const id = li.dataset.cutId;
          const verBtn = e.target.closest(".gg-ref-ver");
          if (verBtn?.dataset?.vid) {
            selectCut(id);
            selectStripVersion(id, verBtn.dataset.vid);
            paintSelection(root);
            paintPanel();
            return;
          }
          if (e.shiftKey) selectCut(id, { range: true });
          else selectCut(id, { multi: e.ctrlKey || e.metaKey });
          paintSelection(root);
          paintPanel();
        });
        li.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openReferenceMenu(li.dataset.cutId, e.clientX, e.clientY);
          paintSelection(root);
          paintPanel();
        });
        return;
      }
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
    const bindGroupHead = (head, groupKey, { scene = false } = {}) => {
      head.addEventListener("click", (e) => {
        if (e.target.closest("button, input, textarea, a")) return;
        if (shotsUi.blockHeadSelect) {
          shotsUi.blockHeadSelect = false;
          return;
        }
        if (scene) {
          selectSceneGroup(groupKey, { multi: !!(e.ctrlKey || e.metaKey), range: !!e.shiftKey });
        } else {
          const sec = head.closest(".gg-grp-sec");
          const ids = [...(sec?.querySelectorAll(".gg-cut") || [])].map((li) => li.dataset.cutId).filter(Boolean);
          selectListedGroup(ids, { multi: !!(e.ctrlKey || e.metaKey), range: !!e.shiftKey, groupKey });
        }
        paintSelection(root);
        paintPanel();
      });
    };
    root.querySelectorAll(".gg-grp-sec[data-group-id] .gg-grp-head").forEach((head) => {
      const sec = head.closest(".gg-grp-sec");
      const gid = sec?.dataset?.groupId;
      if (!gid || sec.classList.contains("gg-ref-sec")) return;
      head.addEventListener("contextmenu", (e) => openSceneContextMenu(e, gid));
      bindGroupHead(head, gid, { scene: true });
    });
    root.querySelectorAll(".gg-grp-sec[data-loose] > .gg-grp-head").forEach((head) => bindGroupHead(head, "ungrouped"));
    root.querySelectorAll(".gg-grp-sec > .gg-cutlist").forEach((list) => {
      if (list.querySelector(".gg-cut")) return;
      list.addEventListener("click", (e) => {
        if (e.target.closest("button, input, textarea, a, .gg-cut")) return;
        const sec = list.closest(".gg-grp-sec");
        const groupKey = sec?.dataset.groupId || sec?.dataset.refGroup || (sec?.hasAttribute("data-loose") ? "ungrouped" : "");
        if (!groupKey) return;
        if (sec.dataset.groupId && !sec.dataset.refGroup && !sec.classList.contains("gg-ref-sec")) {
          selectSceneGroup(sec.dataset.groupId, { multi: !!(e.ctrlKey || e.metaKey), range: !!e.shiftKey });
        } else {
          if (sec.dataset.refGroup) refsUi.groupId = sec.dataset.refGroup;
          selectListedGroup([], { multi: !!(e.ctrlKey || e.metaKey), range: !!e.shiftKey, groupKey });
        }
        paintSelection(root);
        paintPanel();
      });
    });
    bindHoverPlay(root);
    bindThumbFallbacks(root);
    if (!refTab) bindShotsReorder(root);
    bindReferenceGroup(root);
    bindCutFieldTextareas();
    restoreFieldTextFocus(storyCap);
    paintPanel();
    restoreDetailFocus(detailCap);
    autoSizeAllFieldTextareas();
    observeListWrapForFieldHeight();
    paintSelection(root);
    paintPanel();
    paintProjectSummary(root);
    paintAllCutProgress();
    syncProgressWireState();
    applyPlayCutHighlight();
    fit();
    placeEditTakesStrip();
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
  const onAiFeatures = () => paint();
  bus.addEventListener("cut-split-use-ai", onUseAi);
  bus.addEventListener("ai-features", onAiFeatures);
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
  void adoptServerAiFeaturesIfUnset();
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
      shotsUi.selFromGroup = false;
      if (verSel.ids.size) {
        verSel.ids.clear();
        verSel.anchor = "";
      }
      if (state.cutSel.size || state.groupSel.size) {
        state.cutSel.clear();
        cutSelAnchor = "";
        clearSceneGroupSelection();
        updateSelectionBar(root);
        paintSelection(root);
        bus.dispatchEvent(new Event("select"));
      }
      return;
    }
    if (action === "delete") {
      const overStrip = !!root.querySelector(".gg-vstrip:hover");
      const c = cutById(state.cutId);
      const stripVid = c ? stripSelectedVersionId(c) : "";
      const pickedVersions = c && verSel.cutId === c.id && verSel.ids.size ? [...verSel.ids] : [];
      const deleteVersionsNow = isNativeProject() && c && (
        (shotsUi.selTarget === "versions" && pickedVersions.length > 1)
        || (overStrip && (pickedVersions.length || stripVid))
      );
      if (deleteVersionsNow) {
        const ids = pickedVersions.length ? pickedVersions : [stripVid];
        handled();
        if (!e.repeat) void deleteVersions(c.id, ids);
        return;
      }
      if (!shotsUi.refTab && selectedSceneGroupIds().length) {
        handled();
        if (!e.repeat) void confirmDeleteSelectedCuts();
        return;
      }
      if (!cutsForDelete().length) return;
      handled();
      if (!e.repeat) void confirmDeleteSelectedCuts();
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
      case "open": {
        if (e.target?.closest?.("button, a[href], summary, [role='button']")) return;
        const mode = normalizeListMode(shotsUi.listMode);
        if (!shotsUi.refTab && (mode === "prompt" || mode === "caption")) {
          const id = state.cutId && cutById(state.cutId) ? state.cutId : (ids[0] || "");
          const fieldSel = mode === "caption"
            ? "textarea.gg-caption-text"
            : "textarea.gg-prompt-text:not(.gg-desc-text)";
          const ta = id ? root.querySelector(`.gg-cut[data-cut-id="${CSS.escape(id)}"] ${fieldSel}`) : null;
          if (ta && !ta.disabled && typeof ta._ggEnterEdit === "function") {
            handled();
            ta._ggEnterEdit();
            return;
          }
        }
        if (ids.length !== 1) return;
        handled();
        selectCutFromKeys(ids[0]);
        return;
      }
      case "rename":
        if (!isNativeProject()) return;
        if (selectedReference() && !state.cutSel.size) {
          handled();
          void renameReference(selectedReference().id);
          return;
        }
        if (ids.length !== 1) return;
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
    if (e.target.closest(".gg-cut") || e.target.closest(".gg-grp-head") || e.target.closest(".gg-ref-group") || e.target.closest(".gg-sel-detail") || e.target.closest(".gg-selbar") || e.target.closest(".gg-iconrow") || e.target.closest(".gg-vstrip") || e.target.closest(".gg-cutpanel") || e.target.closest(".gg-ctx")) return;
    const emptyList = e.target.closest(".gg-cutlist");
    if (emptyList && !emptyList.querySelector(".gg-cut")) return;
    if (!state.cutSel.size && !shotsUi.selFromGroup && !state.groupSel.size) return;
    shotsUi.selFromGroup = false;
    shotsUi.selGroupKey = "";
    state.cutSel.clear();
    cutSelAnchor = "";
    state.groupSel.clear();
    groupSelAnchor = "";
    updateSelectionBar(root);
    paintSelection(root);
    bus.dispatchEvent(new Event("select"));
  };
  const onShotsPanelContextMenu = (e) => {
    if (!root.contains(e.target) || !e.target.closest(".gg-grp-wrap")) return;
    if (e.target.closest(".gg-cut") || e.target.closest(".gg-ref-group") || e.target.closest(".gg-grp-sec[data-group-id] .gg-grp-head")) return;
    openShotsPanelContextMenu(e);
  };
  root.addEventListener("mouseenter", () => { root._ggHover = true; });
  root.addEventListener("mouseleave", () => { root._ggHover = false; });
  root.addEventListener("mousedown", onShotsEmptyClick);
  root.addEventListener("contextmenu", onShotsPanelContextMenu);
  root.addEventListener("dblclick", onShotsTitleDblClick);
  document.addEventListener("keydown", onShotsKey);
  window.addEventListener("keydown", onShotsSelectAllKey, true);
  ensureInputsTab();
  return () => {
    removeInputsTab();
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
    bus.removeEventListener("ai-features", onAiFeatures);
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
  lastSaveOk: true,
  scrubbing: false,
  scrubResumePlay: false,
  tlResizing: false,
};
const play = { on: false, t: 0, idx: -1, raf: 0, last: 0, gen: 0, tickGen: 0 };
/** True while a pause/stop writes the cut under the playhead. That must not seek. */
let selectionHoldsPlayhead = false;

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
  const now = snapshotTimelineEdit(state.timeline);
  if (!now) return;
  if (before.list) now.list = snapshotOrderGroups(state.timeline);
  if (sameSnapshot(before, now)) return;
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
  ed.lastSaveOk = ok;
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
  const text = viewer && viewer.mode === "export" ? "" : captionAtTime(trackClips(), play.t);
  if (viewer?.caption && viewer.caption.textContent !== text) viewer.caption.textContent = text;
  const cap = document.querySelector(".gg-edit-preview-cap");
  if (cap && cap.textContent !== text) cap.textContent = text;
}

/** Timeline thumb and playback. Best when the cut has one; otherwise the shown take. Does not replace the cut. */
function clipForTimeline(c) {
  if (!c || c.kind === "reference") return c;
  const id = timelineClipVersionId(c);
  if (!id || c.media?.id === id) return c;
  const v = (c.versions_list || []).find((x) => x && x.id === id);
  const media = v ? versionMedia(v) : null;
  if (!media) return { ...c, media: null };
  const src = media.kind === "video" ? Math.max(0, Number(v.seconds) || 0) : 0;
  return { ...c, media, src_dur: src || c.src_dur };
}

function showFrame(force) {
  if (!viewer) return;
  paintViewerCaption();
  if (viewer.mode === "export") { paintHead(); return; }
  const cuts = trackClips();
  const { i, local } = itemAt(play.t);
  const raw = cuts[i] || null;
  const c = clipForTimeline(raw);
  if (play.on && i !== play.idx) cancelEditPreviewFilm();
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
  if (c && isAnimatedImage(c.media) && !animImgFallbackUrls.has(mediaUrl(c.media.id))) {
    const cache = animScrubBytesCache.get(mediaUrl(c.media.id));
    const idx = computeScrubFrameIndex(c, local, cache?.ready ? cache : null);
    if (idx != null) setPreviewFrameIndex(idx);
  }
  paintHead();
  refreshEditPreviewStill(raw ? c : null);
}

const animScrubBytesCache = new Map();
// Urls that cannot use ImageDecoder stay on the plain <img> path. One decision per url.
const animImgFallbackUrls = new Set();
let animScrubPaintGen = 0;

function animImgFallback(url) {
  if (animImgFallbackUrls.has(url)) return true;
  if (typeof ImageDecoder === "undefined" || window.isSecureContext === false) {
    animImgFallbackUrls.add(url);
    return true;
  }
  return false;
}

function animFailToImg(url) {
  if (!url || animImgFallbackUrls.has(url)) return;
  animImgFallbackUrls.add(url);
  if (!viewer) return;
  const cur = clipForTimeline(trackClips()[play.idx]);
  if (!cur?.media || mediaUrl(cur.media.id) !== url) return;
  setPreviewFrameIndex(null);
  syncAnimatedStillImg(cur);
}

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
  if (animImgFallbackUrls.has(url)) return;
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
    if (gen !== animScrubPaintGen || !viewer || animImgFallbackUrls.has(url)) return;
    const idx = computeScrubFrameIndex(c, local, cache);
    if (idx == null) {
      if (cache?.ready) animFailToImg(url);
      return;
    }
    const key = `${url}#${idx}`;
    if (still._ggKey === key && !still.hidden) {
      setPreviewFrameIndex(idx);
      mirrorEditPreviewFrame(still, idx);
      return;
    }
    const { bmp, frameIdx } = await decodeAnimatedScrubFrame(cache, idx);
    if (gen !== animScrubPaintGen || !viewer || animImgFallbackUrls.has(url)) {
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
  } catch (_) {
    animFailToImg(url);
  }
}

/** Animated WebP/GIF clips: playhead-synced decoded frame on canvas (paused, scrub, playback). */
function syncAnimatedStill(c, local) {
  if (!viewer || !viewer.still) return;
  const fallbackUrl = c?.media && isAnimatedImage(c.media) ? mediaUrl(c.media.id) : "";
  if (fallbackUrl && animImgFallback(fallbackUrl)) {
    setPreviewFrameIndex(null);
    syncAnimatedStillImg(c);
    return;
  }
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

/**
 * Animated WebP/GIF "video" versions are drawn with <img>, which has no pause():
 * the browser keeps animating it no matter what the transport does. While stopped,
 * show a frozen canvas copy of the current frame instead of the live <img>.
 */
function syncAnimatedStillImg(c) {
  if (!viewer || !viewer.still) return;
  const { img, still } = viewer;
  const mode = animatedStillMode(c && c.media, play.on, viewer.mode === "export");
  if (mode !== "freeze") {
    if (!still.hidden) still.hidden = true;
    still._ggKey = "";
    if (mode === "animate" && img.dataset.src) img.hidden = false;
    return;
  }
  const key = img.dataset.src + "|" + play.gen;
  if (still._ggKey === key && !still.hidden) { img.hidden = true; return; }
  const draw = () => {
    if (!img.naturalWidth) return false;
    still.width = img.naturalWidth;
    still.height = img.naturalHeight;
    try { still.getContext("2d").drawImage(img, 0, 0); } catch (_) { return false; }
    still._ggKey = key;
    still.hidden = false;
    img.hidden = true;
    return true;
  };
  if (!(img.complete && draw())) {
    img.addEventListener("load", () => {
      if (play.on) return;
      const cur = trackClips()[play.idx];
      const url = cur?.media ? mediaUrl(cur.media.id) : "";
      if (!url || url !== img.dataset.src || !animImgFallbackUrls.has(url)) return;
      syncAnimatedStillImg(cur);
    }, { once: true });
  }
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
  const img = editPreviewMainImg(el);
  if (img) img.hidden = true;
  const vid = el.querySelector("video.gg-edit-preview-vid");
  if (vid) vid.hidden = true;
  el.dataset.previewReady = "1";
  if (frameIdx != null) el.dataset.ggFrame = previewFrameAttr(frameIdx);
  releaseEditPreviewFilmHold(el);
}

function preloadNext(i) {
  const c = clipForTimeline(trackClips()[i]);
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
  const c = clipForTimeline(trackClips()[play.idx]);
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
  cancelEditPreviewFilm();
  bumpPlaybackGen(play);
  play.tickGen = play.gen;
  play.on = true;
  play.last = performance.now();
  showFrame(true);
  play.raf = requestAnimationFrame(tick);
}

function stopPlay(opts) {
  bumpPlaybackGen(play);
  play.on = false;
  if (play.raf) cancelAnimationFrame(play.raf);
  play.raf = 0;
  pauseAllTimelineMedia(viewer, null);
  document.querySelectorAll(".gg-timeline").forEach((r) => pauseAllTimelineMedia(null, r));
  showFrame(true);
  paintHead();
  if (!opts?.keepSelection) selectCutUnderPlayhead();
}

/** Cut under the playhead becomes the selected cut. The playhead stays where playback stopped. */
function selectCutUnderPlayhead() {
  const cuts = trackClips();
  const { i } = itemAt(play.t);
  const cut = cuts[i];
  if (!cut || cut.kind === "reference") return;
  if (state.cutId === cut.id && state.cutSel.size === 0 && state.groupSel.size === 0) return;
  selectionHoldsPlayhead = true;
  try {
    selectCut(cut.id, { fromTimeline: true, keepPlayhead: true });
  } finally {
    selectionHoldsPlayhead = false;
  }
}

function togglePlay() { play.on ? stopPlay() : startPlay(); }

function seek(t, opts) {
  leaveExportView();
  const scrubbing = !!opts?.scrubbing;
  const stopped = play.on && !scrubbing;
  if (stopped) stopPlay({ keepSelection: true });
  play.t = Math.max(0, Math.min(totalSec(), t));
  play.last = performance.now();
  showFrame();
  if (stopped) selectCutUnderPlayhead();
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
        if (badge) {
          badge.textContent = `${c.sec.toFixed(1)}s`;
          badge.classList.toggle("gg-len-drift", !!formatCutListLength(c).drift);
        }
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

/** Ids that move together: the multi-selection when it contains the clip, otherwise that clip alone. */
function timelineGestureIds(anchorId) {
  const order = trackClips().map((c) => c.id);
  if (state.cutSel.size > 1 && state.cutSel.has(anchorId)) return order.filter((id) => state.cutSel.has(id));
  return anchorId ? [anchorId] : [];
}

function clearTimelineMultiSelection() {
  const had = state.cutSel.size > 0 || state.groupSel.size > 0;
  if (!had) return;
  state.cutSel.clear();
  cutSelAnchor = "";
  clearSceneGroupSelection();
  bus.dispatchEvent(new Event("select"));
}

/** Shift selects a range in track order. Ctrl/Cmd toggles. A plain click keeps single-cut select. */
function selectTimelineCut(cutId, ev) {
  if (ev && ev.shiftKey) {
    selectTimelineRange(cutId);
    return;
  }
  presentTimelineCut(cutId, () => {
    selectCut(cutId, { multi: !!(ev && (ev.ctrlKey || ev.metaKey)), fromTimeline: true });
  });
}

function selectTimelineRange(toId) {
  presentTimelineCut(toId, () => {
    clearSceneGroupSelection();
    const order = trackClips().map((c) => c.id);
    const anchor = cutSelAnchor || state.cutId || toId;
    const i = order.indexOf(anchor);
    const j = order.indexOf(toId);
    if (i < 0 || j < 0) {
      selectCut(toId, { fromTimeline: true });
      return;
    }
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    state.cutSel.clear();
    for (let k = lo; k <= hi; k++) state.cutSel.add(order[k]);
    state.cutId = toId;
    noteLastShot(toId);
    cutSelAnchor = anchor;
    bus.dispatchEvent(new Event("select"));
    const t = clipStartOf(toId);
    if (t != null && selectionMovesPlayhead()) {
      play.idx = -1;
      seek(t + 0.001);
    }
  });
}

/**
 * A timeline clip click selects that cut and slides the edit preview to its timeline take
 * (Best when set, otherwise the selected take). Playback is stopped first so the slide is not overwritten.
 */
function presentTimelineCut(cutId, selectFn) {
  if (play.on) stopPlay({ keepSelection: true });
  const cut = cutById(cutId);
  armTimelinePreviewTransition(cut);
  selectFn();
  if (timelineEditModeOn && cut) refreshEditPreviewStill(clipForTimeline(cut));
}

/** Later clip on the track advances the film downward. Same cut uses take-strip order. */
function timelinePreviewDir(fromCutId, toCutId, fromMediaId, toMediaId, cut) {
  const ids = trackClips().map((c) => c.id);
  const a = ids.indexOf(fromCutId);
  const b = ids.indexOf(toCutId);
  if (fromCutId && toCutId && fromCutId !== toCutId && a >= 0 && b >= 0 && a !== b) return b > a ? 1 : -1;
  const order = cut ? versionStripRows(cut, stripProbe.dur).map((r) => r.id) : [];
  const i0 = order.indexOf(fromMediaId);
  const i1 = order.indexOf(toMediaId);
  if (i0 >= 0 && i1 >= 0 && i0 !== i1) return i1 > i0 ? 1 : -1;
  return 1;
}

function armTimelinePreviewTransition(cut) {
  if (!timelineEditModeOn || editPreviewReducedMotion() || !cut) return;
  const el = document.querySelector(".gg-edit-preview");
  if (!el) return;
  const view = clipForTimeline(cut);
  const incomingId = view?.media?.id ? String(view.media.id) : "";
  const prevCut = el.dataset.previewCut || "";
  const prevMedia = el.dataset.previewMedia || "";
  const nextCut = view?.id != null ? String(view.id) : "";
  if (prevCut === nextCut && prevMedia === incomingId) return;
  if (editPreviewAnimating) cancelEditPreviewFilm();
  startEditPreviewFilm(view, timelinePreviewDir(prevCut, nextCut, prevMedia, incomingId, view), incomingId);
}

function setTimelineSelection(ids, { keepGroups = false } = {}) {
  const order = trackClips().map((c) => c.id);
  const have = new Set(ids || []);
  const picked = order.filter((id) => have.has(id));
  state.cutSel.clear();
  for (const id of picked) state.cutSel.add(id);
  if (picked.length) {
    state.cutId = picked[picked.length - 1];
    noteLastShot(state.cutId);
    cutSelAnchor = picked[0];
  } else {
    cutSelAnchor = "";
  }
  if (!keepGroups) clearSceneGroupSelection();
  bus.dispatchEvent(new Event("select"));
}

function markMovingClips(root, ids, on) {
  for (const id of ids || []) {
    root.querySelector(`.gg-clip[data-cut-id="${CSS.escape(id)}"]`)?.classList.toggle("gg-moving", !!on);
  }
}

/**
 * After a timeline placement. `before` is snapshotTimelineEdit taken before the change.
 * Several clips whose order changed also rewrite the Shots list (native Apply Order) and one undo step.
 */
function commitTimelinePlacement(before, label, { syncList = false } = {}) {
  const tl = state.timeline;
  if (!tl) return;
  const entry = syncList ? { ...before, list: snapshotOrderGroups(tl) } : before;
  recordTimelineUndo(entry, label);
  play.idx = -1;
  if (!syncList || !isNativeProject()) {
    scheduleSave();
    return;
  }
  const pid = tl.project.id;
  clearTimeout(ed.saveTimer);
  ed.savePending = true;
  enqueueReorderPersist(async () => {
    try {
      if (!ed.lastSaveOk || state.pid !== pid) return false;
      const data = await postJson("/gonggan/timeline/apply_order", { pid });
      editGate.bump();
      if (state.pid === pid) adoptMutationTimeline(data, pid);
      state.error = "";
      return true;
    } catch (e) {
      ggToast("Cut list", e.message || "Could not update the cut list", "warn");
      return false;
    } finally {
      bus.dispatchEvent(new Event("timeline"));
      bus.dispatchEvent(new Event("select"));
    }
  });
}

/** Pack out empty space. A multi-selection packs that span; otherwise the whole track from 0. */
function removeTimelineGaps() {
  const tl = state.timeline;
  if (!tl || ed.dragging) return;
  const clips = trackClips();
  if (!clips.length) return;
  const selected = state.cutSel.size ? clips.map((c) => c.id).filter((id) => state.cutSel.has(id)) : null;
  const res = closeGaps(clips, selected);
  if (!res.changed) return;
  const before = snapshotTimelineEdit(tl);
  for (const c of clips) if (res.starts[c.id] != null) c.start = res.starts[c.id];
  recomputeCutStarts();
  recordTimelineUndo(before, "Remove gaps");
  play.idx = -1;
  scheduleSave();
  bus.dispatchEvent(new Event("timeline"));
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
      let movingIds = [el.dataset.cutId];
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
        if (!active) {
          active = true;
          ed.dragging = true;
          movingIds = timelineGestureIds(el.dataset.cutId);
          markMovingClips(root, movingIds, true);
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
        }
        target = slot(ev.clientX);
        marker.hidden = false;
        marker.style.left = startOf(target) * ed.px + "px";
      };
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        marker.hidden = true;
        markMovingClips(root, movingIds, false);
        if (!active) { selectTimelineCut(el.dataset.cutId, ev); return; }
        ed.dragging = false;
        const ids = cuts.map((c) => c.id);
        const next = moveClipBlock(ids, movingIds, target);
        if (next.join() !== ids.join()) {
          const before = snapshotTimelineEdit(state.timeline);
          const byId = new Map(cuts.map((c) => [c.id, c]));
          cuts.splice(0, cuts.length, ...next.map((id) => byId.get(id)).filter(Boolean));
          cuts.forEach((c, i) => { c.pos = i; });
          recordTimelineUndo(before, movingIds.length > 1 ? "Move clips" : "Reorder clips");
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

/** Native timeline: drag a clip (or the whole selection) in time. Other gaps stay. Remove gaps is what packs the track. */
function bindMove(root) {
  const marker = root.querySelector(".gg-drop");
  root.querySelectorAll(".gg-clip").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      if (e.button || e.target.closest(".gg-edge")) return;
      if (clipPointerIsPlayheadScrub(root, e.clientX)) return;
      const startX = e.clientX, startY = e.clientY;
      const clips = trackClips();
      const anchorId = el.dataset.cutId;
      const idx = clips.findIndex((x) => x.id === anchorId);
      if (idx < 0) return;
      const c = clips[idx];
      const start0 = startOf(idx);
      let movingIds = [anchorId];
      let targets = edgeSnapTargets(clips, idx, play.t);
      let active = false, res = null;
      const move = (ev) => {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        if (!active) {
          active = true;
          ed.dragging = true;
          movingIds = timelineGestureIds(anchorId);
          targets = edgeSnapTargets(clips, idx, play.t, movingIds);
          markMovingClips(root, movingIds, true);
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
        }
        const snap = snapMoveStart(start0 + (ev.clientX - startX) / ed.px, c.sec, targets, TRIM_SNAP_PX / ed.px);
        res = placeSelection(clips, movingIds, anchorId, snap.start);
        for (const id of movingIds) {
          const node = root.querySelector(`.gg-clip[data-cut-id="${CSS.escape(id)}"]`);
          const old = clips.find((x) => x.id === id);
          if (!node || !old || res.starts[id] == null) continue;
          node.style.transform = `translateX(${(res.starts[id] - (Number(old.start) || 0)) * ed.px}px)`;
        }
        const snapped = snap.hit != null && Math.abs(res.start - snap.start) < 0.011;
        marker.classList.toggle("gg-snap-hit", snapped);
        marker.hidden = !snapped;
        if (snapped) marker.style.left = snap.hit * ed.px + "px";
      };
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        marker.hidden = true;
        marker.classList.remove("gg-snap-hit");
        markMovingClips(root, movingIds, false);
        for (const id of movingIds) {
          const node = root.querySelector(`.gg-clip[data-cut-id="${CSS.escape(id)}"]`);
          if (node) node.style.transform = "";
        }
        if (!active) { selectTimelineCut(anchorId, ev); return; }
        ed.dragging = false;
        const tl = state.timeline;
        const beforeOrder = clips.map((x) => x.id).join();
        if (res && tl && (res.start !== start0 || res.order.join() !== beforeOrder)) {
          const before = snapshotTimelineEdit(tl);
          tl.track_order = res.order;
          for (const x of clips) if (res.starts[x.id] != null) x.start = res.starts[x.id];
          recomputeCutStarts();
          const orderChanged = res.order.join() !== beforeOrder;
          commitTimelinePlacement(before, movingIds.length > 1 ? "Move clips" : "Move clip", {
            syncList: movingIds.length > 1 && orderChanged && isNativeProject(),
          });
        }
        bus.dispatchEvent(new Event("timeline"));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  });
}

/** Drag a dashed box on empty track space. Clips and scene bars that meet the box become selected. Ctrl/Shift adds. */
function bindTimelineMarquee(root) {
  const surfaces = [root.querySelector(".gg-track"), root.querySelector(".gg-tl-groups")].filter(Boolean);
  if (!surfaces.length || surfaces[0].dataset.marquee) return;
  const onDown = (e) => {
    if (e.button) return;
    if (e.target.closest(".gg-clip, .gg-edge, .gg-ruler, .gg-head-line, .gg-zoombar, .gg-tl-group, button, a, input, textarea")) return;
    if (ed.dragging || ed.scrubbing) return;
    const surface = e.currentTarget;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let active = false;
    const box = document.createElement("div");
    box.className = "gg-tl-marquee";
    const paint = (x, y) => {
      const l = Math.min(x0, x);
      const t = Math.min(y0, y);
      box.style.left = l + "px";
      box.style.top = t + "px";
      box.style.width = Math.abs(x - x0) + "px";
      box.style.height = Math.abs(y - y0) + "px";
    };
    const hits = (x, y) => {
      const l = Math.min(x0, x);
      const r = Math.max(x0, x);
      const t = Math.min(y0, y);
      const b = Math.max(y0, y);
      const overlap = (rect) => !(rect.right < l || rect.left > r || rect.bottom < t || rect.top > b);
      const ids = [];
      const groups = [];
      root.querySelectorAll(".gg-clip").forEach((el) => {
        if (!overlap(el.getBoundingClientRect())) return;
        if (el.dataset.cutId) ids.push(el.dataset.cutId);
      });
      root.querySelectorAll(".gg-tl-group").forEach((el) => {
        if (!overlap(el.getBoundingClientRect())) return;
        if (el.dataset.groupId) groups.push(el.dataset.groupId);
      });
      return { ids, groups };
    };
    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!active) {
        active = true;
        box.style.left = x0 + "px";
        box.style.top = y0 + "px";
        root.appendChild(box);
        try { surface.setPointerCapture(e.pointerId); } catch (_) {}
      }
      paint(ev.clientX, ev.clientY);
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      box.remove();
      if (!active) {
        clearTimelineMultiSelection();
        return;
      }
      const hit = hits(ev.clientX, ev.clientY);
      const add = !!(ev.ctrlKey || ev.metaKey || ev.shiftKey);
      const cutIds = add ? [...state.cutSel, ...hit.ids] : hit.ids;
      const groupIds = add ? [...state.groupSel, ...hit.groups] : hit.groups;
      setTimelineSelection(cutIds, { keepGroups: true });
      setSceneGroupSelection(groupIds, { keepCuts: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  for (const surface of surfaces) {
    surface.dataset.marquee = "1";
    surface.addEventListener("pointerdown", onDown);
  }
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
  layoutSceneGroupBars(root);
}

/** One bar per contiguous scene run, plus a chip for each empty scene so the marquee can hit it. */
function layoutSceneGroupBars(root) {
  const host = root.querySelector(".gg-tl-groups");
  if (!host) return;
  const clips = trackClips();
  const px = ed.px || 1;
  const bars = [];
  const seen = new Set();
  let i = 0;
  while (i < clips.length) {
    const id = clips[i].group_id;
    if (!id) { i += 1; continue; }
    const start = Number(clips[i].start) || 0;
    let end = start + (Number(clips[i].sec) || 0);
    const name = clips[i].group_name || "Scene";
    let j = i + 1;
    while (j < clips.length && clips[j].group_id === id) {
      const s = Number(clips[j].start) || 0;
      end = Math.max(end, s + (Number(clips[j].sec) || 0));
      j += 1;
    }
    seen.add(id);
    bars.push({ id, name, left: start * px, width: Math.max(12, (end - start) * px), hue: groupColor(id) });
    i = j;
  }
  let endSec = 0;
  for (const c of clips) endSec = Math.max(endSec, (Number(c.start) || 0) + (Number(c.sec) || 0));
  let left = clips.length ? (endSec + 0.35) * px : 4;
  for (const sec of shotsSections(state.timeline?.cuts || [], state.timeline?.groups || [])) {
    if (sec.type !== "group" || !sec.group?.id || seen.has(sec.group.id) || sec.cuts.length) continue;
    const id = sec.group.id;
    bars.push({ id, name: sec.group.name || "Scene", left, width: 72, hue: groupColor(id), empty: true });
    left += 76;
  }
  host.hidden = bars.length === 0;
  host.innerHTML = bars.map((b) => {
    const sel = state.groupSel.has(b.id) ? " gg-sel" : "";
    const empty = b.empty ? " gg-tl-group-empty" : "";
    return `<div class="gg-tl-group${empty}${sel}" data-group-id="${esc(b.id)}" style="left:${b.left}px;width:${b.width}px;--gg-grp:${b.hue}" title="${esc(b.name)}">${esc(b.name)}</div>`;
  }).join("");
  const inner = root.querySelector(".gg-tl-inner");
  if (inner && left > 4) {
    const w = Math.max(parseFloat(inner.style.width) || 0, Math.ceil(left + 8));
    inner.style.width = w + "px";
  }
}

function bindTimelineGroupSelect(root) {
  const host = root.querySelector(".gg-tl-groups");
  if (!host || host.dataset.bound) return;
  host.dataset.bound = "1";
  host.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".gg-tl-group");
    if (!el || e.button) return;
    e.preventDefault();
    e.stopPropagation();
    selectSceneGroup(el.dataset.groupId, { multi: !!(e.ctrlKey || e.metaKey), range: !!e.shiftKey });
  });
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
    el.innerHTML = `<div class="gg-edit-preview-stage"><img alt="" /><video class="gg-edit-preview-vid" playsinline muted preload="auto" hidden></video><canvas class="gg-edit-preview-still" hidden></canvas><div class="gg-edit-preview-empty" hidden></div></div><div class="gg-edit-preview-cap"></div><div class="gg-edit-preview-label"></div>`;
    el.tabIndex = 0;
    document.body.appendChild(el);
  }
  ensureEditPreviewFilm(el);
  const stage = el.querySelector(".gg-edit-preview-stage");
  if (stage && !stage.querySelector("video")) {
    const vid = document.createElement("video");
    vid.className = "gg-edit-preview-vid";
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "auto";
    vid.hidden = true;
    stage.querySelector("img")?.after(vid);
  }
  if (stage && !stage.querySelector(".gg-edit-preview-still")) {
    const canvas = document.createElement("canvas");
    canvas.className = "gg-edit-preview-still";
    canvas.hidden = true;
    (stage.querySelector("video") || stage.querySelector("img"))?.after(canvas);
  }
  if (stage && !stage.querySelector(".gg-edit-preview-empty")) {
    const empty = document.createElement("div");
    empty.className = "gg-edit-preview-empty";
    empty.hidden = true;
    stage.appendChild(empty);
  }
  if (!el.querySelector(".gg-edit-preview-cap")) {
    const cap = document.createElement("div");
    cap.className = "gg-edit-preview-cap";
    el.appendChild(cap);
  }
  if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
  watchEditPreviewBox(el);
  syncEditPreviewFilmMetrics(el);
  return el;
}

function removeEditPreviewEl() {
  cancelEditPreviewFilm();
  editPreviewWheelAcc = 0;
  const el = document.querySelector(".gg-edit-preview");
  el?._ggBoxRO?.disconnect();
  clearPreviewProxies();
  el?.remove();
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
  releaseEditPreviewFilmHold(el);
  syncEditPreviewFilmMetrics(el);
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
  const img = editPreviewMainImg(el);
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

/** Reference versions have no display slot. The strip pick is what the preview shows. */
function previewTakeView(c) {
  if (!c || c.kind !== "reference") return c;
  const vid = stripPick.pid === state.pid && stripPick.cutId === c.id ? stripPick.vid : "";
  if (!vid) return c;
  const v = (c.versions_list || []).find((x) => x && x.id === vid);
  if (!v) return c;
  return { ...c, media: versionMedia(v), display: vid };
}

/** Cut whose takes Up/Down and the preview chevrons step. Reference tab uses the selected reference. */
function takeBrowserSubject() {
  if (shotsUi.refTab && isNativeProject()) return selectedReference();
  return selectedShot() || currentEditPreviewCut();
}

function takeBrowserIndex(c) {
  const order = c ? versionStripRows(c, stripProbe.dur).map((r) => r.id) : [];
  if (!order.length) return { order, index: -1 };
  const cur = stripSelectedVersionId(c) || order[0];
  let index = order.indexOf(cur);
  if (index < 0) index = 0;
  return { order, index };
}

/** Select one take the same way a thumbnail click does, and show it in the edit preview. */
function showPreviewTake(c, vid) {
  if (!c || !vid) return;
  verSel.cutId = c.id;
  verSel.ids = new Set([vid]);
  verSel.anchor = vid;
  shotsUi.selTarget = "versions";
  Object.assign(stripPick, { pid: state.pid, cutId: c.id, vid });
  noteTakeKind(c, vid);
  if (play.on) stopPlay({ keepSelection: true });
  if (c.kind !== "reference") void setDisplayVersion(c.id, vid);
  bus.dispatchEvent(new Event("select"));
  requestAnimationFrame(() => {
    const esc = window.CSS && CSS.escape ? CSS.escape(vid) : vid;
    document.querySelector(`.gg-vstrip .gg-ver-wrap[data-vid="${esc}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

/** dir -1 is the newer take (left on the strip), +1 is the older take. */
const EDIT_PREVIEW_FILM_MS = 300;

function editPreviewReducedMotion() {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch (_) {
    return false;
  }
}

function editPreviewMainImg(el) {
  const stage = el?.querySelector(".gg-edit-preview-stage");
  if (stage) {
    for (const node of stage.children) {
      if (node.tagName === "IMG") return node;
    }
  }
  for (const node of el?.querySelectorAll?.("img") || []) {
    if (node.closest(".gg-edit-preview-peek") || node.closest(".gg-edit-preview-slide")) continue;
    return node;
  }
  return null;
}

/**
 * Frame, peek, and slide sizes for one preview box.
 * The current frame is a little smaller than the black gate.
 * Previous and next takes use that freed space as separate frames, with a gap,
 * and do not cover the current frame.
 */
function editPreviewFilmMetrics(width, height) {
  const H = Math.max(0, Math.round(Number(height) || 0));
  const W = Math.max(0, Math.round(Number(width) || 0));
  if (H < 64 || W < 64) return null;
  const gateX = Math.round(Math.min(22, Math.max(12, W * 0.016)));
  const gap = Math.round(Math.min(10, Math.max(6, H * 0.01)));
  let outer = Math.round(Math.min(14, Math.max(6, H * 0.012)));
  let peek = Math.round(Math.min(96, Math.max(32, H * 0.08)));
  let gateY = outer + peek + gap;
  let frameH = H - gateY * 2;
  const minFrame = Math.round(H * 0.64);
  if (frameH < minFrame) {
    frameH = minFrame;
    gateY = Math.floor((H - frameH) / 2);
    const room = gateY - gap;
    outer = Math.max(4, Math.min(outer, Math.floor(room * 0.22)));
    peek = room - outer;
  }
  if (frameH < 24 || peek < 12 || gateY <= peek + gap) return null;
  frameH = H - gateY * 2;
  return { gateX, gateY, peek, gap, outer, frameH, slide: frameH };
}

/** Write gate, peek, and slide lengths from the preview's current box. */
function syncEditPreviewFilmMetrics(el) {
  if (!el || !el.isConnected) return;
  const m = editPreviewFilmMetrics(el.clientWidth, el.clientHeight);
  if (!m) return;
  el.style.setProperty("--gg-gate-x", `${m.gateX}px`);
  el.style.setProperty("--gg-gate-y", `${m.gateY}px`);
  el.style.setProperty("--gg-peek", `${m.peek}px`);
  el.style.setProperty("--gg-film-gap", `${m.gap}px`);
  el.style.removeProperty("--gg-peek-overlap");
  const stage = el.querySelector(".gg-edit-preview-stage");
  const measured = Math.round(stage?.clientHeight || 0);
  const frameH = measured > 16 ? measured : m.frameH;
  const aspect = mediaFrameAspect(el);
  const key = `${el.clientWidth}x${el.clientHeight}:${m.gateX}:${m.gateY}:${m.peek}:${m.gap}:${frameH}:${aspect}`;
  const track = el.querySelector(".gg-edit-preview-slide-track");
  if (el.dataset.ggFilm === key) {
    if (track) layoutFilmTrack(track, frameH);
    return;
  }
  el.dataset.ggFilm = key;
  el.style.setProperty("--gg-frame-h", `${frameH}px`);
  el.dataset.ggSlide = String(frameH);
  const placePeek = (node, edge) => {
    if (!node) return;
    node.style.left = `${m.gateX}px`;
    node.style.right = `${m.gateX}px`;
    node.style.height = `${m.peek}px`;
    node.style.width = "";
    const inset = Math.max(0, m.gateY - m.peek - m.gap);
    if (edge === "top") node.style.top = `${inset}px`;
    else node.style.bottom = `${inset}px`;
    const img = node.querySelector("img");
    if (img) img.style.height = `${frameH}px`;
  };
  placePeek(el.querySelector(".gg-edit-preview-peek-prev"), "top");
  placePeek(el.querySelector(".gg-edit-preview-peek-next"), "bottom");
  if (track) layoutFilmTrack(track, frameH);
}

/** Natural aspect of the picture in the frame, so a different take recomputes the strip. */
function mediaFrameAspect(el) {
  const img = editPreviewMainImg(el);
  const vid = el.querySelector("video.gg-edit-preview-vid");
  const w = img && !img.hidden && img.naturalWidth ? img.naturalWidth : (vid && !vid.hidden ? vid.videoWidth : 0);
  const h = img && !img.hidden && img.naturalHeight ? img.naturalHeight : (vid && !vid.hidden ? vid.videoHeight : 0);
  if (!w || !h) return "0";
  return `${w}x${h}`;
}

function layoutFilmTrack(track, frameH) {
  if (!track || !(frameH > 0)) return;
  track.style.height = `${frameH * 2}px`;
  for (const frame of track.children) {
    frame.style.flexBasis = `${frameH}px`;
    frame.style.height = `${frameH}px`;
  }
  const down = track.dataset.down === "1";
  const atEnd = track.dataset.phase === "end";
  const y = down ? (atEnd ? -frameH : 0) : (atEnd ? 0 : -frameH);
  track.style.transform = `translateY(${y}px)`;
}

function watchEditPreviewBox(el) {
  if (!el || !window.ResizeObserver || el._ggBoxRO) return;
  el._ggBoxRO = new ResizeObserver(() => {
    syncEditPreviewFilmMetrics(el);
    syncPreviewProxies();
  });
  el._ggBoxRO.observe(el);
}

/** Still used for a sliding frame and for the blurred edge of a neighbor take. */
function filmStillUrl(c, id) {
  if (!c || !id) return "";
  const v = (c.versions_list || []).find((x) => x && String(x.id) === String(id));
  const media = versionMedia(v);
  if (!media?.id) return "";
  if (playsAsVideo(media) || isAnimatedImage(media)) return posterUrl(media.id);
  return mediaUrl(media.id);
}

function ensureEditPreviewFilm(el) {
  if (!el) return;
  let stage = el.querySelector(".gg-edit-preview-stage");
  if (!stage) {
    stage = document.createElement("div");
    stage.className = "gg-edit-preview-stage";
    el.insertBefore(stage, el.firstChild);
  }
  const video = el.querySelector("video.gg-edit-preview-vid");
  const canvas = el.querySelector("canvas.gg-edit-preview-still");
  const empty = el.querySelector(".gg-edit-preview-empty");
  const img = editPreviewMainImg(el);
  if (img && img.parentElement !== stage) stage.insertBefore(img, stage.firstChild);
  if (video && video.parentElement !== stage) img ? img.after(video) : stage.appendChild(video);
  if (canvas && canvas.parentElement !== stage) {
    if (video && video.parentElement === stage) video.after(canvas);
    else if (img && img.parentElement === stage) img.after(canvas);
    else stage.appendChild(canvas);
  }
  if (empty && empty.parentElement !== stage) stage.appendChild(empty);
  const peek = (cls) => {
    let node = el.querySelector("." + cls);
    if (!node) {
      node = document.createElement("div");
      node.className = `gg-edit-preview-peek ${cls}`;
      node.hidden = true;
      node.setAttribute("aria-hidden", "true");
      const pimg = document.createElement("img");
      pimg.alt = "";
      pimg.draggable = false;
      node.appendChild(pimg);
      el.appendChild(node);
    }
    return node;
  };
  peek("gg-edit-preview-peek-prev");
  peek("gg-edit-preview-peek-next");
}

function paintEditPreviewPeek(node, c, id) {
  if (!node) return;
  const img = node.querySelector("img");
  const url = filmStillUrl(c, id);
  if (!url) {
    node.hidden = true;
    if (img) {
      img.removeAttribute("src");
      delete img.dataset.src;
    }
    return;
  }
  node.hidden = false;
  if (img && img.dataset.src !== url) {
    img.dataset.src = url;
    img.src = url;
  }
}

/** Top band is the previous take, bottom band is the next. Empty when that neighbor does not exist. */
function syncEditPreviewPeeks() {
  const el = document.querySelector(".gg-edit-preview");
  if (!el || editPreviewAnimating) return;
  ensureEditPreviewFilm(el);
  const c = takeBrowserSubject();
  const { order, index } = takeBrowserIndex(c);
  const prevId = index > 0 ? order[index - 1] : "";
  const nextId = index >= 0 && index < order.length - 1 ? order[index + 1] : "";
  paintEditPreviewPeek(el.querySelector(".gg-edit-preview-peek-prev"), c, prevId);
  paintEditPreviewPeek(el.querySelector(".gg-edit-preview-peek-next"), c, nextId);
}

/** Star rides the outgoing take frame during a slide, then returns to the settled frame. */
function rideEditPreviewStar(el) {
  const frame = el?.querySelector(".gg-frame-out");
  const star = el?.querySelector(".gg-edit-preview-best");
  if (!frame || !star || star.parentElement === frame) return;
  frame.appendChild(star);
}

function parkEditPreviewStar(el) {
  const star = el?.querySelector(".gg-edit-preview-best");
  if (!star || !el || star.parentElement === el) return;
  el.appendChild(star);
}

function releaseEditPreviewChromeHold() {
  const held = editPreviewChromeHold;
  editPreviewChromeHold = null;
  if (held) syncEditPreviewTakeChrome(held);
}

/** Drop a running slide so playback can cut to the next take with no blur. */
function cancelEditPreviewFilm() {
  editPreviewFilmGen += 1;
  editPreviewAnimating = false;
  const el = document.querySelector(".gg-edit-preview");
  if (el) {
    parkEditPreviewStar(el);
    el.querySelectorAll(".gg-edit-preview-slide").forEach((node) => node.remove());
  }
  releaseEditPreviewChromeHold();
  el?.classList.remove("gg-film-move");
}

function releaseEditPreviewFilmHold(el) {
  if (!el || editPreviewAnimating) return;
  if (el.dataset.previewReady !== "1") return;
  el.querySelector(".gg-edit-preview-slide.gg-film-hold")?.remove();
}

function cloneFilmImg(url) {
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  if (url) img.src = url;
  return img;
}

function blankFilmFrame() {
  const d = document.createElement("div");
  d.className = "gg-film-blank";
  return d;
}

function cloneFilmSurface(source) {
  const w = source.videoWidth || source.width;
  const h = source.videoHeight || source.height;
  if (!w || !h) return null;
  const copy = document.createElement("canvas");
  copy.width = w;
  copy.height = h;
  try {
    copy.getContext("2d").drawImage(source, 0, 0, w, h);
  } catch (_) {
    return null;
  }
  return copy;
}

function captureEditPreviewFrame(el) {
  const hold = el.querySelector(".gg-film-hold .gg-film-in");
  if (hold && (hold.currentSrc || hold.getAttribute("src"))) return cloneFilmImg(hold.currentSrc || hold.src);
  const img = editPreviewMainImg(el);
  if (img && !img.hidden && img.naturalWidth > 0 && (img.currentSrc || img.getAttribute("src"))) {
    return cloneFilmImg(img.currentSrc || img.src);
  }
  const canvas = el.querySelector("canvas.gg-edit-preview-still");
  if (canvas && !canvas.hidden) {
    const copy = cloneFilmSurface(canvas);
    if (copy) return copy;
  }
  const vid = el.querySelector("video.gg-edit-preview-vid");
  if (vid && !vid.hidden && vid.readyState >= 2) {
    const copy = cloneFilmSurface(vid);
    if (copy) return copy;
  }
  const id = el.dataset.previewMedia || "";
  const mode = el.dataset.previewMode || "";
  const url = !id ? "" : (mode === "video" || mode === "frames" ? posterUrl(id) : (el.dataset.previewUrl || mediaUrl(id)));
  if (url) return cloneFilmImg(url);
  return blankFilmFrame();
}

function filmIncomingNode(c, id) {
  const url = filmStillUrl(c, id);
  if (!url) return blankFilmFrame();
  const img = cloneFilmImg(url);
  img.className = "gg-film-in";
  return img;
}

/**
 * Slide the current picture out and the neighbor in, like a frame of film advancing.
 * dir > 0 brings the next take up from below. The live preview keeps loading underneath.
 */
function startEditPreviewFilm(c, dir, incomingId) {
  const el = document.querySelector(".gg-edit-preview");
  if (!el) return;
  const gen = ++editPreviewFilmGen;
  ensureEditPreviewFilm(el);
  syncEditPreviewFilmMetrics(el);
  const frameH = Number(el.dataset.ggSlide) || el.querySelector(".gg-edit-preview-stage")?.clientHeight || 0;
  const down = dir > 0;
  const outgoingBest = el.classList.contains("gg-is-best");
  parkEditPreviewStar(el);
  const outgoing = captureEditPreviewFrame(el);
  el.querySelector(".gg-edit-preview-slide")?.remove();
  const slide = document.createElement("div");
  slide.className = "gg-edit-preview-slide";
  const track = document.createElement("div");
  track.className = "gg-edit-preview-slide-track";
  track.dataset.down = down ? "1" : "0";
  track.dataset.phase = "start";
  const outFrame = document.createElement("div");
  outFrame.className = "gg-edit-preview-slide-frame gg-frame-out";
  if (outgoingBest) outFrame.classList.add("gg-frame-best");
  outFrame.appendChild(outgoing);
  const inFrame = document.createElement("div");
  inFrame.className = "gg-edit-preview-slide-frame";
  inFrame.appendChild(filmIncomingNode(c, incomingId));
  if (down) track.append(outFrame, inFrame);
  else track.append(inFrame, outFrame);
  slide.appendChild(track);
  el.appendChild(slide);
  layoutFilmTrack(track, frameH);
  editPreviewAnimating = true;
  rideEditPreviewStar(el);
  el.classList.add("gg-film-move");
  void track.offsetWidth;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!track.isConnected) return;
      track.dataset.phase = "end";
      layoutFilmTrack(track, Number(el.dataset.ggSlide) || frameH);
    });
  });
  let done = false;
  const finish = () => {
    if (done || gen !== editPreviewFilmGen) return;
    done = true;
    parkEditPreviewStar(el);
    editPreviewAnimating = false;
    releaseEditPreviewChromeHold();
    el.classList.remove("gg-film-move");
    syncEditPreviewPeeks();
    if (!slide.isConnected) return;
    if (el.dataset.previewReady === "1") {
      slide.remove();
      return;
    }
    slide.classList.add("gg-film-hold");
    track.dataset.phase = "end";
    track.style.transition = "none";
    layoutFilmTrack(track, Number(el.dataset.ggSlide) || frameH);
    window.setTimeout(() => {
      if (slide.isConnected) slide.remove();
    }, 700);
  };
  track.addEventListener("transitionend", (ev) => {
    if (ev.target !== track || ev.propertyName !== "transform") return;
    finish();
  });
  window.setTimeout(finish, EDIT_PREVIEW_FILM_MS + 200);
}

function stepPreviewTake(dir) {
  if (editPreviewAnimating) return;
  const c = takeBrowserSubject();
  const { order, index } = takeBrowserIndex(c);
  if (!order.length || index < 0) return;
  const next = index + (dir < 0 ? -1 : 1);
  if (next < 0 || next >= order.length) return;
  const vid = order[next];
  if (!editPreviewReducedMotion()) startEditPreviewFilm(c, dir, vid);
  showPreviewTake(c, vid);
}

function editPreviewWheelPixels(e) {
  const dy = Number(e.deltaY) || 0;
  if (e.deltaMode === 1) return dy * 40;
  if (e.deltaMode === 2) return dy * 800;
  return dy;
}

function onEditPreviewWheel(e) {
  const raw = e.target && e.target.nodeType === 1 ? e.target : e.target?.parentElement;
  const preview = raw && raw.closest ? raw.closest(".gg-edit-preview") : null;
  if (!preview) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const now = performance.now();
  if (now - editPreviewWheelAt > 220) editPreviewWheelAcc = 0;
  editPreviewWheelAt = now;
  if (editPreviewAnimating) return;
  if (raw?.closest?.(".gg-preview-proxy")) return;
  if (Math.abs(e.deltaX || 0) > Math.abs(e.deltaY || 0)) return;
  const dy = editPreviewWheelPixels(e);
  if (!dy) return;
  editPreviewWheelAcc += dy;
  if (Math.abs(editPreviewWheelAcc) < 40) return;
  const step = editPreviewWheelAcc > 0 ? 1 : -1;
  editPreviewWheelAcc = 0;
  stepPreviewTake(step);
}

/** Right-side top controls hidden under the preview. Left mode tabs stay out of this set. */
function coveredPreviewTopControl(el, pr) {
  if (!el || !pr) return false;
  if (el.classList?.contains("gg-preview-proxy")) return false;
  if (el.closest?.(".gg-edit-preview, .gg-shots, .gg-bottom-strip, .gg-inputs-pane")) return false;
  const tag = el.tagName;
  if (tag !== "BUTTON" && tag !== "INPUT") return false;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return false;
  const ix = Math.max(0, Math.min(r.right, pr.right) - Math.max(r.left, pr.left));
  const iy = Math.max(0, Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top));
  if ((ix * iy) / (r.width * r.height) < 0.55) return false;
  const cy = r.top + r.height / 2;
  if (cy < pr.top - 2 || cy > pr.top + 78) return false;
  const cx = r.left + r.width / 2;
  return cx >= pr.left + pr.width * 0.45;
}

function previewProxyMarkup(native) {
  if (native.tagName === "INPUT") return native.value || "";
  return native.innerHTML
    .replace(/\sdata-v-[\w-]+(?:="[^"]*")?/g, "")
    .replace(/\sid="[^"]*"/g, "");
}

function mirrorPreviewProxy(proxy, native) {
  const r = native.getBoundingClientRect();
  proxy.style.left = `${r.left}px`;
  proxy.style.top = `${r.top}px`;
  proxy.style.width = `${r.width}px`;
  proxy.style.height = `${r.height}px`;
  const cls = `gg-preview-proxy ${String(native.className || "")}`.replace(/\s+/g, " ").trim();
  if (proxy.className !== cls) proxy.className = cls;
  proxy.disabled = !!native.disabled || native.getAttribute("aria-disabled") === "true";
  const label = native.getAttribute("aria-label") || native.getAttribute("title") || "";
  if (label) proxy.setAttribute("aria-label", label);
  else proxy.removeAttribute("aria-label");
  if (native.title) proxy.title = native.title;
  for (const name of ["aria-pressed", "aria-expanded", "aria-selected", "data-state"]) {
    const v = native.getAttribute(name);
    if (v == null) proxy.removeAttribute(name);
    else if (proxy.getAttribute(name) !== v) proxy.setAttribute(name, v);
  }
  const pressed = native.getAttribute("aria-pressed") === "true"
    || native.getAttribute("aria-expanded") === "true"
    || native.getAttribute("aria-selected") === "true"
    || native.getAttribute("data-state") === "open";
  proxy.classList.toggle("gg-proxy-on", pressed);
  if (proxy.tagName === "INPUT") {
    proxy.type = native.type || "text";
    if (document.activeElement !== proxy && proxy.value !== native.value) proxy.value = native.value;
    return;
  }
  const html = previewProxyMarkup(native);
  if (proxy.dataset.ggHtml !== html) {
    proxy.dataset.ggHtml = html;
    proxy.innerHTML = html;
  }
}

function watchPreviewProxyNative(native) {
  if (!native || editPreviewProxyWatched.has(native)) return;
  editPreviewProxyWatched.add(native);
  if (!editPreviewProxyRO && window.ResizeObserver) {
    editPreviewProxyRO = new ResizeObserver(() => syncPreviewProxies());
  }
  if (!editPreviewProxyMO && window.MutationObserver) {
    editPreviewProxyMO = new MutationObserver(() => syncPreviewProxies());
  }
  editPreviewProxyRO?.observe(native);
  editPreviewProxyMO?.observe(native, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: ["class", "disabled", "aria-pressed", "aria-expanded", "aria-selected", "aria-disabled", "data-state", "value"],
  });
}

function clearPreviewProxies() {
  document.querySelectorAll(".gg-preview-proxies").forEach((el) => el.remove());
  editPreviewProxyRO?.disconnect();
  editPreviewProxyMO?.disconnect();
  editPreviewProxyRO = null;
  editPreviewProxyMO = null;
  editPreviewProxyWatched = new WeakSet();
}

function makePreviewProxy(native) {
  const proxy = document.createElement(native.tagName === "INPUT" ? "input" : "button");
  if (proxy.tagName === "BUTTON") proxy.type = "button";
  proxy.className = "gg-preview-proxy";
  proxy._ggNative = native;
  if (proxy.tagName === "INPUT") {
    const forward = (type) => {
      native.value = proxy.value;
      native.dispatchEvent(new Event(type, { bubbles: true }));
    };
    proxy.addEventListener("input", () => forward("input"));
    proxy.addEventListener("change", () => forward("change"));
  } else {
    proxy.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!native.isConnected || native.disabled) return;
      native.click();
      requestAnimationFrame(() => syncPreviewProxies());
    });
  }
  return proxy;
}

/** Lightweight stand-ins for the native controls the overlay covers. One listener on the proxy only. */
function syncPreviewProxies() {
  if (editPreviewProxySyncing) return;
  const preview = document.querySelector(".gg-edit-preview");
  if (!preview || !preview.isConnected) {
    clearPreviewProxies();
    return;
  }
  editPreviewProxySyncing = true;
  try {
    const pr = preview.getBoundingClientRect();
    const natives = [];
    for (const el of document.querySelectorAll("button, input")) {
      if (coveredPreviewTopControl(el, pr)) natives.push(el);
    }
    let host = preview.querySelector(".gg-preview-proxies");
    if (!natives.length) {
      host?.remove();
      return;
    }
    if (!host) {
      host = document.createElement("div");
      host.className = "gg-preview-proxies";
      preview.appendChild(host);
    }
    const keep = new Set(natives);
    for (const proxy of [...host.querySelectorAll(".gg-preview-proxy")]) {
      if (!keep.has(proxy._ggNative) || !proxy._ggNative.isConnected) proxy.remove();
    }
    for (const native of natives) {
      let proxy = [...host.querySelectorAll(".gg-preview-proxy")].find((node) => node._ggNative === native);
      if (!proxy) {
        proxy = makePreviewProxy(native);
        host.appendChild(proxy);
      }
      watchPreviewProxyNative(native);
      mirrorPreviewProxy(proxy, native);
    }
  } finally {
    editPreviewProxySyncing = false;
  }
}

function togglePreviewBest() {
  const el = document.querySelector(".gg-edit-preview");
  const id = el?.dataset.previewCut || "";
  const vid = el?.dataset.previewMedia || "";
  if (!id || !vid) return;
  toggleBest(id, vid);
}

function ensureEditPreviewChrome(el) {
  if (!el.querySelector(".gg-edit-preview-best")) {
    const star = document.createElement("button");
    star.type = "button";
    star.className = "gg-edit-preview-best";
    star.textContent = "★";
    el.appendChild(star);
  }
  if (!el.querySelector(".gg-edit-preview-nav")) {
    const nav = document.createElement("div");
    nav.className = "gg-edit-preview-nav";
    nav.innerHTML = `<button type="button" class="gg-edit-preview-up" aria-label="Previous take" title="Previous take">▴</button><button type="button" class="gg-edit-preview-down" aria-label="Next take" title="Next take">▾</button>`;
    el.appendChild(nav);
  }
  if (!el._ggPreviewFocus) {
    el._ggPreviewFocus = true;
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, a, input, textarea, select")) return;
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    });
  }
  if (el._ggTakeNav) return;
  el._ggTakeNav = true;
  el.querySelector(".gg-edit-preview-up")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    stepPreviewTake(-1);
  });
  el.querySelector(".gg-edit-preview-down")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    stepPreviewTake(1);
  });
  el.querySelector(".gg-edit-preview-best")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePreviewBest();
  });
}

function syncEditPreviewTakeChrome(shown) {
  const el = document.querySelector(".gg-edit-preview");
  if (!el) return;
  ensureEditPreviewChrome(el);
  const { order, index } = takeBrowserIndex(takeBrowserSubject());
  const up = el.querySelector(".gg-edit-preview-up");
  const down = el.querySelector(".gg-edit-preview-down");
  if (up) up.disabled = !(order.length && index > 0);
  if (down) down.disabled = !(order.length && index >= 0 && index < order.length - 1);
  if (editPreviewAnimating) {
    editPreviewChromeHold = shown;
    rideEditPreviewStar(el);
    return;
  }
  editPreviewChromeHold = null;
  const vid = shown?.media?.id ? String(shown.media.id) : "";
  const on = !!(shown && vid && shown.pick === vid);
  el.classList.toggle("gg-is-best", on);
  const star = el.querySelector(".gg-edit-preview-best");
  if (star) {
    star.classList.toggle("gg-on", on);
    star.disabled = !vid;
    star.setAttribute("aria-pressed", on ? "true" : "false");
    star.title = !vid ? "No take" : (on ? "Best (click to clear)" : SET_BEST_LABEL);
    star.setAttribute("aria-label", star.title);
  }
  syncEditPreviewPeeks();
}

function takeNavZoneActive() {
  const zones = [document.querySelector(".gg-edit-preview"), document.querySelector(".gg-shots .gg-vs-body")]
    .filter((el) => el && el.isConnected && !el.hidden && !el.closest("[hidden]"));
  const ae = document.activeElement;
  return zones.some((el) => el.matches(":hover") || (ae && ae !== document.body && el.contains(ae)));
}

function isTypingKeyTarget(t) {
  if (!t || t === document.body || t === document.documentElement) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName || "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function refreshEditPreviewStill(cut) {
  if (!timelineEditModeOn) return;
  const el = document.querySelector(".gg-edit-preview");
  if (!el) return;
  syncEditPreviewFilmMetrics(el);
  const c = previewTakeView(cut === undefined ? currentEditPreviewCut() : cut);
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
  const img = editPreviewMainImg(el);
  const vid = el.querySelector("video.gg-edit-preview-vid");
  const label = el.querySelector(".gg-edit-preview-label");
  const empty = el.querySelector(".gg-edit-preview-empty");
  const labels = computeCutLabels(state.timeline || { cuts: [] });
  const name = c ? `${cutDisplayLabel(c, labels)} ${c.name || ""}`.trim() : "";
  if (label && label.textContent !== name) label.textContent = name;
  const aria = name ? `Edit preview, ${name}` : "Edit preview";
  if (el.getAttribute("aria-label") !== aria) el.setAttribute("aria-label", aria);
  syncEditPreviewTakeChrome(c);
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
    releaseEditPreviewFilmHold(el);
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
    releaseEditPreviewFilmHold(el);
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
    releaseEditPreviewFilmHold(el);
    syncEditPreviewFilmMetrics(el);
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
  watch(document.querySelector(".gg-bottom-strip"));
  watch(document.getElementById("comfyui-body-bottom"));
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

/** Above ComfyUI's canvas menu (z-1200) and minimap (z-1300). Below our dialogs. */
const EDIT_COVER_Z = 3600;

function clearEditTakesDock(body) {
  const el = body || document.querySelector(".gg-shots .gg-vs-body");
  if (!el) return;
  el.classList.remove("gg-vs-dock");
  el.style.position = "";
  el.style.left = "";
  el.style.width = "";
  el.style.top = "";
  el.style.height = "";
  el.style.zIndex = "";
  el.style.boxSizing = "";
}

/**
 * Takes and the reference row stay in the left sidebar in every mode, including Edit.
 * Clears a dock left over from an older layout.
 * @returns {null}
 */
function placeEditTakesStrip() {
  clearEditTakesDock(document.querySelector(".gg-root.gg-shots .gg-vstrip .gg-vs-body"));
  return null;
}

/** Preview stops at the docked take row when that row is on screen. */
function editOverlayBottom(graph) {
  const caps = [];
  const base = overlayBottomLimit(graph);
  if (base != null) caps.push(base);
  const dock = document.querySelector(".gg-vs-body.gg-vs-dock");
  if (dock) {
    const top = dock.getBoundingClientRect().top;
    // The overlay rect insets by EDIT_PREVIEW_GAP_PX, so add it back and the preview meets the row.
    if (Number.isFinite(top) && top > 0) caps.push(top + EDIT_PREVIEW_GAP_PX);
  }
  if (!caps.length) return null;
  return Math.min(...caps);
}

/**
 * Fixed overlay for the graph column only: from the top of that column down to the
 * take row or the timeline. Side panels stay in their own columns, so this does not
 * resize them or cover the right tab bar.
 */
let placingEditPreview = false;

/**
 * Graph column box, extended up through same-width parents so the cover starts
 * at the top line of that column (the toolbar row), not under it.
 */
function editPreviewColumnRect() {
  const column = graphColumnElement();
  const box = column ? editPreviewBox(column) : null;
  if (!box) return null;
  let top = box.top;
  let node = column.parentElement;
  for (let i = 0; node && i < 8; i += 1, node = node.parentElement) {
    if (node === document.body || node === document.documentElement) break;
    const r = node.getBoundingClientRect();
    if (r.width < 64 || r.height < 64) continue;
    const sameSpan = Math.abs(r.left - box.left) < 28 && Math.abs(r.right - box.right) < 28;
    if (!sameSpan) break;
    if (r.top < top) top = r.top;
  }
  const wfTab = document.querySelector('[data-testid="workflow-tab"]');
  const bar = wfTab?.closest("header") || wfTab?.parentElement;
  if (bar) {
    const r = bar.getBoundingClientRect();
    const overlaps = r.right > box.left + 24 && r.left < box.right - 24;
    const justAbove = r.bottom >= top - 12 && r.top < top && r.height > 8 && r.height < 120;
    if (overlaps && justAbove) top = Math.min(top, r.top);
  }
  for (const el of document.querySelectorAll("button")) {
    const text = (el.textContent || "").trim();
    const aria = (el.getAttribute("aria-label") || el.title || "").trim();
    const isRun = /^run$/i.test(text) || /^run$/i.test(aria);
    if (!isRun && !/toggle properties panel|workflow overview/i.test(aria)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.height > 80) continue;
    if (r.left < box.left - 4 || r.right > box.right + 8) continue;
    if (r.top > top + 4 || r.bottom < top - 80) continue;
    const row = el.parentElement?.getBoundingClientRect();
    const rowTop = row && row.height > 8 && row.height < 120 ? row.top : r.top;
    if (rowTop < top) top = rowTop;
  }
  return { left: box.left, top, right: box.right, bottom: box.bottom, width: box.width, height: box.bottom - top };
}

function editPreviewCoverRect(dockTop) {
  const host = editPreviewColumnRect();
  const bottomOf = (graph) => {
    const caps = [];
    const base = overlayBottomLimit(graph);
    if (base != null) caps.push(base);
    if (Number.isFinite(dockTop) && dockTop > 0) caps.push(dockTop + EDIT_PREVIEW_GAP_PX);
    else {
      const docked = editOverlayBottom(graph);
      if (docked != null) caps.push(docked);
    }
    if (!caps.length) return null;
    return Math.min(...caps);
  };
  if (host) {
    return editPreviewOverlayRect({
      graphRect: host,
      bottomPanelTop: bottomOf(host),
    });
  }
  const graph = editPreviewBox(graphWorkAreaElement());
  if (!graph) return null;
  const toolbarBottom = measureEditPreviewToolbarBottom(graph);
  const sides = measureEditPreviewSides(graph);
  return editPreviewOverlayRect({
    graphRect: graph,
    toolbarBottom,
    shotsRect: sides.left != null ? { right: sides.left, width: 100 } : null,
    rightPanelLeft: sides.right,
    rightDockerLeft: measureRightDockerLeft(graph, toolbarBottom ?? graph.top),
    bottomPanelTop: editOverlayBottom(graph),
  });
}

function applyEditPreviewLayout() {
  document.documentElement.classList.toggle(EDIT_MODE_ON_CLASS, !!timelineEditModeOn);
  placingEditPreview = true;
  const dockTop = placeEditTakesStrip();
  placingEditPreview = false;
  ensureInputsTab();
  if (!timelineEditModeOn || !isTimelinePanelOpen()) {
    removeEditPreviewEl();
    return;
  }
  const rect = editPreviewCoverRect(dockTop);
  if (!rect) {
    removeEditPreviewEl();
    return;
  }
  const el = ensureEditPreviewEl();
  if (!el) return;
  const top = Math.round(rect.top);
  const bottom = Math.round(rect.bottom);
  el.style.left = `${Math.round(rect.left)}px`;
  el.style.top = `${top}px`;
  el.style.width = `${Math.round(rect.width)}px`;
  el.style.height = `${Math.max(32, bottom - top)}px`;
  syncEditPreviewFilmMetrics(el);
  paintViewerCaption();
  refreshEditPreviewStill();
  syncPreviewProxies();
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
    removeEditPreviewEl();
    placeEditTakesStrip();
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
        <button type="button" class="gg-btn gg-close-gaps" title="Remove empty space so cuts sit back to back from the start. Selected cuts, or the whole timeline if none are selected.">Remove gaps</button>
        <button class="gg-btn gg-reset" title="Reset to original order and lengths">Reset</button>
      </div>
      <div class="gg-error" hidden></div>
      <div class="gg-tl-scroll">
        <div class="gg-tl-inner">
          <div class="gg-ruler" title="Click to seek"></div>
          <div class="gg-tl-groups" hidden></div>
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
  const onTimelineKey = (e) => {
    if (e.isComposing) return;
    if (ggModalOpen() || comfyPromptDialogOpen() || ctxUi.el) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""))) return;
    if (!pluginKeyScopeActive({ hoverTimeline: ggElHovered(root), focusTimeline: ggElHasFocus(root) })) return;
    if (e.key === "Escape") {
      if (!state.cutSel.size && !state.groupSel.size) return;
      e.preventDefault();
      e.stopPropagation();
      clearTimelineMultiSelection();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const shots = document.querySelector(".gg-root.gg-shots");
      if (shots && pluginKeyScopeActive({ hoverShots: ggElHovered(shots), focusShots: ggElHasFocus(shots) })) return;
      if (!selectedSceneGroupIds().length) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmDeleteSelectedCuts();
    }
  };
  document.addEventListener("keydown", onTimelineKey);
  const zoomRo = window.ResizeObserver ? new ResizeObserver(() => paintZoomBar(root)) : null;
  if (zoomRo) { zoomRo.observe(tlWrap); zoomRo.observe(zoomBar); }
  $r(".gg-reset").addEventListener("click", resetEdit);
  $r(".gg-close-gaps")?.addEventListener("click", () => removeTimelineGaps());
  scheduleRestoreTimelinePanelHeight();
  const beginTimelineScrub = (e) => {
    if (e.button) return;
    e.preventDefault();
    e.stopPropagation();
    const ruler = $r(".gg-ruler");
    if (!ruler) return;
    const wasPlaying = play.on;
    ed.scrubbing = true;
    ed.scrubResumePlay = false;
    if (play.on) {
      cancelEditPreviewFilm();
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
    let ended = false;
    const end = (ev) => {
      if (ended) return;
      ended = true;
      ed.scrubbing = false;
      if (edgeRaf) cancelAnimationFrame(edgeRaf);
      edgeRaf = 0;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("pointercancel", end);
      try { overlay.releasePointerCapture(ev.pointerId); } catch (_) {}
      overlay.remove();
      ed.scrubResumePlay = false;
      go(ev.clientX || e.clientX);
      paintPlayTransport();
      showFrame(true);
      if (wasPlaying) selectCutUnderPlayhead();
    };
    try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("mouseup", end);
    window.addEventListener("pointercancel", end);
  };
  bindTimelineMarquee(root);
  bindTimelineGroupSelect(root);
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
      const view = clipForTimeline(c);
      const run = isSceneRunStart(c, i > 0 ? cuts[i - 1] : null);
      const hue = c.group_id ? groupColor(c.group_id) : 0;
      const showBand = showTimelineSceneBand(c);
      const tip = `${c.group_name ? `${c.group_name}\n` : ""}${cutDisplayLabel(c, cutLabels)}. ${c.name}  ${c.sec.toFixed(1)}s${view.src_dur ? ` (src ${view.src_dur}s)` : ""}${(() => {
        const cap = effectiveCaption(c).trim();
        return cap ? `\n${cap}` : "";
      })()}`;
      return `
      <div class="gg-clip${view.media ? "" : " gg-clip-empty"}${timelineClipTypeClassSuffix(view)}${c.pos !== c.index ? " gg-moved" : ""}${c.group_id ? " gg-in-scene" : ""}${run ? " gg-scene-start" : ""}"
           data-cut-id="${esc(c.id)}" style="width:${c.sec * ed.px}px;${c.group_id ? `--gg-grp:${hue}` : ""}"
           title="${esc(tip)}">
        ${showBand ? `<div class="gg-scene-band">${esc(c.group_name)}</div>` : ""}
        ${thumbHtml(view.media, "gg-clip-thumb")}
        ${timelineClipTypeBadgeHtml(view, esc)}
        <span class="gg-clip-dot gg-dot-empty"></span>
        <div class="gg-clip-label"><span class="gg-no">${esc(cutDisplayLabel(c, cutLabels))}</span>${esc(displayCutName(c))}</div>
        <div class="gg-clip-in">${kindOf(view) === "video" && c.in > 0 ? `in ${c.in.toFixed(1)}` : ""}</div>
        <div class="gg-clip-dur${formatCutListLength(c).drift ? " gg-len-drift" : ""}">${c.sec.toFixed(1)}s</div>
        <span class="gg-render-badge gg-clip-rs" hidden><span class="gg-rs-dot"></span><span class="gg-rs-text"></span></span>
        <div class="gg-clip-prog" hidden><div class="gg-prog-bar"><div class="gg-prog-fill"></div></div></div>
        <div class="gg-edge gg-edge-l${i > 0 ? " gg-edge-split" : ""}" data-side="l" title="Trim in"></div>
        <div class="gg-edge gg-edge-r${i < cuts.length - 1 ? " gg-edge-split" : ""}" data-side="r" title="Trim out"></div>
      </div>`;
    }).join("");
    bindThumbFallbacks($r(".gg-track"));
    bindHoverPlay($r(".gg-track"));
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
    if (!selectionMovesPlayhead()) return;
    if (state.cutId) {
      const t = clipStartOf(state.cutId);
      if (t != null) {
        play.idx = -1;
        play.t = t + 0.001;
        showFrame(true);
      }
    }
    refreshEditPreviewStill(state.cutId ? cutById(state.cutId) || null : null);
  };
  const onProjects = () => { stopPlay({ keepSelection: true }); play.t = 0; paintTimelineNativeLocks(); };
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
    stopPlay({ keepSelection: true });
    removeEditPreviewEl();
    unbindEditPreviewObserver();
    if (ro) ro.disconnect();
    if (zoomRo) zoomRo.disconnect();
    window.removeEventListener("keydown", onZoomKey, true);
    document.removeEventListener("keydown", onTimelineKey);
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

// Up/Down already move the cut list. Over the preview or the takes strip they step that row's takes instead.
window.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
  if (isTypingKeyTarget(e.target) || isTypingKeyTarget(document.activeElement)) return;
  if (ggModalOpen() || comfyPromptDialogOpen() || ctxUi.el) return;
  if (!takeNavZoneActive()) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  stepPreviewTake(e.key === "ArrowUp" ? -1 : 1);
}, true);

window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
  if (isTypingKeyTarget(e.target) || isTypingKeyTarget(document.activeElement)) return;
  if (ggModalOpen() || comfyPromptDialogOpen() || ctxUi.el) return;
  const preview = document.querySelector(".gg-edit-preview");
  if (!preview || !preview.isConnected) return;
  const ae = document.activeElement;
  const hovered = preview.matches(":hover");
  const focused = !!(ae && ae !== document.body && preview.contains(ae));
  if (!hovered && !focused) return;
  if (ae && ae.closest && ae.closest("button, a")) return;
  e.preventDefault();
  e.stopPropagation();
  togglePreviewBest();
}, true);

window.addEventListener("wheel", onEditPreviewWheel, { capture: true, passive: false });

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

/** Box the pointer has to be over for a thumb to play. Edit preview is not a thumb. */
function hoverPlayZone(el) {
  if (!el || el.closest?.(".gg-edit-preview")) return null;
  return el.closest(".gg-clip, .gg-cut-thumb, .gg-ver, .gg-ref-ver, .gg-refthumb, .gg-final-thumb") || el.parentElement;
}

function bindHoverPlay(root) {
  if (!root || root.closest?.(".gg-edit-preview")) return;
  root.querySelectorAll("video.gg-thumb-vid").forEach((v) => {
    if (v._ggHoverBound || v.closest(".gg-edit-preview")) return;
    const host = hoverPlayZone(v);
    if (!host) return;
    v._ggHoverBound = true;
    bindTimelineVideoThumb(v, host);
  });
  bindAnimThumbHover(root);
}

/** Off exact 0. Chromium's video layer is an empty green frame at currentTime 0. */
function firstFrameTime(video) {
  const d = Number(video.duration);
  if (!Number.isFinite(d) || d <= 0) return 0.001;
  const t = Math.min(0.001, d * 0.5);
  return t > 0 ? t : 0.001;
}

function revealThumbCanvas(canvas) {
  if (canvas && canvas.width > 0 && canvas.height > 0) canvas.hidden = false;
}

/**
 * mp4/webm/mov thumb (timeline cut, takes strip, cut card, reference).
 * The <video> stays opacity 0 until a decoded frame is on the canvas, then
 * that still covers the thumb while idle. Playback is hover-only and
 * returns to the same first frame on leave. Edit preview does not use this.
 */
function bindTimelineVideoThumb(v, host) {
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.loop = true;
  v.classList.add("gg-vid-hold");
  let canvas = host.querySelector(":scope > canvas.gg-vid-still");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "gg-vid-still";
    canvas.hidden = true;
    v.before(canvas);
  }
  const paint = () => {
    if (v._ggHoverOn || v.readyState < 2 || !(v.currentTime > 0)) return false;
    if (!drawThumbStill(canvas, v)) return false;
    canvas.hidden = false;
    v.classList.add("gg-vid-hold");
    return true;
  };
  const park = () => {
    const token = (v._ggPark = (v._ggPark || 0) + 1);
    const finish = () => {
      if (v._ggPark !== token || v._ggHoverOn) return;
      paint();
    };
    const seek = () => {
      if (v._ggPark !== token || v._ggHoverOn) return;
      const t = firstFrameTime(v);
      if (v.readyState >= 2 && Math.abs(v.currentTime - t) < 0.0004) {
        finish();
        return;
      }
      const onSeeked = () => {
        if (v._ggPark !== token || v._ggHoverOn) return;
        finish();
      };
      v.addEventListener("seeked", onSeeked, { once: true });
      try {
        v.currentTime = t;
      } catch (_) {
        v.removeEventListener("seeked", onSeeked);
        finish();
      }
    };
    if (v.readyState >= 2) seek();
    else v.addEventListener("loadeddata", seek, { once: true });
  };
  host.addEventListener("mouseenter", () => {
    if (!v.isConnected) return;
    v._ggHoverOn = true;
    v._ggPark = (v._ggPark || 0) + 1;
    v.preload = "auto";
    v.loop = true;
    const showVideo = () => {
      if (!v._ggHoverOn || !v.isConnected) return;
      canvas.hidden = true;
      v.classList.remove("gg-vid-hold");
    };
    v.addEventListener("playing", showVideo, { once: true });
    v.play().then(() => {
      if (v._ggHoverOn && v.readyState >= 2) showVideo();
    }).catch(() => {});
  });
  host.addEventListener("mouseleave", () => {
    v._ggHoverOn = false;
    try { v.pause(); } catch (_) {}
    v.classList.add("gg-vid-hold");
    revealThumbCanvas(canvas);
    park();
  });
  if (host.matches(":hover")) {
    v._ggHoverOn = true;
    v.addEventListener("playing", () => {
      if (!v._ggHoverOn) return;
      canvas.hidden = true;
      v.classList.remove("gg-vid-hold");
    }, { once: true });
    v.play().then(() => {
      if (v._ggHoverOn && v.readyState >= 2) {
        canvas.hidden = true;
        v.classList.remove("gg-vid-hold");
      }
    }).catch(() => {});
  } else {
    try { v.pause(); } catch (_) {}
    park();
  }
}

/** First-frame stills for timeline animated WebP/GIF thumbs. Keyed by media id. */
const animThumbStillCache = new Map();

function animThumbStill(id) {
  const key = String(id || "");
  if (!key) return Promise.resolve(null);
  let job = animThumbStillCache.get(key);
  if (!job) {
    job = loadAnimThumbStill(key).then((bmp) => {
      if (!bmp) animThumbStillCache.delete(key);
      return bmp;
    });
    animThumbStillCache.set(key, job);
  }
  return job;
}

function sniffThumbMime(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length >= 3 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return "image/gif";
  if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50) return "image/png";
  return "image/webp";
}

/** Frame 0 of the whole file. Sliced ANMF bytes often decode as an empty green picture. */
async function firstStillBitmap(buf) {
  const type = sniffThumbMime(buf);
  if (typeof ImageDecoder === "function") {
    let dec = null;
    try {
      dec = new ImageDecoder({ data: buf, type });
      const result = await dec.decode({ frameIndex: 0 });
      try {
        return await createImageBitmap(result.image);
      } finally {
        result.image.close?.();
      }
    } catch (_) {
    } finally {
      try { dec?.close(); } catch (_) {}
    }
  }
  return bitmapFromBlob(new Blob([buf], { type }));
}

async function loadAnimThumbStill(id) {
  try {
    const res = await api.fetchApi("/gonggan/media?id=" + encodeURIComponent(id));
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const bmp = await firstStillBitmap(buf);
      if (bmp) return bmp;
    }
  } catch (_) {}
  return loadPosterImage(id);
}

async function bitmapFromBlob(blob) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(blob); } catch (_) {}
  }
  const im = await imageFromBlob(blob);
  if (!im) return null;
  const snap = document.createElement("canvas");
  if (!drawThumbStill(snap, im)) return null;
  im.removeAttribute("src");
  return snap;
}

function imageFromBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    im.src = url;
  });
}

function loadPosterImage(id) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = posterUrl(id);
  });
}

function drawThumbStill(canvas, src) {
  const w = src.videoWidth || src.naturalWidth || src.displayWidth || src.width;
  const h = src.videoHeight || src.naturalHeight || src.displayHeight || src.height;
  if (!w || !h) return false;
  if (typeof HTMLVideoElement === "function" && src instanceof HTMLVideoElement && !(src.videoWidth > 0 && src.videoHeight > 0)) return false;
  canvas.width = w;
  canvas.height = h;
  try {
    canvas.getContext("2d").drawImage(src, 0, 0);
  } catch (_) {
    return false;
  }
  return true;
}

async function paintCachedAnimStill(canvas, id) {
  if (!canvas) return;
  const still = await animThumbStill(id);
  if (!canvas.isConnected || !still) return;
  const host = canvas.closest(".gg-anim-thumb") || canvas.parentElement;
  if (!drawThumbStill(canvas, still)) return;
  if (host && host._ggHoverOn) return;
  canvas.hidden = false;
}

/**
 * Animated WebP/GIF thumbs show a cached first frame and play only while hovered.
 * Timeline cuts, the takes strip, cut cards, and reference thumbs share this.
 * A loose <img> on the track is frozen the same way. Viewer play/scrub uses
 * .gg-v-img, which is outside the track. Edit preview is left alone.
 */
function timelineTracks(root) {
  if (!root || !root.querySelectorAll) return [];
  if (root.classList && root.classList.contains("gg-track")) return [root];
  return [...root.querySelectorAll(".gg-track")];
}

function bindOneAnimThumb(host) {
  if (!host || host._ggAnimBound || host.closest(".gg-edit-preview")) return;
  const zone = hoverPlayZone(host);
  if (!zone) return;
  host._ggAnimBound = true;
  const id = host.dataset.ggAnimId;
  const canvas = host.querySelector(".gg-anim-still");
  const img = host.querySelector(".gg-anim-live");
  const showStill = () => {
    host._ggHoverOn = false;
    if (img) {
      img.hidden = true;
      img.removeAttribute("src");
    }
    revealThumbCanvas(canvas);
  };
  const showAnim = () => {
    if (!img || !host.isConnected) return;
    host._ggHoverOn = true;
    const url = mediaUrl(id);
    img.removeAttribute("src");
    img.src = url;
    if (img.complete && img.naturalWidth) {
      img.hidden = false;
      if (canvas) canvas.hidden = true;
    }
  };
  img?.addEventListener("load", () => {
    if (!host._ggHoverOn) return;
    img.hidden = false;
    if (canvas) canvas.hidden = true;
  });
  void paintCachedAnimStill(canvas, id);
  zone.addEventListener("mouseenter", showAnim);
  zone.addEventListener("mouseleave", showStill);
  if (zone.matches(":hover")) showAnim();
}

function bindAnimThumbHover(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll(".gg-anim-thumb[data-gg-anim-id]").forEach(bindOneAnimThumb);
  for (const track of timelineTracks(root)) {
    track.querySelectorAll("img.gg-thumb-img").forEach((img) => {
      if (img.closest(".gg-anim-thumb") || img._ggAnimBound) return;
      const clip = img.closest(".gg-clip");
      if (!clip) return;
      freezeLooseTrackImage(img, clip);
    });
  }
}

/** Media id from a /gonggan/media URL, if that is what the thumb was pointing at. */
function mediaIdFromThumbUrl(src) {
  try {
    return new URL(src, window.location.href).searchParams.get("id") || "";
  } catch (_) {
    const m = /[?&]id=([^&]+)/.exec(String(src || ""));
    return m ? decodeURIComponent(m[1]) : "";
  }
}

/** An <img> on the track that is not already a hover-still pair. Stop it, then keep a first frame. */
function freezeLooseTrackImage(img, clip) {
  img._ggAnimBound = true;
  const src = img.getAttribute("src") || "";
  if (!src || src.indexOf("/gonggan/poster") !== -1) return;
  img.removeAttribute("src");
  img.hidden = true;
  const canvas = document.createElement("canvas");
  canvas.className = "gg-anim-still";
  img.classList.add("gg-anim-live");
  img.before(canvas);
  const host = img.parentElement;
  const id = mediaIdFromThumbUrl(src);
  if (id) void paintCachedAnimStill(canvas, id);
  else {
    const probe = new Image();
    probe.onload = () => {
      if (!canvas.isConnected || (host && host._ggHoverOn)) return;
      if (!drawThumbStill(canvas, probe)) return;
      probe.removeAttribute("src");
      canvas.hidden = false;
    };
    probe.src = src;
  }
  clip.addEventListener("mouseenter", () => {
    if (!img.isConnected) return;
    if (host) host._ggHoverOn = true;
    canvas.hidden = true;
    img.hidden = false;
    img.src = src;
  });
  clip.addEventListener("mouseleave", () => {
    if (host) host._ggHoverOn = false;
    img.hidden = true;
    img.removeAttribute("src");
    revealThumbCanvas(canvas);
  });
}

app.registerExtension({
  name: EXT,
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
        if (loadTimelineOpen(localStorage) && isOwnStripShown()) scheduleRestoreTimelinePanelHeight();
      });
    }
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
    installImportDrop();
    void fetchUserWorkflowPaths();
    const refreshAppUi = () => {
      if (document.hidden) return;
      try {
        paintAppControls();
      } catch (_) {}
    };
    for (const ev of ["select", "gg-opentab", "timeline"]) bus.addEventListener(ev, refreshAppUi);
    window.addEventListener("resize", refreshAppUi);
    setInterval(refreshAppUi, 800);
    if (!app._ggVideoStartWrapped) {
      app._ggVideoStartWrapped = true;
      const origQueue = app.queuePrompt.bind(app);
      app.queuePrompt = async function ggVideoStartQueue(...args) {
        let ok = true;
        try {
          ok = await injectCutDataForQueue();
        } catch (e) {
          console.warn("[gonggan] queue inject failed; queuing as before", e);
          ggQueuedStartFile = "";
          ggQueuedStartNode = "";
        }
        if (!ok) {
          ggApplyingCutData = false;
          ggQueuedStartFile = "";
          ggQueuedStartNode = "";
          return {};
        }
        const prevGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = async function ggQueueGraphToPrompt(...gargs) {
          applyLinearPromptsForOpenCut();
          if (ggQueuedStartFile) {
            const binding = findVideoImageTarget(captureGraphWorkflowSnapshot()) || { nodeId: ggQueuedStartNode, widget: "image" };
            applyLiveVideoImage(binding, ggQueuedStartFile);
          }
          const result = await prevGraphToPrompt.apply(app, gargs);
          if (ggQueuedStartFile) patchQueuedStartImage(result, ggQueuedStartFile, ggQueuedStartNode);
          patchQueuedReferenceText(result, ggQueuedPromptPack);
          patchQueuedReferenceImages(result, ggQueuedRefFiles, ggQueuedStartNode);
          if (Array.isArray(ggQueuedQwenImages)) applyQwenRefImages(result?.output, ggQueuedQwenImages);
          return result;
        };
        try {
          return await origQueue(...args);
        } finally {
          app.graphToPrompt = prevGraphToPrompt;
          ggQueuedStartFile = "";
          ggQueuedStartNode = "";
          ggQueuedRefFiles = [];
          ggQueuedQwenImages = null;
          ggQueuedPromptPack = null;
          restoreSeedControls(ggPendingQueueSnap?.controls);
          if (ggPendingQueueSnap) ggPendingQueueSnap.controls = null;
          ggApplyingCutData = false;
          const cutId = app.graph?.extra?.gonggan?.cutId;
          if (cutId) await saveCutWorkflowNow(cutId);
        }
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
            if (ggPendingQueueSnap) rememberRunSnapshot(res.prompt_id, ggPendingQueueSnap);
            const target = queueCutTarget(args[1]?.workflow?.extra?.gonggan ?? app.graph?.extra?.gonggan);
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
