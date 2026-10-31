"""Map story scene markers (Scene 1, Scene 2, …) to cut lists for AI Make Cut."""
from __future__ import annotations

import re
from typing import Any

_RE_SCENE_LINE = re.compile(
    r"^\s*scene\s+(\d+)\s*(?:[:\.\-–—]\s*(.*))?\s*$",
    re.IGNORECASE,
)
_RE_SCENE_MARKER = re.compile(r"^\s*scene\s+\d+\b", re.IGNORECASE | re.MULTILINE)


def _scene_name(num: str) -> str:
    return f"Scene {int(num)}"


def story_scene_sections(story: str) -> list[tuple[str, str]]:
    """Split story into (scene_name, section_text) in order. Lines that are only a scene marker start a new section."""
    text = story.replace("\r\n", "\n").replace("\r", "\n")
    sections: list[tuple[str, str]] = []
    current_name = "Scene 1"
    buf: list[str] = []
    for raw in text.split("\n"):
        line = raw.rstrip()
        m = _RE_SCENE_LINE.match(line)
        if m and not (m.group(2) or "").strip():
            if buf or sections:
                sections.append((current_name, "\n".join(buf).strip()))
                buf = []
            current_name = _scene_name(m.group(1))
            continue
        buf.append(line)
    if buf or not sections:
        sections.append((current_name, "\n".join(buf).strip()))
    return sections


def assign_scene_names(story: str, cuts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return cuts with a `scene` field when the story has scene markers."""
    sections = story_scene_sections(story)
    if not cuts:
        return cuts
    if len(sections) <= 1 and not _RE_SCENE_MARKER.search(story):
        return cuts
    weights = [max(1, len(body)) for _name, body in sections]
    total = sum(weights) or 1
    out: list[dict[str, Any]] = []
    for i, cut in enumerate(cuts):
        t = (i + 0.5) / len(cuts) * total
        acc = 0.0
        scene = sections[-1][0]
        for (name, body), w in zip(sections, weights):
            acc += w
            if t <= acc:
                scene = name
                break
        row = dict(cut)
        row["scene"] = scene
        out.append(row)
    return out
