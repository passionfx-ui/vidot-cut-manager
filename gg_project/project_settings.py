"""Project setup defaults, presets, and clamping (native projects)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

GEN_ASPECT_RATIOS = ("16:9", "9:16", "1:1", "4:3", "3:4", "21:9")
GEN_SHORT_SIDES = (384, 480, 512, 576, 640, 720, 768, 832, 960, 1024, 1080, 1280, 1440, 2160)
GEN_RESOLUTION_CUSTOM = "custom"

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

DEFAULT_IMAGE_TEMPLATE = "builtin:image"
DEFAULT_VIDEO_TEMPLATE = "builtin:video-ltx"

DEFAULT_PROJECT_SETTINGS: dict[str, Any] = {
    "aspect": "16:9",
    "gen_aspect": "16:9",
    "resolution_short": 720,
    "random_seed": True,
    "width": 1280,
    "height": 720,
    "fps": 24,
    "cut_seconds": 3.0,
    "caption_lang": "English",
    "project_folder": "",
    "export_folder": "",
    "image_template": DEFAULT_IMAGE_TEMPLATE,
    "video_template": DEFAULT_VIDEO_TEMPLATE,
}

_SETTING_KEYS = frozenset(
    {
        "aspect",
        "gen_aspect",
        "resolution_short",
        "random_seed",
        "width",
        "height",
        "fps",
        "cut_seconds",
        "caption_lang",
        "project_folder",
        "export_folder",
        "image_template",
        "video_template",
    }
)
TEMPLATE_SETTING_KEYS = ("image_template", "video_template")


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


def _round_gen_dim(value: Any, round_to: int = 8) -> int:
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = int(DEFAULT_PROJECT_SETTINGS["width"])
    v = max(round_to, min(4096, v))
    return (v // round_to) * round_to


def _is_custom_resolution(value: Any) -> bool:
    return str(value or "").strip().lower() == GEN_RESOLUTION_CUSTOM


def _infer_resolution_short(aspect: Any, width: Any, height: Any) -> int:
    a = _clamp_gen_aspect(aspect)
    aw_s, ah_s = a.split(":", 1)
    aw, ah = int(aw_s or 16), int(ah_s or 9)
    try:
        w, h = int(round(float(width))), int(round(float(height)))
    except (TypeError, ValueError):
        return int(DEFAULT_PROJECT_SETTINGS["resolution_short"])
    short = h if aw >= ah else w
    return min(GEN_SHORT_SIDES, key=lambda n: abs(n - short))


def _clamp_gen_aspect(value: Any) -> str:
    s = str(value or "").strip()
    return s if s in GEN_ASPECT_RATIOS else str(DEFAULT_PROJECT_SETTINGS["gen_aspect"])


def _clamp_preset_short(value: Any) -> int:
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = int(DEFAULT_PROJECT_SETTINGS["resolution_short"])
    return v if v in GEN_SHORT_SIDES else int(DEFAULT_PROJECT_SETTINGS["resolution_short"])


def _clamp_random_seed(value: Any) -> bool:
    if value is None:
        return bool(DEFAULT_PROJECT_SETTINGS["random_seed"])
    if isinstance(value, str):
        return value.strip().lower() not in ("0", "false", "no", "off")
    return bool(value)


def dimensions_from_gen_settings(aspect: Any, short_side: Any, *, round_to: int = 8) -> dict[str, int]:
    """Width/height from aspect + short-side preset (landscape: height=short; portrait: width=short)."""
    a = _clamp_gen_aspect(aspect)
    short = _clamp_preset_short(short_side)
    aw_s, ah_s = a.split(":", 1)
    aw, ah = int(aw_s or 16), int(ah_s or 9)
    if aw >= ah:
        height = _round_gen_dim(short, round_to)
        width = _round_gen_dim(height * aw / ah, round_to)
    else:
        width = _round_gen_dim(short, round_to)
        height = _round_gen_dim(width * ah / aw, round_to)
    return {"width": width, "height": height}


def _clamp_aspect(value: Any) -> str:
    return _clamp_gen_aspect(value)


def _clamp_caption_lang(value: Any) -> str:
    s = str(value or "").strip()
    return s if s in CAPTION_LANG_ALLOWED else str(DEFAULT_PROJECT_SETTINGS["caption_lang"])


def _clamp_project_folder(value: Any) -> str:
    """Optional local project folder; when set, generated outputs are saved in its `assets` subfolder."""
    s = "".join(ch for ch in str(value or "") if ch >= " ").strip()
    return s[:260]


def _clamp_template_ref(value: Any, default: str) -> str:
    """Image / Video template: a built-in ref or a ComfyUI user workflow path; empty = the built-in default."""
    s = "".join(ch for ch in str(value or "") if ch >= " ").strip().replace("\\", "/")[:260]
    return s or default


_WIN_BAD_NAME_CHARS = set('<>:"|?*')


def check_output_folder(value: Any) -> dict[str, Any]:
    """Output folder check for Project Settings: empty (= default), an existing writable folder,
    or a path whose nearest existing parent is a writable folder. Nothing is created."""
    path = _clamp_project_folder(value)
    if not path:
        return {"ok": True, "path": "", "exists": False}

    def fail(message: str) -> dict[str, Any]:
        return {"ok": False, "path": path, "message": message}

    p = Path(path).expanduser()
    if not p.is_absolute():
        return fail("Use a full path, e.g. D:\\Films\\My Film")
    if os.name == "nt":
        for part in p.parts[1:]:
            if any(ch in _WIN_BAD_NAME_CHARS for ch in part) or part != part.rstrip(" ."):
                return fail(f'Invalid folder name: "{part}"')
    try:
        if p.exists():
            if not p.is_dir():
                return fail("This path is a file, not a folder")
            if not os.access(p, os.W_OK):
                return fail("This folder is not writable")
            return {"ok": True, "path": path, "exists": True}
        parent = p.parent
        while not parent.exists() and parent != parent.parent:
            parent = parent.parent
        if not parent.exists():
            return fail("Drive not found")
        if not parent.is_dir():
            return fail(f"Cannot create a folder inside a file: {parent}")
        if not os.access(parent, os.W_OK):
            return fail(f"Cannot create a folder in {parent}")
    except OSError as ex:
        return fail(f"Cannot use this folder: {ex}")
    return {"ok": True, "path": path, "exists": False}


def check_export_output_folder(value: Any) -> dict[str, Any]:
    """Export tab output folder: empty = project default; otherwise must exist and be writable."""
    base = check_output_folder(value)
    if not base.get("ok"):
        return base
    if not base.get("path"):
        return {"ok": True, "path": "", "use_default": True}
    p = Path(base["path"]).expanduser()
    if not p.is_dir():
        return {"ok": False, "path": base["path"], "message": "This folder does not exist"}
    if not os.access(p, os.W_OK):
        return {"ok": False, "path": base["path"], "message": "This folder is not writable"}
    return {"ok": True, "path": base["path"], "exists": True}


def mp4_export_dir_for_project(settings: dict[str, Any] | None, project_base: Path) -> Path:
    s = normalize_settings(settings)
    custom = (s.get("export_folder") or "").strip()
    if custom:
        return Path(custom).expanduser()
    return project_mp4_export_dir(project_base)


PROJECT_ASSETS_DIR = "assets"
PROJECT_ASSETS_IMAGES = "images"
PROJECT_ASSETS_VIDEOS = "videos"
STANDARD_EDIT_DIR = "03_Edit"
FALLBACK_MP4_EXPORT_DIR = "edit"


def project_mp4_export_dir(project_base: Path) -> Path:
    """MP4 export folder under a project: use existing `03_Edit`, else `<project>/edit` (created on export)."""
    base = Path(project_base)
    standard = base / STANDARD_EDIT_DIR
    if standard.is_dir():
        return standard
    return base / FALLBACK_MP4_EXPORT_DIR
_MEDIA_IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
_MEDIA_VIDEO_EXTS = frozenset({".mp4", ".webm", ".mov"})


def project_assets_type_subdir(ext: str, kind: str | None = None) -> str:
    """Subfolder under `assets/` for plugin project outputs (images or videos).
    `kind` is the stored version kind: an animated WebP/GIF/APNG is kind "video" and goes to `videos/`."""
    if kind == "video" or str(ext or "").lower() in _MEDIA_VIDEO_EXTS:
        return PROJECT_ASSETS_VIDEOS
    return PROJECT_ASSETS_IMAGES


def ensure_project_assets_dir(project_folder: Path, ext: str, kind: str | None = None) -> Path:
    """Directory for a new asset file; creates `assets/images` or `assets/videos` lazily."""
    dest = Path(project_folder) / PROJECT_ASSETS_DIR / project_assets_type_subdir(ext, kind)
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def is_external_project_asset_media(path: Path) -> bool:
    """True when `path` is a media file directly in `assets/` or in `assets/images|videos/`."""
    ext = path.suffix.lower()
    if ext not in _MEDIA_IMAGE_EXTS | _MEDIA_VIDEO_EXTS:
        return False
    parent = path.parent
    if parent.name == PROJECT_ASSETS_DIR:
        return True
    if parent.name in (PROJECT_ASSETS_IMAGES, PROJECT_ASSETS_VIDEOS):
        return parent.parent.name == PROJECT_ASSETS_DIR
    return False


_RESERVED_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
)


def project_folder_name(name: Any) -> str:
    """Folder name for a project name (same rule as web/gg_new_project_core.js projectFolderName)."""
    s = "".join("_" if ch < " " or ch in '<>:"/\\|?*' else ch for ch in str(name or ""))
    s = s.strip().rstrip(" .")[:120].rstrip(" .")
    if not s:
        return "Project"
    if s.split(".", 1)[0].upper() in _RESERVED_NAMES:
        s = f"{s}_"
    return s


def project_folder_path(location: Path, name: Any) -> Path:
    """<location>/<project name>, or <location> itself when its last segment already is the project
    folder name (case-insensitive on Windows); same rule as web/gg_new_project_core.js projectFolderPath."""
    folder_name = project_folder_name(name)
    last = location.name
    if os.name == "nt":
        last, folder_name = last.lower(), folder_name.lower()
    return location if last and last == folder_name else location / project_folder_name(name)


def comfyui_output_directory() -> Path:
    """ComfyUI's configured output directory (folder_paths.get_output_directory())."""
    try:
        import folder_paths  # ComfyUI

        return Path(folder_paths.get_output_directory()).resolve()
    except Exception:  # noqa: BLE001
        try:
            import gg_data

            return (gg_data.PACK_DIR / "output").resolve()
        except Exception:  # noqa: BLE001
            return Path(os.path.expanduser("~")).resolve()


def unique_project_folder_path(location: Path, name: Any) -> Path:
    """Pick a new project folder under `location`; suffix ' (2)', ' (3)', … when the preferred name exists."""
    folder_name = project_folder_name(name)
    preferred = project_folder_path(location, name)
    if not preferred.exists():
        return preferred
    parent = location.parent if preferred == location else preferred.parent
    n = 2
    while n < 1000:
        candidate = parent / f"{folder_name} ({n})"
        if not candidate.exists():
            return candidate
        n += 1
    raise ValueError("Too many projects with this name in this location")


def make_unique_project_folder(location: Any, name: Any, created: list[Path] | None = None) -> Path:
    """Create `<unique project folder>/assets` for a new project (never reuses an existing folder)."""
    loc = _clamp_project_folder(location)
    if not loc:
        raise ValueError("Choose a location")
    res = check_output_folder(loc)
    if not res["ok"]:
        raise ValueError(res["message"])
    loc_path = Path(loc).expanduser()
    folder = unique_project_folder_path(loc_path, name)
    assets = folder / PROJECT_ASSETS_DIR
    if len(str(assets)) > 260:
        raise ValueError("The folder path is too long")
    try:
        if folder.exists() and not folder.is_dir():
            raise ValueError(f'"{folder.name}" already exists in this location')
        if folder.exists() and any(p for p in folder.iterdir() if p.name != PROJECT_ASSETS_DIR or not p.is_dir()):
            raise ValueError(f'"{folder.name}" already exists in this location')
        missing = [p for p in (*reversed(assets.parents), assets) if not p.exists()]
        assets.mkdir(parents=True, exist_ok=True)
    except OSError as ex:
        raise ValueError(f"Cannot create the project folder: {ex}") from None
    if created is not None:
        created.extend(missing)
    return folder


def make_project_folder(location: Any, name: Any, created: list[Path] | None = None) -> Path:
    """Create <project folder>/assets for a new project and return the project folder
    (see project_folder_path). A new <location>/<name> must be new or empty; a location that already is
    the project folder may hold other files (only `assets` is added, nothing existing is changed).
    Raises ValueError with a user-facing message. Folders this call created are appended to `created`
    (outermost first)."""
    loc = _clamp_project_folder(location)
    if not loc:
        raise ValueError("Choose a location")
    res = check_output_folder(loc)
    if not res["ok"]:
        raise ValueError(res["message"])
    loc_path = Path(loc).expanduser()
    folder = project_folder_path(loc_path, name)
    assets = folder / PROJECT_ASSETS_DIR
    if len(str(assets)) > 260:
        raise ValueError("The folder path is too long")
    try:
        if folder != loc_path and folder.exists() and (not folder.is_dir() or any(folder.iterdir())):
            raise ValueError(f'"{folder.name}" already exists in this location')
        missing = [p for p in (*reversed(assets.parents), assets) if not p.exists()]
        assets.mkdir(parents=True, exist_ok=True)
    except OSError as ex:
        raise ValueError(f"Cannot create the project folder: {ex}") from None
    if created is not None:
        created.extend(missing)
    return folder


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
    gen_aspect = _clamp_gen_aspect(src.get("gen_aspect") or src.get("aspect") or out.get("gen_aspect") or out.get("aspect"))
    if "resolution_short" in src and _is_custom_resolution(src.get("resolution_short")):
        resolution_short: int | str = GEN_RESOLUTION_CUSTOM
        width = _round_gen_dim(src.get("width", out.get("width")))
        height = _round_gen_dim(src.get("height", out.get("height")))
    else:
        if "resolution_short" in src:
            resolution_short = _clamp_preset_short(src["resolution_short"])
        elif "width" in src or "height" in src:
            resolution_short = _infer_resolution_short(gen_aspect, src.get("width", out.get("width")), src.get("height", out.get("height")))
        else:
            resolution_short = _clamp_preset_short(out.get("resolution_short"))
        dims = dimensions_from_gen_settings(gen_aspect, resolution_short)
        width = dims["width"]
        height = dims["height"]
    out["gen_aspect"] = gen_aspect
    out["aspect"] = gen_aspect
    out["resolution_short"] = resolution_short
    if "random_seed" in src:
        out["random_seed"] = _clamp_random_seed(src["random_seed"])
    elif "random_seed" not in (raw or {}):
        out.setdefault("random_seed", bool(DEFAULT_PROJECT_SETTINGS["random_seed"]))
    out["width"] = width
    out["height"] = height
    out["fps"] = _clamp_fps(out.get("fps"))
    out["cut_seconds"] = _clamp_cut_seconds(out.get("cut_seconds"))
    out["caption_lang"] = _clamp_caption_lang(out.get("caption_lang"))
    out["project_folder"] = _clamp_project_folder(out.get("project_folder"))
    out["export_folder"] = _clamp_project_folder(out.get("export_folder"))
    out["image_template"] = _clamp_template_ref(out.get("image_template"), DEFAULT_IMAGE_TEMPLATE)
    out["video_template"] = _clamp_template_ref(out.get("video_template"), DEFAULT_VIDEO_TEMPLATE)
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
