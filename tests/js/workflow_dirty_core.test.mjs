import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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
});

describe("filterTabsNeedingAutosave", () => {
  it("filters tabs using ctx callback", () => {
    const tabs = [{ isModified: true }, { isModified: false }];
    const out = filterTabsNeedingAutosave(tabs, () => ({
      cutId: "x",
      baselineCutId: "x",
      baseline: { nodes: [] },
      currentSnapshot: { nodes: [{ id: 1, widgets_values: [] }] },
      graphCutId: "x",
    }));
    assert.equal(out.length, 1);
    assert.equal(out[0], tabs[0]);
  });
});
