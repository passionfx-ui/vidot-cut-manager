import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  stepMove,
  moveToScene,
  canMoveUp,
  canMoveDown,
  createUndoBurst,
  snapshotOrderGroups,
  dropHighlight,
} from "../../web/gg_reorder_core.js";

const groups = [
  { id: "g1", name: "A", cut_ids: ["a", "b"], collapsed: false },
  { id: "g2", name: "B", cut_ids: ["c"], collapsed: false },
];
const order = ["a", "b", "c"];

describe("canMoveUp/Down", () => {
  it("blocks at ends", () => {
    assert.equal(canMoveUp(order, ["a"]), false);
    assert.equal(canMoveDown(order, ["c"]), false);
    assert.ok(canMoveDown(order, ["a"]));
    assert.ok(canMoveUp(order, ["c"]));
  });
});

describe("dropHighlight", () => {
  it("targets the scene; same scene is not cross", () => {
    assert.deepEqual(dropHighlight(groups, ["a"], "g1"), { groupId: "g1", crossScene: false });
  });

  it("marks cross-scene when the target differs", () => {
    assert.deepEqual(dropHighlight(groups, ["a"], "g2"), { groupId: "g2", crossScene: true });
  });

  it("null/empty target means Ungrouped section", () => {
    assert.deepEqual(dropHighlight(groups, ["a"], null), { groupId: null, crossScene: true });
    assert.deepEqual(dropHighlight(groups, ["a"], ""), { groupId: null, crossScene: true });
    assert.deepEqual(dropHighlight(groups, ["z"], undefined), { groupId: null, crossScene: false });
  });

  it("multi-select is cross if any cut changes scene", () => {
    assert.equal(dropHighlight(groups, ["a", "b"], "g1").crossScene, false);
    assert.equal(dropHighlight(groups, ["a", "c"], "g1").crossScene, true);
    assert.equal(dropHighlight(null, ["a"], "g1").crossScene, true);
  });
});

describe("stepMove", () => {
  it("moves one cut down", () => {
    const r = stepMove(order, groups, ["a"], 1);
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["b", "a", "c"]);
  });

  it("moves one cut up into previous scene", () => {
    const r = stepMove(order, groups, ["c"], -1);
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["a", "c", "b"]);
    assert.deepEqual(r.groups[0].cut_ids, ["a", "c", "b"]);
  });

  it("moves multi-selection together", () => {
    const r = stepMove(order, groups, ["a", "b"], 1);
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["c", "a", "b"]);
    assert.deepEqual(r.groups[1].cut_ids, ["c", "a", "b"]);
  });

  it("no-op at top", () => {
    const r = stepMove(order, groups, ["a"], -1);
    assert.equal(r.changed, false);
  });

  it("crosses scene boundary on step down from g1 to g2 edge", () => {
    const r = stepMove(order, groups, ["b"], 1);
    assert.deepEqual(r.order, ["a", "c", "b"]);
    assert.ok(!r.groups[0].cut_ids.includes("b"));
    assert.deepEqual(r.groups[1].cut_ids, ["c", "b"]);
  });
});

describe("moveToScene", () => {
  it("appends to target scene", () => {
    const r = moveToScene(order, groups, ["a"], "g2");
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["b", "c", "a"]);
    assert.deepEqual(r.groups[0].cut_ids, ["b"]);
    assert.deepEqual(r.groups[1].cut_ids, ["c", "a"]);
  });

  it("appends to ungrouped (No scene)", () => {
    const ord = ["a", "b", "c"];
    const gr = [
      { id: "g1", name: "A", cut_ids: ["a", "b"], collapsed: false },
      { id: "g2", name: "B", cut_ids: ["c"], collapsed: false },
    ];
    const r = moveToScene(ord, gr, ["a"], null);
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["b", "c", "a"]);
    assert.deepEqual(r.groups[0].cut_ids, ["b"]);
  });
});

describe("createUndoBurst", () => {
  it("keeps first snapshot within window", () => {
    const b = createUndoBurst({ windowMs: 1500 });
    const s1 = { order: ["a"], groups: [] };
    const s2 = { order: ["b"], groups: [] };
    assert.deepEqual(b.push(s1, 1000), s1);
    assert.deepEqual(b.push(s2, 1200), s1);
    assert.deepEqual(b.push(s2, 3000), s2);
  });
});

describe("snapshotOrderGroups", () => {
  it("clones timeline order and groups", () => {
    const s = snapshotOrderGroups({ cuts: [{ id: "x" }, { id: "y" }], groups: [{ id: "g", cut_ids: ["x"] }] });
    assert.deepEqual(s.order, ["x", "y"]);
    assert.notEqual(s.groups, [{ id: "g", cut_ids: ["x"] }]);
  });
});
