/** Pure helpers for empty-cut canvas (template vs blank). */

/**
 * @returns {object} ComfyUI UI workflow graph with zero nodes
 */
export function emptyCutBlankGraph() {
  return {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };
}

/**
 * @param {object | null | undefined} data cut-source-workflow JSON
 * @returns {boolean}
 */
export function isEmptyCutSourcePayload(data) {
  if (!data || data.ok === false) return false;
  return data.workflow == null && (data.source == null || data.source === undefined);
}

function isUiWorkflowGraph(wf) {
  return wf && Array.isArray(wf.nodes);
}

/**
 * @param {object | null | undefined} wf
 * @returns {number}
 */
export function workflowNodeCount(wf) {
  if (!wf || typeof wf !== "object") return 0;
  if (isUiWorkflowGraph(wf)) return wf.nodes.length;
  return Object.keys(wf).length;
}

/**
 * @param {{ templateWorkflow?: object | null, blankGraph?: object | null }} opts
 * @returns {{ kind: "template" | "blank", workflow: object }}
 */
export function resolveEmptyCutWorkflow({ templateWorkflow, blankGraph }) {
  const blank = blankGraph || emptyCutBlankGraph();
  const tpl = templateWorkflow;
  if (tpl && typeof tpl === "object") {
    if (isUiWorkflowGraph(tpl) && tpl.nodes.length > 0) {
      return { kind: "template", workflow: tpl };
    }
    if (!isUiWorkflowGraph(tpl) && Object.keys(tpl).length > 0) {
      return { kind: "template", workflow: tpl };
    }
  }
  return { kind: "blank", workflow: blank };
}

/**
 * @param {{ kind: "template" | "blank" }} resolved
 * @returns {"template" | "blank"}
 */
export function emptyCutWorkflowKind(resolved) {
  return resolved?.kind === "template" ? "template" : "blank";
}
