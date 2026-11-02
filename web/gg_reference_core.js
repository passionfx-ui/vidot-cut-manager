/** Reference @mentions and link rows. No network, no model. Mirrors gg_project/ref_links.py. */

const CATEGORY_ORDER = ["Character", "Place", "Prop", "Style", "Other"];
const NAME_CHAR = /[0-9A-Za-z_]/;

export function mentionToken(name) {
  return String(name ?? "").trim().replace(/\s+/g, "_");
}

function preparedRefs(refs) {
  const rows = [];
  for (const ref of refs || []) {
    const token = mentionToken(ref?.name);
    if (!token || !ref?.id) continue;
    rows.push({ ref, token, fold: token.toLowerCase() });
  }
  rows.sort((a, b) => {
    if (b.fold.length !== a.fold.length) return b.fold.length - a.fold.length;
    const ca = CATEGORY_ORDER.indexOf(a.ref.category);
    const cb = CATEGORY_ORDER.indexOf(b.ref.category);
    if ((ca < 0 ? 99 : ca) !== (cb < 0 ? 99 : cb)) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
    return String(a.ref.id).localeCompare(String(b.ref.id));
  });
  return rows;
}

function matchToken(raw, prepared) {
  const folded = String(raw || "").toLowerCase();
  for (const row of prepared) {
    if (folded === row.fold) return row;
    if (!folded.startsWith(row.fold)) continue;
    const next = folded[row.fold.length];
    if (next == null || !NAME_CHAR.test(next)) return row;
  }
  return null;
}

/** @Name at line start or after whitespace. Longest name wins. Unknown tokens have refId null. */
export function iterMentions(text, refs) {
  const prepared = preparedRefs(refs);
  const src = String(text ?? "");
  const re = /(?:^|\s)@([^\s@]+)/g;
  const out = [];
  let match = re.exec(src);
  while (match) {
    const raw = match[1];
    const hit = matchToken(raw, prepared);
    const at = match.index + match[0].length - raw.length - 1;
    out.push({
      at,
      end: at + 1 + (hit ? hit.token.length : raw.length),
      raw: hit ? hit.token : raw,
      refId: hit ? hit.ref.id : null,
      name: hit ? String(hit.ref.name || "") : "",
    });
    match = re.exec(src);
  }
  return out;
}

export function replaceMentions(text, refs) {
  const src = String(text ?? "");
  const spans = iterMentions(src, refs).filter((row) => row.refId);
  if (!spans.length) return src;
  let out = src;
  for (let i = spans.length - 1; i >= 0; i--) {
    const row = spans[i];
    const name = String(row.name || "").trim().replace(/\s+/g, " ");
    if (out[row.at] !== "@") continue;
    out = out.slice(0, row.at) + name + out.slice(row.end);
  }
  return out;
}

function cleanSlot(value) {
  const slot = String(value ?? "").trim();
  if (!slot || slot.length > 80) return null;
  return slot;
}

export function cleanLinks(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const row of value) {
    const rid = String(row?.ref_id || row?.refId || "").trim();
    if (!rid || rid.length > 80 || seen.has(rid)) continue;
    seen.add(rid);
    const source = row?.source === "mention" ? "mention" : "manual";
    out.push({ ref_id: rid, source, slot: cleanSlot(row?.slot) });
  }
  return out;
}

/** Same merge as the server: incoming manuals (or previous), mentions recomputed, slots kept. */
export function mergeRefLinks(previous, incoming, prompt, refs) {
  const prev = cleanLinks(previous);
  const base = incoming == null ? prev : cleanLinks(incoming);
  const slots = new Map();
  for (const row of [...prev, ...base]) slots.set(row.ref_id, row.slot);
  const out = [];
  const seen = new Set();
  for (const row of base) {
    if (row.source !== "manual" || seen.has(row.ref_id)) continue;
    seen.add(row.ref_id);
    out.push({ ref_id: row.ref_id, source: "manual", slot: slots.get(row.ref_id) || null });
  }
  for (const hit of iterMentions(prompt, refs)) {
    if (!hit.refId || seen.has(hit.refId)) continue;
    seen.add(hit.refId);
    out.push({ ref_id: hit.refId, source: "mention", slot: slots.get(hit.refId) || null });
  }
  return out;
}

export function unknownMentionTokens(prompt, refs) {
  const seen = new Set();
  const out = [];
  for (const hit of iterMentions(prompt, refs)) {
    if (hit.refId || seen.has(hit.raw)) continue;
    seen.add(hit.raw);
    out.push(hit.raw);
  }
  return out;
}

function refRecord(refs, stored, refId) {
  const live = (refs || []).find((r) => r && r.id === refId);
  if (live) return { ref: live, missing: false };
  const prev = (stored || []).find((r) => r && (r.ref_id === refId || r.id === refId));
  return { ref: prev || null, missing: true };
}

/** Chip rows for the cut info panel. Missing means the reference was trashed or removed. */
export function displayRefLinks(prompt, storedLinks, refs) {
  const merged = mergeRefLinks(storedLinks, null, prompt, refs);
  return merged.map((row) => {
    const found = refRecord(refs, storedLinks, row.ref_id);
    const ref = found.ref || {};
    const name = String(ref.name || "").trim();
    return {
      ref_id: row.ref_id,
      source: row.source,
      slot: row.slot,
      name,
      category: ref.category || "Other",
      description: typeof ref.description === "string" ? ref.description : "",
      missing: found.missing || !!ref.missing,
      media: ref.media || null,
    };
  });
}

export function injectPromptText(text, promptForMentions, storedLinks, refs) {
  const source = promptForMentions == null ? String(text ?? "") : String(promptForMentions);
  const replaced = replaceMentions(text, refs);
  const lines = [];
  for (const row of displayRefLinks(source, storedLinks, refs)) {
    if (row.missing) continue;
    const name = String(row.name || "").trim().replace(/\s+/g, " ") || "Reference";
    lines.push(`- ${name} (${row.category || "Other"}): ${row.description || ""}`);
  }
  if (!lines.length) return replaced;
  return `${replaced}\n\nReferences:\n${lines.join("\n")}`;
}

/** image when a slot is set and the reference has a still or a video (first frame). Otherwise text. */
export function referenceUseMode(link) {
  if (!link || link.missing || !link.slot) return "text";
  const media = link.media;
  if (!media?.id) return "text";
  if (media.kind === "video" || media.animated || media.kind === "image") return "image";
  return "text";
}

/** Confirm line. Empty when this cut has no usable linked reference. */
export function referencesConfirmLine(links) {
  const parts = [];
  for (const link of links || []) {
    if (!link || link.missing) continue;
    const name = String(link.name || "").trim() || "Reference";
    parts.push(`${name} (${referenceUseMode(link)})`);
  }
  if (!parts.length) return "";
  return `References: ${parts.join(", ")}`;
}

/**
 * @ query at the caret. Null when @ is not a mention (mid-word, or no @).
 * @returns {{ at: number, prefix: string, items: {id: string, name: string, token: string}[] } | null}
 */
export function mentionAutocomplete(text, caret, refs) {
  const src = String(text ?? "");
  const pos = Math.max(0, Math.min(src.length, Number(caret) || 0));
  const upto = src.slice(0, pos);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(upto);
  if (!match) return null;
  const prefix = match[1].toLowerCase();
  const at = match.index + match[0].length - match[1].length - 1;
  const items = [];
  const seen = new Set();
  for (const ref of refs || []) {
    const token = mentionToken(ref?.name);
    if (!token || !ref?.id || seen.has(ref.id)) continue;
    if (prefix && !token.toLowerCase().startsWith(prefix)) continue;
    seen.add(ref.id);
    items.push({ id: ref.id, name: String(ref.name || ""), token });
  }
  items.sort((a, b) => a.name.localeCompare(b.name) || a.token.localeCompare(b.token));
  return { at, prefix: match[1], items };
}

export function applyMention(text, at, caret, token) {
  const src = String(text ?? "");
  const insert = `@${token}`;
  const next = src.slice(0, at) + insert + src.slice(caret);
  return { text: next, caret: at + insert.length };
}

export function stripMention(text, name) {
  const token = mentionToken(name);
  if (!token) return String(text ?? "");
  const re = new RegExp(`(^|\\s)@${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9A-Za-z_])`, "gi");
  return String(text ?? "").replace(re, (_all, lead) => lead);
}

export function referenceStatusText(ref, badgeText) {
  if (badgeText) return badgeText;
  const media = ref?.media;
  if (media?.kind === "video" || media?.animated) return "Video";
  if (media?.id) return "Image";
  return "Empty";
}
