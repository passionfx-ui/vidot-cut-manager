import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateAllOrder,
  generateAllCutView,
  generateAllCounts,
  generateAllProgressView,
  generateAllConfirmMessage,
  generateAllFinishedToast,
  isGenerateAllRunning,
  queueClickAction,
} from "../../web/gg_generate_all_core.js";
import { renderBadgeView } from "../../web/gg_render_status_core.js";
import { queueButtonState } from "../../web/gg_batch_render_core.js";
import { sdkJobToast } from "../../web/gg_native_regen_core.js";
import { splitConfirmMessage } from "../../web/gg_confirm_core.js";

const batch = (status, items, extra = {}) => ({ id: "b1", pid: "p", status, items: items.map(([cut_id, s, error]) => ({ cut_id, status: s, ...(error ? { error } : {}) })), ...extra });

describe("generateAllOrder", () => {
  it("keeps Shots list order, drops unknown and repeated ids", () => {
    const cuts = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.deepEqual(generateAllOrder(["c", "x", "a", "c", "b"], cuts), ["c", "a", "b"]);
    assert.deepEqual(generateAllOrder(null, cuts), []);
    assert.deepEqual(generateAllOrder(["a"], null), []);
  });
});

describe("per-cut badge (Waiting / Generating / Done / Failed)", () => {
  const running = batch("running", [["a", "done"], ["b", "generating"], ["c", "waiting"], ["d", "failed", "OOM"], ["e", "skipped"], ["f", "cancelled"]]);
  const text = (b, id) => renderBadgeView(generateAllCutView(b, "p", id));

  it("maps each status to the render badge", () => {
    assert.deepEqual([text(running, "a").text, text(running, "a").mode], ["Done", "done"]);
    assert.deepEqual([text(running, "b").text, text(running, "b").mode], ["Generating", "rendering"]);
    assert.deepEqual([text(running, "c").text, text(running, "c").mode], ["Waiting", "queued"]);
    assert.deepEqual([text(running, "d").text, text(running, "d").mode], ["Failed", "failed"]);
    assert.match(text(running, "d").title, /OOM/);
    assert.equal(text(running, "e").show, false);
    assert.equal(text(running, "f").show, false);
    assert.equal(text(running, "zz").show, false);
  });

  it("Done hides after the batch ends, Failed stays", () => {
    const ended = { ...running, status: "done" };
    assert.equal(text(ended, "a").show, false);
    assert.equal(text(ended, "d").text, "Failed");
  });

  it("other project / no batch: no badge", () => {
    assert.equal(generateAllCutView(running, "other", "a"), null);
    assert.equal(generateAllCutView(null, "p", "a"), null);
  });

  it("queue badges are unchanged", () => {
    assert.equal(renderBadgeView({ state: "queued", count: 1, position: 2 }).text, "Queued");
    assert.match(renderBadgeView({ state: "failed", error: "x" }).title, /Re-queue/);
  });
});

describe("progress, buttons, confirm, toast", () => {
  it("counts and N / M done (skipped and cancelled left out)", () => {
    const b = batch("running", [["a", "done"], ["b", "generating"], ["c", "skipped"], ["d", "cancelled"], ["e", "failed"]]);
    assert.equal(generateAllCounts(b).done, 1);
    const v = generateAllProgressView(b, "p");
    assert.deepEqual([v.show, v.text], [true, "1 / 3 done, 1 failed"]);
    assert.match(v.title, /1 skipped \(no workflow\), 1 cancelled/);
    assert.equal(generateAllProgressView(b, "q").show, false);
    assert.equal(generateAllProgressView({ ...b, status: "done", items: [{ cut_id: "a", status: "done" }] }, "p").show, false);
  });

  it("Queue: one cut = single, none = none, two+ = generate batch; Stop while batch runs", () => {
    assert.equal(queueClickAction({ native: true, selected: 1 }), "single");
    assert.equal(queueClickAction({ native: true, selected: 0 }), "none");
    assert.equal(queueClickAction({ native: true, selected: 3 }), "generate");
    assert.equal(queueClickAction({ native: false, selected: 0 }), "none");
    assert.equal(queueClickAction({ native: false, selected: 2 }), "none");
    assert.deepEqual(queueButtonState({ count: 0, native: true }), { label: "Queue", mode: "queue", disabled: true, title: "" });
    const run = batch("running", [["a", "generating"]]);
    const stop = queueButtonState({ count: 0, native: true, allRunning: true, batch: run, projectId: "p" });
    assert.deepEqual([stop.mode, stop.label, stop.disabled], ["stop", "Stop", false]);
    assert.equal(queueButtonState({ count: 0, native: true, allRunning: true, batch: { ...run, stop: true }, projectId: "p" }).disabled, true);
    assert.equal(queueButtonState({ count: 0, native: true, allRunning: true, batch: run, projectId: "other" }).disabled, true);
    assert.equal(queueButtonState({ count: 2, native: true }).title, "Queue 2 cuts to ComfyUI");
    assert.equal(isGenerateAllRunning(run), true);
    assert.equal(isGenerateAllRunning(null), false);
  });

  it("confirm lists the cuts in order", () => {
    const { title, body } = splitConfirmMessage(generateAllConfirmMessage(Array.from({ length: 10 }, (_, i) => `1-${i + 1} Shot`)));
    assert.equal(title, "Generate all 10 cuts?");
    assert.match(body, /One at a time through the Comfy SDK, in list order/);
    assert.match(body, /1\. 1-1 Shot\n2\. 1-2 Shot/);
    assert.match(body, /and 2 more/);
  });

  it("finished toast; per-cut SDK toasts are muted for batch jobs", () => {
    assert.equal(generateAllFinishedToast(batch("running", [])), null);
    const t = generateAllFinishedToast(batch("stopped", [["a", "done"], ["b", "cancelled"]]));
    assert.deepEqual(t, { summary: "Generate All stopped", detail: "1 new version, 1 cancelled", kind: "ok" });
    assert.equal(generateAllFinishedToast(batch("done", [["a", "failed"]])).kind, "warn");
    assert.equal(sdkJobToast({ native: true, status: "done", batch: "b1" }, "1-1"), null);
    assert.equal(sdkJobToast({ native: true, status: "done" }, "1-1").summary, "New version added");
  });
});
