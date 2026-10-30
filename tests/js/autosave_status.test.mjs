import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autosaveStatusMessage } from "../../web/gg_autosave_core.js";

describe("autosaveStatusMessage", () => {
  it("failure stays explicit with name and error", () => {
    const m = autosaveStatusMessage({ failing: true, error: "disk full", label: "S01" });
    assert.match(m, /^Not saved: S01\./);
    assert.match(m, /disk full/);
  });
  it("recovery after a failure is reported", () => {
    assert.equal(autosaveStatusMessage({ failing: false, wasFailing: true, label: "S01" }), "Saved: S01. Auto-save works again.");
  });
  it("normal success does not overwrite the status line", () => {
    assert.equal(autosaveStatusMessage({ failing: false, wasFailing: false, label: "S01" }), null);
  });
  it("missing fields fall back", () => {
    assert.match(autosaveStatusMessage({ failing: true }), /workflow.*unknown error/);
  });
});