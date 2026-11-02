/**
 * Take labels and scene colors (pure, no DOM).
 * A Take is one generated output of a cut. Scene colors come from a fixed palette
 * so the same scene id keeps the same color after a reload.
 */

/** Hues far enough apart to tell neighboring scenes apart on a dark timeline. */
export const SCENE_HUES = [12, 36, 58, 84, 114, 146, 174, 200, 224, 252, 278, 306, 334];

export function sceneHue(id) {
  const s = String(id || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return SCENE_HUES[(h >>> 0) % SCENE_HUES.length];
}

/** UI noun for one generated output. Korean projects say 테이크. */
export function takeNoun(captionLang) {
  return captionLang === "Korean" ? "테이크" : "Take";
}

export function takesNoun(captionLang) {
  return captionLang === "Korean" ? "테이크" : "Takes";
}

export function loadTakeWorkflowLabel(captionLang) {
  return captionLang === "Korean" ? "이 테이크의 워크플로 불러오기" : "Load workflow from this take";
}

function numOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * One Take record from a server version `gen` and an older I9 snapshot.
 * Missing workflow stays null. Nothing is deleted from either source.
 * @param {object | null | undefined} gen
 * @param {object | null | undefined} snap
 */
export function mergeLegacyTake(gen, snap) {
  const g = gen && typeof gen === "object" ? gen : {};
  const s = snap && typeof snap === "object" ? snap : {};
  const positive = g.prompt ?? g.positive ?? s.positive ?? s.prompt ?? "";
  const negative = g.negative ?? s.negative ?? "";
  const input = g.input_image ?? s.input_image ?? s.inputImage ?? "";
  const fromList = Array.isArray(g.input_images) ? g.input_images : (Array.isArray(s.input_images) ? s.input_images : []);
  const inputImages = fromList.map((x) => String(x || "")).filter(Boolean);
  if (input && !inputImages.includes(String(input))) inputImages.unshift(String(input));
  const workflow = isGraph(g.workflow) ? g.workflow : (isGraph(s.workflow) ? s.workflow : null);
  const numerics = {
    ...(s.numerics && typeof s.numerics === "object" ? s.numerics : {}),
    ...(g.numerics && typeof g.numerics === "object" ? g.numerics : {}),
  };
  return {
    positive: positive == null ? "" : String(positive),
    negative: negative == null ? "" : String(negative),
    seed: numOrNull(g.seed ?? s.seed),
    steps: numOrNull(g.steps ?? s.steps),
    cfg: numOrNull(g.cfg ?? s.cfg),
    frames: numOrNull(g.frames ?? s.frames),
    numerics,
    inputImage: input ? String(input) : (inputImages[0] || ""),
    inputImages,
    workflow,
    sourceImageTake: String(g.source_image_take || s.source_image_take || ""),
    hasWorkflow: !!(workflow || g.has_workflow || s.has_workflow),
  };
}

function isGraph(wf) {
  if (!wf || typeof wf !== "object") return false;
  if (Array.isArray(wf.nodes)) return true;
  return Object.values(wf).some((n) => n && typeof n === "object" && n.class_type);
}
