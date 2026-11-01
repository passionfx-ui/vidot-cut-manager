import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  animatedScrubFrameIndex,
  animatedViewerMode,
  decideVideoSyncScrub,
  edgeScrollSpeed,
  followPlayheadScroll,
  previewFrameAttr,
  scrubFrameIndex,
  scrubFrameIndexFromDurations,
  sourceTimeAtClip,
  timelineSecFromClientX,
  videoPreviewFrameIndex,
} from "../../web/gg_timeline_scrub_core.js";

describe("edgeScrollSpeed", () => {
  const view = { left: 100, right: 1100 };
  it("no scroll away from the edges", () => {
    assert.equal(edgeScrollSpeed({ ...view, x: 600 }), 0);
    assert.equal(edgeScrollSpeed({ ...view, x: 1100 - 32 }), 0);
  });
  it("right edge scrolls right, faster the farther past it", () => {
    const at = edgeScrollSpeed({ ...view, x: 1097 });
    const past = edgeScrollSpeed({ ...view, x: 1220 });
    assert.ok(at > 0);
    assert.ok(past > at);
    assert.equal(edgeScrollSpeed({ ...view, x: 99999 }), 4000);
  });
  it("left edge scrolls left", () => {
    assert.ok(edgeScrollSpeed({ ...view, x: 103 }) < 0);
    assert.ok(edgeScrollSpeed({ ...view, x: -20 }) < edgeScrollSpeed({ ...view, x: 103 }));
  });
  it("tiny or unknown views never scroll", () => {
    assert.equal(edgeScrollSpeed({ x: 5, left: 0, right: 40 }), 0);
    assert.equal(edgeScrollSpeed({ x: NaN, ...view }), 0);
  });
});

describe("followPlayheadScroll", () => {
  const v = { viewW: 1000, maxScroll: 5000 };
  it("in view: no change", () => {
    assert.equal(followPlayheadScroll({ ...v, headX: 500, scrollLeft: 0 }), null);
  });
  it("past the right edge: pages so the head is near the left edge", () => {
    assert.equal(followPlayheadScroll({ ...v, headX: 990, scrollLeft: 0 }), 950);
  });
  it("before the left edge (seek back): brings it back", () => {
    assert.equal(followPlayheadScroll({ ...v, headX: 100, scrollLeft: 2000 }), 60);
  });
  it("clamped to the scroll range", () => {
    assert.equal(followPlayheadScroll({ ...v, headX: 6100, scrollLeft: 5000 }), null);
    assert.equal(followPlayheadScroll({ ...v, headX: 5600, scrollLeft: 3000 }), 5000);
  });
});

describe("timelineSecFromClientX", () => {
  it("maps clientX through the inner element rect and px scale", () => {
    const inner = { getBoundingClientRect: () => ({ left: 100, top: 0, width: 500, height: 20 }) };
    assert.equal(timelineSecFromClientX(148, inner, 48), 1);
    assert.equal(timelineSecFromClientX(100, inner, 48), 0);
  });
});

describe("sourceTimeAtClip", () => {
  it("adds trim in-point to local time", () => {
    assert.equal(sourceTimeAtClip({ clipIn: 2, localSec: 1.5 }), 3.5);
    assert.equal(sourceTimeAtClip({ clipIn: -1, localSec: 1 }), 0);
  });
});

describe("scrubFrameIndex", () => {
  it("maps source time through duration and frame count", () => {
    assert.equal(
      scrubFrameIndex({ clipIn: 0, localSec: 0.5, frameCount: 10, sourceSeconds: 2 }),
      2,
    );
    assert.equal(
      scrubFrameIndex({ clipIn: 1, localSec: 0.5, frameCount: 10, sourceSeconds: 2 }),
      7,
    );
  });

  it("falls back to clip length when source seconds unknown", () => {
    assert.equal(scrubFrameIndex({ localSec: 1, clipSec: 4, frameCount: 8 }), 2);
  });

  it("clamps to last frame", () => {
    assert.equal(
      scrubFrameIndex({ clipIn: 0, localSec: 99, frameCount: 5, sourceSeconds: 1 }),
      4,
    );
  });
});

describe("scrubFrameIndexFromDurations", () => {
  const durationsMs = [500, 250, 250];

  it("picks frame from cumulative ms at source time", () => {
    assert.equal(
      scrubFrameIndexFromDurations({
        clipIn: 0,
        localSec: 0.25,
        sourceSeconds: 1,
        durationsMs,
      }),
      0,
    );
    assert.equal(
      scrubFrameIndexFromDurations({
        clipIn: 0,
        localSec: 0.55,
        sourceSeconds: 1,
        durationsMs,
      }),
      1,
    );
    assert.equal(
      scrubFrameIndexFromDurations({
        clipIn: 0,
        localSec: 0.9,
        sourceSeconds: 1,
        durationsMs,
      }),
      2,
    );
  });
});

describe("animatedScrubFrameIndex", () => {
  it("returns null when frame count unknown", () => {
    assert.equal(
      animatedScrubFrameIndex({ localSec: 1, clipSec: 4, sourceSeconds: 2 }),
      null,
    );
  });

  it("uses decoded cache frame count and durations", () => {
    const idx = animatedScrubFrameIndex({
      localSec: 0.5,
      clipSec: 2,
      sourceSeconds: 2,
      cacheFrameCount: 4,
      durationsMs: [500, 500, 500, 500],
    });
    assert.equal(idx, 1);
  });
});

describe("videoPreviewFrameIndex", () => {
  it("rounds currentTime at 24 fps", () => {
    assert.equal(videoPreviewFrameIndex(1.04), 25);
    assert.equal(videoPreviewFrameIndex(0), 0);
  });
});

describe("animatedViewerMode", () => {
  const anim = { kind: "video", animated: true };
  it("uses decoded canvas while playing (playhead-synced), scrubbing, or paused", () => {
    assert.equal(animatedViewerMode(anim, true, false, false), "canvas");
    assert.equal(animatedViewerMode(anim, true, false, true), "canvas");
    assert.equal(animatedViewerMode(anim, false, false, false), "canvas");
  });
  it("ignores non-animated media and export view", () => {
    assert.equal(animatedViewerMode({ kind: "video" }, false, false, false), "none");
    assert.equal(animatedViewerMode(anim, true, true, false), "none");
  });
});

describe("animated playback preview frame (UI contract)", () => {
  it("maps clip-local time to frame index while playing (same as scrub)", () => {
    const media = { kind: "video", animated: true, frames: 24, seconds: 1 };
    assert.equal(animatedViewerMode(media, true, false, false), "canvas");
    assert.equal(
      animatedScrubFrameIndex({
        localSec: 0.5,
        clipSec: 1,
        sourceSeconds: 1,
        mediaFrames: 24,
      }),
      12,
    );
  });
});

describe("decideVideoSyncScrub", () => {
  it("seeks while scrubbing even when drift is tiny", () => {
    const r = decideVideoSyncScrub({
      want: 1.002,
      current: 1,
      playing: false,
      paused: true,
      readyState: 4,
      scrubbing: true,
    });
    assert.equal(r?.seekTo, 1.002);
    assert.equal(r?.play, false);
  });

  it("pauses a playing element while scrubbing", () => {
    const r = decideVideoSyncScrub({
      want: 2,
      current: 2,
      playing: true,
      paused: false,
      readyState: 4,
      scrubbing: true,
    });
    assert.equal(r?.seekTo, null);
    assert.equal(r?.pause, true);
    assert.equal(r?.play, false);
  });

  it("returns null when not scrubbing", () => {
    assert.equal(
      decideVideoSyncScrub({ want: 1, current: 0, playing: false, paused: true, scrubbing: false }),
      null,
    );
  });
});

describe("previewFrameAttr", () => {
  it("stringifies index and omits invalid", () => {
    assert.equal(previewFrameAttr(3), "3");
    assert.equal(previewFrameAttr(null), "");
    assert.equal(previewFrameAttr(NaN), "");
  });
});
