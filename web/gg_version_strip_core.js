/** Version row below the Shots icon row: a fixed header (Best, Make Video, Import) over the selected cut's
 * versions, newest on the left (no DOM). */

import { versionRepState } from "./gg_cuts_core.js";

export const SET_BEST_LABEL = "Set as Best";
export const IMPORT_TILE_TIP = "Import image or video";
export const IMPORT_MENU_LABEL = "Import image or video…";
export const IMPORT_ACCEPT = "image/*,video/*";
/** Back-to-newest arrow appears once the row is scrolled right past this many pixels. */
export const NEWEST_BUTTON_MIN_SCROLL = 4;

/** `0:06` style clip length; "" when unknown or not positive. */
export function formatClipDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return "";
  const s = Math.max(1, Math.round(n));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Known length of a video version: its own `seconds`, else the cut media's (the current version), else a
 * length read in the browser (`probed`: Map vid -> seconds). 0 when unknown.
 */
export function versionSeconds(v, cut, probed) {
  const own = Number(v?.seconds);
  if (Number.isFinite(own) && own > 0) return own;
  const media = cut?.media;
  const ms = Number(media?.seconds);
  if (media && media.id === v?.id && Number.isFinite(ms) && ms > 0) return ms;
  const p = Number(probed?.get?.(v?.id));
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/** A video version whose length is still unknown and whose file exists (read its metadata once). */
export function needsDurationProbe(v, cut, probed) {
  if (!v?.id || v.kind !== "video" || v.animated || v.missing) return false;
  if (probed?.has?.(v.id)) return false;
  return versionSeconds(v, cut, probed) <= 0;
}

/**
 * Row items left to right. `versions_list` already comes newest first from both stores, so the order
 * is kept as is. best = Best set by the user; latest = no Best, so this (newest) version is current.
 */
export function versionStripRows(cut, probed) {
  return (Array.isArray(cut?.versions_list) ? cut.versions_list : [])
    .filter((v) => v && v.id)
    .map((v) => {
      const rep = versionRepState(cut, v.id);
      const video = v.kind === "video";
      return {
        id: v.id,
        video,
        missing: !!v.missing,
        best: rep === "manual",
        latest: rep === "implicit",
        duration: video ? formatClipDuration(versionSeconds(v, cut, probed)) : "",
        state: rep === "manual" ? "Best" : rep === "implicit" ? "Latest (no Best set)" : "",
      };
    });
}

/**
 * Selected version of the row: the thumbnail clicked last for this cut (`picked`), else the one open in the
 * canvas (`open`), else the current one (Best, else newest). "" when the cut has no versions.
 */
export function stripSelectedVid(cut, { picked = "", open = "" } = {}) {
  const ids = (Array.isArray(cut?.versions_list) ? cut.versions_list : []).filter((v) => v && v.id).map((v) => v.id);
  for (const id of [picked, open, cut?.pick, cut?.media?.id, ids[0]]) {
    if (id && ids.includes(id)) return id;
  }
  return "";
}

/** A still image version whose file exists (video and animated image versions never count). */
export function isStillVersion(v) {
  return !!v && !!v.id && v.kind !== "video" && !v.animated && !v.missing;
}

export const BEST_BUTTON_LABEL = "Best";
export const MAKE_VIDEO_LABEL = "Make Video";
export const IMPORT_BUTTON_LABEL = "Import";
export const MAKE_VIDEO_TIP = "Make Video: the selected image is the start image of the project's Video template; the video is added as a new version";

/** Header Best: toggles Best on the selected version (pressed when it is the Best). */
export function bestButtonState({ cut, vid } = {}) {
  if (!cut) return { disabled: true, pressed: false, title: "Select a cut first" };
  if (!vid) return { disabled: true, pressed: false, title: "This cut has no versions yet" };
  const on = cut.pick === vid;
  return { disabled: false, pressed: on, title: on ? "Best (click to clear)" : "Set the selected version as Best" };
}

/** Header Make Video: native projects, the selected version is a still image, no SDK job starting. */
export function makeVideoButtonState({ cut, version, native, busy } = {}) {
  if (!native) return { disabled: true, title: "Make Video is not available for read-only (imported) projects" };
  if (!cut) return { disabled: true, title: "Select a cut first" };
  if (!version) return { disabled: true, title: "Select an image version" };
  if (version.missing) return { disabled: true, title: "The selected version's file is missing" };
  if (!isStillVersion(version)) return { disabled: true, title: "Select an image version (the selected one is a video)" };
  if (busy) return { disabled: true, title: "Busy, try again in a moment" };
  return { disabled: false, title: MAKE_VIDEO_TIP };
}

export const MAKE_VIDEO_OLD_SERVER = "Restart ComfyUI to use Make Video with the selected image.";

/** Make Video dry run: the plan must start from the requested image (a server without `start_vid` picks Best first). */
export function makeVideoPlanOk(plan, startVid) {
  return !startVid || plan?.start_version === startVid;
}

/**
 * The three header buttons above the row (Best, Make Video, Import) for the selected cut and version.
 * @param {{ cut?: object|null, vid?: string, native?: boolean, sdkBusy?: boolean, importBusy?: boolean }} ctx
 */
export function stripHeaderState({ cut = null, vid = "", native = false, sdkBusy = false, importBusy = false } = {}) {
  const version = (Array.isArray(cut?.versions_list) ? cut.versions_list : []).find((v) => v && v.id && v.id === vid) || null;
  return {
    best: bestButtonState({ cut, vid: version ? vid : "" }),
    video: makeVideoButtonState({ cut, version, native, busy: sdkBusy }),
    import: importButtonState({ hasCut: !!cut, native, busy: importBusy }),
  };
}

/** Right-click menu for one row thumbnail. Best is only ever set, never cleared (same as the cut panel). */
export function versionStripMenuItems(row) {
  const best = !!row?.best;
  return [{ key: "best", label: SET_BEST_LABEL, disabled: best, title: best ? "Already Best" : "" }];
}

/** Header Import button (and the cut menu item): native projects with a selected cut only. */
export function importButtonState({ hasCut, native, busy } = {}) {
  if (!native) return { disabled: true, title: "Import is not available for read-only (imported) projects" };
  if (!hasCut) return { disabled: true, title: "Select a cut to import" };
  if (busy) return { disabled: true, title: "Importing…" };
  return { disabled: false, title: IMPORT_TILE_TIP };
}

/** The cut has a still image version to start a video from (right-click Image to Video: the server picks Best,
 * else selected, else newest; video and animated image versions never count). */
export function cutHasStartImage(cut) {
  return (Array.isArray(cut?.versions_list) ? cut.versions_list : []).some(isStillVersion);
}

/** Show the left arrow (back to newest) only when the row is scrolled right. */
export function showNewestButton(scrollLeft) {
  return Number(scrollLeft) > NEWEST_BUTTON_MIN_SCROLL;
}

/** Horizontal scroll after a repaint: kept for the same cut, newest (left edge) for another cut. */
export function stripScrollLeft(prev, cutId) {
  return prev && prev.cutId && prev.cutId === cutId ? Math.max(0, Number(prev.left) || 0) : 0;
}

/** Vertical mouse wheel scrolls the row sideways; a sideways (trackpad) wheel is left to the browser. */
export function wheelToScrollLeft(deltaX, deltaY) {
  const dx = Number(deltaX) || 0;
  const dy = Number(deltaY) || 0;
  return Math.abs(dy) > Math.abs(dx) ? dy : 0;
}
