import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comboActiveIndex, comboFilter, comboKey, comboTypedValue } from "../../web/gg_combo_core.js";
import { templateComboItems } from "../../web/gg_template_pick_core.js";

const PATHS = ["zeta/Final.json", "alpha/draft.json", "gonggan/p/cut.json", "Beta.json"];
const values = (items) => items.map((it) => it.value);
const BUILTINS = ["builtin:image", "builtin:video-ltx", "builtin:video-ltx-t2v"];

describe("templateComboItems (0.9.94, built-ins 0.9.117)", () => {
  it("(none) first, then the built-in templates, then user templates A-Z, internal workflows hidden", () => {
    assert.deepEqual(values(templateComboItems(PATHS, "")), ["", ...BUILTINS, "alpha/draft.json", "Beta.json", "zeta/Final.json"]);
    assert.equal(templateComboItems(PATHS, "")[0].label, "(none)");
    assert.equal(templateComboItems(PATHS, "")[1].label, "Image (default)");
  });

  it("keeps the saved ref even when internal or missing from the list", () => {
    assert.ok(values(templateComboItems(PATHS, "gonggan/p/cut.json")).includes("gonggan/p/cut.json"));
    const gone = templateComboItems(PATHS, "old/deleted.json");
    assert.equal(gone.at(-1).value, "old/deleted.json");
    assert.equal(gone.at(-1).label, "old/deleted.json");
    assert.deepEqual(values(templateComboItems([], "x.json")), ["", ...BUILTINS, "x.json"]);
    assert.deepEqual(values(templateComboItems([], "builtin:video-ltx")), ["", ...BUILTINS], "a built-in is not listed twice");
  });

  it("Image / Video template fields have no (none)", () => {
    assert.deepEqual(values(templateComboItems(["a.json"], "builtin:image", { none: false })), [...BUILTINS, "a.json"]);
  });
});

describe("comboFilter", () => {
  const items = templateComboItems(PATHS, "");

  it("empty query keeps everything (a copy)", () => {
    const out = comboFilter(items, "  ");
    assert.deepEqual(out, items);
    assert.notEqual(out, items);
  });

  it("case-insensitive substring on the label, live per keystroke", () => {
    assert.deepEqual(values(comboFilter(items, "A")), ["builtin:image", "builtin:video-ltx", "alpha/draft.json", "Beta.json", "zeta/Final.json"]);
    assert.deepEqual(values(comboFilter(items, "default")), ["builtin:image", "builtin:video-ltx"]);
    assert.deepEqual(values(comboFilter(items, "FIN")), ["zeta/Final.json"]);
    assert.deepEqual(values(comboFilter(items, "none")), [""]);
    assert.deepEqual(comboFilter(items, "nothing-matches"), []);
    assert.deepEqual(comboFilter(null, "a"), []);
  });
});

describe("comboActiveIndex", () => {
  const items = templateComboItems(PATHS, "Beta.json");

  it("empty query highlights the current value, else (none)", () => {
    assert.equal(comboActiveIndex(items, "Beta.json", ""), 5);
    assert.equal(comboActiveIndex(items, "", ""), 0);
    assert.equal(comboActiveIndex(items, "not/listed.json", ""), 0);
  });

  it("typed query highlights only an exact label match (0.9.101), so Enter keeps a typed value", () => {
    assert.equal(comboActiveIndex(comboFilter(items, "zeta"), "Beta.json", "zeta"), -1);
    const exact = comboFilter(items, "ZETA/final.json");
    assert.equal(comboActiveIndex(exact, "Beta.json", "ZETA/final.json"), 0);
    assert.equal(items[comboActiveIndex(items, "", "alpha/draft.json")].value, "alpha/draft.json");
    assert.equal(comboActiveIndex([], "", "x"), -1);
  });
});

describe("comboTypedValue (0.9.101)", () => {
  const items = templateComboItems(PATHS, "");

  it("a typed label maps to its value, (none) to empty", () => {
    assert.equal(comboTypedValue(items, " Alpha/Draft.JSON "), "alpha/draft.json");
    assert.equal(comboTypedValue(items, "(none)"), "");
    assert.equal(comboTypedValue(items, "(None)"), "");
    assert.equal(comboTypedValue(items, "   "), "");
  });

  it("other text is used as typed (trimmed)", () => {
    assert.equal(comboTypedValue(items, "  my/own.json "), "my/own.json");
    assert.equal(comboTypedValue(items, "zeta"), "zeta");
    assert.equal(comboTypedValue(null, "x.json"), "x.json");
  });
});

describe("comboKey", () => {
  const open = (active, count = 4) => ({ open: true, active, count });

  it("arrows open a closed list", () => {
    for (const key of ["ArrowDown", "ArrowUp"]) {
      const r = comboKey({ open: false, active: -1, count: 4 }, key);
      assert.equal(r.open, true);
      assert.equal(r.handled, true);
      assert.equal(r.pick, -1);
    }
  });

  it("ArrowDown / ArrowUp move and clamp at the ends", () => {
    assert.equal(comboKey(open(-1), "ArrowDown").active, 0);
    assert.equal(comboKey(open(0), "ArrowDown").active, 1);
    assert.equal(comboKey(open(3), "ArrowDown").active, 3);
    assert.equal(comboKey(open(2), "ArrowUp").active, 1);
    assert.equal(comboKey(open(0), "ArrowUp").active, 0);
    assert.equal(comboKey(open(-1), "ArrowUp").active, 0);
    assert.equal(comboKey(open(9), "ArrowUp").active, 2, "stale index is clamped to the list first");
    assert.equal(comboKey(open(-1, 0), "ArrowDown").active, -1);
  });

  it("Enter picks the highlighted item and closes", () => {
    const r = comboKey(open(2), "Enter");
    assert.deepEqual(r, { open: false, active: 2, pick: 2, revert: false, commit: false, handled: true });
  });

  it("Enter with no highlight closes and commits the typed text (0.9.101)", () => {
    for (const count of [0, 3]) {
      const r = comboKey(open(-1, count), "Enter");
      assert.equal(r.pick, -1);
      assert.equal(r.open, false);
      assert.equal(r.commit, true);
      assert.equal(r.revert, false);
      assert.equal(r.handled, true, "must not submit the form");
    }
  });

  it("Enter on a closed list commits the typed text and is left to the form", () => {
    const r = comboKey({ open: false, active: 1, count: 4 }, "Enter");
    assert.equal(r.handled, false);
    assert.equal(r.commit, true);
    assert.equal(r.pick, -1);
  });

  it("Escape closes and reverts; on a closed list it is not handled", () => {
    const r = comboKey(open(1), "Escape");
    assert.equal(r.open, false);
    assert.equal(r.revert, true);
    assert.equal(r.handled, true);
    assert.equal(r.pick, -1);
    assert.equal(comboKey({ open: false, active: -1, count: 4 }, "Escape").handled, false);
  });

  it("Tab closes without blocking focus and keeps the typed text (leaving the field commits it); other keys change nothing", () => {
    const t = comboKey(open(1), "Tab");
    assert.equal(t.open, false);
    assert.equal(t.handled, false);
    assert.equal(t.revert, false);
    assert.equal(t.commit, false);
    assert.deepEqual(comboKey(open(1), "a"), { open: true, active: 1, pick: -1, revert: false, commit: false, handled: false });
  });
});
