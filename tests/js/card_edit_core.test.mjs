import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cardEditKeyAction,
  shouldSkipCardSelect,
  isCardFieldEditing,
  CARD_EDIT_IDLE_TIP,
  CARD_EDIT_ACTIVE_TIP,
} from "../../web/gg_card_edit_core.js";

describe("shouldSkipCardSelect", () => {
  it("skips only in edit mode", () => {
    assert.equal(shouldSkipCardSelect({ inEditMode: false }), false);
    assert.equal(shouldSkipCardSelect({ inEditMode: true }), true);
  });
});

describe("cardEditKeyAction", () => {
  it("Enter commits, Shift+Enter newline", () => {
    assert.equal(cardEditKeyAction({ key: "Enter" }), "commit");
    assert.equal(cardEditKeyAction({ key: "Enter", shiftKey: true }), "newline");
  });

  it("Escape commits", () => {
    assert.equal(cardEditKeyAction({ key: "Escape" }), "commit");
  });

  it("ignores keys while composing", () => {
    assert.equal(cardEditKeyAction({ key: "Enter", isComposing: true }), "none");
    assert.equal(cardEditKeyAction({ key: "Escape", isComposing: true }), "none");
  });

  it("other keys are none", () => {
    assert.equal(cardEditKeyAction({ key: "a" }), "none");
    assert.equal(cardEditKeyAction({ key: "Tab" }), "none");
  });
});

describe("isCardFieldEditing", () => {
  it("reads data-editing flag", () => {
    assert.equal(isCardFieldEditing(null), false);
    assert.equal(isCardFieldEditing({ dataset: {} }), false);
    assert.equal(isCardFieldEditing({ dataset: { editing: "1" } }), true);
  });
});

describe("tooltips", () => {
  it("exports English discoverability strings", () => {
    assert.match(CARD_EDIT_IDLE_TIP, /Double-click/i);
    assert.match(CARD_EDIT_ACTIVE_TIP, /Enter/);
    assert.match(CARD_EDIT_ACTIVE_TIP, /Esc/);
  });
});
