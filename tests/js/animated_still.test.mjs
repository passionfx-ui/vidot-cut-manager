import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { animatedStillMode } from "../../web/gg_playback_core.js";

describe("animatedStillMode (animated WebP/GIF clips cannot be paused in <img>)", () => {
  const anim = { kind: "video", animated: true };
  it("freezes an animated image while stopped", () => assert.equal(animatedStillMode(anim, false, false), "freeze"));
  it("animates while playing", () => assert.equal(animatedStillMode(anim, true, false), "animate"));
  it("leaves real videos and stills alone", () => {
    assert.equal(animatedStillMode({ kind: "video", animated: false }, false, false), "none");
    assert.equal(animatedStillMode({ kind: "image" }, false, false), "none");
    assert.equal(animatedStillMode(null, false, false), "none");
  });
  it("does nothing in export view", () => assert.equal(animatedStillMode(anim, false, true), "none"));
});
