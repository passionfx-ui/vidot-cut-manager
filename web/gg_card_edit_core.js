/**
 * Shots list card Notes/Caption edit mode (pure logic, no DOM).
 */

export const CARD_EDIT_IDLE_TIP = "Double-click to edit";
export const CARD_EDIT_ACTIVE_TIP = "Enter = done, Esc = done, Shift+Enter = new line";

/** @param {{ inEditMode?: boolean }} opts */
export function shouldSkipCardSelect({ inEditMode = false }) {
  return !!inEditMode;
}

/** @param {Element | null | undefined} el */
export function isCardFieldEditing(el) {
  return el?.dataset?.editing === "1";
}

/**
 * @param {{ key: string, shiftKey?: boolean, isComposing?: boolean }} opts
 * @returns {"commit" | "newline" | "none"}
 */
export function cardEditKeyAction({ key, shiftKey = false, isComposing = false }) {
  if (isComposing) return "none";
  if (key === "Escape") return "commit";
  if (key === "Enter") return shiftKey ? "newline" : "commit";
  return "none";
}
