/** Inline cut rename in the Shots list (double-click the cut title). Pure, no DOM. */

import { normalizeNameInput } from "./gg_ask_text_core.js";

export const CUT_NAME_MAX_LEN = 80;

/** Imported (read-only) projects keep their cut names. */
export function canInlineRenameCut({ native = false, cutId = "" } = {}) {
  return !!native && !!cutId;
}

/**
 * Enter saves, Escape cancels; nothing while an IME composition is open.
 * @param {{ key: string, isComposing?: boolean }} opts
 * @returns {"commit" | "cancel" | "none"}
 */
export function inlineRenameKeyAction({ key, isComposing = false }) {
  if (isComposing) return "none";
  if (key === "Enter") return "commit";
  if (key === "Escape") return "cancel";
  return "none";
}

/**
 * Name to save when the field closes with commit (Enter or blur), or null when nothing should be saved:
 * a blank field or a name equal to the current one.
 * @param {string} current
 * @param {unknown} raw
 * @param {number} [maxLen]
 * @returns {string | null}
 */
export function inlineRenameCommitName(current, raw, maxLen = CUT_NAME_MAX_LEN) {
  const norm = normalizeNameInput(raw, maxLen);
  if (!norm.ok) return null;
  return norm.value === String(current ?? "") ? null : norm.value;
}

/** Full Shots list repaints wait while a title field is open (the repaint would drop it). */
export function shouldDeferListPaint({ composing = false, inlineRenaming = false } = {}) {
  return !!composing || !!inlineRenaming;
}
