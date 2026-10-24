/**
 * Cut management helpers (pure logic, no DOM).
 */

import { cutStage } from "./gg_progress_core.js";

/** @param {number} n */
export function formatCutNumber(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return String(v).padStart(3, "0");
}

/** @param {{ planned_sec?: number|null, sec?: number }} cut */
export function computeEffectiveSec(cut) {
  const planned = cut?.planned_sec;
  if (planned != null && Number.isFinite(planned)) return Number(planned);
  const sec = cut?.sec;
  if (sec != null && Number.isFinite(sec)) return Number(sec);
  return 0;
}

/**
 * @param {{ planned_sec?: number|null, sec?: number, end_card?: boolean }} cut
 * @param {{ limit?: number }} [opts]
 */
export function lengthWarning(cut, opts = {}) {
  const limit = opts.limit ?? 3;
  if (cut?.end_card) return null;
  const sec = computeEffectiveSec(cut);
  if (sec > limit) {
    return {
      kind: "over3s",
      sec,
      limit,
      message: `Over ${limit} s (short-form rule)`,
    };
  }
  return null;
}

/**
 * @param {string[]} order Global timeline order (cut ids).
 * @param {{ id: string, name?: string, cut_ids: string[], collapsed?: boolean }[]} groups
 * @param {string} cutId
 * @param {{ toIndex: number, toGroupId?: string|null }} target
 */
export function moveCut(order, groups, cutId, target) {
  const ord = [...order];
  const fromIdx = ord.indexOf(cutId);
  if (fromIdx === -1) {
    return { order: ord, groups: groups.map((g) => ({ ...g, cut_ids: [...g.cut_ids] })) };
  }
  ord.splice(fromIdx, 1);
  const insertAt = Math.max(0, Math.min(target.toIndex, ord.length));
  ord.splice(insertAt, 0, cutId);

  const grps = groups.map((g) => ({ ...g, cut_ids: [...g.cut_ids] }));
  const membership = new Map();
  for (const g of grps) {
    for (const id of g.cut_ids) membership.set(id, g.id);
  }
  const toGroupId = target.toGroupId;
  if (toGroupId == null || toGroupId === "") {
    membership.delete(cutId);
  } else {
    membership.set(cutId, toGroupId);
  }
  for (const g of grps) {
    g.cut_ids = ord.filter((id) => membership.get(id) === g.id);
  }
  return { order: ord, groups: grps };
}

function versionIndexByCreation(versionsList, versionId) {
  const list = Array.isArray(versionsList) ? [...versionsList] : [];
  list.sort((a, b) => {
    const ca = a?.created ?? 0;
    const cb = b?.created ?? 0;
    if (ca !== cb) return ca - cb;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  });
  const idx = list.findIndex((v) => v && v.id === versionId);
  return idx >= 0 ? idx + 1 : 1;
}

function versionLabel(versionsList, versionId) {
  const n = versionIndexByCreation(versionsList, versionId);
  return `v${String(n).padStart(2, "0")}`;
}

function hasBestPick(cut) {
  return cutStage(cut).best;
}

/**
 * @param {{ cuts?: object[], project?: object }} timeline
 */
export function finalCutList(timeline) {
  const cuts = Array.isArray(timeline?.cuts) ? timeline.cuts : [];
  const items = [];
  const missingBest = [];
  const warnings = [];
  let totalSec = 0;

  for (const cut of cuts) {
    if (!hasBestPick(cut)) {
      missingBest.push(cut.id);
      continue;
    }
    const pick = cut.pick;
    const sec = computeEffectiveSec(cut);
    totalSec += sec;
    const warn = lengthWarning(cut);
    if (warn) warnings.push({ cutId: cut.id, ...warn });
    items.push({
      cutId: cut.id,
      number: cut.number ?? 0,
      name: cut.name ?? "",
      sceneName: cut.group_name || cut.scene || "",
      versionId: pick,
      sec,
      versionLabel: versionLabel(cut.versions_list, pick),
    });
  }

  return { items, totalSec, missingBest, warnings };
}

/**
 * @param {object[]} cuts
 * @param {{ needsRedoOnly?: boolean }} [opts]
 */
export function filterCuts(cuts, opts = {}) {
  const arr = Array.isArray(cuts) ? cuts : [];
  if (!opts.needsRedoOnly) return [...arr];
  return arr.filter((c) => c && c.needs_redo === true);
}

/** @param {string} part */
export function sanitizeNamePart(part) {
  if (part == null) return "";
  return String(part)
    .trim()
    .replace(/[^\w\u0080-\uFFFF-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

/**
 * @param {{ number?: number, scene_index?: number }} cut
 * @param {{ scene_index?: number }|null} [scene]
 * @param {number} [versionIndex] 1-based version position (creation order)
 */
export function fileBaseName(cut, scene, versionIndex) {
  const sceneIdx = cut?.scene_index ?? scene?.scene_index ?? 0;
  const scenePart = `S${String(sceneIdx).padStart(2, "0")}`;
  const numPart = formatCutNumber(cut?.number ?? 0);
  const vIdx = Math.max(1, Math.floor(Number(versionIndex) || 1));
  const verPart = `v${String(vIdx).padStart(2, "0")}`;
  return `${scenePart}_${numPart}_${verPart}`;
}

function parseYmd(s) {
  if (!s || typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function utcToday(today) {
  if (today instanceof Date && !Number.isNaN(today.getTime())) {
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * @param {{ cuts?: object[], project?: { due_date?: string|null } }} timeline
 * @param {Date|string} [today]
 */
export function projectCompletion(timeline, today) {
  const cuts = Array.isArray(timeline?.cuts) ? timeline.cuts : [];
  const total = cuts.length;
  let done = 0;
  for (const c of cuts) {
    if (hasBestPick(c)) done++;
  }
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const dueDate = timeline?.project?.due_date ?? null;
  const due = parseYmd(dueDate);
  const t0 = utcToday(today);
  let daysLeft = null;
  let overdue = false;
  if (due) {
    const ms = due.getTime() - t0.getTime();
    daysLeft = Math.round(ms / 86400000);
    overdue = daysLeft < 0;
  }
  return { done, total, percent, dueDate, daysLeft, overdue };
}
