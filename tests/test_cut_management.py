"""Cut management fields, updates, timeline, reorder (0.8.0 part 1)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_native_api import native_update_cut, native_update_project, set_native_store
from gg_project import ConflictError, LocalStore, uuid7
from gg_project.timeline import timeline_order


class CutManagementTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        set_native_store(self.store)

    def tearDown(self):
        self._tmp.cleanup()

    def _first_cut_id(self, doc: dict) -> str:
        return next(iter((doc.get("cuts") or {}).keys()))

    def test_new_cut_defaults(self):
        doc = self.store.create_project("P")
        cut = (doc.get("cuts") or {}).popitem()[1]
        self.assertIsNone(cut.get("planned_sec"))
        self.assertFalse(cut.get("end_card"))
        self.assertFalse(cut.get("needs_redo"))
        self.assertEqual(cut.get("notes"), "")

    def test_old_doc_missing_keys_timeline(self):
        doc = self.store.create_project("Legacy")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        path = Path(self._tmp.name) / "projects" / pid / "project.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        c = raw["cuts"][cut_id]
        for key in ("planned_sec", "end_card", "needs_redo"):
            c.pop(key, None)
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
        tl = self.store.to_timeline(pid)
        row = tl["cuts"][0]
        self.assertIsNone(row["planned_sec"])
        self.assertFalse(row["end_card"])
        self.assertFalse(row["needs_redo"])
        self.assertEqual(row["notes"], "")

    def test_update_cut_validation_and_rev(self):
        doc = self.store.create_project("U")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        cut_rev = doc["cuts"][cut_id]["rev"]
        proj_rev = doc["rev"]
        self.store.update_cut(
            pid,
            cut_id,
            {"planned_sec": 2.5, "notes": "note", "end_card": True, "needs_redo": True},
        )
        fresh = self.store.get_project(pid)
        c = fresh["cuts"][cut_id]
        self.assertEqual(c["planned_sec"], 2.5)
        self.assertEqual(c["notes"], "note")
        self.assertTrue(c["end_card"])
        self.assertTrue(c["needs_redo"])
        self.assertGreater(c["rev"], cut_rev)
        self.assertGreater(fresh["rev"], proj_rev)
        with self.assertRaises(ValueError):
            self.store.update_cut(pid, cut_id, {"planned_sec": 0.1})
        with self.assertRaises(ValueError):
            self.store.update_cut(pid, cut_id, {"planned_sec": 700})
        with self.assertRaises(ValueError):
            self.store.update_cut(pid, cut_id, {"bogus": 1})
        with self.assertRaises(ConflictError):
            self.store.update_cut(pid, cut_id, {"notes": "x"}, expected_rev=cut_rev)

    def test_update_cut_clear_planned_sec(self):
        doc = self.store.create_project("Clr")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        self.store.update_cut(pid, cut_id, {"planned_sec": 4.0})
        self.store.update_cut(pid, cut_id, {"planned_sec": None})
        self.assertIsNone(self.store.get_project(pid)["cuts"][cut_id]["planned_sec"])

    def test_due_date_validation(self):
        doc = self.store.create_project("D")
        pid = doc["id"]
        rev0 = doc["rev"]
        self.store.update_project(pid, {"due_date": "2026-12-31"})
        fresh = self.store.get_project(pid)
        self.assertEqual(fresh["due_date"], "2026-12-31")
        self.assertGreater(fresh["rev"], rev0)
        with self.assertRaises(ValueError):
            self.store.update_project(pid, {"due_date": "31-12-2026"})
        self.store.update_project(pid, {"due_date": None})
        self.assertIsNone(self.store.get_project(pid)["due_date"])

    def test_timeline_numbering_and_fields(self):
        doc = self.store.create_project("N")
        pid = doc["id"]
        s1 = doc["scenes"][0]["id"]
        c1 = self._first_cut_id(doc)
        doc = self.store.add_cut(pid, name="cut2")
        c2 = next(cid for cid in doc["cuts"] if cid != c1)
        scene2 = self.store.add_scene(pid, "Scene 2", cut_ids=[c2])
        s2 = scene2["scenes"][1]["id"]
        self.assertEqual(len(scene2["scenes"]), 2)
        tl = self.store.to_timeline(pid)
        self.assertIsNone(tl["project"].get("due_date"))
        by_id = {c["id"]: c for c in tl["cuts"]}
        self.assertEqual(by_id[c1]["number"], 1)
        self.assertEqual(by_id[c1]["scene_index"], 1)
        self.assertEqual(by_id[c1]["cut_in_scene"], 1)
        self.assertEqual(by_id[c2]["number"], 2)
        self.assertEqual(by_id[c2]["scene_index"], 2)
        self.assertEqual(by_id[c2]["cut_in_scene"], 1)
        self.store.update_project(pid, {"due_date": "2026-10-30"})
        tl2 = self.store.to_timeline(pid)
        self.assertEqual(tl2["project"]["due_date"], "2026-10-30")

    def test_reorder_within_and_between_scenes(self):
        doc = self.store.create_project("R")
        pid = doc["id"]
        s1 = doc["scenes"][0]["id"]
        doc = self.store.add_cut(pid, scene_id=s1)
        doc = self.store.add_cut(pid, scene_id=s1)
        order0 = timeline_order(doc)
        self.assertEqual(len(order0), 3)
        c1, c2, c3 = order0[0], order0[1], order0[2]
        s2 = uuid7()
        self.store.sync_scene_groups(
            pid,
            [
                {"id": s1, "name": "Scene 1", "cut_ids": [c1, c2], "collapsed": False},
                {"id": s2, "name": "B", "cut_ids": [c3], "collapsed": False},
            ],
        )
        new_order = [c2, c1, c3]
        self.store.reorder(pid, new_order)
        doc = self.store.get_project(pid)
        self.assertEqual(timeline_order(doc), new_order)
        groups = [
            {"id": s1, "name": "Scene 1", "cut_ids": [c2, c1], "collapsed": False},
            {"id": s2, "name": "B", "cut_ids": [c3], "collapsed": False},
        ]
        self.store.sync_scene_groups(pid, groups)
        tl = self.store.to_timeline(pid)
        nums = {c["id"]: c["number"] for c in tl["cuts"]}
        self.assertEqual(nums[c2], 1)
        self.assertEqual(nums[c1], 2)
        self.assertEqual(nums[c3], 3)
        in_scene = {c["id"]: c["cut_in_scene"] for c in tl["cuts"]}
        self.assertEqual(in_scene[c2], 1)
        self.assertEqual(in_scene[c1], 2)
        self.assertEqual(in_scene[c3], 1)

    def test_native_api_update_helpers(self):
        doc = self.store.create_project("API")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        res = native_update_cut(pid, cut_id, {"needs_redo": True})
        self.assertTrue(res["ok"])
        self.assertEqual(res["timeline"]["cuts"][0]["needs_redo"], True)
        pres = native_update_project(pid, {"due_date": "2026-11-01"})
        self.assertTrue(pres["ok"])
        self.assertTrue(any(p["id"] == pid for p in pres["projects"]))
        self.assertEqual(pres["timeline"]["project"]["due_date"], "2026-11-01")


if __name__ == "__main__":
    unittest.main()
