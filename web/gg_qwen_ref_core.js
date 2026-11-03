/**
 * Qwen Image Edit 2511 reference images on an API prompt.
 * Linked references fill image1, image2, image3 in link order.
 * Unused inputs are removed, and the LoadImage / scale nodes that only fed them
 * are removed, so the queued graph stays valid. No image1 uses an empty latent.
 */

export const QWEN_EDIT_TYPE = "TextEncodeQwenImageEditPlus";
export const QWEN_IMAGE_SLOTS = ["image1", "image2", "image3"];
const SKIPPED_MODES = new Set([2, 4]);

export function qwenRefWarning(liveCount) {
  const n = Number(liveCount) || 0;
  if (n <= 3) return "";
  return `Qwen Image Edit 2511 ref: ${n} linked references; using the first 3`;
}

export function workflowHasQwenEdit(workflow) {
  const nodes = [];
  const add = (list) => {
    if (!Array.isArray(list)) return;
    for (const node of list) if (node && typeof node === "object") nodes.push(node);
  };
  add(workflow?.nodes);
  const subs = workflow?.definitions?.subgraphs;
  if (Array.isArray(subs)) {
    for (const sg of subs) add(sg?.nodes);
  }
  return nodes.some((node) => {
    const type = String(node.type || node.class_type || "");
    return type === QWEN_EDIT_TYPE && !SKIPPED_MODES.has(node.mode);
  });
}

function isLink(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isInteger(value[1]) && (typeof value[0] === "string" || typeof value[0] === "number");
}

function linkTarget(value) {
  return isLink(value) ? String(value[0]) : "";
}

function apiNodes(prompt) {
  const out = [];
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) return out;
  for (const [id, node] of Object.entries(prompt)) {
    if (node && typeof node === "object" && node.class_type) out.push([String(id), node]);
  }
  return out;
}

function chainForSlot(prompt, encoders, slot) {
  const ids = [];
  for (const enc of encoders) {
    const target = linkTarget(enc.inputs?.[slot]);
    if (!target || !prompt[target]) continue;
    ids.push(target);
    const node = prompt[target];
    const inner = linkTarget(node.inputs?.image);
    if (inner && prompt[inner] && inner !== target) ids.push(inner);
    break;
  }
  if (slot === "image1") {
    const known = new Set(ids);
    for (const [id, node] of apiNodes(prompt)) {
      if (node.class_type !== "VAEEncode") continue;
      const src = linkTarget(node.inputs?.pixels);
      if (src && known.has(src)) ids.push(id);
    }
  }
  return ids;
}

function loadId(prompt, ids) {
  return ids.find((id) => prompt[id]?.class_type === "LoadImage") || "";
}

function referencedIds(prompt) {
  const refs = new Set();
  for (const [, node] of apiNodes(prompt)) {
    const inputs = node.inputs;
    if (!inputs || typeof inputs !== "object") continue;
    for (const value of Object.values(inputs)) {
      const target = linkTarget(value);
      if (target) refs.add(target);
    }
  }
  return refs;
}

function dropUnreferenced(prompt, candidates) {
  const pending = new Set(candidates);
  let changed = true;
  while (changed) {
    changed = false;
    const refs = referencedIds(prompt);
    for (const id of [...pending]) {
      if (!prompt[id] || refs.has(id)) continue;
      delete prompt[id];
      pending.delete(id);
      changed = true;
    }
  }
}

function ensureEmptyLatent(prompt) {
  for (const [id, node] of apiNodes(prompt)) {
    if (node.class_type === "EmptySD3LatentImage") return id;
  }
  const id = "qwen_text_latent";
  prompt[id] = {
    class_type: "EmptySD3LatentImage",
    inputs: { width: 1024, height: 1024, batch_size: 1 },
    _meta: { title: "Text only latent" },
  };
  return id;
}

function rewireTextLatent(prompt, imageChain) {
  const emptyId = ensureEmptyLatent(prompt);
  const chain = new Set(imageChain);
  for (const [, node] of apiNodes(prompt)) {
    if (node.class_type !== "KSampler") continue;
    const inputs = node.inputs && typeof node.inputs === "object" ? node.inputs : (node.inputs = {});
    const src = linkTarget(inputs.latent_image);
    if (!src || chain.has(src)) inputs.latent_image = [emptyId, 0];
  }
  return emptyId;
}

/**
 * Write reference filenames onto image1..image3.
 * `images` is index-aligned: [image1, image2, image3]. An empty string disconnects that input.
 * @param {object} prompt API prompt, mutated in place
 * @param {string[]} images
 * @returns {boolean} true when this prompt has a Qwen edit encoder
 */
export function applyQwenRefImages(prompt, images) {
  const encoders = apiNodes(prompt).filter(([, node]) => node.class_type === QWEN_EDIT_TYPE).map(([, node]) => node);
  if (!encoders.length || !prompt) return false;
  const files = [0, 1, 2].map((i) => String(images?.[i] ?? "").trim());
  const chains = QWEN_IMAGE_SLOTS.map((slot) => chainForSlot(prompt, encoders, slot));
  const drop = new Set();
  for (let i = 0; i < 3; i++) {
    const slot = QWEN_IMAGE_SLOTS[i];
    let file = files[i];
    const loader = loadId(prompt, chains[i]);
    if (file && loader) {
      const inputs = prompt[loader].inputs && typeof prompt[loader].inputs === "object"
        ? prompt[loader].inputs
        : (prompt[loader].inputs = {});
      if (!linkTarget(inputs.image)) inputs.image = file;
    } else {
      file = "";
      files[i] = "";
    }
    if (!file) {
      for (const enc of encoders) {
        if (enc.inputs && typeof enc.inputs === "object") delete enc.inputs[slot];
      }
      for (const id of chains[i]) drop.add(id);
    }
  }
  if (!files[0]) rewireTextLatent(prompt, chains[0]);
  else {
    for (const [id, node] of apiNodes(prompt)) {
      if (node.class_type === "EmptySD3LatentImage") drop.add(id);
    }
  }
  dropUnreferenced(prompt, drop);
  return true;
}
