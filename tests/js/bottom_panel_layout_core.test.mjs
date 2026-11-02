import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  BOTTOM_PANEL_RESIZABLE,
  NORMAL_PREVIEW_GROWTH,
  TL_SCROLLBAR_PX,
  TL_SCROLLBAR_MARGIN_BOTTOM_PX,
  TL_TRACK_MIN_PX,
  timelineControlRowPx,
  timelineTrackStackPx,
  timelineScrollbarBlockPx,
  timelineEditorBodyPx,
  timelineViewerChromePx,
  g2FilledPreviewScreenPx,
  normalPreviewScreenPx,
  normalModePreviewSize,
  timelineViewerBodyPx,
  fixedTimelineBodyHeight,
  fixedPanelChrome,
  fixedBottomPanelHeight,
  anchoredBottomPanelBox,
} from "../../web/gg_bottom_panel_layout_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(__dirname, "../../web/gonggan.js"), "utf8");
const css = readFileSync(join(__dirname, "../../web/gonggan.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const ruleFor = (sel) => rules.find((r) => r.sel === sel);
const prop = (rule, name) => rule?.body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))?.[1].trim();

describe("bottom panel height fits the horizontal scrollbar", () => {
  it("ends at the scrollbar block, with no gap under it", () => {
    assert.equal(timelineScrollbarBlockPx(), TL_SCROLLBAR_PX + TL_SCROLLBAR_MARGIN_BOTTOM_PX);
    assert.equal(timelineEditorBodyPx(), timelineControlRowPx() + timelineTrackStackPx() + timelineScrollbarBlockPx());
    assert.equal(
      timelineEditorBodyPx() - (timelineControlRowPx() + timelineTrackStackPx()),
      timelineScrollbarBlockPx(),
    );
    const extra = fixedTimelineBodyHeight() - timelineEditorBodyPx();
    assert.ok(extra > 0);
    assert.equal(extra, normalPreviewScreenPx() - g2FilledPreviewScreenPx());
    assert.equal(fixedTimelineBodyHeight(), timelineViewerBodyPx());
    assert.equal(fixedTimelineBodyHeight(), 214);
    assert.equal(TL_SCROLLBAR_PX, 12);
    assert.equal(TL_TRACK_MIN_PX, 84);
  });

  it("matches the timeline scrollbar CSS", () => {
    const zoom = ruleFor(".gg-timeline .gg-zoombar");
    assert.equal(prop(zoom, "height"), `${TL_SCROLLBAR_PX}px`);
    assert.match(prop(zoom, "margin") || "", new RegExp(`(?:^|\\s)${TL_SCROLLBAR_MARGIN_BOTTOM_PX}px$`));
    const track = ruleFor(".gg-timeline .gg-track");
    assert.equal(prop(track, "min-height"), `${TL_TRACK_MIN_PX}px`);
    const screen = ruleFor(".gg-timeline .gg-screen");
    assert.equal(prop(screen, "min-height"), `${normalPreviewScreenPx()}px`);
    assert.equal(prop(screen, "aspect-ratio"), "16 / 9");
  });

  it("counts tab chrome and a small bottom pad, not empty space under a short timeline", () => {
    assert.equal(
      fixedPanelChrome({ top: 800, bottom: 1200 }, { top: 840, bottom: 1006 }, 40),
      40,
    );
    assert.equal(
      fixedPanelChrome({ top: 800, bottom: 1008 }, { top: 840, bottom: 1000 }, 0),
      48,
    );
    assert.equal(fixedPanelChrome({ top: 0, bottom: 0 }, { top: 0, bottom: 0 }, 36), 36);
  });

  it("uses that height in Edit mode too", () => {
    assert.equal(fixedBottomPanelHeight(48, false), fixedTimelineBodyHeight() + 48);
    assert.equal(fixedBottomPanelHeight(48, true), fixedBottomPanelHeight(48, false));
    assert.equal(fixedBottomPanelHeight(0, true), fixedTimelineBodyHeight());
    assert.equal(fixedBottomPanelHeight(-4, true), fixedTimelineBodyHeight());
  });
});

describe("normal-mode left preview is about 40% larger", () => {
  it("grows the G2 screen by 40% and raises the fixed body so the track can use it", () => {
    assert.equal(NORMAL_PREVIEW_GROWTH, 1.4);
    assert.equal(timelineViewerChromePx(), 46);
    assert.equal(g2FilledPreviewScreenPx(), timelineEditorBodyPx() - timelineViewerChromePx());
    assert.equal(g2FilledPreviewScreenPx(), 120);
    assert.equal(normalPreviewScreenPx(), Math.round(g2FilledPreviewScreenPx() * NORMAL_PREVIEW_GROWTH));
    assert.equal(normalPreviewScreenPx(), 168);
    assert.equal(timelineViewerBodyPx(), timelineViewerChromePx() + normalPreviewScreenPx());
    assert.ok(fixedTimelineBodyHeight() >= timelineEditorBodyPx());
    const wide = 1600;
    const before = normalModePreviewSize({ bodyHeight: timelineEditorBodyPx(), hostWidth: wide });
    const after = normalModePreviewSize({ bodyHeight: fixedTimelineBodyHeight(), hostWidth: wide });
    assert.equal(before.height, g2FilledPreviewScreenPx());
    assert.equal(after.height, normalPreviewScreenPx());
    assert.ok(after.height / before.height >= 1.38 && after.height / before.height <= 1.42);
    assert.ok(after.width / before.width >= 1.38 && after.width / before.width <= 1.42);
    assert.ok(js.includes("normalModePreviewSize("));
  });

  it("anchors the taller body without a resize handle, scrollbar still inside", () => {
    const height = fixedBottomPanelHeight(40, false);
    const box = anchoredBottomPanelBox({ viewportHeight: 900, height, left: 12, width: 1400 });
    assert.equal(box.resizable, false);
    assert.equal(BOTTOM_PANEL_RESIZABLE, false);
    assert.equal(box.position, "fixed");
    assert.equal(box.bottom, 0);
    assert.equal(box.height, fixedTimelineBodyHeight() + 40);
    assert.equal(box.top, 900 - box.height);
    assert.equal(
      timelineEditorBodyPx() - timelineControlRowPx() - timelineTrackStackPx(),
      timelineScrollbarBlockPx(),
    );
  });
});

describe("bottom panel is anchored and not resizable", () => {
  it("stays on the screen bottom at the fixed height when a float pushes or shrinks it", () => {
    const stable = anchoredBottomPanelBox({
      viewportHeight: 900,
      height: 206,
      left: 240,
      width: 880,
    });
    const pushed = anchoredBottomPanelBox({
      viewportHeight: 900,
      height: 206,
      left: 240,
      width: 880,
      measuredHeight: 40,
      measuredTop: 860,
    });
    assert.deepEqual(pushed, stable);
    assert.equal(stable.position, "fixed");
    assert.equal(stable.bottom, 0);
    assert.equal(stable.top, 694);
    assert.equal(stable.height, 206);
    assert.equal(stable.left, 240);
    assert.equal(stable.width, 880);
    assert.equal(stable.resizable, false);
    assert.equal(BOTTOM_PANEL_RESIZABLE, false);
  });
});

describe("timeline layout does not mount a resize handle", () => {
  it("mounts the timeline without a drag handle and applies the anchor", () => {
    const start = js.indexOf("function mountTimeline(");
    const end = js.indexOf("\nfunction ", start + 20);
    const mount = js.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.equal(mount.includes("gg-tl-resize"), false);
    assert.equal(mount.includes("bindTimelineResize"), false);
    assert.equal(js.includes("timelineHeightFromPointer("), false);
    assert.ok(js.includes("applyAnchoredBottomPanel("));
    assert.ok(js.includes("fixedBottomPanelHeight("));
    assert.ok(js.includes("anchoredBottomPanelBox("));
  });

  it("disables the timeline resize handle and keeps the scrollbar inside the column", () => {
    const handle = ruleFor(".gg-timeline .gg-tl-resize");
    assert.equal(prop(handle, "display"), "none");
    assert.equal(prop(handle, "pointer-events"), "none");
    const editor = ruleFor(".gg-timeline .gg-editor");
    assert.equal(prop(editor, "min-height"), "0");
    assert.equal(prop(editor, "overflow"), "hidden");
    const scroll = ruleFor(".gg-timeline .gg-tl-scroll");
    assert.equal(prop(scroll, "min-height"), "0");
    const timeline = ruleFor(".gg-timeline");
    assert.equal(prop(timeline, "min-height"), "0");
    const gutter = ruleFor('html.gg-bottom-anchored [data-testid="graph-canvas-gutter"]');
    assert.match(gutter?.body || "", /pointer-events:\s*none/);
  });
});
