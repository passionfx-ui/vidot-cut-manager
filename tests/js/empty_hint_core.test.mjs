import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyListHint, NO_CUTS_HINT, NO_PROJECTS_HINT } from "../../web/gg_empty_hint_core.js";

describe("empty list hint", () => {
  it("0 projects once the list has loaded -> New Project hint", () => {
    const h = emptyListHint({ projectsLoaded: true, projectCount: 0, timeline: null, native: false });
    assert.equal(h.kind, "projects");
    assert.equal(h.text, NO_PROJECTS_HINT);
  });
  it("no hint while the project list is still loading or failed to load", () => {
    assert.equal(emptyListHint({ projectsLoaded: false, projectCount: 0, timeline: null, native: false }), null);
  });
  it("no hint when projects exist but none is open yet", () => {
    assert.equal(emptyListHint({ projectsLoaded: true, projectCount: 3, timeline: null, native: false }), null);
  });
  it("empty native project keeps the Add Cut hint", () => {
    const h = emptyListHint({ projectsLoaded: true, projectCount: 1, timeline: { cuts: [] }, native: true });
    assert.deepEqual(h, { kind: "cuts", text: NO_CUTS_HINT });
  });
  it("empty read-only (legacy) project and non-empty projects show no hint", () => {
    assert.equal(emptyListHint({ projectsLoaded: true, projectCount: 1, timeline: { cuts: [] }, native: false }), null);
    assert.equal(emptyListHint({ projectsLoaded: true, projectCount: 1, timeline: { cuts: [{ id: "a" }] }, native: true }), null);
  });
});