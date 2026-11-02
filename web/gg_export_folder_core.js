/** Export tab output folder display and validation (pure, no DOM). */

import { sanitizeUserPath } from "./gg_ui_text_core.js";

export const EXPORT_OUTPUT_DEFAULT_LABEL = "Project edit folder (default)";
export const EXPORT_REMOTE_EXPLORER_MSG = "Opened in Explorer on the host PC.";

/**
 * @param {{ exportFolder?: string, effectivePath?: string }} opts
 */
export function exportOutputDisplayPath(opts = {}) {
  const custom = String(opts.exportFolder ?? "").trim();
  const eff = String(opts.effectivePath ?? "").trim();
  const raw = custom || eff;
  if (!raw) return EXPORT_OUTPUT_DEFAULT_LABEL;
  const shown = sanitizeUserPath(raw);
  if (!shown) return EXPORT_OUTPUT_DEFAULT_LABEL;
  return shown;
}

/** @param {{ ok?: boolean, message?: string }} res */
export function exportFolderCheckError(res) {
  if (res?.ok) return "";
  return String(res?.message || "This folder cannot be used for export").trim();
}
