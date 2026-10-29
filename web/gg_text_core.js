/** Small copy helpers (text only, no logic). */

/** Joins a message and a follow-up sentence without a double period. */
export function sentence(text, tail = "") {
  const head = String(text ?? "").trim().replace(/[.\s]+$/u, "");
  const t = String(tail ?? "").trim();
  if (!head) return t;
  if (!t) return /[!?]$/u.test(head) ? head : `${head}.`;
  return /[!?]$/u.test(head) ? `${head} ${t}` : `${head}. ${t}`;
}
