import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTimelineGuard } from "../../web/gg_timeline_guard_core.js";

describe("timeline stale-response guard", () => {
  it("a lone load is fresh", () => {
    const g = createTimelineGuard();
    const t = g.begin("p1");
    assert.equal(g.isStale(t, "p1"), false);
  });

  it("an older load that returns after a newer one started is stale", () => {
    const g = createTimelineGuard();
    const a = g.begin("p1");
    const b = g.begin("p1");
    assert.equal(g.isStale(a, "p1"), true);
    assert.equal(g.isStale(b, "p1"), false);
  });

  it("the newest load stays fresh even if the older one returns first", () => {
    const g = createTimelineGuard();
    const a = g.begin("p1");
    const b = g.begin("p1");
    assert.equal(g.isStale(a, "p1"), true); // older returns first: dropped
    assert.equal(g.isStale(b, "p1"), false); // newer returns later: applied
  });

  it("a mutation response set while a load was in flight beats that load", () => {
    const g = createTimelineGuard();
    const a = g.begin("p1");
    g.markMutation();
    assert.equal(g.isStale(a, "p1"), true);
  });

  it("a load that starts after a mutation is fresh", () => {
    const g = createTimelineGuard();
    g.markMutation();
    const a = g.begin("p1");
    assert.equal(g.isStale(a, "p1"), false);
  });

  it("a load for a project that is no longer selected is stale", () => {
    const g = createTimelineGuard();
    const a = g.begin("p1");
    assert.equal(g.isStale(a, "p2"), true);
  });

  it("switching p1 -> p2 -> p1 drops the first p1 load", () => {
    const g = createTimelineGuard();
    const first = g.begin("p1");
    g.begin("p2");
    const again = g.begin("p1");
    assert.equal(g.isStale(first, "p1"), true);
    assert.equal(g.isStale(again, "p1"), false);
  });
});