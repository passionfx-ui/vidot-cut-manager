import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSrtTime,
  buildSrt,
  srtFileName,
  effectiveCaption,
  captionFieldPlaceholder,
} from "../../web/gg_caption_core.js";

describe("formatSrtTime", () => {
  it("formats zero and fractional seconds", () => {
    assert.equal(formatSrtTime(0), "00:00:00,000");
    assert.equal(formatSrtTime(1.5), "00:00:01,500");
  });

  it("handles minutes and rounding", () => {
    assert.equal(formatSrtTime(61.001), "00:01:01,001");
    assert.equal(formatSrtTime(3599.9996), "01:00:00,000");
    assert.equal(formatSrtTime(3600), "01:00:00,000");
  });

  it("clamps negative and NaN", () => {
    assert.equal(formatSrtTime(-3), "00:00:00,000");
    assert.equal(formatSrtTime(NaN), "00:00:00,000");
  });
});

describe("buildSrt", () => {
  it("uses caption field only, not notes fallback", () => {
    assert.equal(buildSrt([{ sec: 2, notes: "legacy notes", caption: "" }]), "");
    const srt = buildSrt([{ sec: 2, notes: "ignored", caption: "on caption" }]);
    assert.match(srt, /on caption/);
    assert.doesNotMatch(srt, /ignored/);
  });

  it("cumulative offsets and skips empty captions", () => {
    const srt = buildSrt([
      { sec: 2, caption: "A" },
      { sec: 3, caption: "" },
      { sec: 1.5, caption: "B" },
    ]);
    assert.match(srt, /00:00:00,000 --> 00:00:02,000/);
    assert.match(srt, /00:00:05,000 --> 00:00:06,500/);
    assert.match(srt, /^1\n/m);
    assert.match(srt, /^2\n/m);
  });

  it("multiline and CRLF normalization", () => {
    const srt = buildSrt([{ sec: 1, caption: "line1\r\nline2\r" }]);
    assert.match(srt, /line1\nline2/);
  });

  it("empty result", () => {
    assert.equal(buildSrt([{ sec: 2, caption: "   " }]), "");
    assert.equal(buildSrt([]), "");
  });

  it("ends with newline", () => {
    const srt = buildSrt([{ sec: 1, caption: "x" }]);
    assert.ok(srt.endsWith("\n"));
  });
});

describe("effectiveCaption", () => {
  it("prefers caption over notes", () => {
    assert.equal(effectiveCaption({ caption: "A", notes: "B" }), "A");
  });

  it("falls back to notes when caption empty", () => {
    assert.equal(effectiveCaption({ caption: "", notes: "legacy" }), "legacy");
    assert.equal(effectiveCaption({ caption: "  ", notes: "legacy" }), "legacy");
  });

  it("returns empty when both empty", () => {
    assert.equal(effectiveCaption({ caption: "", notes: "" }), "");
    assert.equal(effectiveCaption(null), "");
  });
});

describe("captionFieldPlaceholder", () => {
  it("includes clamped language", () => {
    assert.equal(captionFieldPlaceholder("Korean"), "Notes / dialogue (Korean)");
    assert.equal(captionFieldPlaceholder("bad"), "Notes / dialogue (English)");
  });
});

describe("srtFileName", () => {
  it("sanitizes and adds extension", () => {
    assert.equal(srtFileName("My Project!"), "My Project.srt");
    assert.equal(srtFileName(""), "captions.srt");
    assert.equal(srtFileName("bad/path:name"), "badpathname.srt");
  });
});
