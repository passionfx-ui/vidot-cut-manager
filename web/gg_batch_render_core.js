/** Pure decisions for Render on the selected cuts (no DOM): queue order, empty-cut skips, modal and toast text. */

import { isRegenEmptyCut } from "./gg_native_regen_core.js";

export const RENDER_EMPTY_TIP = "Select cuts to render";
export const RENDER_NATIVE_TIP = "Native projects only";
export const RENDER_BUSY_TIP = "Busy, try again in a moment";
const LIST_MAX = 8;

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

/** Bottom-bar Render button state. */
export function renderButtonState({ count = 0, native = false, busy = false } = {}) {
  const title = !(count > 0) ? RENDER_EMPTY_TIP : !native ? RENDER_NATIVE_TIP : busy ? RENDER_BUSY_TIP : `Queue ${cuts(count)} to ComfyUI`;
  return { disabled: !(count > 0) || !native || !!busy, title };
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
