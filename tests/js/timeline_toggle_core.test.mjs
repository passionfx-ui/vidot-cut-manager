import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TIMELINE_OPEN_KEY,
  TIMELINE_HEIGHT_KEY,
  TIMELINE_MIN_HEIGHT,
  normalizeTimelineOpen,
  loadTimelineOpen,
  saveTimelineOpen,
  loadTimelineHeight,
  saveTimelineHeight,
  clampHeight,
  timelineToggleTooltip,
  shouldIgnoreShortcut,
  timelineShortcutAllowed,
  isTimelineShortcutKey,
} from "../../web/gg_timeline_toggle_core.js";

describe("normalizeTimelineOpen", () => {
  it("defaults to on", () => {
    assert.equal(normalizeTimelineOpen(true), true);
    assert.equal(normalizeTimelineOpen("1"), true);
    assert.equal(normalizeTimelineOpen(undefined), true);
  });
  it("maps off sentinels", () => {
    assert.equal(normalizeTimelineOpen(false), false);
    assert.equal(normalizeTimelineOpen("0"), false);
  });
});

describe("loadTimelineOpen / saveTimelineOpen", () => {
  it("round-trips", () => {
    const m = new Map();
    const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    assert.equal(loadTimelineOpen(storage), true);
    saveTimelineOpen(storage, false);
    assert.equal(m.get(TIMELINE_OPEN_KEY), "0");
    assert.equal(loadTimelineOpen(storage), false);
  });
});

describe("timeline height storage", () => {
  it("round-trips numeric height", () => {
    const m = new Map();
    const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    saveTimelineHeight(storage, 312.7);
    assert.equal(m.get(TIMELINE_HEIGHT_KEY), "313");
    assert.equal(loadTimelineHeight(storage), 313);
  });
});

describe("clampHeight", () => {
  it("enforces min and 70% viewport cap", () => {
    assert.equal(clampHeight(100, 900, TIMELINE_MIN_HEIGHT), TIMELINE_MIN_HEIGHT);
    assert.equal(clampHeight(900, 900, TIMELINE_MIN_HEIGHT), 630);
    assert.equal(clampHeight(400, 900, TIMELINE_MIN_HEIGHT), 400);
  });
});

describe("timelineToggleTooltip", () => {
  it("includes T hint", () => {
    assert.match(timelineToggleTooltip(true), /on \(T\)/);
    assert.match(timelineToggleTooltip(false), /off \(T\)/);
  });
});

describe("shouldIgnoreShortcut", () => {
  it("ignores typing contexts and modifiers", () => {
    assert.equal(shouldIgnoreShortcut({ key: "t", target: { tagName: "INPUT" } }), true);
    assert.equal(shouldIgnoreShortcut({ key: "t", ctrlKey: true }), true);
    assert.equal(shouldIgnoreShortcut({ key: "t", modalOpen: true }), true);
  });
  it("allows plain t on body", () => {
    assert.equal(shouldIgnoreShortcut({ key: "t", target: { tagName: "BODY" } }), false);
    assert.equal(shouldIgnoreShortcut({ key: "t", altKey: true, target: { tagName: "BODY" } }), false);
  });
  it("isTimelineShortcutKey", () => {
    assert.equal(isTimelineShortcutKey("t"), true);
    assert.equal(isTimelineShortcutKey("T"), true);
    assert.equal(isTimelineShortcutKey("u"), false);
  });
});

describe("timelineShortcutAllowed", () => {
  it("requires gonggan context", () => {
    assert.equal(timelineShortcutAllowed({}), false);
    assert.equal(timelineShortcutAllowed({ shotsSidebarActive: true }), true);
    assert.equal(timelineShortcutAllowed({ timelinePanelOpen: true }), true);
  });
});
