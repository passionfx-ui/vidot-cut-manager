/** Deleted-cut trash list helpers (pure, testable). */

export function trashButtonLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `Trash (${n})`;
}

/** Cut list context menu: opens the trash / restore list. */
export function restoreDeletedCutsMenuLabel(count) {
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  return `Restore Deleted Cuts (${n})…`;
}

/** Toast summary after hiding cuts (Undo / History can bring them back). */
export function movedToTrashToastMessage(count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n <= 0) return "Deleted cuts";
  if (n === 1) return "Deleted 1 cut";
  return `Deleted ${n} cuts`;
}

/** Confirm text before hiding cuts (first line = heading). */
export function deleteCutsConfirmMessage(count) {
  const n = Math.max(1, Math.floor(Number(count)) || 1);
  return n === 1
    ? "Delete 1 cut?\nYou can restore it from History."
    : `Delete ${n} cuts?\nYou can restore them from History.`;
}

export function normalizeTrashItems(resp) {
  if (!resp || resp.ok === false) return [];
  const items = resp.items;
  return Array.isArray(items) ? items : [];
}

export function formatTrashItem(item, now = Date.now()) {
  const title = (item && item.name) || "(untitled)";
  const scene = (item && item.scene_name) || "";
  const raw = item && item.deleted_at;
  const deletedMs = raw ? Date.parse(raw) : NaN;
  let when = "";
  if (!Number.isNaN(deletedMs)) {
    const sec = Math.floor((now - deletedMs) / 1000);
    if (sec < 45) when = "just now";
    else if (sec < 3600) when = `${Math.floor(sec / 60)} min ago`;
    else if (sec < 86400) when = `${Math.floor(sec / 3600)} h ago`;
    else when = new Date(deletedMs).toLocaleString();
  }
  const deletedPart = when ? `deleted ${when}` : "deleted";
  const sub = scene ? `${scene} · ${deletedPart}` : deletedPart;
  return { title, sub };
}
