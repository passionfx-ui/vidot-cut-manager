import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cutStage,
  projectSummary,
  formatSummary,
  summaryBarParts,
  sceneBestProgress,
  isTrashedCut,
} from "../../web/gg_progress_core.js";

function cut(id, opts = {}) {
  return {
    id,
    deleted_at: opts.deleted_at ?? null,
    versions_list: opts.versions_list ?? [],
    pick: opts.pick ?? null,
    media: opts.media ?? null,
  };
}

describe("isTrashedCut + projectSummary", () => {
  it("empty project", () => {
    const sum = projectSummary([]);
    assert.deepEqual(sum, { total: 0, image: 0, video: 0, done: 0, empty: 0 });
    assert.equal(formatSummary(sum), "Image 0/0 · Video 0/0 · Best 0/0");
  });

  it("image only", () => {
    const sum = projectSummary([
      cut("a", { versions_list: [{ id: "i", kind: "image" }] }),
    ]);
    assert.equal(sum.total, 1);
    assert.equal(sum.image, 1);
    assert.equal(sum.video, 0);
    assert.equal(sum.done, 0);
    assert.equal(sum.empty, 0);
    assert.equal(formatSummary(sum), "Image 1/1 · Video 0/1 · Best 0/1");
  });

  it("video and Best", () => {
    const sum = projectSummary([
      cut("b", {
        versions_list: [{ id: "v", kind: "video" }],
        pick: "v",
        media: { id: "v", kind: "video" },
      }),
    ]);
    assert.equal(sum.video, 1);
    assert.equal(sum.done, 1);
    assert.equal(formatSummary(sum), "Image 0/1 · Video 1/1 · Best 1/1");
  });

  it("excludes trashed cuts from totals", () => {
    const cuts = [
      cut("live", { versions_list: [{ id: "v", kind: "video" }] }),
      cut("gone", { deleted_at: "2026-01-01T00:00:00Z", versions_list: [{ id: "x", kind: "video" }], pick: "x" }),
    ];
    assert.equal(isTrashedCut(cuts[1]), true);
    const sum = projectSummary(cuts);
    assert.equal(sum.total, 1);
    assert.equal(sum.video, 1);
    assert.equal(sum.done, 0);
  });

  it("counts empty slots and appends Empty in formatSummary", () => {
    const sum = projectSummary([cut("e1"), cut("e2")]);
    assert.equal(sum.empty, 2);
    assert.equal(formatSummary(sum), "Image 0/2 · Video 0/2 · Best 0/2 · Empty 2");
  });

  it("no Empty suffix when empty is zero", () => {
    const sum = projectSummary([
      cut("x", { versions_list: [{ id: "i", kind: "image" }] }),
    ]);
    assert.equal(sum.empty, 0);
    assert.equal(formatSummary(sum), "Image 1/1 · Video 0/1 · Best 0/1");
  });
});

describe("summaryBarParts", () => {
  it("partitions non-overlapping stages", () => {
    const cuts = [
      cut("best", {
        versions_list: [{ id: "v", kind: "video" }],
        pick: "v",
      }),
      cut("vid", { versions_list: [{ id: "v2", kind: "video" }] }),
      cut("img", { versions_list: [{ id: "i", kind: "image" }] }),
      cut("empty"),
    ];
    const p = summaryBarParts(cuts);
    assert.deepEqual(p, { total: 4, best: 1, video: 1, image: 1, empty: 1 });
  });
});

describe("sceneBestProgress", () => {
  it("n/m ignores trashed cuts in scene", () => {
    const scene = [
      cut("a", { pick: "p", versions_list: [{ id: "p", kind: "image" }] }),
      cut("b"),
      cut("t", { deleted_at: "2026-01-01", pick: "z", versions_list: [{ id: "z", kind: "image" }] }),
    ];
    assert.deepEqual(sceneBestProgress(scene), { best: 1, total: 2 });
  });
});
