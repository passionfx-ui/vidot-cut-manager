/** Pure helpers for the Browse… folder picker (New Project Location, Project Settings Output folder). No DOM. */

export const RELATIVE_PATH_ERROR = "Use a full path, e.g. D:\\Films";

/**
 * Typed / pasted address: trims, drops surrounding quotes ("Copy as path") and trailing slashes / backslashes.
 * A drive root stays "C:\" ("C:" and "C:/" become "C:\"), "/" stays "/".
 */
export function normalizeFolderInput(value) {
  const s = String(value ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (/^[a-zA-Z]:[\\/]*$/.test(s)) return `${s.slice(0, 2)}\\`;
  if (/^\/+$/.test(s)) return "/";
  return s.replace(/[\\/]+$/, "");
}

/**
 * Where the address bar should go: `{ path }` ("" = drive list), or `{ error }` for a relative path.
 * @returns {{ path: string, error: string }}
 */
export function folderAddressTarget(value) {
  const path = normalizeFolderInput(value);
  if (path && !isAbsoluteFolderPath(path)) return { path: "", error: RELATIVE_PATH_ERROR };
  return { path, error: "" };
}

/** "C:\" -> "C:" for the drives list. */
export function driveLabel(root) {
  const s = String(root ?? "");
  return /^[a-zA-Z]:[\\/]?$/.test(s) ? s.slice(0, 2).toUpperCase() : s;
}

/** @param {string} path "" = drive list */
export function folderListUrl(path) {
  return `/gonggan/folder/list?path=${encodeURIComponent(String(path ?? ""))}`;
}

/** Windows drive / UNC path or POSIX absolute path. */
export function isAbsoluteFolderPath(path) {
  const s = String(path ?? "").trim();
  return /^[a-zA-Z]:[\\/]/.test(s) || /^[\\/]{2}[^\\/]/.test(s) || s.startsWith("/");
}

/** @param {string} base folder ("" = drive list) @param {string} name child folder name */
export function joinFolderPath(base, name) {
  const b = String(base ?? "");
  const n = String(name ?? "");
  if (!b) return n;
  if (/[\\/]$/.test(b)) return b + n;
  const sep = b.includes("\\") || /^[a-zA-Z]:/.test(b) ? "\\" : "/";
  return b + sep + n;
}

/** One level up; "" above a drive root or "/" (= drive list). */
export function parentFolderPath(path) {
  const s = String(path ?? "").trim().replace(/[\\/]+$/, "");
  if (!s || /^[a-zA-Z]:$/.test(s)) return "";
  const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  if (i < 0) return "";
  const head = s.slice(0, i);
  if (/^[a-zA-Z]:$/.test(head)) return head + s[i];
  if (!head) return s[i] === "/" ? "/" : "";
  return head;
}

/**
 * Folders to try when the picker opens: the typed path, then each parent (the Output folder may not exist yet),
 * then the drive list.
 * @returns {string[]}
 */
export function startPathCandidates(value, max = 8) {
  const out = [];
  let p = normalizeFolderInput(value);
  if (isAbsoluteFolderPath(p)) {
    while (p && out.length < max && !out.includes(p)) {
      out.push(p);
      p = parentFolderPath(p);
    }
  }
  out.push("");
  return out;
}

/**
 * Left pane: quick folders from the server (Home, Desktop, Documents) plus "Last used" (when it is a full path
 * not already listed), and the drives.
 * @param {{ quick?: {name: string, path: string}[], drives?: string[] }|null|undefined} data
 * @param {string} [lastUsed]
 */
export function folderPickerPlaces(data, lastUsed) {
  const quick = (Array.isArray(data?.quick) ? data.quick : [])
    .filter((q) => q && typeof q.path === "string" && q.path)
    .map((q) => ({ name: String(q.name || q.path), path: q.path }));
  const last = normalizeFolderInput(lastUsed);
  const key = (p) => normalizeFolderInput(p).toLowerCase();
  if (isAbsoluteFolderPath(last) && !quick.some((q) => key(q.path) === last.toLowerCase())) {
    quick.push({ name: "Last used", path: last });
  }
  const drives = (Array.isArray(data?.drives) ? data.drives : [])
    .map((d) => String(d))
    .filter(Boolean)
    .map((d) => ({ name: driveLabel(d), path: d }));
  return { quick, drives };
}

/**
 * Rows of the folder list: only the `folders` names of the listing (never files or other entries), each a plain
 * non-empty name (drive roots only in the drive list), deduped.
 * @param {unknown} folders
 * @param {string} path "" = drive list
 * @returns {string[]}
 */
export function folderNames(folders, path) {
  const out = [];
  for (const n of Array.isArray(folders) ? folders : []) {
    if (typeof n !== "string" || !n.trim()) continue;
    if (path && /[\\/]/.test(n)) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * @param {{ path?: string, parent?: string|null, folders?: string[], quick?: object[], drives?: string[] }|null|undefined} data
 *   GET /gonggan/folder/list body
 * @param {string} [lastUsed] last-used location, listed under the quick folders
 */
export function folderPickerView(data, lastUsed) {
  const path = String(data?.path ?? "");
  const parent = data?.parent == null ? null : String(data.parent);
  const names = folderNames(data?.folders, path);
  return {
    path,
    parent,
    canUp: path !== "" && parent !== null,
    items: names.map((name) => ({ name, path: joinFolderPath(path, name) })),
    ...folderPickerPlaces(data, lastUsed),
  };
}

/** Path the Select button fills in: the highlighted folder, else the open folder ("" = nothing to select). */
export function folderPickTarget(view, selectedIndex) {
  const hit = view?.items?.[selectedIndex];
  if (hit) return hit.path;
  return view?.path || "";
}

/**
 * @param {number} status HTTP status (0 = network error)
 * @param {{ message?: string }|null|undefined} data
 * @returns {{ message: string, routeMissing: boolean }}
 */
export function folderListError(status, data) {
  const msg = typeof data?.message === "string" ? data.message.trim() : "";
  if (msg) return { message: msg, routeMissing: false };
  if (status === 404 || status === 405) {
    return { message: "Restart ComfyUI to enable Browse…, or type the path.", routeMissing: true };
  }
  return { message: status ? `Could not list folders (HTTP ${status})` : "Could not list folders", routeMissing: false };
}
