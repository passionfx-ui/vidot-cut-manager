/**
 * Timeline clip placement (no DOM). Native projects place clips freely (gaps allowed, never overlapping);
 * imported projects keep clips back to back. Items are `{ id, start, sec }` in track order.
 */

import { pickSnapTarget } from "./gg_trim_core.js";

export const GAP = -2;

const r2 = (x) => Math.round(x * 100 + 1e-6) / 100;
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

/**
 * Same rule as gg_project/timeline.py place_clips: a clip starts at its wanted start but never before the
 * previous clip ends; without a start (or when not free) it is packed after the previous clip.
 * @returns {{ starts: number[], total: number }}
 */
export function layoutTrack(items, free) {
  const starts = [];
  let at = 0;
  for (const it of items || []) {
    const want = free ? num(it?.start) : null;
    const s = want == null ? at : Math.max(at, want);
    starts.push(r2(s));
    at = s + (Number(it?.sec) || 0);
  }
  return { starts, total: r2(at) };
}

/** Clip under time t: `{ i, local }`; `i === GAP` between clips; past the end -> last clip at its end. */
export function clipAtTime(items, t) {
  const list = items || [];
  for (let i = 0; i < list.length; i++) {
    const s = Number(list[i].start) || 0;
    if (t < s - 1e-6) return { i: GAP, local: 0 };
    if (t < s + list[i].sec - 1e-6) return { i, local: t - s };
  }
  return list.length ? { i: list.length - 1, local: list[list.length - 1].sec } : { i: -1, local: 0 };
}

/** Snap times for a dragged clip / edge: 0, every other clip's edges and the playhead, minus its own edges. */
export function edgeSnapTargets(items, idx, playhead) {
  const own = items[idx] ? [Number(items[idx].start) || 0, (Number(items[idx].start) || 0) + items[idx].sec] : [];
  const out = [0];
  items.forEach((it, k) => {
    if (k === idx) return;
    const s = Number(it.start) || 0;
    out.push(s, r2(s + it.sec));
  });
  if (playhead != null && Number.isFinite(Number(playhead))) out.push(Number(playhead));
  return out.filter((x) => own.every((b) => Math.abs(x - b) > 0.01));
}

/** Snap a moved clip's start or end edge (whichever is closer) to a target within thresholdSec. */
export function snapMoveStart(want, sec, targets, thresholdSec) {
  const a = pickSnapTarget(want, targets, thresholdSec);
  const b = pickSnapTarget(want + sec, targets, thresholdSec);
  const da = a == null ? Infinity : Math.abs(a - want);
  const db = b == null ? Infinity : Math.abs(b - (want + sec));
  if (da === Infinity && db === Infinity) return { start: Math.max(0, want), hit: null };
  return da <= db ? { start: Math.max(0, a), hit: a } : { start: Math.max(0, b - sec), hit: b };
}

/**
 * Move clip `idx` to `want` seconds without overlapping:
 * - free spot: it goes there (a gap stays behind);
 * - its middle is over a gap that is too small or it only touches a neighbour: clamped to the gap edge;
 * - its middle is over another clip: dropped before/after that clip, later clips pushed right.
 * @returns {{ order: string[], starts: Record<string, number>, start: number }}
 */
export function placeClip(items, idx, want) {
  const me = items[idx];
  const sec = Number(me.sec) || 0;
  const others = items
    .filter((_, k) => k !== idx)
    .map((it) => ({ id: it.id, s: Number(it.start) || 0, e: (Number(it.start) || 0) + it.sec, sec: it.sec }))
    .sort((x, y) => x.s - y.s);
  let start = Math.max(0, Number(want) || 0);
  const mid = start + sec / 2;
  const overlaps = (s) => others.some((o) => s < o.e - 1e-6 && s + sec > o.s + 1e-6);
  if (overlaps(start)) {
    const hit = others.find((o) => mid >= o.s && mid < o.e);
    if (hit) {
      start = mid <= (hit.s + hit.e) / 2 ? hit.s : hit.e;
    } else {
      const k = others.findIndex((o) => o.s > mid);
      const lo = k <= 0 ? 0 : others[k - 1].e;
      const hi = k < 0 ? Infinity : others[k].s;
      if (hi - lo >= sec - 1e-6) start = Math.min(Math.max(start, lo), hi - sec);
      else start = mid - lo < hi - mid ? lo : hi;
    }
  }
  start = r2(start);
  const seq = [...others.map((o) => ({ id: o.id, s: o.s, sec: o.sec, mine: false })), { id: me.id, s: start, sec, mine: true }];
  seq.sort((x, y) => x.s - y.s || (x.mine ? -1 : y.mine ? 1 : 0));
  const { starts } = layoutTrack(seq.map((x) => ({ start: x.s, sec: x.sec })), true);
  const out = {};
  seq.forEach((x, k) => { out[x.id] = starts[k]; });
  return { order: seq.map((x) => x.id), starts: out, start: out[me.id] };
}

/** Lowest allowed left-edge time for a free-placed clip: the previous clip's end (0 for the first). */
export function prevClipEnd(items, idx) {
  if (idx <= 0) return 0;
  const p = items[idx - 1];
  return r2((Number(p.start) || 0) + p.sec);
}
