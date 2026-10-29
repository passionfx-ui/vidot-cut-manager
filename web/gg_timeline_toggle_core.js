/** Pure helpers for Timeline bottom-panel on/off (no DOM). */

export const TIMELINE_OPEN_KEY = "gg.timelineOpen";
export const TIMELINE_HEIGHT_KEY = "gg.timelineHeight";
export const TIMELINE_MIN_HEIGHT = 220;
export const TIMELINE_MAX_VIEWPORT_RATIO = 0.7;

export function normalizeTimelineOpen(v) {
  if (v === false || v === "false" || v === "0" || v === 0) return false;
  return true;
}

export function loadTimelineOpen(storage) {
  try {
    if (!storage) return true;
    const raw = storage.getItem(TIMELINE_OPEN_KEY);
    if (raw == null) return true;
    return normalizeTimelineOpen(raw);
  } catch (_) {
    return true;
  }
}

export function saveTimelineOpen(storage, open) {
  try {
    if (!storage) return;
    storage.setItem(TIMELINE_OPEN_KEY, normalizeTimelineOpen(open) ? "1" : "0");
  } catch (_) {}
}

export function parseTimelineHeight(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function loadTimelineHeight(storage) {
  try {
    if (!storage) return null;
    return parseTimelineHeight(storage.getItem(TIMELINE_HEIGHT_KEY));
  } catch (_) {
    return null;
  }
}

export function saveTimelineHeight(storage, px) {
  try {
    if (!storage) return;
    const n = Number(px);
    if (!Number.isFinite(n) || n <= 0) return;
    storage.setItem(TIMELINE_HEIGHT_KEY, String(Math.round(n)));
  } catch (_) {}
}

/**
 * @param {number} h desired height px
 * @param {number} viewportH window inner height
 * @param {number} [min] minimum height px
 */
export function clampHeight(h, viewportH, min = TIMELINE_MIN_HEIGHT) {
  const floor = Math.max(min, 0);
  const cap = Math.max(floor, Math.floor((Number(viewportH) || 0) * TIMELINE_MAX_VIEWPORT_RATIO));
  const n = Number(h);
  if (!Number.isFinite(n)) return floor;
  return Math.min(cap, Math.max(floor, n));
}

/** @param {string} open */
export function timelineToggleTooltip(open) {
  return open ? "Timeline: on (T)" : "Timeline: off (T)";
}

export function isTimelineShortcutKey(key) {
  return key === "t" || key === "T";
}

/**
 * @param {{ key?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, target?: { tagName?: string, isContentEditable?: boolean }, isComposing?: boolean, modalOpen?: boolean, promptDialogOpen?: boolean }} e
 */
export function shouldIgnoreShortcut(e) {
  if (!e) return true;
  if (e.ctrlKey || e.metaKey) return true;
  if (!isTimelineShortcutKey(e.key)) return true;
  const tag = (e.target?.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (e.target?.isContentEditable) return true;
  if (e.isComposing) return true;
  if (e.modalOpen) return true;
  if (e.promptDialogOpen) return true;
  return false;
}

/**
 * Plugin keyboard shortcuts act only while the pointer hovers, or focus is inside,
 * a plugin surface — never while the user works on the ComfyUI canvas.
 * Omit the timeline fields to scope a shortcut to the Shots sidebar only.
 * @param {{ hoverShots?: boolean, focusShots?: boolean, hoverTimeline?: boolean, focusTimeline?: boolean }} ctx
 */
export function pluginKeyScopeActive(ctx) {
  return !!(ctx?.hoverShots || ctx?.focusShots || ctx?.hoverTimeline || ctx?.focusTimeline);
}

/**
 * @param {{ hoverShots?: boolean, focusShots?: boolean, hoverTimeline?: boolean, focusTimeline?: boolean }} ctx
 */
export function timelineShortcutAllowed(ctx) {
  return pluginKeyScopeActive(ctx);
}
