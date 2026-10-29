import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  regenConfirmMessage,
  regenKnownNodeCount,
  isRegenEmptyCut,
  nativeRegenQueueCheck,
  REGEN_CONFIRM_TITLE,
  REGEN_SKIP_MESSAGE,
} from "../../web/gg_native_regen_core.js";
import { splitConfirmMessage } from "../../web/gg_confirm_core.js";

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
