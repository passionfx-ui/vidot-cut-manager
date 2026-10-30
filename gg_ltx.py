"""Script to cuts with LTX-Video: bundled example workflows, prompt / frame-count injection, the cut split prompt and
cut list validation (no I/O besides reading the bundled examples)."""
from __future__ import annotations

import copy
import json
import math
import re
from pathlib import Path
from typing import Any

try:
    from . import gg_wfnodes
except ImportError:  # unit tests import this module directly
    import gg_wfnodes  # type: ignore

EXAMPLES_DIR = Path(__file__).resolve().parent / "examples" / "workflows"
LTX_WORKFLOWS = {
    "t2v": "ltxv_text_to_video.json",
    "i2v": "ltxv_image_to_video.json",
}
DEFAULT_KIND = "t2v"

DURATION_MIN = 0.5
DURATION_MAX = 3.0
DEFAULT_FPS = 24.0
MAX_FRAMES = 73
MAX_CUTS = 200
NAME_MAX_LEN = 80
DESCRIPTION_MAX_LEN = 300
DESCRIPTION_ALIASES = ("description", "content", "ltx_prompt")

# Same text as CUT_SPLIT_PROMPT in web/gg_cut_list_core.js (a test keeps them equal).
CUT_SPLIT_PROMPT = """You are a film director and storyboard artist. Split the story below into cuts for short AI-generated video clips.

Return ONLY a JSON array, with no other text and no markdown code fences:
[
  {"cut": 1, "duration": 3, "description": "one short line describing the shot"}
]

Fields:
- "cut": whole number, 1, 2, 3 ... in story order.
- "duration": seconds, a number from 0.5 to 3 (never more than 3).
- "description": one short line in English, under 200 characters: who or what, the action, the place, the shot size and the camera move. It is used directly as the video prompt and as the cut name.

Guidance:
- One action per cut, at most 3 seconds. Split longer actions into several cuts.
- Every description must stand alone: name the characters and the place again each time (no "he", no "same room").
- No dialogue, no on-screen text, no cut numbers inside description.
- Valid JSON only: double quotes, no trailing commas, no comments.

STORY:
"""

_SAVE_FPS_NODES = ("SaveAnimatedWEBP", "SaveAnimatedPNG", "SaveWEBM", "CreateVideo", "VHS_VideoCombine")
_LENGTH_NODES = ("EmptyLTXVLatentVideo", "LTXVImgToVideo")
_LENGTH_WIDGET_INDEX = 2  # [width, height, length, batch_size, ...]


def load_ltx_workflow(kind: str | None = None) -> dict:
    """The bundled LTX example graph (UI format) for `kind` ("t2v" default, "i2v")."""
    name = LTX_WORKFLOWS.get(kind or DEFAULT_KIND)
    if not name:
        raise ValueError(f"unknown LTX workflow: {kind}")
    with open(EXAMPLES_DIR / name, encoding="utf-8") as f:
        graph = json.load(f)
    if not isinstance(graph, dict):
        raise ValueError(f"invalid workflow file: {name}")
    return graph


def frames_for_duration(sec: float, fps: float) -> int:
    """LTX frame count for `sec` seconds: a multiple of 8 plus 1, capped at MAX_FRAMES (3 s @ 24 fps)."""
    n = math.floor(float(sec) * float(fps) / 8 + 0.5)
    frames = max(1, n) * 8 + 1
    return min(frames, MAX_FRAMES)


def clamp_duration(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("duration must be a number of seconds")
    return round(min(DURATION_MAX, max(DURATION_MIN, float(value))), 2)


def _is_ui(graph: dict) -> bool:
    return isinstance(graph.get("nodes"), list)


def _num(v: Any) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0:
        return None
    return float(v)


def workflow_fps(graph: dict) -> float:
    """Output frame rate of the graph: the save/video node's fps, else LTXVConditioning frame_rate, else 24."""
    cond = None
    if _is_ui(graph):
        for n in graph["nodes"]:
            if not isinstance(n, dict):
                continue
            wv = n.get("widgets_values")
            if n.get("type") in _SAVE_FPS_NODES and isinstance(wv, list):
                fps = next((_num(x) for x in wv if _num(x) is not None), None)
                if fps:
                    return fps
            if n.get("type") == "LTXVConditioning" and isinstance(wv, list) and wv:
                cond = cond or _num(wv[0])
    else:
        for n in graph.values():
            if not isinstance(n, dict):
                continue
            inputs = n.get("inputs") if isinstance(n.get("inputs"), dict) else {}
            if n.get("class_type") in _SAVE_FPS_NODES:
                fps = _num(inputs.get("fps")) or _num(inputs.get("frame_rate"))
                if fps:
                    return fps
            if n.get("class_type") == "LTXVConditioning":
                cond = cond or _num(inputs.get("frame_rate"))
    return cond or DEFAULT_FPS


def inject_ltx(graph: dict, prompt: str, duration: float) -> dict:
    """Copy of `graph` with `prompt` in its prompt node (gg_wfnodes rule) and the LTX length set from `duration`."""
    if not isinstance(graph, dict):
        raise ValueError("workflow must be an object")
    g = copy.deepcopy(graph)
    frames = frames_for_duration(duration, workflow_fps(g))
    gg_wfnodes.set_prompt(g, prompt)
    if _is_ui(g):
        for n in g["nodes"]:
            wv = n.get("widgets_values") if isinstance(n, dict) else None
            if n.get("type") in _LENGTH_NODES and isinstance(wv, list) and len(wv) > _LENGTH_WIDGET_INDEX:
                wv[_LENGTH_WIDGET_INDEX] = frames
    else:
        for n in g.values():
            if isinstance(n, dict) and n.get("class_type") in _LENGTH_NODES and isinstance(n.get("inputs"), dict):
                n["inputs"]["length"] = frames
    return g


class CutListError(ValueError):
    """Invalid cut list; `errors` holds one message per problem ("Item 2 (cut 2): ...")."""

    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors))
        self.errors = errors


def _show(v: Any) -> str:
    if isinstance(v, bool) or v is None:
        return json.dumps(v)
    if isinstance(v, (int, float)):
        return f"{v:g}" if math.isfinite(v) else str(v)
    s = json.dumps(v, ensure_ascii=False)
    return s if len(s) <= 40 else s[:37] + "..."


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def extract_json_array(text: str) -> str | None:
    """Text of the first top-level JSON array in `text` (code fences and surrounding prose ignored), else None."""
    s = re.sub(r"```[a-zA-Z]*\s*", "", str(text or ""))
    start = s.find("[")
    while start >= 0:
        depth, in_str, i = 0, False, start
        while i < len(s):
            ch = s[i]
            if in_str:
                if ch == "\\":
                    i += 1
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch in "[{":
                depth += 1
            elif ch in "]}":
                depth -= 1
                if depth == 0:
                    cand = s[start:i + 1]
                    if ch == "]" and re.match(r"^\[\s*(\{|\])", cand):
                        return cand
                    break
            i += 1
        start = s.find("[", start + 1)
    return None


def extract_cut_items(text: str) -> Any:
    """The cut array of an LLM answer: a bare array, an object wrapping one ({"cuts": [...]}), or the first
    array inside prose / code fences. Raises CutListError when there is none."""
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        raw = extract_json_array(text)
        if raw is None:
            raise CutListError(['No JSON array found. Expected [{"cut", "duration", "description"}, ...].']) from None
        try:
            data = json.loads(raw)
        except ValueError as ex:
            raise CutListError([f"Not valid JSON: {ex}"]) from None
    if isinstance(data, dict):
        lists = [v for v in data.values() if isinstance(v, list)]
        if isinstance(data.get("cuts"), list):
            data = data["cuts"]
        elif len(lists) == 1:
            data = lists[0]
        elif "description" in data or "content" in data:
            data = [data]
    if not isinstance(data, list):
        raise CutListError(['Expected a JSON array of cuts: [{"cut", "duration", "description"}, ...].'])
    return data


def validate_cut_list(entries: Any) -> list[dict]:
    """Strict check of [{cut, duration, description}] ("content" / "ltx_prompt" accepted as aliases of
    description). Returns rows in `cut` order, renumbered 1..N:
    {cut, duration, description, name, caption, sec, prompt}. Raises CutListError listing every problem."""
    if not isinstance(entries, list):
        raise CutListError(['The cut list must be a JSON array: [{"cut", "duration", "description"}, ...].'])
    if not entries:
        raise CutListError(["The cut list is empty."])
    if len(entries) > MAX_CUTS:
        raise CutListError([f"At most {MAX_CUTS} cuts per list (got {len(entries)})."])
    errors: list[str] = []
    rows = []
    seen: dict[float, int] = {}
    for i, e in enumerate(entries):
        where = f"Item {i + 1}"
        if not isinstance(e, dict):
            errors.append(f'{where}: must be an object like {{"cut": 1, "duration": 2, "description": "..."}}.')
            continue
        bad = len(errors)
        num = e.get("cut")
        if num is None:
            errors.append(f'{where}: "cut" is missing.')
        elif not _is_number(num) or num < 1 or float(num) != int(num):
            errors.append(f'{where}: "cut" must be a whole number from 1 (got {_show(num)}).')
        else:
            where = f"{where} (cut {int(num)})"
            if num in seen:
                errors.append(f'{where}: "cut" {int(num)} is used twice (also item {seen[num] + 1}).')
            else:
                seen[num] = i
        sec = e.get("duration")
        if sec is None:
            errors.append(f'{where}: "duration" is missing.')
        elif not _is_number(sec):
            errors.append(f'{where}: "duration" must be a number of seconds (got {_show(sec)}).')
        elif not DURATION_MIN <= sec <= DURATION_MAX:
            errors.append(f'{where}: "duration" must be between {DURATION_MIN:g} and {DURATION_MAX:g} seconds '
                          f'(got {_show(sec)}).')
        key = next((k for k in DESCRIPTION_ALIASES if e.get(k) is not None), "description")
        desc = e.get(key)
        if isinstance(desc, str):
            desc = " ".join(desc.split())
        if desc is None or desc == "":
            errors.append(f'{where}: "description" is missing.')
        elif not isinstance(desc, str):
            errors.append(f'{where}: "{key}" must be text (got {_show(desc)}).')
        elif len(desc) > DESCRIPTION_MAX_LEN:
            errors.append(f'{where}: "{key}" is too long ({len(desc)} characters, max {DESCRIPTION_MAX_LEN}).')
        if len(errors) == bad:
            rows.append({"order": float(num), "sec": round(float(sec), 2), "description": desc})
    if errors:
        raise CutListError(errors)
    rows.sort(key=lambda r: r["order"])
    out = []
    for n, r in enumerate(rows, 1):
        d = r["description"]
        out.append({"cut": n, "duration": r["sec"], "description": d, "name": d[:NAME_MAX_LEN].strip(),
                    "caption": d, "sec": r["sec"], "prompt": d})
    return out


def public_cuts(rows: list[dict]) -> list[dict]:
    """Validated rows in the paste/API schema [{cut, duration, description}]."""
    return [{"cut": r["cut"], "duration": r["duration"], "description": r["description"]} for r in rows]
