/**
 * Cut selection vs workflow tab load (pure logic, no DOM).
 */

/**
 * @param {{ multi?: boolean, range?: boolean, fromTimeline?: boolean }} opts
 */
export function shouldScheduleCutWorkflowLoad(opts = {}) {
  const { multi, range, fromTimeline } = opts;
  if (multi || range || fromTimeline) return false;
  return true;
}

/**
 * @param {{ fromTimeline?: boolean }} opts
 */
export function shouldCancelPendingWorkflowLoad(opts = {}) {
  return !!opts.fromTimeline;
}

/**
 * @param {{
 *   multi?: boolean,
 *   range?: boolean,
 *   fromTimeline?: boolean,
 *   cutId?: string,
 *   graphCutId?: string,
 *   projectId?: string,
 *   graphProjectId?: string,
 * }} opts
 */
export function shouldResetOpenTabTracking(opts = {}) {
  const {
    multi,
    range,
    fromTimeline,
    cutId = "",
    graphCutId = "",
    projectId = "",
    graphProjectId = "",
  } = opts;
  if (!shouldScheduleCutWorkflowLoad({ multi, range, fromTimeline })) return false;
  if (graphCutId !== cutId) return true;
  if (projectId && graphProjectId && graphProjectId !== projectId) return true;
  return false;
}

/**
 * Show the "open in canvas" marker on a Shots list card.
 * @param {{
 *   cutId?: string,
 *   openCutId?: string,
 *   selectedCutId?: string,
 *   shotTabOpen?: boolean,
 *   sameProject?: boolean,
 * }} opts
 */
export function shouldShowOpenTabMarker(opts = {}) {
  const {
    cutId = "",
    openCutId = "",
    selectedCutId = "",
    shotTabOpen = false,
    sameProject = true,
  } = opts;
  if (!shotTabOpen || !sameProject) return false;
  if (!openCutId || !cutId) return false;
  if (cutId !== openCutId) return false;
  if (cutId === selectedCutId) return false;
  return true;
}

/** @deprecated alias */
export const isOpenTabCut = shouldShowOpenTabMarker;

/** Actions that open a dialog or change data: never fired by key auto-repeat. */
const NO_REPEAT_ACTIONS = new Set(["open", "rename", "group", "ungroup", "add"]);

function isLetterKey(e, letter) {
  return String(e.key || "").toLowerCase() === letter || e.code === `Key${letter.toUpperCase()}`;
}

/**
 * Shots sidebar key -> action name. Ctrl/Meta combos belong to ComfyUI and map to null, except plain
 * Ctrl/Cmd+A (select all cuts; repeats included so the browser never selects the page text).
 * Scope (hover/focus) and typing checks are done by the caller; `modalOpen` / `menuOpen` /
 * `fieldEditing` may be passed on the event-like object.
 * @param {{ key?: string, code?: string, altKey?: boolean, shiftKey?: boolean, ctrlKey?: boolean,
 *   metaKey?: boolean, isComposing?: boolean, repeat?: boolean, modalOpen?: boolean, menuOpen?: boolean,
 *   fieldEditing?: boolean }} e
 * @returns {"prev" | "next" | "open" | "rename" | "group" | "ungroup" | "add" | "delete" | "move-up" | "move-down" | "escape" | "select-all" | null}
 */
export function shotsKeyAction(e) {
  if (!e || e.isComposing || e.key === "Process") return null;
  if (e.modalOpen) return null;
  const key = e.key || "";
  if (key === "Escape") return "escape";
  if (e.ctrlKey || e.metaKey) {
    const plain = !e.altKey && !e.shiftKey && !e.menuOpen && !e.fieldEditing;
    return plain && isLetterKey(e, "a") ? "select-all" : null;
  }
  if (key === "Delete") return "delete";
  if (e.menuOpen || e.fieldEditing) return null;
  const alt = !!e.altKey;
  const shift = !!e.shiftKey;
  let action = null;
  if (key === "ArrowUp" || key === "ArrowDown") {
    const up = key === "ArrowUp";
    if (alt) action = up ? "move-up" : "move-down";
    else if (!shift) action = up ? "prev" : "next";
  } else if (alt) {
    if (isLetterKey(e, "g")) action = shift ? "ungroup" : "group";
    else if (isLetterKey(e, "n") && !shift) action = "add";
  } else if (!shift) {
    if (key === "Enter") action = "open";
    else if (key === "F2") action = "rename";
  }
  if (action && e.repeat && NO_REPEAT_ACTIONS.has(action)) return null;
  return action;
}

/**
 * Ctrl+A: every cut shown in the list, in list order (cuts inside collapsed scenes stay unselected).
 * @param {string[]} order
 * @param {Iterable<string>} [hidden]
 */
export function selectAllCutIds(order, hidden) {
  const skip = new Set(hidden || []);
  return (Array.isArray(order) ? order : []).filter((id) => id && !skip.has(id));
}

/**
 * Whether every visible list cut is in `selectedIds` (collapsed-scene cuts do not count).
 * @param {string[]} order
 * @param {Iterable<string>} hidden
 * @param {Iterable<string>} selectedIds
 */
export function allVisibleCutsSelected(order, hidden, selectedIds) {
  const visible = selectAllCutIds(order, hidden);
  if (!visible.length) return false;
  const sel = new Set(selectedIds || []);
  return visible.every((id) => sel.has(id));
}

/**
 * All button / Select all menu: select every visible cut, or clear when all are already selected.
 * @returns {{ ids: string[] }}
 */
export function toggleAllCutSelection(order, hidden, selectedIds) {
  const visible = selectAllCutIds(order, hidden);
  if (!visible.length) return { ids: [] };
  if (allVisibleCutsSelected(order, hidden, selectedIds)) return { ids: [] };
  return { ids: visible };
}

/**
 * Visible **All** button in the cut list header (English UI).
 * @param {{ hasProject?: boolean, visibleCount?: number, allSelected?: boolean }} s
 */
export function listAllButtonView(s = {}) {
  const n = Math.max(0, Number(s.visibleCount) || 0);
  const show = !!s.hasProject && n > 0;
  return {
    show,
    label: "All",
    className: `gg-btn gg-primary gg-list-all${s.allSelected ? " gg-on" : ""}`,
    title: show ? (s.allSelected ? "Clear selection" : "Select all cuts") : "",
    disabled: !show,
  };
}

/**
 * Next / previous cut id in list order, skipping hidden ids (cuts inside collapsed scenes).
 * With no current cut in the list, down picks the first visible cut and up the last.
 * @param {string[]} order
 * @param {string} currentId
 * @param {number} dir  -1 = previous, 1 = next
 * @param {Iterable<string>} [hidden]
 * @returns {string} "" when there is nothing further in that direction
 */
export function stepCutId(order, currentId, dir, hidden) {
  const ids = Array.isArray(order) ? order : [];
  const skip = new Set(hidden || []);
  const step = dir < 0 ? -1 : 1;
  let i = currentId ? ids.indexOf(currentId) : -1;
  if (i < 0) i = step > 0 ? -1 : ids.length;
  for (let j = i + step; j >= 0 && j < ids.length; j += step) {
    if (!skip.has(ids[j])) return ids[j];
  }
  return "";
}
