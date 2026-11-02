"""Per-project History document (diffs only) and the global History steps limit.

Native projects: `<project>/.history/history.json`.
Older trash entries are copied in as steps on first read. Files are not deleted
during that copy. A step that later falls past the limit permanently drops the
hidden files that belong to it.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from .history_files import ensure_history_root, purge_step, restore_step, stash_cuts

HISTORY_STEPS_DEFAULT = 50
HISTORY_STEPS_MIN = 1
HISTORY_STEPS_MAX = 500
_DOC_VERSION = 1


def clamp_history_steps(n: Any) -> int:
    try:
        v = int(n)
    except (TypeError, ValueError):
        return HISTORY_STEPS_DEFAULT
    if v < HISTORY_STEPS_MIN:
        return HISTORY_STEPS_MIN
    if v > HISTORY_STEPS_MAX:
        return HISTORY_STEPS_MAX
    return v


def history_steps_limit() -> int:
    try:
        from .. import gg_data
    except ImportError:
        import gg_data  # type: ignore
    return clamp_history_steps(gg_data.load_settings().get("history_steps", HISTORY_STEPS_DEFAULT))


def save_history_steps(n: Any) -> int:
    """Write history_steps into gonggan_settings.json. Other keys stay."""
    try:
        from .. import gg_data
    except ImportError:
        import gg_data  # type: ignore
    value = clamp_history_steps(n)
    path = gg_data.SETTINGS_FILE
    data: dict[str, Any] = {}
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8") or "{}")
        except (OSError, ValueError) as ex:
            raise ValueError(f"Could not read {path.name}: {ex}") from None
        if not isinstance(loaded, dict):
            raise ValueError(f"{path.name} is not a JSON object.")
        data = loaded
    elif gg_data.DEFAULT_SETTINGS_FILE.is_file():
        try:
            base = json.loads(gg_data.DEFAULT_SETTINGS_FILE.read_text(encoding="utf-8") or "{}")
        except (OSError, ValueError):
            base = {}
        if isinstance(base, dict):
            data = dict(base)
    data["history_steps"] = value
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    return value


def _empty(limit: int | None = None) -> dict[str, Any]:
    return {"version": _DOC_VERSION, "cursor": -1, "steps": [], "limit": limit if limit is not None else history_steps_limit()}


def _read_doc(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return _empty()
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "{}")
    except (OSError, ValueError):
        return _empty()
    if not isinstance(data, dict):
        return _empty()
    steps = data.get("steps")
    if not isinstance(steps, list):
        steps = []
    try:
        cursor = int(data.get("cursor", -1))
    except (TypeError, ValueError):
        cursor = -1
    return {"version": _DOC_VERSION, "cursor": cursor, "steps": [s for s in steps if isinstance(s, dict)]}


def _write_doc(path: Path, doc: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = {
        "version": _DOC_VERSION,
        "cursor": doc.get("cursor", -1),
        "steps": doc.get("steps") or [],
    }
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(body, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def _known_cut_ids(steps: list[dict[str, Any]]) -> set[str]:
    known: set[str] = set()
    for step in steps:
        entry = step.get("entry") if isinstance(step.get("entry"), dict) else {}
        if entry.get("kind") == "cuts":
            for cid in entry.get("ids") or []:
                if isinstance(cid, str):
                    known.add(cid)
        elif isinstance(step.get("id"), str) and step["id"].startswith("m"):
            pass
        ids = entry.get("legacy_trash")
        if isinstance(ids, list):
            for cid in ids:
                if isinstance(cid, str):
                    known.add(cid)
    return known


def _migrate_native(store: Any, pid: str, project_dir: Path, doc: dict[str, Any]) -> bool:
    """Turn still-deleted cuts into History steps. Moves their files into the hidden folder."""
    try:
        deleted = store.list_deleted_cuts(pid)
    except Exception:  # noqa: BLE001
        deleted = []
    known = _known_cut_ids(doc["steps"])
    added: list[dict[str, Any]] = []
    # list_deleted_cuts is newest-first; History shows oldest at the top.
    for row in reversed(deleted):
        if not isinstance(row, dict):
            continue
        cid = row.get("id")
        if not isinstance(cid, str) or cid in known:
            continue
        known.add(cid)
        step_id = "m" + cid.replace("-", "")[:40]
        try:
            stash_cuts(project_dir, step_id, [cid])
            history_step = step_id
        except Exception:  # noqa: BLE001
            history_step = None
        name = row.get("name") if isinstance(row.get("name"), str) and row.get("name").strip() else "cut"
        added.append({
            "id": step_id,
            "label": f"Delete {name}"[:80],
            "scope": "shots",
            "entry": {
                "kind": "cuts",
                "op": "delete",
                "ids": [cid],
                "before": None,
                "history_step": history_step,
                "legacy": True,
            },
            "after": None,
        })
    if not added:
        return False
    old_cursor = doc.get("cursor", -1)
    try:
        old_cursor = int(old_cursor)
    except (TypeError, ValueError):
        old_cursor = -1
    doc["steps"] = added + list(doc["steps"])
    doc["cursor"] = (len(added) - 1) if old_cursor < 0 else old_cursor + len(added)
    return True


def _legacy_trash_steps(pid: str, known: set[str]) -> list[dict[str, Any]]:
    """Steps for pack-local cuts already sitting in trash/. Files stay there until the step ages out."""
    try:
        from .. import gg_data
    except ImportError:
        import gg_data  # type: ignore
    try:
        items = gg_data.list_trash(pid)
    except Exception:  # noqa: BLE001
        return []
    out: list[dict[str, Any]] = []
    # list_trash walks newest stamp first; keep the newest manifest per cut, then oldest-first in History.
    seen: list[dict[str, Any]] = []
    got: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        cid = item.get("cut_id")
        if not isinstance(cid, str) or cid in known or cid in got:
            continue
        got.add(cid)
        seen.append(item)
    for item in reversed(seen):
        cid = item["cut_id"]
        local = item.get("local_cut") if isinstance(item.get("local_cut"), dict) else {}
        name = local.get("name") if isinstance(local.get("name"), str) and local.get("name").strip() else "cut"
        out.append({
            "id": "t" + "".join(ch for ch in cid if ch.isalnum())[:40],
            "label": f"Delete {name}"[:80],
            "scope": "shots",
            "entry": {
                "kind": "cuts",
                "op": "delete",
                "ids": [cid],
                "before": None,
                "history_step": None,
                "legacy": True,
                "legacy_trash": [cid],
            },
            "after": None,
        })
    return out


def _purge_legacy_trash(pid: str, cut_ids: list[str]) -> None:
    try:
        from .. import gg_data
    except ImportError:
        import gg_data  # type: ignore
    if not gg_data.PID_RE.fullmatch(pid or ""):
        return
    base = gg_data.TRASH_DIR / pid
    if not base.is_dir():
        return
    wanted = {c for c in cut_ids if isinstance(c, str)}
    if not wanted:
        return
    for stamp_dir in list(base.iterdir()):
        if not stamp_dir.is_dir():
            continue
        for cut_dir in list(stamp_dir.iterdir()):
            if cut_dir.is_dir() and cut_dir.name in wanted:
                shutil.rmtree(cut_dir, ignore_errors=True)
        try:
            if stamp_dir.is_dir() and not any(stamp_dir.iterdir()):
                stamp_dir.rmdir()
        except OSError:
            pass


def _purge_removed(project_dir: Path | None, pid: str, old_steps: list[dict[str, Any]], new_ids: set[str]) -> None:
    for step in old_steps:
        sid = step.get("id")
        if not isinstance(sid, str) or sid in new_ids:
            continue
        if project_dir is not None:
            purge_step(project_dir, sid)
        entry = step.get("entry") if isinstance(step.get("entry"), dict) else {}
        trash_ids = entry.get("legacy_trash")
        if isinstance(trash_ids, list):
            _purge_legacy_trash(pid, [c for c in trash_ids if isinstance(c, str)])


def _trim(doc: dict[str, Any], limit: int) -> None:
    steps = doc["steps"]
    while len(steps) > limit:
        steps.pop(0)
        cursor = int(doc.get("cursor", -1))
        doc["cursor"] = cursor - 1 if cursor >= 0 else -1
    if steps:
        cursor = int(doc.get("cursor", -1))
        if cursor >= len(steps):
            doc["cursor"] = len(steps) - 1
        elif cursor < -1:
            doc["cursor"] = -1
    else:
        doc["cursor"] = -1


def _public(doc: dict[str, Any], limit: int) -> dict[str, Any]:
    return {"ok": True, "cursor": doc.get("cursor", -1), "steps": doc.get("steps") or [], "limit": limit}


def load_native_history(store: Any, pid: str) -> dict[str, Any]:
    project_dir = store._project_dir(pid)
    path = ensure_history_root(project_dir) / "history.json"
    doc = _read_doc(path)
    changed = _migrate_native(store, pid, project_dir, doc)
    trash_steps = _legacy_trash_steps(pid, _known_cut_ids(doc["steps"]))
    if trash_steps:
        old_cursor = int(doc.get("cursor", -1))
        doc["steps"] = trash_steps + list(doc["steps"])
        doc["cursor"] = (len(trash_steps) - 1) if old_cursor < 0 else old_cursor + len(trash_steps)
        changed = True
    limit = history_steps_limit()
    if changed:
        # Migration itself never drops steps, so existing trash stays restorable.
        _write_doc(path, doc)
    return _public(doc, limit)


def _merge_unseen_migration(old_steps: list[dict[str, Any]], doc: dict[str, Any], loaded: bool) -> None:
    """A save that has not loaded disk history yet must not replace it.

    Once the client has loaded, migrated trash steps (ids starting with m or t)
    are still put back if that save never included them.
    """
    client_ids = {s.get("id") for s in doc["steps"]}
    if loaded:
        if any(isinstance(i, str) and (i.startswith("m") or i.startswith("t")) for i in client_ids):
            return
        keep = [
            s for s in old_steps
            if isinstance(s.get("id"), str) and (s["id"].startswith("m") or s["id"].startswith("t")) and s["id"] not in client_ids
        ]
    else:
        keep = [s for s in old_steps if isinstance(s.get("id"), str) and s["id"] not in client_ids]
    if not keep:
        return
    doc["steps"] = keep + list(doc["steps"])
    cursor = int(doc.get("cursor", -1))
    doc["cursor"] = (len(keep) - 1) if cursor < 0 else cursor + len(keep)


def _purge_ids(project_dir: Path | None, ids: Any, new_ids: set[str]) -> None:
    """Delete hidden files for steps the client already dropped and never saved."""
    if project_dir is None or not isinstance(ids, list):
        return
    for sid in ids[:500]:
        if isinstance(sid, str) and sid and sid not in new_ids:
            purge_step(project_dir, sid)


def _save_doc(path: Path, project_dir: Path | None, pid: str, payload: dict[str, Any]) -> dict[str, Any]:
    old = _read_doc(path)
    doc = _normalize_client(payload)
    _merge_unseen_migration(old["steps"], doc, payload.get("loaded") is True)
    pre_trim = list(doc["steps"])
    limit = history_steps_limit()
    _trim(doc, limit)
    new_ids = {s.get("id") for s in doc["steps"] if isinstance(s.get("id"), str)}
    removed = [s for s in list(old["steps"]) + pre_trim if s.get("id") not in new_ids]
    _purge_removed(project_dir, pid, removed, new_ids)
    _purge_ids(project_dir, payload.get("purge"), new_ids)
    _write_doc(path, doc)
    return _public(doc, limit)


def save_native_history(store: Any, pid: str, payload: dict[str, Any]) -> dict[str, Any]:
    project_dir = store._project_dir(pid)
    path = ensure_history_root(project_dir) / "history.json"
    return _save_doc(path, project_dir, pid, payload)


def _legacy_history_path(pid: str) -> Path:
    try:
        from .. import gg_data
    except ImportError:
        import gg_data  # type: ignore
    if not gg_data.PID_RE.fullmatch(pid or ""):
        raise ValueError("invalid project id")
    return gg_data.PACK_DIR / "history" / pid / "history.json"


def load_legacy_history(pid: str) -> dict[str, Any]:
    path = _legacy_history_path(pid)
    doc = _read_doc(path)
    trash_steps = _legacy_trash_steps(pid, _known_cut_ids(doc["steps"]))
    limit = history_steps_limit()
    if trash_steps:
        old_cursor = int(doc.get("cursor", -1))
        doc["steps"] = trash_steps + list(doc["steps"])
        doc["cursor"] = (len(trash_steps) - 1) if old_cursor < 0 else old_cursor + len(trash_steps)
        _write_doc(path, doc)
    return _public(doc, limit)


def save_legacy_history(pid: str, payload: dict[str, Any]) -> dict[str, Any]:
    return _save_doc(_legacy_history_path(pid), None, pid, payload)


def _normalize_client(payload: dict[str, Any]) -> dict[str, Any]:
    raw_steps = payload.get("steps")
    if not isinstance(raw_steps, list):
        raise ValueError("steps required")
    if len(raw_steps) > HISTORY_STEPS_MAX:
        raw_steps = raw_steps[: HISTORY_STEPS_MAX]
    steps: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_steps:
        if not isinstance(raw, dict):
            continue
        sid = raw.get("id")
        entry = raw.get("entry")
        if not isinstance(sid, str) or not sid or sid in seen or not isinstance(entry, dict):
            continue
        if len(sid) > 64:
            continue
        seen.add(sid)
        label = raw.get("label") if isinstance(raw.get("label"), str) else "Edit"
        label = "".join(ch for ch in label if ch >= " " and ch != "\x7f")[:80] or "Edit"
        scope = "timeline" if raw.get("scope") == "timeline" else "shots"
        after = raw.get("after") if isinstance(raw.get("after"), (dict, list)) else None
        steps.append({"id": sid, "label": label, "scope": scope, "entry": entry, "after": after})
    try:
        cursor = int(payload.get("cursor", len(steps) - 1 if steps else -1))
    except (TypeError, ValueError):
        cursor = len(steps) - 1 if steps else -1
    if steps:
        cursor = max(-1, min(len(steps) - 1, cursor))
    else:
        cursor = -1
    blob = json.dumps(steps)
    if len(blob) > 1_500_000:
        raise ValueError("history is too large")
    return {"version": _DOC_VERSION, "cursor": cursor, "steps": steps}


def native_restore_history_files(project_dir: Path, step_id: str | None) -> None:
    if isinstance(step_id, str) and step_id:
        restore_step(project_dir, step_id)


def native_stash_history_files(project_dir: Path, step_id: str | None, kind: str, **ids: Any) -> None:
    if not isinstance(step_id, str) or not step_id:
        return
    if kind == "cuts":
        stash_cuts(project_dir, step_id, list(ids.get("cut_ids") or []))
    elif kind == "version":
        from .history_files import stash_version
        stash_version(project_dir, step_id, ids["cut_id"], ids["version_id"])
