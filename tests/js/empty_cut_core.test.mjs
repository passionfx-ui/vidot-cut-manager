import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyCutBlankGraph,
  emptyCutWorkflowKind,
  isEmptyCutSourcePayload,
  resolveEmptyCutWorkflow,
  workflowNodeCount,
} from "../../web/gg_empty_cut_core.js";

describe("isEmptyCutSourcePayload", () => {
  it("matches ok payload with null source and workflow", () => {
    assert.equal(isEmptyCutSourcePayload({ ok: true, source: null, workflow: null }), true);
  });

  it("rejects when workflow present", () => {
    assert.equal(isEmptyCutSourcePayload({ ok: true, source: "template", workflow: { nodes: [] } }), false);
  });
});

describe("resolveEmptyCutWorkflow", () => {
  it("uses template UI graph when nodes present", () => {
    const tpl = { nodes: [{ id: 1 }], links: [] };
    const r = resolveEmptyCutWorkflow({ templateWorkflow: tpl });
    assert.equal(emptyCutWorkflowKind(r), "template");
    assert.equal(r.workflow, tpl);
  });

  it("falls back to blank when no template", () => {
    const r = resolveEmptyCutWorkflow({ templateWorkflow: null });
    assert.equal(emptyCutWorkflowKind(r), "blank");
    assert.equal(workflowNodeCount(r.workflow), 0);
  });

  it("blank graph is valid UI workflow", () => {
    const b = emptyCutBlankGraph();
    assert.deepEqual(b.nodes, []);
    assert.equal(b.version, 0.4);
  });
});
