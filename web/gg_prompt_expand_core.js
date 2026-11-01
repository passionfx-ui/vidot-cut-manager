/** Expand prompt editor modal (pure helpers + markup shell). */

const escHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** @param {{ key?: string, ctrlKey?: boolean, metaKey?: boolean }} e */
export function promptExpandKeyAction(e) {
  const key = e?.key;
  if (key === "Escape") return "cancel";
  if ((e?.ctrlKey || e?.metaKey) && key === "Enter") return "confirm";
  return null;
}

export const PROMPT_EXPAND_VIEWPORT_RATIO = 0.525;
export const PROMPT_EXPAND_RATIO_MIN = 0.48;
export const PROMPT_EXPAND_RATIO_MAX = 0.57;

/** @param {number} ratio width or height / viewport dimension */
export function modalViewportRatioInBand(ratio, fullscreen) {
  const r = Number(ratio);
  if (!Number.isFinite(r)) return false;
  if (fullscreen) return r >= 0.95 && r <= 1.02;
  return r >= PROMPT_EXPAND_RATIO_MIN && r <= PROMPT_EXPAND_RATIO_MAX;
}

export function promptExpandFullscreenTitle(fullscreen) {
  return fullscreen ? "Exit fullscreen" : "Fullscreen";
}

/** Dialog shell; caller sets textarea value after insert (avoids HTML in prompt text). */
export function promptExpandModalShellHtml() {
  return `<div class="gg-modal gg-prompt-edit-modal" role="dialog" aria-label="Edit Prompt">
      <div class="gg-prompt-edit-head">
        <h3 class="gg-modal-title">Edit Prompt</h3>
        <button type="button" class="gg-btn gg-prompt-edit-fs" title="Fullscreen" aria-label="Fullscreen">⛶</button>
      </div>
      <textarea class="gg-prompt-edit-text" spellcheck="true" autocomplete="off"></textarea>
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-modal-cancel">Cancel</button>
        <button type="button" class="gg-btn gg-primary gg-prompt-edit-ok">OK</button>
      </div>
    </div>`;
}

/** @param {{ native?: boolean, text?: string, placeholder?: string, title?: string, thumb?: string }} p */
export function promptFieldRowHtml(p) {
  const ro = p.native ? " readonly" : " disabled";
  const expandBtn = p.native
    ? `<button type="button" class="gg-btn gg-prompt-expand" title="Expand prompt" aria-label="Expand prompt">${escHtml("⤢")}</button>`
    : "";
  return `<div class="gg-cut-thumb-col">${p.thumb || ""}</div><div class="gg-prompt-field-wrap"><textarea class="gg-prompt-text" rows="3" placeholder="${escHtml(p.placeholder)}"${ro} title="${escHtml(p.title)}">${escHtml(p.text)}</textarea>${expandBtn}</div>`;
}
