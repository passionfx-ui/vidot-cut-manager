import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeClip } from "../../web/gg_tl_place_core.js";

describe("placeClip drop onto another clip packs the track", () => {
  const items = [
    { id: "a", start: 0, sec: 2 },
    { id: "b", start: 2, sec: 1 },
    { id: "c", start: 3, sec: 5 },
    { id: "d", start: 8, sec: 1 },
  ];
  it("moving b onto the back half of c reorders with no gap", () => {
    const r = placeClip(items, 1, 6); // b's middle at 6.5, inside c (3..8), past c's middle
    assert.deepEqual(r.order, ["a", "c", "b", "d"]);
    assert.deepEqual(r.starts, { a: 0, c: 2, b: 7, d: 8 });
    assert.equal(r.packed, true);
  });
  it("moving d onto the front half of a goes first, lengths kept", () => {
    const r = placeClip(items, 3, 0);
    assert.deepEqual(r.order, ["d", "a", "b", "c"]);
    assert.deepEqual(r.starts, { d: 0, a: 1, b: 3, c: 4 });
  });
  it("closes an existing gap too", () => {
    const gappy = [{ id: "a", start: 0, sec: 2 }, { id: "b", start: 5, sec: 2 }, { id: "c", start: 7, sec: 2 }];
    const r = placeClip(gappy, 0, 7.5);
    assert.deepEqual(r.order, ["b", "c", "a"]);
    assert.deepEqual(r.starts, { b: 0, c: 2, a: 4 });
  });
});
