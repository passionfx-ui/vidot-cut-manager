/** Pure context-menu item lists for cut cards, timeline clips and scene headers (no DOM). */

export const REGEN_NATIVE_TIP = "Regen is available for imported projects only";
export const SINGLE_CUT_TIP = "Select a single cut";
export const SDK_BUSY_TIP = "Comfy SDK is busy";
export const SDK_OFF_TIP = "Comfy SDK not ready";
export const TRASH_TIP = "Deleted cuts – click to restore";

/**
 * Same conditions as the cut panel buttons: Regen is hidden on native projects and off while
 * the SDK is busy or not ready; Send last output is off while the SDK is busy. Menus act on one cut.
 * @param {{ native?: boolean, multi?: boolean, sdkBusy?: boolean, sdkOk?: boolean }} ctx
 */
export function sdkActionState(ctx = {}) {
  const regenTitle = ctx.native
    ? REGEN_NATIVE_TIP
    : ctx.multi
      ? SINGLE_CUT_TIP
      : ctx.sdkBusy
        ? SDK_BUSY_TIP
        : !ctx.sdkOk
          ? SDK_OFF_TIP
          : "";
  const sendTitle = ctx.multi ? SINGLE_CUT_TIP : ctx.sdkBusy ? SDK_BUSY_TIP : "";
  return {
    regen: { disabled: !!regenTitle, title: regenTitle },
    send: { disabled: !!sendTitle, title: sendTitle },
  };
}

/**
 * Items shared by the cut card menu and the timeline clip menu.
 * @param {{ native?: boolean, multi?: boolean, needsRedo?: boolean, sdkBusy?: boolean, sdkOk?: boolean, readonlyTip?: string }} ctx
 */
export function cutActionItems(ctx = {}) {
  const nat = !!ctx.native;
  const tip = nat ? "" : ctx.readonlyTip || "";
  const s = sdkActionState(ctx);
  return {
    redo: { key: "redo", label: ctx.needsRedo ? "Clear needs redo" : "Mark needs redo", disabled: !nat, title: tip },
    rename: { key: "rename", label: "Rename…", disabled: !nat || !!ctx.multi, title: tip },
    regen: { key: "regen", label: "Regen", disabled: s.regen.disabled, title: s.regen.title },
    send: { key: "send", label: "Send last output", disabled: s.send.disabled, title: s.send.title },
    del: { key: "del", label: "Delete", danger: true },
  };
}

/**
 * @param {{ native?: boolean, multi?: boolean, needsRedo?: boolean, sdkBusy?: boolean, sdkOk?: boolean,
 *   readonlyTip?: string, canMoveUp?: boolean, canMoveDown?: boolean, inScene?: boolean, anyInScene?: boolean,
 *   trashLabel?: string, trashCount?: number }} ctx
 */
export function cutCardMenuItems(ctx = {}) {
  const nat = !!ctx.native;
  const a = cutActionItems(ctx);
  const moveItems = nat
    ? [
        { key: "moveUp", label: "Move up", disabled: !ctx.canMoveUp },
        { key: "moveDown", label: "Move down", disabled: !ctx.canMoveDown },
        { key: "moveToScene", label: "Move to scene \u25B8", disabled: false },
      ]
    : [];
  return [
    ...moveItems,
    { key: "group", label: "Group into Scene" },
    { key: "split", label: "Split scene", disabled: !ctx.inScene },
    { key: "removeFromScene", label: "Remove from Scene", disabled: !ctx.inScene && !ctx.anyInScene },
    a.redo,
    a.rename,
    { key: "addCut", label: "Add Cut" },
    a.regen,
    a.send,
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
  return [{ key: "open", label: "Open cut" }, a.regen, a.send, a.redo, a.rename, a.del];
}

/** @param {{ collapsed?: boolean, cutCount?: number }} ctx */
export function sceneMenuItems(ctx = {}) {
  const empty = !((ctx.cutCount || 0) > 0);
  return [
    { key: "addCut", label: "Add Cut", disabled: empty },
    { key: "selectCuts", label: "Select cuts", disabled: empty },
    { key: "toggleCollapse", label: ctx.collapsed ? "Expand" : "Collapse" },
    { key: "rename", label: "Rename" },
    { key: "ungroup", label: "Ungroup" },
    { key: "deleteScene", label: "Delete Scene", danger: true },
  ];
}

/** Cut ids of a scene in timeline order (cuts missing from the timeline are skipped). */
export function sceneCutIds(timelineCuts, group) {
  const members = new Set((group && group.cut_ids) || []);
  return (Array.isArray(timelineCuts) ? timelineCuts : []).filter((c) => c && members.has(c.id)).map((c) => c.id);
}

/**
 * Attach `actions[key]` (and `submenus[key]` when given) to each item; keys are dropped.
 * Items without a handler are disabled so they never look clickable while doing nothing.
 */
export function attachMenuActions(items, actions = {}, submenus = {}) {
  return (items || []).map(({ key, ...it }) => {
    const out = { ...it };
    const sub = submenus[key];
    if (sub) out.submenu = sub;
    else if (typeof actions[key] === "function") out.action = actions[key];
    else out.disabled = true;
    return out;
  });
}
