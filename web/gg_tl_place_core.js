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

/** Snap times for a dragged clip / edge: 0, every other clip's edges and the playhead, minus its own edges.
 * `extraSkip` (ids) drops more clips, so a multi-selection does not snap to itself. */
export function edgeSnapTargets(items, idx, playhead, extraSkip) {
  const skip = new Set(extraSkip || []);
  if (items[idx]) skip.add(items[idx].id);
  const own = items[idx] ? [Number(items[idx].start) || 0, (Number(items[idx].start) || 0) + items[idx].sec] : [];
  const out = [0];
  items.forEach((it) => {
    if (skip.has(it.id)) return;
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
 * - its middle is over another clip: reordered before/after that clip and the track is packed (no gaps).
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
      // Dropped onto another clip: reorder and ripple-pack the whole track (no gap left behind).
      const seq = others.slice();
      const k = seq.indexOf(hit) + (mid <= (hit.s + hit.e) / 2 ? 0 : 1);
      seq.splice(k, 0, { id: me.id, sec });
      const { starts } = layoutTrack(seq.map((x) => ({ sec: x.sec })), false);
      const out = {};
      seq.forEach((x, j) => { out[x.id] = starts[j]; });
      return { order: seq.map((x) => x.id), starts: out, start: out[me.id], packed: true };
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

/**
 * Move `movingIds` as one block inside `order`. `insertAt` is an index in the original order
 * (0 = before the first clip, `order.length` = after the last), same as a single-clip drop slot.
 * The block keeps the relative order it had in `order`.
 * @param {string[]} order
 * @param {string[]} movingIds
 * @param {number} insertAt
 * @returns {string[]}
 */
export function moveClipBlock(order, movingIds, insertAt) {
  const ids = order || [];
  const moving = new Set(movingIds || []);
  const block = ids.filter((id) => moving.has(id));
  if (!block.length) return ids.slice();
  const limit = Math.max(0, Math.min(ids.length, insertAt | 0));
  let restIndex = 0;
  for (let i = 0; i < limit; i++) if (!moving.has(ids[i])) restIndex++;
  const rest = ids.filter((id) => !moving.has(id));
  rest.splice(restIndex, 0, ...block);
  return rest;
}

/**
 * Move every clip in `movingIds` with `anchorId`, keeping their spacing.
 * Empty space: the group slides (a gap stays behind) and never overlaps other clips.
 * The anchor's middle on another clip: the group is inserted there as a block and the track packs,
 * same as placeClip dropped onto a clip.
 * One id delegates to placeClip.
 * @returns {{ order: string[], starts: Record<string, number>, start: number, packed?: boolean }}
 */
export function placeSelection(items, movingIds, anchorId, want) {
  const list = items || [];
  const moving = [];
  const seen = new Set();
  for (const it of list) {
    if ((movingIds || []).includes(it.id) && !seen.has(it.id)) {
      seen.add(it.id);
      moving.push(it.id);
    }
  }
  if (!moving.length && anchorId) moving.push(anchorId);
  if (moving.length <= 1) {
    const id = moving[0] || anchorId;
    const idx = list.findIndex((it) => it.id === id);
    if (idx < 0) return { order: list.map((it) => it.id), starts: {}, start: 0 };
    return placeClip(list, idx, want);
  }
  const movingSet = new Set(moving);
  const anchor = list.find((it) => it.id === anchorId && movingSet.has(it.id)) || list.find((it) => it.id === moving[0]);
  const anchorStart = Number(anchor.start) || 0;
  let delta = (Number(want) || 0) - anchorStart;
  const earliest = Math.min(...list.filter((it) => movingSet.has(it.id)).map((it) => Number(it.start) || 0));
  if (earliest + delta < 0) delta = -earliest;

  const proposedStart = (it) => r2((Number(it.start) || 0) + (movingSet.has(it.id) ? delta : 0));
  const others = list
    .filter((it) => !movingSet.has(it.id))
    .map((it) => ({ id: it.id, s: Number(it.start) || 0, e: (Number(it.start) || 0) + (Number(it.sec) || 0), sec: Number(it.sec) || 0 }));
  const proposed = list.filter((it) => movingSet.has(it.id)).map((it) => {
    const s = proposedStart(it);
    const sec = Number(it.sec) || 0;
    return { id: it.id, s, e: r2(s + sec), sec };
  });
  const hitsOther = (p) => others.some((o) => p.s < o.e - 1e-6 && p.e > o.s + 1e-6);
  const anchorProp = proposed.find((p) => p.id === anchor.id) || proposed[0];
  const finish = (seq, free) => {
    const laid = layoutTrack(seq.map((x) => ({ start: free ? x.s : undefined, sec: x.sec })), free);
    const out = {};
    seq.forEach((x, i) => { out[x.id] = laid.starts[i]; });
    return { order: seq.map((x) => x.id), starts: out, start: out[anchor.id], packed: !free };
  };
  if (!proposed.some(hitsOther)) {
    const index = new Map(list.map((it, i) => [it.id, i]));
    const seq = [
      ...others.map((o) => ({ id: o.id, s: o.s, sec: o.sec })),
      ...proposed.map((p) => ({ id: p.id, s: p.s, sec: p.sec })),
    ];
    seq.sort((a, b) => a.s - b.s || index.get(a.id) - index.get(b.id));
    return finish(seq, true);
  }
  const mid = (anchorProp.s + anchorProp.e) / 2;
  const hit = others.find((o) => mid >= o.s && mid < o.e);
  if (hit) {
    const seq = others.slice();
    const k = seq.indexOf(hit) + (mid <= (hit.s + hit.e) / 2 ? 0 : 1);
    const block = moving.map((id) => {
      const it = list.find((x) => x.id === id);
      return { id, sec: Number(it.sec) || 0 };
    });
    seq.splice(k, 0, ...block);
    return finish(seq, false);
  }
  const sec = Number(anchor.sec) || 0;
  const k = others.findIndex((o) => o.s > mid);
  const lo = k <= 0 ? 0 : others[k - 1].e;
  const hi = k < 0 ? Infinity : others[k].s;
  let anchorAt = anchorProp.s;
  if (hi - lo >= sec - 1e-6) anchorAt = Math.min(Math.max(anchorAt, lo), hi - sec);
  else anchorAt = mid - lo < hi - mid ? lo : Math.max(0, hi);
  const fix = anchorAt - anchorProp.s;
  const index = new Map(list.map((it, i) => [it.id, i]));
  const seq = [
    ...others.map((o) => ({ id: o.id, s: o.s, sec: o.sec })),
    ...proposed.map((p) => ({ id: p.id, s: r2(Math.max(0, p.s + fix)), sec: p.sec })),
  ];
  seq.sort((a, b) => a.s - b.s || index.get(a.id) - index.get(b.id));
  return finish(seq, true);
}

/**
 * Remove empty space so clips sit back to back. Durations and order stay.
 * No `selectedIds` (or every clip): pack the whole track from 0.
 * A subset: pack from the first selected clip through the last (that span only) and pull later clips
 * left by the time that was removed.
 * @param {{ id: string, start?: number, sec?: number }[]} items track order
 * @param {string[]|null} [selectedIds]
 * @returns {{ starts: Record<string, number>, changed: boolean }}
 */
export function closeGaps(items, selectedIds) {
  const list = (items || []).map((it) => ({
    id: it.id,
    start: Number(it.start) || 0,
    sec: Number(it.sec) || 0,
  }));
  const out = {};
  if (!list.length) return { starts: out, changed: false };
  const known = new Set(list.map((it) => it.id));
  const picked = (selectedIds || []).filter((id) => known.has(id));
  const sel = new Set(picked);
  const all = sel.size === 0 || sel.size === list.length;
  let from = 0;
  let to = list.length - 1;
  let origin = 0;
  if (!all) {
    from = list.findIndex((it) => sel.has(it.id));
    for (let i = list.length - 1; i >= 0; i--) if (sel.has(list[i].id)) { to = i; break; }
    origin = list[from].start;
  }
  const wanted = list.map((it) => it.start);
  let at = origin;
  for (let i = from; i <= to; i++) {
    wanted[i] = r2(at);
    at += list[i].sec;
  }
  const oldEnd = list[to].start + list[to].sec;
  const delta = at - oldEnd;
  for (let i = to + 1; i < list.length; i++) wanted[i] = r2(Math.max(0, list[i].start + delta));
  const { starts } = layoutTrack(list.map((it, i) => ({ start: wanted[i], sec: it.sec })), true);
  list.forEach((it, i) => { out[it.id] = starts[i]; });
  const changed = list.some((it, i) => Math.abs(it.start - starts[i]) > 0.011);
  return { starts: out, changed };
}

/** Lowest allowed left-edge time for a free-placed clip: the previous clip's end (0 for the first). */
export function prevClipEnd(items, idx) {
  if (idx <= 0) return 0;
  const p = items[idx - 1];
  return r2((Number(p.start) || 0) + p.sec);
}
