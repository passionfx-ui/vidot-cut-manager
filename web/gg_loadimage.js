/**
 * Load Image missing-file UI: scan, canvas markers, queue guard.
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  findImageWidget,
  isLoadImageCandidate,
  isNodeSkipped,
  parseImageWidgetValue,
  comboValuesInclude,
  missingLoadImageReport,
  formatMissingImageToast,
  formatQueueBlockedToast,
  LOAD_IMAGE_NODE_TYPES,
} from "./gg_loadimage_core.js";

const MARKS = new Map();
let scanGen = 0;
let scanTimer = 0;
const viewExistCache = new Map();
/** @type {(summary: string, detail: string, kind?: string) => void} */
let ggToast = () => {};

export function bindLoadImageUi({ ggToast: toast }) {
  if (toast) ggToast = toast;
}

function activeGraph() {
  return app.graph || app.canvas?.graph || null;
}

function iterNodes(graph) {
  if (!graph) return [];
  if (Array.isArray(graph._nodes)) return graph._nodes;
  if (Array.isArray(graph.nodes)) return graph.nodes;
  return [];
}

function viewCacheKey(ref) {
  return `${ref.folderType || "input"}|${ref.subfolder || ""}|${ref.filename}`;
}

async function fileExistsOnServer(ref) {
  const key = viewCacheKey(ref);
  if (viewExistCache.has(key)) return viewExistCache.get(key);
  const q = new URLSearchParams({
    filename: ref.filename,
    type: ref.folderType || "input",
    subfolder: ref.subfolder || "",
  });
  let ok = false;
  try {
    const res = await fetch(api.apiURL(`/view?${q}`), { method: "HEAD" });
    if (res.ok) ok = true;
    else if (res.status === 405 || res.status === 501) {
      const g = await fetch(api.apiURL(`/view?${q}`), { method: "GET", headers: { Range: "bytes=0-0" } });
      ok = g.ok;
    }
  } catch (_) {
    ok = false;
  }
  viewExistCache.set(key, ok);
  return ok;
}

async function computeMissing() {
  viewExistCache.clear();
  const graph = activeGraph();
  if (!graph) return [];
  const missing = [];
  for (const node of iterNodes(graph)) {
    if (!isLoadImageCandidate(node) || isNodeSkipped(node)) continue;
    const widget = findImageWidget(node);
    if (!widget) continue;
    const ref = parseImageWidgetValue(widget.value, node.subfolder ?? node.properties?.subfolder);
    if (ref.empty || ref.folderType !== "input") continue;
    const inCombo = comboValuesInclude(ref, widget.options?.values);
    if (inCombo === true) continue;
    if (inCombo === false) {
      missing.push({ node, ref, widget });
      continue;
    }
    const ok = await fileExistsOnServer(ref);
    if (!ok) missing.push({ node, ref, widget });
  }
  return missing;
}

function applyMarks(missing) {
  MARKS.clear();
  for (const m of missing) {
    if (m.node?.id != null) MARKS.set(String(m.node.id), m);
  }
  app.canvas?.setDirty?.(true, true);
}

function focusNode(node) {
  const canvas = app.canvas;
  if (!canvas || !node) return;
  try {
    if (typeof canvas.selectNode === "function") canvas.selectNode(node);
    else if (typeof canvas.selectNodes === "function") canvas.selectNodes([node]);
    else {
      for (const n of iterNodes(activeGraph())) {
        if (n) n.selected = false;
      }
      node.selected = true;
    }
  } catch (_) {}
  try {
    canvas.centerOnNode?.(node);
  } catch (_) {}
  canvas.setDirty?.(true, true);
}

export function scheduleLoadImageScan({ debounceMs = 120 } = {}) {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    void runLoadImageScan();
  }, debounceMs);
}

export async function runLoadImageScan() {
  const gen = ++scanGen;
  const missing = await computeMissing();
  if (gen !== scanGen) return missing;
  applyMarks(missing);
  const report = missingLoadImageReport(missing);
  if (report.first) {
    ggToast("Load Image", formatMissingImageToast(report.first), "warn");
  }
  return missing;
}

export async function ensureQueueAllowed() {
  const missing = await computeMissing();
  const report = missingLoadImageReport(missing);
  if (!report.first) return true;
  ggToast("Queue", formatQueueBlockedToast(report), "warn");
  if (missing[0]?.node) focusNode(missing[0].node);
  return false;
}

function drawMissingBadge(ctx, node) {
  if (!MARKS.has(String(node.id))) return;
  const size = node.size || [200, 60];
  const w = size[0];
  const h = size[1];
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e53935";
  ctx.strokeRect(-2, -2, w + 4, h + 4);
  ctx.fillStyle = "#e53935";
  ctx.font = "12px sans-serif";
  const label = "Missing image";
  const tw = ctx.measureText(label).width;
  ctx.fillRect(0, -20, tw + 8, 18);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, 4, -6);
  ctx.restore();
}

export function installLoadImageQueueGuard() {
  if (app._ggLoadImageQueueWrapped) return;
  app._ggLoadImageQueueWrapped = true;
  const origQueue = app.queuePrompt.bind(app);
  app.queuePrompt = async function ggQueuePromptGuard(...args) {
    const allowed = await ensureQueueAllowed();
    if (!allowed) return false;
    return origQueue(...args);
  };
}

app.registerExtension({
  name: "gonggan.cut.loadimage",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!LOAD_IMAGE_NODE_TYPES.has(nodeData?.name)) return;
    const prevDraw = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (...a) {
      prevDraw?.apply(this, a);
      drawMissingBadge(a[0], this);
    };
    const prevCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      prevCreated?.apply(this, []);
      const widget = findImageWidget(this);
      if (!widget) return;
      const prevCb = widget.callback;
      widget.callback = function (...cbArgs) {
        prevCb?.apply(this, cbArgs);
        scheduleLoadImageScan();
      };
    };
  },
  async afterConfigureGraph() {
    scheduleLoadImageScan({ debounceMs: 50 });
  },
});
