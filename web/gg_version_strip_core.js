/** Version row below the Shots icon row: the selected cut's versions, newest on the left (no DOM). */

import { versionRepState } from "./gg_cuts_core.js";

export const SET_BEST_LABEL = "Set as Best";
export const BEST_TIP = "Best (set by you)";
export const SET_BEST_TIP = "Set as Best";
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
  if (!v?.id || v.kind !== "video" || v.missing) return false;
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
        starTitle: rep === "manual" ? BEST_TIP : SET_BEST_TIP,
      };
    });
}

/** Right-click menu for one row thumbnail. Best is only ever set, never cleared (same as the cut panel). */
export function versionStripMenuItems(row) {
  const best = !!row?.best;
  return [{ key: "best", label: SET_BEST_LABEL, disabled: best, title: best ? "Already Best" : "" }];
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
