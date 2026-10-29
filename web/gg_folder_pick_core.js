/** Pure helpers for the Output folder picker (Project Settings > Browse…). No DOM. */

export const DRIVES_TITLE = "Drives";

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
  let p = String(value ?? "").trim();
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
 * @param {{ path?: string, parent?: string|null, folders?: string[] }|null|undefined} data GET /gonggan/folder/list body
 */
export function folderPickerView(data) {
  const path = String(data?.path ?? "");
  const parent = data?.parent == null ? null : String(data.parent);
  const names = Array.isArray(data?.folders) ? data.folders.map((n) => String(n)) : [];
  return {
    path,
    parent,
    title: path || DRIVES_TITLE,
    canUp: path !== "" && parent !== null,
    items: names.map((name) => ({ name, path: joinFolderPath(path, name) })),
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
