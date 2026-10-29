import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sdkActionState,
  cutActionItems,
  cutCardMenuItems,
  timelineClipMenuItems,
  sceneMenuItems,
  sceneCutIds,
  attachMenuActions,
  SINGLE_CUT_TIP,
  SDK_BUSY_TIP,
  SDK_OFF_TIP,
  BUSY_TIP,
  REGEN_EMPTY_TIP,
  TRASH_TIP,
} from "../../web/gg_ctx_menu_core.js";

const TIP = "read-only tip";
const keys = (items) => items.map((it) => it.key);
const byKey = (items, k) => items.find((it) => it.key === k);

describe("sdkActionState (mirrors cut panel Regen/Send)", () => {
  it("imported project, SDK ok, idle: both enabled", () => {
    const s = sdkActionState({ native: false, sdkOk: true });
    assert.deepEqual(s.regen, { disabled: false, title: "" });
    assert.deepEqual(s.send, { disabled: false, title: "" });
  });
  it("native project: Regen on for one idle cut, even without the SDK", () => {
    for (const sdkOk of [true, false]) {
      const s = sdkActionState({ native: true, sdkOk });
      assert.deepEqual(s.regen, { disabled: false, title: "" });
      assert.equal(s.send.disabled, false);
    }
  });
  it("native project: Regen off for multi, busy, or an empty cut (in that order)", () => {
    assert.deepEqual(sdkActionState({ native: true, multi: true, sdkBusy: true, emptyCut: true }).regen, { disabled: true, title: SINGLE_CUT_TIP });
    assert.deepEqual(sdkActionState({ native: true, sdkBusy: true, emptyCut: true }).regen, { disabled: true, title: BUSY_TIP });
    assert.deepEqual(sdkActionState({ native: true, emptyCut: true }).regen, { disabled: true, title: REGEN_EMPTY_TIP });
  });
  it("emptyCut does not affect imported projects", () => {
    assert.deepEqual(sdkActionState({ native: false, sdkOk: true, emptyCut: true }).regen, { disabled: false, title: "" });
  });
  it("SDK not ready: Regen off, Send on", () => {
    const s = sdkActionState({ native: false, sdkOk: false });
    assert.equal(s.regen.title, SDK_OFF_TIP);
    assert.equal(s.send.disabled, false);
  });
  it("busy: both off", () => {
    const s = sdkActionState({ native: false, sdkOk: true, sdkBusy: true });
    assert.equal(s.regen.title, SDK_BUSY_TIP);
    assert.equal(s.send.title, SDK_BUSY_TIP);
  });
  it("multiple cuts: both off", () => {
    const s = sdkActionState({ native: false, sdkOk: true, multi: true });
    assert.equal(s.regen.title, SINGLE_CUT_TIP);
    assert.equal(s.send.title, SINGLE_CUT_TIP);
  });
});

describe("cutActionItems", () => {
  it("redo label follows needs_redo; redo/rename native only with tip", () => {
    const a = cutActionItems({ native: false, needsRedo: true, readonlyTip: TIP });
    assert.equal(a.redo.label, "Clear needs redo");
    assert.equal(a.redo.disabled, true);
    assert.equal(a.redo.title, TIP);
    assert.equal(a.rename.disabled, true);
    const b = cutActionItems({ native: true, needsRedo: false, readonlyTip: TIP });
    assert.equal(b.redo.label, "Mark needs redo");
    assert.equal(b.redo.disabled, false);
    assert.equal(b.redo.title, "");
    assert.equal(b.rename.disabled, false);
  });
  it("rename off for multi; delete is danger and never disabled", () => {
    const a = cutActionItems({ native: true, multi: true });
    assert.equal(a.rename.disabled, true);
    assert.equal(a.del.danger, true);
    assert.ok(!a.del.disabled);
  });
});

describe("cutCardMenuItems", () => {
  it("native order: moves first, Regen/Send after Add Cut and before Delete, Trash last", () => {
    const items = cutCardMenuItems({ native: true, sdkOk: true, canMoveUp: true, trashCount: 2, trashLabel: "Trash (2)…" });
    assert.deepEqual(keys(items), [
      "moveUp", "moveDown", "moveToScene", "group", "split", "removeFromScene",
      "redo", "rename", "addCut", "regen", "renderSel", "send", "del", "trash",
    ]);
    assert.equal(byKey(items, "renderSel").label, "Render selected");
    assert.equal(byKey(items, "moveUp").disabled, false);
    assert.equal(byKey(items, "moveDown").disabled, true);
    assert.equal(byKey(items, "trash").label, "Trash (2)…");
    assert.equal(byKey(items, "trash").disabled, false);
    assert.equal(byKey(items, "trash").title, TRASH_TIP);
  });
  it("imported project: no move items, trash off with read-only tip", () => {
    const items = cutCardMenuItems({ native: false, trashCount: 3, readonlyTip: TIP });
    assert.equal(keys(items)[0], "group");
    assert.equal(byKey(items, "trash").disabled, true);
    assert.equal(byKey(items, "trash").title, TIP);
  });
  it("scene items follow inScene / anyInScene", () => {
    let items = cutCardMenuItems({ native: true });
    assert.equal(byKey(items, "split").disabled, true);
    assert.equal(byKey(items, "removeFromScene").disabled, true);
    items = cutCardMenuItems({ native: true, anyInScene: true });
    assert.equal(byKey(items, "split").disabled, true);
    assert.equal(byKey(items, "removeFromScene").disabled, false);
    items = cutCardMenuItems({ native: true, inScene: true });
    assert.equal(byKey(items, "split").disabled, false);
  });
  it("multi-selection disables Regen and Send", () => {
    const items = cutCardMenuItems({ native: false, sdkOk: true, multi: true });
    assert.equal(byKey(items, "regen").disabled, true);
    assert.equal(byKey(items, "send").disabled, true);
  });
});

describe("timelineClipMenuItems", () => {
  it("order and labels", () => {
    const items = timelineClipMenuItems({ native: true, sdkOk: true });
    assert.deepEqual(keys(items), ["open", "regen", "send", "redo", "rename", "applyOrder", "del"]);
    assert.deepEqual(items.map((i) => i.label), [
      "Open cut", "Regen", "Send last output", "Mark needs redo", "Rename…", "Apply order to cuts", "Delete",
    ]);
  });
  it("Apply order to cuts: native only, read-only tip on imported projects", () => {
    assert.equal(byKey(timelineClipMenuItems({ native: true }), "applyOrder").disabled, false);
    const off = byKey(timelineClipMenuItems({ native: false, readonlyTip: TIP }), "applyOrder");
    assert.equal(off.disabled, true);
    assert.equal(off.title, TIP);
  });
  it("always single cut even if ctx says multi", () => {
    const items = timelineClipMenuItems({ native: false, sdkOk: true, multi: true });
    assert.equal(byKey(items, "regen").disabled, false);
    assert.equal(byKey(items, "send").disabled, false);
  });
  it("busy disables Regen and Send", () => {
    const items = timelineClipMenuItems({ native: false, sdkOk: true, sdkBusy: true });
    assert.equal(byKey(items, "regen").disabled, true);
    assert.equal(byKey(items, "send").disabled, true);
  });
  it("native: Regen on (even if ctx says multi), off with tooltip for an empty cut", () => {
    assert.equal(byKey(timelineClipMenuItems({ native: true, multi: true }), "regen").disabled, false);
    const r = byKey(timelineClipMenuItems({ native: true, emptyCut: true }), "regen");
    assert.equal(r.disabled, true);
    assert.equal(r.title, REGEN_EMPTY_TIP);
  });
});

describe("cutCardMenuItems Render selected", () => {
  it("on for one or many cuts in a native project", () => {
    assert.equal(byKey(cutCardMenuItems({ native: true }), "renderSel").disabled, false);
    const multi = byKey(cutCardMenuItems({ native: true, multi: true, renderCount: 3 }), "renderSel");
    assert.equal(multi.disabled, false);
    assert.equal(multi.title, "Queue 3 cuts to ComfyUI");
  });
  it("off for imported projects, while busy, or with no cut", () => {
    assert.equal(byKey(cutCardMenuItems({ native: false, sdkOk: true }), "renderSel").disabled, true);
    assert.equal(byKey(cutCardMenuItems({ native: true, sdkBusy: true }), "renderSel").disabled, true);
    assert.equal(byKey(cutCardMenuItems({ native: true, renderCount: 0 }), "renderSel").disabled, true);
  });
  it("timeline clip menu has no Render selected", () => {
    assert.ok(!keys(timelineClipMenuItems({ native: true })).includes("renderSel"));
  });
});

describe("cutCardMenuItems native Regen", () => {
  it("enabled for one idle cut, off for multi-selection", () => {
    assert.equal(byKey(cutCardMenuItems({ native: true }), "regen").disabled, false);
    const multi = byKey(cutCardMenuItems({ native: true, multi: true }), "regen");
    assert.equal(multi.disabled, true);
    assert.equal(multi.title, SINGLE_CUT_TIP);
  });
});

describe("sceneMenuItems", () => {
  it("order, collapse label and danger delete", () => {
    const items = sceneMenuItems({ collapsed: false, cutCount: 2 });
    assert.deepEqual(keys(items), ["addCut", "selectCuts", "toggleCollapse", "rename", "ungroup", "deleteScene"]);
    assert.equal(byKey(items, "toggleCollapse").label, "Collapse");
    assert.equal(byKey(items, "deleteScene").danger, true);
    assert.equal(byKey(items, "addCut").disabled, false);
  });
  it("collapsed shows Expand; empty scene disables Add Cut / Select cuts", () => {
    const items = sceneMenuItems({ collapsed: true, cutCount: 0 });
    assert.equal(byKey(items, "toggleCollapse").label, "Expand");
    assert.equal(byKey(items, "addCut").disabled, true);
    assert.equal(byKey(items, "selectCuts").disabled, true);
  });
});

describe("sceneCutIds", () => {
  it("returns members in timeline order and skips unknown ids", () => {
    const cuts = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    assert.deepEqual(sceneCutIds(cuts, { cut_ids: ["c", "x", "b"] }), ["b", "c"]);
  });
  it("handles missing input", () => {
    assert.deepEqual(sceneCutIds(null, null), []);
    assert.deepEqual(sceneCutIds([{ id: "a" }], {}), []);
  });
});

describe("attachMenuActions", () => {
  it("maps keys to actions/submenus and drops keys", () => {
    const fn = () => {};
    const sub = [{ label: "No scene" }];
    const out = attachMenuActions(
      [{ key: "a", label: "A" }, { key: "m", label: "M" }],
      { a: fn },
      { m: sub },
    );
    assert.equal(out[0].action, fn);
    assert.ok(!("key" in out[0]));
    assert.equal(out[1].submenu, sub);
    assert.ok(!out[1].disabled);
  });
  it("disables items with no handler", () => {
    const out = attachMenuActions([{ key: "z", label: "Z" }], {});
    assert.equal(out[0].disabled, true);
    assert.equal(out[0].action, undefined);
  });
});
