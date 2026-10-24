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

from gg_project import ConflictError, LocalStore, uuid7
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


if __name__ == "__main__":
    unittest.main()
