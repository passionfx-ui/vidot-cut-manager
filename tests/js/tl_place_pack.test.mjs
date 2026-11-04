import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeClip } from "../../web/gg_tl_place_core.js";

describe("placeClip drop onto another clip keeps other starts", () => {
  const items = [
    { id: "a", start: 0, sec: 2 },
    { id: "b", start: 2, sec: 1 },
    { id: "c", start: 3, sec: 5 },
    { id: "d", start: 8, sec: 1 },
  ];
  it("moving b onto the back half of c places it after c and pushes d", () => {
    const r = placeClip(items, 1, 6); // b's middle at 6.5, inside c (3..8), past c's middle
    assert.deepEqual(r.order, ["a", "c", "b", "d"]);
    assert.deepEqual(r.starts, { a: 0, c: 3, b: 8, d: 9 });
    assert.equal(r.starts.a, 0);
    assert.ok(r.starts.c > r.starts.a + 2);
  });
  it("moving d onto the front half of a goes first, lengths kept", () => {
    const r = placeClip(items, 3, 0);
    assert.deepEqual(r.order, ["d", "a", "b", "c"]);
    assert.deepEqual(r.starts, { d: 0, a: 1, b: 3, c: 4 });
  });
  it("leaves an existing gap in front of the clips that did not move", () => {
    const gappy = [{ id: "a", start: 0, sec: 2 }, { id: "b", start: 5, sec: 2 }, { id: "c", start: 7, sec: 2 }];
    const r = placeClip(gappy, 0, 7.5);
    assert.deepEqual(r.order, ["b", "c", "a"]);
    assert.deepEqual(r.starts, { b: 5, c: 7, a: 9 });
  });
});
