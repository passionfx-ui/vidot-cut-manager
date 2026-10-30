/** Pure decisions for Regen on native projects: open the cut's current workflow, confirm, queue. No DOM. */

export const REGEN_CONFIRM_TITLE = "Queue this cut's workflow now?";

export const REGEN_SKIP_MESSAGE = {
  superseded: "The canvas changed while opening. Not queued.",
  "not-open": "Could not open this cut's workflow. Not queued.",
  empty: "This cut's workflow is empty. Not queued.",
};

/** @param {string} [label] cut title shown under the question */
export function regenConfirmMessage(label) {
  return label ? `${REGEN_CONFIRM_TITLE}\n\n${label}` : REGEN_CONFIRM_TITLE;
}

/** What an older server (ComfyUI not restarted) answers to a native POST /gonggan/regen. */
const OLD_SERVER_MESSAGE = "Not available for native projects yet";

/** Error text for a failed native SDK Regen / Queue request. */
export function sdkRegenErrorMessage(message) {
  const m = String(message || "").trim();
  if (m === OLD_SERVER_MESSAGE) return "Restart ComfyUI to generate through the Comfy SDK.";
  return m || "unknown error";
}

const SOURCE_LABEL = {
  embedded: "current version",
  stored: "saved workflow",
  template: "project template",
  history: "last run",
  canvas: "open tab",
  converted: "saved workflow (converted)",
  image_to_video: "Video template",
};

export const I2V_CONFIRM_TITLE = "Make a video from this cut's image now?";

/**
 * Confirm text for Image to Video: what runs (template, start image node and version, frames, seed, prompt).
 * @param {string} label cut title
 * @param {{ template?: string, start_node?: string, start_version?: string, frames?: number, seed?: number, prompt?: string }} plan
 *   the /gonggan/image-to-video dry-run plan
 */
export function i2vConfirmMessage(label, plan = {}) {
  const prompt = String(plan.prompt || "");
  const lines = [
    `Template: ${plan.template || "Video template"}`,
    `Start image: version ${String(plan.start_version || "?").slice(0, 8)} into node ${plan.start_node || "?"}`,
    `Frames: ${plan.frames ?? "as saved"}${plan.seed != null ? ` · new seed ${plan.seed}` : ""}`,
    `Prompt: ${prompt.length > 160 ? `${prompt.slice(0, 160)}…` : prompt}`,
  ];
  return `${I2V_CONFIRM_TITLE}\n\n${label ? `${label}\n` : ""}${lines.join("\n")}\n\nThe result is added as a new version of this cut.`;
}

/** Error text for a failed Image to Video request; a missing route means ComfyUI was not restarted. */
export function i2vErrorMessage(err) {
  if (err?.status === 404 || err?.status === 405) return "Restart ComfyUI to use Image to Video.";
  return sdkRegenErrorMessage(err?.message || err);
}

/** Status line after the dry run: which workflow and seed will run. */
export function sdkPlanSummary(plan = {}) {
  const parts = [`${plan.nodes || 0} nodes`, SOURCE_LABEL[plan.source] || plan.source || "workflow"];
  const seeds = Object.values(plan.seeds || {});
  if (seeds.length) parts.push(`${plan.new_seed ? "new seed" : "seed"} ${seeds[0]}${seeds.length > 1 ? ` (+${seeds.length - 1})` : ""}`);
  else parts.push("no sampler seed");
  return `${parts.join(" · ")} · via Comfy SDK`;
}

/**
 * Toast for a `gonggan.regen` event of a native SDK job; null while it is running or for legacy jobs.
 * @param {{ native?: boolean, batch?: string, status?: string, error?: string }} job  Generate All jobs (`batch`) get no per-cut toast
 * @param {string} [cutText] cut label shown in the toast
 */
export function sdkJobToast(job = {}, cutText = "") {
  if (!job.native || job.batch) return null;
  if (job.status === "done") return { summary: "New version added", detail: cutText, kind: "ok" };
  if (job.status === "error") return { summary: "SDK job failed", detail: [cutText, job.error].filter(Boolean).join(" — "), kind: "warn" };
  return null;
}

/**
 * Node count to judge an empty cut by: the live graph when the cut is open, else the count seen
 * when it was last opened or left; null when unknown.
 * @param {{ live?: number | null, remembered?: number | null }} s
 * @returns {number | null}
 */
export function regenKnownNodeCount(s = {}) {
  if (Number.isFinite(s.live)) return s.live;
  if (Number.isFinite(s.remembered)) return s.remembered;
  return null;
}

/**
 * Empty cut = no versions and its graph is known to have zero nodes (unknown counts as not empty;
 * the queue check catches it after opening).
 * @param {{ versionCount?: number, nodeCount?: number | null }} s
 */
export function isRegenEmptyCut(s = {}) {
  return !(Number(s.versionCount) > 0) && s.nodeCount === 0;
}

/**
 * After the cut-open finished (and again after the confirm): may the open graph be queued for this cut?
 * @param {{ token?: number, currentToken?: number, cutId?: string, projectId?: string,
 *   loadedCutId?: string, loadedProjectId?: string, graphCutId?: string, graphProjectId?: string,
 *   tabActive?: boolean, nodeCount?: number }} s
 * @returns {{ ok: true } | { ok: false, reason: "superseded" | "not-open" | "empty" }}
 */
export function nativeRegenQueueCheck(s = {}) {
  if (s.token !== s.currentToken) return { ok: false, reason: "superseded" };
  const open =
    !!s.cutId &&
    !!s.projectId &&
    !!s.tabActive &&
    s.loadedCutId === s.cutId &&
    s.loadedProjectId === s.projectId &&
    s.graphCutId === s.cutId &&
    (!s.graphProjectId || s.graphProjectId === s.projectId);
  if (!open) return { ok: false, reason: "not-open" };
  if (!(Number(s.nodeCount) > 0)) return { ok: false, reason: "empty" };
  return { ok: true };
}
