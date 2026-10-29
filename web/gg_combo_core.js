/** Pure helpers for a type-to-filter combobox (no DOM). Items are `{ value, label }`. */

/** Case-insensitive substring match on the label; empty query keeps everything. */
export function comboFilter(items, query) {
  const q = String(query ?? "").trim().toLowerCase();
  const list = Array.isArray(items) ? items : [];
  if (!q) return list.slice();
  return list.filter((it) => String(it?.label ?? "").toLowerCase().includes(q));
}

/** Highlight after (re)filtering: the current value on an empty query, else the first match (-1 = none). */
export function comboActiveIndex(items, currentValue, query) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return -1;
  if (!String(query ?? "").trim()) {
    const i = list.findIndex((it) => it.value === currentValue);
    return i >= 0 ? i : 0;
  }
  return 0;
}

/**
 * Keyboard step for the combobox input.
 * @param {{ open: boolean, active: number, count: number }} state
 * @param {string} key KeyboardEvent.key
 * @returns {{ open: boolean, active: number, pick: number, revert: boolean, handled: boolean }}
 *   pick >= 0: choose that item; revert: closed without a pick (show the current value again);
 *   handled: the caller should preventDefault (Enter must not submit the form while the list is open).
 */
export function comboKey(state, key) {
  const open = !!state?.open;
  const count = Math.max(0, Number(state?.count) || 0);
  const last = count - 1;
  let active = Number.isInteger(state?.active) ? Math.min(state.active, last) : -1;
  const res = (o) => ({ open, active, pick: -1, revert: false, handled: false, ...o });
  switch (key) {
    case "ArrowDown":
    case "ArrowUp":
      if (!open) return res({ open: true, handled: true });
      if (!count) return res({ active: -1, handled: true });
      if (key === "ArrowDown") active = active < 0 ? 0 : Math.min(last, active + 1);
      else active = active < 0 ? 0 : Math.max(0, active - 1);
      return res({ active, handled: true });
    case "Enter":
      if (!open) return res({});
      if (active >= 0) return res({ open: false, pick: active, handled: true });
      return res({ open: false, revert: true, handled: true });
    case "Escape":
      if (!open) return res({});
      return res({ open: false, revert: true, handled: true });
    case "Tab":
      return open ? res({ open: false, revert: true }) : res({});
    default:
      return res({});
  }
}
