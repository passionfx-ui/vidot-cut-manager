/** Shared Shots scene-group list for the Info and Caption views (pure HTML strings, no DOM). */

import { normalizeListMode } from "./gg_story_core.js";

const escHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Per-cut row content for a list mode: "info" (card) or "caption" (caption field only). */
export function rowContentKind(mode) {
  return normalizeListMode(mode) === "caption" ? "caption" : "info";
}

/** One cut row: the same `li.gg-cut` shell in both views, so selection, drag and menus bind the same way. */
export function cutRowShellHtml({ id, kind, selected, content }) {
  const cls = `gg-cut${kind === "caption" ? " gg-cut-caption" : ""}${selected ? " gg-sel" : ""}`;
  return `<li class="${cls}" data-cut-id="${escHtml(id)}">${content}</li>`;
}

/** Caption view row content: the Info view's thumbnail (`thumb` is its `.gg-cut-thumb` HTML) beside the caption field. */
export function captionRowContentHtml({ thumb = "", text, placeholder, title, native }) {
  const ro = native ? " readonly" : " disabled";
  return `<div class="gg-cut-thumb-col">${thumb}</div><textarea class="gg-caption-text" rows="3" placeholder="${escHtml(placeholder)}"${ro} title="${escHtml(title)}">${escHtml(text)}</textarea>`;
}

/**
 * Scene sections (from shotsSections) to list HTML. Group headers are written once per scene;
 * `cutHtml(cut)` supplies each row, the only part that differs between views.
 * @param {{ type: string, group: any, cuts: any[] }[]} sections
 * @param {{ cutHtml: (cut: any) => string, groupHue?: (id: string) => number, groupProgress?: (cuts: any[]) => string }} opts
 */
export function groupedListHtml(sections, { cutHtml, groupHue = () => 200, groupProgress = () => "" }) {
  return (sections || []).map((sec) => {
    const rows = sec.cuts.map((c) => cutHtml(c)).join("");
    if (sec.type === "ungrouped") {
      return `<section class="gg-grp-sec gg-grp-loose"><header class="gg-grp-head">Ungrouped <span class="gg-grp-meta">${sec.cuts.length}</span></header><ol class="gg-cutlist">${rows}</ol></section>`;
    }
    const g = sec.group;
    const collapsed = !!g.collapsed;
    return `<section class="gg-grp-sec" data-group-id="${escHtml(g.id)}" style="--gg-grp:${groupHue(g.id)}">
        <header class="gg-grp-head">
          <button type="button" class="gg-grp-fold" title="Collapse or expand">${collapsed ? "▸" : "▾"}</button>
          <span class="gg-grp-title">Scene · ${escHtml(g.name)}</span>
          <span class="gg-grp-prog">${escHtml(groupProgress(sec.cuts))}</span>
          <span class="gg-grp-meta">${sec.cuts.length}</span>
          <button type="button" class="gg-grp-ren" title="Rename scene">✎</button>
          <button type="button" class="gg-grp-del" title="Delete scene (cuts become ungrouped)">×</button>
        </header>
        <ol class="gg-cutlist"${collapsed ? " hidden" : ""}>${rows}</ol>
      </section>`;
  }).join("");
}
