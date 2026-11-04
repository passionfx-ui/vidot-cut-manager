/** Queue mode (Image / Video / Auto): per-cut job planning from the shown take and mode. A Best take does not block a new take. Pure, no DOM. */

import { cutHasStartImage, isStillVersion, stripSelectedVid } from "./gg_version_strip_core.js";

export const QUEUE_MODE_LS_KEY = "gonggan-cut.queueMode";
export const QUEUE_MODES = ["image", "video", "auto"];
export const QUEUE_MODE_LABELS = { image: "Image", video: "Video", auto: "Auto" };
export const QUEUE_MODE_DEFAULT = "auto";

export function normalizeQueueMode(mode) {
  return QUEUE_MODES.includes(mode) ? mode : QUEUE_MODE_DEFAULT;
}

export function loadQueueMode(localStorage) {
  return normalizeQueueMode(localStorage?.getItem?.(QUEUE_MODE_LS_KEY) || "");
}

export function saveQueueMode(localStorage, mode) {
  localStorage?.setItem?.(QUEUE_MODE_LS_KEY, normalizeQueueMode(mode));
}

/**
 * Options template copied once into a new cut.
 * Video when that cut is a video cut, or when the Image/Video/Auto toggle is Video.
 * @param {string | null | undefined} queueMode
 * @param {string | null | undefined} cutKind
 * @returns {"image" | "video"}
 */
export function templateKindForNewCut(queueMode, cutKind) {
  if (queueMode === "video" || cutKind === "video") return "video";
  return "image";
}

export function queueStripSelectedVid(cut, { picked = "", open = "" } = {}) {
  const ids = (Array.isArray(cut?.versions_list) ? cut.versions_list : [])
    .filter((v) => v && v.id)
    .map((v) => v.id);
  for (const id of [picked, open, cut?.display]) {
    if (id && ids.includes(id)) return id;
  }
  return "";
}

function versionById(cut, vid) {
  if (!vid) return null;
  return (cut?.versions_list || []).find((v) => v && v.id === vid) || null;
}

export function queueCutJob(cut, mode, ctx = {}) {
  const m = normalizeQueueMode(mode);
  // The row's shown take, including Best when that is what the row is showing.
  // A Best take does not block a new take.
  const selVid = stripSelectedVid(cut, ctx) || queueStripSelectedVid(cut, ctx);
  const ver = versionById(cut, selVid);
  const still = ver && isStillVersion(ver);
  const video = ver && ver.kind === "video";

  if (m === "image") return { type: "job", job: "image" };

  if (m === "video") {
    if (!cutHasStartImage(cut)) return { type: "skip", reason: "no_image" };
    if (still) return { type: "job", job: "video", selectedVid: selVid };
    if (video) return { type: "job", job: "regen", selectedVid: selVid };
    return { type: "skip", reason: "no_image" };
  }

  if (still) return { type: "job", job: "video", selectedVid: selVid };
  if (video) return { type: "job", job: "regen", selectedVid: selVid };
  return { type: "job", job: "image" };
}

const emptyCounts = () => ({ video: 0, regen: 0, image: 0, skipBest: 0, skipNoImage: 0 });

export function queueBatchPlan(cuts, mode, contextForCut) {
  const counts = emptyCounts();
  const jobs = [];
  for (const cut of Array.isArray(cuts) ? cuts : []) {
    if (!cut?.id) continue;
    const r = queueCutJob(cut, mode, typeof contextForCut === "function" ? contextForCut(cut.id) : {});
    if (r.type === "skip") {
      if (r.reason === "best") counts.skipBest++;
      else counts.skipNoImage++;
      continue;
    }
    counts[r.job]++;
    jobs.push({ cut_id: cut.id, job: r.job, selected_vid: r.selectedVid || "" });
  }
  return { jobs, counts, actionable: jobs.length };
}

export function queuePlanTooltip(counts) {
  const c = counts || emptyCounts();
  const parts = [];
  if (c.video) parts.push(`${c.video} Video`);
  if (c.regen) parts.push(`${c.regen} Regen`);
  if (c.image) parts.push(`${c.image} Image`);
  if (c.skipBest) parts.push(`${c.skipBest} skipped (Best)`);
  if (c.skipNoImage) parts.push(`${c.skipNoImage} skipped (no image)`);
  return parts.join(" · ");
}
