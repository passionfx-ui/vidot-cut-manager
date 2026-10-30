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
  moveScene,
  sceneDropBeforeCut,
  sceneBlocks,
  sceneDropTarget,
  emptySceneDropTarget,
  listOrder,
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

  it("appends to Ungrouped", () => {
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

describe("moveScene", () => {
  // S1 = a b c, S2 = d e, S3 = f
  const ord = ["a", "b", "c", "d", "e", "f"];
  const grp = [
    { id: "g1", name: "S1", cut_ids: ["a", "b", "c"], collapsed: false },
    { id: "g2", name: "S2", cut_ids: ["d", "e"], collapsed: true },
    { id: "g3", name: "S3", cut_ids: ["f"], collapsed: false },
  ];
  const ids = (gs) => gs.map((g) => g.id);

  function timelineOf(order, groups) {
    const mem = new Map();
    for (const g of groups) for (const id of g.cut_ids) mem.set(id, g.id);
    return { cuts: order.map((id) => ({ id, group_id: mem.get(id) || "" })) };
  }
  const labels = (order, groups) =>
    Object.fromEntries([...computeCutLabels(timelineOf(order, groups))].map(([id, v]) => [id, v.label]));

  it("sceneBlocks splits consecutive runs, ungrouped runs included", () => {
    const blocks = sceneBlocks(["x", "a", "b", "y", "z", "d"], grp);
    assert.deepEqual(blocks, [
      { groupId: null, ids: ["x"] },
      { groupId: "g1", ids: ["a", "b"] },
      { groupId: null, ids: ["y", "z"] },
      { groupId: "g2", ids: ["d"] },
    ]);
  });

  it("first -> last keeps the block's internal order and membership", () => {
    const r = moveScene(ord, grp, "g1", { toBlockIndex: 2 });
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["d", "e", "f", "a", "b", "c"]);
    assert.deepEqual(ids(r.groups), ["g2", "g3", "g1"]);
    assert.deepEqual(r.groups.find((g) => g.id === "g1").cut_ids, ["a", "b", "c"]);
    assert.deepEqual(r.groups.find((g) => g.id === "g2").cut_ids, ["d", "e"]);
  });

  it("beforeCutId null means end", () => {
    const r = moveScene(ord, grp, "g1", { beforeCutId: null });
    assert.deepEqual(r.order, ["d", "e", "f", "a", "b", "c"]);
  });

  it("last -> first", () => {
    const r = moveScene(ord, grp, "g3", { toBlockIndex: 0 });
    assert.ok(r.changed);
    assert.deepEqual(r.order, ["f", "a", "b", "c", "d", "e"]);
    assert.deepEqual(ids(r.groups), ["g3", "g1", "g2"]);
  });

  it("beforeCutId anywhere in a block inserts before the whole block", () => {
    const r = moveScene(ord, grp, "g3", { beforeCutId: "e" });
    assert.deepEqual(r.order, ["a", "b", "c", "f", "d", "e"]);
    assert.deepEqual(ids(r.groups), ["g1", "g3", "g2"]);
  });

  it("no-op at its own position, own cut, or unknown scene", () => {
    for (const r of [
      moveScene(ord, grp, "g2", { toBlockIndex: 1 }),
      moveScene(ord, grp, "g2", { beforeCutId: "f" }),
      moveScene(ord, grp, "g2", { beforeCutId: "d" }),
      moveScene(ord, grp, "nope", { toBlockIndex: 0 }),
    ]) {
      assert.equal(r.changed, false);
      assert.deepEqual(r.order, ord);
      assert.deepEqual(r.groups, grp);
    }
  });

  it("collapsed scene moves with all its cuts and stays collapsed", () => {
    const r = moveScene(ord, grp, "g2", { toBlockIndex: 0 });
    assert.deepEqual(r.order, ["d", "e", "a", "b", "c", "f"]);
    const g2 = r.groups.find((g) => g.id === "g2");
    assert.equal(g2.collapsed, true);
    assert.deepEqual(g2.cut_ids, ["d", "e"]);
  });

  it("drops land between blocks, never inside an ungrouped run or another scene", () => {
    const o = ["x", "a", "b", "y", "d", "e", "z"];
    const g = [
      { id: "g1", name: "S1", cut_ids: ["a", "b"], collapsed: false },
      { id: "g2", name: "S2", cut_ids: ["d", "e"], collapsed: false },
    ];
    // with S2 taken out the rest is [x] [a b] [y z]: y and z join into one ungrouped run
    assert.equal(sceneBlocks(["x", "a", "b", "y", "z"], g).length, 3);
    assert.deepEqual(moveScene(o, g, "g2", { toBlockIndex: 0 }).order, ["d", "e", "x", "a", "b", "y", "z"]);
    assert.deepEqual(moveScene(o, g, "g2", { toBlockIndex: 1 }).order, ["x", "d", "e", "a", "b", "y", "z"]);
    assert.deepEqual(moveScene(o, g, "g2", { toBlockIndex: 2 }).order, ["x", "a", "b", "d", "e", "y", "z"]);
    assert.deepEqual(moveScene(o, g, "g2", { toBlockIndex: 3 }).order, ["x", "a", "b", "y", "z", "d", "e"]);
    assert.deepEqual(moveScene(o, g, "g2", { toBlockIndex: 99 }).order, ["x", "a", "b", "y", "z", "d", "e"]);
    assert.deepEqual(moveScene(o, g, "g2", { beforeCutId: "b" }).order, ["x", "d", "e", "a", "b", "y", "z"]);
    // S1 out: [x y] [d e] [z]; before z lands after S2, not between x and y
    const r = moveScene(o, g, "g1", { beforeCutId: "z" });
    assert.deepEqual(r.order, ["x", "y", "d", "e", "a", "b", "z"]);
    assert.deepEqual(r.groups.find((x) => x.id === "g1").cut_ids, ["a", "b"]);
  });

  it("labels renumber: moved scene takes its new block number, ids keep their cuts", () => {
    assert.deepEqual(labels(ord, grp), { a: "1-1", b: "1-2", c: "1-3", d: "2-1", e: "2-2", f: "3-1" });
    const r = moveScene(ord, grp, "g2", { toBlockIndex: 0 });
    assert.deepEqual(labels(r.order, r.groups), { d: "1-1", e: "1-2", a: "2-1", b: "2-2", c: "2-3", f: "3-1" });
    const back = moveScene(r.order, r.groups, "g2", { beforeCutId: "f" });
    assert.deepEqual(back.order, ord);
    assert.deepEqual(back.groups, grp);
    assert.deepEqual(labels(back.order, back.groups), labels(ord, grp));
  });

  it("ungrouped runs between scenes keep their own block numbers", () => {
    const o = ["a", "b", "x", "d", "e"];
    const g = [
      { id: "g1", name: "S1", cut_ids: ["a", "b"], collapsed: false },
      { id: "g2", name: "S2", cut_ids: ["d", "e"], collapsed: false },
    ];
    const r = moveScene(o, g, "g2", { toBlockIndex: 0 });
    assert.deepEqual(r.order, ["d", "e", "a", "b", "x"]);
    assert.deepEqual(labels(r.order, r.groups), { d: "1-1", e: "1-2", a: "2-1", b: "2-2", x: "3-1" });
  });

  it("does not mutate inputs", () => {
    const o = [...ord];
    const g = JSON.parse(JSON.stringify(grp));
    moveScene(o, g, "g1", { toBlockIndex: 2 });
    assert.deepEqual(o, ord);
    assert.deepEqual(g, grp);
  });
});

describe("sceneDropTarget", () => {
  const secs = [
    { groupId: "g1", top: 0, bottom: 100 },
    { groupId: "g3", top: 200, bottom: 260 },
  ];
  it("picks the boundary by section midpoint", () => {
    assert.deepEqual(sceneDropTarget(secs, 10), { beforeGroupId: "g1", lineY: 0 });
    assert.deepEqual(sceneDropTarget(secs, 120), { beforeGroupId: "g3", lineY: 200 });
    assert.deepEqual(sceneDropTarget(secs, 240), { beforeGroupId: null, lineY: 260 });
  });
  it("no other scenes means no target", () => {
    assert.equal(sceneDropTarget([], 10), null);
  });
});

describe("sceneDropBeforeCut", () => {
  const g = [
    { id: "g1", name: "S1", cut_ids: ["a", "b"], collapsed: false },
    { id: "g2", name: "S2", cut_ids: ["d", "e"], collapsed: false },
  ];
  it("before a scene = its first cut", () => {
    assert.equal(sceneDropBeforeCut(["a", "b", "d", "e"], g, "g2", "g1"), "a");
  });
  it("end with ungrouped cuts at the end = before the first of them", () => {
    assert.equal(sceneDropBeforeCut(["a", "b", "d", "e", "x", "y"], g, "g1", null), "x");
    assert.equal(sceneDropBeforeCut(["a", "b", "d", "e"], g, "g1", null), null);
  });
  it("end with ungrouped cuts before the scenes: whole scene lands after the last scene", () => {
    const o = ["x", "d", "e", "a", "b", "y"];
    const before = sceneDropBeforeCut(o, g, "g2", null);
    assert.equal(before, "y");
    const r = moveScene(o, g, "g2", { beforeCutId: before });
    assert.deepEqual(r.order, ["x", "a", "b", "d", "e", "y"]);
    assert.deepEqual(r.groups.map((x) => x.id), ["g1", "g2"]);
    assert.deepEqual(r.groups.find((x) => x.id === "g2").cut_ids, ["d", "e"]);
  });
});

describe("listOrder (Ungrouped always last, like the native store)", () => {
  const grps = [
    { id: "g1", cut_ids: ["a", "b"] },
    { id: "g2", cut_ids: ["c"] },
  ];
  it("moves ungrouped cuts from between scenes to the end, keeping their order", () => {
    assert.deepEqual(listOrder(["x", "a", "y", "b", "c", "z"], grps), ["a", "b", "c", "x", "y", "z"]);
  });
  it("scenes follow the groups list; cuts in each scene follow the given order", () => {
    assert.deepEqual(listOrder(["c", "b", "a", "x"], grps), ["b", "a", "c", "x"]);
    assert.deepEqual(listOrder(["a", "c", "b"], [grps[1], grps[0]]), ["c", "a", "b"]);
  });
  it("no scenes / no ungrouped / already laid out", () => {
    assert.deepEqual(listOrder(["x", "y"], []), ["x", "y"]);
    assert.deepEqual(listOrder(["a", "b", "c"], grps), ["a", "b", "c"]);
    assert.deepEqual(listOrder([], grps), []);
  });
  it("cut dragged out of a scene into Ungrouped ends up in the Ungrouped block", () => {
    const r = moveCuts(["a", "b", "c", "x"], grps, ["a"], { toIndex: 2, toGroupId: null });
    assert.deepEqual(listOrder(r.order, r.groups), ["b", "c", "a", "x"]);
    assert.deepEqual(r.groups.find((g) => g.id === "g1").cut_ids, ["b"]);
    const back = moveCuts(["b", "c", "a", "x"], r.groups, ["a"], { toIndex: 0, toGroupId: "g1" });
    assert.deepEqual(listOrder(back.order, back.groups), ["a", "b", "c", "x"]);
  });
  it("labels after listOrder match the sections: Ungrouped is the last block", () => {
    const ord = listOrder(["a", "x", "b", "c"], grps);
    const mem = new Map([["a", "g1"], ["b", "g1"], ["c", "g2"]]);
    const labels = computeCutLabels({ cuts: ord.map((id) => ({ id, group_id: mem.get(id) || "" })) });
    assert.deepEqual(ord.map((id) => labels.get(id).label), ["1-1", "1-2", "2-1", "3-1"]);
  });
});

describe("cut drop into an empty scene (0.9.108)", () => {
  const secs = [
    { groupId: "e1", top: 200, bottom: 236 },
    { groupId: "e2", top: 242, bottom: 278 },
  ];
  it("emptySceneDropTarget: header and empty body hit, gaps and other sections miss", () => {
    assert.deepEqual(emptySceneDropTarget(secs, 200), { groupId: "e1" });
    assert.deepEqual(emptySceneDropTarget(secs, 230), { groupId: "e1" });
    assert.deepEqual(emptySceneDropTarget(secs, 250), { groupId: "e2" });
    assert.equal(emptySceneDropTarget(secs, 236), null);
    assert.equal(emptySceneDropTarget(secs, 239), null);
    assert.equal(emptySceneDropTarget(secs, 100), null);
    assert.equal(emptySceneDropTarget([], 210), null);
    assert.equal(emptySceneDropTarget(undefined, 210), null);
  });

  // Scene A [a, b], Scene B [c], then New scene "e1" (empty), Ungrouped [x].
  const grps = [
    { id: "gA", cut_ids: ["a", "b"] },
    { id: "gB", cut_ids: ["c"] },
    { id: "e1", cut_ids: [] },
  ];
  const ord = ["a", "b", "c", "x"];

  it("moves a scene cut into the empty scene, laid out after Scene B and before Ungrouped", () => {
    const r = moveToScene(ord, grps, ["b"], "e1");
    assert.ok(r.changed);
    assert.deepEqual(r.groups.map((g) => [g.id, g.cut_ids]), [["gA", ["a"]], ["gB", ["c"]], ["e1", ["b"]]]);
    assert.deepEqual(listOrder(r.order, r.groups), ["a", "c", "b", "x"]);
  });

  it("moves an Ungrouped cut and a multi-selection into the empty scene, keeping their order", () => {
    const one = moveToScene(ord, grps, ["x"], "e1");
    assert.deepEqual(one.groups.find((g) => g.id === "e1").cut_ids, ["x"]);
    assert.deepEqual(listOrder(one.order, one.groups), ["a", "b", "c", "x"]);
    const two = moveToScene(ord, grps, ["c", "a"], "e1");
    assert.deepEqual(two.groups.find((g) => g.id === "e1").cut_ids, ["a", "c"]);
    assert.deepEqual(listOrder(two.order, two.groups), ["b", "a", "c", "x"]);
  });

  it("an empty scene listed between scenes receives the cut at its own place", () => {
    const g = [{ id: "gA", cut_ids: ["a", "b"] }, { id: "e1", cut_ids: [] }, { id: "gB", cut_ids: ["c"] }];
    const r = moveToScene(ord, g, ["x"], "e1");
    assert.deepEqual(listOrder(r.order, r.groups), ["a", "b", "x", "c"]);
  });

  it("undo snapshot taken before the drop brings the empty scene back", () => {
    const before = snapshotOrderGroups({ cuts: ord.map((id) => ({ id })), groups: grps });
    const r = moveToScene(ord, grps, ["b"], "e1");
    assert.notDeepEqual(r.groups, before.groups);
    assert.deepEqual(before.groups.find((g) => g.id === "e1").cut_ids, []);
    assert.deepEqual(before.order, ord);
  });

  it("dropHighlight tints the empty scene as a cross-scene drop", () => {
    assert.deepEqual(dropHighlight(grps, ["b"], "e1"), { groupId: "e1", crossScene: true });
  });
});

describe("snapshotOrderGroups", () => {
  it("clones timeline order and groups", () => {
    const s = snapshotOrderGroups({ cuts: [{ id: "x" }, { id: "y" }], groups: [{ id: "g", cut_ids: ["x"] }] });
    assert.deepEqual(s.order, ["x", "y"]);
    assert.notEqual(s.groups, [{ id: "g", cut_ids: ["x"] }]);
  });
});
