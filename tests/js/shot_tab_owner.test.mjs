import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  workflowPathKey,
  isShotTabAtOwnedPath,
  findWorkflowAtShotPath,
  shotWorkflowRelPathById,
} from "../../web/gg_shot_names.js";

const PID = "01a18b6d-03ca-7370-a1af-3379c125231c";
const CUT = "01a18b6d-03cd-7987-b0bb-5bd47e02ef01";
const LOAD_NAME = shotWorkflowRelPathById({ projectId: PID, cutId: CUT });
const STABLE = `workflows/${LOAD_NAME}`;
const TEMPLATE = `workflows/gonggan/${PID}/My template.json`;

function wf(path, extra = {}) {
  return { path, isTemporary: false, ...extra };
}

/** Minimal ComfyUI 1.55 workflow store: a lookup by full path plus the open tab order. */
function makeStore(entries, openPaths, activePath) {
  const lookup = new Map(entries.map((w) => [w.path, w]));
  const store = {
    lookup,
    openPaths: [...openPaths],
    activePath,
    getWorkflowByPath: (p) => lookup.get(p) ?? null,
    get openWorkflows() {
      return store.openPaths.map((p) => lookup.get(p)).filter(Boolean);
    },
  };
  return store;
}

/**
 * ComfyUI 1.55.18 `activateLoadedWorkflow` tab rule (workflowService.ts): a ComfyWorkflow is opened
 * and reused; a path string reuses the same-path entry only when it is unloaded or active, else a new
 * temporary "<name> (2).json" tab is made.
 */
function comfyLoadGraphData(store, target) {
  if (typeof target === "string") {
    const full = `workflows/${target}`;
    const existing = store.getWorkflowByPath(full);
    if (existing && (existing.unloaded || store.activePath === existing.path)) {
      target = existing;
    } else {
      let n = 2;
      let p = full;
      while (store.lookup.has(p)) p = full.replace(/\.json$/, ` (${n++}).json`);
      target = { path: p, isTemporary: true };
      store.lookup.set(p, target);
    }
  }
  if (!store.openPaths.includes(target.path)) store.openPaths.push(target.path);
  target.unloaded = false;
  store.activePath = target.path;
}

describe("workflowPathKey", () => {
  it("drops workflows/ and leading slashes, lower-cases, normalizes backslashes", () => {
    assert.equal(workflowPathKey("workflows/Gonggan/P/C.json"), "gonggan/p/c.json");
    assert.equal(workflowPathKey("/gonggan\\P\\C.json"), "gonggan/p/c.json");
    assert.equal(workflowPathKey(""), "");
    assert.equal(workflowPathKey(undefined), "");
  });
});

describe("isShotTabAtOwnedPath", () => {
  it("owned while at the recorded path (case-insensitive)", () => {
    const tab = wf(STABLE.toUpperCase(), { ggGongganOwned: true, ggGongganOwnedPath: workflowPathKey(STABLE) });
    assert.equal(isShotTabAtOwnedPath(tab), true);
  });

  it("not owned after ComfyUI Save renamed the never-saved shot tab to the user's file", () => {
    const tab = wf(STABLE, {
      ggGongganOwned: true,
      ggGongganOwnedPath: workflowPathKey(STABLE),
      ggGongganMeta: { projectId: PID, cutId: CUT },
    });
    tab.path = TEMPLATE;
    assert.equal(isShotTabAtOwnedPath(tab, () => true), false);
  });

  it("a Save As copy (new tab object, same extra.gonggan) is not owned unless its path is a shot path", () => {
    const copy = wf(TEMPLATE, { activeState: { extra: { gonggan: { projectId: PID, cutId: CUT } } } });
    assert.equal(isShotTabAtOwnedPath(copy), false);
    assert.equal(isShotTabAtOwnedPath(copy, (k) => k === workflowPathKey(STABLE)), false);
  });

  it("our own auto-save rename re-records the path and stays owned", () => {
    const tab = wf("workflows/Unsaved Workflow.json", { ggGongganOwned: true, ggGongganOwnedPath: "unsaved workflow.json" });
    tab.path = STABLE;
    tab.ggGongganOwnedPath = workflowPathKey(STABLE);
    assert.equal(isShotTabAtOwnedPath(tab), true);
  });

  it("an unflagged tab counts only when its path is a known shot path", () => {
    assert.equal(isShotTabAtOwnedPath(wf(STABLE), (k) => k === workflowPathKey(STABLE)), true);
    assert.equal(isShotTabAtOwnedPath(wf(STABLE)), false);
    assert.equal(isShotTabAtOwnedPath(wf(""), () => true), false);
    assert.equal(isShotTabAtOwnedPath(null, () => true), false);
  });
});

describe("findWorkflowAtShotPath", () => {
  it("finds the cut tab while a Save As copy is the active tab", () => {
    const cutTab = wf(STABLE);
    const copy = wf(TEMPLATE, { ggGongganMeta: { projectId: PID, cutId: CUT } });
    const store = makeStore([cutTab, copy], [STABLE, TEMPLATE], TEMPLATE);
    assert.equal(findWorkflowAtShotPath(store, LOAD_NAME), cutTab);
  });

  it("finds a closed-but-known saved entry, and matches case-insensitively among open tabs", () => {
    const closed = wf(STABLE, { unloaded: true });
    assert.equal(findWorkflowAtShotPath(makeStore([closed], [], ""), LOAD_NAME), closed);
    const odd = wf(STABLE.replace(CUT, CUT.toUpperCase()));
    const store = { getWorkflowByPath: () => null, openWorkflows: [odd] };
    assert.equal(findWorkflowAtShotPath(store, LOAD_NAME), odd);
  });

  it("null when nothing sits at the cut's path (cut tab renamed away by Save)", () => {
    const renamed = wf(TEMPLATE, { ggGongganOwned: true, ggGongganMeta: { projectId: PID, cutId: CUT } });
    assert.equal(findWorkflowAtShotPath(makeStore([renamed], [TEMPLATE], TEMPLATE), LOAD_NAME), null);
    assert.equal(findWorkflowAtShotPath(null, LOAD_NAME), null);
    assert.equal(findWorkflowAtShotPath(makeStore([], [], ""), ""), null);
  });

  it("regression: repeated cut clicks after Save As keep the tab count (path string would add (2), (3)…)", () => {
    const clicks = (useTabObject) => {
      const store = makeStore([wf(STABLE), wf(TEMPLATE)], [STABLE, TEMPLATE], TEMPLATE);
      const counts = [];
      for (let i = 0; i < 4; i++) {
        if (i % 2) store.activePath = TEMPLATE;
        const target = useTabObject ? findWorkflowAtShotPath(store, LOAD_NAME) || LOAD_NAME : LOAD_NAME;
        comfyLoadGraphData(store, target);
        counts.push(store.openPaths.length);
        assert.equal(store.activePath, useTabObject ? STABLE : store.activePath);
      }
      return counts;
    };
    assert.deepEqual(clicks(true), [2, 2, 2, 2]);
    assert.deepEqual(clicks(false), [3, 4, 5, 6]);
  });
});
