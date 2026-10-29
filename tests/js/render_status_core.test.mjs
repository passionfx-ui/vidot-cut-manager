import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRenderStatus,
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
    assert.deepEqual(rs.cutView("p", "c1"), { state: "queued", percent: null, count: 1 });
    assert.deepEqual(rs.handle("execution_start", { prompt_id: "a" }), ["c1"]);
    assert.deepEqual(rs.cutView("p", "c1"), { state: "rendering", percent: null, count: 1 });
    rs.handle("executing", { prompt_id: "a", node: "3" });
    rs.handle("progress", { prompt_id: "a", node: "3", value: 4, max: 10 });
    assert.equal(rs.cutView("p", "c1").percent, 40);
    assert.deepEqual(rs.handle("execution_success", { prompt_id: "a" }), ["c1"]);
    assert.equal(rs.cutView("p", "c1"), null);
  });
  it("error and interrupted clear too", () => {
    for (const t of ["execution_error", "execution_interrupted"]) {
      const rs = createRenderStatus();
      rs.queued("a", { cutId: "c1", projectId: "p" });
      rs.handle("execution_start", { prompt_id: "a" });
      rs.handle(t, { prompt_id: "a" });
      assert.equal(rs.cutView("p", "c1"), null, t);
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
    assert.deepEqual(rs.cutView("p", "c1"), { state: "rendering", percent: null, count: 2 });
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
  });
  it("global indicator text", () => {
    assert.equal(renderGlobalView({ state: null }).show, false);
    assert.equal(renderGlobalView({ state: "rendering", rendering: 1, queued: 2 }).text, "Rendering\u2026");
    assert.equal(renderGlobalView({ state: "queued", rendering: 0, queued: 2 }).text, "Queued");
    assert.match(renderGlobalView({ state: "queued", rendering: 0, queued: 2 }).title, /2 queued/);
  });
});
