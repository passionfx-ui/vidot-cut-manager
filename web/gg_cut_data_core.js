/**
 * Per-cut data on a shared image/video template (pure, no DOM).
 *
 * The template holds structure. A cut holds positive and negative prompt, seed,
 * input image, and length/frames. Those slots are stripped when comparing structure
 * and written back when a cut is shown or queued.
 */

const SKIPPED_MODES = new Set([2, 4]);
const TEXT_KEYS = ["text", "prompt", "value", "string"];
const LENGTH_TYPES = new Set(["LTXVImgToVideo", "EmptyLTXVLatentVideo"]);
const LENGTH_INDEX = 2;

export const PROMPT_NODE_MISSING = "Prompt node not found. Rename the prompt node to Prompt.";
export const LOAD_IMAGE_NODE_MISSING = "Start image node not found. Rename the input node to Start Image.";

export function cloneGraph(graph) {
  if (!graph || typeof graph !== "object") return null;
  try {
    return structuredClone(graph);
  } catch {
    try {
      return JSON.parse(JSON.stringify(graph));
    } catch {
      return null;
    }
  }
}

function nodeTitle(node) {
  const raw = node?.title ?? node?._meta?.title ?? "";
  return String(raw).trim().toLowerCase();
}

function nodeType(node) {
  return String(node?.type ?? node?.class_type ?? "");
}

function isSkipped(node) {
  return SKIPPED_MODES.has(node?.mode);
}

/** @returns {{ id: string, node: object }[]} */
function listedNodes(graph) {
  if (!graph || typeof graph !== "object") return [];
  if (Array.isArray(graph.nodes)) {
    return graph.nodes
      .filter((n) => n && typeof n === "object" && !isSkipped(n))
      .map((node) => ({ id: String(node.id), node }));
  }
  return Object.entries(graph)
    .filter(([, n]) => n && typeof n === "object" && n.class_type && !isSkipped(n))
    .map(([id, node]) => ({ id: String(id), node }));
}

function nodeMap(graph) {
  return new Map(listedNodes(graph).map((n) => [n.id, n.node]));
}

function feedsInput(graph, originId, inputName) {
  const nodes = nodeMap(graph);
  if (Array.isArray(graph?.nodes)) {
    for (const link of graph.links || []) {
      if (!Array.isArray(link) || link.length < 5) continue;
      if (String(link[1]) !== String(originId)) continue;
      const dst = nodes.get(String(link[3]));
      const slot = link[4];
      const inputs = dst?.inputs;
      if (!Array.isArray(inputs) || typeof slot !== "number") continue;
      if (inputs[slot] && inputs[slot].name === inputName) return true;
    }
    return false;
  }
  for (const n of nodes.values()) {
    const ref = n?.inputs && !Array.isArray(n.inputs) ? n.inputs[inputName] : null;
    if (Array.isArray(ref) && String(ref[0]) === String(originId)) return true;
  }
  return false;
}

function titled(graph, title) {
  const want = title.toLowerCase();
  return listedNodes(graph).filter((n) => nodeTitle(n.node) === want);
}

/** Prompt node: title "Prompt", else the CLIPTextEncode feeding a positive input. */
export function findPromptSlot(graph) {
  const hits = titled(graph, "prompt");
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return null;
  for (const n of listedNodes(graph)) {
    if (nodeType(n.node) !== "CLIPTextEncode") continue;
    if (feedsInput(graph, n.id, "positive")) return n;
  }
  return null;
}

/** Negative prompt: a node titled with "negative", else the encoder feeding a negative input. */
export function findNegativeSlot(graph) {
  const prompt = findPromptSlot(graph);
  const named = listedNodes(graph).filter((n) => {
    if (prompt && n.id === prompt.id) return false;
    const title = nodeTitle(n.node);
    if (!title.includes("negative")) return false;
    return nodeType(n.node) === "CLIPTextEncode" || title === "negative";
  });
  if (named.length === 1) return named[0];
  if (named.length > 1) return null;
  for (const n of listedNodes(graph)) {
    if (prompt && n.id === prompt.id) continue;
    if (nodeType(n.node) !== "CLIPTextEncode") continue;
    if (feedsInput(graph, n.id, "negative")) return n;
  }
  return null;
}

function readText(node) {
  const wv = node?.widgets_values;
  if (Array.isArray(wv)) {
    const s = wv.find((v) => typeof v === "string");
    return typeof s === "string" ? s : "";
  }
  if (wv && typeof wv === "object") {
    for (const k of TEXT_KEYS) if (typeof wv[k] === "string") return wv[k];
  }
  const inputs = node?.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
    for (const k of TEXT_KEYS) if (typeof inputs[k] === "string") return inputs[k];
  }
  return "";
}

function writeText(node, text) {
  const value = text == null ? "" : String(text);
  const wv = node?.widgets_values;
  if (Array.isArray(wv)) {
    const i = wv.findIndex((v) => typeof v === "string");
    if (i >= 0) wv[i] = value;
    else if (wv.length) wv[0] = value;
    else node.widgets_values = [value];
    return;
  }
  if (wv && typeof wv === "object") {
    const k = TEXT_KEYS.find((key) => typeof wv[key] === "string") || "text";
    wv[k] = value;
    return;
  }
  const inputs = node?.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
    const k = TEXT_KEYS.find((key) => typeof inputs[key] === "string") || "text";
    if (!Array.isArray(inputs[k])) inputs[k] = value;
    return;
  }
  node.widgets_values = [value];
}

/**
 * Where a sampler keeps its seed number.
 * @returns {{ index?: number, name?: string, input?: string } | null}
 */
function seedSlot(node) {
  const type = nodeType(node);
  const named = node?.widgets_values_named;
  if (named && typeof named === "object") {
    if (typeof named.noise_seed === "number") return { name: "noise_seed" };
    if (typeof named.seed === "number") return { name: "seed" };
  }
  const wv = node?.widgets_values;
  if (Array.isArray(wv)) {
    if (type === "SamplerCustom" && typeof wv[1] === "number") return { index: 1 };
    if ((type === "KSampler" || type === "KSamplerAdvanced" || type === "RandomNoise") && typeof wv[0] === "number") {
      return { index: 0 };
    }
    if (/sampler|noise/i.test(type)) {
      const i = wv.findIndex((v) => typeof v === "number");
      if (i >= 0) return { index: i };
    }
  }
  const inputs = node?.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
    if (typeof inputs.noise_seed === "number") return { input: "noise_seed" };
    if (typeof inputs.seed === "number") return { input: "seed" };
  }
  return null;
}

function readSeedValue(node, slot) {
  if (!slot) return null;
  if (slot.name && node.widgets_values_named) {
    const n = node.widgets_values_named[slot.name];
    return typeof n === "number" ? n : null;
  }
  if (slot.index != null && Array.isArray(node.widgets_values)) {
    const n = node.widgets_values[slot.index];
    return typeof n === "number" ? n : null;
  }
  if (slot.input && node.inputs) {
    const n = node.inputs[slot.input];
    return typeof n === "number" ? n : null;
  }
  return null;
}

function writeSeedValue(node, slot, seed) {
  const n = Number(seed);
  if (!slot || !Number.isFinite(n)) return;
  if (slot.name) {
    if (!node.widgets_values_named || typeof node.widgets_values_named !== "object") node.widgets_values_named = {};
    node.widgets_values_named[slot.name] = n;
  }
  if (slot.index != null) {
    if (!Array.isArray(node.widgets_values)) node.widgets_values = [];
    node.widgets_values[slot.index] = n;
  }
  if (slot.input && node.inputs && typeof node.inputs === "object" && !Array.isArray(node.inputs)) {
    node.inputs[slot.input] = n;
  }
}

function eachSeed(graph, fn) {
  for (const item of listedNodes(graph)) {
    const slot = seedSlot(item.node);
    if (slot) fn(item, slot);
  }
}

function imageNodes(graph) {
  const nodes = listedNodes(graph);
  const titledHits = nodes.filter((n) => nodeTitle(n.node) === "start image");
  if (titledHits.length === 1) return [titledHits[0]];
  if (titledHits.length > 1) return [];
  const loaders = nodes.filter((n) => nodeType(n.node) === "LoadImage");
  if (!loaders.length) return [];
  loaders.sort((a, b) => {
    const na = /^\d+$/.test(a.id) ? Number(a.id) : Number.MAX_SAFE_INTEGER;
    const nb = /^\d+$/.test(b.id) ? Number(b.id) : Number.MAX_SAFE_INTEGER;
    if (na !== nb) return na - nb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return [loaders[0]];
}

function readImageName(node) {
  const named = node?.widgets_values_named;
  if (named && typeof named.image === "string") return named.image;
  const wv = node?.widgets_values;
  if (Array.isArray(wv) && typeof wv[0] === "string") return wv[0];
  if (wv && typeof wv === "object" && !Array.isArray(wv) && typeof wv.image === "string") return wv.image;
  const inputs = node?.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs) && typeof inputs.image === "string") return inputs.image;
  return "";
}

function writeImageName(node, name) {
  const value = name == null ? "" : String(name);
  const wv = node.widgets_values;
  if (Array.isArray(wv)) {
    if (wv.length) wv[0] = value;
    else node.widgets_values = [value, "image"];
  } else if (wv && typeof wv === "object") {
    wv.image = value;
  } else if (!node.class_type) {
    node.widgets_values = [value, "image"];
  }
  if (Array.isArray(node.widgets_values) || node.widgets_values_named || !node.class_type) {
    const named = node.widgets_values_named && typeof node.widgets_values_named === "object" ? node.widgets_values_named : {};
    named.image = value;
    if (named.upload == null) named.upload = "image";
    node.widgets_values_named = named;
  }
  const inputs = node.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs) && !Array.isArray(inputs.image)) {
    inputs.image = value;
  }
}

function lengthNodes(graph) {
  return listedNodes(graph).filter((n) => LENGTH_TYPES.has(nodeType(n.node)));
}

function readFrames(node) {
  const wv = node?.widgets_values;
  if (Array.isArray(wv) && typeof wv[LENGTH_INDEX] === "number") return wv[LENGTH_INDEX];
  const inputs = node?.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs) && typeof inputs.length === "number") return inputs.length;
  return null;
}

function writeFrames(node, frames) {
  const n = Number(frames);
  if (!Number.isFinite(n)) return;
  if (Array.isArray(node.widgets_values)) node.widgets_values[LENGTH_INDEX] = n;
  const inputs = node.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs) && "length" in inputs && !Array.isArray(inputs.length)) {
    inputs.length = n;
  }
}

/** LTX frame count: round(sec·fps) to the nearest 8n+1. */
export function framesForSeconds(sec, fps = 24) {
  const s = Number(sec);
  const f = Number(fps);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(f) || f <= 0) return null;
  const n = Math.floor((s * f) / 8 + 0.5);
  return Math.max(1, n) * 8 + 1;
}

export function isImageFileName(value) {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(value || "").trim());
}

/** Read the cut-data slots of a UI graph or an API prompt. */
export function extractCutData(graph) {
  const out = { positive: "", negative: "", seed: null, inputImage: "", frames: null };
  if (!graph || typeof graph !== "object") return out;
  const prompt = findPromptSlot(graph);
  if (prompt) out.positive = readText(prompt.node);
  const neg = findNegativeSlot(graph);
  if (neg) out.negative = readText(neg.node);
  eachSeed(graph, (item, slot) => {
    if (out.seed == null) out.seed = readSeedValue(item.node, slot);
  });
  const image = imageNodes(graph)[0];
  if (image) out.inputImage = readImageName(image.node);
  const length = lengthNodes(graph)[0];
  if (length) out.frames = readFrames(length.node);
  return out;
}

/**
 * Write cut data into `graph` (mutates). Empty prompt strings clear the node.
 * A version id is not written into Load Image; only a real filename is.
 * @param {object} graph
 * @param {{ positive?: string, negative?: string, seed?: number|null, inputImage?: string, frames?: number|null }} data
 */
export function applyCutData(graph, data) {
  if (!graph || !data) return graph;
  if (data.positive != null) {
    const prompt = findPromptSlot(graph);
    if (prompt) writeText(prompt.node, data.positive);
  }
  if (data.negative != null) {
    const neg = findNegativeSlot(graph);
    if (neg) writeText(neg.node, data.negative);
  }
  if (data.seed != null && data.seed !== "" && Number.isFinite(Number(data.seed))) {
    eachSeed(graph, (item, slot) => writeSeedValue(item.node, slot, Number(data.seed)));
  }
  if (isImageFileName(data.inputImage)) {
    const image = imageNodes(graph)[0];
    if (image) writeImageName(image.node, String(data.inputImage).trim());
  }
  if (data.frames != null && Number.isFinite(Number(data.frames))) {
    for (const item of lengthNodes(graph)) writeFrames(item.node, Number(data.frames));
  }
  return graph;
}

/** Copy of `graph` with prompt, seed, image, and length slots set to blanks. */
export function stripCutData(graph) {
  const g = cloneGraph(graph);
  if (!g) return g;
  const prompt = findPromptSlot(g);
  if (prompt) writeText(prompt.node, "");
  const neg = findNegativeSlot(g);
  if (neg) writeText(neg.node, "");
  eachSeed(g, (item, slot) => writeSeedValue(item.node, slot, 0));
  const image = imageNodes(g)[0];
  if (image) writeImageName(image.node, "");
  for (const item of lengthNodes(g)) writeFrames(item.node, 0);
  return g;
}

export function hasPromptNode(graph) {
  return !!findPromptSlot(graph);
}

export function hasLoadImageNode(graph) {
  return imageNodes(graph).length > 0;
}

/** Ids for the live graph (same ids ComfyUI serializes). */
export function cutSlotIds(graph) {
  const seeds = [];
  eachSeed(graph, (item) => seeds.push(item.id));
  return {
    promptId: findPromptSlot(graph)?.id || "",
    negativeId: findNegativeSlot(graph)?.id || "",
    seedIds: seeds,
    imageId: imageNodes(graph)[0]?.id || "",
    lengthId: lengthNodes(graph)[0]?.id || "",
  };
}
