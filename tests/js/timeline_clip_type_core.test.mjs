import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expectedTimelineClipBadge,
  timelineClipMediaType,
  timelineClipTypeBadgeHtml,
  timelineClipTypeClassSuffix,
} from "../../web/gg_timeline_clip_type_core.js";

describe("timelineClipMediaType", () => {
  it("maps animated WebP as video", () => {
    assert.equal(timelineClipMediaType({ media: { kind: "video", animated: true } }), "video");
    assert.equal(timelineClipMediaType({ media: { kind: "image" } }), "image");
    assert.equal(timelineClipMediaType({ media: null }), null);
  });
});

describe("timeline clip type UI strings", () => {
  it("renders badge and classes", () => {
    const esc = (s) => s;
    assert.match(timelineClipTypeBadgeHtml({ media: { kind: "video" } }, esc), />VIDEO</);
    assert.match(timelineClipTypeClassSuffix({ media: { kind: "image" } }), /gg-clip-type-image/);
    assert.equal(expectedTimelineClipBadge({ media: { kind: "image" } }), "IMG");
  });
});
