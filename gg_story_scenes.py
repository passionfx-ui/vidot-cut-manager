"""Map story scene markers (Scene 1, Scene 2, …) to cut lists for AI Make Cut."""
from __future__ import annotations

import re
from typing import Any

_RE_SCENE_LINE = re.compile(
    r"^\s*scene\s+(\d+)\s*(?:[:\.\-–—]\s*(.*))?\s*$",
    re.IGNORECASE,
)
_RE_SCENE_MARKER = re.compile(r"^\s*scene\s+\d+\b", re.IGNORECASE | re.MULTILINE)
_RE_WORD = re.compile(r"[a-z0-9']{2,}", re.IGNORECASE)
_STOP = frozenset({"the", "and", "with", "from", "that", "this", "she", "her", "his", "has", "have"})


def _scene_name(num: str) -> str:
    return f"Scene {int(num)}"


def _tokens(text: str) -> set[str]:
    return {w.lower() for w in _RE_WORD.findall(text or "") if w.lower() not in _STOP}


def story_scene_sections(story: str) -> list[tuple[str, str]]:
    """Split story into (scene_name, section_text). A line starting with Scene N (optionally followed by prose) starts a section."""
    text = story.replace("\r\n", "\n").replace("\r", "\n")
    sections: list[tuple[str, str]] = []
    current_name = "Scene 1"
    buf: list[str] = []
    for raw in text.split("\n"):
        line = raw.rstrip()
        m = _RE_SCENE_LINE.match(line)
        if m:
            new_name = _scene_name(m.group(1))
            if buf or sections:
                sections.append((current_name, "\n".join(buf).strip()))
                buf = []
            current_name = new_name
            rest = (m.group(2) or "").strip()
            if rest:
                buf.append(rest)
            continue
        buf.append(line)
    if buf or not sections:
        sections.append((current_name, "\n".join(buf).strip()))
    return sections


def _scene_for_cut_index(i: int, n_cuts: int, sections: list[tuple[str, str]]) -> str:
    weights = [max(1, len(body)) for _name, body in sections]
    total = sum(weights) or 1
    t = (i + 0.5) / max(1, n_cuts) * total
    acc = 0.0
    scene = sections[-1][0]
    for (name, _body), w in zip(sections, weights):
        acc += w
        if t <= acc:
            scene = name
            break
    return scene


def _scene_for_cut_content(cut: dict[str, Any], sections: list[tuple[str, str]]) -> str | None:
    blob = " ".join(
        str(cut.get(k) or "")
        for k in ("description", "title", "caption", "notes", "name")
    )
    words = _tokens(blob)
    if not words:
        return None
    best_name = None
    best_score = 0
    for name, body in sections:
        score = len(words & _tokens(body))
        if score > best_score:
            best_score = score
            best_name = name
    return best_name if best_score > 0 else None


def story_uses_per_scene_llm(story: str) -> bool:
    """True when the story has multiple scene-heading blocks (run TextGenerate once per block)."""
    if not _RE_SCENE_MARKER.search(story or ""):
        return False
    return len(story_scene_sections(story)) > 1


def assign_scene_names(story: str, cuts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return cuts with a `scene` field when the story has scene markers (single LLM call path only)."""
    if story_uses_per_scene_llm(story):
        return cuts
    sections = story_scene_sections(story)
    if not cuts:
        return cuts
    if len(sections) <= 1 and not _RE_SCENE_MARKER.search(story):
        return cuts
    n = len(cuts)
    out: list[dict[str, Any]] = []
    for i, cut in enumerate(cuts):
        scene = _scene_for_cut_content(cut, sections) or _scene_for_cut_index(i, n, sections)
        row = dict(cut)
        row["scene"] = scene
        out.append(row)
    return out
