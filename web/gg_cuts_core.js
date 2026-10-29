/**
 * Cut management helpers (pure logic, no DOM).
 */

import { cutStage } from "./gg_progress_core.js";

/** @param {number} n */
export function formatCutNumber(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return String(v).padStart(3, "0");
}

/** @param {object|null|undefined} cut */
function cutSceneBlockKey(cut) {
  const gid = cut?.group_id;
  if (gid != null && String(gid).trim() !== "") return `g:${String(gid).trim()}`;
  return "u";
}

/**
 * Per-scene display labels (1-1, 1-2, 2-1…) in timeline order.
 * Each consecutive run in the same group is one scene block; each consecutive run of ungrouped cuts is one implicit scene block.
 * @param {{ cuts?: object[] }} timeline
 * @returns {Map<string, { scene: number, cut: number, label: string }>}
 */
export function computeCutLabels(timeline) {
  const cuts = Array.isArray(timeline?.cuts) ? timeline.cuts : [];
  /** @type {Map<string, { scene: number, cut: number, label: string }>} */
  const map = new Map();
  let sceneNum = 0;
  let cutInScene = 0;
  /** @type {string|null} */
  let prevBlock = null;

  for (const cut of cuts) {
    if (!cut?.id) continue;
    const block = cutSceneBlockKey(cut);
    if (prevBlock === null || block !== prevBlock) {
      sceneNum += 1;
      cutInScene = 1;
      prevBlock = block;
    } else {
      cutInScene += 1;
    }
    map.set(cut.id, { scene: sceneNum, cut: cutInScene, label: `${sceneNum}-${cutInScene}` });
  }
  return map;
}

/**
 * @param {object|null|undefined} cut
 * @param {Map<string, { label?: string }>|null|undefined} labels
 */
export function cutDisplayLabel(cut, labels) {
  const id = cut?.id;
  if (id && labels) {
    const entry = labels.get(id);
    if (entry?.label) return entry.label;
  }
  const n = cut?.number ?? (cut?.pos ?? cut?.index ?? 0) + 1;
  return formatCutNumber(n);
}

/** @param {number} sec */
export function formatSecShort(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return "0.0s";
  return `${n.toFixed(1)}s`;
}

/** Base length before timeline trim (planned or Gonggan tl_sec). */
export function cutBaseSec(cut) {
  const planned = cut?.planned_sec;
  if (planned != null && Number.isFinite(planned)) return Number(planned);
  const tl = cut?.tl_sec;
  if (tl != null && Number.isFinite(tl)) return Number(tl);
  const sec = cut?.sec;
  if (sec != null && Number.isFinite(sec)) return Number(sec);
  return 0;
}

/** Timeline playback length (after trim). */
export function cutTimelineSec(cut) {
  const sec = cut?.sec;
  return sec != null && Number.isFinite(sec) ? Number(sec) : 0;
}

/**
 * Still/image clip length after horizontal trim drag (seconds delta).
 * @param {"l"|"r"} side
 * @param {number} startSec
 * @param {number} dxSec
 */
export function trimSecFromDrag(side, startSec, dxSec) {
  if (side === "r") return startSec + dxSec;
  return startSec - dxSec;
}

/** @param {"l"|"r"} side */
export function trimArrowGlyph(side) {
  return side === "r" ? ">" : "<";
}

/**
 * @param {object} cut
 * @returns {{ text: string, title: string }}
 */
export function formatCutHeaderLengths(cut) {
  const orig = cutBaseSec(cut);
  const eff = cutTimelineSec(cut);
  const origLabel = formatSecShort(orig);
  if (Math.abs(orig - eff) > 0.05) {
    const effLabel = formatSecShort(eff);
    return {
      text: `${origLabel} > ${effLabel}`,
      title: `Base ${origLabel}, timeline ${effLabel}`,
    };
  }
  return { text: origLabel, title: origLabel };
}

/**
 * Compact label for the picked/Best version on a cut row header.
 * @param {object} cut
 * @returns {{ text: string, title: string }}
 */
export function formatPickedVersionInfo(cut) {
  const media = cut?.media;
  if (!media || typeof media !== "object" || !media.id) {
    return { text: "", title: "" };
  }
  const pick = cut.pick || media.id;
  const vLabel = versionLabel(cut.versions_list, pick);
  const kind = media.kind || "image";
  const parts = [vLabel, kind];
  if (media.width && media.height) parts.push(`${media.width}x${media.height}`);
  else if (media.model) parts.push(String(media.model));
  const text = parts.join(" · ");
  return { text, title: text };
}

/**
 * How a version relates to the cut's Best: "manual" = user-set pick, "implicit" = no pick so the newest
 * version is current, "" = neither. Best is never automatic.
 * @param {{ pick?: string|null, media?: { id?: string }|null }|null|undefined} cut
 * @param {string} versionId
 * @returns {"manual"|"implicit"|""}
 */
export function versionRepState(cut, versionId) {
  if (!cut || !versionId) return "";
  if (cut.pick) return cut.pick === versionId ? "manual" : "";
  return cut.media?.id === versionId ? "implicit" : "";
}

/** @param {{ planned_sec?: number|null, sec?: number }} cut */
export function computeEffectiveSec(cut) {
  const planned = cut?.planned_sec;
  if (planned != null && Number.isFinite(planned)) return Number(planned);
  const sec = cut?.sec;
  if (sec != null && Number.isFinite(sec)) return Number(sec);
  return 0;
}

/** Placeholder when planned length is unset (aligns with panel length badge, else 3 s). */
export function plannedLenInputPlaceholder(cut) {
  const sec = computeEffectiveSec(cut);
  if (sec > 0) {
    return Number.isInteger(sec) ? String(sec) : sec.toFixed(1);
  }
  return "3";
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

/**
 * @param {string[]} order
 * @param {{ id: string, name?: string, cut_ids: string[], collapsed?: boolean }[]} groups
 * @param {string[]} cutIds ids to move (timeline order)
 * @param {{ toIndex: number, toGroupId?: string|null }} target
 */
export function moveCuts(order, groups, cutIds, target) {
  const moveSet = new Set(cutIds);
  const moving = order.filter((id) => moveSet.has(id));
  if (!moving.length) {
    return { order: [...order], groups: groups.map((g) => ({ ...g, cut_ids: [...g.cut_ids] })) };
  }
  const rest = order.filter((id) => !moveSet.has(id));
  const insertAt = Math.max(0, Math.min(target.toIndex, rest.length));
  const newOrder = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];

  const grps = groups.map((g) => ({ ...g, cut_ids: [...g.cut_ids] }));
  const membership = new Map();
  for (const g of grps) {
    for (const id of g.cut_ids) membership.set(id, g.id);
  }
  const toGroupId = target.toGroupId;
  for (const id of moving) {
    if (toGroupId == null || toGroupId === "") membership.delete(id);
    else membership.set(id, toGroupId);
  }
  for (const g of grps) {
    g.cut_ids = newOrder.filter((id) => membership.get(id) === g.id);
  }
  return { order: newOrder, groups: grps };
}

/**
 * Map viewport pointer Y to Y inside a scrollable shots list wrap (same space as row tops).
 * @param {number} clientY
 * @param {number} wrapTop wrap.getBoundingClientRect().top
 * @param {number} scrollTop wrap.scrollTop
 */
export function clientYToWrapY(clientY, wrapTop, scrollTop) {
  return clientY - wrapTop + scrollTop;
}

/**
 * Scroll delta for auto-scroll while dragging in a vertical list wrap.
 * @param {number} clientY pointer Y in viewport coordinates
 * @param {number} wrapTop wrap.getBoundingClientRect().top
 * @param {number} wrapBottom wrap.getBoundingClientRect().bottom
 * @param {number} [edge] edge zone height in px
 * @param {number} [maxStep] max scroll per animation frame
 * @returns {number} delta to add to scrollTop (negative = scroll up)
 */
export function autoScrollDelta(clientY, wrapTop, wrapBottom, edge = 48, maxStep = 16) {
  const e = Math.max(1, Number(edge) || 48);
  const max = Math.max(1, Number(maxStep) || 16);
  if (clientY < wrapTop) {
    const dist = wrapTop - clientY;
    const t = Math.min(1, (e + dist) / e);
    return -max * t;
  }
  if (clientY > wrapBottom) {
    const dist = clientY - wrapBottom;
    const t = Math.min(1, (e + dist) / e);
    return max * t;
  }
  if (clientY < wrapTop + e) {
    const t = 1 - (clientY - wrapTop) / e;
    return -max * Math.max(0, t);
  }
  if (clientY > wrapBottom - e) {
    const t = 1 - (wrapBottom - clientY) / e;
    return max * Math.max(0, t);
  }
  return 0;
}

/**
 * @param {string[]} order
 * @param {{ id: string, top: number, bottom: number, groupId: string|null }[]} rows
 * @param {number} wrapY pointer Y in wrap content coordinates (see clientYToWrapY)
 */
export function shotsDropTarget(order, rows, wrapY) {
  if (!rows.length) return { toIndex: 0, toGroupId: null, lineY: 0 };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const mid = (r.top + r.bottom) / 2;
    if (wrapY < mid) {
      const idx = order.indexOf(r.id);
      return { toIndex: idx < 0 ? 0 : idx, toGroupId: r.groupId, lineY: r.top };
    }
  }
  const last = rows[rows.length - 1];
  const idx = order.indexOf(last.id);
  return {
    toIndex: idx < 0 ? order.length : idx + 1,
    toGroupId: last.groupId,
    lineY: last.bottom,
  };
}

/** @param {number} sec */
export function formatMinSecDot(sec) {
  const t = Math.max(0, Number(sec) || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const whole = Math.floor(s);
  const tenth = Math.round((s - whole) * 10) % 10;
  const sStr = m > 0 ? String(whole).padStart(2, "0") : String(whole);
  return `${m}:${sStr}.${tenth}`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * @param {{ dueDate?: string|null, daysLeft?: number|null, overdue?: boolean }} comp
 */
export function formatDueDisplay(comp) {
  if (!comp?.dueDate) return { text: "", overdue: false };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(comp.dueDate).trim());
  if (!m) return { text: String(comp.dueDate), overdue: !!comp.overdue };
  const mon = MONTH_SHORT[Number(m[2]) - 1] || m[2];
  const day = Number(m[3]);
  const label = `Due ${mon} ${day}`;
  if (comp.daysLeft == null) return { text: label, overdue: false };
  if (comp.overdue) {
    const d = Math.abs(comp.daysLeft);
    return { text: `${label} · Overdue by ${d} day${d === 1 ? "" : "s"}`, overdue: true };
  }
  const d = comp.daysLeft;
  return { text: `${label} (${d} day${d === 1 ? "" : "s"} left)`, overdue: false };
}

export function versionIndexFromList(versionsList, versionId) {
  return versionIndexByCreation(versionsList, versionId);
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
 * Where to insert a new cut: after the reference cut, in the same scene (or ungrouped).
 * @param {{ timelineCuts: object[], activeCutId?: string|null }} args
 * @returns {{ after: string|null, group: string|null }}
 */
export function addCutTarget({ timelineCuts, activeCutId }) {
  const cuts = Array.isArray(timelineCuts) ? timelineCuts : [];
  let refId =
    activeCutId && cuts.some((c) => c && c.id === activeCutId) ? String(activeCutId) : null;
  if (!refId && cuts.length) {
    const last = cuts[cuts.length - 1];
    if (last?.id) refId = String(last.id);
  }
  if (!refId) return { after: null, group: null };
  const ref = cuts.find((c) => c && c.id === refId);
  const rawGroup = ref?.group_id;
  const group =
    rawGroup != null && String(rawGroup).trim() !== "" ? String(rawGroup).trim() : null;
  return { after: refId, group };
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
