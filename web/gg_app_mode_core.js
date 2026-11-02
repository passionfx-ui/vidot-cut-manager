/**
 * ComfyUI Apps mode (linearData) bindings. Pure: no DOM.
 * Inputs are `[nodeId, widgetName]` or `["<subgraphUuid>:<nodeId>", widgetName]`.
 * Older saves used `["<graphId>:<nodeId>:<widgetName>", label]`.
 * Outputs are node ids. A subgraph node is queued as `<instanceId>:<nodeId>`.
 */

const PROMPT_NAMES = new Set(["text", "prompt"]);
const LOCATOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nodeTitle(node) {
  return String(node?.title || "").trim();
}

function subgraphDefs(workflow) {
  const subs = workflow?.definitions?.subgraphs;
  if (!Array.isArray(subs)) return [];
  return subs.filter((sg) => sg && Array.isArray(sg.nodes));
}

function nodeById(workflow, nodeId, graphId) {
  const id = String(nodeId);
  const graphs = [];
  if (Array.isArray(workflow?.nodes)) graphs.push({ id: "", nodes: workflow.nodes });
  for (const sg of subgraphDefs(workflow)) graphs.push({ id: String(sg.id || ""), nodes: sg.nodes });
  if (graphId) {
    const exact = graphs.find((g) => g.id === graphId);
    const hit = exact?.nodes?.find((n) => n && String(n.id) === id);
    if (hit) return hit;
  }
  const root = graphs.find((g) => g.id === "");
  const rootHit = root?.nodes?.find((n) => n && String(n.id) === id);
  if (rootHit) return rootHit;
  for (const g of graphs) {
    const hit = g.nodes.find((n) => n && String(n.id) === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Node locator stored by ComfyUI Apps.
 * `"12"` is a root node. `"<uuid>:<id>"` is a node inside that subgraph.
 * @param {string|number} ref
 * @returns {{ graphId: string, nodeId: string } | null}
 */
export function parseNodeLocator(ref) {
  const text = String(ref ?? "").trim();
  if (!text) return null;
  const parts = text.split(":");
  if (parts.length === 2 && LOCATOR_UUID.test(parts[0]) && parts[1]) {
    return { graphId: parts[0], nodeId: parts[1] };
  }
  return { graphId: "", nodeId: text };
}

/** @param {string} ref "<graphId>:<nodeId>:<widgetName>" */
export function parseLinearRef(ref) {
  const parts = String(ref ?? "").split(":");
  if (parts.length < 3) return null;
  const widget = parts[parts.length - 1];
  const nodeId = parts[parts.length - 2];
  const graphId = parts.slice(0, -2).join(":");
  if (!graphId || !nodeId || !widget) return null;
  return { graphId, nodeId: String(nodeId), widget: String(widget) };
}

/**
 * One linearData input row.
 * `[nodeId, widgetName]`, `["<uuid>:<nodeId>", widgetName]`, or the older 3-part ref.
 * A third metadata object is ignored.
 * @param {unknown} row
 * @returns {{ graphId: string, nodeId: string, widget: string, label: string } | null}
 */
export function parseLinearInput(row) {
  if (!Array.isArray(row) || row.length < 2 || row[0] == null || row[1] == null) return null;
  const head = row[0];
  const label = String(row[1]);
  if (!label) return null;
  if (typeof head === "string" && head.split(":").length >= 3) {
    const legacy = parseLinearRef(head);
    if (legacy) return { ...legacy, label: label || legacy.widget };
  }
  const loc = parseNodeLocator(head);
  if (!loc?.nodeId) return null;
  return { graphId: loc.graphId, nodeId: loc.nodeId, widget: label, label };
}

export function isPromptWidgetName(name) {
  return PROMPT_NAMES.has(String(name ?? "").trim().toLowerCase());
}

export function suggestsNegative(...parts) {
  return parts.some((p) => String(p ?? "").toLowerCase().includes("negative"));
}

function inputForWidget(node, widgetName) {
  const inputs = node?.inputs;
  if (!Array.isArray(inputs)) return null;
  return inputs.find((i) => i && (i.widget?.name === widgetName || i.name === widgetName)) || null;
}

function controlMeta(node, widgetName) {
  const name = String(widgetName || "");
  const seed = name === "seed" || name === "noise_seed";
  const named = node?.widgets_values_named;
  const namedVal = named && typeof named === "object" && !Array.isArray(named) ? named[name] : undefined;
  const type = String(inputForWidget(node, name)?.type || "").toUpperCase();
  let kind = "text";
  let integer = false;
  if (type === "BOOLEAN" || typeof namedVal === "boolean") kind = "toggle";
  else if (type === "COMBO") kind = "combo";
  else if (type === "INT" || type === "FLOAT" || typeof namedVal === "number") {
    kind = "number";
    integer = type === "INT" || (type !== "FLOAT" && typeof namedVal === "number" && Number.isInteger(namedVal));
  }
  return { kind, seed, integer };
}

/**
 * Prompt and control bindings for a UI workflow.
 * The first text/prompt input is the positive prompt. A later text/prompt input
 * is the negative prompt only when its widget name, label, or node title says negative.
 * Returns null when the graph has no linearData inputs.
 * @param {object | null | undefined} workflow
 */
export function linearBindings(workflow) {
  const linear = workflow?.extra?.linearData;
  if (!linear || typeof linear !== "object" || !Array.isArray(linear.inputs)) return null;
  const prompts = [];
  const controls = [];
  for (const row of linear.inputs) {
    const parsed = parseLinearInput(row);
    if (!parsed) continue;
    const node = nodeById(workflow, parsed.nodeId, parsed.graphId);
    const entry = {
      graphId: parsed.graphId,
      nodeId: parsed.nodeId,
      widget: parsed.widget,
      label: parsed.label || parsed.widget,
      nodeTitle: nodeTitle(node),
    };
    if (isPromptWidgetName(parsed.widget) || isPromptWidgetName(parsed.label)) prompts.push(entry);
    else controls.push({ ...entry, ...controlMeta(node, parsed.widget) });
  }
  const positive = prompts[0] || null;
  let negative = null;
  for (const p of prompts.slice(1)) {
    if (!negative && suggestsNegative(p.widget, p.label, p.nodeTitle)) negative = p;
    else controls.push({ ...p, kind: "text", seed: false, integer: false });
  }
  return { positive, negative, controls };
}

/** Small prompt-tab label. Empty when this graph has no positive binding. */
export function linearPromptLabel(binding) {
  if (!binding?.positive) return "";
  const p = binding.positive;
  let text = `Node ${p.nodeId} · ${p.widget}`;
  if (binding.negative) text += ` · Node ${binding.negative.nodeId} · ${binding.negative.widget}`;
  return text;
}

/**
 * Output node ids that may become Takes.
 * null = linearData.outputs is absent (keep every output). An array, even empty, is a filter.
 * @param {object | null | undefined} workflow
 * @returns {string[] | null}
 */
export function linearOutputIds(workflow) {
  const linear = workflow?.extra?.linearData;
  if (!linear || typeof linear !== "object" || !Array.isArray(linear.outputs)) return null;
  return linear.outputs.map((id) => String(id));
}

function executionPrefixes(workflow, subgraphId) {
  const defs = new Map(subgraphDefs(workflow).map((sg) => [String(sg.id || ""), sg]));
  const prefixes = [];
  const stack = new Set();
  const walk = (nodes, prefix) => {
    for (const node of nodes || []) {
      if (!node || typeof node !== "object") continue;
      const type = String(node.type || "");
      if (!defs.has(type) || stack.has(type)) continue;
      const path = prefix ? `${prefix}:${node.id}` : String(node.id);
      if (type === subgraphId) prefixes.push(path);
      stack.add(type);
      walk(defs.get(type).nodes, path);
      stack.delete(type);
    }
  };
  walk(workflow?.nodes, "");
  return prefixes;
}

/**
 * History / API ids for app outputs.
 * A root id stays as-is. A node that lives in a subgraph is also `<instance>:<id>`,
 * which is the id ComfyUI writes into history for that Save Video / SaveWEBP node.
 * @param {object | null | undefined} workflow
 * @returns {string[] | null}
 */
export function expandLinearOutputIds(workflow) {
  const ids = linearOutputIds(workflow);
  if (!ids) return null;
  const out = [];
  const push = (id) => {
    const text = String(id || "").trim();
    if (text && !out.includes(text)) out.push(text);
  };
  for (const raw of ids) {
    const loc = parseNodeLocator(raw) || { graphId: "", nodeId: String(raw) };
    let graphId = loc.graphId;
    const nodeId = loc.nodeId;
    if (!graphId && Array.isArray(workflow?.nodes) && workflow.nodes.some((n) => n && String(n.id) === nodeId)) {
      push(nodeId);
      continue;
    }
    if (!graphId) {
      const home = subgraphDefs(workflow).find((sg) => (sg.nodes || []).some((n) => n && String(n.id) === nodeId));
      graphId = home ? String(home.id || "") : "";
    }
    push(nodeId);
    if (!graphId) continue;
    for (const prefix of executionPrefixes(workflow, graphId)) push(`${prefix}:${nodeId}`);
  }
  return out;
}

/**
 * ComfyUI opens App mode when extra.linearMode is true, and the graph editor when it is false.
 * A missing flag does not choose a mode. Cut copies set true to false and keep linearData.
 * @param {object | null | undefined} workflow mutated in place
 * @returns {boolean} true when linearMode was true
 */
export function clearLinearMode(workflow) {
  const extra = workflow?.extra;
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return false;
  if (extra.linearMode !== true) return false;
  extra.linearMode = false;
  return true;
}

/** The workflow names a graph/app choice (true or false). */
export function hasLinearModeFlag(workflow) {
  const extra = workflow?.extra;
  return !!extra && typeof extra === "object" && !Array.isArray(extra) && typeof extra.linearMode === "boolean";
}
