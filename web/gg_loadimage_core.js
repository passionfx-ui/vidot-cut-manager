/**
 * Load Image missing-file checks (pure logic, no DOM).
 */

export const LOAD_IMAGE_NODE_TYPES = new Set(["LoadImage", "LoadImageMask"]);

/** LiteGraph NEVER (muted) and BYPASS */
export const SKIPPED_NODE_MODES = new Set([2, 4]);

/**
 * @param {{ mode?: number }} node
 */
export function isNodeSkipped(node) {
  return SKIPPED_NODE_MODES.has(node?.mode ?? 0);
}

/**
 * @param {string} display
 */
export function parseComboDisplayValue(display) {
  const raw = String(display ?? "").trim();
  if (!raw) return { filename: "", subfolder: "", folderType: "input", annotated: false };
  let folderType = "input";
  let body = raw;
  const ann = /\s+\[(input|output|temp)\]\s*$/i.exec(raw);
  if (ann) {
    body = raw.slice(0, ann.index).trim();
    folderType = ann[1].toLowerCase();
  }
  const norm = body.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  if (slash >= 0) {
    return {
      filename: norm.slice(slash + 1),
      subfolder: norm.slice(0, slash),
      folderType,
      annotated: !!ann,
    };
  }
  return { filename: norm, subfolder: "", folderType, annotated: !!ann };
}

/**
 * @param {string} value widget value
 * @param {string} [subfolder] optional node subfolder field
 */
export function parseImageWidgetValue(value, subfolder = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return { empty: true, filename: "", subfolder: "", folderType: "input" };
  const parsed = parseComboDisplayValue(raw);
  let sf = String(subfolder ?? "").trim().replace(/\\/g, "/");
  if (parsed.subfolder) {
    sf = sf ? `${sf}/${parsed.subfolder}` : parsed.subfolder;
  }
  return {
    empty: false,
    filename: parsed.filename,
    subfolder: sf,
    folderType: parsed.folderType,
  };
}

/**
 * @param {{ type?: string, comfyClass?: string, widgets?: object[] }} node
 */
export function findImageWidget(node) {
  const widgets = node?.widgets;
  if (!Array.isArray(widgets)) return null;
  return widgets.find((w) => w && w.name === "image") || null;
}

/**
 * @param {{ type?: string, comfyClass?: string, widgets?: object[] }} node
 */
export function isLoadImageCandidate(node) {
  if (!node || isNodeSkipped(node)) return false;
  const t = node.type || node.comfyClass || "";
  if (LOAD_IMAGE_NODE_TYPES.has(t)) return true;
  const w = findImageWidget(node);
  if (!w) return false;
  const values = w.options?.values;
  if (!Array.isArray(values) || !values.length) return false;
  return values.some((v) => /\[(input)\]/i.test(String(v)));
}

/**
 * @param {{ id?: string|number, title?: string, type?: string }} node
 */
export function nodeLabel(node) {
  const title = String(node?.title ?? "").trim();
  if (title) return title;
  const id = node?.id;
  if (id != null && id !== "") return String(id);
  return node?.type || "node";
}

/**
 * @param {object} graph
 * @returns {object[]}
 */
export function iterGraphNodes(graph) {
  if (!graph) return [];
  if (Array.isArray(graph.nodes)) return graph.nodes;
  if (Array.isArray(graph._nodes)) return graph._nodes;
  return [];
}

/**
 * @param {{ filename: string, subfolder?: string, folderType?: string }} ref
 * @param {string[]} comboValues
 */
export function comboValuesInclude(ref, comboValues) {
  if (!Array.isArray(comboValues) || !comboValues.length) return null;
  const wantPath = ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename;
  for (const entry of comboValues) {
    const p = parseComboDisplayValue(entry);
    const entryPath = p.subfolder ? `${p.subfolder}/${p.filename}` : p.filename;
    if (entryPath === wantPath) return true;
    if (p.filename === ref.filename && (p.subfolder || "") === (ref.subfolder || "")) return true;
  }
  return false;
}

/**
 * @param {object} graph
 * @param {(ref: { filename: string, subfolder: string, folderType: string, empty?: boolean }) => boolean|null} exists
 */
export function findMissingLoadImages(graph, exists) {
  const missing = [];
  for (const node of iterGraphNodes(graph)) {
    if (!isLoadImageCandidate(node)) continue;
    const widget = findImageWidget(node);
    if (!widget) continue;
    const ref = parseImageWidgetValue(widget.value, node.subfolder ?? node.properties?.subfolder);
    if (ref.empty) continue;
    if (ref.folderType && ref.folderType !== "input") continue;
    const inCombo = comboValuesInclude(ref, widget.options?.values);
    let present = inCombo;
    if (present === false) {
      missing.push({ node, ref, widget });
      continue;
    }
    if (present === true) continue;
    const verdict = exists(ref);
    if (verdict === false) missing.push({ node, ref, widget });
  }
  return missing;
}

/**
 * @param {object[]} missing
 */
export function missingLoadImageReport(missing) {
  const list = Array.isArray(missing) ? missing : [];
  if (!list.length) return { first: null, count: 0 };
  const first = list[0];
  return {
    first: {
      filename: first.ref.filename,
      subfolder: first.ref.subfolder,
      nodeLabel: nodeLabel(first.node),
      nodeId: first.node?.id,
    },
    count: list.length,
  };
}

export function formatMissingImageToast(first) {
  if (!first) return "";
  const file = first.subfolder ? `${first.subfolder}/${first.filename}` : first.filename;
  return `Missing image: ${file} (node ${first.nodeLabel})`;
}

export function formatQueueBlockedToast(report) {
  if (!report?.first) return "";
  const f = report.first;
  const file = f.subfolder ? `${f.subfolder}/${f.filename}` : f.filename;
  let msg = `Cannot queue: missing image ${file} in node ${f.nodeLabel}`;
  if (report.count > 1) msg += ` (+${report.count - 1} more)`;
  return msg;
}
