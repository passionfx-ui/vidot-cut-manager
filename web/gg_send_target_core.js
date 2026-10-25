/** Resolve which cut should receive send-last-output (pure, no DOM). */

export function resolveSendTarget({ lastPromptId, jobs, projectId, selectedCutId, cutIds }) {
  const ids = Array.isArray(cutIds) ? cutIds : [];
  const idSet = new Set(ids.filter(Boolean));
  const sel = typeof selectedCutId === "string" ? selectedCutId : "";

  const fallback = () => ({
    cutId: idSet.has(sel) ? sel : "",
    redirected: false,
  });

  if (!lastPromptId || !projectId) return fallback();

  const list = Array.isArray(jobs) ? jobs : [];
  for (const j of list) {
    if (!j || typeof j !== "object") continue;
    const pid = j.projectId;
    const cid = j.cutId;
    const promptId = j.promptId;
    if (
      promptId === lastPromptId &&
      pid === projectId &&
      typeof cid === "string" &&
      idSet.has(cid)
    ) {
      return { cutId: cid, redirected: cid !== sel };
    }
  }
  return fallback();
}
