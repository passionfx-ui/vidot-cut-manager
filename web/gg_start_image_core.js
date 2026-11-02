/**
 * Start-image widget on a saved video workflow (pure, no DOM).
 *
 * ComfyUI saves the Load Image filename in widgets_values_named and restores that
 * over widgets_values. A cut image written only into the array never reaches the node.
 */

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
  const hit = findStartImageNode(workflow);
  if (!hit) return null;
  const node = hit.node;
  if (node.inputs && typeof node.inputs === "object" && !Array.isArray(node.inputs)) {
    if (!Array.isArray(node.inputs.image)) node.inputs.image = name;
  }
  if (Array.isArray(workflow.nodes) || node.widgets_values != null || node.widgets_values_named) {
    writeUiImage(node, name);
  }
  return hit.id;
}

/**
 * Saved video graph: the array slot is the cut image the server wrote. Copy it into
 * widgets_values_named so the canvas and the queue use that file.
 * @param {object} workflow
 * @returns {string | null}
 */
export function syncSavedVideoStartImage(workflow) {
  if (workflowGraphKind(workflow) !== "video") return null;
  const hit = findStartImageNode(workflow);
  if (!hit) return null;
  const wv = hit.node.widgets_values;
  const positional = Array.isArray(wv) ? wv[0] : wv && typeof wv === "object" ? wv.image : "";
  if (typeof positional !== "string" || !positional.trim()) return null;
  return wireCutStartImage(workflow, positional);
}
