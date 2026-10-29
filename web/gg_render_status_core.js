/**
 * Render status per cut (pure logic, no DOM): which cut's prompt is waiting in the ComfyUI queue
 * ('queued') or executing ('rendering', optional percent from progress events).
 * Prompts are linked to cuts when queued; prompts without a cut in the shown project count toward
 * the global indicator. Finished prompts (success / error / interrupted, or gone from the queue) are dropped.
 */

import { gongganExtraProjectId } from "./gg_shot_names.js";

const FINISHED_KEEP = 200;

/**
 * Which cut a prompt queued now belongs to: the queued graph's `extra.gonggan` stamp wins, else the
 * cut loaded in the active shot tab.
 * @param {{ graphExtra?: object | null, loadedCutId?: string, currentProjectId?: string, shotTabActive?: boolean }} s
 * @returns {{ cutId: string, projectId: string } | null}
 */
export function promptCutTarget(s = {}) {
  const g = s.graphExtra;
  const gp = gongganExtraProjectId(g);
  if (g?.cutId && gp) return { cutId: String(g.cutId), projectId: gp };
  if (s.shotTabActive && s.loadedCutId && s.currentProjectId) {
    return { cutId: String(s.loadedCutId), projectId: String(s.currentProjectId) };
  }
  return null;
}

function queueIds(list) {
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (Array.isArray(entry) && entry[1] != null) out.push(String(entry[1]));
  }
  return out;
}

/** Pending prompt ids in run order (ComfyUI runs the lowest queue number first). */
function pendingOrder(list) {
  const rows = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (Array.isArray(entry) && entry[1] != null) rows.push({ n: Number(entry[0]), id: String(entry[1]) });
  }
  rows.sort((a, b) => (Number.isFinite(a.n) ? a.n : Infinity) - (Number.isFinite(b.n) ? b.n : Infinity));
  return rows.map((r) => r.id);
}

function percentOf(value, max) {
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((v / m) * 100)));
}

/** @param {{ graceMs?: number }} [opts] graceMs: a just-queued prompt missing from a /queue reply is kept this long. */
export function createRenderStatus(opts = {}) {
  const graceMs = Number.isFinite(opts.graceMs) ? opts.graceMs : 2000;
  /** @type {Map<string, { cutId: string, projectId: string }>} */
  const links = new Map();
  /** @type {Map<string, { state: 'queued'|'rendering', percent: number|null, node: string|null, at: number }>} */
  const jobs = new Map();
  /** @type {Set<string>} */
  const finished = new Set();
  /** Pending order from the last /queue reply (positions are unknown until then). */
  let pending = [];

  /** 1-based place among still-queued prompts, or null when not known. */
  function positionOf(promptId) {
    let pos = 0;
    for (const id of pending) {
      if (jobs.get(id)?.state !== "queued") continue;
      pos++;
      if (id === promptId) return pos;
    }
    return null;
  }

  function cutOf(promptId) {
    return links.get(promptId)?.cutId || null;
  }

  function touched(ids) {
    const out = new Set();
    for (const id of ids) {
      const c = cutOf(id);
      if (c) out.add(c);
    }
    return [...out];
  }

  function markFinished(promptId) {
    finished.add(promptId);
    if (finished.size > FINISHED_KEEP) finished.delete(finished.values().next().value);
  }

  function drop(promptId, done) {
    if (done) markFinished(promptId);
    return jobs.delete(promptId);
  }

  function runningId() {
    for (const [id, j] of jobs) if (j.state === "rendering") return id;
    return null;
  }

  /** Only one prompt executes at a time: starting `promptId` ends any other 'rendering' prompt. */
  function setRendering(promptId, now) {
    const changed = [promptId];
    for (const [id, j] of jobs) {
      if (id !== promptId && j.state === "rendering") {
        drop(id, true);
        changed.push(id);
      }
    }
    const j = jobs.get(promptId);
    if (j) {
      if (j.state !== "rendering") {
        j.state = "rendering";
        j.percent = null;
        j.node = null;
      }
    } else {
      jobs.set(promptId, { state: "rendering", percent: null, node: null, at: now });
    }
    return changed;
  }

  /** Remember which cut a prompt belongs to (no state change by itself). */
  function link(promptId, cutId, projectId) {
    if (promptId == null || !cutId || !projectId) return [];
    const id = String(promptId);
    links.set(id, { cutId: String(cutId), projectId: String(projectId) });
    return jobs.has(id) ? touched([id]) : [];
  }

  /** A prompt was accepted by the server (queuePrompt reply). */
  function queued(promptId, target, now = Date.now()) {
    if (promptId == null) return [];
    const id = String(promptId);
    if (target?.cutId && target?.projectId) link(id, target.cutId, target.projectId);
    if (finished.has(id) || jobs.has(id)) return touched([id]);
    jobs.set(id, { state: "queued", percent: null, node: null, at: now });
    return touched([id]);
  }

  /**
   * One ComfyUI api event. Returns cut ids whose view may have changed (global view: re-read always).
   * @param {string} type
   * @param {any} detail
   */
  function handle(type, detail, now = Date.now()) {
    const pidOf = (d) => (d && typeof d === "object" && d.prompt_id != null ? String(d.prompt_id) : null);
    switch (type) {
      case "status": {
        const rem = detail?.exec_info?.queue_remaining;
        if (rem !== 0) return [];
        const ids = [...jobs.keys()];
        for (const id of ids) drop(id, true);
        return touched(ids);
      }
      case "execution_start": {
        const id = pidOf(detail);
        return id ? touched(setRendering(id, now)) : [];
      }
      case "executing": {
        const node = typeof detail === "string" ? detail : detail?.node;
        const id = pidOf(detail) || runningId();
        if (!id || node == null) return [];
        const changed = setRendering(id, now);
        const j = jobs.get(id);
        if (j.node !== String(node)) {
          j.node = String(node);
          j.percent = null;
        }
        return touched(changed);
      }
      case "progress": {
        const id = pidOf(detail) || runningId();
        if (!id) return [];
        const changed = setRendering(id, now);
        const j = jobs.get(id);
        j.percent = percentOf(detail?.value, detail?.max);
        if (detail?.node != null) j.node = String(detail.node);
        return touched(changed);
      }
      case "execution_success":
      case "execution_error":
      case "execution_interrupted": {
        const id = pidOf(detail) || runningId();
        if (!id) return [];
        drop(id, true);
        return touched([id]);
      }
      default:
        return [];
    }
  }

  /** /queue reply: running/pending prompts get their state; tracked prompts no longer listed are dropped. */
  function syncQueue(queueJson, now = Date.now()) {
    const running = new Set(queueIds(queueJson?.queue_running));
    const order = pendingOrder(queueJson?.queue_pending);
    const waiting = new Set(order);
    const changed = [];
    for (const [id, j] of [...jobs]) {
      if (running.has(id) || waiting.has(id)) continue;
      if (j.state === "queued" && now - j.at < graceMs) continue;
      drop(id, true);
      changed.push(id);
    }
    for (const id of running) {
      if (jobs.get(id)?.state !== "rendering") {
        jobs.set(id, { state: "rendering", percent: null, node: null, at: now });
        changed.push(id);
      }
    }
    const prevOrder = pending.join("\n");
    pending = order;
    for (const id of order) {
      if (!jobs.has(id)) {
        jobs.set(id, { state: "queued", percent: null, node: null, at: now });
        changed.push(id);
      } else if (prevOrder !== order.join("\n")) {
        changed.push(id);
      }
    }
    return touched(changed);
  }

  /**
   * position: 1-based queue place of the cut's earliest waiting prompt (queued only, null when unknown).
   * @returns {{ state: 'queued'|'rendering', percent: number|null, count: number, position: number|null } | null}
   */
  function cutView(projectId, cutId) {
    if (!projectId || !cutId) return null;
    let best = null;
    let count = 0;
    let position = null;
    for (const [id, j] of jobs) {
      const l = links.get(id);
      if (!l || l.cutId !== String(cutId) || l.projectId !== String(projectId)) continue;
      count++;
      if (!best || (j.state === "rendering" && best.state !== "rendering")) best = j;
      const p = j.state === "queued" ? positionOf(id) : null;
      if (p != null && (position == null || p < position)) position = p;
    }
    if (!best) return null;
    const rendering = best.state === "rendering";
    return { state: best.state, percent: rendering ? best.percent : null, count, position: rendering ? null : position };
  }

  /**
   * Prompts not linked to a cut of `projectId` (unknown, or another project's cut).
   * @returns {{ state: 'queued'|'rendering'|null, rendering: number, queued: number }}
   */
  function globalView(projectId) {
    let rendering = 0;
    let queuedN = 0;
    for (const [id, j] of jobs) {
      const l = links.get(id);
      if (l && projectId && l.projectId === String(projectId)) continue;
      if (j.state === "rendering") rendering++;
      else queuedN++;
    }
    return { state: rendering ? "rendering" : queuedN ? "queued" : null, rendering, queued: queuedN };
  }

  return { link, queued, handle, syncQueue, cutView, globalView };
}

/** Badge text for a cut view (null = hidden). `pos` (`#N`) is the queue place, shown only on cut cards. */
export function renderBadgeView(v) {
  if (!v) return { show: false, mode: "", text: "", pos: "", title: "" };
  if (v.state === "rendering") {
    const pct = Number.isFinite(v.percent) ? ` ${v.percent}%` : "";
    return { show: true, mode: "rendering", text: `Rendering${pct}`, pos: "", title: `Rendering in ComfyUI${pct}` };
  }
  const more = v.count > 1 ? ` (${v.count} prompts)` : "";
  const at = Number.isFinite(v.position) && v.position > 0 ? v.position : null;
  return {
    show: true,
    mode: "queued",
    text: "Queued",
    pos: at ? `#${at}` : "",
    title: `Waiting in the ComfyUI queue${at ? `, position ${at}` : ""}${more}`,
  };
}

/** Cut card status word when nothing is queued or rendering for the cut. */
export function idleStateView(hasMedia) {
  return hasMedia
    ? { text: "Done", title: "Not queued or rendering; the cut has a version" }
    : { text: "Idle", title: "Not queued or rendering; no versions yet" };
}

/** Sidebar header indicator for prompts not tied to a cut in the shown project. */
export function renderGlobalView(g) {
  if (!g || !g.state) return { show: false, mode: "", text: "", title: "" };
  const parts = [];
  if (g.rendering) parts.push(`${g.rendering} rendering`);
  if (g.queued) parts.push(`${g.queued} queued`);
  const title = `Not from a cut in this project: ${parts.join(", ")}`;
  if (g.state === "rendering") return { show: true, mode: "rendering", text: "Rendering\u2026", title };
  return { show: true, mode: "queued", text: "Queued", title };
}
