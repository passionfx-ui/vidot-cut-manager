/** Expand prompt/caption editor modal (pure helpers + markup shell). */

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

/** Width of the field expand bar (px). */
export const PROMPT_EXPAND_BAR_WIDTH_PX = 9;

export const FIELD_EXPAND_MODAL = {
  prompt: { title: "Edit Prompt", ariaLabel: "Edit Prompt", saveKey: "prompt" },
  caption: { title: "Edit Caption", ariaLabel: "Edit Caption", saveKey: "caption" },
};

/** @param {"prompt"|"caption"} kind */
export function fieldExpandModalKind(textareaClass) {
  if (textareaClass === "gg-caption-text") return "caption";
  return "prompt";
}

/** Approximate caret index in a textarea from a pointer position (for inline edit on double-click). */
export function promptTextareaCaretIndex(ta, clientX, clientY) {
  const el = ta && typeof ta.value === "string" ? ta : null;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const style = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
  const padL = style ? parseFloat(style.paddingLeft) || 0 : 0;
  const padT = style ? parseFloat(style.paddingTop) || 0 : 0;
  const lineHeight = style ? parseFloat(style.lineHeight) || 14 : 14;
  const fontSize = style ? parseFloat(style.fontSize) || 11 : 11;
  const relX = Math.max(0, clientX - rect.left - padL);
  const relY = Math.max(0, clientY - rect.top - padT);
  const lines = el.value.split("\n");
  const lineHeightPx = Math.max(1, lineHeight);
  const line = Math.min(Math.max(0, Math.floor(relY / lineHeightPx)), Math.max(0, lines.length - 1));
  let idx = 0;
  for (let i = 0; i < line; i++) idx += lines[i].length + 1;
  const col = Math.floor(relX / Math.max(4, fontSize * 0.55));
  idx += Math.min(col, (lines[line] ?? lines[lines.length - 1] ?? "").length);
  return Math.min(Math.max(0, idx), el.value.length);
}

function expandBarButtonHtml() {
  return `<button type="button" class="gg-prompt-expand-bar" title="Expand" aria-label="Expand"></button>`;
}

/** @param {{ textareaClass: string, text?: string, placeholder?: string, title?: string, native?: boolean, cutId?: string, rows?: number }} p */
export function expandableFieldWrapHtml(p) {
  const ro = p.native ? " readonly" : " disabled";
  const expandBar = p.native ? expandBarButtonHtml() : "";
  const dataCut = p.cutId ? ` data-cut-id="${escHtml(p.cutId)}"` : "";
  const rows = p.rows != null ? p.rows : 3;
  return `<div class="gg-prompt-field-wrap"${dataCut}><textarea class="${escHtml(p.textareaClass)}" rows="${rows}" placeholder="${escHtml(p.placeholder)}"${ro} title="${escHtml(p.title)}">${escHtml(p.text)}</textarea>${expandBar}</div>`;
}

/** Dialog shell; caller sets textarea value after insert (avoids HTML in field text). */
export function fieldExpandModalShellHtml(kind = "prompt") {
  const cfg = FIELD_EXPAND_MODAL[kind] || FIELD_EXPAND_MODAL.prompt;
  return `<div class="gg-modal gg-prompt-edit-modal" role="dialog" aria-label="${escHtml(cfg.ariaLabel)}">
      <div class="gg-prompt-edit-head">
        <h3 class="gg-modal-title">${escHtml(cfg.title)}</h3>
        <button type="button" class="gg-btn gg-prompt-edit-fs" title="Fullscreen" aria-label="Fullscreen">⛶</button>
      </div>
      <textarea class="gg-prompt-edit-text" spellcheck="true" autocomplete="off"></textarea>
      <div class="gg-modal-actions">
        <button type="button" class="gg-btn gg-modal-cancel">Cancel</button>
        <button type="button" class="gg-btn gg-primary gg-prompt-edit-ok">OK</button>
      </div>
    </div>`;
}

/** @deprecated use fieldExpandModalShellHtml */
export function promptExpandModalShellHtml() {
  return fieldExpandModalShellHtml("prompt");
}

/** @param {{ native?: boolean, text?: string, placeholder?: string, title?: string, thumb?: string, bindLabel?: string }} p */
export function promptFieldRowHtml(p) {
  const bind = p.bindLabel
    ? `<div class="gg-app-bind" title="This prompt is written to this widget when you queue">${escHtml(p.bindLabel)}</div>`
    : "";
  return `<div class="gg-cut-thumb-col">${p.thumb || ""}</div><div class="gg-prompt-col">${bind}${expandableFieldWrapHtml({
    textareaClass: "gg-prompt-text",
    text: p.text,
    placeholder: p.placeholder,
    title: p.title,
    native: p.native,
  })}</div>`;
}

/** Caption list row (same expand bar + wrap as prompt). */
export function captionFieldRowHtml(p) {
  const thumbCol = p.thumb != null ? `<div class="gg-cut-thumb-col">${p.thumb || ""}</div>` : "";
  return `${thumbCol}${expandableFieldWrapHtml({
    textareaClass: "gg-caption-text",
    text: p.text,
    placeholder: p.placeholder,
    title: p.title,
    native: p.native,
    cutId: p.cutId,
    rows: p.rows,
  })}`;
}
