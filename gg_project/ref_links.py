"""Reference links on a cut. No model calls.

A link stores a reference id, so renaming the reference keeps the link.
`source` is "manual" (the References row) or "mention" (an @Name in the prompt).
Mention links are derived from the prompt. A trashed reference stays on the link
and is reported missing.
"""
from __future__ import annotations

import re
from typing import Any

REF_CATEGORIES = ("Character", "Place", "Prop", "Style", "Other")
_CAT_ORDER = {name: i for i, name in enumerate(REF_CATEGORIES)}
_NAME_CHAR = re.compile(r"[0-9A-Za-z_]")
_AT = re.compile(r"(?:^|\s)@([^\s@]+)")
_DESC_MAX = 4000
_ID_MAX = 80
_SLOT_MAX = 80


def mention_token(name: str) -> str:
    """How a reference name is written after @. Spaces become underscores."""
    return re.sub(r"\s+", "_", " ".join(str(name or "").split()))


def is_reference_row(row: Any) -> bool:
    return isinstance(row, dict) and row.get("kind") == "reference"


def active_references(cuts: Any) -> list[dict[str, Any]]:
    if not isinstance(cuts, dict):
        return []
    out = []
    for row in cuts.values():
        if is_reference_row(row) and not row.get("deleted_at"):
            out.append(row)
    return out


def _prepared(refs: list[dict[str, Any]]) -> list[tuple[dict[str, Any], str, str]]:
    rows = []
    for ref in refs:
        token = mention_token(ref.get("name") if isinstance(ref, dict) else "")
        if not token:
            continue
        rows.append((ref, token, token.casefold()))
    rows.sort(key=lambda item: (-len(item[2]), _CAT_ORDER.get(str(item[0].get("category") or ""), 99), str(item[0].get("id") or "")))
    return rows


def _match_token(raw: str, prepared: list[tuple[dict[str, Any], str, str]]) -> tuple[dict[str, Any] | None, str]:
    folded = raw.casefold()
    for ref, token, fold in prepared:
        if folded == fold:
            return ref, token
        if folded.startswith(fold) and (len(folded) == len(fold) or not _NAME_CHAR.match(folded[len(fold)])):
            return ref, token
    return None, raw


def iter_mentions(text: str, refs: list[dict[str, Any]]):
    """@Name only at the start of a line or after whitespace. Longest name wins."""
    prepared = _prepared(refs)
    for match in _AT.finditer(text or ""):
        raw = match.group(1)
        ref, token = _match_token(raw, prepared)
        at = match.start(1) - 1
        yield {"at": at, "raw": raw, "token": token if ref else raw, "ref": ref}


def replace_mentions(text: str, refs: list[dict[str, Any]]) -> str:
    """Known @Name becomes the plain reference name. Unknown @ tokens stay."""
    spans = [row for row in iter_mentions(text, refs) if row["ref"] is not None]
    if not spans:
        return text or ""
    out = text or ""
    for row in reversed(spans):
        name = " ".join(str(row["ref"].get("name") or "").split())
        token = mention_token(name)
        at = row["at"]
        end = at + 1 + len(token)
        if at < 0 or end > len(out) or out[at] != "@":
            continue
        out = out[:at] + name + out[end:]
    return out


def _clean_slot(value: Any) -> str | None:
    if value is None or value is False:
        return None
    if not isinstance(value, str):
        return None
    slot = value.strip()
    if not slot or len(slot) > _SLOT_MAX:
        return None
    return slot


def _clean_id(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    rid = value.strip()
    if not rid or len(rid) > _ID_MAX:
        return ""
    return rid


def clean_links(value: Any) -> list[dict[str, Any]]:
    """Stored or incoming link rows. Unknown shapes are dropped."""
    if not isinstance(value, list):
        return []
    out = []
    seen = set()
    for row in value:
        if not isinstance(row, dict):
            continue
        rid = _clean_id(row.get("ref_id"))
        if not rid or rid in seen:
            continue
        source = row.get("source")
        if source not in ("manual", "mention"):
            source = "manual"
        seen.add(rid)
        out.append({"ref_id": rid, "source": source, "slot": _clean_slot(row.get("slot"))})
    return out


def merge_ref_links(previous: Any, incoming: Any, prompt: str, refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Manual rows come from `incoming` when it is a list, else from `previous`.

    Mention rows are always recomputed from `prompt`. A manual link is not
    duplicated when the prompt also names that reference. Slots are kept.
    """
    prev = clean_links(previous)
    base = clean_links(incoming) if incoming is not None else prev
    slots: dict[str, str | None] = {}
    for row in prev + base:
        slots[row["ref_id"]] = row["slot"]
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in base:
        if row["source"] != "manual" or row["ref_id"] in seen:
            continue
        seen.add(row["ref_id"])
        out.append({"ref_id": row["ref_id"], "source": "manual", "slot": slots.get(row["ref_id"])})
    for hit in iter_mentions(prompt or "", refs):
        ref = hit["ref"]
        if ref is None:
            continue
        rid = _clean_id(ref.get("id"))
        if not rid or rid in seen:
            continue
        seen.add(rid)
        out.append({"ref_id": rid, "source": "mention", "slot": slots.get(rid)})
    return out


def _ref_by_id(cuts: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(cuts, dict):
        return {}
    return {cid: row for cid, row in cuts.items() if isinstance(row, dict)}


def generation_links(cuts: Any, cut: dict[str, Any], prompt: str | None = None) -> list[dict[str, Any]]:
    """Links used for one generation. Mentions are read from the prompt text."""
    if not isinstance(cut, dict):
        return []
    text = prompt if isinstance(prompt, str) else (cut.get("prompt") if isinstance(cut.get("prompt"), str) else "")
    merged = merge_ref_links(cut.get("ref_links"), None, text, active_references(cuts))
    by_id = _ref_by_id(cuts)
    out = []
    for row in merged:
        ref = by_id.get(row["ref_id"])
        missing = not is_reference_row(ref) or bool(ref.get("deleted_at"))
        name = ""
        category = "Other"
        description = ""
        if isinstance(ref, dict):
            name = str(ref.get("name") or "")
            category = str(ref.get("category") or "Other")
            description = ref.get("description") if isinstance(ref.get("description"), str) else ""
        out.append({
            "ref_id": row["ref_id"],
            "source": row["source"],
            "slot": row["slot"],
            "name": name,
            "category": category,
            "description": description,
            "missing": missing,
        })
    return out


def inject_prompt_text(text: str, cuts: Any, cut: dict[str, Any], prompt_for_mentions: str | None = None) -> str:
    """Replace @Name with the plain name, then append a References block for linked refs."""
    source = prompt_for_mentions if isinstance(prompt_for_mentions, str) else text
    refs = active_references(cuts)
    replaced = replace_mentions(text or "", refs)
    lines = []
    for row in generation_links(cuts, cut, source):
        if row["missing"]:
            continue
        name = " ".join(str(row["name"] or "").split()) or "Reference"
        category = row["category"] or "Other"
        description = row["description"] if isinstance(row["description"], str) else ""
        lines.append(f"- {name} ({category}): {description}")
    if not lines:
        return replaced
    block = "\n".join(lines)
    return f"{replaced}\n\nReferences:\n{block}"


def clean_description(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError("description must be a string")
    if len(value) > _DESC_MAX:
        raise ValueError(f"description must be at most {_DESC_MAX} characters")
    return value


def clean_refs_used(value: Any) -> list[dict[str, Any]]:
    """Version meta: what this run actually used. Unknown rows are dropped."""
    if not isinstance(value, list):
        return []
    out = []
    for row in value:
        if len(out) >= 40 or not isinstance(row, dict):
            continue
        rid = _clean_id(row.get("ref_id"))
        if not rid:
            continue
        name = str(row.get("name") or "")[:80]
        category = str(row.get("category") or "Other")[:40]
        mode = row.get("mode")
        if mode not in ("image", "text"):
            mode = "text"
        item = {"ref_id": rid, "name": name, "category": category, "mode": mode}
        slot = _clean_slot(row.get("slot"))
        if slot and mode == "image":
            item["slot"] = slot
        out.append(item)
    return out
