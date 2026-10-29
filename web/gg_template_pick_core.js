/** Pure helpers for template pick / remember-last (no DOM). */

export const LAST_TEMPLATE_KEY = "gonggan-cut.lastTemplate";

/** Stored in localStorage when the user explicitly chose (none). */
export const LAST_TEMPLATE_NONE = "__none__";

/**
 * @param {Storage|null|undefined} storage
 * @returns {string|undefined} template ref, "" when last pick was (none), undefined when never set
 */
export function loadLastTemplate(storage) {
  try {
    if (!storage) return undefined;
    const raw = storage.getItem(LAST_TEMPLATE_KEY);
    if (raw === null) return undefined;
    if (raw === LAST_TEMPLATE_NONE) return "";
    return String(raw).trim();
  } catch (_) {
    return undefined;
  }
}

/**
 * Remember last template pick, including explicit (none) as "".
 * @param {Storage|null|undefined} storage
 * @param {string} ref workflow ref or "" for (none)
 */
export function saveLastTemplate(storage, ref) {
  const r = String(ref ?? "").trim();
  try {
    if (!storage) return;
    if (!r) storage.setItem(LAST_TEMPLATE_KEY, LAST_TEMPLATE_NONE);
    else storage.setItem(LAST_TEMPLATE_KEY, r);
  } catch (_) {}
}

/**
 * Plugin per-cut workflows under workflows/gonggan/ — not user-facing templates.
 * @param {string} path
 * @returns {boolean}
 */
export function isInternalWorkflowPath(path) {
  const s = String(path ?? "").trim().replace(/\\/g, "/");
  return /^gonggan\//i.test(s);
}

/**
 * @param {string[]} paths
 * @param {string} [keep] currently selected ref (internal paths kept only when this matches)
 * @returns {string[]}
 */
export function userTemplatePaths(paths, keep) {
  const keepVal = String(keep ?? "").trim();
  return (paths || []).filter(
    (p) => !isInternalWorkflowPath(p) || (keepVal && p === keepVal)
  );
}

/**
 * @param {string[]} paths
 * @param {string} query
 * @param {string} keep currently selected path (always included when present in paths)
 * @returns {string[]}
 */
export function filterTemplatePaths(paths, query, keep) {
  const list = [...userTemplatePaths(paths, keep)].sort((a, b) => a.localeCompare(b));
  const q = String(query ?? "").trim().toLowerCase();
  const keepVal = String(keep ?? "").trim();
  return list.filter((p) => {
    if (keepVal && p === keepVal) return true;
    if (!q) return true;
    return p.toLowerCase().includes(q);
  });
}

/**
 * Default template combobox items: (none) first, then user templates A–Z. The current ref is always listed
 * (also an internal or since-deleted workflow), so a saved value still shows and stays selectable.
 * @param {string[]} paths
 * @param {string} current saved template ref ("" = none)
 * @returns {{ value: string, label: string }[]}
 */
export function templateComboItems(paths, current) {
  const cur = String(current ?? "").trim();
  const list = [...userTemplatePaths(paths, cur)].sort((a, b) => a.localeCompare(b));
  if (cur && !list.includes(cur)) list.push(cur);
  return [{ value: "", label: "(none)" }, ...list.map((p) => ({ value: p, label: p }))];
}

/**
 * @param {string[]} paths
 * @param {string|undefined} last from loadLastTemplate
 * @returns {string} '' preselects (none); template ref when last is in paths
 */
export function pickInitialTemplate(paths, last) {
  if (last === undefined) return "";
  const l = String(last).trim();
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
