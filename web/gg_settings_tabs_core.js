/** Project Settings dialog tabs (H5). No DOM. Storage keys stay where they already are. */

export const SETTINGS_TAB_GLOBAL = "global";
export const SETTINGS_TAB_PROJECT = "project";

export const SETTINGS_TAB_LABELS = {
  [SETTINGS_TAB_GLOBAL]: "Global",
  [SETTINGS_TAB_PROJECT]: "This Project",
};

/**
 * Markers that must sit in that pane of openProjectSettingsModal.
 * Global = app-wide (gonggan_settings.json): AI features, Use AI, the AI model, scanned model folders, History steps.
 * This Project = saved on the project: output folder, templates, generation.
 * An empty project folder still means the plugin default; there is no second output-folder key.
 */
export const SETTINGS_PANE_MARKERS = {
  project: ["gg-modal-folder", "genSettingsModalHtml", "templateFieldHtml"],
  global: ["gg-ai-features-field", "gg-use-ai-field", "gg-cut-split-model-field", "gg-ai-model-dirs", "gg-history-steps-field"],
};

/** Existing controls. Unknown ids are not assigned. */
const CONTROL_TAB = {
  ai_features: SETTINGS_TAB_GLOBAL,
  use_ai: SETTINGS_TAB_GLOBAL,
  ai_model: SETTINGS_TAB_GLOBAL,
  ai_model_folders: SETTINGS_TAB_GLOBAL,
  history_steps: SETTINGS_TAB_GLOBAL,
  gen_aspect: SETTINGS_TAB_PROJECT,
  resolution: SETTINGS_TAB_PROJECT,
  custom_size: SETTINGS_TAB_PROJECT,
  random_seed: SETTINGS_TAB_PROJECT,
  template: SETTINGS_TAB_PROJECT,
  project_folder: SETTINGS_TAB_PROJECT,
};

/** @param {string} control @returns {"global"|"project"|null} */
export function settingsControlTab(control) {
  return CONTROL_TAB[String(control ?? "")] || null;
}

/** Which pane is visible. Anything other than Global shows This Project. */
export function settingsTabPanes(active) {
  const global = active === SETTINGS_TAB_GLOBAL;
  return { project: !global, global };
}

/** New Project dialog: project-level fields only (no Use AI / model folders). */
const NEW_PROJECT_CONTROLS = new Set([
  "name",
  "location",
  "template",
  "gen_aspect",
  "resolution",
  "custom_size",
  "random_seed",
]);

/** @param {string} control */
export function newProjectDialogControlAllowed(control) {
  return NEW_PROJECT_CONTROLS.has(String(control ?? ""));
}
