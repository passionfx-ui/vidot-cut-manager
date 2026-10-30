/** Pure decision: close previous Gonggan shot tab after a successful cut switch load. */
export function shouldClosePreviousShotTab({
  previousOpen,
  previousOwned,
  previousIsNew,
  previousActive,
  previousModified,
  loadOk,
}) {
  if (!loadOk) return { close: false, reason: "load failed" };
  if (!previousOpen) return { close: false, reason: "previous not open" };
  if (!previousOwned) return { close: false, reason: "previous not gonggan-owned" };
  if (previousIsNew) return { close: false, reason: "same tab as new" };
  if (previousActive) return { close: false, reason: "previous still active" };
  if (previousModified) return { close: false, reason: "previous modified" };
  return { close: true, reason: "replace previous shot tab" };
}
