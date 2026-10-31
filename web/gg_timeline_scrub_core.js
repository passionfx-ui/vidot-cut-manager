/** Timeline scrub: map playhead position to source time / animated frame index (pure, no DOM). */

import { isAnimatedImage } from "./gg_missing_media_core.js";

/**
 * Map a viewport X to timeline seconds using the current layout of the scroll inner.
 * @param {number} clientX
 * @param {{ getBoundingClientRect?: () => DOMRectReadOnly }|null|undefined} innerEl `.gg-tl-inner` (or ruler)
 * @param {number} px pixels per second
 */
export function timelineSecFromClientX(clientX, innerEl, px) {
  const rate = Number(px) || 1;
  if (!innerEl || typeof innerEl.getBoundingClientRect !== "function") return 0;
  const rect = innerEl.getBoundingClientRect();
  return (Number(clientX) - rect.left) / rate;
}

/**
 * Source media time (seconds) for a point inside a trimmed clip.
 * @param {{ clipIn?: number, localSec?: number }} p
 */
export function sourceTimeAtClip(p) {
  return Math.max(0, (Number(p.clipIn) || 0) + (Number(p.localSec) || 0));
}

/**
 * Frame index (0-based) to show for an animated clip at a timeline position.
 * @param {{
 *   localSec?: number,
 *   clipIn?: number,
 *   clipSec?: number,
 *   frameCount?: number,
 *   sourceSeconds?: number|null,
 *   srcDur?: number|null,
 * }} p
 */
export function scrubFrameIndex(p) {
  const frames = Math.max(1, Math.floor(Number(p.frameCount) || 0));
  const t = sourceTimeAtClip(p);
  const dur = positive(p.sourceSeconds) ?? positive(p.srcDur);
  if (dur != null) {
    const idx = Math.floor((t / dur) * frames);
    return clampFrame(idx, frames);
  }
  const clipSec = positive(p.clipSec);
  if (clipSec != null) {
    const local = Math.max(0, Number(p.localSec) || 0);
    const idx = Math.floor((local / clipSec) * frames);
    return clampFrame(idx, frames);
  }
  return 0;
}

/**
 * Pick frame from cumulative ANMF durations (ms). Falls back to even split when durations missing.
 * @param {{
 *   localSec?: number,
 *   clipIn?: number,
 *   clipSec?: number,
 *   sourceSeconds?: number|null,
 *   srcDur?: number|null,
 *   durationsMs?: number[]|null,
 *   frameCount?: number,
 * }} p
 */
export function scrubFrameIndexFromDurations(p) {
  const durations = p.durationsMs;
  if (!Array.isArray(durations) || durations.length < 1) {
    return scrubFrameIndex(p);
  }
  const frames = durations.length;
  const totalMs = durations.reduce((a, b) => a + (Number(b) || 0), 0);
  if (totalMs <= 0) return scrubFrameIndex({ ...p, frameCount: frames });

  const t = sourceTimeAtClip(p);
  let targetMs = null;
  const durSec = positive(p.sourceSeconds) ?? positive(p.srcDur);
  if (durSec != null) {
    targetMs = Math.min(totalMs - 1e-6, Math.max(0, (t / durSec) * totalMs));
  } else {
    const clipSec = positive(p.clipSec);
    if (clipSec != null) {
      const local = Math.max(0, Number(p.localSec) || 0);
      targetMs = Math.min(totalMs - 1e-6, Math.max(0, (local / clipSec) * totalMs));
    }
  }
  if (targetMs == null) return scrubFrameIndex({ ...p, frameCount: frames });

  let acc = 0;
  for (let i = 0; i < durations.length; i++) {
    acc += Number(durations[i]) || 0;
    if (targetMs < acc) return i;
  }
  return frames - 1;
}

/**
 * Animated scrub index using metadata + optional decoded cache (no default frameCount of 1).
 * @param {{
 *   localSec?: number,
 *   clipIn?: number,
 *   clipSec?: number,
 *   sourceSeconds?: number|null,
 *   srcDur?: number|null,
 *   mediaFrames?: number,
 *   cacheFrameCount?: number,
 *   durationsMs?: number[]|null,
 * }} p
 * @returns {number|null}
 */
export function animatedScrubFrameIndex(p) {
  const mediaFc = Math.floor(Number(p.mediaFrames) || 0);
  const cacheFc = Math.floor(Number(p.cacheFrameCount) || 0);
  const durations = p.durationsMs;
  const fc = mediaFc > 0 ? mediaFc : cacheFc > 0 ? cacheFc : durations?.length || 0;
  if (fc <= 0) return null;

  const base = {
    localSec: p.localSec,
    clipIn: p.clipIn,
    clipSec: p.clipSec,
    sourceSeconds: p.sourceSeconds,
    srcDur: p.srcDur,
    frameCount: fc,
  };
  if (Array.isArray(durations) && durations.length >= 2) {
    return scrubFrameIndexFromDurations({ ...base, durationsMs: durations });
  }
  return scrubFrameIndex(base);
}

/** Preview frame number for real `<video>` after seek (timeline uses 24 fps display). */
export function videoPreviewFrameIndex(currentTime, fps = 24) {
  const t = Number(currentTime) || 0;
  const f = Number(fps) || 24;
  return Math.max(0, Math.round(t * f));
}

function positive(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function clampFrame(idx, frames) {
  return Math.min(frames - 1, Math.max(0, idx | 0));
}

/**
 * Animated clip viewer mode: decoded canvas synced to playhead (paused, scrubbing, and playback).
 * Export view uses separate rendering ("none" here).
 * @returns {"canvas"|"none"}
 */
export function animatedViewerMode(media, playing, exportView, scrubbing) {
  if (exportView || !isAnimatedImage(media)) return "none";
  return "canvas";
}

/**
 * Video sync while the user scrubs the ruler (always chase `want`, even during `seeking`).
 * @param {Parameters<import("./gg_playback_core.js").decideVideoSync>[0] & { scrubbing?: boolean }} p
 */
export function decideVideoSyncScrub(p) {
  const want = Number(p.want) || 0;
  const current = Number(p.current) || 0;
  const paused = !!p.paused;

  if (!p.scrubbing) {
    return null;
  }

  let seekTo = null;
  if (Math.abs(current - want) > 0.001) {
    seekTo = want;
  }
  return { seekTo, play: false, pause: !paused };
}

/** Attribute value for tests (`data-gg-frame`); empty string when not applicable. */
export function previewFrameAttr(frameIndex) {
  if (frameIndex == null || !Number.isFinite(Number(frameIndex))) return "";
  return String(Math.max(0, frameIndex | 0));
}
