/**
 * Per-prompt execution progress tracker (pure logic, no DOM).
 *
 * Runner event contract: subscribers receive standard event objects:
 *   { promptId, cutId, projectId, state, percent, node, queuePos, error, ts }
 *   state: 'queued' | 'running' | 'done' | 'failed' | 'interrupted'
 * A future Comfy Cloud runner must emit the same objects (feed them via tracker.emit(evt)).
 */

/** @typedef {'queued'|'running'|'done'|'failed'|'interrupted'} ProgressState */

/**
 * @typedef {Object} ProgressEvent
 * @property {string} promptId
 * @property {string|null} cutId
 * @property {string|null} projectId
 * @property {ProgressState} state
 * @property {number|null} percent
 * @property {string|null} node
 * @property {number|null} queuePos
 * @property {string|null} error
 * @property {number} ts
 */

function cutKey(projectId, cutId) {
  return `${projectId}\0${cutId}`;
}

function promptGraphNodes(graph) {
  if (!graph || typeof graph !== "object") return [];
  return Object.keys(graph).filter((k) => graph[k] && typeof graph[k] === "object");
}

function nodeLabel(graph, nodeId) {
  if (!graph || !nodeId) return null;
  const n = graph[nodeId];
  if (!n || typeof n !== "object") return String(nodeId);
  return n._meta?.title || n.class_type || String(nodeId);
}

function parseQueueItem(entry) {
  if (!Array.isArray(entry) || entry.length < 3) return null;
  return {
    num: entry[0],
    promptId: String(entry[1]),
    graph: entry[2] && typeof entry[2] === "object" ? entry[2] : null,
    outputsToExecute: Array.isArray(entry[4]) ? entry[4] : null,
  };
}

function clampPercent(p) {
  if (p == null || !Number.isFinite(p)) return null;
  return Math.max(0, Math.min(100, p));
}

/**
 * @param {object|null|undefined} cut
 * @returns {{ image: boolean, video: boolean, best: boolean, stage: 'empty'|'image'|'video'|'done' }}
 */
export function cutStage(cut) {
  let image = false;
  let video = false;
  const list = cut?.versions_list;
  if (Array.isArray(list)) {
    for (const v of list) {
      if (!v || typeof v !== "object") continue;
      const k = v.kind;
      if (k === "image") image = true;
      else if (k === "video") video = true;
    }
  }
  if (!image && !video && cut?.media && typeof cut.media === "object") {
    const mk = cut.media.kind;
    if (mk === "image") image = true;
    else if (mk === "video") video = true;
  }

  const pick = cut?.pick;
  let best = false;
  if (pick != null && pick !== "") {
    if (Array.isArray(list)) {
      for (const v of list) {
        if (v && v.id === pick) {
          best = true;
          break;
        }
      }
    }
    if (!best && cut?.media?.id === pick) best = true;
  }

  let stage = "empty";
  if (best) stage = "done";
  else if (video) stage = "video";
  else if (image) stage = "image";
  return { image, video, best, stage };
}

/**
 * @param {object[]|null|undefined} cuts Visible timeline cuts (hidden already excluded).
 */
export function projectSummary(cuts) {
  const arr = Array.isArray(cuts) ? cuts : [];
  let image = 0;
  let video = 0;
  let done = 0;
  for (const c of arr) {
    const s = cutStage(c);
    if (s.image) image++;
    if (s.video) video++;
    if (s.best) done++;
  }
  return { total: arr.length, image, video, done };
}

/** @param {{ total?: number, image?: number, video?: number, done?: number }} s */
export function formatSummary(s) {
  const t = s?.total ?? 0;
  const d = s?.done ?? 0;
  const v = s?.video ?? 0;
  const i = s?.image ?? 0;
  return `Done ${d}/${t} · Video ${v}/${t} · Image ${i}/${t}`;
}

export function createProgressTracker() {
  /** @type {Set<(evt: ProgressEvent) => void>} */
  const listeners = new Set();
  /** @type {Map<string, object>} */
  const byPrompt = new Map();
  /** @type {Map<string, ProgressEvent>} */
  const byCut = new Map();
  let otherRunning = 0;
  let otherPending = 0;

  function ensurePrompt(promptId) {
    let p = byPrompt.get(promptId);
    if (!p) {
      p = {
        promptId,
        cutId: null,
        projectId: null,
        state: "queued",
        queuePos: null,
        percent: null,
        node: null,
        error: null,
        graph: null,
        cached: new Set(),
        executed: new Set(),
        currentNode: null,
        currentValue: 0,
        currentMax: 1,
        maxPercent: 0,
      };
      byPrompt.set(promptId, p);
    }
    return p;
  }

  function effectiveTotalNodes(p) {
    const all = promptGraphNodes(p.graph);
    if (!all.length) return 0;
    let n = 0;
    for (const id of all) {
      if (!p.cached.has(id)) n++;
    }
    return n;
  }

  function computePercent(p) {
    const total = effectiveTotalNodes(p);
    if (total > 0) {
      let curFrac = 0;
      if (p.currentNode && !p.executed.has(p.currentNode) && !p.cached.has(p.currentNode)) {
        const max = Math.max(1, p.currentMax || 1);
        curFrac = Math.min(1, (p.currentValue || 0) / max);
      }
      const finished = [...p.executed].filter((id) => !p.cached.has(id)).length;
      const raw = ((finished + curFrac) / total) * 100;
      return clampPercent(raw);
    }
    if (p.currentMax > 0) {
      return clampPercent(((p.currentValue || 0) / Math.max(1, p.currentMax)) * 100);
    }
    return p.maxPercent > 0 ? p.maxPercent : null;
  }

  function applyMonotonicPercent(p, next) {
    if (next == null) return p.maxPercent || null;
    if (p.state === "done") return 100;
    const v = clampPercent(next);
    if (v == null) return p.maxPercent || null;
    p.maxPercent = Math.max(p.maxPercent || 0, v);
    if (p.state !== "done") return p.maxPercent;
    return 100;
  }

  function buildEvent(p) {
    /** @type {ProgressEvent} */
    const evt = {
      promptId: p.promptId,
      cutId: p.cutId,
      projectId: p.projectId,
      state: p.state,
      percent: p.state === "done" ? 100 : p.percent,
      node: p.node,
      queuePos: p.queuePos,
      error: p.error,
      ts: Date.now(),
    };
    return evt;
  }

  function deliver(p) {
    const evt = buildEvent(p);
    if (p.cutId != null && p.projectId != null) {
      byCut.set(cutKey(p.projectId, p.cutId), evt);
    }
    for (const fn of listeners) fn(evt);
  }

  function setGraph(p, graph) {
    if (graph && typeof graph === "object") p.graph = graph;
  }

  function registerPrompt(promptId, cutId, projectId) {
    const p = ensurePrompt(String(promptId));
    p.cutId = cutId != null ? String(cutId) : null;
    p.projectId = projectId != null ? String(projectId) : null;
    if (p.state === "queued" || p.state === "running") deliver(p);
    return buildEvent(p);
  }

  function handleExecutionStart(detail, promptId) {
    const pid = promptId || detail?.prompt_id;
    if (!pid) return;
    const p = ensurePrompt(String(pid));
    p.state = "running";
    p.queuePos = null;
    p.percent = applyMonotonicPercent(p, computePercent(p));
    deliver(p);
  }

  function handleExecutionCached(detail, promptId) {
    const pid = promptId || detail?.prompt_id;
    if (!pid) return;
    const p = ensurePrompt(String(pid));
    const nodes = detail?.nodes;
    if (Array.isArray(nodes)) {
      for (const id of nodes) p.cached.add(String(id));
    }
    p.percent = applyMonotonicPercent(p, computePercent(p));
    deliver(p);
  }

  function handleExecuting(detail) {
    let promptId = null;
    let node = null;
    if (detail == null) return;
    if (typeof detail === "string") {
      node = detail;
    } else if (typeof detail === "object") {
      promptId = detail.prompt_id;
      node = detail.node;
    }
    if (node === null || node === undefined) {
      if (promptId) {
        const p = ensurePrompt(String(promptId));
        p.currentNode = null;
        p.node = null;
        p.percent = applyMonotonicPercent(p, computePercent(p));
        deliver(p);
      }
      return;
    }
    const pid = promptId || (typeof detail === "object" ? detail.prompt_id : null);
    if (!pid && typeof detail === "string") {
      for (const p of byPrompt.values()) {
        if (p.state === "running") {
          p.currentNode = String(node);
          p.node = nodeLabel(p.graph, p.currentNode);
          p.percent = applyMonotonicPercent(p, computePercent(p));
          deliver(p);
        }
      }
      return;
    }
    if (!pid) return;
    const p = ensurePrompt(String(pid));
    p.state = "running";
    p.currentNode = String(node);
    p.node = nodeLabel(p.graph, p.currentNode);
    p.percent = applyMonotonicPercent(p, computePercent(p));
    deliver(p);
  }

  function handleProgress(detail) {
    if (!detail || typeof detail !== "object") return;
    const pid = detail.prompt_id;
    if (!pid) return;
    const p = ensurePrompt(String(pid));
    p.state = "running";
    if (detail.node != null) {
      p.currentNode = String(detail.node);
      p.node = nodeLabel(p.graph, p.currentNode);
    }
    if (detail.max != null) p.currentMax = Math.max(1, Number(detail.max) || 1);
    if (detail.value != null) p.currentValue = Number(detail.value) || 0;
    p.percent = applyMonotonicPercent(p, computePercent(p));
    deliver(p);
  }

  function handleProgressState(detail) {
    if (!detail || typeof detail !== "object") return;
    const pid = detail.prompt_id;
    if (!pid) return;
    const p = ensurePrompt(String(pid));
    p.state = "running";
    const nodes = detail.nodes;
    if (nodes && typeof nodes === "object") {
      let pick = null;
      for (const [nid, st] of Object.entries(nodes)) {
        if (st && typeof st === "object" && st.state === "running") {
          pick = { id: nid, value: st.value, max: st.max };
          break;
        }
      }
      if (pick) {
        p.currentNode = pick.id;
        p.node = nodeLabel(p.graph, pick.id);
        if (pick.max != null) p.currentMax = Math.max(1, Number(pick.max) || 1);
        if (pick.value != null) p.currentValue = Number(pick.value) || 0;
      }
    }
    p.percent = applyMonotonicPercent(p, computePercent(p));
    deliver(p);
  }

  function handleExecuted(detail) {
    if (!detail || typeof detail !== "object") return;
    const pid = detail.prompt_id;
    const node = detail.node;
    if (!pid || node == null) return;
    const p = ensurePrompt(String(pid));
    p.executed.add(String(node));
    if (p.currentNode === String(node)) {
      p.currentValue = p.currentMax;
    }
    p.percent = applyMonotonicPercent(p, computePercent(p));
    deliver(p);
  }

  function handleTerminal(promptId, state, error) {
    if (!promptId) return;
    const p = ensurePrompt(String(promptId));
    p.state = state;
    p.error = error || null;
    p.queuePos = null;
    p.node = state === "failed" ? p.node : null;
    if (state === "done") {
      p.maxPercent = 100;
      p.percent = 100;
    } else {
      p.percent = applyMonotonicPercent(p, computePercent(p));
    }
    deliver(p);
  }

  function handleEvent(type, detail) {
    switch (type) {
      case "status":
        break;
      case "execution_start":
        handleExecutionStart(detail, detail?.prompt_id);
        break;
      case "execution_cached":
        handleExecutionCached(detail, detail?.prompt_id);
        break;
      case "executing":
        handleExecuting(detail);
        break;
      case "progress":
        handleProgress(detail);
        break;
      case "progress_state":
        handleProgressState(detail);
        break;
      case "executed":
        handleExecuted(detail);
        break;
      case "execution_success":
        handleTerminal(detail?.prompt_id, "done", null);
        break;
      case "execution_error": {
        const msg =
          detail?.exception_message ||
          detail?.message ||
          (typeof detail === "string" ? detail : "Execution error");
        handleTerminal(detail?.prompt_id, "failed", String(msg));
        break;
      }
      case "execution_interrupted":
        handleTerminal(detail?.prompt_id, "interrupted", detail?.message || "Interrupted");
        break;
      default:
        break;
    }
  }

  function syncQueue(queueJson) {
    const running = Array.isArray(queueJson?.queue_running) ? queueJson.queue_running : [];
    const pending = Array.isArray(queueJson?.queue_pending) ? queueJson.queue_pending : [];
    const order = [];
    for (const entry of running) {
      const it = parseQueueItem(entry);
      if (it) order.push({ ...it, running: true });
    }
    for (const entry of pending) {
      const it = parseQueueItem(entry);
      if (it) order.push({ ...it, running: false });
    }

    let pos = 0;
    otherRunning = 0;
    otherPending = 0;
    const seen = new Set();

    for (const it of order) {
      pos++;
      seen.add(it.promptId);
      const linked = byPrompt.get(it.promptId);
      if (!linked || linked.cutId == null || linked.projectId == null) {
        if (it.running) otherRunning++;
        else otherPending++;
        continue;
      }
      const p = ensurePrompt(it.promptId);
      setGraph(p, it.graph);
      if (it.outputsToExecute) {
        for (const id of it.outputsToExecute) p.executed.delete(String(id));
      }
      p.state = it.running ? "running" : "queued";
      p.queuePos = pos;
      p.percent = applyMonotonicPercent(p, computePercent(p));
      deliver(p);
    }

    for (const p of byPrompt.values()) {
      if (seen.has(p.promptId)) continue;
      if (p.state === "queued" || p.state === "running") {
        if (p.cutId != null && p.projectId != null) {
          p.queuePos = null;
          deliver(p);
        }
      }
    }

    return { otherRunning, otherPending };
  }

  function syncHistory(historyJson) {
    if (!historyJson || typeof historyJson !== "object") return;
    for (const [promptId, rec] of Object.entries(historyJson)) {
      const p = byPrompt.get(String(promptId));
      if (!p || p.cutId == null || p.projectId == null) continue;
      const st = rec?.status;
      if (!st) continue;
      if (st.status_str === "success" || st.completed === true) {
        if (p.state !== "done") handleTerminal(promptId, "done", null);
      } else if (st.status_str === "error") {
        let err = "Error";
        const msgs = st.messages;
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            if (Array.isArray(m) && m[0] === "execution_error" && m[1]) {
              err = m[1].exception_message || m[1].message || err;
              break;
            }
          }
        }
        if (p.state !== "failed") handleTerminal(promptId, "failed", err);
      }
      const promptArr = rec?.prompt;
      if (Array.isArray(promptArr) && promptArr[2]) setGraph(p, promptArr[2]);
    }
  }

  function on(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getCutStatus(projectId, cutId) {
    if (cutId == null) return null;
    if (projectId == null) {
      for (const [k, evt] of byCut) {
        if (k.endsWith(`\0${cutId}`)) return evt;
      }
      return null;
    }
    return byCut.get(cutKey(projectId, cutId)) || null;
  }

  function getOther() {
    return { running: otherRunning, pending: otherPending };
  }

  function emit(evt) {
    if (!evt || !evt.promptId) return;
    const p = ensurePrompt(String(evt.promptId));
    if (evt.cutId != null) p.cutId = String(evt.cutId);
    if (evt.projectId != null) p.projectId = String(evt.projectId);
    if (evt.state) p.state = evt.state;
    if (evt.percent != null) p.percent = evt.state === "done" ? 100 : applyMonotonicPercent(p, evt.percent);
    if (evt.node !== undefined) p.node = evt.node;
    if (evt.queuePos !== undefined) p.queuePos = evt.queuePos;
    if (evt.error !== undefined) p.error = evt.error;
    if (evt.state === "done") p.maxPercent = 100;
    deliver(p);
  }

  return {
    registerPrompt,
    handleEvent,
    syncQueue,
    syncHistory,
    on,
    getCutStatus,
    getOther,
    emit,
  };
}
