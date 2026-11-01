/** Timeline clip scene band (label above thumbnail). */

export function showTimelineSceneBand(cut) {
  return !!(cut && cut.group_id && String(cut.group_name || "").trim());
}

export function isSceneRunStart(cut, prevCut) {
  return !!(cut?.group_id && (!prevCut || prevCut.group_id !== cut.group_id));
}
