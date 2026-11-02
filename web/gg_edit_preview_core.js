/** Edit toggle: preview over the graph (pure, no DOM). */

import { isAnimatedImage, playsAsVideo } from "./gg_missing_media_core.js";
import { sourceTimeAtClip, videoPreviewFrameIndex } from "./gg_timeline_scrub_core.js";

export const TIMELINE_EDIT_MODE_KEY = "gg.timelineEditMode";
/** Written only when the user toggles Edit after I26. Missing means default Edit. */
export const TIMELINE_EDIT_MODE_CHOICE_KEY = "gg.timelineEditMode.i26";
export const EDIT_MODE_LABEL = "Edit Mode";
export const EDIT_MODE_ON_CLASS = "gg-edit-mode-on";
export const EDIT_PREVIEW_GAP_PX = 4;

function normalizeEditPreviewMode(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

/**
 * Edit is the default when Cut Manager opens and nothing has been chosen yet.
 * A value saved before I26 is not a choice. After the user toggles, that choice is kept.
 */
export function loadEditPreviewMode(storage) {
  try {
    if (!storage) return true;
    const choice = storage.getItem(TIMELINE_EDIT_MODE_CHOICE_KEY);
    if (choice == null || choice === "") return true;
    return normalizeEditPreviewMode(choice);
  } catch (_) {
    return true;
  }
}

export function saveEditPreviewMode(storage, on) {
  try {
    if (!storage) return;
    const v = normalizeEditPreviewMode(on) ? "1" : "0";
    storage.setItem(TIMELINE_EDIT_MODE_KEY, v);
    storage.setItem(TIMELINE_EDIT_MODE_CHOICE_KEY, v);
  } catch (_) {}
}

/**
 * Still shown for the current cut.
 * A still image uses the media file. Video and animated clips use the poster still.
 * @returns {{ id: string, kind: "image" | "poster" } | null}
 */
export function editPreviewStill(media) {
  if (!media || media.id == null || String(media.id) === "") return null;
  const id = String(media.id);
  if (media.kind === "video") return { id, kind: "poster" };
  return { id, kind: "image" };
}

/**
 * What the edit preview should do when the current cut changes.
 * A different cut always clears the previous frame first. The new still stays
 * hidden until that same still is already loaded, so the old picture cannot linger.
 * Painting the same not-yet-loaded still again does not restart the load.
 *
 * @param {null|{cutId?: string, mediaId?: string, url?: string, loaded?: boolean}} shown
 * @param {{cutId?: string, media?: object|null, url?: string}} next
 */
export function editPreviewSwap(shown, next) {
  const spec = editPreviewStill(next?.media ?? null);
  const cutId = next?.cutId != null ? String(next.cutId) : "";
  const mediaId = spec ? spec.id : "";
  const kind = spec ? spec.kind : "";
  const url = spec && next?.url ? String(next.url) : "";
  const prevUrl = shown?.url ? String(shown.url) : "";
  const prevCut = shown?.cutId != null ? String(shown.cutId) : "";
  const prevMedia = shown?.mediaId != null ? String(shown.mediaId) : "";
  const same = !!url && prevUrl === url && prevMedia === mediaId && prevCut === cutId;
  const showImage = same && !!shown?.loaded;
  let srcSteps = [];
  if (!showImage) {
    if (!url) {
      if (prevUrl) srcSteps = ["clear"];
    } else if (!same) {
      srcSteps = prevUrl ? ["clear", url] : [url];
    }
  }
  return {
    cutId,
    mediaId,
    kind,
    url,
    changed: !same,
    clearPrevious: srcSteps[0] === "clear",
    showImage,
    showEmpty: !spec,
    srcSteps,
  };
}

/**
 * What the edit preview shows for the cut at the playhead.
 * A real video follows that playhead: source time is the clip in-point plus the
 * time into the clip, and the frame index uses the same 24 fps display count as
 * the timeline. Moving along the same video does not reload the file. A different
 * cut clears the previous picture first. Still images stay still. Animated clips
 * use the same playhead frames as the timeline preview (mode "frames"), not a frozen poster.
 *
 * @param {null|{mode?: string, cutId?: string, mediaId?: string, url?: string, loaded?: boolean}} shown
 * @param {{cutId?: string, media?: object|null, url?: string, posterUrl?: string, clipIn?: number, localSec?: number}} next
 */
export function editPreviewAtPlayhead(shown, next) {
  const media = next?.media ?? null;
  const cutId = next?.cutId != null ? String(next.cutId) : "";
  if (playsAsVideo(media) && media.id != null && String(media.id) !== "") {
    return editPreviewVideoFollow(shown, next, cutId);
  }
  if (isAnimatedImage(media)) {
    const url = next?.url ? String(next.url) : "";
    const prevUrl = shown?.url ? String(shown.url) : "";
    const prevCut = shown?.cutId != null ? String(shown.cutId) : "";
    const prevMedia = shown?.mediaId != null ? String(shown.mediaId) : "";
    const same = !!url && shown?.mode === "frames" && prevUrl === url && prevMedia === String(media.id) && prevCut === cutId;
    return {
      mode: "frames",
      cutId,
      mediaId: String(media.id),
      kind: "frames",
      url,
      want: null,
      frame: null,
      changed: !same,
      clearPrevious: false,
      showImage: false,
      showVideo: false,
      showEmpty: false,
      hideVideo: shown?.mode === "video",
      srcSteps: [],
    };
  }

  const spec = editPreviewStill(media);
  let stillUrl = "";
  if (spec?.kind === "poster") {
    stillUrl = next?.posterUrl ? String(next.posterUrl) : (next?.url ? String(next.url) : "");
  } else if (spec && next?.url) {
    stillUrl = String(next.url);
  }
  const swap = editPreviewSwap(shown, { cutId: next?.cutId, media, url: stillUrl });
  return {
    ...swap,
    mode: swap.showEmpty ? "empty" : "still",
    want: null,
    frame: null,
    showVideo: false,
    hideVideo: shown?.mode === "video",
  };
}

function editPreviewVideoFollow(shown, next, cutId) {
  const mediaId = String(next.media.id);
  const url = next?.url ? String(next.url) : "";
  const want = sourceTimeAtClip({ clipIn: next?.clipIn, localSec: next?.localSec });
  const frame = videoPreviewFrameIndex(want);
  const prevUrl = shown?.url ? String(shown.url) : "";
  const prevCut = shown?.cutId != null ? String(shown.cutId) : "";
  const prevMedia = shown?.mediaId != null ? String(shown.mediaId) : "";
  const same = !!url && shown?.mode === "video" && prevUrl === url && prevMedia === mediaId && prevCut === cutId;
  const showVideo = same && !!shown?.loaded;
  let srcSteps = [];
  if (!showVideo) {
    if (!url) {
      if (prevUrl) srcSteps = ["clear"];
    } else if (!same) {
      srcSteps = prevUrl ? ["clear", url] : [url];
    }
  }
  return {
    mode: "video",
    cutId,
    mediaId,
    kind: "video",
    url,
    want,
    frame,
    changed: !same,
    clearPrevious: srcSteps[0] === "clear",
    showImage: false,
    showVideo,
    showEmpty: false,
    hideVideo: false,
    srcSteps,
  };
}

/**
 * Preview window on the graph.
 * Top is just below the graph toolbar (Run bar and the right-docker buttons in that row).
 * Bottom is just above the bottom panel.
 * Left and right stay inside open side panels, and clear of a right docker strip.
 * Returns null when the box would be too small to fit without covering those edges.
 */
export function editPreviewOverlayRect({
  graphRect,
  toolbarBottom = null,
  shotsRect = null,
  rightPanelLeft = null,
  rightDockerLeft = null,
  bottomPanelTop = null,
  gapPx = EDIT_PREVIEW_GAP_PX,
} = {}) {
  const g = graphRect;
  if (!g) return null;
  const gap = Number.isFinite(Number(gapPx)) ? Number(gapPx) : EDIT_PREVIEW_GAP_PX;
  let left = Number(g.left);
  let top = Number(g.top);
  let right = Number.isFinite(Number(g.right)) ? Number(g.right) : left + (Number(g.width) || 0);
  let bottom = Number.isFinite(Number(g.bottom)) ? Number(g.bottom) : top + (Number(g.height) || 0);
  if (![left, top, right, bottom].every((n) => Number.isFinite(n))) return null;

  const bar = Number(toolbarBottom);
  if (Number.isFinite(bar)) top = Math.max(top, bar + gap);

  if (shotsRect && Number(shotsRect.width) > 8 && Number(shotsRect.right) > left + 8) {
    left = Math.max(left, Number(shotsRect.right) + gap);
  }

  const clampRight = (edge) => {
    const n = Number(edge);
    if (Number.isFinite(n) && n > left + 8) right = Math.min(right, n - gap);
  };
  clampRight(rightPanelLeft);
  clampRight(rightDockerLeft);

  const panelTop = Number(bottomPanelTop);
  if (Number.isFinite(panelTop)) bottom = Math.min(bottom, panelTop - gap);

  const width = right - left;
  const height = bottom - top;
  if (width < 32 || height < 32) return null;
  return { left, top, right, bottom, width, height };
}
