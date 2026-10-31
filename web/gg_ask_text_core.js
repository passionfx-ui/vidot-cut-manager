/** In-app text prompt validation (pure, no DOM). */

export const SCENE_NAME_MAX_LEN = 40;
export const PROJECT_NAME_MAX_LEN = 120;

/**
 * @param {unknown} raw
 * @param {number} maxLen
 * @returns {{ ok: true, value: string } | { ok: false, value: "" }}
 */
export function normalizeNameInput(raw, maxLen) {
  const n = Number(maxLen);
  const cap = Number.isFinite(n) && n > 0 ? Math.floor(n) : SCENE_NAME_MAX_LEN;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: false, value: "" };
  return { ok: true, value: trimmed.slice(0, cap) };
}

/**
 * Scene create dialogs (Start New Scene Here, Make Scene from Selection): empty confirm is allowed;
 * the handler assigns the next free `Scene N` via `resolveSceneName`.
 * @param {unknown} raw
 * @param {number} [maxLen]
 */
export function normalizeSceneCreateDialogInput(raw, maxLen) {
  const n = Number(maxLen);
  const cap = Number.isFinite(n) && n > 0 ? Math.floor(n) : SCENE_NAME_MAX_LEN;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: true, value: "" };
  return { ok: true, value: trimmed.slice(0, cap) };
}
