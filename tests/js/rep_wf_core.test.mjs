import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readCutWorkflowKindSwitch,
  repMediaKind,
  resolveEffectiveWorkflowKind,
  shouldTryEmbeddedRepWorkflow,
  workflowSourceToastDetail,
  CUT_WF_KIND_KEY,
  VERSION_WF_MISSING,
  findCutVersion,
  isOpenVersion,
  versionWorkflowSourceOrder,
  workflowFromVersionRecord,
  storedCutKindFromWorkflow,
  workflowGraphKind,
  graphFitsKind,
} from "../../web/gg_rep_wf_core.js";
import { readFileSync } from "node:fs";

describe("workflowGraphKind", () => {
  it("reads UI and API graphs", () => {
    assert.equal(workflowGraphKind({ nodes: [{ type: "EmptyFlux2LatentImage" }, { type: "SaveImage" }] }), "image");
    assert.equal(workflowGraphKind({ nodes: [{ type: "LTXVImgToVideo" }, { type: "SaveImage" }] }), "video");
    assert.equal(workflowGraphKind({ 1: { class_type: "SaveAnimatedWEBP" } }), "video");
    assert.equal(workflowGraphKind({ 1: { class_type: "PreviewImage" } }), "image");
    assert.equal(workflowGraphKind({ nodes: [{ type: "KSampler" }] }), null);
    assert.equal(workflowGraphKind(null), null);
  });

  it("stored cut kind reads the saved graph, including subgraphs", () => {
    assert.equal(storedCutKindFromWorkflow({ nodes: [{ type: "SaveImage" }] }), "image");
    assert.equal(storedCutKindFromWorkflow({
      nodes: [{ type: "57" }],
      definitions: { subgraphs: [{ nodes: [{ type: "LTXVImgToVideo" }] }] },
    }), "video");
    assert.equal(storedCutKindFromWorkflow({ nodes: [{ type: "KSampler" }] }), null);
    assert.equal(storedCutKindFromWorkflow(null), null);
  });

  it("graphFitsKind rejects only the clearly other kind", () => {
    const img = { nodes: [{ type: "SaveImage" }] };
    assert.equal(graphFitsKind(img, "image"), true);
    assert.equal(graphFitsKind(img, "video"), false);
    assert.equal(graphFitsKind(img, null), true);
    assert.equal(graphFitsKind({ nodes: [{ type: "KSampler" }] }, "video"), true);
  });
});

describe("selected media kind picks the workflow", () => {
  const src = readFileSync(new URL("../../web/gonggan.js", import.meta.url), "utf8");
  it("no stale saved Image/Video switch overrides the selected media", () => {
    assert.doesNotMatch(src, /readCutWorkflowKindSwitch\(/);
  });
  it("a version without its own workflow opens the workflow of its kind", () => {
    assert.match(src, /if \(await loadVersionKindWorkflow\(cut, ver, name, loadToken\)\) return;/);
    assert.match(src, /fetchCutSourceWorkflowPayload\(cut\.id, cut, kind\)/);
  });
  it("a timeline click loads that clip only while the shot tab is already active", () => {
    assert.match(src, /shouldScheduleCutWorkflowLoad\(\{ multi, range, fromTimeline, shotTabActive \}\)/);
  });
});

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

describe("versionWorkflowSourceOrder", () => {
  it("image: embedded PNG workflow first, then stored", () => {
    assert.deepEqual(versionWorkflowSourceOrder({ id: "v1", kind: "image" }), ["embedded", "stored"]);
  });

  it("video or unknown kind: stored only", () => {
    assert.deepEqual(versionWorkflowSourceOrder({ id: "v1", kind: "video" }), ["stored"]);
    assert.deepEqual(versionWorkflowSourceOrder({ id: "v1" }), ["stored"]);
  });

  it("missing version: nothing to try", () => {
    assert.deepEqual(versionWorkflowSourceOrder(null), []);
    assert.deepEqual(versionWorkflowSourceOrder({ kind: "image" }), []);
  });

  it("does not depend on the pick", () => {
    const cut = { pick: "v2", versions_list: [{ id: "v1", kind: "image" }, { id: "v2", kind: "video" }] };
    assert.deepEqual(versionWorkflowSourceOrder(findCutVersion(cut, "v1")), ["embedded", "stored"]);
    assert.equal(cut.pick, "v2");
  });
});

describe("findCutVersion", () => {
  it("finds by id, else null", () => {
    const cut = { versions_list: [{ id: "a" }, { id: "b", kind: "video" }] };
    assert.equal(findCutVersion(cut, "b").kind, "video");
    assert.equal(findCutVersion(cut, "zz"), null);
    assert.equal(findCutVersion({}, "a"), null);
    assert.equal(findCutVersion(cut, ""), null);
  });
});

describe("workflowFromVersionRecord", () => {
  it("prefers the UI graph, falls back to the API prompt", () => {
    const ui = { nodes: [{ id: 1 }] };
    const api = { 3: { class_type: "KSampler", inputs: {} } };
    assert.equal(workflowFromVersionRecord({ workflow: ui, prompt: api }), ui);
    assert.equal(workflowFromVersionRecord({ workflow: null, prompt: api }), api);
  });

  it("null when nothing usable", () => {
    assert.equal(workflowFromVersionRecord(null), null);
    assert.equal(workflowFromVersionRecord({ ok: false }), null);
    assert.equal(workflowFromVersionRecord({ workflow: {}, prompt: null }), null);
    assert.equal(workflowFromVersionRecord({ workflow: [], prompt: [] }), null);
  });

  it("missing toast text", () => {
    assert.equal(VERSION_WF_MISSING, "No workflow saved for this version.");
  });
});

describe("isOpenVersion", () => {
  const open = { projectId: "p", cutId: "c", vid: "v1" };
  it("matches project, cut and version while the shot tab is open", () => {
    assert.equal(isOpenVersion(open, { projectId: "p", cutId: "c", vid: "v1", tabOpen: true }), true);
  });

  it("false for other version, cut, project, closed tab, or nothing opened", () => {
    assert.equal(isOpenVersion(open, { projectId: "p", cutId: "c", vid: "v2", tabOpen: true }), false);
    assert.equal(isOpenVersion(open, { projectId: "p", cutId: "d", vid: "v1", tabOpen: true }), false);
    assert.equal(isOpenVersion(open, { projectId: "q", cutId: "c", vid: "v1", tabOpen: true }), false);
    assert.equal(isOpenVersion(open, { projectId: "p", cutId: "c", vid: "v1", tabOpen: false }), false);
    assert.equal(isOpenVersion(null, { projectId: "p", cutId: "c", vid: "v1", tabOpen: true }), false);
  });
});

describe("workflowSourceToastDetail", () => {
  it("appends fallback when present", () => {
    const d = workflowSourceToastDetail("stored version workflow", "no video workflow yet — opened latest image workflow");
    assert.match(d, /stored version workflow · no video workflow/);
  });
});
