/** Bottom-panel Export tab (pure helpers, no DOM). */

export const EXPORT_TAB_ID = "gg-export";
export const EXPORT_TAB_TITLE = "Export";
export const TIMELINE_TAB_TITLE = "Timeline";
export const LOGS_TAB_TITLE = "Logs";

/** Expected visible bottom-panel tab labels after our extension registers Export. */
export function expectedBottomPanelTabLabels() {
  return [LOGS_TAB_TITLE, TIMELINE_TAB_TITLE, EXPORT_TAB_TITLE];
}

export function normalizeBottomTabLabel(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function bottomTabLabelsMatch(expected, actual) {
  const a = (actual || []).map(normalizeBottomTabLabel);
  const e = (expected || []).map(normalizeBottomTabLabel);
  if (a.length !== e.length) return false;
  return e.every((label, i) => a[i].toLowerCase() === label.toLowerCase());
}
