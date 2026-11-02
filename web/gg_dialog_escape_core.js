/** Escape for the Settings dialog and the New Project dialog. No DOM. */

/**
 * Which backdrop is in front, and whether a menu inside this dialog is open.
 * The last backdrop is the topmost dialog. A template combobox (aria-expanded)
 * or a native select popup counts as an open dropdown.
 * @param {{ backdropCount?: number, dialogIndex?: number, expandedCombos?: number, selectOpen?: boolean }} view
 * @returns {{ dropdownOpen: boolean, isTopmost: boolean }}
 */
export function modalEscapeState({
  backdropCount = 0,
  dialogIndex = -1,
  expandedCombos = 0,
  selectOpen = false,
} = {}) {
  const count = Math.max(0, Number(backdropCount) || 0);
  const index = Number(dialogIndex);
  const listed = Number.isInteger(index) && count > 0 && index >= 0 && index < count;
  return {
    dropdownOpen: (Number(expandedCombos) || 0) > 0 || selectOpen === true,
    isTopmost: listed && index === count - 1,
  };
}

/**
 * What Escape does to the Settings / New Project dialog.
 * Close matches Cancel: dismiss, do not save.
 * A dialog that is not in front ignores the key (the top dialog handles it).
 * An open dropdown on the front dialog takes the key so the menu closes first.
 * @param {{ key?: string, defaultPrevented?: boolean, dropdownOpen?: boolean, isTopmost?: boolean }} state
 * @returns {"close"|"dropdown"|"ignore"}
 */
export function dialogEscapeAction({ key, defaultPrevented, dropdownOpen, isTopmost } = {}) {
  if (key !== "Escape" || defaultPrevented) return "ignore";
  if (!isTopmost) return "ignore";
  if (dropdownOpen) return "dropdown";
  return "close";
}
