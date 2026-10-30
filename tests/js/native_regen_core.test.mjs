import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  regenConfirmMessage,
  regenKnownNodeCount,
  isRegenEmptyCut,
  nativeRegenQueueCheck,
  REGEN_CONFIRM_TITLE,
  REGEN_SKIP_MESSAGE,
  sdkRegenErrorMessage,
  sdkPlanSummary,
  sdkJobToast,
} from "../../web/gg_native_regen_core.js";
import { splitConfirmMessage } from "../../web/gg_confirm_core.js";

describe("native SDK Regen / Queue text", () => {
  it("an old server's answer asks for a restart", () => {
    assert.match(sdkRegenErrorMessage("Not available for native projects yet"), /Restart ComfyUI/);
    assert.equal(sdkRegenErrorMessage("a regen job is already running"), "a regen job is already running");
    assert.equal(sdkRegenErrorMessage(""), "unknown error");
  });

  it("plan summary names the source and the seed", () => {
    assert.equal(sdkPlanSummary({ nodes: 9, source: "embedded", new_seed: true, seeds: { "3.seed": 42 } }),
      "9 nodes · current version · new seed 42 · via Comfy SDK");
    assert.equal(sdkPlanSummary({ nodes: 2, source: "stored", seeds: { "3.seed": 7, "5.noise_seed": 8 } }),
      "2 nodes · saved workflow · seed 7 (+1) · via Comfy SDK");
    assert.match(sdkPlanSummary({ nodes: 1, source: "stored", seeds: {} }), /no sampler seed/);
  });

  it("job toasts only for native jobs when done or failed", () => {
    assert.deepEqual(sdkJobToast({ native: true, status: "done" }, "1-1 Rain"), { summary: "New version added", detail: "1-1 Rain", kind: "ok" });
    assert.deepEqual(sdkJobToast({ native: true, status: "error", error: "boom" }, "1-1 Rain"), { summary: "SDK job failed", detail: "1-1 Rain — boom", kind: "warn" });
    assert.equal(sdkJobToast({ native: true, status: "running" }), null);
    assert.equal(sdkJobToast({ native: false, status: "done" }), null);
  });
});

describe("regenConfirmMessage", () => {
  it("question is the modal title, cut label the body", () => {
    assert.deepEqual(splitConfirmMessage(regenConfirmMessage("3. Rain")), { title: REGEN_CONFIRM_TITLE, body: "3. Rain" });
    assert.equal(regenConfirmMessage(""), REGEN_CONFIRM_TITLE);
  });
});

describe("regenKnownNodeCount", () => {
  it("live graph wins over the remembered count", () => {
    assert.equal(regenKnownNodeCount({ live: 4, remembered: 0 }), 4);
    assert.equal(regenKnownNodeCount({ live: 0, remembered: 7 }), 0);
  });
  it("falls back to remembered, else unknown (null)", () => {
    assert.equal(regenKnownNodeCount({ live: null, remembered: 0 }), 0);
    assert.equal(regenKnownNodeCount({ live: null, remembered: undefined }), null);
    assert.equal(regenKnownNodeCount(), null);
  });
});

describe("isRegenEmptyCut", () => {
  it("empty only with no versions and a known zero-node graph", () => {
    assert.equal(isRegenEmptyCut({ versionCount: 0, nodeCount: 0 }), true);
    assert.equal(isRegenEmptyCut({ nodeCount: 0 }), true);
  });
  it("versions, nodes, or an unknown graph keep Regen available", () => {
    assert.equal(isRegenEmptyCut({ versionCount: 2, nodeCount: 0 }), false);
    assert.equal(isRegenEmptyCut({ versionCount: 0, nodeCount: 3 }), false);
    assert.equal(isRegenEmptyCut({ versionCount: 0, nodeCount: null }), false);
  });
});

describe("nativeRegenQueueCheck", () => {
  const good = {
    token: 5,
    currentToken: 5,
    cutId: "c1",
    projectId: "p1",
    loadedCutId: "c1",
    loadedProjectId: "p1",
    graphCutId: "c1",
    graphProjectId: "p1",
    tabActive: true,
    nodeCount: 6,
  };
  it("ok when the cut's graph is open in the active shot tab", () => {
    assert.deepEqual(nativeRegenQueueCheck(good), { ok: true });
    assert.deepEqual(nativeRegenQueueCheck({ ...good, graphProjectId: "" }), { ok: true });
  });
  it("a newer load (other cut clicked meanwhile) wins", () => {
    assert.deepEqual(nativeRegenQueueCheck({ ...good, currentToken: 6 }), { ok: false, reason: "superseded" });
  });
  it("not open: other cut loaded, other project, graph of another cut, or tab not active", () => {
    for (const patch of [
      { loadedCutId: "c2" },
      { loadedProjectId: "p2" },
      { graphCutId: "c2" },
      { graphCutId: "" },
      { graphProjectId: "p2" },
      { tabActive: false },
      { cutId: "" },
    ]) {
      assert.deepEqual(nativeRegenQueueCheck({ ...good, ...patch }), { ok: false, reason: "not-open" }, JSON.stringify(patch));
    }
  });
  it("zero nodes is empty", () => {
    assert.deepEqual(nativeRegenQueueCheck({ ...good, nodeCount: 0 }), { ok: false, reason: "empty" });
  });
  it("every reason has an English message", () => {
    for (const r of ["superseded", "not-open", "empty"]) assert.match(REGEN_SKIP_MESSAGE[r], /Not queued\.$/);
  });
});
