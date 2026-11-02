/** Edit toggle: still preview over the graph (pure, no DOM). */

export const TIMELINE_EDIT_MODE_KEY = "gg.timelineEditMode";
export const EDIT_MODE_LABEL = "Edit Mode";
export const EDIT_MODE_ON_CLASS = "gg-edit-mode-on";
export const EDIT_PREVIEW_GAP_PX = 4;

function normalizeEditPreviewMode(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

export function loadEditPreviewMode(storage) {
  try {
    if (!storage) return false;
    const raw = storage.getItem(TIMELINE_EDIT_MODE_KEY);
    if (raw == null) return false;
    return normalizeEditPreviewMode(raw);
  } catch (_) {
    return false;
  }
}

export function saveEditPreviewMode(storage, on) {
  try {
    if (!storage) return;
    storage.setItem(TIMELINE_EDIT_MODE_KEY, normalizeEditPreviewMode(on) ? "1" : "0");
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
