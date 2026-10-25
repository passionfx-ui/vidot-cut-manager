/**
 * Cut selection vs workflow tab load (pure logic, no DOM).
 */

/**
 * @param {{ multi?: boolean, range?: boolean, fromTimeline?: boolean }} opts
 */
export function shouldScheduleCutWorkflowLoad(opts = {}) {
  const { multi, range, fromTimeline } = opts;
  if (multi || range || fromTimeline) return false;
  return true;
}

/**
 * @param {{ fromTimeline?: boolean }} opts
 */
export function shouldCancelPendingWorkflowLoad(opts = {}) {
  return !!opts.fromTimeline;
}

/**
 * @param {{
 *   multi?: boolean,
 *   range?: boolean,
 *   fromTimeline?: boolean,
 *   cutId?: string,
 *   graphCutId?: string,
 *   projectId?: string,
 *   graphProjectId?: string,
 * }} opts
 */
export function shouldResetOpenTabTracking(opts = {}) {
  const {
    multi,
    range,
    fromTimeline,
    cutId = "",
    graphCutId = "",
    projectId = "",
    graphProjectId = "",
  } = opts;
  if (!shouldScheduleCutWorkflowLoad({ multi, range, fromTimeline })) return false;
  if (graphCutId !== cutId) return true;
  if (projectId && graphProjectId && graphProjectId !== projectId) return true;
  return false;
}

/**
 * Show the "open in canvas" marker on a Shots list card.
 * @param {{
 *   cutId?: string,
 *   openCutId?: string,
 *   selectedCutId?: string,
 *   shotTabOpen?: boolean,
 *   sameProject?: boolean,
 * }} opts
 */
export function shouldShowOpenTabMarker(opts = {}) {
  const {
    cutId = "",
    openCutId = "",
    selectedCutId = "",
    shotTabOpen = false,
    sameProject = true,
  } = opts;
  if (!shotTabOpen || !sameProject) return false;
  if (!openCutId || !cutId) return false;
  if (cutId !== openCutId) return false;
  if (cutId === selectedCutId) return false;
  return true;
}

/** @deprecated alias */
export const isOpenTabCut = shouldShowOpenTabMarker;
