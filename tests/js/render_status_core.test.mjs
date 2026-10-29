import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  batchProgressView,
  createRenderStatus,
  idleStateView,
  promptCutTarget,
  renderBadgeView,
  renderGlobalView,
} from "../../web/gg_render_status_core.js";

describe("promptCutTarget", () => {
  it("graph extra.gonggan stamp wins (projectId or legacy pid)", () => {
    assert.deepEqual(
      promptCutTarget({ graphExtra: { cutId: "c1", projectId: "p1" }, loadedCutId: "c9", currentProjectId: "p9", shotTabActive: true }),
      { cutId: "c1", projectId: "p1" }
    );
    assert.deepEqual(promptCutTarget({ graphExtra: { cutId: "c1", pid: "p2" } }), { cutId: "c1", projectId: "p2" });
  });
  it("falls back to the cut loaded in the active shot tab", () => {
    assert.deepEqual(promptCutTarget({ loadedCutId: "c3", currentProjectId: "p1", shotTabActive: true }), { cutId: "c3", projectId: "p1" });
    assert.equal(promptCutTarget({ loadedCutId: "c3", currentProjectId: "p1", shotTabActive: false }), null);
    assert.equal(promptCutTarget({ graphExtra: { cutId: "c1" } }), null);
    assert.equal(promptCutTarget(), null);
  });
});

describe("createRenderStatus: cut lifecycle", () => {
  it("queued -> rendering -> percent -> cleared on success", () => {
    const rs = createRenderStatus();
    assert.deepEqual(rs.queued("a", { cutId: "c1", projectId: "p" }, 0), ["c1"]);
    assert.deepEqual(rs.cutView("p", "c1"), { state: "queued", percent: null, count: 1, position: null });
    assert.deepEqual(rs.handle("execution_start", { prompt_id: "a" }), ["c1"]);
    assert.deepEqual(rs.cutView("p", "c1"), { state: "rendering", percent: null, count: 1, position: null });
    rs.handle("executing", { prompt_id: "a", node: "3" });
    rs.handle("progress", { prompt_id: "a", node: "3", value: 4, max: 10 });
    assert.equal(rs.cutView("p", "c1").percent, 40);
    assert.deepEqual(rs.handle("execution_success", { prompt_id: "a" }), ["c1"]);
    assert.equal(rs.cutView("p", "c1"), null);
  });
  it("error and interrupted end the job and leave the cut failed", () => {
    for (const t of ["execution_error", "execution_interrupted"]) {
      const rs = createRenderStatus();
      rs.queued("a", { cutId: "c1", projectId: "p" });
      rs.handle("execution_start", { prompt_id: "a" });
      assert.deepEqual(rs.handle(t, { prompt_id: "a", exception_message: "boom" }), ["c1"], t);
      const v = rs.cutView("p", "c1");
      assert.equal(v.state, "failed", t);
      assert.equal(v.count, 0);
      assert.equal(v.error, t === "execution_error" ? "boom" : "Interrupted");
      assert.equal(rs.isFailed("p", "c1"), true);
      assert.equal(rs.isFailed("p", "c2"), false);
      assert.equal(rs.globalView("p").state, null);
    }
  });
  it("a new node resets the percent; progress without prompt_id hits the running prompt", () => {
    const rs = createRenderStatus();
    rs.queued("a", { cutId: "c1", projectId: "p" });
    rs.handle("executing", { prompt_id: "a", node: "3" });
    rs.handle("progress", { value: 10, max: 10 });
    assert.equal(rs.cutView("p", "c1").percent, 100);
    rs.handle("executing", { prompt_id: "a", node: "8" });
    assert.equal(rs.cutView("p", "c1").percent, null);
    rs.handle("executing", { prompt_id: "a", node: null });
    assert.equal(rs.cutView("p", "c1").state, "rendering");
  });
  it("starting the next prompt ends the previous one (missed terminal event)", () => {
    const rs = createRenderStatus();
    rs.queued("a", { cutId: "c1", projectId: "p" });
    rs.queued("b", { cutId: "c2", projectId: "p" });
    rs.handle("execution_start", { prompt_id: "a" });
    assert.deepEqual(rs.handle("execution_start", { prompt_id: "b" }).sort(), ["c1", "c2"]);
    assert.equal(rs.cutView("p", "c1"), null);
    assert.equal(rs.cutView("p", "c2").state, "rendering");
  });
  it("rendering wins over queued for a cut with two prompts", () => {
    const rs = createRenderStatus();
    rs.queued("a", { cutId: "c1", projectId: "p" });
    rs.queued("b", { cutId: "c1", projectId: "p" });
    assert.equal(renderBadgeView(rs.cutView("p", "c1")).title, "Waiting in the ComfyUI queue (2 prompts)");
    rs.handle("execution_start", { prompt_id: "b" });
    assert.deepEqual(rs.cutView("p", "c1"), { state: "rendering", percent: null, count: 2, position: null });
  });
  it("a late queuePrompt reply after the prompt already finished is ignored", () => {
    const rs = createRenderStatus();
    rs.handle("execution_start", { prompt_id: "a" });
    rs.handle("execution_success", { prompt_id: "a" });
    rs.queued("a", { cutId: "c1", projectId: "p" });
    assert.equal(rs.cutView("p", "c1"), null);
  });
  it("link after events (persisted job) attaches the running prompt to its cut", () => {
    const rs = createRenderStatus();
    rs.handle("execution_start", { prompt_id: "a" });
    assert.equal(rs.globalView("p").state, "rendering");
    assert.deepEqual(rs.link("a", "c1", "p"), ["c1"]);
    assert.equal(rs.cutView("p", "c1").state, "rendering");
    assert.equal(rs.globalView("p").state, null);
  });
});

describe("createRenderStatus: failed, remove from queue, batch", () => {
  it("failed clears when the cut is queued again, starts rendering, or succeeds", () => {
    const rs = createRenderStatus();
    rs.queued("a", { cutId: "c1", projectId: "p" });
    rs.handle("execution_error", { prompt_id: "a" });
    rs.queued("b", { cutId: "c1", projectId: "p" });
    assert.equal(rs.cutView("p", "c1").state, "queued");
    assert.equal(rs.isFailed("p", "c1"), false);
    rs.handle("execution_interrupted", { prompt_id: "b" });
    assert.equal(rs.isFailed("p", "c1"), true);
    rs.link("c", "c1", "p");
    rs.handle("execution_start", { prompt_id: "c" });
    assert.equal(rs.cutView("p", "c1").state, "rendering");
    rs.handle("execution_success", { prompt_id: "c" });
    assert.equal(rs.cutView("p", "c1"), null);
  });
  it("an unlinked prompt error does not mark any cut", () => {
    const rs = createRenderStatus();
    rs.handle("execution_start", { prompt_id: "x" });
    rs.handle("execution_error", { prompt_id: "x" });
    assert.equal(rs.cutView("p", "c1"), null);
  });
  it("queuedPromptIds lists only waiting prompts of the cut; removed drops them", () => {
    const rs = createRenderStatus();
    rs.queued("a", { cutId: "c1", projectId: "p" });
    rs.queued("b", { cutId: "c1", projectId: "p" });
    rs.queued("c", { cutId: "c2", projectId: "p" });
    rs.queued("d", { cutId: "c1", projectId: "q" });
    rs.handle("execution_start", { prompt_id: "a" });
    assert.deepEqual(rs.queuedPromptIds("p", "c1"), ["b"]);
    assert.deepEqual(rs.removed(["b"]), ["c1"]);
    assert.deepEqual(rs.queuedPromptIds("p", "c1"), []);
    assert.equal(rs.cutView("p", "c1").state, "rendering");
    rs.removed(["c"]);
    assert.equal(rs.cutView("p", "c2"), null, "badge cleared, not failed");
    rs.queued("c", { cutId: "c2", projectId: "p" });
    assert.equal(rs.cutView("p", "c2"), null, "late reply for a removed prompt is ignored");
  });
  it("batch counts finished prompts of the last batch only; removed prompts leave the batch", () => {
    const rs = createRenderStatus();
    assert.equal(rs.batchView(), null);
    rs.queued("old", { cutId: "c9", projectId: "p" });
    rs.startBatch();
    assert.equal(rs.batchView(), null, "no prompts yet");
    for (const [id, c] of [["a", "c1"], ["b", "c2"], ["c", "c3"]]) {
      rs.queued(id, { cutId: c, projectId: "p" });
      rs.addToBatch(id);
    }
    rs.addToBatch("a");
    assert.deepEqual(rs.batchView(), { done: 0, total: 3, failed: 0 });
    rs.handle("execution_start", { prompt_id: "a" });
    rs.handle("execution_success", { prompt_id: "a" });
    rs.handle("execution_start", { prompt_id: "b" });
    rs.handle("execution_error", { prompt_id: "b" });
    assert.deepEqual(rs.batchView(), { done: 2, total: 3, failed: 1 });
    rs.removed(["c"]);
    assert.deepEqual(rs.batchView(), { done: 2, total: 2, failed: 1 });
    rs.startBatch();
    rs.queued("e", { cutId: "c2", projectId: "p" });
    rs.addToBatch("e");
    assert.deepEqual(rs.batchView(), { done: 0, total: 1, failed: 0 }, "new batch replaces the last; re-queue clears failed");
  });
});

describe("createRenderStatus: queue status", () => {
  it("status queue_remaining 0 clears everything; other status is ignored", () => {
    const rs = createRenderStatus();
    rs.queued("a", { cutId: "c1", projectId: "p" });
    rs.handle("execution_start", { prompt_id: "x" });
    assert.deepEqual(rs.handle("status", { exec_info: { queue_remaining: 2 } }), []);
    assert.deepEqual(rs.handle("status", null), []);
    assert.deepEqual(rs.handle("status", { exec_info: { queue_remaining: 0 } }), ["c1"]);
    assert.equal(rs.cutView("p", "c1"), null);
    assert.equal(rs.globalView("p").state, null);
  });
  it("/queue sync: running/pending set state, missing prompts dropped (after grace)", () => {
    const rs = createRenderStatus({ graceMs: 1000 });
    rs.link("a", "c1", "p");
    rs.link("b", "c2", "p");
    rs.queued("c", { cutId: "c3", projectId: "p" }, 0);
    const q = { queue_running: [[1, "a", {}]], queue_pending: [[2, "b", {}], [3, "u", {}]] };
    assert.deepEqual(rs.syncQueue(q, 500).sort(), ["c1", "c2"]);
    assert.equal(rs.cutView("p", "c1").state, "rendering");
    assert.equal(rs.cutView("p", "c2").state, "queued");
    assert.equal(rs.cutView("p", "c3").state, "queued", "inside grace");
    assert.deepEqual(rs.globalView("p"), { state: "queued", rendering: 0, queued: 1 });
    assert.deepEqual(rs.syncQueue({ queue_running: [], queue_pending: [] }, 5000).sort(), ["c1", "c2", "c3"]);
    assert.equal(rs.cutView("p", "c1"), null);
    assert.equal(rs.globalView("p").state, null);
  });
  it("/queue sync: queue position by queue number among still-queued prompts", () => {
    const rs = createRenderStatus();
    rs.link("a", "c1", "p");
    rs.link("b", "c2", "p");
    rs.link("c", "c2", "p");
    const q = { queue_running: [[1, "r", {}]], queue_pending: [[5, "c", {}], [3, "b", {}], [2, "u", {}], [4, "a", {}]] };
    rs.syncQueue(q, 0);
    assert.equal(rs.cutView("p", "c1").position, 3);
    assert.equal(rs.cutView("p", "c2").position, 2, "earliest of the cut's prompts");
    rs.handle("execution_start", { prompt_id: "u" });
    assert.equal(rs.cutView("p", "c1").position, 2, "moves up when the prompt ahead starts");
    assert.deepEqual(rs.syncQueue({ queue_running: [[3, "b", {}]], queue_pending: [[4, "a", {}], [5, "c", {}]] }, 0).sort(), ["c1", "c2"]);
    assert.equal(rs.cutView("p", "c1").position, 1);
    assert.equal(rs.cutView("p", "c2").state, "rendering");
    assert.equal(rs.cutView("p", "c2").position, null, "no position while rendering");
  });
  it("sync keeps the percent of a prompt already rendering", () => {
    const rs = createRenderStatus();
    rs.queued("a", { cutId: "c1", projectId: "p" });
    rs.handle("progress", { prompt_id: "a", value: 1, max: 4 });
    rs.syncQueue({ queue_running: [[1, "a"]], queue_pending: [] });
    assert.equal(rs.cutView("p", "c1").percent, 25);
  });
});

describe("globalView", () => {
  it("unlinked and other-project prompts count; this project's cuts do not", () => {
    const rs = createRenderStatus();
    rs.queued("mine", { cutId: "c1", projectId: "p" });
    rs.queued("other", { cutId: "c1", projectId: "q" });
    assert.deepEqual(rs.globalView("p"), { state: "queued", rendering: 0, queued: 1 });
    rs.handle("execution_start", { prompt_id: "u" });
    assert.deepEqual(rs.globalView("p"), { state: "rendering", rendering: 1, queued: 1 });
    assert.equal(rs.cutView("q", "c1").state, "queued");
  });
});

describe("badge views", () => {
  it("cut badge text", () => {
    assert.equal(renderBadgeView(null).show, false);
    assert.equal(renderBadgeView({ state: "queued", count: 1 }).text, "Queued");
    assert.equal(renderBadgeView({ state: "rendering", percent: null }).text, "Rendering");
    assert.equal(renderBadgeView({ state: "rendering", percent: 40 }).text, "Rendering 40%");
    const f = renderBadgeView({ state: "failed", count: 0, error: "OOM" });
    assert.deepEqual([f.show, f.mode, f.text, f.pos], [true, "failed", "Failed", ""]);
    assert.match(f.title, /failed: OOM/);
  });
  it("batch counter text, hidden with no batch", () => {
    assert.equal(batchProgressView(null).show, false);
    assert.equal(batchProgressView({ done: 0, total: 0, failed: 0 }).show, false);
    assert.equal(batchProgressView({ done: 3, total: 10, failed: 0 }).text, "3 / 10 done");
    assert.match(batchProgressView({ done: 3, total: 10, failed: 1 }).title, /1 failed/);
    assert.match(batchProgressView({ done: 1, total: 2, failed: 0 }).title, /^Last Queue batch: /);
  });
  it("queue position goes to pos (text stays Queued)", () => {
    const v = renderBadgeView({ state: "queued", count: 1, position: 2 });
    assert.equal(v.text, "Queued");
    assert.equal(v.pos, "#2");
    assert.equal(v.title, "Waiting in the ComfyUI queue, position 2");
    assert.equal(renderBadgeView({ state: "queued", count: 1, position: null }).pos, "");
    assert.equal(renderBadgeView({ state: "rendering", percent: 10, position: 1 }).pos, "");
  });
  it("idle word: Done with a version, else Idle", () => {
    assert.equal(idleStateView(true).text, "Done");
    assert.equal(idleStateView(false).text, "Idle");
  });
  it("global indicator text", () => {
    assert.equal(renderGlobalView({ state: null }).show, false);
    assert.equal(renderGlobalView({ state: "rendering", rendering: 1, queued: 2 }).text, "Rendering\u2026");
    assert.equal(renderGlobalView({ state: "queued", rendering: 0, queued: 2 }).text, "Queued");
    assert.match(renderGlobalView({ state: "queued", rendering: 0, queued: 2 }).title, /2 queued/);
  });
});
