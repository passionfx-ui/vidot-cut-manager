"""Project setup defaults, presets, and clamping (native projects)."""
from __future__ import annotations

from typing import Any

RESOLUTION_PRESETS: list[dict[str, Any]] = [
    {"aspect": "16:9", "width": 1280, "height": 720, "label": "16:9 1280×720"},
    {"aspect": "16:9", "width": 1920, "height": 1080, "label": "16:9 1920×1080"},
    {"aspect": "9:16", "width": 720, "height": 1280, "label": "9:16 720×1280"},
    {"aspect": "1:1", "width": 1024, "height": 1024, "label": "1:1 1024×1024"},
    {"aspect": "4:3", "width": 1024, "height": 768, "label": "4:3 1024×768"},
]

FPS_ALLOWED = frozenset({24, 25, 30})

CAPTION_LANG_ALLOWED = frozenset(
    {"English", "Korean", "Japanese", "Chinese", "Spanish", "French", "German"}
)

DEFAULT_PROJECT_SETTINGS: dict[str, Any] = {
    "aspect": "16:9",
    "width": 1280,
    "height": 720,
    "fps": 24,
    "cut_seconds": 3.0,
    "caption_lang": "English",
    "project_folder": "",
}

_SETTING_KEYS = frozenset({"aspect", "width", "height", "fps", "cut_seconds", "caption_lang", "project_folder"})


def preset_key(preset: dict[str, Any]) -> str:
    return f"{preset['aspect']}@{int(preset['width'])}x{int(preset['height'])}"


def parse_preset_key(key: str) -> dict[str, Any] | None:
    if not isinstance(key, str) or "@" not in key or "x" not in key:
        return None
    aspect, rest = key.split("@", 1)
    try:
        w_s, h_s = rest.lower().split("x", 1)
        w, h = int(w_s), int(h_s)
    except ValueError:
        return None
    for p in RESOLUTION_PRESETS:
        if p["aspect"] == aspect and int(p["width"]) == w and int(p["height"]) == h:
            return dict(p)
    return {"aspect": aspect, "width": w, "height": h, "label": f"{aspect} {w}×{h}"}


def _clamp_dim(value: Any) -> int:
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = int(DEFAULT_PROJECT_SETTINGS["width"])
    v = max(256, min(4096, v))
    return (v // 8) * 8


def _clamp_fps(value: Any) -> int:
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = int(DEFAULT_PROJECT_SETTINGS["fps"])
    return v if v in FPS_ALLOWED else int(DEFAULT_PROJECT_SETTINGS["fps"])


def _clamp_cut_seconds(value: Any) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        v = float(DEFAULT_PROJECT_SETTINGS["cut_seconds"])
    v = max(1.0, min(60.0, v))
    return round(v, 2)


def _clamp_aspect(value: Any) -> str:
    s = str(value or "").strip()
    for p in RESOLUTION_PRESETS:
        if p["aspect"] == s:
            return s
    return str(DEFAULT_PROJECT_SETTINGS["aspect"])


def _clamp_caption_lang(value: Any) -> str:
    s = str(value or "").strip()
    return s if s in CAPTION_LANG_ALLOWED else str(DEFAULT_PROJECT_SETTINGS["caption_lang"])


def _clamp_project_folder(value: Any) -> str:
    """Optional local folder path (display + future sync target only; nothing is written there)."""
    s = "".join(ch for ch in str(value or "") if ch >= " ").strip()
    return s[:260]


def normalize_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Merge missing keys and clamp; old docs may use default_sec instead of cut_seconds."""
    out = dict(DEFAULT_PROJECT_SETTINGS)
    src: dict[str, Any] = {}
    if isinstance(raw, dict):
        src = dict(raw)
        if "default_sec" in src and "cut_seconds" not in src:
            src["cut_seconds"] = src["default_sec"]
    for key in _SETTING_KEYS:
        if key in src:
            out[key] = src[key]
    out["aspect"] = _clamp_aspect(out.get("aspect"))
    out["width"] = _clamp_dim(out.get("width"))
    out["height"] = _clamp_dim(out.get("height"))
    out["fps"] = _clamp_fps(out.get("fps"))
    out["cut_seconds"] = _clamp_cut_seconds(out.get("cut_seconds"))
    out["caption_lang"] = _clamp_caption_lang(out.get("caption_lang"))
    out["project_folder"] = _clamp_project_folder(out.get("project_folder"))
    return out


def merge_settings_patch(current: dict[str, Any] | None, patch: dict[str, Any] | None) -> dict[str, Any]:
    base = normalize_settings(current)
    if not isinstance(patch, dict):
        return base
    merged = {**base}
    for key in _SETTING_KEYS:
        if key in patch:
            merged[key] = patch[key]
    return normalize_settings(merged)
