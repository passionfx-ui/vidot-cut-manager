"""Script to cuts with LTX-Video: bundled example workflows, prompt / frame-count injection, cut list validation (no I/O
besides reading the bundled examples)."""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Any

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
CONTENT_MAX_LEN = 4000
PROMPT_MAX_LEN = 8000

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


def _positive_text_node_ui(graph: dict) -> dict | None:
    nodes = [n for n in graph["nodes"] if isinstance(n, dict)]
    by_id = {n.get("id"): n for n in nodes}
    encoders = [n for n in nodes if n.get("type") == "CLIPTextEncode"]
    for link in graph.get("links") or []:
        if not isinstance(link, list) or len(link) < 5:
            continue
        src, dst, slot = by_id.get(link[1]), by_id.get(link[3]), link[4]
        if not src or src.get("type") != "CLIPTextEncode" or not dst:
            continue
        inputs = dst.get("inputs") or []
        if isinstance(slot, int) and 0 <= slot < len(inputs) and (inputs[slot] or {}).get("name") == "positive":
            return src
    titled = [n for n in encoders if "positive" in str(n.get("title") or "").lower()]
    return (titled or encoders or [None])[0]


def _positive_text_node_api(graph: dict) -> dict | None:
    encoders = {k: n for k, n in graph.items() if isinstance(n, dict) and n.get("class_type") == "CLIPTextEncode"}
    for n in graph.values():
        if not isinstance(n, dict) or not isinstance(n.get("inputs"), dict):
            continue
        ref = n["inputs"].get("positive")
        if isinstance(ref, list) and ref and str(ref[0]) in encoders:
            return encoders[str(ref[0])]
    titled = [n for n in encoders.values() if "positive" in str((n.get("_meta") or {}).get("title") or "").lower()]
    return (titled or list(encoders.values()) or [None])[0]


def inject_ltx(graph: dict, prompt: str, duration: float) -> dict:
    """Copy of `graph` with `prompt` in the positive CLIPTextEncode and the LTX length set from `duration`."""
    if not isinstance(graph, dict):
        raise ValueError("workflow must be an object")
    g = copy.deepcopy(graph)
    frames = frames_for_duration(duration, workflow_fps(g))
    if _is_ui(g):
        pos = _positive_text_node_ui(g)
        if pos is None:
            raise ValueError("workflow has no CLIPTextEncode node")
        wv = pos.get("widgets_values")
        if isinstance(wv, list) and wv:
            wv[0] = prompt
        else:
            pos["widgets_values"] = [prompt]
        for n in g["nodes"]:
            wv = n.get("widgets_values") if isinstance(n, dict) else None
            if n.get("type") in _LENGTH_NODES and isinstance(wv, list) and len(wv) > _LENGTH_WIDGET_INDEX:
                wv[_LENGTH_WIDGET_INDEX] = frames
    else:
        pos = _positive_text_node_api(g)
        if pos is None:
            raise ValueError("workflow has no CLIPTextEncode node")
        pos.setdefault("inputs", {})["text"] = prompt
        for n in g.values():
            if isinstance(n, dict) and n.get("class_type") in _LENGTH_NODES and isinstance(n.get("inputs"), dict):
                n["inputs"]["length"] = frames
    return g


def validate_cut_list(entries: Any) -> list[dict]:
    """[{cut, duration, content, ltx_prompt}] -> [{name, caption, sec, prompt}] in `cut` order (stable)."""
    if not isinstance(entries, list) or not entries:
        raise ValueError("cuts must be a non-empty list")
    if len(entries) > MAX_CUTS:
        raise ValueError(f"at most {MAX_CUTS} cuts per list")
    rows = []
    for i, e in enumerate(entries):
        where = f"cut {i + 1}"
        if not isinstance(e, dict):
            raise ValueError(f"{where}: must be an object")
        content = e.get("content")
        prompt = e.get("ltx_prompt")
        if not isinstance(content, str) or not content.strip():
            raise ValueError(f"{where}: content is required")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError(f"{where}: ltx_prompt is required")
        content, prompt = content.strip(), prompt.strip()
        if len(content) > CONTENT_MAX_LEN:
            raise ValueError(f"{where}: content must be at most {CONTENT_MAX_LEN} characters")
        if len(prompt) > PROMPT_MAX_LEN:
            raise ValueError(f"{where}: ltx_prompt must be at most {PROMPT_MAX_LEN} characters")
        try:
            sec = clamp_duration(e.get("duration"))
        except ValueError as ex:
            raise ValueError(f"{where}: {ex}") from None
        num = e.get("cut")
        order = float(num) if isinstance(num, (int, float)) and not isinstance(num, bool) and math.isfinite(num) else float(i + 1)
        name = " ".join(content.split())[:NAME_MAX_LEN].strip()
        rows.append({"order": order, "index": i, "name": name, "caption": content, "sec": sec, "prompt": prompt})
    rows.sort(key=lambda r: (r["order"], r["index"]))
    return [{k: r[k] for k in ("name", "caption", "sec", "prompt")} for r in rows]
