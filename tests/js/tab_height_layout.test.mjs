import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  BOTTOM_TAB_ROW_NATIVE_PX,
  BOTTOM_TAB_ROW_PX,
  BOTTOM_TAB_ROW_SAVED_PX,
  BOTTOM_TAB_ROW_SCALE,
  TL_SCROLLBAR_PX,
  TL_TRACK_MAX_PX,
  fixedBottomPanelHeight,
  fixedTimelineBodyHeight,
  timelineControlRowPx,
  timelineEditorBodyPx,
  timelineScrollbarBlockPx,
  timelineTrackStackPx,
  timelineViewerBodyPx,
} from "../../web/gg_bottom_panel_layout_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(__dirname, "../../web/gonggan.js"), "utf8");
const css = readFileSync(join(__dirname, "../../web/gonggan.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declBlock(selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  return css.match(re)?.[1] || "";
}

function decl(block, name) {
  return block.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))?.[1].trim() || "";
}

describe("compact bottom panel tab row", () => {
  it("is about 60% of the current strip, still readable and clickable", () => {
    assert.equal(BOTTOM_TAB_ROW_NATIVE_PX, 65);
    assert.equal(BOTTOM_TAB_ROW_SCALE, 0.6);
    assert.equal(BOTTOM_TAB_ROW_PX, Math.round(BOTTOM_TAB_ROW_NATIVE_PX * BOTTOM_TAB_ROW_SCALE));
    assert.equal(BOTTOM_TAB_ROW_PX, 39);
    assert.ok(BOTTOM_TAB_ROW_PX >= 32);
    assert.equal(BOTTOM_TAB_ROW_SAVED_PX, BOTTOM_TAB_ROW_NATIVE_PX - BOTTOM_TAB_ROW_PX);

    assert.match(css, /html\.gg-pack-bottom-tabs \.bottom-panel \[role="tablist"\]/);
    const row = declBlock('html.gg-pack-bottom-tabs .bottom-panel [role="tablist"]');
    assert.equal(decl(row, "height"), `${BOTTOM_TAB_ROW_PX}px`);
    assert.equal(decl(row, "max-height"), `${BOTTOM_TAB_ROW_PX}px`);
    assert.equal(decl(row, "padding-block"), "0");

    const tab = declBlock('html.gg-pack-bottom-tabs .bottom-panel [role="tab"]');
    assert.equal(decl(tab, "font-size"), "12px");
    assert.equal(decl(tab, "padding"), "2px 10px");
    assert.ok(parseInt(decl(tab, "min-height"), 10) >= 32);
    assert.ok(parseInt(decl(tab, "min-height"), 10) <= BOTTOM_TAB_ROW_PX);

    const setupStart = js.indexOf("async setup()");
    const setup = js.slice(setupStart, js.indexOf("registerSidebarTab", setupStart));
    assert.match(setup, /document\.documentElement\.classList\.add\("gg-pack-bottom-tabs"\)/);
  });

  it("gives the saved pixels to the timeline and keeps the panel height", () => {
    const nativeBody = timelineViewerBodyPx();
    assert.equal(fixedTimelineBodyHeight(), nativeBody + BOTTOM_TAB_ROW_SAVED_PX);
    assert.equal(fixedTimelineBodyHeight(), 240);
    const bottomPad = 8;
    const nativePanel = nativeBody + BOTTOM_TAB_ROW_NATIVE_PX + bottomPad;
    const compactPanel = fixedBottomPanelHeight(BOTTOM_TAB_ROW_PX + bottomPad);
    assert.equal(compactPanel, nativePanel);
    assert.equal(fixedBottomPanelHeight(BOTTOM_TAB_ROW_PX + bottomPad, true), compactPanel);
  });

  it("keeps the horizontal scrollbar inside the taller body", () => {
    assert.equal(
      timelineEditorBodyPx() - timelineControlRowPx() - timelineTrackStackPx(),
      timelineScrollbarBlockPx(),
    );
    assert.equal(timelineScrollbarBlockPx(), TL_SCROLLBAR_PX + 6);
    assert.ok(fixedTimelineBodyHeight() > timelineEditorBodyPx());
    assert.equal(
      fixedTimelineBodyHeight() - timelineEditorBodyPx(),
      timelineViewerBodyPx() - timelineEditorBodyPx() + BOTTOM_TAB_ROW_SAVED_PX,
    );
    const track = declBlock(".gg-timeline .gg-track");
    assert.equal(decl(track, "max-height"), `${TL_TRACK_MAX_PX}px`);
    assert.ok(TL_TRACK_MAX_PX >= 150 + BOTTOM_TAB_ROW_SAVED_PX);
    const zoom = declBlock(".gg-timeline .gg-zoombar");
    assert.equal(decl(zoom, "height"), `${TL_SCROLLBAR_PX}px`);
    assert.match(decl(zoom, "margin"), /(?:^|\s)6px$/);
  });
});
