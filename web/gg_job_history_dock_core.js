/** Pure helpers: force ComfyUI Docked Job History while Cut Manager is open. */

/** ComfyUI setting "Docked job history/queue panel". true = sidebar dock, false = floating. */
export const JOB_HISTORY_DOCK_SETTING_ID = "Comfy.Queue.QPOV2";

/** User's docked flag, kept until Cut Manager closes (survives refresh). */
export const JOB_HISTORY_DOCK_SAVED_KEY = "gg.jobHistoryDockSaved";

function isDockedFlag(value) {
  return value === true || value === false;
}

/**
 * @param {{ getItem?: (key: string) => string | null } | null | undefined} storage
 * @returns {boolean | null}
 */
export function readHeldDock(storage) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(JOB_HISTORY_DOCK_SAVED_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {{ setItem?: (key: string, value: string) => void, removeItem?: (key: string) => void } | null | undefined} storage
 * @param {boolean | null} held
 */
export function writeHeldDock(storage, held) {
  try {
    if (!storage) return;
    if (held === true) storage.setItem(JOB_HISTORY_DOCK_SAVED_KEY, "1");
    else if (held === false) storage.setItem(JOB_HISTORY_DOCK_SAVED_KEY, "0");
    else storage.removeItem(JOB_HISTORY_DOCK_SAVED_KEY);
  } catch (_) {}
}

/**
 * Cut Manager opened. Remember the user's docked flag once, then force docked on.
 * A later open does not replace the original flag.
 * @param {boolean | null | undefined} held
 * @param {unknown} current live setting value
 * @returns {{ held: boolean | null, setTo: true | null }}
 */
export function planDockOnCutManagerOpen(held, current) {
  const known = isDockedFlag(current);
  if (!isDockedFlag(held)) {
    if (!known) return { held: null, setTo: null };
    return { held: current, setTo: current ? null : true };
  }
  if (!known) return { held, setTo: null };
  return { held, setTo: current ? null : true };
}

/**
 * Cut Manager closed. Restore the saved docked flag and release the hold.
 * @param {boolean | null | undefined} held
 * @returns {{ held: null, setTo: boolean | null }}
 */
export function planDockOnCutManagerClose(held) {
  if (!isDockedFlag(held)) return { held: null, setTo: null };
  return { held: null, setTo: held };
}

/**
 * ComfyUI exposes settings as `{ get, set }` or a ref whose `.value` is that object.
 * @param {unknown} setting
 */
export function resolveSettingApi(setting) {
  if (!setting || typeof setting !== "object") return null;
  if (typeof setting.get === "function" && typeof setting.set === "function") return setting;
  const inner = setting.value;
  if (inner && typeof inner.get === "function" && typeof inner.set === "function") return inner;
  return null;
}
