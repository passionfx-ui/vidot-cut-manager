import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PANEL_OPEN_KEY,
  normalizePanelOpen,
  loadPanelOpen,
  savePanelOpen,
} from "../../web/gg_panel_core.js";

describe("normalizePanelOpen", () => {
  it("defaults unknown to open", () => {
    assert.equal(normalizePanelOpen(true), true);
    assert.equal(normalizePanelOpen("1"), true);
    assert.equal(normalizePanelOpen(undefined), true);
  });
  it("maps closed sentinels", () => {
    assert.equal(normalizePanelOpen(false), false);
    assert.equal(normalizePanelOpen("false"), false);
    assert.equal(normalizePanelOpen("0"), false);
    assert.equal(normalizePanelOpen(0), false);
  });
});

describe("loadPanelOpen / savePanelOpen", () => {
  it("round-trips via storage", () => {
    const m = new Map();
    const storage = {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, v),
    };
    assert.equal(loadPanelOpen(storage), true);
    savePanelOpen(storage, false);
    assert.equal(m.get(PANEL_OPEN_KEY), "0");
    assert.equal(loadPanelOpen(storage), false);
    savePanelOpen(storage, true);
    assert.equal(loadPanelOpen(storage), true);
  });

  it("never throws on null or throwing storage", () => {
    assert.equal(loadPanelOpen(null), true);
    savePanelOpen(null, false);
    const bad = {
      getItem: () => { throw new Error("fail"); },
      setItem: () => { throw new Error("fail"); },
    };
    assert.equal(loadPanelOpen(bad), true);
    savePanelOpen(bad, false);
  });
});
