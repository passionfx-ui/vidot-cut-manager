import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { confirmKeyAction, splitConfirmMessage } from "../../web/gg_confirm_core.js";

describe("confirm modal core", () => {
  it("Enter confirms and Escape cancels", () => {
    assert.equal(confirmKeyAction({ key: "Enter" }), "ok");
    assert.equal(confirmKeyAction({ key: "Escape" }), "cancel");
  });
  it("other keys do nothing", () => {
    for (const key of ["a", " ", "Tab", "Delete", "Backspace", "ArrowLeft"]) {
      assert.equal(confirmKeyAction({ key }), null, key);
    }
    assert.equal(confirmKeyAction(null), null);
  });
  it("Enter that commits a Korean IME composition does nothing", () => {
    assert.equal(confirmKeyAction({ key: "Enter", isComposing: true }), null);
    assert.equal(confirmKeyAction({ key: "Enter", keyCode: 229 }), null);
    assert.equal(confirmKeyAction({ key: "Process", keyCode: 229 }), null);
    assert.equal(confirmKeyAction({ key: "Escape", isComposing: true }), null);
  });
  it("single-line message becomes the heading unchanged", () => {
    const m = 'Delete project "Film A"? It will be moved to trash.';
    assert.deepEqual(splitConfirmMessage(m), { title: m, body: "" });
  });
  it("multi-line regenerate message keeps every line, first line is the heading", () => {
    const m = "Queue ONE generation job on this PC's GPU?\n\nCut 3. Window\nModel: x\n\nPrompt:\nhello";
    const r = splitConfirmMessage(m);
    assert.equal(r.title, "Queue ONE generation job on this PC's GPU?");
    assert.equal(r.body, "Cut 3. Window\nModel: x\n\nPrompt:\nhello");
    assert.equal(`${r.title}\n\n${r.body}`, m);
  });
  it("tolerates empty / non-string input", () => {
    assert.deepEqual(splitConfirmMessage(""), { title: "", body: "" });
    assert.deepEqual(splitConfirmMessage(undefined), { title: "", body: "" });
  });
});