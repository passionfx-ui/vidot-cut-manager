/** Pure helpers for timeline clip trim (no DOM). Clips are back-to-back, so trims ripple. */

export const TRIM_SNAP_PX = 8;

const r2 = (x) => Math.round(x * 100 + 1e-6) / 100;

/** Edge offset as "+0.4s" / "-1.2s" / "0.0s". */
export function trimDeltaText(deltaSec) {
  const v = Math.round((Number(deltaSec) || 0) * 10) / 10;
  if (Math.abs(v) < 0.05) return "0.0s";
  return `${v > 0 ? "+" : "-"}${Math.abs(v).toFixed(1)}s`;
}

export function trimTipText(deltaSec, sec) {
  return `${trimDeltaText(deltaSec)} · Duration ${(Number(sec) || 0).toFixed(1)}s`;
}

/**
 * Timeline times the dragged edge may snap to: playhead + clip boundaries at drag start,
 * minus the dragged clip's own two edges.
 * @param {number[]} secs clip lengths in timeline order
 * @param {number} idx dragged clip index
 * @param {number|null} playhead seconds
 */
export function trimSnapTargets(secs, idx, playhead) {
  const bounds = [0];
  for (const s of secs) bounds.push(bounds[bounds.length - 1] + (Number(s) || 0));
  const own = [bounds[idx], bounds[idx + 1]];
  const out = bounds.filter((_, k) => k !== idx && k !== idx + 1);
  if (playhead != null && Number.isFinite(Number(playhead))) {
    const p = Number(playhead);
    if (own.every((b) => Math.abs(p - b) > 0.01)) out.push(p);
  }
  return out;
}

/** Nearest target within thresholdSec of t, or null. */
export function pickSnapTarget(t, targets, thresholdSec) {
  let best = null, bestD = Infinity;
  for (const x of targets || []) {
    const d = Math.abs(x - t);
    if (d <= thresholdSec && d < bestD) { best = x; bestD = d; }
  }
  return best;
}

/**
 * Edge offset after the fallback step snap (`snap` rounds a seconds value).
 * Left video edges step the in point; other edges step the length.
 */
export function quantizeTrimDelta(side, isVideo, startIn, startSec, rawDelta, snap) {
  if (side === "l" && isVideo) return snap(startIn + rawDelta) - startIn;
  if (side === "l") return startSec - snap(startSec - rawDelta);
  return snap(startSec + rawDelta) - startSec;
}

/**
 * New {in, sec} for an edge moved by deltaSec (positive = rightward).
 * Video: never before source frame 0 nor past src_dur; out point stays put on left trims.
 * @param {{ side: "l"|"r", isVideo: boolean, startIn: number, startSec: number, srcDur?: number,
 *   deltaSec: number, vidMin: number, imgMin: number, imgMax: number, maxSec?: number }} o
 */
export function trimToSource(o) {
  const maxSec = o.maxSec ?? 60;
  const d = Number(o.deltaSec) || 0;
  if (!o.isVideo) {
    const sec = o.side === "l" ? o.startSec - d : o.startSec + d;
    return { in: 0, sec: r2(Math.min(o.imgMax, Math.max(o.imgMin, sec))) };
  }
  const dur = Number(o.srcDur) || 0;
  const startIn = Math.max(0, Number(o.startIn) || 0);
  if (o.side === "l") {
    let out = startIn + o.startSec;
    if (dur) out = Math.min(out, dur);
    const lo = Math.max(0, out - maxSec);
    const hi = Math.max(lo, out - o.vidMin);
    const inn = Math.min(hi, Math.max(lo, startIn + d));
    return { in: r2(inn), sec: r2(out - inn) };
  }
  const cap = Math.min(maxSec, dur ? dur - startIn : maxSec);
  const sec = Math.min(cap, Math.max(o.vidMin, o.startSec + d));
  return { in: r2(startIn), sec: r2(sec) };
}

/** Edge offset actually applied by a trim result (inverse of trimToSource). */
export function appliedTrimDelta(side, isVideo, startIn, startSec, next) {
  if (side === "r") return r2(next.sec - startSec);
  if (isVideo) return r2(next.in - startIn);
  return r2(startSec - next.sec);
}
