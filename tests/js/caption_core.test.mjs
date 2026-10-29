import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSrtTime,
  buildSrt,
  srtFileName,
  effectiveCaption,
  captionEditChanged,
  captionFieldPlaceholder,
  captionAtTime,
} from "../../web/gg_caption_core.js";

describe("captionAtTime", () => {
  const clips = [
    { id: "a", start: 0, sec: 2, caption: "First" },
    { id: "b", start: 3, sec: 1.5, caption: "  \n" },
    { id: "c", start: 4.5, sec: 2, caption: "Line 1\r\nLine 2  \n\n" },
  ];

  it("shows the clip caption only inside its span", () => {
    assert.equal(captionAtTime(clips, 0), "First");
    assert.equal(captionAtTime(clips, 1.99), "First");
    assert.equal(captionAtTime(clips, 5), "Line 1\nLine 2");
  });

  it("shows nothing in a gap", () => {
    assert.equal(captionAtTime(clips, 2), "");
    assert.equal(captionAtTime(clips, 2.5), "");
  });

  it("shows nothing for a blank or missing caption", () => {
    assert.equal(captionAtTime(clips, 3.5), "");
    assert.equal(captionAtTime([{ start: 0, sec: 2 }], 1), "");
  });

  it("follows a trimmed clip length", () => {
    const trimmed = [{ start: 0, sec: 1, in: 0.5, caption: "A" }, { start: 1, sec: 2, caption: "B" }];
    assert.equal(captionAtTime(trimmed, 0.9), "A");
    assert.equal(captionAtTime(trimmed, 1), "B");
    const gap = [{ start: 0, sec: 1, in: 0.5, caption: "A" }, { start: 3, sec: 2, caption: "B" }];
    assert.equal(captionAtTime(gap, 1.5), "");
  });

  it("shows nothing on an empty track", () => {
    assert.equal(captionAtTime([], 0), "");
    assert.equal(captionAtTime(null, 1), "");
  });
});

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

  it("does not modify the cut (notes stays intact)", () => {
    const cut = { caption: "", notes: "legacy" };
    effectiveCaption(cut);
    assert.deepEqual(cut, { caption: "", notes: "legacy" });
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

describe("captionEditChanged", () => {
  it("seeded legacy notes is not an edit", () => {
    assert.equal(captionEditChanged({ caption: "", notes: "legacy" }, "legacy"), false);
  });

  it("edited seeded notes is an edit", () => {
    assert.equal(captionEditChanged({ caption: "", notes: "legacy" }, "legacy + line"), true);
    assert.equal(captionEditChanged({ caption: "", notes: "legacy" }, ""), true);
  });

  it("compares against caption when both are set", () => {
    assert.equal(captionEditChanged({ caption: "A", notes: "B" }, "A"), false);
    assert.equal(captionEditChanged({ caption: "A", notes: "B" }, "B"), true);
  });

  it("tolerates null", () => {
    assert.equal(captionEditChanged(null, ""), false);
    assert.equal(captionEditChanged(null, undefined), false);
  });
});

describe("captionFieldPlaceholder", () => {
  it("is plain Caption regardless of language", () => {
    assert.equal(captionFieldPlaceholder("Korean"), "Caption");
    assert.equal(captionFieldPlaceholder("bad"), "Caption");
  });
});

describe("srtFileName", () => {
  it("sanitizes and adds extension", () => {
    assert.equal(srtFileName("My Project!"), "My Project.srt");
    assert.equal(srtFileName(""), "captions.srt");
    assert.equal(srtFileName("bad/path:name"), "badpathname.srt");
  });
});
