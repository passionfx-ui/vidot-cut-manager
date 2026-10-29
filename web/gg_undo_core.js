/**
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo-redo for the Shots cut list and the Timeline edit (pure logic, no DOM).
 * One history per key scope; it belongs to one project and starts empty for another.
 */

export const UNDO_LIMIT = 50;

function isLetterKey(e, letter) {
  return String(e.key || "").toLowerCase() === letter || e.code === `Key${letter.toUpperCase()}`;
}

/**
 * Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y = redo. Scope, typing, menu and modal checks are
 * done by the caller.
 * @param {{ key?: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean,
 *   altKey?: boolean, isComposing?: boolean }} e
 * @returns {"undo" | "redo" | null}
 */
export function undoKeyAction(e) {
  if (!e || e.isComposing || e.key === "Process") return null;
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (isLetterKey(e, "z")) return e.shiftKey ? "redo" : "undo";
  if (isLetterKey(e, "y") && !e.shiftKey) return "redo";
  return null;
}

/**
 * Which history a key goes to. The pointer wins over focus: the Timeline root keeps focus after a click
 * while clicks in Shots do not move it.
 * @param {{ hoverShots?: boolean, focusShots?: boolean, hoverTimeline?: boolean, focusTimeline?: boolean }} ctx
 * @returns {"shots" | "timeline" | null}
 */
export function undoScope(ctx) {
  if (ctx?.hoverTimeline) return "timeline";
  if (ctx?.hoverShots) return "shots";
  if (ctx?.focusTimeline) return "timeline";
  if (ctx?.focusShots) return "shots";
  return null;
}

export function sameSnapshot(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Bounded undo/redo stacks of snapshots for one project at a time (`key` = project id).
 * @param {{ limit?: number }} [opts]
 */
export function createUndoHistory({ limit = UNDO_LIMIT } = {}) {
  let key = "";
  let past = [];
  let future = [];
  const cap = (list) => {
    if (list.length > limit) list.splice(0, list.length - limit);
  };
  const sync = (k) => {
    const next = String(k || "");
    if (next !== key) {
      key = next;
      past = [];
      future = [];
    }
  };
  return {
    /** State before a new edit; clears redo. A snapshot equal to the last one is skipped. */
    record(k, snapshot) {
      sync(k);
      if (!snapshot) return;
      if (!past.length || !sameSnapshot(past[past.length - 1], snapshot)) past.push(snapshot);
      cap(past);
      future = [];
    },
    /** @returns snapshot to restore, or null. `current` (state now) goes to the redo stack. */
    undo(k, current) {
      sync(k);
      if (!past.length) return null;
      const snap = past.pop();
      if (current) {
        future.push(current);
        cap(future);
      }
      return snap;
    },
    /** @returns snapshot to restore, or null. `current` goes back to the undo stack. */
    redo(k, current) {
      sync(k);
      if (!future.length) return null;
      const snap = future.pop();
      if (current) {
        past.push(current);
        cap(past);
      }
      return snap;
    },
    clear() {
      past = [];
      future = [];
    },
    canUndo(k) {
      return String(k || "") === key && past.length > 0;
    },
    canRedo(k) {
      return String(k || "") === key && future.length > 0;
    },
    sizes() {
      return { key, undo: past.length, redo: future.length };
    },
  };
}

/**
 * Shots snapshot ({ order, groups }) made to fit the cuts that exist now: deleted cuts are dropped,
 * cuts the snapshot does not know go to the end and keep their current scene when that scene is in it.
 * @param {{ order: string[], groups: { id: string, cut_ids?: string[] }[] }} snap
 * @param {{ order: string[], groups?: { id: string, cut_ids?: string[] }[] }} current
 */
export function fitOrderGroupsSnapshot(snap, current) {
  const ids = (current?.order || []).filter(Boolean);
  const live = new Set(ids);
  const order = (snap?.order || []).filter((id) => live.has(id));
  const known = new Set(order);
  const extra = ids.filter((id) => !known.has(id));
  const groups = (snap?.groups || []).map((g) => ({ ...g, cut_ids: (g.cut_ids || []).filter((id) => live.has(id)) }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const g of current?.groups || []) {
    const into = byId.get(g.id);
    if (!into) continue;
    for (const id of g.cut_ids || []) if (extra.includes(id)) into.cut_ids.push(id);
  }
  return { order: [...order, ...extra], groups };
}

function trackIds(tl) {
  const cutIds = tl.cuts.map((c) => c.id);
  if (!Array.isArray(tl.track_order)) return cutIds;
  const known = new Set(cutIds);
  const out = tl.track_order.filter((id) => known.has(id));
  const seen = new Set(out);
  return [...out, ...cutIds.filter((id) => !seen.has(id))];
}

/**
 * Timeline edit state: clip order + per-clip in/sec (+ start on a native free track).
 * @param {{ cuts: { id: string, in?: number, sec?: number, start?: number }[], track_order?: string[] }} tl
 * @returns {{ order: string[], clips: Record<string, { in: number, sec: number, start?: number }> } | null}
 */
export function snapshotTimelineEdit(tl) {
  if (!tl || !Array.isArray(tl.cuts)) return null;
  const free = Array.isArray(tl.track_order);
  const clips = {};
  for (const c of tl.cuts) {
    clips[c.id] = free ? { in: Number(c.in) || 0, sec: Number(c.sec) || 0, start: Number(c.start) || 0 } : { in: Number(c.in) || 0, sec: Number(c.sec) || 0 };
  }
  return { order: trackIds(tl), clips };
}

/**
 * Put a timeline snapshot back onto `tl` (mutates). Cuts the snapshot does not know keep their values
 * and go after the known ones. Native: sets `track_order`; imported: reorders `cuts` and `pos`.
 * @returns {boolean} false when nothing could be applied
 */
export function applyTimelineSnapshot(tl, snap) {
  if (!tl || !Array.isArray(tl.cuts) || !snap) return false;
  const byId = new Map(tl.cuts.map((c) => [c.id, c]));
  const order = (snap.order || []).filter((id) => byId.has(id));
  const seen = new Set(order);
  for (const id of trackIds(tl)) if (!seen.has(id)) order.push(id);
  for (const id of order) {
    const e = snap.clips?.[id];
    const c = byId.get(id);
    if (!e || !c) continue;
    c.in = e.in;
    c.sec = e.sec;
    if (e.start != null) c.start = e.start;
  }
  if (Array.isArray(tl.track_order)) {
    tl.track_order = order;
  } else {
    tl.cuts.splice(0, tl.cuts.length, ...order.map((id) => byId.get(id)));
    tl.cuts.forEach((c, i) => { c.pos = i; });
  }
  return true;
}
