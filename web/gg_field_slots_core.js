// Debounced cut-field edits waiting to be saved: one slot PER CUT, each remembering the project it was typed in.
export function createFieldSlots() {
  const slots = new Map();
  return {
    add(cutId, pid, fields) {
      const prev = slots.get(cutId);
      slots.set(cutId, { cutId, pid, fields: { ...(prev && prev.pid === pid ? prev.fields : {}), ...fields } });
    },
    get(cutId) {
      return slots.get(cutId) || null;
    },
    // Remove and return every waiting slot (flush).
    takeAll() {
      const all = [...slots.values()];
      slots.clear();
      return all;
    },
    all() {
      return [...slots.values()];
    },
    get size() {
      return slots.size;
    },
  };
}