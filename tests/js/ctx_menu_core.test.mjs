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
  SELECT_ALL_LABEL,
} from "../../web/gg_ctx_menu_core.js";
import { queueButtonState } from "../../web/gg_batch_render_core.js";

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
});

describe("cutCardMenuItems (0.9.131 groups)", () => {
  it("Create, Generate, Organize, Edit order with separators", () => {
    const items = cutCardMenuItems({
      native: true,
      sdkOk: true,
      canMoveUp: true,
      trashCount: 2,
      trashLabel: "Trash (2)…",
      hasListCuts: true,
      hasImage: true,
      hasVersion: true,
    });
    assert.deepEqual(keys(items), [
      "addCut", "importVer", "sep",
      "queueSel", "i2v", "setBest",
      "sep",
      "moveUp", "moveDown", "moveToScene", "group", "ungroup", "split", "redo",
      "sep",
      "selectAll", "rename", "del", "trash",
    ]);
    assert.equal(byKey(items, "queueSel").label, "Generate Selected");
    assert.equal(byKey(items, "i2v").label, "Make Video");
    assert.equal(byKey(items, "selectAll").label, SELECT_ALL_LABEL);
    assert.equal(SELECT_ALL_LABEL, "Select All (Ctrl+A)");
    assert.equal(byKey(items, "split").label, "Split Scene");
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
