import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cutStage, projectSummary, formatSummary } from "../../web/gg_progress_core.js";

function cut(id, opts = {}) {
  return {
    id,
    versions_list: opts.versions_list ?? [],
    pick: opts.pick ?? null,
    media: opts.media ?? null,
    versions: opts.versions_list?.length ?? 0,
  };
}

/** 14 visible cuts: 6 video (some picked), 1 image-only picked, 7 empty */
function fixture14() {
  const cuts = [];
  for (let i = 0; i < 6; i++) {
    const vid = `v${i}-video`;
    cuts.push(
      cut(`c-v${i}`, {
        versions_list: [{ id: vid, kind: "video" }],
        pick: i % 2 === 0 ? vid : null,
        media: { id: vid, kind: "video" },
      }),
    );
  }
  cuts.push(
    cut("c-img", {
      versions_list: [{ id: "img1", kind: "image" }],
      pick: "img1",
      media: { id: "img1", kind: "image" },
    }),
  );
  for (let i = 0; i < 7; i++) cuts.push(cut(`c-empty-${i}`));
  return cuts;
}

describe("cutStage", () => {
  it("empty cut with null fields", () => {
    const s = cutStage(null);
    assert.deepEqual(s, { image: false, video: false, best: false, stage: "empty" });
    assert.equal(cutStage({}).stage, "empty");
    assert.equal(cutStage({ versions_list: null }).stage, "empty");
  });

  it("image only", () => {
    const s = cutStage(cut("a", { versions_list: [{ id: "x", kind: "image" }] }));
    assert.equal(s.image, true);
    assert.equal(s.video, false);
    assert.equal(s.best, false);
    assert.equal(s.stage, "image");
  });

  it("video only", () => {
    const s = cutStage(cut("b", { versions_list: [{ id: "y", kind: "video" }] }));
    assert.equal(s.image, false);
    assert.equal(s.video, true);
    assert.equal(s.stage, "video");
  });

  it("image and video without best stays at video stage", () => {
    const s = cutStage(
      cut("c", {
        versions_list: [{ id: "i", kind: "image" }, { id: "v", kind: "video" }],
      }),
    );
    assert.equal(s.image, true);
    assert.equal(s.video, true);
    assert.equal(s.best, false);
    assert.equal(s.stage, "video");
  });

  it("best picked when pick in versions_list", () => {
    const s = cutStage(
      cut("d", {
        versions_list: [{ id: "i", kind: "image" }, { id: "v", kind: "video" }],
        pick: "v",
      }),
    );
    assert.equal(s.best, true);
    assert.equal(s.stage, "done");
  });

  it("pick id not in versions_list is not best", () => {
    const s = cutStage(
      cut("e", {
        versions_list: [{ id: "i", kind: "image" }],
        pick: "missing",
      }),
    );
    assert.equal(s.best, false);
    assert.equal(s.stage, "image");
  });

  it("native-like cut: pick matches media.id", () => {
    const s = cutStage(
      cut("n", {
        versions_list: [],
        pick: "asset-1",
        media: { id: "asset-1", kind: "image" },
      }),
    );
    assert.equal(s.image, true);
    assert.equal(s.best, true);
    assert.equal(s.stage, "done");
  });

  it("Best is manual only: media (newest) without pick does not light best", () => {
    const s = cutStage(
      cut("auto", {
        versions_list: [{ id: "v2", kind: "image" }, { id: "v1", kind: "image" }],
        media: { id: "v2", kind: "image" },
      }),
    );
    assert.equal(s.image, true);
    assert.equal(s.best, false);
    assert.equal(s.stage, "image");
  });

  it("Best lights once a manual pick exists, even on an older version", () => {
    const s = cutStage(
      cut("manual", {
        versions_list: [{ id: "v2", kind: "video" }, { id: "v1", kind: "image" }],
        pick: "v1",
        media: { id: "v1", kind: "image" },
      }),
    );
    assert.equal(s.best, true);
    assert.equal(s.stage, "done");
  });

  it("ignores unknown version kind", () => {
    const s = cutStage(cut("u", { versions_list: [{ id: "z", kind: "audio" }] }));
    assert.equal(s.stage, "empty");
  });

  it("media kind fallback when versions_list empty", () => {
    const s = cutStage(cut("m", { media: { id: "m1", kind: "video" } }));
    assert.equal(s.video, true);
    assert.equal(s.stage, "video");
  });
});

describe("projectSummary + formatSummary", () => {
  it("14-cut fixture counts", () => {
    const cuts = fixture14();
    const sum = projectSummary(cuts);
    assert.equal(sum.total, 14);
    assert.equal(sum.video, 6);
    assert.equal(sum.image, 1);
    assert.equal(sum.done, 4);
    assert.equal(sum.empty, 7);
    assert.equal(formatSummary(sum), "Image 1/14 · Video 6/14 · Best 4/14 · Empty 7");
  });

  it("zero cuts", () => {
    const sum = projectSummary([]);
    assert.equal(formatSummary(sum), "Image 0/0 · Video 0/0 · Best 0/0");
  });
});
