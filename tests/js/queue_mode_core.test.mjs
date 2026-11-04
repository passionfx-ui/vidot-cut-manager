import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUEUE_MODE_DEFAULT,
  loadQueueMode,
  normalizeQueueMode,
  queueBatchPlan,
  queueCutJob,
  queuePlanTooltip,
  queueStripSelectedVid,
  saveQueueMode,
} from "../../web/gg_queue_mode_core.js";

const cut = (id, extra = {}) => ({
  id,
  pick: null,
  display: null,
  versions_list: [
    { id: "v-img", kind: "image" },
    { id: "v-vid", kind: "video", seconds: 4 },
  ],
  ...extra,
});

describe("queueStripSelectedVid", () => {
  it("does not fall back to Best or newest", () => {
    const c = cut("b", { pick: "v-img", display: null });
    assert.equal(queueStripSelectedVid(c, {}), "");
    assert.equal(queueStripSelectedVid(c, { picked: "v-vid" }), "v-vid");
    assert.equal(queueStripSelectedVid(c, { open: "v-img" }), "v-img");
    assert.equal(queueStripSelectedVid({ ...c, display: "v-vid" }), "v-vid");
  });
});

describe("queueCutJob v4 scenarios", () => {
  const A = cut("a", { pick: "v-img" });
  const B = cut("b", { display: "v-img" });
  const C = cut("c", { display: "v-vid" });
  const D = cut("d", { versions_list: [{ id: "v-only-vid", kind: "video" }] });

  it("Auto follows the stored cut kind, not the shown take", () => {
    assert.deepEqual(queueCutJob(A, "auto", { cutKind: "image" }), { type: "job", job: "image" });
    assert.deepEqual(queueCutJob(B, "auto", { cutKind: "image" }), { type: "job", job: "image" });
    assert.deepEqual(queueCutJob(C, "auto", { cutKind: "image" }), { type: "job", job: "image" });
    assert.deepEqual(queueCutJob(D, "auto", { cutKind: "image" }), { type: "job", job: "image" });
    assert.deepEqual(queueCutJob(B, "auto", {}), { type: "job", job: "image" });
    assert.deepEqual(queueCutJob(B, "auto", { cutKind: "video" }), { type: "job", job: "video", selectedVid: "v-img" });
    assert.deepEqual(queueCutJob(C, "auto", { cutKind: "video" }), { type: "job", job: "video" });
    assert.deepEqual(queueCutJob(D, "auto", { cutKind: "video" }), { type: "skip", reason: "no_image" });
  });

  it("Image: every cut is an image job", () => {
    for (const c of [A, B, C, D]) assert.deepEqual(queueCutJob(c, "image", {}), { type: "job", job: "image" });
  });

  it("Video: still is video, video take is regen, no still is skip", () => {
    assert.deepEqual(queueCutJob(A, "video", {}), { type: "job", job: "video", selectedVid: "v-img" });
    assert.deepEqual(queueCutJob(B, "video", {}), { type: "job", job: "video", selectedVid: "v-img" });
    assert.deepEqual(queueCutJob(C, "video", {}), { type: "job", job: "regen", selectedVid: "v-vid" });
    assert.deepEqual(queueCutJob(D, "video", {}), { type: "skip", reason: "no_image" });
  });
});

describe("queueBatchPlan", () => {
  const cuts = [
    cut("a", { pick: "v-img" }),
    cut("b", { display: "v-img" }),
    cut("c", { display: "v-vid" }),
    cut("d", { versions_list: [{ id: "v-only-vid", kind: "video" }] }),
  ];

  it("Auto tooltip follows cut kind", () => {
    const kinds = { a: "image", b: "image", c: "video", d: "video" };
    const p = queueBatchPlan(cuts, "auto", (id) => ({ cutKind: kinds[id] }));
    assert.equal(p.actionable, 3);
    assert.equal(p.counts.image, 2);
    assert.equal(p.counts.video, 1);
    assert.equal(p.counts.regen, 0);
    assert.equal(p.counts.skipNoImage, 1);
    assert.match(queuePlanTooltip(p.counts), /1 Video · 2 Image · 1 skipped \(no image\)/);
  });

  it("Video mode queues a still and skips a cut with no still", () => {
    const p = queueBatchPlan([cuts[0]], "video", () => ({}));
    assert.equal(p.actionable, 1);
    assert.equal(p.counts.video, 1);
    const p2 = queueBatchPlan([cuts[3]], "video", () => ({}));
    assert.equal(p2.actionable, 0);
    assert.match(queuePlanTooltip(p2.counts), /no image/);
  });
});

describe("queue mode persistence", () => {
  it("defaults to Auto", () => {
    const ls = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } };
    assert.equal(loadQueueMode(ls), QUEUE_MODE_DEFAULT);
    saveQueueMode(ls, "video");
    assert.equal(loadQueueMode(ls), "video");
    assert.equal(normalizeQueueMode("nope"), "auto");
  });
});
