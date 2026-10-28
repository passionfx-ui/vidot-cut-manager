/**
 * When Comfy marks a workflow tab modified but widget content matches our baseline snapshot.
 */

/** Canonical content of a serialized graph: everything a user can edit, minus volatile UI state. */
function canonicalGraph(wf) {
  if (!wf || typeof wf !== "object") return null;
  const { extra, version, id, revision, ...rest } = wf;
  const nodes = Array.isArray(rest.nodes)
    ? rest.nodes.map((n) => {
        if (!n || typeof n !== "object") return n;
        const { size, ...keep } = n; // size can auto-change on first draw; pos/mode/links/widgets stay
        return keep;
      })
    : rest.nodes;
  return { ...rest, nodes };
}

/**
 * True when the two serialized graphs differ in any user-editable way
 * (widget values, links, node mode/bypass, position, added/removed nodes, groups).
 * Unknown/unreadable input counts as different (safe side: save).
 */
export function graphContentDiffers(baseline, current) {
  const a = canonicalGraph(baseline);
  const b = canonicalGraph(current);
  if (!a || !b) return true;
  try {
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch {
    return true;
  }
}

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
  return graphContentDiffers(baseline, current);
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
