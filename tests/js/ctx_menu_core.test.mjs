import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cutActionItems,
  cutCardMenuItems,
  timelineClipMenuItems,
  sceneMenuItems,
  sceneCutIds,
  attachMenuActions,
  SINGLE_CUT_TIP,
  BUSY_TIP,
  TRASH_TIP,
  I2V_NO_IMAGE_TIP,
  MENU_SEPARATOR,
  MAKE_SCENE_LABEL,
  REMOVE_FROM_SCENE_LABEL,
  REMOVE_FROM_SCENE_TIP,
  START_NEW_SCENE_LABEL,
  START_NEW_SCENE_TIP,
} from "../../web/gg_ctx_menu_core.js";
import { queueButtonState } from "../../web/gg_batch_render_core.js";
import { restoreDeletedCutsMenuLabel } from "../../web/gg_trash_core.js";

const TIP = "read-only tip";
const keys = (items) => items.map((it) => it.key);
const byKey = (items, k) => items.find((it) => it.key === k);

describe("cutActionItems", () => {
  it("Mark for Redo labels and native-only gating", () => {
    const a = cutActionItems({ native: false, needsRedo: true, readonlyTip: TIP });
    assert.equal(a.redo.label, "Clear Mark for Redo");
    assert.equal(a.redo.disabled, true);
    const b = cutActionItems({ native: true, needsRedo: false });
    assert.equal(b.redo.label, "Mark for Redo");
    assert.equal(b.redo.disabled, false);
  });

  it("Rename and Delete shortcut hints match wired keys", () => {
    const a = cutActionItems({ native: true });
    assert.equal(a.rename.shortcut, "F2");
    assert.equal(a.del.shortcut, "Del");
  });
});

describe("cutCardMenuItems (0.9.132 Premiere sections)", () => {
  it("Make Scene, Create, Generate, Organize, Edit order with separators", () => {
    const items = cutCardMenuItems({
      native: true,
      sdkOk: true,
      canMoveUp: true,
      trashCount: 2,
      trashLabel: restoreDeletedCutsMenuLabel(2),
      hasImage: true,
      hasVersion: true,
    });
    assert.deepEqual(keys(items), [
      "group", "sep",
      "addCut", "importVer",
      "sep",
      "queueSel", "i2v", "setBest", "redo",
      "sep",
      "moveUp", "moveDown", "moveToScene", "ungroup", "split",
      "sep",
      "rename", "del", "trash",
    ]);
    assert.equal(byKey(items, "group").label, MAKE_SCENE_LABEL);
    assert.equal(byKey(items, "queueSel").label, "Generate Selected");
    assert.equal(byKey(items, "i2v").label, "Make Video");
    assert.equal(byKey(items, "ungroup").label, REMOVE_FROM_SCENE_LABEL);
    const inScene = cutCardMenuItems({ native: true, inScene: true, hasImage: true, hasVersion: true });
    assert.equal(byKey(inScene, "ungroup").title, REMOVE_FROM_SCENE_TIP);
    assert.equal(byKey(inScene, "split").label, START_NEW_SCENE_LABEL);
    assert.equal(byKey(inScene, "split").title, START_NEW_SCENE_TIP);
    assert.equal(byKey(items, "trash").label, restoreDeletedCutsMenuLabel(2));
    assert.ok(!keys(items).includes("selectAll"));
  });

  it("no Regen or Send last output", () => {
    const k = keys(cutCardMenuItems({ native: true, hasImage: true, hasVersion: true }));
    assert.ok(!k.includes("regen"));
    assert.ok(!k.includes("send"));
  });

  it("Set as Best disabled without a version", () => {
    assert.equal(byKey(cutCardMenuItems({ native: true, hasVersion: false }), "setBest").disabled, true);
    assert.equal(byKey(cutCardMenuItems({ native: true, hasVersion: true }), "setBest").disabled, false);
  });

  it("MENU_SEPARATOR is a real divider token", () => {
    assert.equal(MENU_SEPARATOR.separator, true);
    assert.equal(MENU_SEPARATOR.key, "sep");
  });
});

describe("timelineClipMenuItems", () => {
  it("no Regen or Send; Title Case labels", () => {
    const items = timelineClipMenuItems({ native: true });
    assert.deepEqual(keys(items), ["open", "redo", "rename", "applyOrder", "del"]);
    assert.deepEqual(items.map((i) => i.label), [
      "Open Cut", "Mark for Redo", "Rename…", "Apply Order to Cuts", "Delete",
    ]);
  });
});

describe("sceneMenuItems", () => {
  it("Title Case scene menu", () => {
    const items = sceneMenuItems({ collapsed: false, cutCount: 2 });
    assert.equal(byKey(items, "selectCuts").label, "Select Cuts");
    assert.equal(byKey(items, "ungroup").label, REMOVE_FROM_SCENE_LABEL);
  });
});

describe("sceneCutIds", () => {
  it("returns members in timeline order", () => {
    const cuts = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.deepEqual(sceneCutIds(cuts, { cut_ids: ["c", "x", "b"] }), ["b", "c"]);
  });
});

describe("attachMenuActions", () => {
  it("disables items with no handler", () => {
    const out = attachMenuActions([{ key: "z", label: "Z" }], {});
    assert.equal(out[0].disabled, true);
  });
});

describe("queue integration", () => {
  it("Generate Selected uses queue button state", () => {
    assert.equal(byKey(cutCardMenuItems({ native: true }), "queueSel").label, "Generate Selected");
    assert.equal(queueButtonState({ count: 1, native: true }).disabled, false);
  });
});
