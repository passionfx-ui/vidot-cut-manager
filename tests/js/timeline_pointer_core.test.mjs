import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLAYHEAD_HIT_HALF_PX,
  isPlayheadPointerHit,
  playheadClientX,
  routeTimelineClipPointerDown,
} from "../../web/gg_timeline_pointer_core.js";

describe("playheadClientX / isPlayheadPointerHit", () => {
  it("matches e2e playhead over clip (px≈48, head x≈985)", () => {
    const innerLeft = 0;
    const px = 48;
    const playheadSec = 985 / px;
    assert.equal(playheadClientX(innerLeft, playheadSec, px), 985);
    assert.ok(isPlayheadPointerHit(985, innerLeft, playheadSec, px));
    assert.ok(isPlayheadPointerHit(985 - PLAYHEAD_HIT_HALF_PX, innerLeft, playheadSec, px));
    assert.ok(isPlayheadPointerHit(985 + PLAYHEAD_HIT_HALF_PX, innerLeft, playheadSec, px));
    assert.equal(isPlayheadPointerHit(985 + PLAYHEAD_HIT_HALF_PX + 1, innerLeft, playheadSec, px), false);
  });
});

describe("routeTimelineClipPointerDown", () => {
  it("pointer at playhead x over a clip → scrub, not clipDrag", () => {
    const innerLeft = 100;
    const px = 48;
    const playheadSec = 18.4375;
    const headX = playheadClientX(innerLeft, playheadSec, px);
    assert.equal(
      routeTimelineClipPointerDown({
        clientX: headX,
        innerLeft,
        playheadSec,
        px,
      }),
      "scrub",
    );
  });

  it("elsewhere on the same clip → clipDrag", () => {
    const innerLeft = 100;
    const px = 48;
    const playheadSec = 18.4375;
    const headX = playheadClientX(innerLeft, playheadSec, px);
    assert.equal(
      routeTimelineClipPointerDown({
        clientX: headX + PLAYHEAD_HIT_HALF_PX + 20,
        innerLeft,
        playheadSec,
        px,
      }),
      "clipDrag",
    );
  });
});
