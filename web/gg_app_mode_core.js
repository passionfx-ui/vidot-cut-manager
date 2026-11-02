/**
 * ComfyUI Apps mode (linearData) bindings. Pure: no DOM.
 * A workflow is an app template when extra.linearData lists inputs as
 * [ "<graphId>:<nodeId>:<widgetName>", "<widgetName>" ] and outputs as node ids.
 */

const PROMPT_NAMES = new Set(["text", "prompt"]);

function nodeTitle(node) {
  return String(node?.title || "").trim();
}

function nodeById(workflow, nodeId) {
  const nodes = workflow?.nodes;
  if (!Array.isArray(nodes)) return null;
  return nodes.find((n) => n && String(n.id) === String(nodeId)) || null;
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
    if (!Array.isArray(row) || !row.length) continue;
    const parsed = parseLinearRef(row[0]);
    if (!parsed) continue;
    const label = String(row[1] ?? parsed.widget);
    const node = nodeById(workflow, parsed.nodeId);
    const entry = {
      nodeId: parsed.nodeId,
      widget: parsed.widget,
      label: label || parsed.widget,
      nodeTitle: nodeTitle(node),
    };
    if (isPromptWidgetName(parsed.widget) || isPromptWidgetName(label)) prompts.push(entry);
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
