/** Pure decisions for Queue on the selected cuts (no DOM): queue order, empty-cut skips, modal and toast text. */

import { isRegenEmptyCut } from "./gg_native_regen_core.js";

/** Empty title when Queue is off because nothing is selected (0.9.120: no tooltip). */
export const QUEUE_EMPTY_TIP = "";
export const QUEUE_NATIVE_TIP = "Native projects only";
export const QUEUE_BUSY_TIP = "Busy, try again in a moment";
export const QUEUE_NO_PROJECT_TIP = "No project open";
export const RANDOM_SEED_LS_KEY = "gonggan-cut.randomSeed";
export const RANDOM_SEED_LABEL = "Random seed";
const LIST_MAX = 8;

/** Default on: each Queue run uses new sampler seeds when enabled. */
export function loadRandomSeedOn(localStorage) {
  const v = localStorage?.getItem?.(RANDOM_SEED_LS_KEY);
  if (v === "0") return false;
  return true;
}

export function saveRandomSeedOn(localStorage, on) {
  localStorage?.setItem?.(RANDOM_SEED_LS_KEY, on ? "1" : "0");
}

const cuts = (n) => `${n} cut${n === 1 ? "" : "s"}`;

/**
 * Selected cut ids in Shots display order; selected cuts not in the display (filtered out) follow in
 * timeline order. Unknown ids are dropped, duplicates kept once.
 * @param {string[]} displayOrder
 * @param {string[]} timelineOrder
 * @param {Iterable<string>} selected
 */
export function selectedInDisplayOrder(displayOrder, timelineOrder, selected) {
  const sel = new Set(selected || []);
  const seen = new Set();
  const out = [];
  for (const list of [displayOrder, timelineOrder]) {
    for (const id of Array.isArray(list) ? list : []) {
      if (!sel.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Split ordered cuts into the ones to queue and empty cuts (no versions, known zero-node graph) to skip.
 * Cuts with an unknown graph are queued candidates; the queue check after opening catches them.
 * @param {string[]} ids
 * @param {(id: string) => { versionCount?: number, nodeCount?: number | null } | null} info
 * @returns {{ queue: string[], skipped: string[] }}
 */
export function batchRenderPlan(ids, info) {
  const queue = [];
  const skipped = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const s = (typeof info === "function" && info(id)) || {};
    (isRegenEmptyCut(s) ? skipped : queue).push(id);
  }
  return { queue, skipped };
}

/** ComfyUI POST /queue body that deletes still-waiting prompts (duplicates and empty ids dropped). */
export function queueDeleteBody(promptIds) {
  return { delete: [...new Set((Array.isArray(promptIds) ? promptIds : []).filter((id) => id != null && id !== "").map(String))] };
}

/**
 * Status panel Queue button state (also Queue selected / Re-queue in the cut menu); off with no project or no selection.
 * While a generate-all batch runs for this project, Queue shows Stop.
 */
export function queueButtonState({
  count = 0,
  native = false,
  busy = false,
  hasProject = true,
  allRunning = false,
  batch = null,
  projectId = "",
} = {}) {
  const queue = { label: "Queue", mode: "queue" };
  if (!hasProject) return { ...queue, disabled: true, title: QUEUE_NO_PROJECT_TIP };
  if (allRunning && batch) {
    const mine = batch.pid === projectId;
    const stopping = !!batch.stop;
    if (mine) {
      return {
        label: "Stop",
        mode: "stop",
        disabled: stopping,
        title: stopping
          ? "Stopping after the cut that is generating now"
          : "Stop: cancel the cuts still waiting (the one generating now finishes)",
      };
    }
    return { ...queue, disabled: true, title: "Generate-all batch is running for another project" };
  }
  const title = !(count > 0) ? QUEUE_EMPTY_TIP : !native ? QUEUE_NATIVE_TIP : busy ? QUEUE_BUSY_TIP : `Queue ${cuts(count)} to ComfyUI`;
  return { ...queue, disabled: !(count > 0) || !native || !!busy, title };
}

/**
 * Confirm text: first line is the modal title (see splitConfirmMessage), then the cut labels.
 * @param {string[]} labels  labels of the cuts to queue, in order
 * @param {number} [skipped] empty cuts left out
 */
export function batchRenderConfirmMessage(labels, skipped = 0) {
  const list = Array.isArray(labels) ? labels : [];
  const lines = list.slice(0, LIST_MAX);
  if (list.length > LIST_MAX) lines.push(`\u2026 and ${list.length - LIST_MAX} more`);
  if (skipped > 0) lines.push("", `${skipped} skipped: no workflow`);
  const title = `Queue ${cuts(list.length)}?`;
  return lines.length ? `${title}\n\n${lines.join("\n")}` : title;
}

/**
 * Toast after the batch.
 * @param {{ queued?: number, skipped?: number, failed?: number, stopped?: boolean }} r
 *   skipped: no workflow; failed: could not open / blocked; stopped: the user switched cuts mid-batch
 * @returns {{ summary: string, detail: string, kind: "ok" | "warn" }}
 */
export function batchRenderSummary(r = {}) {
  const queued = r.queued || 0;
  const parts = [];
  if (r.skipped > 0) parts.push(`${r.skipped} skipped: no workflow`);
  if (r.failed > 0) parts.push(`${r.failed} not queued`);
  if (r.stopped) parts.push("stopped: another cut was opened");
  return {
    summary: queued ? `Queued ${cuts(queued)}` : "Nothing queued",
    detail: parts.length ? `(${parts.join(", ")})` : "",
    kind: queued && !(r.failed > 0) && !r.stopped ? "ok" : "warn",
  };
}
