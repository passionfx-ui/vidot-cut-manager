"""Per-version workflow JSON store (pack-local workflows/<pid>/<cut>/<vid>.workflow.json)."""
from __future__ import annotations

import argparse
import json
import struct
import time
import zlib
from pathlib import Path

try:
    from .gg_data import PACK_DIR, PID_RE, VER_ID_RE, VERSIONS_DIR, load_edit
except ImportError:
    from gg_data import PACK_DIR, PID_RE, VER_ID_RE, VERSIONS_DIR, load_edit  # type: ignore

WORKFLOWS_DIR = PACK_DIR / "workflows"
_PNG_SIG = b"\x89PNG\r\n\x1a\n"
_WF_KEYS = frozenset({"workflow", "prompt"})


def _check_pid(pid: str) -> str:
    if not PID_RE.fullmatch(pid or ""):
        raise ValueError("invalid project id")
    return pid


def _check_cut(cut_id: str) -> str:
    if not PID_RE.fullmatch(cut_id or ""):
        raise ValueError("invalid cut id")
    return cut_id


def _check_vid(vid: str) -> str:
    if not VER_ID_RE.fullmatch(vid or ""):
        raise ValueError("invalid version id")
    return vid


def _workflow_path(pid: str, cut_id: str, vid: str) -> Path:
    return WORKFLOWS_DIR / pid / cut_id / f"{vid}.workflow.json"


def _parse_json_maybe(raw: str) -> dict | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _decode_text_chunk(data: bytes) -> tuple[str, str] | None:
    if b"\x00" not in data:
        return None
    key, rest = data.split(b"\x00", 1)
    try:
        keyword = key.decode("latin-1")
        text = rest.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return keyword, text


def _decode_itxt(data: bytes) -> tuple[str, str] | None:
    if b"\x00" not in data:
        return None
    key, rest = data.split(b"\x00", 1)
    try:
        keyword = key.decode("latin-1")
    except UnicodeDecodeError:
        return None
    parts = rest.split(b"\x00", 4)
    if len(parts) < 5:
        return None
    comp_flag = parts[0]
    comp_method = parts[1]
    text_bytes = parts[4]
    if comp_flag == b"\x01":
        if comp_method != b"\x00":
            return None
        try:
            text_bytes = zlib.decompress(text_bytes)
        except zlib.error:
            return None
    try:
        text = text_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return keyword, text


def extract_png_meta(path: Path) -> dict:
    """Read ComfyUI workflow/prompt from PNG tEXt/iTXt chunks (stdlib only)."""
    path = Path(path)
    out: dict = {"workflow": None, "prompt": None}
    with path.open("rb") as f:
        if f.read(8) != _PNG_SIG:
            return out
        while True:
            hdr = f.read(8)
            if len(hdr) < 8:
                break
            length, ctype = struct.unpack(">I4s", hdr)
            data = f.read(length)
            f.read(4)  # CRC
            if ctype == b"IEND":
                break
            if ctype == b"tEXt":
                pair = _decode_text_chunk(data)
            elif ctype == b"iTXt":
                pair = _decode_itxt(data)
            else:
                continue
            if not pair:
                continue
            keyword, text = pair
            if keyword not in _WF_KEYS:
                continue
            parsed = _parse_json_maybe(text)
            if parsed is not None:
                out[keyword] = parsed
    return out


def save_version_workflow(
    pid: str,
    cut_id: str,
    vid: str,
    workflow: dict | None,
    prompt: dict | None,
    source: str,
) -> Path:
    """Persist workflow UI graph and/or API prompt for one pack version."""
    pid = _check_pid(pid)
    cut_id = _check_cut(cut_id)
    vid = _check_vid(vid)
    if source not in ("generated", "png-backfill"):
        raise ValueError("invalid workflow source")
    if workflow is not None and not isinstance(workflow, dict):
        raise ValueError("workflow must be a dict or null")
    if prompt is not None and not isinstance(prompt, dict):
        raise ValueError("prompt must be a dict or null")
    if workflow is None and prompt is None:
        raise ValueError("workflow and prompt cannot both be null")
    rec = {
        "workflow": workflow,
        "prompt": prompt,
        "source": source,
        "created": time.time(),
    }
    dest = _workflow_path(pid, cut_id, vid)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.json")
    tmp.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(dest)
    return dest


def get_version_workflow(pid: str, cut_id: str, vid: str) -> dict | None:
    pid = _check_pid(pid)
    cut_id = _check_cut(cut_id)
    vid = _check_vid(vid)
    path = _workflow_path(pid, cut_id, vid)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _version_media_mtime(d: Path, vid: str) -> float:
    best = 0.0
    for p in d.glob(vid + ".*"):
        if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm"}:
            try:
                best = max(best, p.stat().st_mtime)
            except OSError:
                pass
    return best


def _list_cut_vids(pid: str, cut_id: str) -> list[str]:
    d = VERSIONS_DIR / pid / cut_id
    if not d.is_dir():
        return []
    vids = {p.stem for p in d.glob("v*.json") if VER_ID_RE.fullmatch(p.stem)}
    vids |= {p.name.rsplit(".", 1)[0] for p in d.glob("v*.*") if VER_ID_RE.fullmatch(p.name.rsplit(".", 1)[0])}
    return sorted(vids, key=lambda v: (_version_media_mtime(d, v), v), reverse=True)


def latest_cut_workflow(pid: str, cut_id: str) -> dict | None:
    """Stored workflow for the cut's pick version, else the newest version with a store file."""
    pid = _check_pid(pid)
    cut_id = _check_cut(cut_id)
    vids = _list_cut_vids(pid, cut_id)
    if not vids:
        return None
    edit = load_edit(pid) or {}
    clip = (edit.get("clips") or {}).get(cut_id) or {}
    pick = clip.get("pick") if isinstance(clip.get("pick"), str) else None
    if pick and pick in vids:
        hit = get_version_workflow(pid, cut_id, pick)
        if hit:
            return hit
    for vid in vids:
        hit = get_version_workflow(pid, cut_id, vid)
        if hit:
            return hit
    return None


def _workflow_payload(rec: dict) -> tuple[dict | None, str]:
    ui = rec.get("workflow")
    api = rec.get("prompt")
    if isinstance(ui, dict) and ui:
        return ui, "ui"
    if isinstance(api, dict) and api:
        return api, "api"
    return None, "api"


def cut_source_workflow(pid: str, cut_id: str) -> dict:
    """Resolve stored version → project template → draft workflow for a cut."""
    from . import gg_template
    from . import gg_sdk

    pid = _check_pid(pid)
    cut_id = _check_cut(cut_id)
    stored = latest_cut_workflow(pid, cut_id)
    if stored:
        wf, kind = _workflow_payload(stored)
        if wf:
            return {"ok": True, "source": "stored", "workflow": wf, "kind": kind}
    tpl = gg_template.get_template(pid)
    if tpl:
        kind = "ui" if gg_template._is_ui_workflow(tpl) else "api"
        return {"ok": True, "source": "template", "workflow": tpl, "kind": kind}
    try:
        p = gg_sdk.cut_workflow(pid, cut_id, None, save_file=False)
    except ValueError:
        return {"ok": True, "source": None, "workflow": None, "kind": None}
    return {"ok": True, "source": "draft", "workflow": p["workflow"], "kind": "api"}


def backfill(pid: str | None = None, dry_run: bool = False) -> dict:
    """Scan version PNGs and write missing workflow JSON (never touches PNG bytes)."""
    counts = {"scanned": 0, "written": 0, "skipped": 0, "errors": 0}
    if pid is not None:
        _check_pid(pid)
    roots: list[Path] = []
    if not VERSIONS_DIR.is_dir():
        return counts
    if pid:
        roots = [VERSIONS_DIR / pid]
    else:
        roots = [p for p in VERSIONS_DIR.iterdir() if p.is_dir()]
    for proot in roots:
        if not PID_RE.fullmatch(proot.name):
            continue
        for cut_dir in proot.iterdir():
            if not cut_dir.is_dir() or not PID_RE.fullmatch(cut_dir.name):
                continue
            for png in cut_dir.glob("*.png"):
                vid = png.stem
                if not VER_ID_RE.fullmatch(vid):
                    continue
                counts["scanned"] += 1
                if _workflow_path(proot.name, cut_dir.name, vid).is_file():
                    counts["skipped"] += 1
                    continue
                try:
                    meta = extract_png_meta(png)
                    ui = meta.get("workflow")
                    api = meta.get("prompt")
                    if not isinstance(ui, dict):
                        ui = None
                    if not isinstance(api, dict):
                        api = None
                    if ui is None and api is None:
                        counts["skipped"] += 1
                        continue
                    if not dry_run:
                        save_version_workflow(proot.name, cut_dir.name, vid, ui, api, "png-backfill")
                    counts["written"] += 1
                except Exception:  # noqa: BLE001
                    counts["errors"] += 1
    return counts


def maybe_save_for_new_version(
    pid: str,
    cut_id: str,
    vid: str,
    media_path: Path,
    meta: dict,
) -> None:
    """Called from gg_data.add_version after the media file is in place."""
    ui = meta.get("ui_workflow") if isinstance(meta.get("ui_workflow"), dict) else None
    api = meta.get("api_prompt") if isinstance(meta.get("api_prompt"), dict) else None
    if api is None and isinstance(meta.get("workflow"), dict) and "nodes" not in meta.get("workflow", {}):
        api = meta["workflow"]
    if ui is None and isinstance(meta.get("workflow"), dict) and "nodes" in meta.get("workflow", {}):
        ui = meta["workflow"]
    if ui is None and api is None and media_path.suffix.lower() == ".png":
        extracted = extract_png_meta(media_path)
        ui = extracted.get("workflow") if isinstance(extracted.get("workflow"), dict) else None
        api = extracted.get("prompt") if isinstance(extracted.get("prompt"), dict) else None
    if ui is None and api is None:
        return
    try:
        save_version_workflow(pid, cut_id, vid, ui, api, "generated")
    except ValueError:
        pass


def _main() -> int:
    parser = argparse.ArgumentParser(description="Gonggan per-version workflow store")
    sub = parser.add_subparsers(dest="cmd")
    bf = sub.add_parser("backfill", help="Backfill workflow JSON from version PNG metadata")
    bf.add_argument("--dry-run", action="store_true", help="Report counts only; do not write files")
    bf.add_argument("--pid", metavar="X", help="Limit to one project id")
    args = parser.parse_args()
    if args.cmd != "backfill":
        parser.print_help()
        return 1
    counts = backfill(pid=args.pid, dry_run=args.dry_run)
    print(json.dumps(counts, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
