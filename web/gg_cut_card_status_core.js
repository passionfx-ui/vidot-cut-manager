/** Cut card / timeline clip render badge: ComfyUI queue, Generate All batch, SDK regen job, Comfy progress. */

import { cutProgressStatusView } from "./gg_progress_core.js";
import { generateAllCutView } from "./gg_generate_all_core.js";
import { sdkCutStatusView } from "./gg_native_regen_core.js";

/**
 * Same decision order as Shots `cutRenderView` (Queue / Make Video / Comfy queue on canvas).
 * @param {{
 *   projectId?: string,
 *   cutId?: string,
 *   comfyCutView?: object|null,
 *   generateAllBatch?: object|null,
 *   regenJob?: object|null,
 *   sdkBusyCutId?: string|null,
 *   progressCut?: object|null,
 * }} ctx
 */
export function cutCardRenderView(ctx = {}) {
  const { projectId, cutId } = ctx;
  if (ctx.comfyCutView) return ctx.comfyCutView;
  const ga = generateAllCutView(ctx.generateAllBatch, projectId, cutId);
  if (ga) return ga;
  if (sdkCutStatusView(ctx.regenJob, { projectId, cutId })) {
    return {
      state: "rendering",
      percent: null,
      count: 1,
      position: null,
      source: "sdk",
    };
  }
  if (ctx.sdkBusyCutId && projectId && cutId && String(ctx.sdkBusyCutId) === String(cutId)) {
    return {
      state: "queued",
      percent: null,
      count: 1,
      position: null,
      source: "sdk",
    };
  }
  const prog = cutProgressStatusView(ctx.progressCut || null);
  if (prog) {
    if (prog.mode === "queued") {
      return { state: "queued", percent: null, count: 1, position: null, source: "sdk" };
    }
    if (prog.mode === "rendering") {
      const pct = ctx.progressCut?.percent;
      return {
        state: "rendering",
        percent: Number.isFinite(pct) ? pct : null,
        count: 1,
        position: null,
        source: "sdk",
      };
    }
  }
  return null;
}

/**
 * Visible status word on `.gg-cut-idle` (E2E reads this while the job runs).
 * @param {{ hasMedia?: boolean, badge?: { show?: boolean, text?: string } }} s
 */
export function cutCardIdleWord(s = {}) {
  if (s.badge?.show && s.badge.text) return { text: s.badge.text, title: s.badge.title || s.badge.text };
  const hasMedia = !!s.hasMedia;
  return hasMedia
    ? { text: "Done", title: "Not queued or rendering; the cut has a version" }
    : { text: "Idle", title: "Not queued or rendering; no versions yet" };
}
