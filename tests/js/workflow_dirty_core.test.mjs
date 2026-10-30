import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  graphContentDiffers,
  filterTabsNeedingAutosave,
  workflowTabNeedsAutosave,
} from "../../web/gg_workflow_dirty_core.js";

describe("workflowTabNeedsAutosave", () => {
  it("returns false when tab is not modified", () => {
    assert.equal(workflowTabNeedsAutosave({ isModified: false }, {}), false);
  });

  it("returns false when modified flag disagrees with baseline widgets", () => {
    const baseline = { nodes: [{ id: 1, widgets_values: ["a"] }] };
    const current = { nodes: [{ id: 1, widgets_values: ["a"] }] };
    assert.equal(
      workflowTabNeedsAutosave(
        { isModified: true },
        { cutId: "c1", baselineCutId: "c1", baseline, currentSnapshot: current, graphCutId: "c1" }
      ),
      false
    );
  });

  it("returns true when widget values differ", () => {
    const baseline = { nodes: [{ id: 1, widgets_values: ["a"] }] };
    const current = { nodes: [{ id: 1, widgets_values: ["b"] }] };
    assert.equal(
      workflowTabNeedsAutosave(
        { isModified: true },
        { cutId: "c1", baselineCutId: "c1", baseline, currentSnapshot: current, graphCutId: "c1" }
      ),
      true
    );
  });

  it("returns true when content differs but isModified is false (missed dirty flag)", () => {
    const baseline = { nodes: [{ id: 1, widgets_values: ["a"] }] };
    const current = { nodes: [{ id: 1, widgets_values: ["edited"] }] };
    assert.equal(
      workflowTabNeedsAutosave(
        { isModified: false },
        { cutId: "c1", baselineCutId: "c1", baseline, currentSnapshot: current, graphCutId: "c1" }
      ),
      true
    );
  });
});

describe("filterTabsNeedingAutosave", () => {
  it("filters tabs using ctx callback", () => {
    const tabs = [{ isModified: true }, { isModified: false }];
    const snap = { nodes: [{ id: 1, widgets_values: ["a"] }] };
    const out = filterTabsNeedingAutosave(tabs, (wf) => ({
      cutId: "x",
      baselineCutId: "x",
      baseline: snap,
      currentSnapshot: wf.isModified ? { nodes: [{ id: 1, widgets_values: ["b"] }] } : snap,
      graphCutId: "x",
    }));
    assert.equal(out.length, 1);
    assert.equal(out[0], tabs[0]);
  });
});

describe("graphContentDiffers (no edit may be missed)", () => {
  const base = () => ({
    version: 0.4, last_node_id: 3, extra: { ds: { scale: 1 } },
    nodes: [
      { id: 1, type: "A", pos: [0, 0], size: [100, 50], mode: 0, inputs: [{ name: "x", link: 5 }], widgets_values: ["a"] },
      { id: 2, type: "B", pos: [200, 0], size: [100, 50], mode: 0, inputs: [], widgets_values: [] },
    ],
    links: [[5, 2, 0, 1, 0, "IMAGE"]],
    groups: [],
  });
  it("identical or only volatile fields (extra, size) => clean", () => {
    const b = base();
    const c = base();
    c.extra.ds.scale = 3;
    c.nodes[0].size = [120, 60];
    assert.equal(graphContentDiffers(b, c), false);
  });
  it("widget edit", () => { const c = base(); c.nodes[0].widgets_values = ["b"]; assert.equal(graphContentDiffers(base(), c), true); });
  it("link removed/changed", () => { const c = base(); c.links = []; c.nodes[0].inputs[0].link = null; assert.equal(graphContentDiffers(base(), c), true); });
  it("bypass/mute mode", () => { const c = base(); c.nodes[1].mode = 4; assert.equal(graphContentDiffers(base(), c), true); });
  it("node moved", () => { const c = base(); c.nodes[1].pos = [250, 10]; assert.equal(graphContentDiffers(base(), c), true); });
  it("node added / removed", () => {
    const c = base(); c.nodes.push({ id: 3, type: "C", pos: [0, 0], widgets_values: [] });
    assert.equal(graphContentDiffers(base(), c), true);
    const d = base(); d.nodes.pop();
    assert.equal(graphContentDiffers(base(), d), true);
  });
  it("group added", () => { const c = base(); c.groups = [{ title: "g", bounding: [0, 0, 1, 1] }]; assert.equal(graphContentDiffers(base(), c), true); });
  it("wildcard slot type resolving after reload (* -> MODEL) => clean, also inside subgraphs", () => {
    const b = base();
    b.nodes[0].inputs[0].type = "*";
    b.nodes[1].outputs = [{ name: "o", type: "*", links: [5] }];
    b.definitions = { subgraphs: [{ nodes: [{ id: 9, outputs: [{ name: "img", type: "*" }], widgets_values: [1] }] }] };
    const c = JSON.parse(JSON.stringify(b));
    c.nodes[0].inputs[0].type = "MODEL";
    c.nodes[1].outputs[0].type = "MODEL";
    c.definitions.subgraphs[0].nodes[0].outputs[0].type = "IMAGE";
    assert.equal(graphContentDiffers(b, c), false);
  });
  it("slot link change or subgraph widget edit still counts", () => {
    const b = base();
    b.nodes[1].outputs = [{ name: "o", type: "*", links: [5] }];
    b.definitions = { subgraphs: [{ nodes: [{ id: 9, widgets_values: [1] }] }] };
    const c = JSON.parse(JSON.stringify(b));
    c.nodes[1].outputs[0].links = [];
    assert.equal(graphContentDiffers(b, c), true);
    const d = JSON.parse(JSON.stringify(b));
    d.definitions.subgraphs[0].nodes[0].widgets_values = [2];
    assert.equal(graphContentDiffers(b, d), true);
    const e = JSON.parse(JSON.stringify(b));
    e.links[0][5] = "LATENT";
    assert.equal(graphContentDiffers(b, e), true);
  });
  it("unreadable => differs (safe side)", () => {
    assert.equal(graphContentDiffers(null, base()), true);
    assert.equal(graphContentDiffers(base(), undefined), true);
  });
});