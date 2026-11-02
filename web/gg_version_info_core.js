/** Per-version info under the Shots version row. Pure, no DOM. */

import { formatClipDuration, versionSeconds } from "./gg_version_strip_core.js";

export const INFO_LABEL_TYPE = "Type";
export const INFO_LABEL_RESOLUTION = "Resolution";
export const INFO_LABEL_DURATION = "Duration";
export const INFO_LABEL_FPS = "FPS";
export const INFO_LABEL_SEED = "Seed";
export const INFO_LABEL_WORKFLOW = "Workflow";

export function versionDisplayType(v) {
  if (!v || v.missing) return "-";
  if (v.kind === "video" || v.animated) return "video";
  if (v.kind === "image") return "image";
  return "-";
}

export function formatResolution(v) {
  const w = Number(v?.width);
  const h = Number(v?.height);
  if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
    return `${Math.round(w)}×${Math.round(h)}`;
  }
  return "-";
}

export function formatSeed(v) {
  if (v?.seed == null || v.seed === "") return "-";
  const n = Number(v.seed);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  const s = String(v.seed).trim();
  return s || "-";
}

export function formatWorkflowLabel(v) {
  const m = v?.model != null ? String(v.model).trim() : "";
  if (m) return m;
  const w = v?.workflow_name != null ? String(v.workflow_name).trim() : "";
  return w || "-";
}

/**
 * @param {object|null|undefined} v version row
 * @param {object|null|undefined} cut
 * @param {Map<string, number>|undefined} probed
 * @param {number|undefined} projectFps
 */
export function versionInfoFields(v, cut, probed, projectFps) {
  const type = versionDisplayType(v);
  const isVideo = type === "video";
  const sec = isVideo ? versionSeconds(v, cut, probed) : 0;
  const duration = isVideo ? formatClipDuration(sec) || "-" : "";
  let fps = "-";
  if (isVideo) {
    const vf = Number(v?.fps);
    if (Number.isFinite(vf) && vf > 0) fps = String(Math.round(vf));
    else {
      const pf = Number(projectFps);
      if (Number.isFinite(pf) && pf > 0) fps = String(Math.round(pf));
    }
  }
  return {
    type,
    resolution: formatResolution(v),
    duration,
    fps,
    seed: formatSeed(v),
    workflow: formatWorkflowLabel(v),
    showVideoTiming: isVideo,
  };
}

/** @param {ReturnType<typeof versionInfoFields>} f */
export function versionInfoPanelRows(f) {
  // Same rows for image and video so the panel size does not change. N/A values are "-".
  return [
    { label: INFO_LABEL_TYPE, value: f.type || "-" },
    { label: INFO_LABEL_RESOLUTION, value: f.resolution || "-" },
    { label: INFO_LABEL_DURATION, value: f.showVideoTiming ? (f.duration || "-") : "-" },
    { label: INFO_LABEL_FPS, value: f.showVideoTiming ? (f.fps || "-") : "-" },
    { label: INFO_LABEL_SEED, value: f.seed || "-" },
    { label: INFO_LABEL_WORKFLOW, value: f.workflow || "-" },
  ];
}
