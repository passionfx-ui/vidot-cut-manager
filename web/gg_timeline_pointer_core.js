/** Timeline pointer routing: playhead scrub vs clip drag (pure, no DOM). */

/** Half-width of the playhead scrub hit zone (matches `.gg-head-line::after`, 16px total). */
export const PLAYHEAD_HIT_HALF_PX = 8;

/** Playhead line X in viewport coordinates. */
export function playheadClientX(innerLeft, playheadSec, px) {
  return Number(innerLeft) + Number(playheadSec) * (Number(px) || 1);
}

/** True when clientX is within the playhead scrub hit zone. */
export function isPlayheadPointerHit(clientX, innerLeft, playheadSec, px, hitHalf = PLAYHEAD_HIT_HALF_PX) {
  const headX = playheadClientX(innerLeft, playheadSec, px);
  return Math.abs(Number(clientX) - headX) <= hitHalf;
}

/**
 * Clip-row pointerdown routing used by bindReorder / bindMove.
 * @returns {"scrub"|"clipDrag"}
 */
export function routeTimelineClipPointerDown(p) {
  if (
    isPlayheadPointerHit(
      p.clientX,
      p.innerLeft,
      p.playheadSec,
      p.px,
      p.hitHalf ?? PLAYHEAD_HIT_HALF_PX,
    )
  ) {
    return "scrub";
  }
  return "clipDrag";
}
