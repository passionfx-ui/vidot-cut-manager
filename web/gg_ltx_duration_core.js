/** LTX video length limits for Queue / Make Video (keep in sync with gg_ltx.py). */

export const LTX_VIDEO_MAX_SEC = 10;

export const VIDEO_TOO_LONG_MSG =
  "Video too long for this model (max 10 s). Shorten the cut on the timeline and try again.";

/** @param {number} sec effective cut length in seconds */
export function videoTooLongForLtx(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return false;
  return n > LTX_VIDEO_MAX_SEC + 1e-6;
}

/** @param {number} sec */
export function videoTooLongMessage(sec) {
  return videoTooLongForLtx(sec) ? VIDEO_TOO_LONG_MSG : "";
}
