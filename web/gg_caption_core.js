/** SRT caption export (pure, no DOM). */

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
