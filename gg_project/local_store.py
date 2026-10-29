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
    is_reference,
    new_cut,
    new_scene,
    new_version,
)
from .errors import ConflictError
from .ids import now_iso, uuid7
from .project_settings import merge_settings_patch, normalize_settings
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
            data = None
        if isinstance(data, list):
            return data
        # Unreadable or wrong shape. NEVER answer [] here: the next save would write that
        # shorter list over the file and drop every other project from the list.
        return self._recover_index(p)

    def _recover_index(self, bad: Path) -> list[dict[str, Any]]:
        """Keep the broken index.json as index.json.bad-<time>, rebuild the rows from the
        project.json files on disk (active projects and the trash) and save the rebuilt index."""
        stamp = now_iso().replace(":", "").replace("-", "")[:15]
        backup = bad.with_name(f"{bad.name}.bad-{stamp}")
        n = 1
        while backup.exists():
            n += 1
            backup = bad.with_name(f"{bad.name}.bad-{stamp}-{n}")
        rows = self._rebuild_index_rows()
        try:
            shutil.copy2(str(bad), str(backup))
        except OSError:
            # No backup, so do not overwrite the broken file: serve the rebuilt rows from memory.
            # (A later save writes the rebuilt, complete list, never a reduced one.)
            return rows
        try:
            self._save_index(rows)
        except OSError:
            pass
        return rows

    def _rebuild_index_rows(self) -> list[dict[str, Any]]:
        docs: dict[str, dict[str, Any]] = {}
        trash = self.trash_projects_dir
        for base in (trash, self.projects_dir):  # active copies win over trash copies
            if not base.is_dir():
                continue
            for d in base.iterdir():
                f = d / "project.json"
                if not d.is_dir() or not f.is_file():
                    continue
                try:
                    doc = _read_json(f)
                except (OSError, ValueError):
                    continue
                if isinstance(doc, dict) and isinstance(doc.get("id"), str) and doc["id"]:
                    docs[doc["id"]] = doc
        rows = [self._index_row(doc) for doc in docs.values()]
        rows.sort(key=lambda r: (str(r.get("updated_at") or ""), str(r.get("id") or "")))
        return rows

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
        return {
            cid for cid, c in self._cuts_map(doc).items()
            if isinstance(c, dict) and not c.get("deleted_at") and not is_reference(c)
        }

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
        order = [x for x in timeline_order(doc) if x != cut_id]
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
            if not isinstance(c, dict) or is_reference(c):
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
        settings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            pid = uuid7()
            scene = new_scene("Scene 1")
            workflow_sha = None
            if template_graph is not None:
                workflow_sha = self.put_blob(pid, template_graph)
            proj_settings = normalize_settings(settings)
            cut = new_cut(scene["id"], "cut1", proj_settings["cut_seconds"], workflow_sha)
            scene["cut_order"] = [cut["id"]]
            doc = entity_base(pid)
            doc.update({
                "name": name,
                "template_ref": template_ref,
                "due_date": None,
                "settings": proj_settings,
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
            row = self._index_row(doc)
            for i, r in enumerate(rows):  # a rebuilt index may already list the new project
                if r.get("id") == pid:
                    rows[i] = row
                    break
            else:
                rows.append(row)
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
            if not sid and after:
                ref = self._cuts_map(doc).get(after)
                if isinstance(ref, dict) and not ref.get("deleted_at"):
                    ref_sid = ref.get("scene_id")
                    if isinstance(ref_sid, str) and self._scene(doc, ref_sid):
                        sid = ref_sid
            cut = new_cut(sid, cut_name, normalize_settings(doc.get("settings")).get("cut_seconds", 3.0), workflow_sha)
            cuts = self._cuts_map(doc)
            cuts[cut["id"]] = cut
            doc["cuts"] = cuts
            self._insert_cut_in_order(doc, cut["id"], sid, after)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "add_cut", cut["id"])
            return doc

    _CUT_UPDATE_FIELDS = frozenset({"planned_sec", "notes", "caption", "end_card", "needs_redo"})
    _CAPTION_MAX_LEN = 4000
    _DUE_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

    def _validate_planned_sec(self, value: Any) -> float | None:
        if value is None:
            return None
        if not isinstance(value, (int, float)):
            raise ValueError("planned_sec must be a number or null")
        sec = float(value)
        if sec < 0.2 or sec > 600:
            raise ValueError("planned_sec must be between 0.2 and 600 seconds")
        return round(sec, 2)

    def _validate_due_date(self, value: Any) -> str | None:
        if value is None or value == "":
            return None
        if not isinstance(value, str):
            raise ValueError("due_date must be YYYY-MM-DD or null")
        s = value.strip()
        if not self._DUE_DATE_RE.match(s):
            raise ValueError("due_date must be YYYY-MM-DD")
        y, m, d = (int(x) for x in s.split("-"))
        if m < 1 or m > 12 or d < 1 or d > 31:
            raise ValueError("due_date must be a valid calendar date")
        return s

    def _check_cut_rev(self, cut: dict[str, Any], expected_rev: int | None) -> None:
        if expected_rev is None:
            return
        if int(cut.get("rev") or 0) != int(expected_rev):
            raise ConflictError(f"cut rev {cut.get('rev')} != expected {expected_rev}")

    def update_cut(
        self,
        pid: str,
        cut_id: str,
        fields: dict[str, Any],
        expected_rev: int | None = None,
    ) -> dict[str, Any]:
        if not isinstance(fields, dict) or not fields:
            raise ValueError("fields required")
        unknown = set(fields) - self._CUT_UPDATE_FIELDS
        if unknown:
            raise ValueError(f"unsupported cut fields: {', '.join(sorted(unknown))}")
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            c = self._cuts_map(doc).get(cut_id)
            if not c or c.get("deleted_at"):
                raise ValueError("cut not found")
            self._check_cut_rev(c, expected_rev)
            if "planned_sec" in fields:
                c["planned_sec"] = self._validate_planned_sec(fields["planned_sec"])
            if "notes" in fields:
                notes = fields["notes"]
                if notes is not None and not isinstance(notes, str):
                    raise ValueError("notes must be a string")
                c["notes"] = notes if notes is not None else ""
            if "caption" in fields:
                caption = fields["caption"]
                if caption is not None and not isinstance(caption, str):
                    raise ValueError("caption must be a string")
                cap = caption if caption is not None else ""
                if len(cap) > self._CAPTION_MAX_LEN:
                    raise ValueError(f"caption must be at most {self._CAPTION_MAX_LEN} characters")
                c["caption"] = cap
            if "end_card" in fields:
                if not isinstance(fields["end_card"], bool):
                    raise ValueError("end_card must be a boolean")
                c["end_card"] = fields["end_card"]
            if "needs_redo" in fields:
                if not isinstance(fields["needs_redo"], bool):
                    raise ValueError("needs_redo must be a boolean")
                c["needs_redo"] = fields["needs_redo"]
            bump_entity(c)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "update_cut", cut_id)
            return doc

    def update_project(
        self,
        pid: str,
        fields: dict[str, Any],
        expected_rev: int | None = None,
    ) -> dict[str, Any]:
        if not isinstance(fields, dict) or not fields:
            raise ValueError("fields required")
        allowed = {"due_date", "settings", "aspect", "width", "height", "fps", "cut_seconds"}
        unknown = set(fields) - allowed
        if unknown:
            raise ValueError(f"unsupported project fields: {', '.join(sorted(unknown))}")
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            self._check_rev(doc, expected_rev)
            if "due_date" in fields:
                doc["due_date"] = self._validate_due_date(fields["due_date"])
            patch: dict[str, Any] = {}
            if isinstance(fields.get("settings"), dict):
                patch.update(fields["settings"])
            for key in ("aspect", "width", "height", "fps", "cut_seconds"):
                if key in fields:
                    patch[key] = fields[key]
            if patch:
                doc["settings"] = merge_settings_patch(doc.get("settings"), patch)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "update_project", pid)
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

    _REF_CATEGORIES = ("Character", "Place", "Prop", "Style", "Other")
    _IMPORT_MAX_CUTS = 500

    def import_structure(
        self,
        pid: str,
        scenes: list[dict[str, Any]],
        loose: list[dict[str, Any]],
        references: list[dict[str, Any]],
        template_graph: dict | None = None,
    ) -> dict[str, Any]:
        """Auto Cut Split: fill a brand-new project (one untouched cut) with scenes, empty cuts and reference names."""
        scenes = scenes if isinstance(scenes, list) else []
        loose = loose if isinstance(loose, list) else []
        references = references if isinstance(references, list) else []
        total = len(loose) + sum(len((s or {}).get("cuts") or []) for s in scenes if isinstance(s, dict))
        if total < 1:
            raise ValueError("nothing to import")
        if total > self._IMPORT_MAX_CUTS:
            raise ValueError(f"at most {self._IMPORT_MAX_CUTS} cuts per import")
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            cuts = self._cuts_map(doc)
            active = [cid for cid, c in cuts.items() if isinstance(c, dict) and not c.get("deleted_at") and not is_reference(c)]
            if len(active) != 1:
                raise ValueError("project already has cuts")
            first = cuts[active[0]]
            if first.get("caption") or self.list_versions(pid, first["id"]):
                raise ValueError("project already has cuts")
            default_sec = normalize_settings(doc.get("settings")).get("cut_seconds", 3.0)
            sha = self.put_blob(pid, template_graph) if template_graph is not None else None
            reuse = [first]

            def make(entry: Any, scene_id: str | None) -> str:
                if not isinstance(entry, dict):
                    raise ValueError("invalid cut entry")
                name = str(entry.get("name") or "").strip()[:80] or "cut"
                if reuse:
                    c = reuse.pop()
                    c["name"] = name
                    c["scene_id"] = scene_id
                else:
                    c = new_cut(scene_id, name, default_sec, sha)
                    cuts[c["id"]] = c
                sec = entry.get("sec")
                c["planned_sec"] = self._validate_planned_sec(sec) if sec is not None else None
                cap = entry.get("caption")
                cap = cap if isinstance(cap, str) else ""
                if len(cap) > self._CAPTION_MAX_LEN:
                    raise ValueError(f"caption must be at most {self._CAPTION_MAX_LEN} characters")
                c["caption"] = cap
                bump_entity(c)
                return c["id"]

            loose_ids = [make(e, None) for e in loose]
            new_scenes: list[dict[str, Any]] = []
            for s in scenes:
                if not isinstance(s, dict):
                    raise ValueError("invalid scene entry")
                sc = new_scene(str(s.get("name") or "").strip()[:40] or "Scene")
                sc["cut_order"] = [make(e, sc["id"]) for e in (s.get("cuts") or [])]
                if sc["cut_order"]:
                    new_scenes.append(sc)
            doc["cuts"] = cuts
            doc["scenes"] = new_scenes
            doc["loose_order"] = loose_ids
            for r in references:
                if isinstance(r, dict):
                    self._add_reference_locked(doc, r.get("name"), r.get("category"), sha, skip_bad=True)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "import_structure", pid)
            return doc

    def _add_reference_locked(self, doc, name, category, sha, skip_bad=False):
        nm = str(name or "").strip()[:80]
        if category not in self._REF_CATEGORIES or not nm:
            if skip_bad:
                return None
            raise ValueError("name and a valid category are required")
        cuts = self._cuts_map(doc)
        key = (category.lower(), nm.lower())
        for c in cuts.values():
            if is_reference(c) and not c.get("deleted_at") and (str(c.get("category")).lower(), str(c.get("name")).strip().lower()) == key:
                if skip_bad:
                    return None
                raise ValueError("this reference already exists")
        c = new_cut(None, nm, 3.0, sha)
        c["kind"] = "reference"
        c["category"] = category
        cuts[c["id"]] = c
        doc["cuts"] = cuts
        return c

    def add_reference(self, pid: str, name: str, category: str, template_graph: dict | None = None) -> dict[str, Any]:
        """Add a reference (hidden from the timeline). Returns the new reference record."""
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            sha = self.put_blob(pid, template_graph) if template_graph is not None else None
            c = self._add_reference_locked(doc, name, category, sha)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "add_reference", c["id"])
            return c

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

    def list_deleted_cuts(self, pid: str) -> list[dict[str, Any]]:
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                return []
            cuts = self._cuts_map(doc)
            scenes_by_id: dict[str, str] = {}
            for s in doc.get("scenes") or []:
                if isinstance(s, dict) and s.get("id") and not s.get("deleted_at"):
                    scenes_by_id[s["id"]] = s.get("name") if isinstance(s.get("name"), str) else ""
            rows: list[dict[str, Any]] = []
            for cid, c in cuts.items():
                if not isinstance(c, dict) or not c.get("deleted_at") or is_reference(c):
                    continue
                notes = c.get("notes") if isinstance(c.get("notes"), str) else ""
                if len(notes) > 120:
                    notes = notes[:120]
                sid = c.get("scene_id")
                scene_name = scenes_by_id.get(sid, "") if isinstance(sid, str) else ""
                planned = c.get("planned_sec")
                rows.append(
                    {
                        "id": cid,
                        "name": c.get("name") if isinstance(c.get("name"), str) else "",
                        "deleted_at": c["deleted_at"],
                        "scene_name": scene_name,
                        "notes": notes,
                        "planned_sec": planned if isinstance(planned, (int, float)) else None,
                    }
                )
            rows.sort(key=lambda r: r.get("deleted_at") or "", reverse=True)
            return rows

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
            if not c.get("pick_version_id") or is_reference(c):
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

    def apply_timeline_edit(self, pid: str, order: list[str], clips: dict) -> dict:
        """Reorder cuts and update per-cut trim + pick_version_id (validated against versions)."""
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            active = self._active_cut_ids(doc)
            order = [x for x in dict.fromkeys(order) if isinstance(x, str) and x in active]
            order += [cid for cid in active if cid not in order]
            if set(order) != active:
                raise ValueError("order must list all active cuts exactly once")
            cuts_map = self._cuts_map(doc)
            for cid, e in (clips or {}).items():
                if not isinstance(cid, str) or cid not in active or not isinstance(e, dict):
                    continue
                c = cuts_map[cid]
                if "sec" in e and isinstance(e.get("sec"), (int, float)):
                    c["sec"] = float(e["sec"])
                if "in" in e and isinstance(e.get("in"), (int, float)):
                    c["in"] = float(e["in"])
                pick = e.get("pick")
                if pick is None or pick == "":
                    pass
                elif isinstance(pick, str):
                    vers = self.list_versions(pid, cid)
                    if any(v.get("id") == pick for v in vers):
                        c["pick_version_id"] = pick
                    else:
                        c["pick_version_id"] = None
                bump_entity(c)
            self._apply_timeline_order(doc, order)
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "edit", pid)
            return doc

    def sync_scene_groups(self, pid: str, groups: list[dict]) -> dict:
        """Replace scene groups from UI {id, name, cut_ids, collapsed} list."""
        with self._lock:
            doc = self._load_project_doc(pid)
            if not doc or doc.get("deleted_at"):
                raise FileNotFoundError(pid)
            active = self._active_cut_ids(doc)
            order = timeline_order(doc)
            seen_gids: set[str] = set()
            assigned: set[str] = set()
            parsed: list[dict] = []
            for g in groups or []:
                if not isinstance(g, dict):
                    continue
                gid = str(g.get("id") or "").strip()
                if not gid or gid in seen_gids:
                    continue
                seen_gids.add(gid)
                name = str(g.get("name") or "").strip()[:40] or "Scene"
                cut_ids = []
                for cid in g.get("cut_ids") or []:
                    if isinstance(cid, str) and cid in active and cid not in assigned:
                        cut_ids.append(cid)
                        assigned.add(cid)
                if not cut_ids:
                    continue
                rank = {cid: i for i, cid in enumerate(order)}
                cut_ids.sort(key=lambda x: rank.get(x, 10**9))
                parsed.append({
                    "id": gid,
                    "name": name,
                    "cut_ids": cut_ids,
                    "collapsed": bool(g.get("collapsed")),
                })
            old_scenes = {s["id"]: s for s in self._active_scenes(doc)}
            new_scenes: list[dict] = []
            cuts_map = self._cuts_map(doc)
            for g in parsed:
                scene = old_scenes.get(g["id"])
                if scene:
                    scene = dict(scene)
                else:
                    scene = new_scene(g["name"])
                    scene["id"] = g["id"]
                scene["name"] = g["name"]
                scene["collapsed"] = g["collapsed"]
                scene["cut_order"] = list(g["cut_ids"])
                bump_entity(scene)
                new_scenes.append(scene)
                for cid in g["cut_ids"]:
                    c = cuts_map.get(cid)
                    if c:
                        c["scene_id"] = g["id"]
                        bump_entity(c)
            grouped = assigned
            loose = [cid for cid in order if cid in active and cid not in grouped]
            for cid in active:
                if cid not in grouped and cid not in loose:
                    loose.append(cid)
            for cid in active:
                c = cuts_map.get(cid)
                if not c:
                    continue
                if cid not in grouped:
                    c["scene_id"] = None
                    bump_entity(c)
            doc["scenes"] = new_scenes
            doc["loose_order"] = loose
            self._bump_project(doc)
            self._save_project_doc(pid, doc, "sync_groups", pid)
            return doc

    def find_version_asset(self, version_id: str) -> tuple[str, Path] | None:
        """Return (pid, absolute media path) for a native version id."""
        if not isinstance(version_id, str) or not version_id:
            return None
        for row in self.list_projects(include_deleted=True):
            pid = row.get("id")
            if not isinstance(pid, str):
                continue
            pdir = self._project_dir(pid) / "versions"
            if not pdir.is_dir():
                continue
            for cut_dir in pdir.iterdir():
                if not cut_dir.is_dir():
                    continue
                for vf in cut_dir.glob("*.json"):
                    try:
                        data = _read_json(vf)
                    except (OSError, ValueError):
                        continue
                    if isinstance(data, dict) and data.get("id") == version_id and not data.get("deleted_at"):
                        asset = data.get("asset") or {}
                        rel = asset.get("path")
                        if not isinstance(rel, str):
                            continue
                        path = (self._project_dir(pid) / rel).resolve()
                        try:
                            path.relative_to(self._project_dir(pid).resolve())
                        except ValueError:
                            continue
                        if path.is_file():
                            return pid, path
        return None
