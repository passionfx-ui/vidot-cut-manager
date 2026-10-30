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
  MENU_SEPARATOR,
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
  it("native order: Group/Ungroup then a separator at the top, moves next, Regen/Send after Add Cut, Trash last", () => {
    const items = cutCardMenuItems({ native: true, sdkOk: true, canMoveUp: true, trashCount: 2, trashLabel: "Trash (2)…" });
    assert.deepEqual(keys(items), [
      "group", "ungroup", "sep", "moveUp", "moveDown", "moveToScene", "split",
      "redo", "rename", "addCut", "regen", "queueSel", "send", "del", "trash",
    ]);
    assert.deepEqual(items.slice(0, 3).map((i) => i.label), ["Group", "Ungroup", undefined]);
    assert.equal(items[2], MENU_SEPARATOR);
    assert.equal(byKey(items, "queueSel").label, "Queue selected");
    assert.equal(byKey(items, "moveUp").disabled, false);
    assert.equal(byKey(items, "moveDown").disabled, true);
    assert.equal(byKey(items, "trash").label, "Trash (2)…");
    assert.equal(byKey(items, "trash").disabled, false);
    assert.equal(byKey(items, "trash").title, TRASH_TIP);
  });
  it("imported project: Group/Ungroup still on top, no move items, trash off with read-only tip", () => {
    const items = cutCardMenuItems({ native: false, trashCount: 3, readonlyTip: TIP });
    assert.deepEqual(keys(items).slice(0, 4), ["group", "ungroup", "sep", "split"]);
    assert.equal(byKey(items, "trash").disabled, true);
    assert.equal(byKey(items, "trash").title, TIP);
  });
  it("scene items follow inScene / anyInScene", () => {
    let items = cutCardMenuItems({ native: true });
    assert.equal(byKey(items, "split").disabled, true);
    assert.equal(byKey(items, "ungroup").disabled, true);
    assert.ok(!byKey(items, "group").disabled);
    items = cutCardMenuItems({ native: true, anyInScene: true });
    assert.equal(byKey(items, "split").disabled, true);
    assert.equal(byKey(items, "ungroup").disabled, false);
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

describe("cutCardMenuItems Queue selected", () => {
  it("on for one or many cuts in a native project", () => {
    assert.equal(byKey(cutCardMenuItems({ native: true }), "queueSel").disabled, false);
    const multi = byKey(cutCardMenuItems({ native: true, multi: true, queueCount: 3 }), "queueSel");
    assert.equal(multi.disabled, false);
    assert.equal(multi.title, "Queue 3 cuts to ComfyUI");
  });
  it("off for imported projects, while busy, or with no cut", () => {
    assert.equal(byKey(cutCardMenuItems({ native: false, sdkOk: true }), "queueSel").disabled, true);
    assert.equal(byKey(cutCardMenuItems({ native: true, sdkBusy: true }), "queueSel").disabled, true);
    assert.equal(byKey(cutCardMenuItems({ native: true, queueCount: 0 }), "queueSel").disabled, true);
  });
  it("timeline clip menu has no Queue selected", () => {
    assert.ok(!keys(timelineClipMenuItems({ native: true })).includes("queueSel"));
  });
});

describe("cutCardMenuItems Remove from queue / Re-queue", () => {
  it("listed only for queued / failed cuts, right after Queue selected", () => {
    assert.ok(!keys(cutCardMenuItems({ native: true })).some((k) => k === "removeQueue" || k === "requeue"));
    const items = cutCardMenuItems({ native: true, queuedCount: 1, failedCount: 2 });
    const k = keys(items);
    assert.deepEqual(k.slice(k.indexOf("queueSel"), k.indexOf("queueSel") + 3), ["queueSel", "removeQueue", "requeue"]);
    assert.equal(byKey(items, "removeQueue").label, "Remove from queue");
    assert.equal(byKey(items, "requeue").label, "Re-queue");
    assert.equal(byKey(items, "requeue").disabled, false);
    assert.equal(byKey(items, "requeue").title, "Queue 2 cuts to ComfyUI");
  });
  it("Re-queue off while busy or on imported projects", () => {
    assert.equal(byKey(cutCardMenuItems({ native: true, sdkBusy: true, failedCount: 1 }), "requeue").disabled, true);
    assert.equal(byKey(cutCardMenuItems({ native: false, failedCount: 1 }), "requeue").disabled, true);
    assert.equal(byKey(cutCardMenuItems({ native: false, queuedCount: 1 }), "removeQueue").disabled, undefined);
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
    assert.deepEqual(keys(items), ["addCut", "selectCuts", "toggleCollapse", "rename", "ungroup"]);
    assert.equal(byKey(items, "toggleCollapse").label, "Collapse");
    assert.equal(byKey(items, "addCut").disabled, false);
  });
  it("collapsed shows Expand; empty scene (New scene) keeps Add Cut, disables Select cuts", () => {
    const items = sceneMenuItems({ collapsed: true, cutCount: 0 });
    assert.equal(byKey(items, "toggleCollapse").label, "Expand");
    assert.equal(byKey(items, "addCut").disabled, false);
    assert.equal(byKey(items, "selectCuts").disabled, true);
  });
});

describe("menus list each action once", () => {
  const ctxs = [
    {},
    { native: true, sdkOk: true, canMoveUp: true, canMoveDown: true, inScene: true, anyInScene: true, trashCount: 1 },
    { native: true, multi: true, queueCount: 3, queuedCount: 1, failedCount: 2 },
    { native: false, readonlyTip: TIP, multi: true, needsRedo: true },
  ];
  const menus = [
    ["cut", cutCardMenuItems],
    ["timeline clip", timelineClipMenuItems],
    ["scene header", (c) => sceneMenuItems({ ...c, cutCount: 2 })],
  ];
  const groupLike = /^(group|ungroup|group into scene|remove from scene|delete scene|new scene)$/i;
  for (const [name, build] of menus) {
    it(`${name} menu: no duplicate keys or labels, no Group/Ungroup look-alikes`, () => {
      for (const ctx of ctxs) {
        const items = build(ctx).filter((it) => !it.separator);
        const k = keys(items);
        assert.equal(new Set(k).size, k.length, `duplicate key in ${name} menu: ${k}`);
        const labels = items.map((it) => it.label);
        assert.equal(new Set(labels).size, labels.length, `duplicate label in ${name} menu: ${labels}`);
        const g = labels.filter((l) => groupLike.test(l));
        assert.ok(g.every((l) => l === "Group" || l === "Ungroup"), `${name} menu: ${g}`);
        assert.ok(!k.includes("removeFromScene") && !k.includes("deleteScene"));
      }
    });
  }
  it("cut menu: Group and Ungroup are the first two items, followed by one separator", () => {
    for (const ctx of ctxs) {
      const items = cutCardMenuItems(ctx);
      assert.deepEqual(keys(items).slice(0, 3), ["group", "ungroup", "sep"]);
      assert.equal(items.filter((it) => it.separator).length, 1);
    }
  });
  it("scene header menu has a single Ungroup (Delete Scene did the same thing)", () => {
    const items = sceneMenuItems({ cutCount: 2 });
    assert.deepEqual(items.filter((it) => /scene|group/i.test(it.label)).map((it) => it.key), ["ungroup"]);
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
  it("keeps separators as-is (no action, not disabled)", () => {
    const out = attachMenuActions([{ key: "a", label: "A" }, MENU_SEPARATOR], { a: () => {} });
    assert.deepEqual(out[1], { separator: true });
  });
  it("disables items with no handler", () => {
    const out = attachMenuActions([{ key: "z", label: "Z" }], {});
    assert.equal(out[0].disabled, true);
    assert.equal(out[0].action, undefined);
  });
});
