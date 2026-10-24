import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickFreeWorkflowPath,
  pathCollides,
  autosaveModifiedTabs,
  autosaveWorkflow,
  normalizeWorkflowPath,
} from "../../web/gg_autosave_core.js";

function mockTab(overrides = {}) {
  return {
    isModified: true,
    isTemporary: true,
    path: "workflows/cut-a.json",
    filename: "cut-a.json",
    changeTracker: {
      checkState() {},
      prepareForSave() {},
    },
    ...overrides,
  };
}

describe("pickFreeWorkflowPath", () => {
  it("returns desired path when free", () => {
    assert.equal(pickFreeWorkflowPath("workflows/foo.json", []), "workflows/foo.json");
  });

  it("uses (2) on name collision", () => {
    const existing = ["workflows/foo.json"];
    assert.equal(pickFreeWorkflowPath("workflows/foo.json", existing), "workflows/foo (2).json");
  });

  it("collision chain increments", () => {
    const existing = ["workflows/foo.json", "workflows/foo (2).json"];
    assert.equal(pickFreeWorkflowPath("workflows/foo.json", existing), "workflows/foo (3).json");
  });

  it("case-insensitive collision on Windows-style lists", () => {
    const existing = ["workflows/Foo.json"];
    assert.equal(
      pickFreeWorkflowPath("workflows/foo.json", existing, { caseInsensitive: true }),
      "workflows/foo (2).json"
    );
    assert.equal(pathCollides("workflows/foo.json", existing, { caseInsensitive: true }), true);
  });
});

describe("autosaveModifiedTabs", () => {
  it("no modified tabs -> nothing called", async () => {
    const calls = { save: 0, rename: 0, list: 0 };
    const tabs = [mockTab({ isModified: false })];
    const deps = {
      saveWorkflow: async () => {
        calls.save++;
      },
      renameWorkflow: async () => {
        calls.rename++;
      },
      listExistingPaths: async () => {
        calls.list++;
        return [];
      },
    };
    const r = await autosaveModifiedTabs(tabs, deps);
    assert.equal(r.ok, true);
    assert.equal(r.saved.length, 0);
    assert.equal(calls.save, 0);
    assert.equal(calls.rename, 0);
    assert.equal(calls.list, 0);
  });

  it("temporary tab saves to free path", async () => {
    const wf = mockTab({ isTemporary: true, path: "workflows/shot.json" });
    let renamedTo = "";
    const deps = {
      caseInsensitive: true,
      listExistingPaths: async () => [],
      getWorkflowByPath: () => null,
      renameWorkflow: async (w, p) => {
        renamedTo = p;
        w.path = p;
        w.isTemporary = false;
      },
      saveWorkflow: async (w) => {
        w.isModified = false;
      },
    };
    const r = await autosaveModifiedTabs([wf], deps);
    assert.equal(r.ok, true);
    assert.equal(renamedTo, "workflows/shot.json");
    assert.equal(r.saved[0].path, "workflows/shot.json");
  });

  it("persisted tab saved in place without rename", async () => {
    const wf = mockTab({ isTemporary: false, path: "workflows/saved.json" });
    let renamed = false;
    const deps = {
      listExistingPaths: async () => ["workflows/other.json"],
      renameWorkflow: async () => {
        renamed = true;
      },
      saveWorkflow: async (w) => {
        w.isModified = false;
      },
    };
    const r = await autosaveModifiedTabs([wf], deps);
    assert.equal(r.ok, true);
    assert.equal(renamed, false);
    assert.equal(r.saved[0].path, "workflows/saved.json");
  });

  it("save throws -> ok false, later tabs untouched", async () => {
    const first = mockTab({ path: "workflows/a.json", filename: "a.json" });
    const second = mockTab({ path: "workflows/b.json", filename: "b.json" });
    let secondTouched = false;
    const deps = {
      listExistingPaths: async () => [],
      getWorkflowByPath: () => null,
      renameWorkflow: async (w, p) => {
        w.path = p;
        w.isTemporary = false;
      },
      saveWorkflow: async (w) => {
        if (w === first) throw new Error("disk full");
        secondTouched = true;
        w.isModified = false;
      },
    };
    const r = await autosaveModifiedTabs([first, second], deps);
    assert.equal(r.ok, false);
    assert.equal(r.failed?.name, "a.json");
    assert.equal(secondTouched, false);
    assert.equal(first.isModified, true);
  });

  it("still modified after save -> failure", async () => {
    const wf = mockTab({ isTemporary: false });
    const deps = {
      saveWorkflow: async () => {},
    };
    await assert.rejects(() => autosaveWorkflow(wf, deps), /still modified/);
  });

  it("missing saveWorkflow -> failure", async () => {
    const wf = mockTab();
    const r = await autosaveModifiedTabs([wf], { listExistingPaths: async () => [] });
    assert.equal(r.ok, false);
    assert.match(r.failed?.error || "", /saveWorkflow unavailable/);
  });

  it("missing renameWorkflow on temporary tab -> failure", async () => {
    const wf = mockTab({ isTemporary: true });
    const deps = {
      saveWorkflow: async () => {},
      listExistingPaths: async () => [],
    };
    const r = await autosaveModifiedTabs([wf], deps);
    assert.equal(r.ok, false);
    assert.match(r.failed?.error || "", /renameWorkflow unavailable/);
  });

  it("existing-paths listing failing -> failure (do not guess names)", async () => {
    const wf = mockTab({ isTemporary: true });
    const deps = {
      saveWorkflow: async () => {},
      renameWorkflow: async () => {},
      listExistingPaths: async () => {
        throw new Error("network down");
      },
    };
    const r = await autosaveModifiedTabs([wf], deps);
    assert.equal(r.ok, false);
    assert.match(r.failed?.error || "", /network down/);
  });

  it("listExistingPaths non-array -> failure", async () => {
    const wf = mockTab({ isTemporary: true });
    const deps = {
      saveWorkflow: async () => {},
      renameWorkflow: async () => {},
      listExistingPaths: async () => null,
    };
    const r = await autosaveModifiedTabs([wf], deps);
    assert.equal(r.ok, false);
    assert.match(r.failed?.error || "", /listExistingPaths failed/);
  });
});

describe("normalizeWorkflowPath", () => {
  it("strips leading slashes", () => {
    assert.equal(normalizeWorkflowPath("/workflows/x.json"), "workflows/x.json");
  });
});
