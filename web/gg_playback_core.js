/** Video sync decisions for timeline viewer (pure, no DOM). */

/**
 * @param {{
 *   want: number,
 *   current: number,
 *   duration: number,
 *   playing: boolean,
 *   paused: boolean,
 *   seeking: boolean,
 *   readyState: number,
 *   lastSeekAt: number,
 *   now: number,
 * }} p
 * @returns {{ seekTo: number|null, play: boolean, pause: boolean }}
 */
export function decideVideoSync(p) {
  const want = Number(p.want) || 0;
  const current = Number(p.current) || 0;
  const duration = Number(p.duration);
  const playing = !!p.playing;
  const paused = !!p.paused;
  const seeking = !!p.seeking;
  const readyState = Number(p.readyState) || 0;
  const lastSeekAt = Number(p.lastSeekAt) || 0;
  const now = Number(p.now) || 0;

  let seekTo = null;
  let play = false;
  let pause = false;

  if (Number.isFinite(duration) && duration > 0 && want >= duration - 0.04) {
    pause = !paused;
    return { seekTo, play, pause };
  }

  if (seeking) {
    return { seekTo, play, pause };
  }

  const drift = Math.abs(current - want);
  const scrubTol = 0.02;
  const playTol = 0.15;
  const canSeekByDrift = !playing || readyState >= 3 || !lastSeekAt;
  const tol = playing ? playTol : scrubTol;

  if (canSeekByDrift && drift > tol) {
    const rateLimitMs = 400;
    if (!playing || now - lastSeekAt >= rateLimitMs) {
      seekTo = want;
    }
  }

  if (playing && paused && readyState >= 2) {
    play = true;
  }
  if (!playing && !paused) {
    pause = true;
  }

  return { seekTo, play, pause };
}

/**
 * Invalidate in-flight `HTMLMediaElement.play()` promises (timeline transport `play` object).
 *
 * @param {{ gen?: number, on?: boolean }} playState
 * @returns {number}
 */
export function bumpPlaybackGen(playState) {
  playState.gen = (playState.gen | 0) + 1;
  return playState.gen;
}

/**
 * If playback was stopped/paused while `play()` was pending, keep the element paused.
 *
 * @param {{ pause?: () => void }|null|undefined} media
 * @param {number} gen generation captured before `play()`
 * @param {{ gen?: number, on?: boolean }} playState
 */
export function guardResolvedPlay(media, gen, playState) {
  if (!media) return;
  if (playState.gen === gen && playState.on) return;
  try {
    media.pause?.();
  } catch (_) {}
}

/**
 * Start playback only when the generation still matches; guard the async resolve.
 *
 * @param {{ play?: () => Promise<void>|void, pause?: () => void }|null|undefined} media
 * @param {number} gen
 * @param {{ gen?: number, on?: boolean }} playState
 */
export function scheduleVideoPlay(media, gen, playState) {
  if (!media || !playState.on || playState.gen !== gen) return;
  let p;
  try {
    p = media.play?.();
  } catch (_) {
    return;
  }
  if (p && typeof p.then === "function") {
    p.then(() => guardResolvedPlay(media, gen, playState)).catch(() => {});
  }
}

/**
 * Pause every timeline viewer / track video and audio element (does not remove sources).
 *
 * @param {{ vid?: HTMLVideoElement, next?: HTMLVideoElement, box?: ParentNode }|null} viewer
 * @param {ParentNode|null} [scope]
 */
export function pauseAllTimelineMedia(viewer, scope) {
  const seen = new Set();
  const pause = (el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    try {
      el.pause();
    } catch (_) {}
  };
  if (viewer) {
    pause(viewer.vid);
    pause(viewer.next);
    if (viewer.box) viewer.box.querySelectorAll("video, audio").forEach(pause);
  }
  scope?.querySelectorAll?.("video, audio")?.forEach(pause);
}
