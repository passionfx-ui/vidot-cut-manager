/** Timeline clip thumbnail: image vs video (animated WebP/GIF counts as video). */

/** @returns {"video"|"image"|null} */
export function timelineClipMediaType(cut) {
  const kind = cut?.media?.kind;
  if (kind === "video") return "video";
  if (kind === "image") return "image";
  return null;
}

/** @param {"video"|"image"|null} type */
export function timelineClipTypeBadgeLabel(type) {
  if (type === "video") return "VIDEO";
  if (type === "image") return "IMG";
  return "";
}

/** Extra clip classes (empty cuts unchanged). */
export function timelineClipTypeClassSuffix(cut) {
  const t = timelineClipMediaType(cut);
  if (t === "video") return " gg-clip-video gg-clip-type-video";
  if (t === "image") return " gg-clip-type-image";
  return "";
}

/** Corner badge markup; empty string when no media. */
export function timelineClipTypeBadgeHtml(cut, escHtml) {
  const esc = escHtml || ((s) => String(s ?? ""));
  const label = timelineClipTypeBadgeLabel(timelineClipMediaType(cut));
  if (!label) return "";
  const tip = label === "VIDEO" ? "Video clip" : "Image clip";
  return `<span class="gg-clip-type-badge" title="${esc(tip)}">${esc(label)}</span>`;
}

/** Expected badge text for a timeline cut from API data. */
export function expectedTimelineClipBadge(cut) {
  return timelineClipTypeBadgeLabel(timelineClipMediaType(cut));
}
