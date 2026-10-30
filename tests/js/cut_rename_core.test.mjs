import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUT_NAME_MAX_LEN,
  canInlineRenameCut,
  inlineRenameKeyAction,
  inlineRenameCommitName,
  shouldDeferListPaint,
} from "../../web/gg_cut_rename_core.js";

describe("canInlineRenameCut", () => {
  it("allows native projects with a cut id", () => {
    assert.equal(canInlineRenameCut({ native: true, cutId: "c1" }), true);
  });

  it("keeps imported (read-only) projects non-editable", () => {
    assert.equal(canInlineRenameCut({ native: false, cutId: "c1" }), false);
  });

  it("needs a cut id", () => {
    assert.equal(canInlineRenameCut({ native: true, cutId: "" }), false);
    assert.equal(canInlineRenameCut(), false);
  });
});

describe("inlineRenameKeyAction", () => {
  it("Enter saves, Escape cancels", () => {
    assert.equal(inlineRenameKeyAction({ key: "Enter" }), "commit");
    assert.equal(inlineRenameKeyAction({ key: "Escape" }), "cancel");
  });

  it("ignores keys while an IME composition is open", () => {
    assert.equal(inlineRenameKeyAction({ key: "Enter", isComposing: true }), "none");
    assert.equal(inlineRenameKeyAction({ key: "Escape", isComposing: true }), "none");
  });

  it("other keys type normally", () => {
    for (const key of ["a", "F2", "Delete", "Tab", " "]) assert.equal(inlineRenameKeyAction({ key }), "none");
  });
});

describe("inlineRenameCommitName", () => {
  it("returns the trimmed new name", () => {
    assert.equal(inlineRenameCommitName("New cut", "  Opening shot  "), "Opening shot");
  });

  it("renames a freshly created 'New cut'", () => {
    assert.equal(inlineRenameCommitName("New cut", "Hero walks in"), "Hero walks in");
  });

  it("saves nothing when unchanged (after trim)", () => {
    assert.equal(inlineRenameCommitName("New cut", "New cut"), null);
    assert.equal(inlineRenameCommitName("New cut", " New cut "), null);
  });

  it("saves nothing for a blank field (keeps the old name)", () => {
    assert.equal(inlineRenameCommitName("New cut", ""), null);
    assert.equal(inlineRenameCommitName("New cut", "   "), null);
    assert.equal(inlineRenameCommitName("New cut", undefined), null);
  });

  it("accepts a name for a cut that had none", () => {
    assert.equal(inlineRenameCommitName("", "Intro"), "Intro");
    assert.equal(inlineRenameCommitName(undefined, "Intro"), "Intro");
  });

  it("caps the name at the cut name limit", () => {
    const long = "x".repeat(CUT_NAME_MAX_LEN + 20);
    assert.equal(inlineRenameCommitName("a", long).length, CUT_NAME_MAX_LEN);
    assert.equal(inlineRenameCommitName("a", "abcdef", 3), "abc");
  });
});

describe("shouldDeferListPaint", () => {
  it("defers while composing or while a title field is open", () => {
    assert.equal(shouldDeferListPaint({}), false);
    assert.equal(shouldDeferListPaint({ composing: true }), true);
    assert.equal(shouldDeferListPaint({ inlineRenaming: true }), true);
    assert.equal(shouldDeferListPaint(), false);
  });
});
