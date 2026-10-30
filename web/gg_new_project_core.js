/** Pure helpers for the New Project window: name, location, Default template (no DOM). */

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

/** The folder a new project gets: <location>/<project name>; "" until both are filled in. */
export function projectFolderPath(location, name) {
  const loc = clampPath(location);
  if (!loc || !String(name ?? "").trim()) return "";
  const sep = loc.includes("/") && !loc.includes("\\") ? "/" : "\\";
  return `${loc.replace(/[\\/]+$/, "")}${sep}${projectFolderName(name)}`;
}

/**
 * Validate the window and build the POST /gonggan/project/create body.
 * @param {{ name?: string, location?: string, template?: string }} v
 * @returns {{ error: string, field: "name"|"location" } | { body: { name: string, location: string, template_ref?: string } }}
 */
export function newProjectRequest(v = {}) {
  const name = String(v.name ?? "").trim();
  if (!name) return { error: "Enter a project name", field: "name" };
  const location = clampPath(v.location);
  if (!location) return { error: "Choose a location", field: "location" };
  const template = String(v.template ?? "").trim();
  return { body: { name, location, ...(template ? { template_ref: template } : {}) } };
}

/** True when the server created the project without its folder (route from before 0.9.99, ComfyUI not restarted). */
export function folderNotCreated(project) {
  return !!project && typeof project.folder !== "string";
}
