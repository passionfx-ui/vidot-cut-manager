import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRIM_SNAP_PX,
  trimDeltaText,
  trimTipText,
  trimSnapTargets,
  pickSnapTarget,
  quantizeTrimDelta,
  trimToSource,
  appliedTrimDelta,
} from "../../web/gg_trim_core.js";

const LIM = { vidMin: 0.2, imgMin: 0.5, imgMax: 60 };
const snap1 = (n) => Math.round(n);
const snap01 = (n) => Math.round(n * 10) / 10;

describe("trimDeltaText / trimTipText", () => {
  it("signs and rounds to 0.1 s", () => {
    assert.equal(trimDeltaText(0.4), "+0.4s");
    assert.equal(trimDeltaText(-1.2), "-1.2s");
    assert.equal(trimDeltaText(1.26), "+1.3s");
    assert.equal(trimDeltaText(0), "0.0s");
    assert.equal(trimDeltaText(-0.01), "0.0s");
    assert.equal(trimDeltaText(NaN), "0.0s");
  });

  it("shows delta and new duration", () => {
    assert.equal(trimTipText(0.4, 2.3), "+0.4s · Duration 2.3s");
    assert.equal(trimTipText(-1.2, 5), "-1.2s · Duration 5.0s");
  });
});

describe("trimSnapTargets", () => {
  const secs = [2, 3, 4]; // bounds 0, 2, 5, 9

  it("drops the dragged clip's own edges", () => {
    assert.deepEqual(trimSnapTargets(secs, 1, null), [0, 9]);
    assert.deepEqual(trimSnapTargets(secs, 0, null), [5, 9]);
  });

  it("adds the playhead unless it sits on an own edge", () => {
    assert.deepEqual(trimSnapTargets(secs, 1, 3.5), [0, 9, 3.5]);
    assert.deepEqual(trimSnapTargets(secs, 1, 2.001), [0, 9]);
    assert.deepEqual(trimSnapTargets(secs, 1, 5), [0, 9]);
  });
});

describe("pickSnapTarget", () => {
  const th = TRIM_SNAP_PX / 48;

  it("snaps within threshold to the nearest target", () => {
    assert.equal(pickSnapTarget(3.4, [3.5, 9], th), 3.5);
    assert.equal(pickSnapTarget(3.52, [3.4, 3.5], 0.2), 3.5);
  });

  it("returns null outside threshold or with no targets", () => {
    assert.equal(pickSnapTarget(3, [3.5, 9], th), null);
    assert.equal(pickSnapTarget(3, [], th), null);
    assert.equal(pickSnapTarget(3, undefined, th), null);
  });
});

describe("quantizeTrimDelta", () => {
  it("right edge steps the length", () => {
    assert.ok(Math.abs(quantizeTrimDelta("r", true, 0, 2.3, 0.4, snap1) - 0.7) < 1e-9);
  });

  it("left video edge steps the in point", () => {
    assert.equal(quantizeTrimDelta("l", true, 1.5, 3, 0.4, snap1), 0.5);
  });

  it("left still edge steps the length", () => {
    assert.ok(Math.abs(quantizeTrimDelta("l", false, 0, 3, 0.44, snap01) - 0.4) < 1e-9);
  });
});

describe("trimToSource", () => {
  const vid = (side, startIn, startSec, deltaSec, srcDur = 5) =>
    trimToSource({ side, isVideo: true, startIn, startSec, srcDur, deltaSec, ...LIM });

  it("video right edge cannot pass the source end", () => {
    assert.deepEqual(vid("r", 1, 3, 0.5), { in: 1, sec: 3.5 });
    assert.deepEqual(vid("r", 1, 3, 5), { in: 1, sec: 4 });
  });

  it("video left edge cannot go before frame 0 and keeps the out point", () => {
    assert.deepEqual(vid("l", 1, 3, -0.4), { in: 0.6, sec: 3.4 });
    assert.deepEqual(vid("l", 1, 3, -5), { in: 0, sec: 4 });
    assert.deepEqual(vid("l", 1, 3, 0.5), { in: 1.5, sec: 2.5 });
  });

  it("video keeps the minimum length on both sides", () => {
    assert.deepEqual(vid("l", 1, 3, 10), { in: 3.8, sec: 0.2 });
    assert.deepEqual(vid("r", 1, 3, -10), { in: 1, sec: 0.2 });
  });

  it("video with unknown source length only enforces in >= 0", () => {
    assert.deepEqual(vid("r", 0, 3, 10, 0), { in: 0, sec: 13 });
    assert.deepEqual(vid("l", 0.5, 3, -2, 0), { in: 0, sec: 3.5 });
  });

  it("stills keep IMG_MIN / IMG_MAX", () => {
    const img = (side, startSec, deltaSec) =>
      trimToSource({ side, isVideo: false, startIn: 0, startSec, deltaSec, ...LIM });
    assert.deepEqual(img("r", 3, 1), { in: 0, sec: 4 });
    assert.deepEqual(img("l", 3, 1), { in: 0, sec: 2 });
    assert.deepEqual(img("l", 3, 10), { in: 0, sec: 0.5 });
    assert.deepEqual(img("r", 3, 100), { in: 0, sec: 60 });
  });
});

describe("appliedTrimDelta", () => {
  it("inverts trimToSource for each edge kind", () => {
    assert.equal(appliedTrimDelta("r", true, 1, 3, { in: 1, sec: 4 }), 1);
    assert.equal(appliedTrimDelta("l", true, 1, 3, { in: 0, sec: 4 }), -1);
    assert.equal(appliedTrimDelta("l", false, 0, 3, { in: 0, sec: 2 }), 1);
  });
});
