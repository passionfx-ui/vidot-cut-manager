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

  it("Auto: A skip, B video, C regen, D image", () => {
    assert.deepEqual(queueCutJob(A, "auto", {}), { type: "skip", reason: "best" });
    assert.deepEqual(queueCutJob(B, "auto", {}), { type: "job", job: "video", selectedVid: "v-img" });
    assert.deepEqual(queueCutJob(C, "auto", {}), { type: "job", job: "regen", selectedVid: "v-vid" });
    assert.deepEqual(queueCutJob(D, "auto", {}), { type: "job", job: "image" });
  });

  it("Image: A skip, B/C/D image", () => {
    assert.deepEqual(queueCutJob(A, "image", {}), { type: "skip", reason: "best" });
    for (const c of [B, C, D]) assert.deepEqual(queueCutJob(c, "image", {}), { type: "job", job: "image" });
  });

  it("Video: A skip, B video, C regen, D skip no image", () => {
    assert.deepEqual(queueCutJob(A, "video", {}), { type: "skip", reason: "best" });
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

  it("Auto tooltip counts match jobs", () => {
    const p = queueBatchPlan(cuts, "auto", () => ({}));
    assert.equal(p.actionable, 3);
    assert.equal(p.counts.skipBest, 1);
    assert.equal(p.counts.video, 1);
    assert.equal(p.counts.regen, 1);
    assert.equal(p.counts.image, 1);
    assert.match(queuePlanTooltip(p.counts), /1 Video · 1 Regen · 1 Image · 1 skipped \(Best\)/);
  });

  it("Video mode all skipped when only Best or no image cuts selected", () => {
    const p = queueBatchPlan([cuts[0]], "video", () => ({}));
    assert.equal(p.actionable, 0);
    assert.match(queuePlanTooltip(p.counts), /skipped \(Best\)/);
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
