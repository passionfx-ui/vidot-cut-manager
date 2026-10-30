"""Folder picker listing for Browse… (New Project Location, Project Settings Output folder): folder names only
(no files, no sizes), plus the drives and quick folders for the picker's left pane."""
from __future__ import annotations

import os
import re
import stat
import string
from pathlib import Path
from typing import Any

_DESKTOP_ID = "{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}"
_DOCUMENTS_ID = "{FDD39AD0-238F-46AF-ADB4-6C85480369C7}"


def normalize_folder_input(path: Any) -> str:
    """Typed / pasted path: surrounding quotes and trailing slashes dropped; a drive root stays "C:\\", "/" stays "/"."""
    s = str(path or "").strip().strip("\"'").strip()
    if re.fullmatch(r"[A-Za-z]:[\\/]*", s):
        return s[:2] + "\\"
    if s and not s.strip("/"):
        return "/"
    return s.rstrip("\\/")


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


def _known_folder(guid: str) -> str | None:
    """Windows shell folder (follows OneDrive / moved Desktop and Documents); None elsewhere or on failure."""
    if os.name != "nt":
        return None
    try:
        import ctypes
        import uuid

        class GUID(ctypes.Structure):
            _fields_ = [("Data1", ctypes.c_uint32), ("Data2", ctypes.c_uint16), ("Data3", ctypes.c_uint16),
                        ("Data4", ctypes.c_ubyte * 8)]

        fid = GUID.from_buffer_copy(uuid.UUID(guid).bytes_le)
        buf = ctypes.c_wchar_p()
        if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(fid), 0, None, ctypes.byref(buf)) != 0:
            return None
        try:
            return buf.value
        finally:
            ctypes.windll.ole32.CoTaskMemFree(buf)
    except Exception:  # noqa: BLE001
        return None


def quick_folders() -> list[dict[str, str]]:
    """Home, Desktop, Documents that exist on the server, as {name, path}."""
    home = Path.home()
    wanted = [
        ("Home", str(home)),
        ("Desktop", _known_folder(_DESKTOP_ID) or str(home / "Desktop")),
        ("Documents", _known_folder(_DOCUMENTS_ID) or str(home / "Documents")),
    ]
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for name, p in wanted:
        key = os.path.normcase(p)
        if key in seen or not os.path.isdir(p):
            continue
        seen.add(key)
        out.append({"name": name, "path": p})
    return out


def _is_hidden(entry: os.DirEntry) -> bool:
    if os.name == "nt":
        return bool(entry.stat().st_file_attributes & stat.FILE_ATTRIBUTE_HIDDEN)
    return entry.name.startswith(".")


def _is_folder(entry: os.DirEntry) -> bool:
    """A folder the picker may list: the scandir type says folder and a real stat agrees (links followed),
    so files, links to files and broken links never show."""
    return entry.is_dir() and not entry.is_file() and os.path.isdir(entry.path)


def list_folders(path: Any) -> dict[str, Any]:
    """Empty path = drive list (parent None). Otherwise the visible subfolder names of an absolute folder path,
    plus its parent ("" at a drive root = back to the drive list). Every answer also carries `drives` and `quick`.
    Raises ValueError (relative / bad path), FileNotFoundError, NotADirectoryError, PermissionError, OSError."""
    raw = normalize_folder_input(path)
    if any(ch < " " for ch in raw):
        raise ValueError("Invalid path")
    if not raw:
        drives = list_drives()
        return {"ok": True, "path": "", "parent": None, "folders": drives, "drives": drives, "quick": quick_folders()}
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
                if _is_folder(entry) and not _is_hidden(entry):
                    names.append(entry.name)
            except OSError:
                continue
    names.sort(key=str.casefold)
    parent = "" if folder.parent == folder else str(folder.parent)
    return {"ok": True, "path": str(folder), "parent": parent, "folders": names, "drives": list_drives(),
            "quick": quick_folders()}


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
