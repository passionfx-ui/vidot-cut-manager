/**
 * Start-image widget on a saved video workflow (pure, no DOM).
 *
 * ComfyUI saves the Load Image filename in widgets_values_named and restores that
 * over widgets_values. A cut image written only into the array never reaches the node.
 */

import { parseLinearInput } from "./gg_app_mode_core.js";
import { workflowGraphKind } from "./gg_rep_wf_core.js";

const START_TITLE = "start image";
const SKIPPED_MODES = new Set([2, 4]);

function nodeTitle(node) {
  const raw = node?.title ?? node?._meta?.title ?? "";
  return String(raw).trim().toLowerCase();
}

function nodeType(node) {
  return String(node?.type ?? node?.class_type ?? "");
}

function idKey(id) {
  const s = String(id);
  return /^\d+$/.test(s) ? [0, Number(s)] : [1, s];
}

function listedNodes(workflow) {
  if (!workflow || typeof workflow !== "object") return [];
  if (Array.isArray(workflow.nodes)) {
    return workflow.nodes
      .filter((n) => n && typeof n === "object" && !SKIPPED_MODES.has(n.mode))
      .map((node) => ({ node, id: String(node.id) }));
  }
  return Object.entries(workflow)
    .filter(([, n]) => n && typeof n === "object" && n.class_type)
    .map(([id, node]) => ({ node, id: String(id) }));
}

function workflowNodesDeep(workflow) {
  const out = [];
  const add = (nodes, graphId) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object" || SKIPPED_MODES.has(node.mode)) continue;
      out.push({ node, id: String(node.id), graphId: graphId || "" });
    }
  };
  if (Array.isArray(workflow?.nodes)) add(workflow.nodes, "");
  else if (workflow && typeof workflow === "object" && !Array.isArray(workflow)) {
    for (const [id, node] of Object.entries(workflow)) {
      if (node && typeof node === "object" && node.class_type) out.push({ node, id: String(id), graphId: "" });
    }
  }
  const subs = workflow?.definitions?.subgraphs;
  if (Array.isArray(subs)) {
    for (const sg of subs) {
      if (sg && typeof sg === "object") add(sg.nodes, String(sg.id || ""));
    }
  }
  return out;
}

/**
 * LoadImage named by an app template's linearData inputs.
 * `{ nodeId, widget, graphId, label, node }` or null.
 */
export function linearLoadImageInput(workflow) {
  const rows = workflow?.extra?.linearData?.inputs;
  if (!Array.isArray(rows)) return null;
  const nodes = workflowNodesDeep(workflow);
  const hits = [];
  for (const row of rows) {
    const parsed = parseLinearInput(row);
    if (!parsed) continue;
    let matches = nodes.filter((n) => n.id === parsed.nodeId);
    if (parsed.graphId) {
      const exact = matches.filter((n) => n.graphId === parsed.graphId);
      if (exact.length) matches = exact;
    }
    const hit = matches.find((n) => nodeType(n.node) === "LoadImage");
    if (!hit) continue;
    hits.push({
      nodeId: hit.id,
      widget: parsed.widget || "image",
      graphId: hit.graphId,
      label: parsed.label || parsed.widget || "image",
      node: hit.node,
    });
  }
  if (!hits.length) return null;
  const rank = (h) => {
    const blob = `${h.label} ${h.widget}`.toLowerCase();
    if (blob.includes("start")) return 0;
    if (blob.includes("image")) return 1;
    return 2;
  };
  hits.sort((a, b) => rank(a) - rank(b));
  return hits[0];
}

/**
 * Image input of a video template: the LoadImage named by linearData, else
 * title "Start Image", else the first LoadImage (root, then a subgraph).
 * `{ nodeId, widget, graphId, label, node }` or null.
 */
export function findVideoImageTarget(workflow) {
  const linear = linearLoadImageInput(workflow);
  if (linear) return linear;
  const titled = findStartImageNode(workflow);
  if (titled) return { nodeId: titled.id, widget: "image", graphId: "", label: "image", node: titled.node };
  const deep = workflowNodesDeep(workflow).filter((n) => nodeType(n.node) === "LoadImage");
  if (!deep.length) return null;
  deep.sort((a, b) => {
    const [ka, va] = idKey(a.id);
    const [kb, vb] = idKey(b.id);
    if (ka !== kb) return ka - kb;
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
  const n = deep[0];
  return { nodeId: n.id, widget: "image", graphId: n.graphId, label: "image", node: n.node };
}

/** Title "Start Image", else the first LoadImage (lowest id). `{node, id}` or null. */
export function findStartImageNode(workflow) {
  const nodes = listedNodes(workflow);
  const titled = nodes.filter((n) => nodeTitle(n.node) === START_TITLE);
  if (titled.length === 1) return titled[0];
  if (titled.length > 1) return null;
  const loaders = nodes.filter((n) => nodeType(n.node) === "LoadImage");
  if (!loaders.length) return null;
  loaders.sort((a, b) => {
    const [ka, va] = idKey(a.id);
    const [kb, vb] = idKey(b.id);
    if (ka !== kb) return ka - kb;
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
  return loaders[0];
}

function writeUiImage(node, imageName) {
  const wv = node.widgets_values;
  if (Array.isArray(wv)) {
    if (wv.length) wv[0] = imageName;
    else node.widgets_values = [imageName, "image"];
  } else if (wv && typeof wv === "object") {
    wv.image = imageName;
  } else if (!node.class_type) {
    node.widgets_values = [imageName, "image"];
  }
  const named = node.widgets_values_named && typeof node.widgets_values_named === "object"
    ? node.widgets_values_named
    : {};
  named.image = imageName;
  if (named.upload == null) named.upload = "image";
  node.widgets_values_named = named;
}

/**
 * Point the start-image node at `imageName`. UI graphs get both widget stores;
 * an API prompt gets inputs.image. Returns the node id, or null when there is no node.
 * @param {object} workflow
 * @param {string} imageName
 */
export function wireCutStartImage(workflow, imageName) {
  const name = String(imageName ?? "").trim();
  if (!workflow || !name) return null;
  const hit = findVideoImageTarget(workflow);
  if (!hit) return null;
  const node = hit.node;
  if (node.inputs && typeof node.inputs === "object" && !Array.isArray(node.inputs)) {
    if (!Array.isArray(node.inputs.image)) node.inputs.image = name;
  }
  if (Array.isArray(workflow.nodes) || node.widgets_values != null || node.widgets_values_named || hit.graphId) {
    writeUiImage(node, name);
    const widget = String(hit.widget || "");
    if (widget && widget !== "image" && node.widgets_values_named && typeof node.widgets_values_named === "object") {
      node.widgets_values_named[widget] = name;
    }
  }
  return hit.nodeId;
}

/**
 * Saved video graph: the array slot is the cut image the server wrote. Copy it into
 * widgets_values_named so the canvas and the queue use that file.
 * @param {object} workflow
 * @returns {string | null}
 */
function workflowLooksLikeVideo(workflow) {
  if (workflowGraphKind(workflow) === "video") return true;
  const subs = workflow?.definitions?.subgraphs;
  return Array.isArray(subs) && subs.some((sg) => sg && workflowGraphKind(sg) === "video");
}

export function syncSavedVideoStartImage(workflow) {
  if (!workflowLooksLikeVideo(workflow)) return null;
  const hit = findVideoImageTarget(workflow);
  if (!hit) return null;
  const wv = hit.node.widgets_values;
  const positional = Array.isArray(wv) ? wv[0] : wv && typeof wv === "object" ? wv.image : "";
  if (typeof positional !== "string" || !positional.trim()) return null;
  return wireCutStartImage(workflow, positional);
}
