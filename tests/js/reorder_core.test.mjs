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
import { computeCutLabels, moveCuts } from "../../web/gg_cuts_core.js";

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

describe("cut labels after moves (computeCutLabels)", () => {
  // Scene 1 = a b c (1-1..1-3), Scene 2 = d e (2-1, 2-2)
  const ord0 = ["a", "b", "c", "d", "e"];
  const grp0 = [
    { id: "g1", name: "S1", cut_ids: ["a", "b", "c"], collapsed: false },
    { id: "g2", name: "S2", cut_ids: ["d", "e"], collapsed: false },
  ];

  function timelineOf(order, groups) {
    const mem = new Map();
    for (const g of groups) for (const id of g.cut_ids) mem.set(id, g.id);
    return { cuts: order.map((id) => ({ id, group_id: mem.get(id) || "" })) };
  }

  function labels(order, groups) {
    return Object.fromEntries([...computeCutLabels(timelineOf(order, groups))].map(([id, v]) => [id, v.label]));
  }

  it("starts as 1-1..1-3, 2-1..2-2", () => {
    assert.deepEqual(labels(ord0, grp0), { a: "1-1", b: "1-2", c: "1-3", d: "2-1", e: "2-2" });
  });

  it("moving 1-3 into scene 2 makes it 2-x; scene 1 stays 1-1, 1-2", () => {
    const r = moveToScene(ord0, grp0, ["c"], "g2");
    assert.ok(r.changed);
    assert.deepEqual(labels(r.order, r.groups), { a: "1-1", b: "1-2", d: "2-1", e: "2-2", c: "2-3" });
  });

  it("moving 1-1 out renumbers the rest of scene 1 contiguously", () => {
    const r = moveToScene(ord0, grp0, ["a"], "g2");
    assert.deepEqual(labels(r.order, r.groups), { b: "1-1", c: "1-2", d: "2-1", e: "2-2", a: "2-3" });
  });

  it("moving into the middle of scene 2 shifts later cuts", () => {
    const r = moveCuts(ord0, grp0, ["c"], { toIndex: 3, toGroupId: "g2" });
    assert.deepEqual(r.order, ["a", "b", "d", "c", "e"]);
    assert.deepEqual(labels(r.order, r.groups), { a: "1-1", b: "1-2", d: "2-1", c: "2-2", e: "2-3" });
  });

  it("moving back restores order, groups and labels", () => {
    const there = moveToScene(ord0, grp0, ["c"], "g2");
    const back = moveCuts(there.order, there.groups, ["c"], { toIndex: 2, toGroupId: "g1" });
    assert.deepEqual(back.order, ord0);
    assert.deepEqual(back.groups, grp0);
    assert.deepEqual(labels(back.order, back.groups), labels(ord0, grp0));
  });

  it("labels stay keyed by the same cut ids (ids never change)", () => {
    const r = moveToScene(ord0, grp0, ["b", "c"], "g2");
    const m = computeCutLabels(timelineOf(r.order, r.groups));
    assert.deepEqual([...m.keys()].sort(), [...ord0].sort());
    assert.deepEqual([...r.order].sort(), [...ord0].sort());
    assert.deepEqual(labels(r.order, r.groups), { a: "1-1", d: "2-1", e: "2-2", b: "2-3", c: "2-4" });
  });

  it("emptying scene 1 makes scene 2 the first scene", () => {
    const r = moveToScene(ord0, grp0, ["a", "b", "c"], "g2");
    assert.deepEqual(labels(r.order, r.groups), { d: "1-1", e: "1-2", a: "1-3", b: "1-4", c: "1-5" });
  });

  it("stepMove down across the boundary renumbers both scenes", () => {
    const r = stepMove(ord0, grp0, ["c"], 1);
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["a", "b", "d", "c", "e"]);
    assert.deepEqual(labels(r.order, r.groups), { a: "1-1", b: "1-2", d: "2-1", c: "2-2", e: "2-3" });
  });

  it("stepMove up across the boundary renumbers both scenes", () => {
    const r = stepMove(ord0, grp0, ["d"], -1);
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["a", "b", "d", "c", "e"]);
    assert.deepEqual(labels(r.order, r.groups), { a: "1-1", b: "1-2", d: "1-3", c: "1-4", e: "2-1" });
  });

  it("stepMove round trip across the boundary returns to the start", () => {
    const down = stepMove(ord0, grp0, ["c"], 1);
    const up = stepMove(down.order, down.groups, ["c"], -1);
    assert.deepEqual(up.order, ["a", "b", "c", "d", "e"]);
    assert.deepEqual(labels(up.order, up.groups), { a: "1-1", b: "1-2", c: "2-1", d: "2-2", e: "2-3" });
    const up2 = stepMove(up.order, up.groups, ["c"], -1);
    assert.deepEqual(labels(up2.order, up2.groups), { a: "1-1", c: "1-2", b: "1-3", d: "2-1", e: "2-2" });
    const down2 = stepMove(up2.order, up2.groups, ["c"], 1);
    assert.deepEqual(down2.order, ord0);
    assert.deepEqual(down2.groups, grp0);
    assert.deepEqual(labels(down2.order, down2.groups), labels(ord0, grp0));
  });

  it("ungrouping a cut gives it its own block number, regrouping restores", () => {
    const loose = moveToScene(ord0, grp0, ["c"], null);
    assert.deepEqual(loose.order, ["a", "b", "d", "e", "c"]);
    assert.deepEqual(labels(loose.order, loose.groups), { a: "1-1", b: "1-2", d: "2-1", e: "2-2", c: "3-1" });
    const back = moveCuts(loose.order, loose.groups, ["c"], { toIndex: 2, toGroupId: "g1" });
    assert.deepEqual(labels(back.order, back.groups), labels(ord0, grp0));
  });
});

describe("snapshotOrderGroups", () => {
  it("clones timeline order and groups", () => {
    const s = snapshotOrderGroups({ cuts: [{ id: "x" }, { id: "y" }], groups: [{ id: "g", cut_ids: ["x"] }] });
    assert.deepEqual(s.order, ["x", "y"]);
    assert.notEqual(s.groups, [{ id: "g", cut_ids: ["x"] }]);
  });
});
