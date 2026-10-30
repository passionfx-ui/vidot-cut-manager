/** Pure helpers for the New Project window: name, location, Default / Image / Video template (no DOM). */

import { DEFAULT_IMAGE_TEMPLATE, DEFAULT_VIDEO_TEMPLATE } from "./gg_template_pick_core.js";

export const LAST_LOCATION_KEY = "gonggan-cut.lastProjectLocation";
export const NO_FOLDER_ROUTE_HINT = "Restart ComfyUI to create project folders. This project uses the default storage.";

const RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

const clampPath = (v) => String(v ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 260);

/** @param {Storage|null|undefined} storage @returns {string} last used location, "" when never set */
export function loadLastLocation(storage) {
  try {
    return clampPath(storage?.getItem(LAST_LOCATION_KEY));
  } catch (_) {
    return "";
  }
}

/** @param {Storage|null|undefined} storage @param {string} location */
export function saveLastLocation(storage, location) {
  const loc = clampPath(location);
  if (!loc) return;
  try {
    storage?.setItem(LAST_LOCATION_KEY, loc);
  } catch (_) {}
}

/** Folder name for a project name (same rule as gg_project/project_settings.py project_folder_name). */
export function projectFolderName(name) {
  let s = String(name ?? "").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_");
  s = s.trim().replace(/[ .]+$/, "").slice(0, 120).replace(/[ .]+$/, "");
  if (!s) return "Project";
  if (RESERVED.has(s.split(".")[0].toUpperCase())) s += "_";
  return s;
}

/**
 * The folder a new project gets: <location>/<project name>, or <location> itself when its last
 * segment already is the project folder name (case-insensitive for Windows paths); "" until both
 * are filled in. Same rule as gg_project/project_settings.py project_folder_path.
 */
export function projectFolderPath(location, name) {
  const loc = clampPath(location);
  if (!loc || !String(name ?? "").trim()) return "";
  const windows = loc.includes("\\") || /^[a-z]:/i.test(loc);
  const sep = loc.includes("/") && !loc.includes("\\") ? "/" : "\\";
  const base = loc.replace(/[\\/]+$/, "");
  const folder = projectFolderName(name);
  const last = base.split(windows ? /[\\/]/ : "/").pop() || "";
  const same = windows ? last.toLowerCase() === folder.toLowerCase() : last === folder;
  return same ? base : `${base}${sep}${folder}`;
}

/**
 * Validate the window and build the POST /gonggan/project/create body. The Image / Video templates go into the
 * project settings (blank = the built-in defaults).
 * @param {{ name?: string, location?: string, template?: string, imageTemplate?: string, videoTemplate?: string }} v
 * @returns {{ error: string, field: "name"|"location" } | { body: { name: string, location: string, template_ref?: string,
 *   settings: { image_template: string, video_template: string } } }}
 */
export function newProjectRequest(v = {}) {
  const name = String(v.name ?? "").trim();
  if (!name) return { error: "Enter a project name", field: "name" };
  const location = clampPath(v.location);
  if (!location) return { error: "Choose a location", field: "location" };
  const template = String(v.template ?? "").trim();
  const settings = {
    image_template: String(v.imageTemplate ?? "").trim() || DEFAULT_IMAGE_TEMPLATE,
    video_template: String(v.videoTemplate ?? "").trim() || DEFAULT_VIDEO_TEMPLATE,
  };
  return { body: { name, location, ...(template ? { template_ref: template } : {}), settings } };
}

/** True when the server created the project without its folder (route from before 0.9.99, ComfyUI not restarted). */
export function folderNotCreated(project) {
  return !!project && typeof project.folder !== "string";
}
