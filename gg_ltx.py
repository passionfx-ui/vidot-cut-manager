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
MAX_FRAMES = 73  # AI Cut Split / paste list (≤3 s @ 24 fps)
WORKFLOW_MAX_SEC = 10.0
WORKFLOW_MAX_FRAMES = 257  # LTX 2B distilled (~10 s @ 24 fps)
VIDEO_TOO_LONG_MSG = (
    "Video too long for this model (max 10 s). Shorten the cut on the timeline and try again."
)
MAX_CUTS = 200
NAME_MAX_LEN = 80
DESCRIPTION_MAX_LEN = 300
DESCRIPTION_ALIASES = ("description", "content", "ltx_prompt")
TITLE_ALIASES = ("title", "name")
CAPTION_ALIASES = ("caption",)
NOTES_ALIASES = ("notes", "info")
TITLE_MAX_LEN = NAME_MAX_LEN
TITLE_SHORT_MAX = 40
TITLE_WORD_MAX = 5
_RE_TITLE_CAMERA = re.compile(
    r"\b(wide shot|close-up|close up|closeup|tracking shot|tracking|pan shot|pan\b|zoom|dolly|"
    r"aerial|pov|medium shot|extreme close|establishing shot|over-the-shoulder|ots\b|"
    r"camera|cinematic|lens|angle|shot size|4k|8k)\b",
    re.IGNORECASE,
)
_TITLE_CAMERA_PHRASES = (
    "wide shot", "close-up", "close up", "closeup", "tracking shot", "tracking",
    "pan shot", "medium shot", "extreme close", "establishing shot", "over-the-shoulder",
    "aerial shot", "aerial",
)

# AI Cut Split instructions; the story follows "STORY:" (gg_cut_split.build_prompt).
CUT_SPLIT_PROMPT = """You are a storyboard artist. Split the story below into cuts for short AI video clips.

Output ONLY compact JSON on ONE line. No prose, no explanation, no markdown, no code fences, no line breaks, no spaces between fields. Example:
[{"cut":1,"duration":3,"title":"Fox at dawn","description":"Wide shot, a fox crosses a snowy field at dawn","caption":""},{"cut":2,"duration":2,"title":"Fox close-up","description":"Close-up, the fox sniffs the air","caption":"Fox: Where is home?"}]

Fields:
- "cut": 1, 2, 3 ... in story order.
- "duration": seconds, 0.5 to 3 (never more than 3).
- "title": short English scene name, 2 to 5 words, Title Case, no trailing period, no camera or style terms. Cut name only; never dialogue or a full sentence.
- "description": short English video prompt, at most 15 words: shot size, who or what, the action, the place. Never dialogue.
- "caption": spoken lines and narration copied from the story for this cut, or "" when none.

Rules:
- One action per cut. Split longer actions into several cuts.
- Name the characters and the place in every description (no "he", no "same room").
- Keep dialogue in "caption" only, not in "title" or "description".
- Double quotes, no trailing commas, no comments. Stop right after the closing ].
"""

_CAPTION_MODE_HINTS = {
    "dialogue_only": ('Caption: only spoken dialogue (quoted lines and "Name: line"). Use "" when there is no dialogue.',
                      'Do not put narration in "caption".'),
    "include_narration": ('Caption: copy dialogue and narration from the story for each cut verbatim.',
                          'Use "" only when the cut has no dialogue or narration.'),
    "no_captions": ('Caption: always "".',),
}


def normalize_cut_title(raw: Any) -> str:
    """Short cut title for Shots: 2–5 words, Title Case, ~40 chars, no camera jargon."""
    if not isinstance(raw, str):
        return ""
    t = " ".join(raw.split()).rstrip(".")
    for ph in _TITLE_CAMERA_PHRASES:
        t = re.sub(re.escape(ph), " ", t, flags=re.IGNORECASE)
    t = " ".join(t.split())
    cleaned: list[str] = []
    for w in t.split():
        token = w.strip(",;:")
        if not token:
            continue
        if _RE_TITLE_CAMERA.search(token):
            continue
        cleaned.append(token)
        if len(cleaned) >= TITLE_WORD_MAX:
            break

    def _title_word(w: str) -> str:
        if len(w) > 1 and w.isupper():
            return w
        return w[:1].upper() + w[1:].lower() if w else w

    t = " ".join(_title_word(w) for w in cleaned)
    return t[:TITLE_SHORT_MAX].strip()


def cut_split_caption_hint(mode: str) -> str:
    """Extra prompt lines for the Captions option (AI Make Cut dialog)."""
    key = mode if mode in _CAPTION_MODE_HINTS else "dialogue_only"
    return "\n".join(_CAPTION_MODE_HINTS[key])

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


def frames_for_duration(sec: float, fps: float, *, max_frames: int | None = MAX_FRAMES) -> int:
    """LTX frame count for `sec` seconds: round(sec·fps) to the nearest 8n+1 frame count."""
    n = math.floor(float(sec) * float(fps) / 8 + 0.5)
    frames = max(1, n) * 8 + 1
    if max_frames is not None:
        frames = min(frames, max_frames)
    return frames


def workflow_has_ltx_length(graph: dict) -> bool:
    if not isinstance(graph, dict):
        return False
    if _is_ui(graph):
        return any(isinstance(n, dict) and n.get("type") in _LENGTH_NODES for n in graph.get("nodes") or [])
    return any(isinstance(n, dict) and n.get("class_type") in _LENGTH_NODES for n in graph.values())


def check_ltx_generation_duration(graph: dict, sec: float) -> str | None:
    """User-facing error when `sec` exceeds this workflow's LTX limit, else None."""
    if not workflow_has_ltx_length(graph):
        return None
    s = float(sec)
    if s > WORKFLOW_MAX_SEC + 1e-6:
        return VIDEO_TOO_LONG_MSG
    fps = workflow_fps(graph)
    frames = frames_for_duration(s, fps, max_frames=None)
    if frames > WORKFLOW_MAX_FRAMES:
        return VIDEO_TOO_LONG_MSG
    return None


def patch_ltx_duration(graph: dict, sec: float) -> dict:
    """Copy of `graph` with LTX length nodes set from `sec` (no prompt change)."""
    if not isinstance(graph, dict):
        raise ValueError("workflow must be an object")
    g = copy.deepcopy(graph)
    if not workflow_has_ltx_length(g):
        return g
    frames = frames_for_duration(float(sec), workflow_fps(g), max_frames=None)
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
    frames = frames_for_duration(duration, workflow_fps(g), max_frames=MAX_FRAMES)
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


def json_array_unclosed(text: str) -> bool:
    """True when the answer starts a JSON array of objects ("[{") that never closes, i.e. the text was cut off
    (TextGenerate stopped at max_length)."""
    s = re.sub(r"```[a-zA-Z]*\s*", "", str(text or ""))
    m = re.search(r"\[\s*\{", s)
    if not m:
        return False
    depth, in_str, i = 0, False, m.start()
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
                return False
        i += 1
    return True


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
        title_key = next((k for k in TITLE_ALIASES if e.get(k) is not None), None)
        title = e.get(title_key) if title_key else None
        if isinstance(title, str):
            title = " ".join(title.split())
        cap_key = next((k for k in CAPTION_ALIASES if e.get(k) is not None), None)
        caption = e.get(cap_key) if cap_key else None
        if isinstance(caption, str):
            caption = caption.replace("\r\n", "\n").replace("\r", "\n")
        elif caption is not None and not isinstance(caption, str):
            errors.append(f'{where}: "caption" must be text (got {_show(caption)}).')
        notes_key = next((k for k in NOTES_ALIASES if e.get(k) is not None), None)
        notes = e.get(notes_key) if notes_key else None
        if isinstance(notes, str):
            notes = notes.replace("\r\n", "\n").replace("\r", "\n").strip()
        elif notes is not None and not isinstance(notes, str):
            errors.append(f'{where}: "notes" must be text (got {_show(notes)}).')
        if len(errors) == bad:
            if title is None or title == "":
                title = normalize_cut_title(desc[:TITLE_MAX_LEN].strip() if desc else "")
            elif len(title) > TITLE_MAX_LEN:
                errors.append(f'{where}: "title" is too long ({len(title)} characters, max {TITLE_MAX_LEN}).')
            else:
                title = normalize_cut_title(title)
            if caption is None:
                caption = "" if title_key or cap_key is not None else desc
            if isinstance(caption, str) and len(caption) > DESCRIPTION_MAX_LEN:
                errors.append(f'{where}: "caption" is too long ({len(caption)} characters, max {DESCRIPTION_MAX_LEN}).')
            if notes is None:
                notes = ""
            elif len(notes) > DESCRIPTION_MAX_LEN:
                errors.append(f'{where}: "notes" is too long ({len(notes)} characters, max {DESCRIPTION_MAX_LEN}).')
        if len(errors) == bad:
            rows.append({"order": float(num), "sec": round(float(sec), 2), "description": desc, "title": title or "",
                         "caption": caption if isinstance(caption, str) else "", "notes": notes if isinstance(notes, str) else ""})
    if errors:
        raise CutListError(errors)
    rows.sort(key=lambda r: r["order"])
    out = []
    for n, r in enumerate(rows, 1):
        d = r["description"]
        name = (r.get("title") or d)[:NAME_MAX_LEN].strip() or d[:NAME_MAX_LEN].strip()
        cap = r.get("caption")
        if cap is None:
            cap = ""
        out.append({"cut": n, "duration": r["sec"], "description": d, "title": name, "name": name,
                    "caption": cap, "notes": r.get("notes") or "", "sec": r["sec"], "prompt": d})
    return out


def public_cuts(rows: list[dict]) -> list[dict]:
    """Validated rows in the paste/API schema [{cut, duration, title, description, caption}]."""
    return [{"cut": r["cut"], "duration": r["duration"], "title": r.get("title") or r.get("name") or "",
             "description": r["description"], "caption": r.get("caption") if r.get("caption") is not None else ""}
            for r in rows]
