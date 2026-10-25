import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldClosePreviousShotTab } from "../../web/gg_tab_close_core.js";

const ok = {
  previousOpen: true,
  previousOwned: true,
  previousIsNew: false,
  previousActive: false,
  previousModified: false,
  loadOk: true,
};

describe("shouldClosePreviousShotTab", () => {
  it("closes when all conditions pass", () => {
    const r = shouldClosePreviousShotTab(ok);
    assert.equal(r.close, true);
  });

  it("blocks when load failed", () => {
    assert.equal(shouldClosePreviousShotTab({ ...ok, loadOk: false }).close, false);
  });

  it("blocks when previous not open", () => {
    assert.equal(shouldClosePreviousShotTab({ ...ok, previousOpen: false }).close, false);
  });

  it("blocks when previous not owned", () => {
    assert.equal(shouldClosePreviousShotTab({ ...ok, previousOwned: false }).close, false);
  });

  it("blocks when previous is the new tab", () => {
    assert.equal(shouldClosePreviousShotTab({ ...ok, previousIsNew: true }).close, false);
  });

  it("blocks when previous still active", () => {
    assert.equal(shouldClosePreviousShotTab({ ...ok, previousActive: true }).close, false);
  });

  it("blocks when previous modified", () => {
    assert.equal(shouldClosePreviousShotTab({ ...ok, previousModified: true }).close, false);
  });
});
