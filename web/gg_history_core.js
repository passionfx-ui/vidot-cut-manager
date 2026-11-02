/**
 * One Photoshop-style history for a project (pure logic, no DOM).
 * Steps are oldest-first. `cursor` is the last applied step (-1 = before any step).
 * Each step stores a small diff (`entry`), not a full project copy.
 */

export const HISTORY_STEPS_DEFAULT = 50;
export const HISTORY_STEPS_MIN = 1;
export const HISTORY_STEPS_MAX = 500;

export function clampHistorySteps(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return HISTORY_STEPS_DEFAULT;
  return Math.min(HISTORY_STEPS_MAX, Math.max(HISTORY_STEPS_MIN, v));
}

export function historyStepId() {
  return `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * @param {{ limit?: number }} [opts]
 */
export function createProjectHistory({ limit = HISTORY_STEPS_DEFAULT } = {}) {
  let key = "";
  let steps = [];
  let cursor = -1;
  let cap = clampHistorySteps(limit);
  /** @type {object[]} */
  const dropped = [];

  const takeDropped = () => dropped.splice(0, dropped.length);

  const sync = (k) => {
    const next = String(k || "");
    if (next !== key) {
      key = next;
      steps = [];
      cursor = -1;
    }
  };

  const trim = () => {
    while (steps.length > cap) {
      const gone = steps.shift();
      if (gone) dropped.push(gone);
      if (cursor >= 0) cursor -= 1;
    }
  };

  const normalize = (step) => ({
    id: String(step.id || historyStepId()),
    label: String(step.label || "Edit").slice(0, 80),
    scope: step.scope === "timeline" ? "timeline" : "shots",
    entry: step.entry,
    after: step.after ?? null,
  });

  return {
    /** Remember N without dropping steps. Opening a project keeps a longer migrated list. */
    capOnly(n) {
      cap = clampHistorySteps(n);
    },
    setLimit(n) {
      cap = clampHistorySteps(n);
      trim();
      return takeDropped();
    },
    limit() {
      return cap;
    },
    /** Append one step. Drops the redo branch and anything past the cap. Returns removed steps. */
    record(k, step) {
      sync(k);
      if (!step || step.entry == null) return takeDropped();
      if (cursor >= 0 && cursor < steps.length - 1) {
        for (const s of steps.splice(cursor + 1)) dropped.push(s);
      }
      const row = normalize(step);
      const prev = cursor >= 0 ? steps[cursor] : null;
      if (prev && prev.label === row.label && sameJson(prev.entry, row.entry)) return takeDropped();
      steps.push(row);
      cursor = steps.length - 1;
      trim();
      return takeDropped();
    },
    /**
     * Move to the previous step. `currentFor(step)` is the state to redo back to.
     * @returns {object|null}
     */
    undo(k, currentFor) {
      sync(k);
      if (cursor < 0 || !steps[cursor]) return null;
      const step = steps[cursor];
      if (step.after == null && typeof currentFor === "function") {
        const after = currentFor(step);
        if (after != null) step.after = after;
      }
      cursor -= 1;
      return step;
    },
    /** @returns {object|null} */
    redo(k) {
      sync(k);
      if (cursor + 1 >= steps.length) return null;
      cursor += 1;
      return steps[cursor];
    },
    /** Put the cursor back after a failed undo. */
    abortUndo() {
      if (cursor + 1 < steps.length) cursor += 1;
    },
    /** Put the cursor back after a failed redo. */
    abortRedo() {
      if (cursor >= 0) cursor -= 1;
    },
    /** Directions to walk so the current step becomes `index` (-1 = before all). */
    planJump(k, index) {
      sync(k);
      const target = Math.max(-1, Math.min(steps.length - 1, index | 0));
      const ops = [];
      if (target < cursor) {
        for (let i = 0; i < cursor - target; i++) ops.push("undo");
      } else if (target > cursor) {
        for (let i = 0; i < target - cursor; i++) ops.push("redo");
      }
      return ops;
    },
    peekUndo(k) {
      return String(k || "") === key && cursor >= 0 ? steps[cursor] : null;
    },
    canUndo(k) {
      return String(k || "") === key && cursor >= 0;
    },
    canRedo(k) {
      return String(k || "") === key && cursor < steps.length - 1;
    },
    clear() {
      steps = [];
      cursor = -1;
      dropped.length = 0;
    },
    load(k, doc) {
      key = String(k || "");
      const raw = Array.isArray(doc?.steps) ? doc.steps : [];
      steps = raw.filter((s) => s && s.entry != null).map(normalize);
      const c = Number(doc?.cursor);
      cursor = Number.isFinite(c) ? Math.max(-1, Math.min(steps.length - 1, Math.floor(c))) : (steps.length ? steps.length - 1 : -1);
      // Do not trim here. A project can open with more than N steps after trash
      // migration; the next edit or a settings change drops the oldest.
      return takeDropped();
    },
    /** Disk steps the open project does not have yet (a save raced ahead of the load). */
    mergeLoaded(k, doc) {
      sync(k);
      const raw = Array.isArray(doc?.steps) ? doc.steps : [];
      const have = new Set(steps.map((s) => s.id));
      const extra = raw.filter((s) => s && s.entry != null && !have.has(String(s.id || ""))).map(normalize);
      if (!extra.length) return takeDropped();
      steps = extra.concat(steps);
      if (cursor >= 0) cursor += extra.length;
      else cursor = extra.length - 1;
      trim();
      return takeDropped();
    },
    snapshot() {
      return {
        cursor,
        steps: steps.map((s) => ({ id: s.id, label: s.label, scope: s.scope, entry: s.entry, after: s.after })),
      };
    },
    /** Oldest first (top), newest last (bottom), like Photoshop. */
    rows() {
      return steps.map((s, i) => ({
        id: s.id,
        label: s.label,
        index: i,
        current: i === cursor,
        future: i > cursor,
      }));
    },
    sizes() {
      return { key, cursor, steps: steps.length, undo: Math.max(0, cursor + 1), redo: Math.max(0, steps.length - cursor - 1) };
    },
  };
}

/** Short History label for a cut info-field patch. */
export function fieldHistoryLabel(fields) {
  const keys = Object.keys(fields || {});
  if (keys.length === 1) {
    const k = keys[0];
    if (k === "caption") return "Edit caption";
    if (k === "prompt") return "Edit prompt";
    if (k === "notes") return "Edit notes";
    if (k === "needs_redo") return "Mark for redo";
    if (k === "end_card") return "End card";
  }
  return "Edit cut";
}
