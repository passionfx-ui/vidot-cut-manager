/** Pure helpers for template pick / remember-last (no DOM). */

export const LAST_TEMPLATE_KEY = "gonggan-cut.lastTemplate";

/**
 * @param {Storage|null|undefined} storage
 * @returns {string}
 */
export function loadLastTemplate(storage) {
  try {
    if (!storage) return "";
    return String(storage.getItem(LAST_TEMPLATE_KEY) ?? "").trim();
  } catch (_) {
    return "";
  }
}

/**
 * Remember a non-empty template ref. Explicit "(none)" does not clear storage — last stays for preselect / shortcut.
 * @param {Storage|null|undefined} storage
 * @param {string} ref
 */
export function saveLastTemplate(storage, ref) {
  const r = String(ref ?? "").trim();
  if (!r) return;
  try {
    if (storage) storage.setItem(LAST_TEMPLATE_KEY, r);
  } catch (_) {}
}

/**
 * @param {string[]} paths
 * @param {string} query
 * @param {string} keep currently selected path (always included when present in paths)
 * @returns {string[]}
 */
export function filterTemplatePaths(paths, query, keep) {
  const list = [...(paths || [])].sort((a, b) => a.localeCompare(b));
  const q = String(query ?? "").trim().toLowerCase();
  const keepVal = String(keep ?? "").trim();
  return list.filter((p) => {
    if (keepVal && p === keepVal) return true;
    if (!q) return true;
    return p.toLowerCase().includes(q);
  });
}

/**
 * @param {string[]} paths
 * @param {string} last
 * @returns {string} '' when none or last missing from paths
 */
export function pickInitialTemplate(paths, last) {
  const l = String(last ?? "").trim();
  if (!l) return "";
  const list = paths || [];
  return list.includes(l) ? l : "";
}

/**
 * @param {string} path
 * @param {number} [max]
 * @returns {string}
 */
export function shortTemplateName(path, max = 24) {
  const s = String(path ?? "");
  const lim = Math.max(4, Number(max) || 24);
  const slash = s.lastIndexOf("/");
  const base = slash >= 0 ? s.slice(slash + 1) : s;
  const show = base || s;
  if (show.length <= lim) return show;
  return `${show.slice(0, lim - 1)}…`;
}
