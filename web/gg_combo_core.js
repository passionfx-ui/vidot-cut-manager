/** Pure helpers for a type-to-filter combobox (no DOM). Items are `{ value, label }`. */

/** Case-insensitive substring match on the label; empty query keeps everything. */
export function comboFilter(items, query) {
  const q = String(query ?? "").trim().toLowerCase();
  const list = Array.isArray(items) ? items : [];
  if (!q) return list.slice();
  return list.filter((it) => String(it?.label ?? "").toLowerCase().includes(q));
}

/**
 * Highlight after (re)filtering: the current value on an empty query, else only an item whose label is exactly the
 * typed text (case-insensitive), so Enter keeps a typed value instead of swapping in a partial match (-1 = none).
 */
export function comboActiveIndex(items, currentValue, query) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return -1;
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) {
    const i = list.findIndex((it) => it.value === currentValue);
    return i >= 0 ? i : 0;
  }
  return list.findIndex((it) => String(it?.label ?? "").toLowerCase() === q);
}

/**
 * Value for text typed into the editable combobox: an item whose label matches (case-insensitive) gives its value
 * (so "(none)" = ""), anything else is used as typed (trimmed).
 */
export function comboTypedValue(items, text) {
  const t = String(text ?? "").trim();
  const hit = (Array.isArray(items) ? items : []).find((it) => String(it?.label ?? "").toLowerCase() === t.toLowerCase());
  return hit ? hit.value : t;
}

/**
 * Keyboard step for the combobox input.
 * @param {{ open: boolean, active: number, count: number }} state
 * @param {string} key KeyboardEvent.key
 * @returns {{ open: boolean, active: number, pick: number, revert: boolean, commit: boolean, handled: boolean }}
 *   pick >= 0: choose that item; commit: use the typed text as the value; revert: show the current value again;
 *   handled: the caller should preventDefault (Enter must not submit the form while the list is open).
 */
export function comboKey(state, key) {
  const open = !!state?.open;
  const count = Math.max(0, Number(state?.count) || 0);
  const last = count - 1;
  let active = Number.isInteger(state?.active) ? Math.min(state.active, last) : -1;
  const res = (o) => ({ open, active, pick: -1, revert: false, commit: false, handled: false, ...o });
  switch (key) {
    case "ArrowDown":
    case "ArrowUp":
      if (!open) return res({ open: true, handled: true });
      if (!count) return res({ active: -1, handled: true });
      if (key === "ArrowDown") active = active < 0 ? 0 : Math.min(last, active + 1);
      else active = active < 0 ? 0 : Math.max(0, active - 1);
      return res({ active, handled: true });
    case "Enter":
      if (!open) return res({ commit: true });
      if (active >= 0) return res({ open: false, pick: active, handled: true });
      return res({ open: false, commit: true, handled: true });
    case "Escape":
      if (!open) return res({});
      return res({ open: false, revert: true, handled: true });
    case "Tab":
      return open ? res({ open: false }) : res({});
    default:
      return res({});
  }
}
