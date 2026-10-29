"""Native project store (gg_project.LocalStore)."""
from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_native_api import native_add_cut, set_native_store
from gg_project import ConflictError, LocalStore, uuid7
from gg_project.timeline import timeline_order
from gg_project.workflow_hash import workflow_sha256

UUID7_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)
WF_A = {"nodes": [{"id": 1}], "version": 0.4}
WF_B = {"nodes": [{"id": 2}], "version": 0.4}


class Uuid7Tests(unittest.TestCase):
    def test_format_and_version_nibble(self):
        u = uuid7()
        self.assertRegex(u, UUID7_RE)

    def test_monotonic_with_fixed_ms(self):
        a = uuid7(1_700_000_000_000)
        b = uuid7(1_700_000_000_001)
        self.assertLess(a, b)


class LocalStoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        set_native_store(self.store)

    def tearDown(self):
        self._tmp.cleanup()

    def _first_cut(self, doc: dict) -> dict:
        cuts = doc.get("cuts") or {}
        cid = next(iter(cuts))
        return cuts[cid]

    def test_create_scene1_and_cut1(self):
        doc = self.store.create_project("My film")
        self.assertEqual(doc["name"], "My film")
        self.assertEqual(len(doc["scenes"]), 1)
        self.assertEqual(doc["scenes"][0]["name"], "Scene 1")
        cut = self._first_cut(doc)
        self.assertEqual(cut["name"], "cut1")
        self.assertEqual(doc["scenes"][0]["cut_order"], [cut["id"]])
        self.assertIn("-", doc["id"])

    def test_create_with_template_graph(self):
        doc = self.store.create_project("T", template_graph=WF_A)
        cut = self._first_cut(doc)
        sha = cut.get("workflow_sha")
        self.assertTrue(sha)
        self.assertEqual(self.store.get_blob(doc["id"], sha), WF_A)

    def test_scene_and_cut_crud_and_rev(self):
        doc = self.store.create_project("P")
        pid = doc["id"]
        rev0 = doc["rev"]
        cut_id = self._first_cut(doc)["id"]
        doc = self.store.add_cut(pid, name="cut2")
        self.assertGreater(doc["rev"], rev0)
        scene2 = self.store.add_scene(pid, "Scene 2", cut_ids=[cut_id])
        self.assertEqual(len(scene2["scenes"]), 2)
        doc = self.store.rename_cut(pid, cut_id, "hero")
        self.assertEqual(doc["cuts"][cut_id]["name"], "hero")
        doc = self.store.delete_cuts(pid, [cut_id])
        self.assertTrue(doc["cuts"][cut_id]["deleted_at"])
        doc = self.store.restore_cuts(pid, [cut_id])
        self.assertIsNone(doc["cuts"][cut_id]["deleted_at"])

    def test_list_deleted_cuts_after_delete_restore(self):
        doc = self.store.create_project("P")
        pid = doc["id"]
        cut_id = self._first_cut(doc)["id"]
        doc = self.store.add_cut(pid, name="cut2")
        cut2 = next(cid for cid, c in doc["cuts"].items() if cid != cut_id)
        pdir = Path(self._tmp.name) / "projects" / pid
        wf_count_before = len(list((pdir / "workflows").glob("*.json"))) if (pdir / "workflows").is_dir() else 0

        self.assertEqual(self.store.list_deleted_cuts(pid), [])
        self.store.delete_cuts(pid, [cut_id])
        deleted = self.store.list_deleted_cuts(pid)
        self.assertEqual(len(deleted), 1)
        self.assertEqual(deleted[0]["id"], cut_id)
        self.assertTrue(deleted[0]["deleted_at"])
        self.assertEqual(deleted[0]["name"], "cut1")

        self.store.restore_cuts(pid, [cut_id])
        self.assertEqual(self.store.list_deleted_cuts(pid), [])

        wf_count_after = len(list((pdir / "workflows").glob("*.json"))) if (pdir / "workflows").is_dir() else 0
        self.assertEqual(wf_count_before, wf_count_after)

        self.store.delete_cuts(pid, [cut2])
        rows = self.store.list_deleted_cuts(pid)
        self.assertEqual(rows[0]["id"], cut2)

    def test_journal_append_parseable(self):
        doc = self.store.create_project("J")
        pid = doc["id"]
        jpath = Path(self._tmp.name) / "projects" / pid / "journal.ndjson"
        self.store.rename_project(pid, "J2")
        lines = jpath.read_text(encoding="utf-8").strip().splitlines()
        self.assertGreaterEqual(len(lines), 2)
        for line in lines:
            row = json.loads(line)
            self.assertIn("op", row)
            self.assertIn("ts", row)

    def test_workflow_blob_dedupe(self):
        doc = self.store.create_project("D")
        pid = doc["id"]
        s1 = self.store.put_blob(pid, WF_A)
        s2 = self.store.put_blob(pid, WF_A)
        self.assertEqual(s1, s2)
        wf_dir = Path(self._tmp.name) / "projects" / pid / "workflows"
        self.assertEqual(len(list(wf_dir.glob("*.json"))), 1)

    def test_delete_trash_restore_project(self):
        doc = self.store.create_project("Trash me")
        pid = doc["id"]
        pdir = Path(self._tmp.name) / "projects" / pid
        self.assertTrue(pdir.is_dir())
        self.store.delete_project(pid)
        self.assertFalse(pdir.is_dir())
        rows = self.store.list_projects(include_deleted=True)
        self.assertTrue(rows[0]["deleted_at"])
        trash_items = list((Path(self._tmp.name) / "trash" / "projects").glob(f"{pid}_*"))
        self.assertEqual(len(trash_items), 1)
        self.assertTrue((trash_items[0] / "manifest.json").is_file())
        restored = self.store.restore_project(pid)
        self.assertIsNone(restored.get("deleted_at"))
        self.assertTrue(pdir.is_dir())

    def test_add_version_copies_source(self):
        doc = self.store.create_project("V")
        pid = doc["id"]
        cut_id = self._first_cut(doc)["id"]
        src = Path(self._tmp.name) / "source.png"
        src.write_bytes(b"\x89PNG\r\n\x1a\n" + b"x" * 20)
        before = src.read_bytes()
        ver = self.store.add_version(pid, cut_id, src, workflow=WF_B)
        self.assertEqual(src.read_bytes(), before)
        self.assertTrue(src.is_file())
        asset = Path(self._tmp.name) / "projects" / pid / ver["asset"]["path"]
        self.assertTrue(asset.is_file())
        fresh = self.store.get_project(pid)
        self.assertEqual(fresh["cuts"][cut_id]["pick_version_id"], ver["id"])

    def test_add_version_does_not_override_existing_pick(self):
        doc = self.store.create_project("Pick")
        pid = doc["id"]
        cut_id = self._first_cut(doc)["id"]
        src1 = Path(self._tmp.name) / "a.png"
        src2 = Path(self._tmp.name) / "b.png"
        src1.write_bytes(b"\x89PNG\r\n\x1a\n" + b"a" * 20)
        src2.write_bytes(b"\x89PNG\r\n\x1a\n" + b"b" * 20)
        v1 = self.store.add_version(pid, cut_id, src1)
        v2 = self.store.add_version(pid, cut_id, src2)
        self.assertNotEqual(v1["id"], v2["id"])
        fresh = self.store.get_project(pid)
        self.assertEqual(fresh["cuts"][cut_id]["pick_version_id"], v1["id"])

    def test_conflict_error(self):
        doc = self.store.create_project("C")
        pid = doc["id"]
        with self.assertRaises(ConflictError):
            self.store.rename_project(pid, "X", expected_rev=doc["rev"] - 1)

    def test_to_timeline_shape(self):
        doc = self.store.create_project("TL")
        pid = doc["id"]
        cut_id = self._first_cut(doc)["id"]
        src = Path(self._tmp.name) / "frame.png"
        src.write_bytes(b"\x89PNG\r\n\x1a\n")
        self.store.add_version(pid, cut_id, src)
        tl = self.store.to_timeline(pid)
        self.assertTrue(tl["ok"])
        self.assertIn("project", tl)
        self.assertIn("cuts", tl)
        self.assertIn("groups", tl)
        self.assertIn("total_sec", tl)
        self.assertEqual(tl["project"]["id"], pid)
        self.assertEqual(len(tl["cuts"]), 1)
        c0 = tl["cuts"][0]
        for key in (
            "id", "name", "scene", "scene_id", "in", "sec", "media", "versions",
            "versions_list", "group_id", "group_name", "pos", "start",
        ):
            self.assertIn(key, c0)
        self.assertIn("-", pid)

    def test_add_cut_infers_scene_from_after(self):
        doc = self.store.create_project("Infer")
        pid = doc["id"]
        s1 = doc["scenes"][0]["id"]
        c1 = self._first_cut(doc)["id"]
        doc = self.store.add_cut(pid, after=c1, name="cut2")
        c2 = next(cid for cid in doc["cuts"] if cid != c1)
        self.assertEqual(doc["cuts"][c2]["scene_id"], s1)
        self.assertEqual(timeline_order(doc), [c1, c2])

    def test_add_cut_explicit_scene_overrides_after(self):
        doc = self.store.create_project("Explicit")
        pid = doc["id"]
        s1 = doc["scenes"][0]["id"]
        c1 = self._first_cut(doc)["id"]
        doc = self.store.add_scene(pid, "Scene 2")
        s2 = doc["scenes"][1]["id"]
        doc = self.store.add_cut(pid, scene_id=s2, after=c1, name="cut2")
        c2 = next(cid for cid in doc["cuts"] if cid != c1)
        self.assertEqual(doc["cuts"][c2]["scene_id"], s2)
        s2_scene = next(s for s in doc["scenes"] if s["id"] == s2)
        self.assertEqual(s2_scene["cut_order"], [c2])

    def test_native_add_cut_id_when_inserted_mid_timeline(self):
        doc = self.store.create_project("Mid")
        pid = doc["id"]
        s1 = doc["scenes"][0]["id"]
        c1 = self._first_cut(doc)["id"]
        doc = self.store.add_cut(pid, scene_id=s1, name="cut2")
        c2 = next(cid for cid in doc["cuts"] if cid != c1)
        doc = self.store.add_cut(pid, scene_id=s1, name="cut3")
        c3 = next(cid for cid in doc["cuts"] if cid not in (c1, c2))
        out = native_add_cut(pid, None, c1)
        new_id = out["cut"]["id"]
        self.assertNotIn(new_id, (c1, c2, c3))
        self.assertEqual(timeline_order(self.store.get_project(pid)), [c1, new_id, c2, c3])
        self.assertEqual(self.store.get_project(pid)["cuts"][new_id]["scene_id"], s1)

class IndexRecoveryTests(unittest.TestCase):
    """A damaged projects/index.json must never shrink the project list."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root)
        self.a = self.store.create_project("Alpha")["id"]
        self.b = self.store.create_project("Beta")["id"]
        self.c = self.store.create_project("Gamma")["id"]
        self.store.delete_project(self.c)  # lives in trash/, row has deleted_at
        self.index = self.root / "projects" / "index.json"

    def tearDown(self):
        self._tmp.cleanup()

    def _ids(self, rows):
        return sorted(r["id"] for r in rows)

    def test_truncated_index_is_backed_up_and_rebuilt(self):
        self.index.write_text('[{"id": "x", "na', encoding="utf-8")
        damaged = self.index.read_text(encoding="utf-8")
        rows = self.store.list_projects()
        self.assertEqual(self._ids(rows), sorted([self.a, self.b]))
        backups = list(self.index.parent.glob("index.json.bad-*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), damaged)
        # the repaired file is valid and complete
        self.assertEqual(self._ids(json.loads(self.index.read_text(encoding="utf-8"))), sorted([self.a, self.b, self.c]))

    def test_deleted_project_row_is_rebuilt_from_trash(self):
        self.index.write_text("not json", encoding="utf-8")
        rows = self.store.list_projects(include_deleted=True)
        self.assertEqual(self._ids(rows), sorted([self.a, self.b, self.c]))
        self.assertTrue(next(r for r in rows if r["id"] == self.c)["deleted_at"])

    def test_save_after_damage_keeps_every_project(self):
        self.index.write_text("{}", encoding="utf-8")  # valid JSON, wrong shape
        self.store.rename_project(self.a, "Alpha 2")
        rows = self.store.list_projects()
        self.assertEqual(self._ids(rows), sorted([self.a, self.b]))
        self.assertEqual(next(r for r in rows if r["id"] == self.a)["name"], "Alpha 2")

    def test_create_after_damage_keeps_old_projects(self):
        self.index.write_text("", encoding="utf-8")
        d = self.store.create_project("Delta")["id"]
        self.assertEqual(self._ids(self.store.list_projects()), sorted([self.a, self.b, d]))

    def test_unreadable_project_json_is_skipped_not_fatal(self):
        (self.root / "projects" / self.b / "project.json").write_text("{broken", encoding="utf-8")
        self.index.write_text("[", encoding="utf-8")
        self.assertEqual(self._ids(self.store.list_projects()), [self.a])

    def test_missing_index_is_not_touched(self):
        self.index.unlink()
        self.assertEqual(self.store.list_projects(), [])
        self.assertFalse(list(self.index.parent.glob("index.json.bad-*")))

    def test_second_damage_keeps_both_backups(self):
        self.index.write_text("[", encoding="utf-8")
        self.store.list_projects()
        self.index.write_text("[[", encoding="utf-8")
        self.store.list_projects()
        self.assertEqual(len(list(self.index.parent.glob("index.json.bad-*"))), 2)


if __name__ == "__main__":
    unittest.main()
