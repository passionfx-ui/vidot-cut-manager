/**
 * In-memory project snapshot for cut switching (pure, no DOM).
 * The snapshot is filled when a project is opened or reloaded. Cut switches read it only.
 */

import { repMediaKind } from "./gg_rep_wf_core.js";

/**
 * Media-kind rule for opening a cut workflow tab.
 * A video cut opens the project Video workflow; every other cut opens the Image workflow.
 * `forceKind` is an explicit image/video choice (Make Video, a version's own kind).
 * @param {object | null | undefined} cut
 * @param {string | null | undefined} [forceKind]
 * @returns {"image" | "video"}
 */
export function cutWorkflowKind(cut, forceKind) {
  if (forceKind === "video" || forceKind === "image") return forceKind;
  return repMediaKind(cut) === "video" ? "video" : "image";
}

/**
 * Stable identity of a workflow graph so an unchanged graph is not loaded again.
 * @param {unknown} workflow
 * @returns {string}
 */
export function workflowContentKey(workflow) {
  if (!workflow || typeof workflow !== "object") return "";
  let s = "";
  try {
    s = JSON.stringify(workflow);
  } catch {
    return "";
  }
  if (!s) return "";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return `${s.length}:${h >>> 0}`;
}

/**
 * The open shot tab already shows this graph. Skip loadGraphData.
 * @param {{ tabActive?: boolean, openKind?: string | null, openKey?: string, nextKind?: string | null, nextKey?: string }} opts
 */
export function shouldReuseOpenWorkflow(opts) {
  const { tabActive, openKind, openKey, nextKind, nextKey } = opts || {};
  if (!tabActive) return false;
  if (!openKey || !nextKey) return false;
  if (!openKind || !nextKind || openKind !== nextKind) return false;
  return openKey === nextKey;
}

/**
 * One project snapshot: timeline display data lives on the caller;
 * this object holds the workflow graphs keyed by cut id, plus the project Image template.
 */
export function createProjectMemory() {
  let generation = 0;
  let pid = "";
  /** @type {Map<string, { kind: string, workflow: object | null, source: string, fallback: string, key: string, empty?: boolean }>} */
  const workflows = new Map();
  /** @type {Map<string, Promise<unknown>>} */
  const inflight = new Map();
  /** @type {object | null} */
  let template = null;
  /** @type {Promise<unknown> | null} */
  let templatePromise = null;
  /** Project image / video template graphs (structure only; cut data is applied on top). */
  const kindTemplates = new Map();

  return {
    generation() {
      return generation;
    },
    pid() {
      return pid;
    },
    /** Drop graphs from a previous load. Returns the new generation. */
    begin(nextPid) {
      generation += 1;
      pid = nextPid || "";
      workflows.clear();
      inflight.clear();
      template = null;
      templatePromise = null;
      kindTemplates.clear();
      return generation;
    },
    setKindTemplate(kind, wf, gen) {
      if (gen !== undefined && gen !== generation) return;
      if (kind !== "image" && kind !== "video") return;
      kindTemplates.set(kind, wf && typeof wf === "object" ? wf : null);
    },
    kindTemplate(kind) {
      return kindTemplates.get(kind) || null;
    },
    setTemplate(wf, gen) {
      if (gen !== generation) return;
      template = wf && typeof wf === "object" ? wf : null;
    },
    template() {
      return template;
    },
    trackTemplate(promise) {
      templatePromise = promise || null;
      return templatePromise;
    },
    templateInflight() {
      return templatePromise;
    },
    setWorkflow(cutId, entry, gen) {
      if (!cutId || !entry) return;
      if (gen !== undefined && gen !== generation) return;
      workflows.set(cutId, entry);
      inflight.delete(cutId);
    },
    getWorkflow(cutId) {
      return workflows.get(cutId) || null;
    },
    track(cutId, promise) {
      if (!cutId || !promise) return promise;
      inflight.set(cutId, promise);
      return promise;
    },
    inflight(cutId) {
      return inflight.get(cutId) || null;
    },
  };
}
