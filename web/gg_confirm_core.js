/** Pure helpers for the in-app confirm modal (replaces window.confirm). No DOM. */

/**
 * First line becomes the heading, the remaining lines the body (same wording as the old confirm text).
 * @param {string} message
 * @returns {{ title: string, body: string }}
 */
export function splitConfirmMessage(message) {
  const text = String(message ?? "").replace(/\r\n?/g, "\n");
  const i = text.indexOf("\n");
  if (i < 0) return { title: text.trim(), body: "" };
  return { title: text.slice(0, i).trim(), body: text.slice(i + 1).replace(/^\n+/, "").trimEnd() };
}

/**
 * What a key press does in the confirm modal. Enter confirms, Esc cancels; an Enter that only commits an
 * IME composition (Korean/Japanese/Chinese) must do nothing.
 * @param {{ key?: string, isComposing?: boolean, keyCode?: number }} e
 * @returns {"ok"|"cancel"|null}
 */
export function confirmKeyAction(e) {
  if (!e) return null;
  if (e.isComposing || e.keyCode === 229 || e.key === "Process") return null;
  if (e.key === "Escape") return "cancel";
  if (e.key === "Enter") return "ok";
  return null;
}