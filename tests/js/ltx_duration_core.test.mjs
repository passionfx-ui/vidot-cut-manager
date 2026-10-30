import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LTX_VIDEO_MAX_SEC,
  VIDEO_TOO_LONG_MSG,
  videoTooLongForLtx,
  videoTooLongMessage,
} from "../../web/gg_ltx_duration_core.js";

describe("ltx duration guard (0.9.130)", () => {
  it("max 10 s", () => {
    assert.equal(LTX_VIDEO_MAX_SEC, 10);
    assert.ok(!videoTooLongForLtx(10));
    assert.ok(videoTooLongForLtx(10.01));
    assert.equal(videoTooLongMessage(11), VIDEO_TOO_LONG_MSG);
    assert.equal(videoTooLongMessage(3), "");
  });
});
