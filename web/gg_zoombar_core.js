/**
 * Pure math for the Timeline zoom scrollbar (no DOM).
 * Geometry is in scroll-container pixels: content width W = seqSec * px + pad,
 * where pad is the container's horizontal padding and C its clientWidth.
 */

export const ZOOM_MIN_PX = 6;
export const ZOOM_MAX_PX = 240;
export const ZOOM_KEY_FACTOR = 1.5;
export const ZOOMBAR_MIN_THUMB = 24;

const fin = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n) : d);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Pixels-per-second within limits, rounded to 0.01. */
export function clampPx(px, minPx = ZOOM_MIN_PX, maxPx = ZOOM_MAX_PX) {
  const n = Number(px);
  if (Number.isNaN(n)) return minPx;
  return Math.round(clamp(n, minPx, maxPx) * 100) / 100;
}

/**
 * Thumb position/size from the native scroll state.
 * @param {{ scrollLeft: number, scrollWidth: number, clientWidth: number, barW: number, minThumb?: number }} s
 * @returns {{ left: number, width: number }}
 */
export function thumbFromScroll(s) {
  const barW = Math.max(0, fin(s.barW));
  const sw = Math.max(1, fin(s.scrollWidth, 1));
  const cw = Math.max(0, fin(s.clientWidth));
  const minThumb = Math.min(barW, Math.max(0, fin(s.minThumb, ZOOMBAR_MIN_THUMB)));
  const maxScroll = Math.max(0, sw - cw);
  if (!barW) return { left: 0, width: 0 };
  if (maxScroll <= 0) return { left: 0, width: barW };
  const width = clamp(barW * (cw / sw), minThumb, barW);
  const left = (barW - width) * clamp(fin(s.scrollLeft) / maxScroll, 0, 1);
  return { left, width };
}

/**
 * Inverse of thumbFromScroll for a body drag.
 * @param {{ left: number, width: number, barW: number, maxScroll: number }} s
 */
export function scrollFromThumbLeft(s) {
  const travel = fin(s.barW) - fin(s.width);
  const maxScroll = Math.max(0, fin(s.maxScroll));
  if (travel <= 0 || maxScroll <= 0) return 0;
  return maxScroll * clamp(fin(s.left) / travel, 0, 1);
}

/**
 * Handle drag: move one thumb edge to `edgeFrac` (0..1 of the bar) while the opposite
 * edge keeps its bar position. `startFrac` / `endFrac` are the thumb edges at drag start
 * (scrollLeft / W and (scrollLeft + C) / W).
 * @param {{ side: "l"|"r", edgeFrac: number, startFrac: number, endFrac: number, seqSec: number, clientWidth: number, pad?: number, minPx?: number, maxPx?: number }} s
 * @returns {{ px: number, scrollLeft: number }}
 */
export function zoomFromHandle(s) {
  const C = Math.max(1, fin(s.clientWidth, 1));
  const pad = Math.max(0, fin(s.pad));
  const D = Math.max(1e-6, fin(s.seqSec, 1));
  const minPx = fin(s.minPx, ZOOM_MIN_PX);
  const maxPx = fin(s.maxPx, ZOOM_MAX_PX);
  const a0 = clamp(fin(s.startFrac), 0, 1);
  const b0 = clamp(fin(s.endFrac, 1), a0, 1);
  const edge = clamp(fin(s.edgeFrac), 0, 1);
  const span = s.side === "l" ? b0 - edge : edge - a0;
  const W = span > 1e-6 ? C / span : Infinity;
  const px = clampPx((W - pad) / D, minPx, maxPx);
  const W2 = D * px + pad;
  const maxScroll = Math.max(0, W2 - C);
  const sl = s.side === "l" ? b0 * W2 - C : a0 * W2;
  return { px, scrollLeft: clamp(sl, 0, maxScroll) };
}

/** Pixels-per-second that fits the whole sequence in the visible width (rounded down so it never overflows). */
export function fitPx({ seqSec, clientWidth, pad = 0, minPx = ZOOM_MIN_PX, maxPx = ZOOM_MAX_PX }) {
  const D = Math.max(1e-6, fin(seqSec, 1));
  return clampPx(Math.floor(((fin(clientWidth) - fin(pad)) / D) * 100) / 100, minPx, maxPx);
}

/**
 * Zoom keeping the time under viewport x (relative to the container's left edge) in place.
 * @param {{ px: number, nextPx: number, scrollLeft: number, x: number, padLeft?: number }} s
 * @returns {number} new scrollLeft (not clamped to the new max)
 */
export function scrollForZoomAt(s) {
  const px = Math.max(1e-6, fin(s.px, 1));
  const padL = fin(s.padLeft);
  const x = fin(s.x);
  const t = Math.max(0, (fin(s.scrollLeft) + x - padL) / px);
  return Math.max(0, t * fin(s.nextPx, px) + padL - x);
}

/** Zoom factor for one wheel event (wheel up = zoom in). deltaMode: 0 px, 1 line, 2 page. */
export function wheelZoomFactor(delta, deltaMode = 0) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  const d = clamp(fin(delta) * unit, -400, 400);
  return Math.exp(-d * 0.002);
}

/** "zoom-in" | "zoom-out" | null for a keydown (bare '=' / '+' / '-' only). */
export function zoomKeyAction(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return null;
  if (e.key === "=" || e.key === "+") return "zoom-in";
  if (e.key === "-") return "zoom-out";
  return null;
}
