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
 * Default name for a new scene: `Scene N` with the lowest N ≥ 1 that no scene uses yet (case-insensitive).
 * @param {{ name?: string }[]} groups
 */
export function nextSceneName(groups) {
  const used = new Set((groups || []).map((g) => String(g?.name ?? "").trim().toLowerCase()));
  let n = 1;
  while (used.has(`scene ${n}`)) n += 1;
  return `Scene ${n}`;
}

let sceneIdSeq = 0;

/** Scene group id that stays unique within one page even for several clicks in the same millisecond. */
export function newSceneGroupId(now = Date.now()) {
  sceneIdSeq = (sceneIdSeq + 1) % 1296;
  return `s${now.toString(36)}${sceneIdSeq.toString(36).padStart(2, "0")}`;
}

/**
 * Groups with one more empty scene appended at the end (shown last, just above Ungrouped).
 * @param {{ id: string, name?: string, cut_ids?: string[] }[]} groups
 * @param {string} id
 * @returns {{ groups: object[], scene: { id: string, name: string, cut_ids: string[], collapsed: boolean } }}
 */
export function withNewEmptyScene(groups, id) {
  const out = (groups || []).map((g) => ({ ...g, cut_ids: [...(g.cut_ids || [])] }));
  const scene = { id, name: nextSceneName(out), cut_ids: [], collapsed: false };
  out.push(scene);
  return { groups: out, scene };
}

/**
 * Take cuts out of their scenes (in place). A scene that loses its last cut here is dropped; a scene
 * that was already empty (made with New scene) stays.
 * @param {{ cut_ids?: string[] }[]} groups
 * @param {string[]} cutIds
 */
export function stripCutsFromGroups(groups, cutIds) {
  const drop = new Set(cutIds);
  return (groups || []).filter((g) => {
    const before = g.cut_ids || [];
    g.cut_ids = before.filter((id) => !drop.has(id));
    return g.cut_ids.length || !before.length;
  });
}

/**
 * Shots list sections: scenes in order of their first cut, then one Ungrouped section with every cut
 * that is in no scene (wherever those cuts sit in the cut order). An empty scene goes right after the
 * lowest-shown scene listed before it in `groups` (so a new one appended to `groups` is the last scene).
 * @param {{ id: string }[]} cuts cut list order
 * @param {{ id: string, cut_ids?: string[] }[]} groups
 * @returns {{ type: "group"|"ungrouped", group: any, cuts: any[] }[]}
 */
export function shotsSections(cuts, groups) {
  const byId = new Map((cuts || []).map((c, i) => [c.id, { c, i }]));
  const inGrp = new Set();
  const seen = new Set();
  const all = [];
  for (const g of groups || []) {
    if (!g || seen.has(g.id)) continue;
    seen.add(g.id);
    const ids = [...new Set(g.cut_ids || [])].filter((id) => byId.has(id) && !inGrp.has(id));
    ids.forEach((id) => inGrp.add(id));
    ids.sort((a, b) => byId.get(a).i - byId.get(b).i);
    // A group whose ids are all unknown / taken is stale, not an empty scene.
    if (ids.length || !(g.cut_ids || []).length) all.push({ type: "group", group: g, cuts: ids.map((id) => byId.get(id).c) });
  }
  const secs = all.filter((s) => s.cuts.length);
  secs.sort((a, b) => byId.get(a.cuts[0].id).i - byId.get(b.cuts[0].id).i);
  all.forEach((s, k) => {
    if (s.cuts.length) return;
    const at = Math.max(-1, ...all.slice(0, k).map((p) => secs.indexOf(p))) + 1;
    secs.splice(at, 0, s);
  });
  const loose = (cuts || []).filter((c) => !inGrp.has(c.id));
  if (loose.length) secs.push({ type: "ungrouped", group: null, cuts: loose });
  return secs;
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
      return `<section class="gg-grp-sec gg-grp-loose"><header class="gg-grp-head" title="Cuts not in a scene"><span class="gg-grp-title">Ungrouped</span><span class="gg-grp-meta">${sec.cuts.length}</span></header><ol class="gg-cutlist">${rows}</ol></section>`;
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
