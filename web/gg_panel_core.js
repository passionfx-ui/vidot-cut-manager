/** Pure helpers for Shots cut panel collapse (no DOM). */

export const PANEL_OPEN_KEY = "gg.panelOpen";

export function normalizePanelOpen(v) {
  if (v === false || v === "false" || v === "0" || v === 0) return false;
  return true;
}

export function loadPanelOpen(storage) {
  try {
    if (!storage) return true;
    const raw = storage.getItem(PANEL_OPEN_KEY);
    if (raw == null) return true;
    return normalizePanelOpen(raw);
  } catch (_) {
    return true;
  }
}

export function savePanelOpen(storage, open) {
  try {
    if (!storage) return;
    storage.setItem(PANEL_OPEN_KEY, normalizePanelOpen(open) ? "1" : "0");
  } catch (_) {}
}
