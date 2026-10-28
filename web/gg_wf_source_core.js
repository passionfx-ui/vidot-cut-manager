/**
 * Shot workflow source helpers (PNG embedded workflow) and edited markers (pure, no DOM).
 */

export const EDITED_MAP_KEY = "gg.edited";

/**
 * @param {ArrayBuffer | Uint8Array | null | undefined} arrayBuffer
 * @returns {object | null} UI graph with nodes[], or null
 */
export function extractPngWorkflow(arrayBuffer) {
  if (!arrayBuffer) return null;
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  if (bytes.length < 8) return null;
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== sig[i]) return null;
  }
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len =
      (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
    off += 4;
    const type = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    off += 4;
    if (len < 0 || off + len + 4 > bytes.length) return null;
    const data = bytes.subarray(off, off + len);
    off += len + 4;
    if (type === "IEND") break;
    if (type === "tEXt" || type === "iTXt") {
      const parsed = parseTextChunk(type, data);
      if (parsed?.keyword === "workflow" && parsed.text) {
        const wf = parseWorkflowJson(parsed.text);
        if (wf) return wf;
      }
    }
  }
  return null;
}

function parseTextChunk(type, data) {
  let i = 0;
  while (i < data.length && data[i] !== 0) i++;
  if (i >= data.length) return null;
  const keyword = new TextDecoder().decode(data.subarray(0, i));
  i++;
  let textBytes;
  if (type === "tEXt") {
    textBytes = data.subarray(i);
  } else {
    if (i >= data.length) return { keyword, text: "" };
    const comp = data[i];
    i++;
    if (i >= data.length) return { keyword, text: "" };
    i++;
    while (i < data.length && data[i] !== 0) i++;
    i++;
    while (i < data.length && data[i] !== 0) i++;
    i++;
    textBytes = data.subarray(i);
    if (comp === 1) return { keyword, text: "" };
  }
  const text = new TextDecoder().decode(textBytes);
  return { keyword, text };
}

function parseWorkflowJson(text) {
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object") return null;
    if (!Array.isArray(obj.nodes)) return null;
    return obj;
  } catch {
    return null;
  }
}

function widgetMapFromWorkflow(workflow) {
  const nodes = workflow?.nodes;
  if (!Array.isArray(nodes)) return null;
  const map = {};
  for (const n of nodes) {
    if (n == null || n.id == null) continue;
    map[String(n.id)] = n.widgets_values ?? [];
  }
  return map;
}

/**
 * @param {object | null | undefined} baselineWorkflow
 * @param {object | null | undefined} currentWorkflow
 * @returns {boolean}
 */
export function widgetValuesDiffer(baselineWorkflow, currentWorkflow) {
  const a = widgetMapFromWorkflow(baselineWorkflow);
  const b = widgetMapFromWorkflow(currentWorkflow);
  if (!a || !b) return true;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return true;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return true;
    const k = keysA[i];
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return true;
  }
  return false;
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {Record<string, string>}
 */
export function loadEditedMap(storage) {
  if (!storage || typeof storage.getItem !== "function") return {};
  try {
    const raw = storage.getItem(EDITED_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return { ...parsed };
  } catch {
    return {};
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {Record<string, string>} map
 */
export function saveEditedMap(storage, map) {
  if (!storage || typeof storage.setItem !== "function") return;
  try {
    storage.setItem(EDITED_MAP_KEY, JSON.stringify(map || {}));
  } catch (_) {}
}

/**
 * @param {Record<string, string>} map
 * @param {string} cutId
 * @param {string} baseKey
 * @returns {boolean}
 */
export function isCutEdited(map, cutId, baseKey) {
  if (!cutId || baseKey == null) return false;
  return String(map?.[cutId] ?? "") === String(baseKey);
}
