/** Debounced project list refresh when opening the project dropdown. */

export const PROJECT_LIST_REFRESH_MIN_MS = 1500;

export function shouldRefreshProjectList(now, lastFetchAt, minMs = PROJECT_LIST_REFRESH_MIN_MS) {
  const a = Number(now);
  const b = Number(lastFetchAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return a - b >= minMs;
}

export function projectRowButtonsOrderedPlusBeforeGear(buttonClassTokens) {
  const classes = buttonClassTokens || [];
  const plus = classes.findIndex((c) => /\bgg-new-project-head\b/.test(c));
  const gear = classes.findIndex((c) => /\bgg-proj-settings\b/.test(c));
  if (plus < 0 || gear < 0) return false;
  return plus < gear;
}

export function projectSelectOptionsHtml(projects, selectedId, esc, label) {
  return (projects || [])
    .map((p) => {
      const id = esc(String(p.id));
      const sel = p.id === selectedId ? " selected" : "";
      return `<option value="${id}"${sel}>${esc(label(p))}</option>`;
    })
    .join("");
}
