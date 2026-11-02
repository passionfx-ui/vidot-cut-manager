// H6: Escape closes Settings and New Project the same way Cancel does (no save).
// An open dropdown takes the key first. Only the topmost dialog closes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { dialogEscapeAction, modalEscapeState } from "../../web/gg_dialog_escape_core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GONGGAN_JS = readFileSync(path.join(root, "web/gonggan.js"), "utf8");

function fnBody(name, until) {
  const start = GONGGAN_JS.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const src = GONGGAN_JS.slice(start);
  const end = src.indexOf(until || "\n}\n");
  assert.ok(end > 0, name);
  return src.slice(0, end);
}

describe("H6 dialog Escape decision", () => {
  it("closes the topmost Settings or New Project dialog", () => {
    const alone = modalEscapeState({ backdropCount: 1, dialogIndex: 0, expandedCombos: 0 });
    assert.equal(dialogEscapeAction({ key: "Escape", ...alone }), "close");
  });

  it("lets an open dropdown consume Escape before the dialog", () => {
    const combo = modalEscapeState({ backdropCount: 1, dialogIndex: 0, expandedCombos: 1 });
    assert.equal(combo.dropdownOpen, true);
    assert.equal(dialogEscapeAction({ key: "Escape", ...combo }), "dropdown");
    const select = modalEscapeState({ backdropCount: 1, dialogIndex: 0, selectOpen: true });
    assert.equal(dialogEscapeAction({ key: "Escape", ...select }), "dropdown");
  });

  it("closes only the topmost dialog when another is stacked on it", () => {
    const under = modalEscapeState({ backdropCount: 2, dialogIndex: 0, expandedCombos: 0 });
    const top = modalEscapeState({ backdropCount: 2, dialogIndex: 1, expandedCombos: 0 });
    assert.equal(under.isTopmost, false);
    assert.equal(top.isTopmost, true);
    assert.equal(dialogEscapeAction({ key: "Escape", ...under }), "ignore");
    assert.equal(dialogEscapeAction({ key: "Escape", ...top }), "close");
    const underWithList = modalEscapeState({ backdropCount: 2, dialogIndex: 0, expandedCombos: 1 });
    assert.equal(dialogEscapeAction({ key: "Escape", ...underWithList }), "ignore");
  });

  it("ignores other keys, a prevented Escape, and a dialog that is not open", () => {
    const alone = modalEscapeState({ backdropCount: 1, dialogIndex: 0 });
    assert.equal(dialogEscapeAction({ key: "Enter", ...alone }), "ignore");
    assert.equal(dialogEscapeAction({ key: "Escape", defaultPrevented: true, ...alone }), "ignore");
    const missing = modalEscapeState({ backdropCount: 1, dialogIndex: -1 });
    assert.equal(dialogEscapeAction({ key: "Escape", ...missing }), "ignore");
    assert.equal(dialogEscapeAction({ key: "Escape", ...modalEscapeState({ backdropCount: 0, dialogIndex: 0 }) }), "ignore");
  });
});

describe("H6 Settings and New Project wiring", () => {
  const closeBody = fnBody("closeProjectModal");
  const bindBody = fnBody("bindProjectModalEscape");
  const settingsBody = fnBody("openProjectSettingsModal");
  const newProjectBody = fnBody("openNewProjectModal", "\nconst TEMPLATE_FIELDS = {");

  it("both dialogs listen for Escape and drop that listener when they close", () => {
    assert.match(GONGGAN_JS, /dialogEscapeAction[\s\S]*from "\.\/gg_dialog_escape_core\.js"/);
    assert.match(GONGGAN_JS, /modalEscapeState[\s\S]*from "\.\/gg_dialog_escape_core\.js"/);
    for (const body of [settingsBody, newProjectBody]) {
      assert.ok(body.indexOf("document.body.appendChild(wrap)") < body.indexOf("bindProjectModalEscape(wrap)"));
    }
    assert.ok(settingsBody.indexOf("bindProjectModalEscape(wrap)") < settingsBody.indexOf("if (!nat || !folderIn)"));
    const unbindBody = fnBody("unbindProjectModalEscape");
    assert.match(closeBody, /unbindProjectModalEscape\(\)/);
    assert.match(bindBody, /addEventListener\("keydown", projectModalEsc, true\)/);
    assert.match(unbindBody, /removeEventListener\("keydown", projectModalEsc, true\)/);
    assert.match(bindBody, /dialogEscapeAction\(/);
    assert.match(bindBody, /modalEscapeState\(/);
    assert.match(bindBody, /closeProjectModal\(\)/);
    assert.doesNotMatch(bindBody, /postJson\(/);
    assert.doesNotMatch(bindBody, /\.submit\(/);
    assert.match(bindBody, /act !== "close"/);
  });
});
