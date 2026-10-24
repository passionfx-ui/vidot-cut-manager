/**
 * Auto-save modified Gonggan shot tabs before cut switch (pure logic, no DOM).
 */

/** @param {string} path */
export function normalizeWorkflowPath(path) {
  return String(path ?? "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
}

/**
 * @param {string} candidate
 * @param {string[]} existingPaths
 * @param {{ caseInsensitive?: boolean }} [opts]
 */
export function pathCollides(candidate, existingPaths, opts = {}) {
  const caseInsensitive = !!opts.caseInsensitive;
  const c = normalizeWorkflowPath(candidate);
  const cKey = caseInsensitive ? c.toLowerCase() : c;
  for (const ep of existingPaths || []) {
    const e = normalizeWorkflowPath(ep);
    const eKey = caseInsensitive ? e.toLowerCase() : e;
    if (eKey === cKey) return true;
  }
  return false;
}

/**
 * @param {string} desiredPath
 * @param {string[]} existingPaths
 * @param {{ caseInsensitive?: boolean, isTaken?: (path: string) => boolean }} [opts]
 */
export function pickFreeWorkflowPath(desiredPath, existingPaths, opts = {}) {
  const isTaken =
    opts.isTaken ||
    ((p) => pathCollides(p, existingPaths, { caseInsensitive: opts.caseInsensitive }));

  const normDesired = normalizeWorkflowPath(desiredPath);
  if (!normDesired) throw new Error("empty workflow path");

  if (!isTaken(normDesired)) return normDesired;

  const slash = normDesired.lastIndexOf("/");
  const dir = slash >= 0 ? normDesired.slice(0, slash + 1) : "";
  const file = slash >= 0 ? normDesired.slice(slash + 1) : normDesired;
  const lower = file.toLowerCase();
  const ext = lower.endsWith(".json") ? file.slice(file.length - 5) : "";
  const stem = ext ? file.slice(0, -5) : file;
  const rootStem = stem.replace(/\s+\(\d+\)$/, "");

  for (let n = 2; n < 10000; n++) {
    const next = `${dir}${rootStem} (${n})${ext || ".json"}`;
    if (!isTaken(next)) return next;
  }
  throw new Error("no free workflow path");
}

/** @param {{ filename?: string, path?: string }} wf */
export function workflowLabel(wf) {
  if (!wf) return "workflow";
  if (wf.filename) return String(wf.filename);
  const p = normalizeWorkflowPath(wf.path);
  const slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(slash + 1) : p || "workflow";
}

/** @param {{ filename?: string, path?: string }} wf */
export function defaultDesiredPath(wf) {
  const p = normalizeWorkflowPath(wf.path);
  if (p) return p;
  const name = wf.filename ? String(wf.filename) : "workflow.json";
  const base = name.toLowerCase().endsWith(".json") ? name : `${name}.json`;
  return `workflows/${base}`;
}

/**
 * @param {object} wf
 */
export function captureWorkflowEdits(wf) {
  if (typeof wf.prepareForSave === "function") wf.prepareForSave();
  wf.changeTracker?.captureCanvasState?.();
  wf.changeTracker?.prepareForSave?.();
  wf.changeTracker?.checkState?.();
}

/**
 * @param {object} wf
 * @param {object} deps
 * @returns {Promise<{ name: string, path: string }>}
 */
export async function autosaveWorkflow(wf, deps) {
  if (!wf?.isModified) return null;

  captureWorkflowEdits(wf);

  if (typeof deps.saveWorkflow !== "function") {
    throw new Error("saveWorkflow unavailable");
  }

  let desired = defaultDesiredPath(wf);

  if (wf.isTemporary) {
    if (typeof deps.renameWorkflow !== "function") {
      throw new Error("renameWorkflow unavailable");
    }
    const existing = await deps.listExistingPaths();
    if (!Array.isArray(existing)) {
      throw new Error("listExistingPaths failed");
    }
    const isTaken = (p) => {
      if (pathCollides(p, existing, { caseInsensitive: deps.caseInsensitive })) return true;
      if (typeof deps.getWorkflowByPath === "function") {
        const other = deps.getWorkflowByPath(p);
        if (other && other !== wf) return true;
        if (other && other === wf) return false;
        if (other) return true;
      }
      return false;
    };
    const freePath = pickFreeWorkflowPath(desired, existing, {
      caseInsensitive: deps.caseInsensitive,
      isTaken,
    });
    await deps.renameWorkflow(wf, freePath);
    desired = normalizeWorkflowPath(wf.path || freePath);
  }

  await deps.saveWorkflow(wf);

  if (wf.isModified) {
    throw new Error("still modified after save");
  }
  if (wf.isTemporary) {
    throw new Error("still temporary after save");
  }

  const path = normalizeWorkflowPath(wf.path || desired);
  return { name: workflowLabel(wf), path };
}

/**
 * @param {object[]} tabs
 * @param {object} deps
 * @returns {Promise<{ ok: boolean, saved: { name: string, path: string }[], failed: { name: string, error: string } | null }>}
 */
export async function autosaveModifiedTabs(tabs, deps) {
  const queue = (tabs || []).filter((w) => w && w.isModified);
  const saved = [];
  for (const wf of queue) {
    try {
      const entry = await autosaveWorkflow(wf, deps);
      if (entry) saved.push(entry);
    } catch (e) {
      const err = e?.message ? String(e.message) : String(e);
      return { ok: false, saved, failed: { name: workflowLabel(wf), error: err } };
    }
  }
  return { ok: true, saved, failed: null };
}
