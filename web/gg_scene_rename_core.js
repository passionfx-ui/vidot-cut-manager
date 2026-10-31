/** Inline scene group header rename in the Shots cut list (double-click the scene title). Pure, no DOM. */

import { SCENE_NAME_MAX_LEN } from "./gg_ask_text_core.js";
import { inlineRenameKeyAction, inlineRenameCommitName } from "./gg_cut_rename_core.js";

export { SCENE_NAME_MAX_LEN, inlineRenameKeyAction };

/** Editable projects only; imported lists stay read-only. */
export function canInlineRenameScene({ native = false, groupId = "" } = {}) {
  return !!native && !!groupId;
}

/**
 * Name to save when the field closes with commit, or null when nothing should be saved
 * (blank/unchanged reverts to the old name on the client).
 * @param {string} current
 * @param {unknown} raw
 * @returns {string | null}
 */
export function inlineSceneRenameCommitName(current, raw) {
  return inlineRenameCommitName(current, raw, SCENE_NAME_MAX_LEN);
}

/** Stable selectors for tests and e2e. */
export const SCENE_HEADER_TITLE_SEL = ".gg-grp-sec[data-group-id] .gg-grp-title";
export const SCENE_HEADER_INPUT_CLASS = "gg-grp-title-input";
