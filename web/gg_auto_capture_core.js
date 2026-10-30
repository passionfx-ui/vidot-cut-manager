/**
 * Auto-capture (pure, no DOM): a prompt queued from a cut of a native project is remembered when it is
 * queued; on `execution_success` its output is added to that cut once (POST /gonggan/capture-output).
 * After a page reload the `gonggan.jobs` list (prompt -> cut) is the fallback.
 */

const KEEP = 200;

/**
 * @param {{ isNativePid?: (pid: string) => boolean }} [opts]
 */
export function createAutoCapture(opts = {}) {
  const isNative = typeof opts.isNativePid === "function" ? opts.isNativePid : () => false;
  /** @type {Map<string, { cutId: string, projectId: string }>} */
  const pending = new Map();
  /** @type {Set<string>} prompt ids already handed out (or ended without success) */
  const done = new Set();

  function trim(coll) {
    while (coll.size > KEEP) {
      const first = coll.keys().next().value;
      coll.delete(first);
    }
  }

  function markDone(id) {
    pending.delete(id);
    done.add(id);
    trim(done);
  }

  /** queuePrompt reply: remember the cut (native projects only). */
  function remember(promptId, target) {
    if (promptId == null || !target?.cutId || !target?.projectId) return false;
    const projectId = String(target.projectId);
    if (!isNative(projectId)) return false;
    const id = String(promptId);
    if (done.has(id)) return false;
    pending.set(id, { cutId: String(target.cutId), projectId });
    trim(pending);
    return true;
  }

  /**
   * execution_success: the cut to add the output to, once per prompt (null = not from a native cut).
   * @param {string} promptId
   * @param {Array<{ promptId?: string, cutId?: string, projectId?: string }>} [jobs] persisted gonggan.jobs
   */
  function take(promptId, jobs) {
    if (promptId == null) return null;
    const id = String(promptId);
    if (done.has(id)) return null;
    let t = pending.get(id) || null;
    if (!t) {
      const j = (Array.isArray(jobs) ? jobs : []).find((x) => x && String(x.promptId) === id);
      if (j?.cutId && j?.projectId && isNative(String(j.projectId))) {
        t = { cutId: String(j.cutId), projectId: String(j.projectId) };
      }
    }
    if (!t) return null;
    markDone(id);
    return t;
  }

  /** execution_error / execution_interrupted: nothing to add for this prompt. */
  function forget(promptId) {
    if (promptId == null) return;
    markDone(String(promptId));
  }

  return { remember, take, forget, pendingCount: () => pending.size };
}

/** An older server (ComfyUI not restarted yet) has no /gonggan/capture-output route. */
export function captureRouteMissing(status, data) {
  return (status === 404 || status === 405) && !(data && typeof data === "object" && "ok" in data);
}

/**
 * Toast for one capture reply.
 * @param {{ ok?: boolean, duplicate?: boolean, message?: string, output?: { name?: string } }} d
 * @param {string} cutText e.g. "1-1 opening"
 * @returns {{ summary: string, detail: string, kind: string } | null} null = say nothing
 */
export function captureToast(d, cutText) {
  const where = cutText ? `cut ${cutText}` : "its cut";
  if (d?.ok) {
    if (d.duplicate) return null;
    return { summary: `Added to ${where}`, detail: d.output?.name || "", kind: "ok" };
  }
  return { summary: `Not added to ${where}`, detail: d?.message || "", kind: "warn" };
}
