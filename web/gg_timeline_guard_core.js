// Stale-response guard for timeline loads: a slower, older GET must not overwrite a newer timeline.
// - the newest load request wins (older loads that return later are dropped),
// - a timeline set by a mutation response while a load was in flight wins over that load,
// - a load for a project that is no longer selected is dropped.
export function createTimelineGuard() {
  let loadSeq = 0;
  let mutEpoch = 0;
  return {
    /** Call when state.timeline is set by anything other than a load (mutation responses, etc.). */
    markMutation() {
      mutEpoch += 1;
    },
    /** Call right before starting a load request. */
    begin(pid) {
      loadSeq += 1;
      return { seq: loadSeq, mut: mutEpoch, pid };
    },
    /** True when the response for this token must be ignored. */
    isStale(token, currentPid) {
      return token.seq !== loadSeq || token.mut !== mutEpoch || token.pid !== currentPid;
    },
  };
}