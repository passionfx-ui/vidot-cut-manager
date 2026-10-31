import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCENE_NAME_MAX_LEN,
  SCENE_HEADER_TITLE_SEL,
  SCENE_HEADER_INPUT_CLASS,
  canInlineRenameScene,
  inlineRenameKeyAction,
  inlineSceneRenameCommitName,
} from "../../web/gg_scene_rename_core.js";

describe("canInlineRenameScene", () => {
  it("allows native projects with a group id", () => {
    assert.equal(canInlineRenameScene({ native: true, groupId: "g1" }), true);
  });

  it("keeps imported (read-only) projects non-editable", () => {
    assert.equal(canInlineRenameScene({ native: false, groupId: "g1" }), false);
  });

  it("needs a group id", () => {
    assert.equal(canInlineRenameScene({ native: true, groupId: "" }), false);
    assert.equal(canInlineRenameScene(), false);
  });
});

describe("inlineRenameKeyAction (scene)", () => {
  it("Enter saves, Escape cancels", () => {
    assert.equal(inlineRenameKeyAction({ key: "Enter" }), "commit");
    assert.equal(inlineRenameKeyAction({ key: "Escape" }), "cancel");
  });
});

describe("inlineSceneRenameCommitName", () => {
  it("returns the trimmed new name", () => {
    assert.equal(inlineSceneRenameCommitName("Scene 1", "  Opening  "), "Opening");
  });

  it("saves nothing when unchanged or blank", () => {
    assert.equal(inlineSceneRenameCommitName("Scene 1", "Scene 1"), null);
    assert.equal(inlineSceneRenameCommitName("Scene 1", ""), null);
    assert.equal(inlineSceneRenameCommitName("Scene 1", "   "), null);
  });

  it("caps at the scene name limit", () => {
    const long = "x".repeat(SCENE_NAME_MAX_LEN + 5);
    assert.equal(inlineSceneRenameCommitName("Scene 1", long).length, SCENE_NAME_MAX_LEN);
  });
});

describe("selectors", () => {
  it("documents stable header and input hooks", () => {
    assert.equal(SCENE_HEADER_TITLE_SEL, ".gg-grp-sec[data-group-id] .gg-grp-title");
    assert.equal(SCENE_HEADER_INPUT_CLASS, "gg-grp-title-input");
  });
});
