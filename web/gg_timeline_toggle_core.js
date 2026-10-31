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

/** First show with no saved height: the panel opens at half of ComfyUI's default bottom panel height. */
export const TIMELINE_FIRST_SHOW_RATIO = 0.5;

/**
 * @param {number} defaultPx bottom panel height ComfyUI opened the Timeline at
 * @param {number} viewportH window inner height
 */
export function firstShowTimelineHeight(defaultPx, viewportH) {
  return Math.round(clampHeight((Number(defaultPx) || 0) * TIMELINE_FIRST_SHOW_RATIO, viewportH));
}

/**
 * Cap an inflated layout measure before first-show halving (overflow / pre-shrink panel).
 * @param {number} measuredTimelinePx
 * @param {number} nestedAvailPx room for timeline inside nested canvas pane (0 = unknown)
 */
export function capMeasuredTimelineForFirstShow(measuredTimelinePx, nestedAvailPx) {
  const m = Number(measuredTimelinePx) || 0;
  const nested = Number(nestedAvailPx) || 0;
  if (nested <= 0) return m;
  return Math.min(m, nested);
}

/**
 * Splitter percent denominator: nested canvas pane height (keeps the bottom panel in the viewport),
 * not the overlay splitter box if it has grown with content.
 * @param {number} nestedPaneHeight px from `.p-splitterpanel-nested`
 * @param {number} splitterHeight px from `.p-splitter` (fallback)
 */
export function bottomPanelSplitterTotal(nestedPaneHeight, splitterHeight) {
  const nested = Number(nestedPaneHeight) || 0;
  if (nested > 0) return nested;
  return Number(splitterHeight) || 0;
}

/**
 * Bottom panel share (percent) of the canvas/bottom splitter for a wanted height.
 * @param {number} want px
 * @param {number} total splitter height px
 */
export function bottomPanelPercent(want, total, min = TIMELINE_MIN_HEIGHT) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.min(100, Math.max((want / t) * 100, (min / t) * 100));
}

/**
 * Dragging the timeline resize handle up (negative deltaY in screen coords) grows the panel.
 * @param {number} startHeight px when the drag started
 * @param {number} deltaY clientY - startClientY
 * @param {number} viewportH
 * @param {number} [min]
 */
export function timelineHeightFromDrag(startHeight, deltaY, viewportH, min = TIMELINE_MIN_HEIGHT) {
  const start = Number(startHeight) || min;
  const next = start - (Number(deltaY) || 0);
  return clampHeight(next, viewportH, min);
}

/** Pointer position during handle drag (viewport edges snap to min / max). */
export function timelineHeightFromPointer(startHeight, startY, clientY, viewportH, min = TIMELINE_MIN_HEIGHT) {
  const vh = Number(viewportH) || 0;
  const y = Number(clientY) || 0;
  const sy = Number(startY) || 0;
  const start = Number(startHeight) || min;
  const delta = y - sy;
  const cap = clampHeight(1e9, vh, min);
  if (start >= cap - 16 && vh > 0) {
    const travelDown = Math.max(0, vh - 1 - sy);
    const fromDrag = timelineHeightFromDrag(startHeight, delta, vh, min);
    if (fromDrag > min && travelDown > 0 && delta >= travelDown - 2) return min;
    if (y >= vh - 1) return min;
  }
  if (y <= 1) return cap;
  return timelineHeightFromDrag(startHeight, delta, vh, min);
}

/** Extra px in `.bottom-panel` above/besides `.gg-timeline` (tab chrome, padding). */
export function timelinePanelChrome(panelHeight, timelineHeight) {
  const p = Number(panelHeight) || 0;
  const t = Number(timelineHeight) || 0;
  return Math.max(0, p - t);
}

/**
 * Tab chrome + padding from layout boxes (panel vs timeline), not panelH - timelineH
 * (those can match while tabs consume space).
 * @param {{ top?: number, bottom?: number }} panelRect
 * @param {{ top?: number, bottom?: number }} timelineRect
 */
export function timelineLayoutChrome(panelRect, timelineRect) {
  const pt = Number(panelRect?.top) || 0;
  const pb = Number(panelRect?.bottom) || 0;
  const tt = Number(timelineRect?.top) || 0;
  const tb = Number(timelineRect?.bottom) || 0;
  const top = Math.max(0, tt - pt);
  const bottom = Math.max(0, pb - tb);
  return top + bottom;
}

/** Bottom panel height needed so `.gg-timeline` can be `timelineHeight` px tall. */
export function panelHeightForTimelineHeight(timelineHeight, chromePx) {
  const t = Number(timelineHeight) || 0;
  const c = Math.max(0, Number(chromePx) || 0);
  return t + c;
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
