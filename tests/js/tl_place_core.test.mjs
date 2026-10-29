import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAP,
  layoutTrack,
  clipAtTime,
  edgeSnapTargets,
  snapMoveStart,
  placeClip,
  prevClipEnd,
} from "../../web/gg_tl_place_core.js";

const clips = (...spec) => spec.map(([id, start, sec]) => ({ id, start, sec }));
const noOverlap = (order, starts, secs) => {
  for (let k = 1; k < order.length; k++) {
    assert.ok(starts[order[k]] >= starts[order[k - 1]] + secs[order[k - 1]] - 1e-9, `${order[k]} overlaps ${order[k - 1]}`);
  }
};

describe("layoutTrack", () => {
  it("packs clips back to back when not free (imported projects)", () => {
    assert.deepEqual(layoutTrack(clips(["a", 5, 2], ["b", 9, 1.5]), false), { starts: [0, 2], total: 3.5 });
  });
  it("keeps wanted starts with gaps, packs missing starts, pushes overlaps", () => {
    const items = [{ sec: 2, start: 0 }, { sec: 3, start: 5 }, { sec: 1, start: 6 }, { sec: 1 }];
    assert.deepEqual(layoutTrack(items, true), { starts: [0, 5, 8, 9], total: 10 });
  });
});

describe("clipAtTime", () => {
  const items = clips(["a", 0, 2], ["b", 4, 1]);
  it("finds the clip and local time", () => {
    assert.deepEqual(clipAtTime(items, 1.5), { i: 0, local: 1.5 });
    assert.deepEqual(clipAtTime(items, 4.25), { i: 1, local: 0.25 });
  });
  it("reports gaps", () => {
    assert.equal(clipAtTime(items, 3).i, GAP);
  });
  it("past the end -> last clip at its end; empty -> -1", () => {
    assert.deepEqual(clipAtTime(items, 9), { i: 1, local: 1 });
    assert.deepEqual(clipAtTime([], 1), { i: -1, local: 0 });
  });
});

describe("edgeSnapTargets / snapMoveStart", () => {
  const items = clips(["a", 0, 2], ["b", 4, 1], ["c", 7, 2]);
  it("other clips' edges, 0 and the playhead; never the clip's own edges", () => {
    assert.deepEqual(edgeSnapTargets(items, 1, 6).sort((x, y) => x - y), [0, 0, 2, 6, 7, 9]);
    assert.ok(!edgeSnapTargets(items, 1, 4.5).includes(4));
    assert.ok(!edgeSnapTargets(items, 1, 5).includes(5));
  });
  it("snaps the start edge or the end edge, whichever is closer", () => {
    const t = [0, 2, 7, 9];
    assert.deepEqual(snapMoveStart(2.1, 1, t, 0.3), { start: 2, hit: 2 });
    assert.deepEqual(snapMoveStart(5.9, 1, t, 0.3), { start: 6, hit: 7 });
    assert.deepEqual(snapMoveStart(4, 1, t, 0.3), { start: 4, hit: null });
    assert.deepEqual(snapMoveStart(-3, 1, t, 0.3), { start: 0, hit: null });
  });
});

describe("placeClip", () => {
  const secs = { a: 2, b: 1, c: 2 };
  it("free spot: moves there and leaves a gap behind", () => {
    const r = placeClip(clips(["a", 0, 2], ["b", 2, 1], ["c", 3, 2]), 1, 10);
    assert.deepEqual(r.order, ["a", "c", "b"]);
    assert.deepEqual(r.starts, { a: 0, c: 3, b: 10 });
  });
  it("partly over a neighbour with room in the gap: clamped to the neighbour edge", () => {
    const items = clips(["a", 0, 2], ["b", 10, 1], ["c", 6, 2]);
    const r = placeClip(items, 1, 1.6);
    assert.equal(r.start, 2);
    assert.deepEqual(r.starts, { a: 0, b: 2, c: 6 });
    assert.equal(placeClip(items, 1, 5.3).start, 5);
  });
  it("over another clip: inserted before/after it, later clips pushed, never overlapping", () => {
    const items = clips(["a", 0, 2], ["b", 2, 1], ["c", 3, 2]);
    const before = placeClip(items, 2, 0);
    assert.deepEqual(before.order, ["c", "a", "b"]);
    assert.deepEqual(before.starts, { c: 0, a: 2, b: 4 });
    noOverlap(before.order, before.starts, secs);
    const after = placeClip(items, 0, 2.6);
    assert.deepEqual(after.order, ["b", "a", "c"]);
    assert.deepEqual(after.starts, { b: 2, a: 3, c: 5 });
    noOverlap(after.order, after.starts, secs);
  });
  it("gap too small: goes to the nearer side and pushes", () => {
    const items = clips(["a", 0, 2], ["b", 2.5, 1], ["c", 9, 2]);
    const r = placeClip(items, 2, 1.3);
    noOverlap(r.order, r.starts, secs);
    assert.deepEqual(r.order, ["a", "c", "b"]);
    assert.deepEqual(r.starts, { a: 0, c: 2.5, b: 4.5 });
  });
  it("never before 0", () => {
    assert.equal(placeClip(clips(["a", 3, 2]), 0, -4).start, 0);
  });
});

describe("prevClipEnd", () => {
  it("is 0 for the first clip, else the previous clip's end", () => {
    const items = clips(["a", 1, 2], ["b", 5, 1]);
    assert.equal(prevClipEnd(items, 0), 0);
    assert.equal(prevClipEnd(items, 1), 3);
  });
});
