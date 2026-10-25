"""Entity helpers for native project documents."""
from __future__ import annotations

from typing import Any

from .ids import now_iso, uuid7


def sync_fields() -> dict[str, Any]:
    return {
        "remote_id": None,
        "remote_rev": None,
        "etag": None,
        "dirty": True,
        "last_synced_at": None,
    }


def origin_native() -> dict[str, Any]:
    return {"kind": "native", "ref": None}


def entity_base(entity_id: str | None = None) -> dict[str, Any]:
    ts = now_iso()
    return {
        "id": entity_id or uuid7(),
        "created_at": ts,
        "updated_at": ts,
        "rev": 1,
        "deleted_at": None,
        "origin": origin_native(),
        "sync": sync_fields(),
    }


def bump_entity(ent: dict[str, Any]) -> None:
    ent["updated_at"] = now_iso()
    ent["rev"] = int(ent.get("rev") or 0) + 1
    sync = ent.get("sync")
    if isinstance(sync, dict):
        sync["dirty"] = True


def default_settings() -> dict[str, Any]:
    return {"fps": 24, "default_sec": 3.0}


def new_scene(name: str) -> dict[str, Any]:
    s = entity_base()
    s["name"] = name
    s["cut_order"] = []
    s["collapsed"] = False
    return s


def new_cut(
    scene_id: str | None,
    name: str,
    sec: float = 3.0,
    workflow_sha: str | None = None,
) -> dict[str, Any]:
    c = entity_base()
    c["scene_id"] = scene_id
    c["name"] = name
    c["sec"] = sec
    c["in"] = 0
    c["pick_version_id"] = None
    c["prompt"] = ""
    c["notes"] = ""
    c["caption"] = ""
    c["planned_sec"] = None
    c["end_card"] = False
    c["needs_redo"] = False
    c["workflow_sha"] = workflow_sha
    return c


def new_version(
    cut_id: str,
    asset: dict[str, Any],
    workflow_sha: str | None,
    prompt_id: str | None = None,
) -> dict[str, Any]:
    v = entity_base()
    v["cut_id"] = cut_id
    v["asset"] = asset
    v["workflow_sha"] = workflow_sha
    v["run"] = {
        "backend": "local",
        "prompt_id": prompt_id,
        "status": "completed",
        "error": None,
    }
    return v
