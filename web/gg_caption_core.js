/** SRT caption export and caption display helpers (pure, no DOM). */

import { clipAtTime } from "./gg_tl_place_core.js";

/**
 * Caption editor / display text: stored `caption`, or legacy `notes` when caption is empty.
 * The editor is seeded with this, so the first caption edit saves the notes text into `caption`.
 * `notes` is never written or cleared by the UI.
 * @param {{ caption?: string, notes?: string } | null | undefined} cut
 * @returns {string}
 */
export function effectiveCaption(cut) {
  const cap = cut?.caption;
  if (cap != null && String(cap).trim() !== "") return String(cap);
  const notes = cut?.notes;
  if (notes != null && String(notes).trim() !== "") return String(notes);
  return cap != null ? String(cap) : "";
}

/** True when editor text differs from what the card shows (seeded legacy notes alone is not an edit). */
export function captionEditChanged(cut, text) {
  return String(text ?? "") !== effectiveCaption(cut);
}

/** @param {unknown} captionLang */
export function captionFieldPlaceholder(captionLang) {
  return "Caption";
}

/**
 * @param {number} sec
 * @returns {string} HH:MM:SS,mmm (hours may exceed 99)
 */
export function formatSrtTime(sec) {
  let t = Number(sec);
  if (!Number.isFinite(t) || t < 0) t = 0;
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const pad2 = (n) => String(n).padStart(2, "0");
  const pad3 = (n) => String(n).padStart(3, "0");
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(r)}`;
}

function normalizeCaptionText(raw) {
  const lines = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const trimmed = lines.map((l) => l.replace(/\s+$/, ""));
  let start = 0;
  while (start < trimmed.length && !trimmed[start].trim()) start++;
  let end = trimmed.length;
  while (end > start && !trimmed[end - 1].trim()) end--;
  const body = trimmed.slice(start, end);
  const out = [];
  let blankRun = 0;
  for (const line of body) {
    if (!line.trim()) {
      blankRun++;
      if (blankRun <= 1) out.push("");
      continue;
    }
    blankRun = 0;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Build SRT from timeline cuts in order. Timing uses each cut's timeline `sec` (same as
 * playback/export cumulative offsets in gonggan.js cutsNow() order; hidden cuts are already
 * excluded from the timeline payload).
 *
 * @param {{ sec?: number, caption?: string }[]} cuts
 * @returns {string}
 */
export function buildSrt(cuts) {
  const arr = Array.isArray(cuts) ? cuts : [];
  let t = 0;
  const blocks = [];
  let n = 0;
  for (const cut of arr) {
    const len = Math.max(0, Number(cut?.sec) || 0);
    const start = t;
    const end = start + len;
    t = end;
    const text = normalizeCaptionText(cut?.caption);
    if (!text.trim()) continue;
    if (end <= start) continue;
    n += 1;
    blocks.push(`${n}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${text}`);
  }
  if (!blocks.length) return "";
  return `${blocks.join("\n\n")}\n`;
}

/**
 * Caption overlaid on the timeline viewer at time t: the caption of the clip under t (same lookup as
 * playback, so gaps and trims match), "" in a gap, on an empty track or for a blank caption.
 * @param {{ start?: number, sec: number, caption?: string }[]} clips track order
 * @param {number} t
 */
export function captionAtTime(clips, t) {
  const { i } = clipAtTime(clips, Number(t) || 0);
  if (i < 0) return "";
  return normalizeCaptionText(clips[i]?.caption);
}

/** @param {string} projectName */
export function srtFileName(projectName) {
  let base = String(projectName ?? "")
    .trim()
    .replace(/[<>:"/\\|?*!\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) base = "captions";
  if (!base.toLowerCase().endsWith(".srt")) base += ".srt";
  return base;
}
