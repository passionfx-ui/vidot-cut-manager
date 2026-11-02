/** Pure helpers for native project setup fields (no DOM). */

import { DEFAULT_IMAGE_TEMPLATE, DEFAULT_VIDEO_TEMPLATE } from "./gg_template_pick_core.js";
import {
  GEN_ASPECT_RATIOS,
  GEN_SHORT_SIDE_OPTIONS,
  GEN_SHORT_SIDE_LABELS,
  dimensionsFromGenSettings,
  normalizeGenSettings,
  genSettingsModalPatch,
  randomSeedFromProjectSettings,
} from "./gg_gen_settings_core.js";

export {
  GEN_ASPECT_RATIOS,
  GEN_SHORT_SIDE_OPTIONS,
  GEN_SHORT_SIDE_LABELS,
  dimensionsFromGenSettings,
  normalizeGenSettings,
  genSettingsModalPatch,
  randomSeedFromProjectSettings,
};

export const RESOLUTION_PRESETS = [
  { aspect: "16:9", width: 1280, height: 720, label: "16:9 1280×720" },
  { aspect: "16:9", width: 1920, height: 1080, label: "16:9 1920×1080" },
  { aspect: "9:16", width: 720, height: 1280, label: "9:16 720×1280" },
  { aspect: "1:1", width: 1024, height: 1024, label: "1:1 1024×1024" },
  { aspect: "4:3", width: 1024, height: 768, label: "4:3 1024×768" },
];

export const FPS_OPTIONS = [24, 25, 30];

export const CAPTION_LANG_OPTIONS = [
  "English",
  "Korean",
  "Japanese",
  "Chinese",
  "Spanish",
  "French",
  "German",
];

export const DEFAULT_PROJECT_SETTINGS = {
  aspect: "16:9",
  gen_aspect: "16:9",
  resolution_short: 720,
  random_seed: true,
  width: 1280,
  height: 720,
  fps: 24,
  cut_seconds: 3,
  caption_lang: "English",
  project_folder: "",
  image_template: DEFAULT_IMAGE_TEMPLATE,
  video_template: DEFAULT_VIDEO_TEMPLATE,
};

const SETTING_KEYS = [
  "aspect",
  "gen_aspect",
  "resolution_short",
  "random_seed",
  "width",
  "height",
  "fps",
  "cut_seconds",
  "caption_lang",
  "project_folder",
  "image_template",
  "video_template",
];

/** @param {{ aspect: string, width: number, height: number }} preset */
export function presetKey(preset) {
  return `${preset.aspect}@${preset.width}x${preset.height}`;
}

/** @param {string} key */
export function parsePresetKey(key) {
  const s = String(key ?? "").trim();
  const at = s.indexOf("@");
  const x = s.toLowerCase().indexOf("x", at + 1);
  if (at < 1 || x <= at) return null;
  const aspect = s.slice(0, at);
  const w = Number(s.slice(at + 1, x));
  const h = Number(s.slice(x + 1));
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  const hit = RESOLUTION_PRESETS.find((p) => p.aspect === aspect && p.width === w && p.height === h);
  if (hit) return { ...hit };
  return { aspect, width: w, height: h, label: `${aspect} ${w}×${h}` };
}

export function clampDim(value) {
  let v = Math.round(Number(value));
  if (!Number.isFinite(v)) v = DEFAULT_PROJECT_SETTINGS.width;
  v = Math.max(256, Math.min(4096, v));
  return Math.floor(v / 8) * 8;
}

export function clampFps(value) {
  let v = Math.round(Number(value));
  if (!Number.isFinite(v)) v = DEFAULT_PROJECT_SETTINGS.fps;
  return FPS_OPTIONS.includes(v) ? v : DEFAULT_PROJECT_SETTINGS.fps;
}

export function clampCutSeconds(value) {
  let v = Number(value);
  if (!Number.isFinite(v)) v = DEFAULT_PROJECT_SETTINGS.cut_seconds;
  v = Math.max(1, Math.min(60, v));
  return Math.round(v * 100) / 100;
}

export function clampAspect(value) {
  const s = String(value ?? "").trim();
  return GEN_ASPECT_RATIOS.includes(s) ? s : DEFAULT_PROJECT_SETTINGS.gen_aspect;
}

/** @param {unknown} value */
export function clampCaptionLang(value) {
  const s = String(value ?? "").trim();
  return CAPTION_LANG_OPTIONS.includes(s) ? s : DEFAULT_PROJECT_SETTINGS.caption_lang;
}

/** Optional local folder path (display + future sync target only). @param {unknown} value */
export function clampProjectFolder(value) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 260);
}

/** Image / Video template ref (built-in or user workflow path); empty = the built-in default. */
export function clampTemplateRef(value, fallback) {
  const s = String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().replace(/\\/g, "/").slice(0, 260);
  return s || fallback;
}

/**
 * Settings patch for the Project Settings modal: Output folder and the Image / Video templates, only the keys
 * that changed (other stored keys are left as they are).
 * @param {{ image_template?: string, video_template?: string }} [templates] omitted keys are not changed
 * @param {{ gen_aspect?: string, resolution_short?: number, random_seed?: boolean }} [genForm] omitted = leave generation settings
 * @returns {{ project_folder?: string, image_template?: string, video_template?: string } | null} null when nothing changed
 */
export function projectSettingsModalPatch(current, folderValue, templates = {}, genForm = undefined) {
  const cur = normalizeProjectSettings(current);
  const patch = {};
  const folder = clampProjectFolder(folderValue);
  if (folder !== cur.project_folder) patch.project_folder = folder;
  for (const key of ["image_template", "video_template"]) {
    if (templates[key] === undefined) continue;
    const ref = clampTemplateRef(templates[key], DEFAULT_PROJECT_SETTINGS[key]);
    if (ref !== cur[key]) patch[key] = ref;
  }
  const genPatch = genForm != null ? genSettingsModalPatch(cur, genForm) : null;
  if (genPatch) Object.assign(patch, genPatch);
  return Object.keys(patch).length ? patch : null;
}

/** Inline message for a failed POST /gonggan/folder/check. @param {{ status?: number, message?: string }|null|undefined} err */
export function folderCheckErrorText(err) {
  const st = err?.status;
  if (st === 404 || st === 405) return "Restart ComfyUI to enable the folder check, then Save again.";
  return String(err?.message || "Folder check failed");
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {typeof DEFAULT_PROJECT_SETTINGS}
 */
export function normalizeProjectSettings(raw) {
  const out = { ...DEFAULT_PROJECT_SETTINGS };
  const src = raw && typeof raw === "object" ? { ...raw } : {};
  if (src.default_sec != null && src.cut_seconds == null) src.cut_seconds = src.default_sec;
  for (const key of SETTING_KEYS) {
    if (src[key] != null) out[key] = src[key];
  }
  if (src.random_seed != null) out.random_seed = !!src.random_seed;
  const gen = normalizeGenSettings(src, out);
  out.gen_aspect = gen.gen_aspect;
  out.aspect = gen.gen_aspect;
  out.resolution_short = gen.resolution_short;
  out.random_seed = gen.random_seed;
  out.width = gen.width;
  out.height = gen.height;
  out.fps = clampFps(out.fps);
  out.cut_seconds = clampCutSeconds(out.cut_seconds);
  out.caption_lang = clampCaptionLang(out.caption_lang);
  out.project_folder = clampProjectFolder(out.project_folder);
  out.image_template = clampTemplateRef(out.image_template, DEFAULT_IMAGE_TEMPLATE);
  out.video_template = clampTemplateRef(out.video_template, DEFAULT_VIDEO_TEMPLATE);
  return out;
}

/**
 * @param {typeof DEFAULT_PROJECT_SETTINGS} settings
 * @returns {string}
 */
export function presetKeyForSettings(settings) {
  const s = normalizeProjectSettings(settings);
  const hit = RESOLUTION_PRESETS.find(
    (p) => p.aspect === s.aspect && p.width === s.width && p.height === s.height
  );
  return hit ? presetKey(hit) : presetKey({ aspect: s.aspect, width: s.width, height: s.height, label: "" });
}

/**
 * @param {typeof DEFAULT_PROJECT_SETTINGS|null|undefined} current
 * @param {Record<string, unknown>|null|undefined} patch
 */
export function mergeProjectSettings(current, patch) {
  const base = normalizeProjectSettings(current);
  if (!patch || typeof patch !== "object") return base;
  const merged = { ...base };
  for (const key of SETTING_KEYS) {
    if (key in patch) merged[key] = patch[key];
  }
  return normalizeProjectSettings(merged);
}

/**
 * @param {typeof DEFAULT_PROJECT_SETTINGS|null|undefined} settings
 * @returns {typeof DEFAULT_PROJECT_SETTINGS}
 */
export function settingsFromPresetSelectValue(value, settings) {
  const parsed = parsePresetKey(value);
  if (!parsed) return normalizeProjectSettings(settings);
  return normalizeProjectSettings({
    ...settings,
    aspect: parsed.aspect,
    width: parsed.width,
    height: parsed.height,
  });
}

/**
 * @param {typeof DEFAULT_PROJECT_SETTINGS|null|undefined} settings
 */
export function readSettingsFromFormValues(presetValue, fpsValue, cutSecondsValue, captionLangValue, base, projectFolderValue) {
  let s = settingsFromPresetSelectValue(presetValue, base);
  s = normalizeProjectSettings({
    ...s,
    fps: fpsValue,
    cut_seconds: cutSecondsValue,
    caption_lang: captionLangValue,
    ...(projectFolderValue === undefined ? {} : { project_folder: projectFolderValue }),
  });
  return s;
}

/**
 * Image template shown in Project Settings (0.9.135: the Default template field is gone). An explicit Image
 * template wins; a project that only had a Default template linked shows that one, so nothing changes for it.
 * @param {string} imageTemplate @param {string} defaultRef
 */
export function effectiveImageTemplate(imageTemplate, defaultRef) {
  const img = typeof imageTemplate === "string" ? imageTemplate : "";
  const def = typeof defaultRef === "string" ? defaultRef.trim() : "";
  if (img && img !== DEFAULT_IMAGE_TEMPLATE) return img;
  return def || img || DEFAULT_IMAGE_TEMPLATE;
}
