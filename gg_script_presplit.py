"""Deterministic story -> cuts when the script already has cut boundaries (AI Make Cut skips the LLM)."""
from __future__ import annotations

import re
from typing import Any

try:
    from . import gg_ltx
except ImportError:
    import gg_ltx  # type: ignore

CAPTION_MODES = frozenset({"dialogue_only", "include_narration", "no_captions"})
DEFAULT_CAPTION_MODE = "dialogue_only"
DEFAULT_DURATION = 2.5
TITLE_WORDS = 5

# Cut header at line start (optional title after punctuation).
_RE_CUT = re.compile(
    r"^\s*(?:cut\s*)?(?:#|№)?\s*(\d+)\s*(?:[:\.\-–—]\s*|\s+)\s*(.*)?\s*$",
    re.IGNORECASE,
)
_RE_C = re.compile(r"^\s*c\s*(\d+)\s*(?:[:\.\-–—]\s*|\s+)\s*(.*)?\s*$", re.IGNORECASE)
_RE_SCENE_SHOT = re.compile(
    r"^\s*scene\s+(\d+)\s*[/\\]\s*shot\s+(\d+)\s*(?:[:\.\-–—]\s*|\s+)\s*(.*)?\s*$",
    re.IGNORECASE,
)
_RE_NUM_LIST = re.compile(r"^\s*(\d+)\.\s+(.+)\s*$")
_RE_DURATION = re.compile(
    r"(?:\(\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\s*\)|duration\s*[:=]\s*(\d+(?:\.\d+)?))",
    re.IGNORECASE,
)
_RE_SPEAKER = re.compile(r"^([A-Za-z][A-Za-z0-9 _\-]{0,30})\s*:\s+(.+)$")
_RE_QUOTED = re.compile(r'["“]([^"”\n]+)["”]|\'([^\n\']+)\'')


def normalize_caption_mode(mode: Any) -> str:
    if not isinstance(mode, str):
        return DEFAULT_CAPTION_MODE
    m = mode.strip().lower().replace("-", "_").replace(" ", "_")
    if m in ("dialogue", "dialogueonly", "dialogue_only"):
        return "dialogue_only"
    if m in ("include_narration", "narration", "all"):
        return "include_narration"
    if m in ("no_captions", "none", "off"):
        return "no_captions"
    return DEFAULT_CAPTION_MODE if m not in CAPTION_MODES else m


def _header_match(line: str) -> tuple[float, str, str] | None:
    for rx in (_RE_CUT, _RE_C):
        m = rx.match(line)
        if m:
            return float(m.group(1)), "cut", (m.group(2) or "").strip()
    m = _RE_SCENE_SHOT.match(line)
    if m:
        order = float(m.group(1)) + float(m.group(2)) / 1000.0
        label = f"Scene {m.group(1)} Shot {m.group(2)}"
        rest = (m.group(3) or "").strip()
        title = f"{label}: {rest}".strip(": ") if rest else label
        return order, "scene", title
    m = _RE_NUM_LIST.match(line)
    if m:
        return float(m.group(1)), "list", m.group(2).strip()
    return None


def _split_blocks(story: str) -> list[tuple[float, str, list[str]]] | None:
    """Return ordered (sort_key, header_title, body_lines) or None when not clearly pre-split."""
    lines = story.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[tuple[float, str, list[str]]] = []
    cur_key: float | None = None
    cur_title = ""
    cur_body: list[str] = []
    headers = 0
    list_headers = 0

    def flush() -> None:
        nonlocal cur_key, cur_title, cur_body
        if cur_key is None:
            return
        blocks.append((cur_key, cur_title, cur_body))
        cur_key = None
        cur_title = ""
        cur_body = []

    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            if cur_body or cur_title:
                cur_body.append("")
            continue
        hm = _header_match(line)
        if hm:
            flush()
            cur_key, kind, title = hm
            cur_title = title
            if kind == "list":
                list_headers += 1
            headers += 1
            continue
        if cur_key is None:
            return None
        cur_body.append(line.strip())
    flush()

    if headers < 1 or not blocks:
        return None
    if list_headers == headers and headers < 2:
        return None
    blocks.sort(key=lambda b: b[0])
    return blocks


def _parse_duration(text: str) -> float | None:
    m = _RE_DURATION.search(text)
    if not m:
        return None
    raw = m.group(1) or m.group(2)
    try:
        sec = float(raw)
    except (TypeError, ValueError):
        return None
    return gg_ltx.clamp_duration(sec)


def _dialogue_lines(body: list[str]) -> list[str]:
    out: list[str] = []
    for line in body:
        if not line.strip():
            continue
        sp = _RE_SPEAKER.match(line)
        if sp:
            out.append(f"{sp.group(1).strip()}: {sp.group(2).strip()}")
            continue
        quoted = _RE_QUOTED.findall(line)
        if quoted:
            for a, b in quoted:
                part = (a or b or "").strip()
                if part:
                    out.append(part)
            continue
    return out


def _narration_lines(body: list[str]) -> list[str]:
    out: list[str] = []
    for line in body:
        if not line.strip():
            continue
        if _RE_SPEAKER.match(line):
            continue
        stripped = _RE_QUOTED.sub("", line).strip()
        if stripped:
            out.append(stripped)
    return out


def _caption_for_block(body: list[str], mode: str) -> str:
    if mode == "no_captions":
        return ""
    dialogue = _dialogue_lines(body)
    if mode == "dialogue_only":
        return "\n".join(dialogue).strip()
    parts = _narration_lines(body) + dialogue
    return "\n".join(parts).strip()


def _body_as_prompt(body: list[str]) -> str:
    """Cut body text as the image/video prompt when the LLM is skipped."""
    parts = [line.strip() for line in body if line.strip()]
    text = " ".join(parts)
    words = text.split()
    if len(words) > 15:
        text = " ".join(words[:15])
    return text[: gg_ltx.DESCRIPTION_MAX_LEN].strip() or "Scene"


def _short_title(header: str, body: list[str]) -> str:
    raw = ""
    if header:
        words = header.split()
        if len(words) > TITLE_WORDS:
            header = " ".join(words[:TITLE_WORDS])
        raw = header[: gg_ltx.NAME_MAX_LEN].strip()
    else:
        for line in body:
            if line.strip() and not _RE_SPEAKER.match(line):
                words = line.split()
                raw = " ".join(words[:TITLE_WORDS])[: gg_ltx.NAME_MAX_LEN].strip()
                break
    return gg_ltx.normalize_cut_title(raw) or "Scene"


def _description_for_block(title: str, body: list[str]) -> str:
    narr = _narration_lines(body)
    if narr:
        text = " ".join(narr)
    else:
        text = title
    words = text.split()
    if len(words) > 15:
        text = " ".join(words[:15])
    return text[: gg_ltx.DESCRIPTION_MAX_LEN].strip() or title


def presplit_story(story: str, captions_mode: Any = DEFAULT_CAPTION_MODE) -> list[dict] | None:
    """When cut boundaries are clear, return draft cut dicts for validate_cut_list; else None."""
    blocks = _split_blocks(story)
    if not blocks:
        return None
    mode = normalize_caption_mode(captions_mode)
    entries: list[dict] = []
    for n, (_key, header, body) in enumerate(blocks, 1):
        body_text = "\n".join(body)
        dur = _parse_duration(header) or _parse_duration(body_text) or DEFAULT_DURATION
        title = _short_title(header, body)
        info = _description_for_block(title, body)
        prompt = _body_as_prompt(body)
        cap = _caption_for_block(body, mode)
        entries.append({
            "cut": n,
            "duration": dur,
            "title": title,
            "description": prompt,
            "notes": info,
            "caption": cap,
        })
    return entries


def presplit_public(story: str, captions_mode: Any = DEFAULT_CAPTION_MODE) -> list[dict] | None:
    """Validated public cuts from a pre-split script, or None."""
    draft = presplit_story(story, captions_mode)
    if not draft:
        return None
    rows = gg_ltx.validate_cut_list(draft)
    return gg_ltx.public_cuts(rows)
