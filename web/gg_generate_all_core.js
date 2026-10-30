/**
 * Generate All (pure, no DOM): every cut of a native project in Shots list order, one Comfy SDK job at a time
 * on the server (POST /gonggan/generate-all). The server batch snapshot drives the per-cut badges:
 * waiting -> generating -> done | failed | skipped (no workflow); Stop turns waiting into cancelled.
 */

/** Cut ids to generate: `displayedIds` (Shots list order) that are cuts of the timeline, each once. */
export function generateAllOrder(displayedIds, cuts) {
  const known = new Set((Array.isArray(cuts) ? cuts : []).map((c) => c?.id).filter(Boolean));
  const out = [];
  for (const id of Array.isArray(displayedIds) ? displayedIds : []) {
    if (known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function isGenerateAllRunning(batch) {
  return batch?.status === "running";
}

/**
 * Badge state of one cut from the batch (null = no badge). Done shows while the batch runs; Failed stays until
 * the next batch. Same shape as renderStatus.cutView so renderBadgeView can paint it.
 */
export function generateAllCutView(batch, projectId, cutId) {
  if (!batch || !Array.isArray(batch.items) || !projectId || batch.pid !== projectId) return null;
  const it = batch.items.find((x) => x.cut_id === cutId);
  if (!it) return null;
  const base = { percent: null, count: 0, position: null, source: "generate-all" };
  if (it.status === "waiting" || it.status === "generating") return { ...base, state: it.status };
  if (it.status === "done" && isGenerateAllRunning(batch)) return { ...base, state: "done" };
  if (it.status === "failed") return { ...base, state: "failed", error: it.error || "" };
  return null;
}

/** Counts of a batch snapshot. */
export function generateAllCounts(batch) {
  const c = { total: 0, waiting: 0, generating: 0, done: 0, failed: 0, skipped: 0, cancelled: 0 };
  for (const it of batch?.items || []) {
    c.total++;
    if (it.status in c) c[it.status]++;
  }
  return c;
}

/** "N / M done" text next to the Queue button while (and after) a batch runs; hidden with no batch. */
export function generateAllProgressView(batch, projectId) {
  if (!batch || batch.pid !== projectId || !(batch.items || []).length) return { show: false, text: "", title: "" };
  const c = generateAllCounts(batch);
  const todo = c.total - c.skipped - c.cancelled;
  const failed = c.failed ? `, ${c.failed} failed` : "";
  const running = isGenerateAllRunning(batch);
  return {
    show: running || c.failed > 0,
    text: `${c.done} / ${todo} done${failed}`,
    title: `Generate All${running ? " (running)" : ""}: ${c.done} of ${todo} cuts done${failed}` +
      `${c.skipped ? `, ${c.skipped} skipped (no workflow)` : ""}${c.cancelled ? `, ${c.cancelled} cancelled` : ""}`,
  };
}

/** What the Queue button does for a native project (0 selected = none; caller keeps the button disabled). */
export function queueClickAction({ native = false, selected = 0 } = {}) {
  if (!native || selected < 1) return "none";
  if (selected === 1) return "single";
  return "generate";
}

/** Confirm text for Generate All: title line, then the first cuts. */
export function generateAllConfirmMessage(titles) {
  const list = Array.isArray(titles) ? titles : [];
  const n = list.length;
  const lines = list.slice(0, 8).map((t, i) => `${i + 1}. ${t}`);
  if (n > 8) lines.push(`… and ${n - 8} more`);
  return `Generate all ${n} cut${n === 1 ? "" : "s"}?\n\nOne at a time through the Comfy SDK, in list order, each with its own workflow and saved seed. Every result is added as a new version. Cuts without a workflow are skipped. Stop cancels the cuts still waiting.\n\n${lines.join("\n")}`;
}

/** Toast when a batch ends (status done / stopped), else null. */
export function generateAllFinishedToast(batch) {
  if (!batch || (batch.status !== "done" && batch.status !== "stopped")) return null;
  const c = generateAllCounts(batch);
  const parts = [];
  if (c.failed) parts.push(`${c.failed} failed`);
  if (c.skipped) parts.push(`${c.skipped} skipped (no workflow)`);
  if (c.cancelled) parts.push(`${c.cancelled} cancelled`);
  const summary = batch.status === "stopped" ? "Generate All stopped" : "Generate All finished";
  return { summary, detail: [`${c.done} new version${c.done === 1 ? "" : "s"}`, ...parts].join(", "), kind: c.failed ? "warn" : "ok" };
}
