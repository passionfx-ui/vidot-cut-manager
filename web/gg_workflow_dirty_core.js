/**
 * When Comfy marks a workflow tab modified but widget content matches our baseline snapshot.
 */

import { widgetValuesDiffer } from "./gg_wf_source_core.js";

/**
 * @param {{
 *   isModified?: boolean,
 * }} wf
 * @param {{
 *   cutId?: string,
 *   baselineCutId?: string | null,
 *   baseline?: object | null,
 *   currentSnapshot?: object | null,
 *   graphCutId?: string,
 * }} ctx
 * @returns {boolean} true if autosave should run
 */
export function workflowTabNeedsAutosave(wf, ctx = {}) {
  if (!wf?.isModified) return false;
  const cutId = ctx.cutId || "";
  const baselineCutId = ctx.baselineCutId || "";
  const baseline = ctx.baseline;
  const current = ctx.currentSnapshot;
  const graphCutId = ctx.graphCutId || "";
  if (!cutId || cutId !== baselineCutId || !baseline || !current) return true;
  if (graphCutId && graphCutId !== cutId) return true;
  if (!Array.isArray(current.nodes) || !current.nodes.length) return true;
  return widgetValuesDiffer(baseline, current);
}

/**
 * Tabs to save before replacing the shot canvas (filters false-positive isModified).
 * @param {object[]} tabs
 * @param {(wf: object) => object} ctxForTab
 */
export function filterTabsNeedingAutosave(tabs, ctxForTab) {
  const out = [];
  for (const wf of tabs || []) {
    if (!wf) continue;
    const ctx = typeof ctxForTab === "function" ? ctxForTab(wf) : {};
    if (workflowTabNeedsAutosave(wf, ctx)) out.push(wf);
  }
  return out;
}
