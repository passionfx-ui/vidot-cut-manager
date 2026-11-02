/** Common generation settings (aspect, short-side resolution, custom size, random seed). Pure, no DOM. */

export const GEN_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

export const GEN_SHORT_SIDE_OPTIONS = [384, 480, 512, 576, 640, 720, 768, 832, 960, 1024, 1080, 1280, 1440, 2160];

export const GEN_RESOLUTION_CUSTOM = "custom";

export const GEN_SHORT_SIDE_LABELS = Object.fromEntries(
  GEN_SHORT_SIDE_OPTIONS.map((n) => [n, `${n} px (short side)`]),
);

export const GEN_SETTINGS_KEYS = ["gen_aspect", "resolution_short", "random_seed"];

export function isCustomResolution(value) {
  return String(value ?? "").trim().toLowerCase() === GEN_RESOLUTION_CUSTOM;
}

export function clampGenAspect(value, fallback = "16:9") {
  const s = String(value ?? "").trim();
  return GEN_ASPECT_RATIOS.includes(s) ? s : fallback;
}

function presetShort(value, fallback = 720) {
  const n = Math.round(Number(value));
  return GEN_SHORT_SIDE_OPTIONS.includes(n) ? n : fallback;
}

export function clampResolutionShort(value, fallback = 720) {
  if (isCustomResolution(value)) return GEN_RESOLUTION_CUSTOM;
  return presetShort(value, fallback);
}

export function resolutionDropdownItems() {
  return [
    ...GEN_SHORT_SIDE_OPTIONS.map((n) => ({
      value: String(n),
      label: GEN_SHORT_SIDE_LABELS[n],
    })),
    { value: GEN_RESOLUTION_CUSTOM, label: "Custom" },
  ];
}

/** Select value for a stored resolution_short (preset number or custom). */
export function resolutionChoiceValue(resolutionShort) {
  if (isCustomResolution(resolutionShort)) return GEN_RESOLUTION_CUSTOM;
  return String(presetShort(resolutionShort));
}

/**
 * Modal fields → normalizeGenSettings input.
 * Presets ignore width/height. Custom keeps the entered size.
 * @param {{ gen_aspect?: string, resolution?: unknown, width?: unknown, height?: unknown, random_seed?: boolean }} controls
 */
export function genFormFromResolutionChoice(controls = {}) {
  const form = {
    gen_aspect: controls.gen_aspect,
    random_seed: controls.random_seed,
  };
  if (isCustomResolution(controls.resolution)) {
    form.resolution_short = GEN_RESOLUTION_CUSTOM;
    form.width = controls.width;
    form.height = controls.height;
  } else {
    form.resolution_short = Number(controls.resolution);
  }
  return form;
}

export function inferResolutionShort(aspect, width, height) {
  const a = clampGenAspect(aspect);
  const parts = a.split(":").map(Number);
  const aw = parts[0] || 16;
  const ah = parts[1] || 9;
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  const short = aw >= ah ? h : w;
  if (!Number.isFinite(short)) return 720;
  return GEN_SHORT_SIDE_OPTIONS.reduce(
    (best, n) => (Math.abs(n - short) < Math.abs(best - short) ? n : best),
    GEN_SHORT_SIDE_OPTIONS[0],
  );
}

export function roundDimension(value, roundTo = 8) {
  let v = Math.round(Number(value));
  if (!Number.isFinite(v)) v = 720;
  v = Math.max(roundTo, Math.min(4096, v));
  return Math.floor(v / roundTo) * roundTo;
}

export function dimensionsFromGenSettings(aspect, shortSide, roundTo = 8) {
  const a = clampGenAspect(aspect);
  const short = presetShort(shortSide);
  const parts = a.split(":").map(Number);
  const aw = parts[0] || 16;
  const ah = parts[1] || 9;
  if (aw >= ah) {
    const height = roundDimension(short, roundTo);
    const width = roundDimension((height * aw) / ah, roundTo);
    return { width, height, aspect: a, resolution_short: short };
  }
  const width = roundDimension(short, roundTo);
  const height = roundDimension((width * ah) / aw, roundTo);
  return { width, height, aspect: a, resolution_short: short };
}

export function normalizeGenSettings(raw, base = {}) {
  const aspect = clampGenAspect(raw?.gen_aspect ?? raw?.aspect ?? base.gen_aspect ?? base.aspect);
  const random_seed = raw?.random_seed != null ? !!raw.random_seed : base.random_seed != null ? !!base.random_seed : true;
  if (isCustomResolution(raw?.resolution_short)) {
    const width = roundDimension(raw?.width ?? base.width);
    const height = roundDimension(raw?.height ?? base.height);
    return { gen_aspect: aspect, resolution_short: GEN_RESOLUTION_CUSTOM, random_seed, width, height };
  }
  let resolution_short;
  if (raw?.resolution_short != null) {
    resolution_short = presetShort(raw.resolution_short);
  } else if (raw?.width != null || raw?.height != null) {
    resolution_short = inferResolutionShort(
      aspect,
      raw?.width ?? base.width,
      raw?.height ?? base.height,
    );
  } else {
    resolution_short = presetShort(base.resolution_short);
  }
  const { width, height } = dimensionsFromGenSettings(aspect, resolution_short);
  return { gen_aspect: aspect, resolution_short, random_seed, width, height };
}

export function genSettingsModalPatch(current, form) {
  const cur = normalizeGenSettings(current || {});
  const next = normalizeGenSettings({ ...cur, ...form });
  const patch = {};
  for (const key of GEN_SETTINGS_KEYS) {
    if (next[key] !== cur[key]) patch[key] = next[key];
  }
  if (next.width !== cur.width || next.height !== cur.height) {
    patch.width = next.width;
    patch.height = next.height;
    patch.aspect = next.gen_aspect;
  }
  return Object.keys(patch).length ? patch : null;
}

export function randomSeedFromProjectSettings(settings, localStorage) {
  if (settings && typeof settings === "object" && "random_seed" in settings) {
    return !!settings.random_seed;
  }
  const v = localStorage?.getItem?.("gonggan-cut.randomSeed");
  if (v === "0") return false;
  return true;
}
