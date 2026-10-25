/** Pure helpers for Shots list Info | Story mode (no DOM). */

export const LIST_MODE_KEY = "gg.listMode";

const FIELD_KEYS = ["notes", "planned_sec", "end_card", "needs_redo"];

export function normalizeListMode(v) {
  return v === "story" ? "story" : "info";
}

export function loadListMode(storage) {
  try {
    if (!storage) return "info";
    return normalizeListMode(storage.getItem(LIST_MODE_KEY));
  } catch (_) {
    return "info";
  }
}

export function saveListMode(storage, mode) {
  try {
    if (!storage) return;
    storage.setItem(LIST_MODE_KEY, normalizeListMode(mode));
  } catch (_) {}
}

/** Active cut id at timeline time t (same rule as itemAt in gonggan.js). */
export function playCutIdAtTime(cuts, t) {
  if (!Array.isArray(cuts) || !cuts.length) return "";
  const time = Number(t) || 0;
  let at = 0;
  for (let i = 0; i < cuts.length; i++) {
    const sec = Number(cuts[i].sec) || 0;
    if (time < at + sec - 1e-6) return cuts[i].id || "";
    at += sec;
  }
  return cuts[cuts.length - 1].id || "";
}

/**
 * Smallest scrollTop change that fully reveals the row inside the viewport (with margin).
 * Coordinates: rowTop is offset from the scroll container content top; scrollTop is current scroll.
 */
export function scrollTopToReveal({ viewTop, viewHeight, rowTop, rowHeight, scrollTop, margin = 0 }) {
  const m = Number(margin) || 0;
  const st = Number(scrollTop) || 0;
  const vh = Number(viewHeight) || 0;
  const rt = Number(rowTop) || 0;
  const rh = Number(rowHeight) || 0;
  const viewStart = viewTop != null ? Number(viewTop) : st;
  const rowBottom = rt + rh;
  const viewBottom = viewStart + vh;

  if (rt >= viewStart + m && rowBottom <= viewBottom - m) return st;

  if (rt < viewStart + m) return Math.max(0, rt - m);
  return Math.max(0, rowBottom - vh + m);
}

export function shouldDeferRepaint({ composing }) {
  return !!composing;
}

export function shouldFollowPlayback({ mode, cutId, lastCutId, typingInStory, groupCollapsed }) {
  const m = normalizeListMode(mode);
  const id = cutId || "";
  const highlight = m === "story" && id !== "";
  const scroll =
    highlight &&
    id !== (lastCutId || "") &&
    !typingInStory &&
    !groupCollapsed;
  return { highlight, scroll };
}

export function applyFieldOverrides(timeline, overrides) {
  if (!timeline || !overrides || typeof overrides !== "object") return timeline;
  const cuts = timeline.cuts;
  if (!Array.isArray(cuts)) return timeline;
  for (const c of cuts) {
    if (!c || !c.id) continue;
    const o = overrides[c.id];
    if (!o || typeof o !== "object") continue;
    for (const k of FIELD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    }
  }
  return timeline;
}

export function classifySaveFailure(status) {
  const s = Number(status);
  if (s === 404 || s === 405) return "route-missing";
  return "error";
}

/** Clamp textarea content height (px) between min and max; safe for bad inputs. */
export function autoHeightPx({ scrollHeight, minPx, maxPx }) {
  const lo = Number(minPx);
  const min = Number.isFinite(lo) ? lo : 0;
  const sh = Number(scrollHeight);
  const h = Number.isFinite(sh) ? sh : min;
  const hi = Number(maxPx);
  const max = Number.isFinite(hi) && hi > 0 ? hi : h;
  return Math.min(max, Math.max(min, h));
}
