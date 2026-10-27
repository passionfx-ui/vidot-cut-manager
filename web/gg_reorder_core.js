import { moveCuts } from "./gg_cuts_core.js";

/** @param {{ cuts: { id: string }[], groups?: object[] }} tl */
export function snapshotOrderGroups(tl) {
  if (!tl) return null;
  return {
    order: tl.cuts.map((c) => c.id),
    groups: JSON.parse(JSON.stringify(tl.groups || [])),
  };
}

function cloneGroups(groups) {
  return (groups || []).map((g) => ({ ...g, cut_ids: [...(g.cut_ids || [])] }));
}

/** @param {string[]} order @param {{ id: string, cut_ids: string[] }[]} groups */
function membershipMap(groups) {
  const m = new Map();
  for (const g of groups || []) {
    for (const id of g.cut_ids || []) m.set(id, g.id);
  }
  return m;
}

function groupIdForCut(order, groups, cutId) {
  const m = membershipMap(groups);
  return m.get(cutId) ?? null;
}

/**
 * @param {string[]} order
 * @param {string[]} ids selected cut ids (any order)
 */
export function canMoveUp(order, ids) {
  const set = new Set(ids);
  const indices = order.map((id, i) => (set.has(id) ? i : -1)).filter((i) => i >= 0);
  if (!indices.length) return false;
  return Math.min(...indices) > 0;
}

/** @param {string[]} order @param {string[]} ids */
export function canMoveDown(order, ids) {
  const set = new Set(ids);
  const indices = order.map((id, i) => (set.has(id) ? i : -1)).filter((i) => i >= 0);
  if (!indices.length) return false;
  return Math.max(...indices) < order.length - 1;
}

/**
 * Step selected cuts one position up (-1) or down (+1) in timeline order.
 * Crossing a scene boundary assigns the neighbouring scene at that edge (via moveCuts toGroupId).
 *
 * @param {string[]} order
 * @param {object[]} groups
 * @param {string[]} ids
 * @param {-1|1} dir
 * @returns {{ order: string[], groups: object[], changed: boolean }}
 */
export function stepMove(order, groups, ids, dir) {
  const grps = cloneGroups(groups);
  const ord = [...order];
  const moveSet = new Set(ids);
  const moving = ord.filter((id) => moveSet.has(id));
  if (!moving.length) {
    return { order: ord, groups: grps, changed: false };
  }
  const indices = moving.map((id) => ord.indexOf(id)).filter((i) => i >= 0);
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);

  if (dir < 0) {
    if (minIdx <= 0) return { order: ord, groups: grps, changed: false };
    const neighborId = ord[minIdx - 1];
    const rest = ord.filter((id) => !moveSet.has(id));
    const toIndex = rest.indexOf(neighborId);
    const toGroupId = groupIdForCut(ord, grps, neighborId);
    const r = moveCuts(ord, grps, moving, { toIndex, toGroupId });
    const changed = r.order.some((id, i) => id !== ord[i]);
    return { ...r, changed };
  }

  if (dir > 0) {
    if (maxIdx >= ord.length - 1) return { order: ord, groups: grps, changed: false };
    const neighborId = ord[maxIdx + 1];
    const rest = ord.filter((id) => !moveSet.has(id));
    const toIndex = rest.indexOf(neighborId) + 1;
    const toGroupId = groupIdForCut(ord, grps, neighborId);
    const r = moveCuts(ord, grps, moving, { toIndex, toGroupId });
    const changed = r.order.some((id, i) => id !== ord[i]);
    return { ...r, changed };
  }

  return { order: ord, groups: grps, changed: false };
}

/**
 * Move cuts to the end of a scene (or end of ungrouped list when sceneIdOrNull is null).
 *
 * @param {string[]} order
 * @param {object[]} groups
 * @param {string[]} ids
 * @param {string|null} sceneIdOrNull
 */
export function moveToScene(order, groups, ids, sceneIdOrNull) {
  const grps = cloneGroups(groups);
  const ord = [...order];
  const moveSet = new Set(ids);
  const moving = ord.filter((id) => moveSet.has(id));
  if (!moving.length) {
    return { order: ord, groups: grps, changed: false };
  }

  const mem = membershipMap(grps);
  const targetGid = sceneIdOrNull || null;

  let toIndex = ord.length;
  if (targetGid) {
    let lastInScene = -1;
    ord.forEach((id, i) => {
      if (mem.get(id) === targetGid) lastInScene = i;
    });
    if (lastInScene >= 0) {
      const restBefore = ord.slice(0, lastInScene + 1).filter((id) => !moveSet.has(id)).length;
      toIndex = restBefore;
    } else {
      const g = grps.find((x) => x.id === targetGid);
      if (!g) return { order: ord, groups: grps, changed: false };
      toIndex = ord.filter((id) => !moveSet.has(id)).length;
    }
  } else {
    let lastUngrouped = -1;
    ord.forEach((id, i) => {
      if (!mem.get(id)) lastUngrouped = i;
    });
    if (lastUngrouped >= 0) {
      const restBefore = ord.slice(0, lastUngrouped + 1).filter((id) => !moveSet.has(id)).length;
      toIndex = restBefore;
    } else {
      toIndex = ord.filter((id) => !moveSet.has(id)).length;
    }
  }

  const r = moveCuts(ord, grps, moving, { toIndex, toGroupId: targetGid });
  const changed =
    r.order.some((id, i) => id !== ord[i]) || JSON.stringify(r.groups) !== JSON.stringify(grps);
  return { ...r, changed };
}

/**
 * @param {{ windowMs?: number }} opts
 */
export function createUndoBurst({ windowMs = 1500 } = {}) {
  let restore = null;
  let lastAt = 0;
  return {
    /**
     * @param {{ order: string[], groups: object[] }|null} snapshot state before a move
     * @param {number} [now]
     * @returns {{ order: string[], groups: object[] }|null} snapshot to restore on Undo
     */
    push(snapshot, now = Date.now()) {
      if (!snapshot) return restore;
      if (!restore || now - lastAt > windowMs) restore = snapshot;
      lastAt = now;
      return restore;
    },
    reset() {
      restore = null;
      lastAt = 0;
    },
    peek() {
      return restore;
    },
  };
}
