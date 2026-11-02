/** Bottom-panel layout (G2): fixed height, no resize, anchored to the screen bottom. */

export const BOTTOM_PANEL_RESIZABLE = false;

/** Bottom gap at or under this size is panel padding. A taller gap is empty space, not chrome. */
export const BOTTOM_PAD_CHROME_MAX = 24;

export const TL_FONT_PX = 12;
export const TL_LINE_HEIGHT = 1.35;
export const TL_BTN_PAD_Y = 4;
export const TL_BTN_BORDER_Y = 2;
export const TL_TOOLS_PAD_Y = 8;
export const TL_TOOLS_BORDER_Y = 1;
export const TL_RULER_PX = 20;
export const TL_TRACK_MIN_PX = 84;
export const TL_TRACK_MARGIN_TOP_PX = 6;
/** Measured Logs / Timeline / Export strip before compacting. */
export const BOTTOM_TAB_ROW_NATIVE_PX = 65;
/** Compact strip is about 60% of that row. */
export const BOTTOM_TAB_ROW_SCALE = 0.6;
export const BOTTOM_TAB_ROW_PX = Math.round(BOTTOM_TAB_ROW_NATIVE_PX * BOTTOM_TAB_ROW_SCALE);
/** Moved from the tab row onto the timeline body so the panel's fixed height stays put. */
export const BOTTOM_TAB_ROW_SAVED_PX = BOTTOM_TAB_ROW_NATIVE_PX - BOTTOM_TAB_ROW_PX;
/** Track cap, raised by the tab-row savings so that height is usable. */
export const TL_TRACK_MAX_PX = 150 + BOTTOM_TAB_ROW_SAVED_PX;
export const TL_SCROLL_PAD_BOTTOM_PX = 6;
/** Horizontal scrollbar (the timeline zoom bar). */
export const TL_SCROLLBAR_PX = 12;
export const TL_SCROLLBAR_MARGIN_BOTTOM_PX = 6;
export const TL_VIEWER_PAD_Y = 12;
export const TL_TRANSPORT_PX = 28;
export const TL_TRANSPORT_MARGIN_TOP_PX = 6;
/** Normal-mode left preview vs the screen that filled the G2 body. */
export const NORMAL_PREVIEW_GROWTH = 1.4;
export const PREVIEW_MIN_WIDTH_PX = 200;
export const PREVIEW_HOST_FRACTION = 0.4;

/** One tools row: padding, border, and one button line. */
export function timelineControlRowPx() {
  const line = Math.ceil(TL_FONT_PX * TL_LINE_HEIGHT);
  return TL_TOOLS_PAD_Y + TL_TOOLS_BORDER_Y + line + TL_BTN_PAD_Y + TL_BTN_BORDER_Y;
}

/** Ruler, track, and the scroll padding above the scrollbar. */
export function timelineTrackStackPx() {
  return TL_RULER_PX + TL_TRACK_MARGIN_TOP_PX + TL_TRACK_MIN_PX + TL_SCROLL_PAD_BOTTOM_PX;
}

/** Zoom-bar box plus the margin under it, so overflow does not cut the scrollbar. */
export function timelineScrollbarBlockPx() {
  return TL_SCROLLBAR_PX + TL_SCROLLBAR_MARGIN_BOTTOM_PX;
}

export function timelineEditorBodyPx() {
  return timelineControlRowPx() + timelineTrackStackPx() + timelineScrollbarBlockPx();
}

/** Padding plus transport. The screen sits in whatever body height is left. */
export function timelineViewerChromePx() {
  return TL_VIEWER_PAD_Y + TL_TRANSPORT_MARGIN_TOP_PX + TL_TRANSPORT_PX;
}

/** Screen height that filled the G2 editor body, before the H1 bump. */
export function g2FilledPreviewScreenPx() {
  return timelineEditorBodyPx() - timelineViewerChromePx();
}

/** Normal-mode left preview, about 40% larger than the G2 screen. */
export function normalPreviewScreenPx() {
  return Math.round(g2FilledPreviewScreenPx() * NORMAL_PREVIEW_GROWTH);
}

export function timelineViewerBodyPx() {
  return timelineViewerChromePx() + normalPreviewScreenPx();
}

/**
 * Left preview box for a bottom-panel body height.
 * Wide panels are limited by the body, so a taller body makes the preview larger.
 * @param {{ bodyHeight?: number, hostWidth?: number }} box
 */
export function normalModePreviewSize({ bodyHeight = 0, hostWidth = 0 } = {}) {
  const body = Number(bodyHeight) || 0;
  const host = Number(hostWidth) || 0;
  const byHeight = (body - timelineViewerChromePx()) * (16 / 9);
  const w = Math.max(PREVIEW_MIN_WIDTH_PX, Math.min(host * PREVIEW_HOST_FRACTION, byHeight));
  const width = Math.round(w);
  const height = Math.round((width * 9) / 16);
  return { width, height };
}

/**
 * Timeline body. At least the editor stack so the horizontal scrollbar is fully
 * inside, and taller when the normal-mode preview needs it. The compact tab row
 * adds its saved pixels here; the measured chrome shrinks by the same amount,
 * so the bottom panel's fixed height does not change. The extra pixels go to
 * the timeline track; the scrollbar stays the last row.
 */
export function fixedTimelineBodyHeight() {
  return Math.max(timelineEditorBodyPx(), timelineViewerBodyPx()) + BOTTOM_TAB_ROW_SAVED_PX;
}

/**
 * Tab strip above the timeline, plus a small bottom pad.
 * Empty space under a short timeline is not chrome.
 * @param {{ top?: number, bottom?: number }} panelRect
 * @param {{ top?: number, bottom?: number }} timelineRect
 * @param {number} [tabListHeight]
 */
export function fixedPanelChrome(panelRect, timelineRect, tabListHeight = 0) {
  const panelTop = Number(panelRect?.top) || 0;
  const panelBottom = Number(panelRect?.bottom) || 0;
  const timelineTop = Number(timelineRect?.top) || 0;
  const timelineBottom = Number(timelineRect?.bottom) || 0;
  const top = Math.max(0, timelineTop - panelTop);
  const bottom = Math.max(0, panelBottom - timelineBottom);
  const tabs = Math.max(0, Number(tabListHeight) || 0);
  const topChrome = Math.max(top, tabs);
  const bottomChrome = bottom > 0 && bottom <= BOTTOM_PAD_CHROME_MAX ? bottom : 0;
  return Math.round(topChrome + bottomChrome);
}

/**
 * Bottom panel height for the timeline body plus chrome.
 * Edit mode uses the same height (the preview is an overlay).
 * @param {number} chromePx
 * @param {boolean} [_editMode]
 */
export function fixedBottomPanelHeight(chromePx, _editMode = false) {
  void _editMode;
  const chrome = Math.max(0, Math.round(Number(chromePx) || 0));
  return fixedTimelineBodyHeight() + chrome;
}

/**
 * In-panel row. Edit mode hides the left preview (the D21 graph overlay is the
 * preview) so the timeline uses the full width. Leaving Edit mode shows it again.
 * This does not change the bottom panel height.
 * @param {{ editMode?: boolean, hostWidth?: number, previewWidth?: number }} box
 */
export function editModeTimelineRow({ editMode = false, hostWidth = 0, previewWidth = 0 } = {}) {
  const host = Math.max(0, Math.round(Number(hostWidth) || 0));
  const preview = Math.max(0, Math.round(Number(previewWidth) || 0));
  const hideLeftPreview = !!editMode;
  const usedPreview = hideLeftPreview ? 0 : Math.min(host, preview);
  return {
    hideLeftPreview,
    viewerDisplay: hideLeftPreview ? "none" : "flex",
    timelineWidth: host - usedPreview,
    editorFlex: "1 1 auto",
  };
}

/**
 * Screen-bottom anchor. A floating window's measured box is ignored.
 * @param {{ viewportHeight: number, height: number, left?: number, width?: number, bottomGap?: number, measuredHeight?: number, measuredTop?: number }} box
 */
export function anchoredBottomPanelBox({
  viewportHeight,
  height,
  left = 0,
  width = 0,
  bottomGap = 0,
} = {}) {
  const h = Math.max(0, Math.round(Number(height) || 0));
  const vh = Math.max(0, Math.round(Number(viewportHeight) || 0));
  const gap = Math.max(0, Math.round(Number(bottomGap) || 0));
  return {
    position: "fixed",
    bottom: gap,
    top: Math.max(0, vh - gap - h),
    left: Math.round(Number(left) || 0),
    width: Math.max(0, Math.round(Number(width) || 0)),
    height: h,
    resizable: BOTTOM_PANEL_RESIZABLE,
  };
}
