import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UNDO_LIMIT,
  undoKeyAction,
  undoScope,
  nextUndoArea,
  createUndoHistory,
  fitOrderGroupsSnapshot,
  shotsCounterpart,
  shotsUndoSteps,
  snapshotTimelineEdit,
  applyTimelineSnapshot,
} from "../../web/gg_undo_core.js";

describe("undoKeyAction", () => {
  it("maps Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y", () => {
    assert.equal(undoKeyAction({ key: "z", ctrlKey: true }), "undo");
    assert.equal(undoKeyAction({ key: "z", metaKey: true }), "undo");
    assert.equal(undoKeyAction({ key: "Z", ctrlKey: true, shiftKey: true }), "redo");
    assert.equal(undoKeyAction({ key: "Z", metaKey: true, shiftKey: true }), "redo");
    assert.equal(undoKeyAction({ key: "y", ctrlKey: true }), "redo");
    assert.equal(undoKeyAction({ key: "ㅋ", code: "KeyZ", ctrlKey: true }), "undo");
  });
  it("ignores plain keys, Alt combos, Ctrl+Shift+Y and IME composition", () => {
    assert.equal(undoKeyAction({ key: "z" }), null);
    assert.equal(undoKeyAction({ key: "z", ctrlKey: true, altKey: true }), null);
    assert.equal(undoKeyAction({ key: "Y", ctrlKey: true, shiftKey: true }), null);
    assert.equal(undoKeyAction({ key: "z", ctrlKey: true, isComposing: true }), null);
    assert.equal(undoKeyAction({ key: "a", ctrlKey: true }), null);
    assert.equal(undoKeyAction(null), null);
  });
});

describe("undoScope", () => {
  it("is null over the canvas", () => {
    assert.equal(undoScope({}), null);
    assert.equal(undoScope(undefined), null);
  });
  it("pointer wins over focus; focus alone still counts", () => {
    assert.equal(undoScope({ hoverShots: true }), "shots");
    assert.equal(undoScope({ hoverTimeline: true }), "timeline");
    assert.equal(undoScope({ focusTimeline: true, hoverShots: true }), "shots");
    assert.equal(undoScope({ focusShots: true, hoverTimeline: true }), "timeline");
    assert.equal(undoScope({ focusShots: true }), "shots");
    assert.equal(undoScope({ focusTimeline: true }), "timeline");
  });
  it("falls back to the last clicked panel when nothing is hovered (menu closed, focus lost)", () => {
    assert.equal(undoScope({ last: "shots" }), "shots");
    assert.equal(undoScope({ last: "timeline" }), "timeline");
    assert.equal(undoScope({ last: "shots", focusTimeline: true }), "shots", "last click beats Timeline focus");
    assert.equal(undoScope({ last: "shots", hoverTimeline: true }), "timeline", "pointer still wins");
    assert.equal(undoScope({ last: "timeline", hoverShots: true }), "shots");
  });
  it("canvas (or any other area) clicked last: left to ComfyUI unless a panel is hovered", () => {
    assert.equal(undoScope({ last: "other" }), null);
    assert.equal(undoScope({ last: "other", focusTimeline: true }), null);
    assert.equal(undoScope({ last: "other", focusShots: true }), null);
    assert.equal(undoScope({ last: "other", hoverShots: true }), "shots");
    assert.equal(undoScope({ last: "", focusShots: true }), "shots", "nothing clicked yet: focus still counts");
  });
});

describe("nextUndoArea", () => {
  it("a pointer in a panel sets it; anywhere else (canvas) sets other", () => {
    assert.equal(nextUndoArea("", { shots: true }), "shots");
    assert.equal(nextUndoArea("shots", { timeline: true }), "timeline");
    assert.equal(nextUndoArea("shots", {}), "other");
    assert.equal(nextUndoArea("timeline", {}), "other");
  });
  it("our menus, dialogs and toasts keep the area that opened them", () => {
    assert.equal(nextUndoArea("shots", { overlay: true }), "shots");
    assert.equal(nextUndoArea("timeline", { overlay: true, shots: true }), "timeline");
    assert.equal(nextUndoArea("", { overlay: true }), "");
  });
  it("focus moving outside the panels does not count; focus inside does", () => {
    assert.equal(nextUndoArea("shots", { focus: true }), "shots");
    assert.equal(nextUndoArea("other", { focus: true, timeline: true }), "timeline");
  });
  it("context menu flow: right-click cut, click item, menu gone -> still Shots", () => {
    let area = nextUndoArea("other", { shots: true });
    area = nextUndoArea(area, { overlay: true });
    assert.equal(undoScope({ last: area }), "shots");
    area = nextUndoArea(area, {});
    assert.equal(undoScope({ last: area }), null, "then a canvas click hands Ctrl+Z back to ComfyUI");
  });
});

describe("createUndoHistory", () => {
  it("undo then redo walks back and forth", () => {
    const h = createUndoHistory();
    h.record("p1", "A");
    h.record("p1", "B");
    assert.equal(h.undo("p1", "C"), "B");
    assert.equal(h.undo("p1", "B"), "A");
    assert.equal(h.undo("p1", "A"), null);
    assert.equal(h.redo("p1", "A"), "B");
    assert.equal(h.redo("p1", "B"), "C");
    assert.equal(h.redo("p1", "C"), null);
  });
  it("a new edit clears redo", () => {
    const h = createUndoHistory();
    h.record("p1", "A");
    h.undo("p1", "B");
    assert.equal(h.canRedo("p1"), true);
    h.record("p1", "A2");
    assert.equal(h.canRedo("p1"), false);
    assert.equal(h.redo("p1", "X"), null);
  });
  it("is bounded (50 by default)", () => {
    const h = createUndoHistory();
    for (let i = 0; i < 70; i++) h.record("p1", `s${i}`);
    assert.equal(h.sizes().undo, UNDO_LIMIT);
    let last = null;
    let n = 0;
    for (let s; (s = h.undo("p1", "cur")); n++) last = s;
    assert.equal(n, 50);
    assert.equal(last, "s20");
    const small = createUndoHistory({ limit: 2 });
    ["a", "b", "c"].forEach((s) => small.record("p", s));
    assert.equal(small.undo("p", "d"), "c");
    assert.equal(small.undo("p", "c"), "b");
    assert.equal(small.undo("p", "b"), null);
  });
  it("starts empty for another project and on clear()", () => {
    const h = createUndoHistory();
    h.record("p1", "A");
    assert.equal(h.canUndo("p2"), false);
    assert.equal(h.undo("p2", "X"), null);
    assert.equal(h.undo("p1", "X"), null, "switching to p2 dropped p1's history");
    h.record("p1", "A");
    h.clear();
    assert.equal(h.canUndo("p1"), false);
  });
  it("skips a snapshot equal to the last one", () => {
    const h = createUndoHistory();
    h.record("p", { order: ["a", "b"] });
    h.record("p", { order: ["a", "b"] });
    assert.equal(h.sizes().undo, 1);
  });
  it("current may be a function of the taken entry; peekUndo does not take", () => {
    const h = createUndoHistory();
    const del = { kind: "cuts", op: "delete", ids: ["x"] };
    h.record("p", "L0");
    h.record("p", del);
    assert.equal(h.peekUndo("p"), del);
    assert.equal(h.peekUndo("q"), null);
    const pick = (e) => shotsCounterpart(e, "Lnow");
    assert.equal(h.undo("p", pick), del);
    assert.equal(h.undo("p", pick), "L0");
    assert.equal(h.redo("p", pick), "Lnow", "layout entry: the layout at undo time comes back");
    assert.equal(h.redo("p", pick), del, "cut entry: the same entry comes back");
    assert.equal(h.peekUndo("p"), del);
  });
});

describe("Shots history entries", () => {
  const L0 = { order: ["a", "b"], groups: [{ id: "s1", name: "S", cut_ids: ["a", "b"] }] };
  const L1 = { order: ["a", "b", "n"], groups: [{ id: "s1", name: "S", cut_ids: ["a", "b", "n"] }] };
  it("layout (remove from / move to scene, group, ungroup, new/rename scene, reorder, apply order)", () => {
    assert.deepEqual(shotsUndoSteps(L0, "undo"), [{ type: "layout", snap: L0 }]);
    assert.deepEqual(shotsUndoSteps(L0, "redo"), [{ type: "layout", snap: L0 }]);
    assert.equal(shotsCounterpart(L0, L1), L1);
  });
  it("delete: undo restores then puts the layout back; redo deletes again", () => {
    const e = { kind: "cuts", op: "delete", ids: ["b"], before: L0 };
    assert.deepEqual(shotsUndoSteps(e, "undo"), [{ type: "restore", ids: ["b"] }, { type: "layout", snap: L0 }]);
    assert.deepEqual(shotsUndoSteps(e, "redo"), [{ type: "delete", ids: ["b"] }]);
    assert.equal(shotsCounterpart(e, L1), e);
  });
  it("add (and Trash restore): undo soft-deletes; redo restores into the layout after the add", () => {
    const e = { kind: "cuts", op: "add", ids: ["n"], before: L0, after: L1 };
    assert.deepEqual(shotsUndoSteps(e, "undo"), [{ type: "delete", ids: ["n"] }]);
    assert.deepEqual(shotsUndoSteps(e, "redo"), [{ type: "restore", ids: ["n"] }, { type: "layout", snap: L1 }]);
    assert.deepEqual(shotsUndoSteps({ kind: "cuts", op: "add", ids: ["n"] }, "redo"), [{ type: "restore", ids: ["n"] }]);
    assert.deepEqual(shotsUndoSteps({ kind: "cuts", op: "add", ids: [] }, "undo"), []);
  });
  it("rename: undo sets the old name, redo the new one", () => {
    const e = { kind: "rename", cut_id: "a", from: "New cut", to: "Hero" };
    assert.deepEqual(shotsUndoSteps(e, "undo"), [{ type: "rename", cut_id: "a", name: "New cut" }]);
    assert.deepEqual(shotsUndoSteps(e, "redo"), [{ type: "rename", cut_id: "a", name: "Hero" }]);
    assert.deepEqual(shotsUndoSteps(null, "undo"), []);
  });
  it("delete undo layout: the restored cut goes back to its old place and scene", () => {
    const restored = { order: ["a", "c", "b"], groups: [{ id: "s1", name: "S", cut_ids: ["a"] }] };
    const before = { order: ["a", "b", "c"], groups: [{ id: "s1", name: "S", cut_ids: ["a", "b"] }] };
    assert.deepEqual(fitOrderGroupsSnapshot(before, restored), before);
  });
});

describe("fitOrderGroupsSnapshot", () => {
  it("drops deleted cuts and appends new ones, keeping their scene", () => {
    const snap = { order: ["a", "b", "c"], groups: [{ id: "s1", name: "S", cut_ids: ["a", "b"] }] };
    const current = { order: ["c", "a", "n"], groups: [{ id: "s1", name: "S", cut_ids: ["a", "n"] }] };
    const r = fitOrderGroupsSnapshot(snap, current);
    assert.deepEqual(r.order, ["a", "c", "n"]);
    assert.deepEqual(r.groups, [{ id: "s1", name: "S", cut_ids: ["a", "n"] }]);
    assert.deepEqual(snap.groups[0].cut_ids, ["a", "b"], "input untouched");
  });
  it("keeps the current collapsed state of scenes that still exist", () => {
    const snap = { order: ["a"], groups: [{ id: "s1", name: "Old", cut_ids: ["a"], collapsed: false }] };
    const current = { order: ["a"], groups: [{ id: "s1", name: "New", cut_ids: ["a"], collapsed: true }] };
    assert.deepEqual(fitOrderGroupsSnapshot(snap, current).groups, [{ id: "s1", name: "Old", cut_ids: ["a"], collapsed: true }]);
  });
});

describe("snapshotTimelineEdit / applyTimelineSnapshot", () => {
  const nativeTl = () => ({
    track_order: ["b", "a"],
    cuts: [
      { id: "a", in: 0, sec: 3, start: 5 },
      { id: "b", in: 1, sec: 2, start: 0 },
      { id: "c", in: 0, sec: 4, start: 9 },
    ],
  });
  it("captures track order (unlisted cuts last) and in/sec/start", () => {
    const s = snapshotTimelineEdit(nativeTl());
    assert.deepEqual(s.order, ["b", "a", "c"]);
    assert.deepEqual(s.clips.a, { in: 0, sec: 3, start: 5 });
    assert.equal(snapshotTimelineEdit(null), null);
  });
  it("restores a native track after trim + move", () => {
    const tl = nativeTl();
    const before = snapshotTimelineEdit(tl);
    tl.track_order = ["a", "b", "c"];
    tl.cuts[0].sec = 1;
    tl.cuts[0].start = 0;
    assert.equal(applyTimelineSnapshot(tl, before), true);
    assert.deepEqual(tl.track_order, ["b", "a", "c"]);
    assert.deepEqual(snapshotTimelineEdit(tl), before);
  });
  it("imported timeline: reorders cuts in place and sets pos", () => {
    const tl = { cuts: [{ id: "x", in: 0, sec: 1 }, { id: "y", in: 0, sec: 2 }] };
    const cutsRef = tl.cuts;
    const before = snapshotTimelineEdit(tl);
    tl.cuts.reverse();
    tl.cuts[0].sec = 9;
    applyTimelineSnapshot(tl, before);
    assert.equal(tl.cuts, cutsRef);
    assert.deepEqual(tl.cuts.map((c) => [c.id, c.sec, c.pos]), [["x", 1, 0], ["y", 2, 1]]);
    assert.equal("track_order" in tl, false);
  });
  it("ignores deleted cuts and keeps new ones", () => {
    const tl = nativeTl();
    const before = snapshotTimelineEdit(tl);
    tl.cuts = tl.cuts.filter((c) => c.id !== "b").concat([{ id: "n", in: 0, sec: 2, start: 20 }]);
    tl.track_order = ["a", "c", "n"];
    applyTimelineSnapshot(tl, before);
    assert.deepEqual(tl.track_order, ["a", "c", "n"]);
    assert.equal(tl.cuts.find((c) => c.id === "n").start, 20);
  });
});
