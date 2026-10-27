/** Deleted-cut trash list helpers (pure, testable). */

export function trashButtonLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `Trash (${n})`;
}

/** Toast summary after soft-deleting cuts (Undo available). */
export function movedToTrashToastMessage(count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n <= 0) return "Moved cuts to Trash";
  if (n === 1) return "Moved 1 cut to Trash";
  return `Moved ${n} cuts to Trash`;
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
