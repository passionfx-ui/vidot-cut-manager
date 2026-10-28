import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readCutWorkflowKindSwitch,
  repMediaKind,
  resolveEffectiveWorkflowKind,
  shouldTryEmbeddedRepWorkflow,
  workflowSourceToastDetail,
  CUT_WF_KIND_KEY,
} from "../../web/gg_rep_wf_core.js";

describe("resolveEffectiveWorkflowKind", () => {
  it("switch beats rep kind", () => {
    assert.equal(resolveEffectiveWorkflowKind({ userKind: "video", repKind: "image" }), "video");
  });

  it("falls back to rep then null", () => {
    assert.equal(resolveEffectiveWorkflowKind({ userKind: null, repKind: "image" }), "image");
    assert.equal(resolveEffectiveWorkflowKind({ userKind: "", repKind: "video" }), "video");
    assert.equal(resolveEffectiveWorkflowKind({ userKind: null, repKind: null }), null);
  });
});

describe("repMediaKind", () => {
  it("uses pick version kind", () => {
    const cut = {
      pick: "v2",
      versions_list: [
        { id: "v1", kind: "image" },
        { id: "v2", kind: "video" },
      ],
    };
    assert.equal(repMediaKind(cut), "video");
  });
});

describe("readCutWorkflowKindSwitch", () => {
  it("reads per-cut map from storage", () => {
    const bag = new Map();
    const storage = {
      getItem: (k) => (bag.has(k) ? bag.get(k) : null),
      setItem: (k, v) => bag.set(k, v),
    };
    storage.setItem(CUT_WF_KIND_KEY, JSON.stringify({ c1: "video" }));
    assert.equal(readCutWorkflowKindSwitch(storage, "c1"), "video");
    assert.equal(readCutWorkflowKindSwitch(storage, "c2"), null);
  });
});

describe("shouldTryEmbeddedRepWorkflow", () => {
  it("skips when effective kind is video", () => {
    const cut = { media: { kind: "image", id: "x" }, pick: "x", versions_list: [{ id: "x", kind: "image" }] };
    assert.equal(shouldTryEmbeddedRepWorkflow(cut, "video"), false);
    assert.equal(shouldTryEmbeddedRepWorkflow(cut, "image"), true);
  });

  it("skips non-image media", () => {
    const cut = { media: { kind: "video", id: "x" } };
    assert.equal(shouldTryEmbeddedRepWorkflow(cut, "image"), false);
  });
});

describe("workflowSourceToastDetail", () => {
  it("appends fallback when present", () => {
    const d = workflowSourceToastDetail("stored version workflow", "no video workflow yet — opened latest image workflow");
    assert.match(d, /stored version workflow · no video workflow/);
  });
});
