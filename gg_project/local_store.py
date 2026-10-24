"""Filesystem-backed native project store under PACK_DIR/projects/."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import threading
from pathlib import Path
from typing import Any

from .entities import (
    bump_entity,
    default_settings,
    entity_base,
    new_cut,
    new_scene,
    new_version,
)
from .errors import ConflictError
from .ids import now_iso, uuid7
from .timeline import build_timeline, timeline_order
from .workflow_hash import workflow_sha256

_CUT_NAME_RE = re.compile(r"^cut(\d+)$", re.I)
_MEDIA_EXT = {
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
    ".mp4": "video",
    ".webm": "video",
}


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


class LocalStore:
    """Native project persistence (stdlib only)."""

    def __init__(self, root: Path | str) -> None:
        self.root = Path(root)
        self.projects_dir = self.root / "projects"
        self.trash_projects_dir = self.root / "trash" / "projects"
        self._lock = threading.Lock()

    def _index_path(self) -> Path:
        return self.projects_dir / "index.json"

    def _project_dir(self, pid: str) -> Path:
        return self.projects_dir / pid

    def _project_path(self, pid: str) -> Path:
        return self._project_dir(pid) / "project.json"

    def _journal_path(self, pid: str) -> Path:
        return self._project_dir(pid) / "journal.ndjson"

    def _load_index(self) -> list[dict[str, Any]]:
        p = self._index_path()
        if not p.is_file():
            return []
        try:
            data = _read_json(p)
        except (OSError, ValueError):
            return []
        return data if isinstance(data, list) else []

    def _save_index(self, rows: list[dict[str, Any]]) -> None:
        _atomic_write_json(self._index_path(), rows)

    def _index_row(self, project: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": project["id"],
            "name": project.get("name") or "",
            "updated_at": project.get("updated_at"),
            "deleted_at": project.get("deleted_at"),
        }

    def _append_journal(self, pid: str, op: str, entity: str, entity_id: str, rev: int, data: Any = None) -> None:
        line = {"ts": now_iso(), "op": op, "entity": entity, "id": entity_id, "rev": rev}
        if data is not None:
            line["data"] = data
        path = self._journal_path(pid)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")

    def _load_project_doc(self, pid: str) -> dict[str, Any] | None:
        path = self._project_path(pid)
        if not path.is_file():
            return None
        try:
            doc = _read_json(path)
        except (OSError, ValueError):
            return None
        return doc if isinstance(doc, dict) else None

    def _save_project_doc(self, pid: str, doc: dict[str, Any], op: str, entity_id: str) -> None:
        _atomic_write_json(self._project_path(pid), doc)
        rows = self._load_index()
        row = self._index_row(doc)
        found = False
        for i, r in enumerate(rows):
            if r.get("id") == pid:
                rows[i] = row
                found = True
                break
        if not found:
            rows.append(row)
        self._save_index(rows)
        self._append_journal(pid, op, "project", entity_id, int(doc.get("rev") or 0))

    def _check_rev(self, doc: dict[str, Any], expected_rev: int | None) -> None:
        if expected_rev is None:
            return
        if int(doc.get("rev") or 0) != int(expected_rev):
            raise ConflictError(f"project rev {doc.get('rev')} != expected {expected_rev}")

    def _bump_project(self, doc: dict[str, Any]) -> None:
        bump_entity(doc)

    def _active_scenes(self, doc: dict[str, Any]) -> list[dict[str, Any]]:
        return [s for s in (doc.get("scenes") or []) if isinstance(s, dict) and not s.get("deleted_at")]

    def _scene(self, doc: dict[str, Any], scene_id: str) -> dict[str, Any] | None:
        for s in doc.get("scenes") or []:
            if isinstance(s, dict) and s.get("id") == scene_id and not s.get("deleted_at"):
                return s
        return None

    def _cuts_map(self, doc: dict[str, Any]) -> dict[str, dict[str, Any]]:
        raw = doc.get("cuts") or {}
        return raw if isinstance(raw, dict) else {}

    def _active_cut_ids(self, doc: dict[str, Any]) -> set[str]:
        return {cid for cid, c in self._cuts_map(doc).items() if isinstance(c, dict) and not c.get("deleted_at")}

    def _remove_cut_from_orders(self, doc: dict[str, Any], cut_id: str) -> None:
        loose = doc.get("loose_order")
        if isinstance(loose, list):
            doc["loose_order"] = [x for x in loose if x != cut_id]
        for scene in doc.get("scenes") or []:
            if not isinstance(scene, dict):
                continue
            co = scene.get("cut_order")
            if isinstance(co, list):
                scene["cut_order"] = [x for x in co if x != cut_id]

    def _insert_cut_in_order(self, doc: dict[str, Any], cut_id: str, scene_id: str | None, after: str | None) -> None:
        order = timeline_order(doc)
        if after and after in order:
            idx = order.index(after) + 1
            order.insert(idx, cut_id)
        elif after is None:
            order.append(cut_id)
        else:
            order.append(cut_id)
        self._apply_timeline_order(doc, order)

    def _apply_timeline_order(self, doc: dict[str, Any], order: list[str]) -> None:
        active = self._active_cut_ids(doc)
        order = [x for x in order if x in active]
        cuts = self._cuts_map(doc)
        scenes = {s["id"]: s for s in self._active_scenes(doc)}
        for s in scenes.values():
            s["cut_order"] = []
        doc["loose_order"] = []
        for cid in order:
            c = cuts.get(cid)
            if not c:
                continue
            sid = c.get("scene_id")
            if isinstance(sid, str) and sid in scenes:
                scenes[sid]["cut_order"].append(cid)
            else:
                doc.setdefault("loose_order", []).append(cid)

    def _next_cut_name(self, doc: dict[str, Any]) -> str:
        max_n = 0
        for c in self._cuts_map(doc).values():
            if not isinstance(c, dict):
                continue
            m = _CUT_NAME_RE.match(str(c.get("name") or ""))
            if m:
                max_n = max(max_n, int(m.group(1)))
        return f"cut{max_n + 1}"

    def list_projects(self, include_deleted: bool = False) -> list[dict[str, Any]]:
        rows = self._load_index()
        if include_deleted:
            return list(rows)
        return [r for r in rows if not r.get("deleted_at")]

    def create_project(
        self,
        name: str,
        template_ref: str | None = None,
        template_graph: dict | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            pid = uuid7()
            scene = new_scene("Scene 1")
            workflow_sha = None
            if template_graph is not None:
                workflow_sha = self.put_blob(pid, template_graph)
            cut = new_cut(scene["id"], "cut1", default_settings()["default_sec"], workflow_sha)
            scene["cut_order"] = [cut["id"]]
            doc = entity_base(pid)
            doc.update({
                "name": name,
                "template_ref": template_ref,
                "settings": default_settings(),
                "scenes": [scene],
                "loose_order": [],
                "cuts": {cut["id"]: cut},
                "schema_version": 1,
            })
            self.projects_dir.mkdir(parents=True, exist_ok=True)
            self._project_dir(pid).mkdir(parents=True, exist_ok=True)
            if template_graph is not None and workflow_sha:
                self._write_workflow_blob(pid, workflow_sha, template_graph)
            _atomic_write_json(self._project_path(pid), doc)
            rows = self._load_index()
            rows.append(self._index_row(doc))
            self._save_index(rows)
            self._append_journal(pid, "create", "project", pid, doc["rev"], {"name": name})
            return json.loads(json.dumps(doc))

    def get_project(self, pid: str) -> dict[str, Any] | None:
        return self._load_project_doc(pid)

    def rename_project(self, pid: str, name: str, expected_rev: int | None = None) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            self._check_rev(doc, expected_rev)
            doc["name"] = name
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "rename", pid)
            return doc

    def delete_project(self, pid: str) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc:
                raise FileNotFoundError(pid)
            ts = now_iso().replace(":", "").replace("-", "")
            stamp = ts[:15]
            dest = self.trash_projects_dir / f"{pid}_{stamp}"
            src = self._project_dir(pid)
            doc["deleted_at"] = now_iso()
            self._bump_project(doc)
            _atomic_write_json(self._project_path(pid), doc)
            self._append_journal(pid, "delete", "project", pid, int(doc["rev"]))
            if src.is_dir():
                self.trash_projects_dir.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(dest))
                manifest = {
                    "pid": pid,
                    "deleted_at": doc["deleted_at"],
                    "path": str(dest),
                }
                _atomic_write_json(dest / "manifest.json", manifest)
            rows = self._load_index()
            for i, r in enumerate(rows):
                if r.get("id") == pid:
                    rows[i] = self._index_row(doc)
                    break
            else:
                rows.append(self._index_row(doc))
            self._save_index(rows)
            return doc

    def restore_project(self, pid: str) -> dict[str, Any]:
        with self._lock:
            rows = self._load_index()
            row = next((r for r in rows if r.get("id") == pid), None)
            if not row:
                raise FileNotFoundError(pid)
            if not self._project_path(pid).is_file():
                candidates = sorted(self.trash_projects_dir.glob(f"{pid}_*"), reverse=True)
                if not candidates:
                    raise FileNotFoundError(f"trash missing for {pid}")
                src = candidates[0]
                dest = self._project_dir(pid)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(dest))
            doc = self._load_project_doc(pid)
            if not doc:
                raise FileNotFoundError(pid)
            doc["deleted_at"] = None
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "restore", pid)
            return doc

    def add_scene(self, pid: str, name: str, cut_ids: list[str] | None = None) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            scene = new_scene(name)
            doc.setdefault("scenes", []).append(scene)
            cuts = self._cuts_map(doc)
            for cid in cut_ids or []:
                if cid not in self._active_cut_ids(doc):
                    continue
                self._remove_cut_from_orders(doc, cid)
                c = cuts[cid]
                c["scene_id"] = scene["id"]
                bump_entity(c)
                scene["cut_order"].append(cid)
            self._bump_project(doc)
            bump_entity(scene)
            self._save_project_doc(pid, doc, "add_scene", scene["id"])
            return doc

    def rename_scene(self, pid: str, scene_id: str, name: str) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            scene = self._scene(doc, scene_id)
            if not scene:
                raise ValueError("scene not found")
            scene["name"] = name
            bump_entity(scene)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "rename_scene", scene_id)
            return doc

    def ungroup_scene(self, pid: str, scene_id: str) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            scene = self._scene(doc, scene_id)
            if not scene:
                raise ValueError("scene not found")
            order = timeline_order(doc)
            try:
                pos = order.index(scene["cut_order"][0]) if scene.get("cut_order") else len(order)
            except (ValueError, IndexError):
                pos = len(order)
            cut_ids = list(scene.get("cut_order") or [])
            for cid in cut_ids:
                c = self._cuts_map(doc).get(cid)
                if c:
                    c["scene_id"] = None
                    bump_entity(c)
            scene["cut_order"] = []
            loose = [x for x in (doc.get("loose_order") or []) if x not in cut_ids]
            new_loose = loose[:pos] + cut_ids + loose[pos:]
            doc["loose_order"] = new_loose
            bump_entity(scene)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "ungroup_scene", scene_id)
            return doc

    def add_cut(
        self,
        pid: str,
        scene_id: str | None = None,
        after: str | None = None,
        name: str | None = None,
        template_graph: dict | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            workflow_sha = None
            if template_graph is not None:
                workflow_sha = self.put_blob(pid, template_graph)
            cut_name = name or self._next_cut_name(doc)
            sid = scene_id
            if sid and not self._scene(doc, sid):
                sid = None
            cut = new_cut(sid, cut_name, doc.get("settings", {}).get("default_sec", 3.0), workflow_sha)
            cuts = self._cuts_map(doc)
            cuts[cut["id"]] = cut
            doc["cuts"] = cuts
            self._insert_cut_in_order(doc, cut["id"], sid, after)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "add_cut", cut["id"])
            return doc

    def rename_cut(self, pid: str, cut_id: str, name: str) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            c = self._cuts_map(doc).get(cut_id)
            if not c or c.get("deleted_at"):
                raise ValueError("cut not found")
            c["name"] = name
            bump_entity(c)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "rename_cut", cut_id)
            return doc

    def delete_cuts(self, pid: str, ids: list[str]) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            cuts = self._cuts_map(doc)
            for cid in ids:
                c = cuts.get(cid)
                if not c or c.get("deleted_at"):
                    continue
                c["deleted_at"] = now_iso()
                bump_entity(c)
                self._remove_cut_from_orders(doc, cid)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "delete_cuts", pid)
            return doc

    def restore_cuts(self, pid: str, ids: list[str] | None = None) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            cuts = self._cuts_map(doc)
            target = ids
            if target is None:
                target = [cid for cid, c in cuts.items() if c.get("deleted_at")]
            for cid in target:
                c = cuts.get(cid)
                if not c or not c.get("deleted_at"):
                    continue
                c["deleted_at"] = None
                bump_entity(c)
                sid = c.get("scene_id")
                if isinstance(sid, str) and self._scene(doc, sid):
                    scene = self._scene(doc, sid)
                    if cid not in (scene.get("cut_order") or []):
                        scene["cut_order"].append(cid)
                        bump_entity(scene)
                else:
                    loose = doc.get("loose_order") or []
                    if cid not in loose:
                        doc["loose_order"] = list(loose) + [cid]
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "restore_cuts", pid)
            return doc

    def reorder(self, pid: str, order: list[str]) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            active = self._active_cut_ids(doc)
            if set(order) != active:
                raise ValueError("order must list all active cuts exactly once")
            self._apply_timeline_order(doc, order)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "reorder", pid)
            return doc

    def set_template(self, pid: str, ref: str | None) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            doc["template_ref"] = ref
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "set_template", pid)
            return doc

    def _workflow_path(self, pid: str, sha: str) -> Path:
        return self._project_dir(pid) / "workflows" / f"{sha}.json"

    def _write_workflow_blob(self, pid: str, sha: str, obj: dict) -> None:
        path = self._workflow_path(pid, sha)
        if path.is_file():
            return
        _atomic_write_json(path, obj)

    def put_blob(self, pid: str, obj: dict) -> str:
        sha = workflow_sha256(obj)
        self._project_dir(pid).mkdir(parents=True, exist_ok=True)
        self._write_workflow_blob(pid, sha, obj)
        return sha

    def get_blob(self, pid: str, sha: str) -> dict | None:
        path = self._workflow_path(pid, sha)
        if not path.is_file():
            return None
        try:
            data = _read_json(path)
        except (OSError, ValueError):
            return None
        return data if isinstance(data, dict) else None

    def add_version(
        self,
        pid: str,
        cut_id: str,
        src_file: Path | str,
        workflow: dict | None = None,
        prompt_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            c = self._cuts_map(doc).get(cut_id)
            if not c or c.get("deleted_at"):
                raise ValueError("cut not found")
            src = Path(src_file)
            if not src.is_file():
                raise FileNotFoundError(str(src))
            ext = src.suffix.lower()
            kind = _MEDIA_EXT.get(ext, "image")
            vid = uuid7()
            rel_dir = Path("assets") / cut_id
            dest_dir = self._project_dir(pid) / rel_dir
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_name = f"{vid}{ext}"
            dest = dest_dir / dest_name
            shutil.copy2(src, dest)
            digest = hashlib.sha256(dest.read_bytes()).hexdigest()
            asset = {
                "path": str(rel_dir / dest_name).replace("\\", "/"),
                "kind": kind,
                "sha256": digest,
                "bytes": dest.stat().st_size,
            }
            wf_sha = self.put_blob(pid, workflow) if workflow else None
            ver = new_version(cut_id, asset, wf_sha, prompt_id)
            vpath = self._project_dir(pid) / "versions" / cut_id / f"{ver['id']}.json"
            _atomic_write_json(vpath, ver)
            if not c.get("pick_version_id"):
                c["pick_version_id"] = ver["id"]
            bump_entity(c)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "add_version", ver["id"])
            self._append_journal(pid, "add_version", "version", ver["id"], ver["rev"], {"cut_id": cut_id})
            return ver

    def list_versions(self, pid: str, cut_id: str) -> list[dict[str, Any]]:
        vdir = self._project_dir(pid) / "versions" / cut_id
        if not vdir.is_dir():
            return []
        out: list[dict[str, Any]] = []
        for p in vdir.glob("*.json"):
            try:
                data = _read_json(p)
            except (OSError, ValueError):
                continue
            if isinstance(data, dict) and not data.get("deleted_at"):
                out.append(data)
        out.sort(key=lambda v: v.get("created_at") or "", reverse=True)
        return out

    def to_timeline(self, pid: str) -> dict | None:
        doc = self._load_project_doc(pid)
        if not doc or doc.get("deleted_at"):
            return None
        return build_timeline(self.root, doc)
