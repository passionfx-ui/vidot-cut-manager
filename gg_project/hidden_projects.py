"""Reversible project hide list: projects/hidden_projects.json = {"hidden_ids": [...]}.

Only the project list reads it; nothing is deleted. Missing or invalid file = hide nothing.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

HIDDEN_FILE_NAME = "hidden_projects.json"


def load_hidden_ids(path: Path) -> set[str]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    ids = data.get("hidden_ids") if isinstance(data, dict) else None
    if not isinstance(ids, list):
        return set()
    return {i for i in ids if isinstance(i, str) and i}


def write_hidden_ids(path: Path, ids: Iterable[str]) -> list[str]:
    out = sorted({i for i in ids if isinstance(i, str) and i})
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps({"hidden_ids": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)
    return out


def filter_hidden(rows: list[dict[str, Any]], hidden: set[str]) -> list[dict[str, Any]]:
    if not hidden:
        return rows
    return [r for r in rows if r.get("id") not in hidden]
