/** Pure context-menu item lists for cut cards, timeline clips and scene headers (no DOM). */

import { queueButtonState } from "./gg_batch_render_core.js";
import { importButtonState, IMPORT_MENU_LABEL } from "./gg_version_strip_core.js";
import { aiCutSplitButtonState } from "./gg_cut_split_model_core.js";

export const SINGLE_CUT_TIP = "Select a single cut";
export const SDK_BUSY_TIP = "Comfy SDK is busy";
export const SDK_OFF_TIP = "Comfy SDK not ready";
export const BUSY_TIP = "Busy, try again in a moment";
export const REGEN_EMPTY_TIP = "Empty cut: no workflow to queue";
export const TRASH_TIP = "Deleted cuts – click to restore";
export const I2V_NO_IMAGE_TIP = "This cut has no image version yet";
export const SELECT_ALL_LABEL = "Select All (Ctrl+A)";
export const MENU_SEPARATOR = Object.freeze({ key: "sep", separator: true });
export const AI_MAKE_CUT_MENU_LABEL = "AI Make Cut…";

export function aiMakeCutMenuItem(useAi) {
  const s = aiCutSplitButtonState(useAi !== false);
  return { key: "aiMakeCut", label: AI_MAKE_CUT_MENU_LABEL, disabled: s.disabled, title: s.disabled ? s.title : "" };
}

/**
 * @param {{ native?: boolean, multi?: boolean, needsRedo?: boolean, sdkBusy?: boolean, sdkOk?: boolean,
 *   emptyCut?: boolean, readonlyTip?: string }} ctx
 */
export function cutActionItems(ctx = {}) {
  const nat = !!ctx.native;
  const tip = nat ? "" : ctx.readonlyTip || "";
  return {
    redo: {
      key: "redo",
      label: ctx.needsRedo ? "Clear Mark for Redo" : "Mark for Redo",
      disabled: !nat,
      title: tip,
    },
    rename: { key: "rename", label: "Rename…", disabled: !nat || !!ctx.multi, title: tip },
    del: { key: "del", label: "Delete", danger: true },
  };
}

/**
 * @param {{ native?: boolean, multi?: boolean, needsRedo?: boolean, sdkBusy?: boolean, sdkOk?: boolean,
 *   emptyCut?: boolean, readonlyTip?: string, canMoveUp?: boolean, canMoveDown?: boolean, inScene?: boolean,
 *   anyInScene?: boolean, trashLabel?: string, trashCount?: number, queueCount?: number, queuedCount?: number,
 *   failedCount?: number, hasImage?: boolean, importBusy?: boolean, hasVersion?: boolean, aiMakeCut?: boolean,
 *   useAi?: boolean, hasListCuts?: boolean }} ctx
 */
export function cutCardMenuItems(ctx = {}) {
  const nat = !!ctx.native;
  const a = cutActionItems(ctx);
  const q = queueButtonState({ count: ctx.queueCount ?? 1, native: nat, busy: ctx.sdkBusy });
  const rq = queueButtonState({ count: ctx.failedCount || 0, native: nat, busy: ctx.sdkBusy });
  const i2vTitle = ctx.multi ? SINGLE_CUT_TIP : ctx.sdkBusy ? BUSY_TIP : !ctx.hasImage ? I2V_NO_IMAGE_TIP : "";
  const imp = importButtonState({ native: nat, hasCut: !ctx.multi, busy: ctx.importBusy });
  const importItem = { key: "importVer", label: IMPORT_MENU_LABEL, disabled: imp.disabled, title: imp.title };
  const setBestTitle = ctx.multi ? SINGLE_CUT_TIP : !ctx.hasVersion ? "This cut has no version yet" : "";
  const queueItems = [
    ...(ctx.queuedCount > 0 ? [{ key: "removeQueue", label: "Remove from Queue" }] : []),
    ...(ctx.failedCount > 0 ? [{ key: "requeue", label: "Re-queue", disabled: rq.disabled, title: rq.title }] : []),
  ];
  const moveItems = nat
    ? [
        { key: "moveUp", label: "Move Up", disabled: !ctx.canMoveUp },
        { key: "moveDown", label: "Move Down", disabled: !ctx.canMoveDown },
        { key: "moveToScene", label: "Move to Scene \u25B8", disabled: false },
      ]
    : [];
  return [
    { key: "addCut", label: "Add Cut" },
    ...(nat && ctx.aiMakeCut ? [aiMakeCutMenuItem(ctx.useAi)] : []),
    importItem,
    MENU_SEPARATOR,
    { key: "queueSel", label: "Generate Selected", disabled: q.disabled, title: q.title },
    ...(nat ? [{ key: "i2v", label: "Make Video", disabled: !!i2vTitle, title: i2vTitle }] : []),
    {
      key: "setBest",
      label: "Set as Best",
      disabled: !nat || !!setBestTitle,
      title: setBestTitle,
    },
    ...queueItems,
    MENU_SEPARATOR,
    ...moveItems,
    { key: "group", label: "Group" },
    { key: "ungroup", label: "Ungroup", disabled: !ctx.inScene && !ctx.anyInScene },
    { key: "split", label: "Split Scene", disabled: !ctx.inScene },
    a.redo,
    MENU_SEPARATOR,
    { key: "selectAll", label: SELECT_ALL_LABEL, disabled: !ctx.hasListCuts },
    a.rename,
    a.del,
    {
      key: "trash",
      label: ctx.trashLabel || "Trash…",
      disabled: !nat || !((ctx.trashCount || 0) > 0),
      title: nat ? TRASH_TIP : ctx.readonlyTip || "",
    },
  ];
}

/** Timeline clip menu: always one cut (the clicked clip). */
export function timelineClipMenuItems(ctx = {}) {
  const a = cutActionItems({ ...ctx, multi: false });
  const nat = !!ctx.native;
  const applyOrder = {
    key: "applyOrder",
    label: "Apply Order to Cuts",
    disabled: !nat,
    title: nat ? "Reorder the Shots cut list to match the timeline" : ctx.readonlyTip || "",
  };
  return [{ key: "open", label: "Open Cut" }, a.redo, a.rename, applyOrder, a.del];
}

/** @param {{ collapsed?: boolean, cutCount?: number }} ctx */
export function sceneMenuItems(ctx = {}) {
  const empty = !((ctx.cutCount || 0) > 0);
  return [
    { key: "addCut", label: "Add Cut", disabled: false },
    { key: "selectCuts", label: "Select Cuts", disabled: empty },
    { key: "toggleCollapse", label: ctx.collapsed ? "Expand" : "Collapse" },
    { key: "rename", label: "Rename" },
    { key: "ungroup", label: "Ungroup" },
  ];
}

export function sceneCutIds(timelineCuts, group) {
  const members = new Set((group && group.cut_ids) || []);
  return (Array.isArray(timelineCuts) ? timelineCuts : []).filter((c) => c && members.has(c.id)).map((c) => c.id);
}

export function attachMenuActions(items, actions = {}, submenus = {}) {
  return (items || []).map(({ key, ...it }) => {
    const out = { ...it };
    if (out.separator) return out;
    const sub = submenus[key];
    if (sub) out.submenu = sub;
    else if (typeof actions[key] === "function") out.action = actions[key];
    else out.disabled = true;
    return out;
  });
}

/** @deprecated Used only in tests mirroring legacy SDK menu helpers. */
export function sdkActionState(ctx = {}) {
  const sendTitle = ctx.multi ? SINGLE_CUT_TIP : ctx.sdkBusy ? SDK_BUSY_TIP : "";
  return {
    regen: { disabled: true, title: "" },
    send: { disabled: !!sendTitle, title: sendTitle },
  };
}
