/** Common generation settings (aspect, short-side resolution, random seed). Pure, no DOM. */

export const GEN_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

export const GEN_SHORT_SIDE_OPTIONS = [512, 720, 1080];

export const GEN_SHORT_SIDE_LABELS = {
  512: "512 px (short side)",
  720: "720 px (short side)",
  1080: "1080 px (short side)",
};

export const GEN_SETTINGS_KEYS = ["gen_aspect", "resolution_short", "random_seed"];

export function clampGenAspect(value, fallback = "16:9") {
  const s = String(value ?? "").trim();
  return GEN_ASPECT_RATIOS.includes(s) ? s : fallback;
}

export function clampResolutionShort(value, fallback = 720) {
  const n = Math.round(Number(value));
  return GEN_SHORT_SIDE_OPTIONS.includes(n) ? n : fallback;
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
  const short = clampResolutionShort(shortSide);
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
  let resolution_short;
  if (raw?.resolution_short != null) {
    resolution_short = clampResolutionShort(raw.resolution_short);
  } else if (raw?.width != null || raw?.height != null) {
    resolution_short = inferResolutionShort(
      aspect,
      raw?.width ?? base.width,
      raw?.height ?? base.height,
    );
  } else {
    resolution_short = clampResolutionShort(base.resolution_short);
  }
  const random_seed = raw?.random_seed != null ? !!raw.random_seed : base.random_seed != null ? !!base.random_seed : true;
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
