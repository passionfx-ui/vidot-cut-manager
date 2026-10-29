"""Folder picker listing for Project Settings > Output folder > Browse…: folder names only (no files, no sizes)."""
from __future__ import annotations

import os
import stat
import string
from pathlib import Path
from typing import Any


def list_drives() -> list[str]:
    """Windows drive roots (e.g. "C:\\"); "/" elsewhere."""
    if os.name != "nt":
        return ["/"]
    lister = getattr(os, "listdrives", None)
    if lister is not None:
        try:
            return sorted(lister(), key=str.upper)
        except OSError:
            pass
    return [f"{c}:\\" for c in string.ascii_uppercase if os.path.exists(f"{c}:\\")]


def _is_hidden(entry: os.DirEntry) -> bool:
    if os.name == "nt":
        return bool(entry.stat().st_file_attributes & stat.FILE_ATTRIBUTE_HIDDEN)
    return entry.name.startswith(".")


def list_folders(path: Any) -> dict[str, Any]:
    """Empty path = drive list (parent None). Otherwise the visible subfolder names of an absolute folder path,
    plus its parent ("" at a drive root = back to the drive list).
    Raises ValueError (relative / bad path), FileNotFoundError, NotADirectoryError, PermissionError, OSError."""
    raw = str(path or "").strip()
    if not raw:
        return {"ok": True, "path": "", "parent": None, "folders": list_drives()}
    if any(ch < " " for ch in raw):
        raise ValueError("Invalid path")
    if not Path(raw).is_absolute():
        raise ValueError("Use a full path, e.g. D:\\Films")
    folder = Path(os.path.normpath(raw))
    if not folder.exists():
        raise FileNotFoundError(raw)
    if not folder.is_dir():
        raise NotADirectoryError(raw)
    names: list[str] = []
    with os.scandir(folder) as it:
        for entry in it:
            try:
                if entry.is_dir() and not _is_hidden(entry):
                    names.append(entry.name)
            except OSError:
                continue
    names.sort(key=str.casefold)
    parent = "" if folder.parent == folder else str(folder.parent)
    return {"ok": True, "path": str(folder), "parent": parent, "folders": names}


def folder_list_response(path: Any) -> tuple[int, dict[str, Any]]:
    """(HTTP status, JSON body) for GET /gonggan/folder/list."""
    def fail(status: int, message: str) -> tuple[int, dict[str, Any]]:
        return status, {"ok": False, "message": message}

    try:
        return 200, list_folders(path)
    except ValueError as ex:
        return fail(400, str(ex))
    except PermissionError:
        return fail(403, "Permission denied: this folder cannot be opened")
    except FileNotFoundError:
        return fail(404, "Folder not found")
    except NotADirectoryError:
        return fail(400, "This path is a file, not a folder")
    except OSError as ex:
        return fail(400, f"Cannot open this folder: {ex.strerror or ex}")
