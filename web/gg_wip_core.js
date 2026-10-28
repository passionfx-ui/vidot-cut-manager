/**
 * Working-copy stamp for Gonggan shot workflows (pure, no DOM).
 * ggWip in workflow extra ties a saved file to cut + version/pick state.
 */

/**
 * Stable key for the cut's current result state (pick/rep + versions).
 * Changes when a new version is added or the representative pick changes.
 * @param {object | null | undefined} cut
 * @returns {string}
 */
export function cutBaseKey(cut) {
  if (!cut || typeof cut !== "object") return ":0";
  const pick = cut.pick ?? cut.pick_version_id ?? cut.media?.id ?? "";
  const list = Array.isArray(cut.versions_list) ? cut.versions_list : [];
  if (!list.length) return `${pick}:0`;
  let latest = list[0];
  for (const v of list) {
    const c = v?.created ?? 0;
    const lc = latest?.created ?? 0;
    if (c >= lc) latest = v;
  }
  const tail = latest?.id != null ? String(latest.id) : String(list.length);
  return `${pick}:${tail}`;
}

/**
 * @param {object | null | undefined} graphExtra
 * @param {{ cutId: string, baseKey: string, at?: number }} opts
 * @returns {object}
 */
export function stampWip(graphExtra, opts) {
  const { cutId, baseKey } = opts || {};
  const extra = { ...(graphExtra || {}) };
  extra.ggWip = {
    cutId: String(cutId ?? ""),
    baseKey: String(baseKey ?? ""),
    at: typeof opts?.at === "number" ? opts.at : Date.now(),
  };
  return extra;
}

/**
 * @param {object | null | undefined} workflowJson
 * @param {{ cutId: string, baseKey: string }} opts
 * @returns {boolean}
 */
export function shouldRestoreWip(workflowJson, opts) {
  const wip = workflowJson?.extra?.ggWip;
  if (!wip || typeof wip !== "object") return false;
  const { cutId, baseKey } = opts || {};
  if (!cutId || baseKey == null) return false;
  return String(wip.cutId) === String(cutId) && String(wip.baseKey) === String(baseKey);
}
