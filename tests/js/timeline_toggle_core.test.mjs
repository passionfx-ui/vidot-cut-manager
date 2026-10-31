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
  pluginKeyScopeActive,
  timelineShortcutAllowed,
  isTimelineShortcutKey,
  firstShowTimelineHeight,
  capMeasuredTimelineForFirstShow,
  bottomPanelPercent,
  bottomPanelSplitterTotal,
  timelineHeightFromDrag,
  timelineHeightFromPointer,
  timelinePanelChrome,
  timelineLayoutChrome,
  panelHeightForTimelineHeight,
} from "../../web/gg_timeline_toggle_core.js";

describe("firstShowTimelineHeight", () => {
  it("is half of the default panel height", () => {
    assert.equal(firstShowTimelineHeight(600, 1200), 300);
    assert.equal(firstShowTimelineHeight(501, 1200), 251);
  });
  it("never goes below the minimum or above the viewport cap", () => {
    assert.equal(firstShowTimelineHeight(300, 900), TIMELINE_MIN_HEIGHT);
    assert.equal(firstShowTimelineHeight(0, 900), TIMELINE_MIN_HEIGHT);
    assert.equal(firstShowTimelineHeight(2000, 900), 630);
  });
});

describe("capMeasuredTimelineForFirstShow", () => {
  it("passes through when nested room is unknown", () => {
    assert.equal(capMeasuredTimelineForFirstShow(880, 0), 880);
  });
  it("caps inflated measure to nested pane room", () => {
    assert.equal(capMeasuredTimelineForFirstShow(880, 420), 420);
    assert.equal(capMeasuredTimelineForFirstShow(100, 420), 100);
    assert.equal(capMeasuredTimelineForFirstShow(100, 50), 50);
  });
});

describe("bottomPanelPercent", () => {
  it("maps height to splitter percent with a floor", () => {
    assert.equal(bottomPanelPercent(250, 1000), 25);
    assert.equal(bottomPanelPercent(100, 1000), 22);
    assert.equal(bottomPanelPercent(900, 1000), 90);
    assert.equal(bottomPanelPercent(250, 0), 0);
  });
});

describe("bottomPanelSplitterTotal", () => {
  it("prefers nested pane height over overlay splitter", () => {
    assert.equal(bottomPanelSplitterTotal(962, 308), 962);
    assert.equal(bottomPanelSplitterTotal(0, 770), 770);
  });
});

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

describe("timelineHeightFromDrag", () => {
  it("grows the panel when the handle moves up", () => {
    assert.equal(timelineHeightFromDrag(300, -40, 1200), 340);
    assert.equal(timelineHeightFromDrag(300, 50, 1200), 250);
    assert.equal(timelineHeightFromDrag(300, -900, 1200), clampHeight(1200, 1200));
  });
  it("tracks pointer delta 1:1 from start height before clamp", () => {
    assert.equal(timelineHeightFromDrag(220, -150, 1000), 370);
    assert.equal(timelineHeightFromDrag(220, 80, 1000), TIMELINE_MIN_HEIGHT);
    assert.equal(timelineHeightFromDrag(633, 999 - 200, 1000), TIMELINE_MIN_HEIGHT);
    assert.equal(timelineHeightFromDrag(390, 400, 1000), TIMELINE_MIN_HEIGHT);
  });
  it("clamps to 70% viewport max symmetrically", () => {
    assert.equal(timelineHeightFromDrag(500, -500, 1000), 700);
    assert.equal(timelineHeightFromDrag(700, 600, 1000), TIMELINE_MIN_HEIGHT);
  });
});

describe("timelineHeightFromPointer", () => {
  it("snaps to min/max near viewport edges", () => {
    assert.equal(timelineHeightFromPointer(500, 400, 999, 1000), TIMELINE_MIN_HEIGHT);
    assert.equal(timelineHeightFromPointer(300, 400, 0, 1000), 700);
    assert.equal(timelineHeightFromPointer(378, 900, 980, 1000), 298);
  });
  it("snaps to min when the pointer hits the viewport bottom before delta reaches min", () => {
    assert.equal(timelineHeightFromPointer(700, 756, 999, 1000), TIMELINE_MIN_HEIGHT);
  });
});

describe("timelinePanelChrome / panelHeightForTimelineHeight", () => {
  it("derives panel target from timeline height + chrome", () => {
    assert.equal(timelinePanelChrome(280, 220), 60);
    assert.equal(timelinePanelChrome(220, 220), 0);
    assert.equal(timelinePanelChrome(200, 220), 0);
    assert.equal(panelHeightForTimelineHeight(370, 60), 430);
    assert.equal(panelHeightForTimelineHeight(220, 0), 220);
  });
});

describe("timelineLayoutChrome", () => {
  it("uses tab strip gap even when panel and timeline heights match", () => {
    assert.equal(
      timelineLayoutChrome({ top: 100, bottom: 320 }, { top: 165, bottom: 385 }),
      65,
    );
    assert.equal(timelineLayoutChrome({ top: 0, bottom: 220 }, { top: 65, bottom: 285 }), 65);
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

describe("pluginKeyScopeActive", () => {
  it("is off on the canvas (no hover, no focus)", () => {
    assert.equal(pluginKeyScopeActive({}), false);
    assert.equal(pluginKeyScopeActive(undefined), false);
    assert.equal(
      pluginKeyScopeActive({ hoverShots: false, focusShots: false, hoverTimeline: false, focusTimeline: false }),
      false,
    );
  });
  it("is on when hovering or focused inside Shots", () => {
    assert.equal(pluginKeyScopeActive({ hoverShots: true }), true);
    assert.equal(pluginKeyScopeActive({ focusShots: true }), true);
  });
  it("is on when hovering or focused inside Timeline", () => {
    assert.equal(pluginKeyScopeActive({ hoverTimeline: true }), true);
    assert.equal(pluginKeyScopeActive({ focusTimeline: true }), true);
  });
  it("Shots-only scope ignores missing timeline fields", () => {
    assert.equal(pluginKeyScopeActive({ hoverShots: false, focusShots: false }), false);
  });
});

describe("timelineShortcutAllowed", () => {
  it("requires pointer or focus inside a plugin surface", () => {
    assert.equal(timelineShortcutAllowed({}), false);
    assert.equal(timelineShortcutAllowed({ hoverShots: true }), true);
    assert.equal(timelineShortcutAllowed({ focusShots: true }), true);
    assert.equal(timelineShortcutAllowed({ hoverTimeline: true }), true);
    assert.equal(timelineShortcutAllowed({ focusTimeline: true }), true);
  });
  it("ignores legacy panel-open / sidebar-active flags", () => {
    assert.equal(timelineShortcutAllowed({ shotsSidebarActive: true }), false);
    assert.equal(timelineShortcutAllowed({ timelinePanelOpen: true, timelineDomPresent: true }), false);
  });
});
