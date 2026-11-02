"""Hide deleted cut / version files under <project>/.history/files/<step>/.

The folder is dot-named and marked hidden so it stays out of the folder picker.
Purging a step deletes that folder for good (no Recycle Bin).
"""
from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path
from typing import Any

_STEP_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def _safe_step(step_id: str) -> str:
    if not isinstance(step_id, str) or not _STEP_RE.fullmatch(step_id):
        raise ValueError("bad history step")
    return step_id


def _safe_id(value: str) -> str:
    if not isinstance(value, str) or not _ID_RE.fullmatch(value):
        raise ValueError("bad id")
    return value


def history_root(project_dir: Path) -> Path:
    return Path(project_dir) / ".history"


def ensure_history_root(project_dir: Path) -> Path:
    root = history_root(project_dir)
    root.mkdir(parents=True, exist_ok=True)
    _mark_hidden(root)
    return root


def _mark_hidden(path: Path) -> None:
    """Windows folder picker skips the hidden attribute; other systems skip dot names."""
    if os.name != "nt":
        return
    try:
        import ctypes
        ctypes.windll.kernel32.SetFileAttributesW(str(path), 0x2)
    except Exception:  # noqa: BLE001
        pass


def _step_dir(project_dir: Path, step_id: str) -> Path:
    sid = _safe_step(step_id)
    base = ensure_history_root(project_dir) / "files"
    dest = base / sid
    dest.resolve().relative_to(base.resolve())
    return dest


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def _inside(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _stash_asset(project_dir: Path, step: Path, asset: Any, bucket: list[dict[str, str]]) -> None:
    from .project_settings import is_external_project_asset_media
    from .timeline import version_asset_file

    path = version_asset_file(project_dir, asset)
    if path is None or not path.is_file():
        return
    media = step / "media"
    media.mkdir(parents=True, exist_ok=True)
    stored = f"{len(bucket):04d}_{path.name}"
    dest = media / stored
    if not _inside(dest, step):
        return
    record: dict[str, str] = {"stored": f"media/{stored}", "name": path.name}
    try:
        rel = path.resolve().relative_to(project_dir.resolve())
    except ValueError:
        rel = None
    if rel is not None and ".." not in rel.parts:
        record["rel"] = str(rel).replace("\\", "/")
    elif is_external_project_asset_media(path):
        record["abs"] = str(path)
    else:
        return
    if dest.exists():
        return
    shutil.move(str(path), str(dest))
    bucket.append(record)


def _prepare(project_dir: Path, step_id: str) -> Path | None:
    """Step folder, or None when this step was already stashed."""
    step = _step_dir(project_dir, step_id)
    if (step / "manifest.json").is_file():
        return None
    step.mkdir(parents=True, exist_ok=True)
    return step


def stash_cuts(project_dir: Path, step_id: str, cut_ids: list[str]) -> None:
    """Move each cut's version json and media into the step folder. Shared workflow blobs stay."""
    step = _prepare(project_dir, step_id)
    if step is None:
        return
    manifest: dict[str, Any] = {"cuts": [], "versions": [], "assets": []}
    try:
        _stash_cuts_into(project_dir, step, cut_ids, manifest)
    finally:
        _write_json(step / "manifest.json", manifest)


def _stash_cuts_into(project_dir: Path, step: Path, cut_ids: list[str], manifest: dict[str, Any]) -> None:
    for raw in cut_ids:
        try:
            cid = _safe_id(raw)
        except ValueError:
            continue
        vdir = project_dir / "versions" / cid
        if not _inside(vdir, project_dir) or not vdir.is_dir():
            manifest["cuts"].append({"cut_id": cid, "versions": False})
            continue
        for vf in list(vdir.glob("*.json")):
            try:
                data = _read_json(vf)
            except (OSError, ValueError):
                continue
            if isinstance(data, dict):
                _stash_asset(project_dir, step, data.get("asset"), manifest["assets"])
        dest = step / "versions" / cid
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            shutil.move(str(vdir), str(dest))
        manifest["cuts"].append({"cut_id": cid, "versions": True})


def stash_version(project_dir: Path, step_id: str, cut_id: str, version_id: str) -> None:
    """Move one version json and its media into the step folder."""
    cid = _safe_id(cut_id)
    vid = _safe_id(version_id)
    step = _prepare(project_dir, step_id)
    if step is None:
        return
    src = project_dir / "versions" / cid / f"{vid}.json"
    if not _inside(src, project_dir) or not src.is_file():
        raise FileNotFoundError("version not found")
    try:
        data = _read_json(src)
    except (OSError, ValueError) as ex:
        raise FileNotFoundError("version not found") from ex
    manifest: dict[str, Any] = {"cuts": [], "versions": [], "assets": []}
    if isinstance(data, dict):
        _stash_asset(project_dir, step, data.get("asset"), manifest["assets"])
    dest = step / "versions" / cid / f"{vid}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    manifest["versions"].append({"cut_id": cid, "version_id": vid})
    _write_json(step / "manifest.json", manifest)


def restore_step(project_dir: Path, step_id: str) -> None:
    """Move a step's hidden files back. Existing live files are left untouched."""
    try:
        step = _step_dir(project_dir, step_id)
    except ValueError:
        return
    manifest_path = step / "manifest.json"
    if not manifest_path.is_file():
        return
    try:
        manifest = _read_json(manifest_path)
    except (OSError, ValueError):
        return
    if not isinstance(manifest, dict):
        return
    project_dir = Path(project_dir)
    for row in manifest.get("cuts") or []:
        if not isinstance(row, dict) or not row.get("versions"):
            continue
        try:
            cid = _safe_id(str(row.get("cut_id") or ""))
        except ValueError:
            continue
        src = step / "versions" / cid
        dest = project_dir / "versions" / cid
        if src.is_dir() and _inside(dest, project_dir) and not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
    for row in manifest.get("versions") or []:
        if not isinstance(row, dict):
            continue
        try:
            cid = _safe_id(str(row.get("cut_id") or ""))
            vid = _safe_id(str(row.get("version_id") or ""))
        except ValueError:
            continue
        src = step / "versions" / cid / f"{vid}.json"
        dest = project_dir / "versions" / cid / f"{vid}.json"
        if src.is_file() and _inside(dest, project_dir) and not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
    for row in manifest.get("assets") or []:
        if not isinstance(row, dict):
            continue
        stored = row.get("stored")
        if not isinstance(stored, str) or ".." in Path(stored).parts:
            continue
        src = step / stored
        if not src.is_file() or not _inside(src, step):
            continue
        dest: Path | None = None
        rel = row.get("rel")
        if isinstance(rel, str) and rel and ".." not in Path(rel).parts:
            dest = project_dir / rel
            if not _inside(dest, project_dir):
                dest = None
        elif isinstance(row.get("abs"), str):
            abs_path = Path(row["abs"])
            from .project_settings import is_external_project_asset_media
            if abs_path.is_absolute() and is_external_project_asset_media(abs_path):
                dest = abs_path
        if dest is None or dest.exists():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dest))
    shutil.rmtree(step, ignore_errors=True)


def purge_step(project_dir: Path, step_id: str) -> None:
    """Permanently delete the step folder. Missing folders are fine."""
    try:
        step = _step_dir(project_dir, step_id)
    except ValueError:
        return
    if step.is_dir():
        shutil.rmtree(step, ignore_errors=True)
