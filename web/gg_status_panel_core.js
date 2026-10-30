/** Shots selection bar and status panel (bottom of the sidebar): view models only, no DOM. */

import { formatCutHeaderLengths, formatCutVersionStatus } from "./gg_cuts_core.js";
import { idleStateView, renderBadgeView } from "./gg_render_status_core.js";

/**
 * Selection bar: always shown with the same class (so the same fixed height); with nothing selected
 * it stays visible and its actions are just disabled.
 * @param {{ count?: number, anyGrouped?: boolean, selSize?: number }} s
 *   count: selected cuts on the shown timeline; anyGrouped: one of them is in a scene; selSize: raw selection size
 */
export function selectionBarView(s = {}) {
  const n = Math.max(0, Number(s.count) || 0);
  return {
    className: "gg-selbar",
    countText: String(n),
    group: { disabled: n === 0 },
    ungroup: { disabled: !s.anyGrouped },
    clear: { disabled: !(Number(s.selSize) > 0) },
  };
}

/**
 * Icon row under the cut list (replaces the selection bar): always shown at the same fixed height.
 * All three are off while no project is open. On a native project New scene always adds an empty
 * scene, so it needs no selection; on an imported project it groups the selected cuts.
 * @param {{ count?: number, hasProject?: boolean, native?: boolean }} s
 *   count: cuts that Delete (and New scene on imported projects) would act on
 */
export function iconRowView(s = {}) {
  const n = s.hasProject ? Math.max(0, Number(s.count) || 0) : 0;
  return {
    className: "gg-iconrow",
    scene: { disabled: s.hasProject && s.native ? false : n === 0, title: "New scene" },
    cut: { disabled: !s.hasProject, title: "New cut" },
    del: { disabled: n === 0, title: "Delete" },
  };
}

/**
 * @param {{ count?: number, cut?: object|null, cutLabel?: string, name?: string, render?: object|null }} s
 *   count: selected cuts; cut: the single selected cut; render: `renderStatus.cutView(...)` for it.
 * @returns {{ kind: 'empty'|'multi', text: string }
 *   | { kind: 'cut', title: string, label: string, name: string, status: { mode: string, text: string, title: string },
 *       length: { text: string, title: string }, version: { text: string, title: string } }}
 */
export function statusPanelView(s = {}) {
  const count = Number(s.count) || 0;
  if (count > 1) return { kind: "multi", text: `${count} cuts selected` };
  const cut = s.cut;
  if (count < 1 || !cut) return { kind: "empty", text: "No cut selected" };
  const label = String(s.cutLabel || "").trim();
  const name = String(s.name || "").trim();
  const title = [label, name].filter(Boolean).join(" ");
  const badge = renderBadgeView(s.render || null);
  let status;
  if (badge.show) status = { mode: badge.mode, text: badge.text, title: badge.title };
  else {
    const hasMedia = !!cut.media?.id;
    const idle = idleStateView(hasMedia);
    status = { mode: hasMedia ? "done" : "idle", text: idle.text, title: idle.title };
  }
  const len = formatCutHeaderLengths(cut);
  const ver = formatCutVersionStatus(cut);
  return {
    kind: "cut",
    title,
    label,
    name,
    status,
    length: { text: `Length ${len.text}`, title: len.title },
    version: { text: ver.text || "No versions yet", title: ver.title },
  };
}
