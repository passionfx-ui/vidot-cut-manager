/** A version whose file is gone on disk is shown and played exactly like a cut with no media. */

/** Clip media for a versions_list row; null when there is no row or its file is missing. */
export function versionMedia(v) {
  if (!v || v.missing) return null;
  return { id: v.id, kind: v.kind, animated: !!v.animated, width: v.width, height: v.height, seconds: v.seconds, model: v.model, source: v.source };
}

/** Animated WebP / GIF / APNG: kind "video" (length, ▶ badge, never a start image) but drawn with <img>, not <video>. */
export function isAnimatedImage(media) {
  return !!media && media.kind === "video" && !!media.animated;
}

/** Media that plays in a <video> element. */
export function playsAsVideo(media) {
  return !!media && media.kind === "video" && !media.animated;
}

/** Viewer blank text for a clip without media (also used when its file fails to load). */
export function noMediaText(label, name) {
  return `${label}. ${name} — no media`;
}

const THUMB_MEDIA_CLASSES = new Set(["gg-thumb-vid", "gg-thumb-img", "gg-thumb-broken", "gg-thumb-empty"]);

/** Classes for the "no media" placeholder replacing a thumb (img/video) that failed to load. */
export function noMediaThumbClass(classList) {
  const keep = [...(classList || [])].filter((c) => c && !THUMB_MEDIA_CLASSES.has(c));
  return [...keep, "gg-thumb-empty"].join(" ");
}
