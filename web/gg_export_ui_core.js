/** Timeline MP4 export panel labels and button state (0.9.130). */

export const EXPORT_PLAY_LABEL = "Play";
export const EXPORT_PLAY_TIP = "Play the exported mp4 in the preview panel";
export const EXPORT_FOLDER_LABEL = "Show in Folder";
export const EXPORT_FOLDER_TIP = "Open the project edit folder in Windows Explorer";
export const EXPORT_FOLDER_TIP_NO_FILE = "Export an mp4 first";
export const EXPORT_DONE_TOAST_TITLE = "Export complete";
export const EXPORT_FAIL_TOAST_TITLE = "Export failed";

/** @param {{ status?: string, path?: string, file?: string }} job */
export function exportPanelActions(job) {
  const done = job && job.status === "done";
  const hasFile = !!(done && job.file && job.path);
  return {
    showRow: !!job,
    running: !!(job && job.status === "running"),
    hasFile,
    playDisabled: !hasFile,
    folderDisabled: !hasFile,
    playTip: hasFile ? EXPORT_PLAY_TIP : EXPORT_FOLDER_TIP_NO_FILE,
    folderTip: hasFile ? EXPORT_FOLDER_TIP : EXPORT_FOLDER_TIP_NO_FILE,
  };
}

export function exportDoneToastBody(file) {
  const name = typeof file === "string" && file ? file : "timeline.mp4";
  return `${name} saved in the project edit folder.`;
}
