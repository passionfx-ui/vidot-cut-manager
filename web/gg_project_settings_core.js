/** Pure helpers for native project setup fields (no DOM). */

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
  width: 1280,
  height: 720,
  fps: 24,
  cut_seconds: 3,
  caption_lang: "English",
};

const SETTING_KEYS = ["aspect", "width", "height", "fps", "cut_seconds", "caption_lang"];

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
  return RESOLUTION_PRESETS.some((p) => p.aspect === s) ? s : DEFAULT_PROJECT_SETTINGS.aspect;
}

/** @param {unknown} value */
export function clampCaptionLang(value) {
  const s = String(value ?? "").trim();
  return CAPTION_LANG_OPTIONS.includes(s) ? s : DEFAULT_PROJECT_SETTINGS.caption_lang;
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
  out.aspect = clampAspect(out.aspect);
  out.width = clampDim(out.width);
  out.height = clampDim(out.height);
  out.fps = clampFps(out.fps);
  out.cut_seconds = clampCutSeconds(out.cut_seconds);
  out.caption_lang = clampCaptionLang(out.caption_lang);
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
    if (patch[key] != null) merged[key] = patch[key];
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
export function readSettingsFromFormValues(presetValue, fpsValue, cutSecondsValue, captionLangValue, base) {
  let s = settingsFromPresetSelectValue(presetValue, base);
  s = normalizeProjectSettings({
    ...s,
    fps: fpsValue,
    cut_seconds: cutSecondsValue,
    caption_lang: captionLangValue,
  });
  return s;
}
