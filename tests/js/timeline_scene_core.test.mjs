import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSceneRunStart, showTimelineSceneBand } from "../../web/gg_timeline_scene_core.js";

describe("showTimelineSceneBand", () => {
  it("shows for every cut in a scene", () => {
    const scene = { group_id: "g1", group_name: "Scene A" };
    assert.equal(showTimelineSceneBand(scene), true);
    assert.equal(showTimelineSceneBand({ group_id: "g1", group_name: "" }), false);
    assert.equal(showTimelineSceneBand({ group_id: "", group_name: "X" }), false);
    assert.equal(showTimelineSceneBand(null), false);
  });

  it("run start only on first of scene", () => {
    const a = { group_id: "g1", group_name: "S" };
    const b = { group_id: "g1", group_name: "S" };
    assert.equal(isSceneRunStart(a, null), true);
    assert.equal(isSceneRunStart(b, a), false);
    assert.equal(isSceneRunStart({ group_id: "g2" }, b), true);
  });
});
