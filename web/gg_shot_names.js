/**
 * Gonggan shot workflow paths and tab identity (pure, no DOM/app).
 * Relative paths are under ComfyUI `workflows/` (no `workflows/` prefix).
 */

const GONGGAN_PREFIX = "gonggan";
const PROJECT_FOLDER_MAX = 60;
const CUT_FILE_MAX = 120;

/** @param {string} name @param {number} [maxLen] */
export function sanitizeNamePart(name, maxLen = PROJECT_FOLDER_MAX) {
  let base = String(name ?? "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (maxLen > 0 && base.length > maxLen) base = base.slice(0, maxLen);
  return base;
}

/** @param {string} projectId */
export function projectIdFolderFallback(projectId) {
  const compact = String(projectId ?? "").replace(/-/g, "");
  const hex = compact.slice(0, 8).toLowerCase();
  return hex || "project";
}

/**
 * @param {{ projectName?: string, projectId?: string }} opts
 * @returns {string}
 */
export function shotProjectFolder(opts) {
  const { projectName, projectId } = opts || {};
  let folder = sanitizeNamePart(projectName, PROJECT_FOLDER_MAX);
  if (!folder) folder = projectIdFolderFallback(projectId);
  return folder.slice(0, PROJECT_FOLDER_MAX);
}

/**
 * @param {{ cutName?: string, cutNumber?: number }} opts
 * @returns {string} filename including .json
 */
export function shotCutFileName(opts) {
  const { cutName, cutNumber } = opts || {};
  let base = "";
  if (cutName != null && String(cutName).trim()) {
    base = sanitizeNamePart(String(cutName).trim(), CUT_FILE_MAX - 5);
  }
  if (!base && cutNumber != null && Number.isFinite(cutNumber)) {
    base = `cut${cutNumber}`;
  }
  if (!base) base = "shot";
  let file = base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
  if (file.length > CUT_FILE_MAX) file = file.slice(0, CUT_FILE_MAX);
  if (!file.toLowerCase().endsWith(".json")) {
    file = file.slice(0, Math.max(0, CUT_FILE_MAX - 5)) + ".json";
  }
  return file;
}

/** @param {string} segment */
function assertSafePathSegment(segment, label) {
  const s = String(segment ?? "");
  if (!s || s === "." || s === "..") throw new Error(`invalid ${label} segment`);
  if (s.includes("/") || s.includes("\\")) throw new Error(`${label} must not contain slashes`);
  return s;
}

/**
 * Sanitize a project or cut id for use as a single path segment (deterministic).
 * @param {string} id
 * @returns {string}
 */
export function sanitizeWorkflowIdSegment(id) {
  const s = String(id ?? "").trim();
  if (!s) throw new Error("invalid id segment");
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  const cleaned = s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) throw new Error("invalid id segment after sanitize");
  return cleaned;
}

/**
 * Stable shot tab copy path keyed by project and cut ids (one file per cut).
 * The video workflow of a cut is a separate file so switching image/video never overwrites the other.
 * @param {{ projectId: string, cutId: string, kind?: string }} opts
 * @returns {string} e.g. gonggan/<projectId>/<cutId>.json (video: <cutId>.video.json)
 */
export function shotWorkflowRelPathById(opts) {
  const { projectId, cutId, kind } = opts || {};
  const folder = assertSafePathSegment(sanitizeWorkflowIdSegment(projectId), "project id");
  const ext = kind === "video" ? ".video.json" : ".json";
  const file = assertSafePathSegment(`${sanitizeWorkflowIdSegment(cutId)}${ext}`, "cut file");
  return `${GONGGAN_PREFIX}/${folder}/${file}`;
}

/**
 * @param {{ projectName?: string, projectId?: string, cutName?: string, cutNumber?: number }} opts
 * @returns {string} e.g. gonggan/my-project/cut1.json
 */
export function shotWorkflowRelPath(opts) {
  const folder = assertSafePathSegment(shotProjectFolder(opts), "project");
  const file = assertSafePathSegment(shotCutFileName(opts), "cut file");
  return `${GONGGAN_PREFIX}/${folder}/${file}`;
}

/** @param {string} relPath */
export function shotWorkflowBasename(relPath) {
  const p = String(relPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(slash + 1) : p;
}

/** @param {{ pid?: string, projectId?: string } | null | undefined} g */
export function gongganExtraProjectId(g) {
  if (!g) return "";
  const id = g.projectId ?? g.pid ?? "";
  return id ? String(id) : "";
}

/**
 * @param {{ pid?: string, projectId?: string, cutId?: string } | null | undefined} g
 * @param {string} projectId
 * @param {string} cutId
 */
export function graphExtraMatchesShot(g, projectId, cutId) {
  if (!g || !cutId || g.cutId !== cutId) return false;
  const gp = gongganExtraProjectId(g);
  if (!gp) return false;
  if (!projectId) return false;
  return gp === projectId;
}

/**
 * @param {{ projectId?: string, cutId?: string } | null | undefined} owned
 * @param {string} projectId
 * @param {string} cutId
 */
export function ownedMetaMatchesShot(owned, projectId, cutId) {
  if (!owned || !cutId) return false;
  if (owned.cutId !== cutId) return false;
  const op = owned.projectId ? String(owned.projectId) : "";
  if (!op || !projectId) return false;
  return op === projectId;
}

/**
 * @param {{ pid?: string, projectId?: string, cutId?: string } | null | undefined} graphExtra
 * @param {{ projectId?: string, cutId?: string } | null | undefined} ownedMeta
 * @param {{ projectId: string, cutId: string }} shot
 */
export function shotTabIdentityMatches(graphExtra, ownedMeta, shot) {
  const { projectId, cutId } = shot || {};
  if (!projectId || !cutId) return false;
  if (graphExtraMatchesShot(graphExtra, projectId, cutId)) return true;
  if (ownedMetaMatchesShot(ownedMeta, projectId, cutId)) return true;
  return false;
}

/**
 * @param {{
 *   cutId: string,
 *   projectId: string,
 *   lastCutId: string,
 *   lastProjectId: string,
 *   graphExtra?: { pid?: string, projectId?: string, cutId?: string },
 *   tabActive: boolean,
 * }} opts
 */
export function shouldSkipShotWorkflowReload(opts) {
  const { cutId, projectId, lastCutId, lastProjectId, graphExtra, tabActive } = opts || {};
  if (!tabActive) return false;
  if (!cutId || cutId !== lastCutId) return false;
  if (!projectId || projectId !== lastProjectId) return false;
  return graphExtraMatchesShot(graphExtra, projectId, cutId);
}

/** Case-insensitive workflow-store key of a path, without a leading "workflows/". */
export function workflowPathKey(p) {
  return String(p ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^workflows\//i, "")
    .toLowerCase();
}

/**
 * A shot tab belongs to Gonggan only while it is at the path Gonggan gave it (`ggGongganOwnedPath`).
 * ComfyUI Save on a never-saved tab and Rename move that same tab object to the user's file name;
 * from then on it is the user's file, even though it still carries the cut's meta and `extra.gonggan`.
 * A tab without a recorded path counts when `isPathOwned(key)` says its path is a Gonggan shot path.
 * @param {{ path?: string, ggGongganOwnedPath?: string } | null | undefined} wf
 * @param {(key: string) => boolean} [isPathOwned]
 */
export function isShotTabAtOwnedPath(wf, isPathOwned) {
  const key = workflowPathKey(wf?.path);
  if (!key) return false;
  if (wf.ggGongganOwnedPath) return key === wf.ggGongganOwnedPath;
  return typeof isPathOwned === "function" && !!isPathOwned(key);
}

/**
 * The workflow-store entry at a cut's stable shot path (open, background or closed-but-known), or null.
 * Pass it to `app.loadGraphData` as the workflow: with a bare path string ComfyUI reuses a same-path
 * tab only when that tab is active, and otherwise opens a new "<cut> (2).json" tab.
 * @param {{ getWorkflowByPath?: (p: string) => object | null, openWorkflows?: object[] } | null | undefined} store
 * @param {string} loadName  path without "workflows/", e.g. "gonggan/<pid>/<cut>.json"
 */
export function findWorkflowAtShotPath(store, loadName) {
  const key = workflowPathKey(loadName);
  if (!store || !key) return null;
  const rel = String(loadName).replace(/^\/+/, "").replace(/^workflows\//i, "");
  for (const p of [`workflows/${rel}`, rel]) {
    const w = typeof store.getWorkflowByPath === "function" ? store.getWorkflowByPath(p) : null;
    if (w && workflowPathKey(w.path) === key) return w;
  }
  return (store.openWorkflows || []).find((w) => workflowPathKey(w?.path) === key) ?? null;
}
