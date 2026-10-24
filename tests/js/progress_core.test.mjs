import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProgressTracker } from "../../web/gg_progress_core.js";

const SAMPLE_GRAPH = {
  "3": { class_type: "KSampler", inputs: {} },
  "4": { class_type: "CheckpointLoaderSimple", inputs: {} },
  "5": { class_type: "VAEDecode", inputs: {} },
};

const QUEUE_FIXTURE = {
  queue_running: [
    [1, "run-p1", SAMPLE_GRAPH, { create_time: 1 }, ["3", "5"]],
  ],
  queue_pending: [
    [2, "pend-p1", SAMPLE_GRAPH, { create_time: 2 }, ["3", "4", "5"]],
    [3, "other-job", { "9": { class_type: "EmptyLatentImage" } }, { create_time: 3 }, ["9"]],
  ],
};

function last(events) {
  return events[events.length - 1];
}

describe("gg_progress_core", () => {
  it("queued -> running with progress -> success yields done at 100%", () => {
    const t = createProgressTracker();
    const events = [];
    t.on((e) => events.push(e));
    t.registerPrompt("p1", "cut-a", "proj-1");
    t.syncQueue({
      queue_running: [],
      queue_pending: [[1, "p1", SAMPLE_GRAPH, {}, ["3", "4", "5"]]],
    });
    assert.equal(last(events).state, "queued");
    assert.equal(last(events).queuePos, 1);

    t.syncQueue({
      queue_running: [[1, "p1", SAMPLE_GRAPH, {}, ["3", "4", "5"]]],
      queue_pending: [],
    });
    const runEvt = events.find((e) => e.promptId === "p1" && e.state === "running");
    assert.ok(runEvt);
    assert.equal(runEvt.queuePos, 1);

    t.handleEvent("execution_start", { prompt_id: "p1" });
    t.handleEvent("executing", { prompt_id: "p1", node: "3" });
    t.handleEvent("progress", { prompt_id: "p1", node: "3", value: 2, max: 10 });
    const mid = last(events);
    assert.equal(mid.state, "running");
    assert.ok(mid.percent > 0 && mid.percent < 100);

    t.handleEvent("executed", { prompt_id: "p1", node: "3" });
    t.handleEvent("executed", { prompt_id: "p1", node: "4" });
    t.handleEvent("executed", { prompt_id: "p1", node: "5" });
    t.handleEvent("execution_success", { prompt_id: "p1" });
    const done = last(events);
    assert.equal(done.state, "done");
    assert.equal(done.percent, 100);
    assert.equal(t.getCutStatus("proj-1", "cut-a").state, "done");
  });

  it("execution_cached reduces total node count for percent", () => {
    const t = createProgressTracker();
    const events = [];
    t.on((e) => events.push(e));
    t.registerPrompt("p2", "c2", "p");
    t.syncQueue({
      queue_running: [[1, "p2", SAMPLE_GRAPH, {}, ["3", "4", "5"]]],
      queue_pending: [],
    });
    t.handleEvent("execution_cached", { prompt_id: "p2", nodes: ["4", "5"] });
    t.handleEvent("executing", { prompt_id: "p2", node: "3" });
    t.handleEvent("progress", { prompt_id: "p2", node: "3", value: 5, max: 10 });
    const pct = last(events).percent;
    assert.ok(pct >= 45 && pct <= 55, `expected ~50%, got ${pct}`);
  });

  it("execution_error -> failed with message", () => {
    const t = createProgressTracker();
    const events = [];
    t.on((e) => events.push(e));
    t.registerPrompt("pe", "ce", "pr");
    t.handleEvent("execution_error", {
      prompt_id: "pe",
      exception_message: "CUDA OOM",
    });
    const e = last(events);
    assert.equal(e.state, "failed");
    assert.equal(e.error, "CUDA OOM");
  });

  it("execution_interrupted", () => {
    const t = createProgressTracker();
    const events = [];
    t.on((e) => events.push(e));
    t.registerPrompt("pi", "ci", "pr");
    t.handleEvent("execution_interrupted", { prompt_id: "pi" });
    assert.equal(last(events).state, "interrupted");
  });

  it("unregistered prompt counted as other, no cutId on events", () => {
    const t = createProgressTracker();
    t.registerPrompt("p1", "cut", "proj");
    const { otherRunning, otherPending } = t.syncQueue({
      queue_running: [
        [1, "foreign-run", { "9": { class_type: "EmptyLatentImage" } }, {}, ["9"]],
      ],
      queue_pending: [
        [2, "foreign-pend", { "8": { class_type: "CLIPTextEncode" } }, {}, ["8"]],
      ],
    });
    assert.equal(otherRunning, 1);
    assert.equal(otherPending, 1);
    const other = t.getOther();
    assert.equal(other.running, 1);
    assert.equal(other.pending, 1);
    const cut = t.getCutStatus("proj", "cut");
    assert.ok(cut);
    assert.equal(cut.cutId, "cut");
  });

  it("queue position: 1 running + 2 pending", () => {
    const t = createProgressTracker();
    const events = [];
    t.on((e) => events.push(e));
    t.registerPrompt("run-p1", "c1", "p");
    t.registerPrompt("pend-p1", "c2", "p");
    t.syncQueue(QUEUE_FIXTURE);
    const run = events.filter((e) => e.promptId === "run-p1").pop();
    const pend = events.filter((e) => e.promptId === "pend-p1").pop();
    assert.equal(run.queuePos, 1);
    assert.equal(run.state, "running");
    assert.equal(pend.queuePos, 2);
    assert.equal(pend.state, "queued");
  });

  it("percent is monotonic", () => {
    const t = createProgressTracker();
    const percents = [];
    t.on((e) => {
      if (e.percent != null) percents.push(e.percent);
    });
    t.registerPrompt("pm", "cm", "p");
    t.syncQueue({
      queue_running: [[1, "pm", SAMPLE_GRAPH, {}, ["3", "4", "5"]]],
      queue_pending: [],
    });
    t.handleEvent("progress", { prompt_id: "pm", node: "3", value: 8, max: 10 });
    t.handleEvent("progress", { prompt_id: "pm", node: "3", value: 3, max: 10 });
    for (let i = 1; i < percents.length; i++) {
      assert.ok(percents[i] >= percents[i - 1] - 0.001);
    }
  });

  it("syncHistory marks done and failed", () => {
    const t = createProgressTracker();
    const events = [];
    t.on((e) => events.push(e));
    t.registerPrompt("hd1", "c", "p");
    t.registerPrompt("hd2", "c2", "p");
    t.syncHistory({
      hd1: {
        prompt: [1, "hd1", SAMPLE_GRAPH, {}, []],
        status: { status_str: "success", completed: true, messages: [] },
      },
      hd2: {
        prompt: [1, "hd2", SAMPLE_GRAPH, {}, []],
        status: {
          status_str: "error",
          completed: false,
          messages: [["execution_error", { exception_message: "bad node" }]],
        },
      },
    });
    assert.equal(t.getCutStatus("p", "c").state, "done");
    assert.equal(t.getCutStatus("p", "c2").state, "failed");
    assert.equal(t.getCutStatus("p", "c2").error, "bad node");
  });

  it("emit accepts cloud-style events", () => {
    const t = createProgressTracker();
    const events = [];
    t.on((e) => events.push(e));
    t.emit({
      promptId: "cloud-1",
      cutId: "x",
      projectId: "y",
      state: "running",
      percent: 40,
      node: "KSampler",
      queuePos: null,
      error: null,
      ts: 1,
    });
    assert.equal(last(events).percent, 40);
    assert.equal(last(events).node, "KSampler");
  });
});
