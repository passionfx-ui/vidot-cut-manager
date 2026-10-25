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
