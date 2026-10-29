"""Native project API helpers (gg_native_api)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
from gg_project import LocalStore, uuid7

WF = {"nodes": [{"id": 1, "type": "EmptyLatentImage"}], "links": [], "version": 0.4}


class NativeApiTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        na.set_native_store(self.store)

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def test_is_native_pid(self):
        self.assertTrue(na.is_native_pid("018f2a3b-4c5d-7e6f-8a9b-0c1d2e3f4a5b"))
        self.assertTrue(na.is_native_pid(uuid7()))
        self.assertFalse(na.is_native_pid("p985fad2849"))

    def test_is_native_pid_rejects_non_uuid_and_path_like_ids(self):
        bad = [
            "018f-abc", "", None, 5, "../x-y", "..\\x-y", "C:/x-y", "C:\\x-y", "a/b-c", "x-", "-x", "x-y-",
            "018f2a3b-4c5d-7e6f-8a9b-0c1d2e3f4a5b/", "018f2a3b-4c5d-7e6f-8a9b-0c1d2e3f4a5b ",
            "018f2a3b-4c5d-7e6f-8a9b-0c1d2e3f4a5b\n", "018F2A3B-4C5D-7E6F-8A9B-0C1D2E3F4A5B",
            "018f2a3b-4c5d-7e6f-8a9b-0c1d2e3f4a5b-", "../018f2a3b-4c5d-7e6f-8a9b-0c1d2e3f4a5b",
        ]
        for pid in bad:
            self.assertFalse(na.is_native_pid(pid), repr(pid))

    def test_path_escape_pid_never_touches_files_outside_projects(self):
        root = Path(self._tmp.name)
        outside = root / "outside"
        outside.mkdir()
        (outside / "project.json").write_text(json.dumps({"id": "outside", "name": "X", "rev": 1, "cuts": {}}), encoding="utf-8")
        for pid in ("../outside", "..\\outside", str(outside)):
            self.assertIsNone(self.store.get_project(pid), pid)
            with self.assertRaises(FileNotFoundError):
                self.store.delete_project(pid)
            with self.assertRaises(FileNotFoundError):
                self.store.restore_project(pid)
            self.assertEqual(self.store.list_versions(pid, uuid7()), [])
        self.assertTrue((outside / "project.json").is_file())
        self.assertFalse((root / "trash").exists() and any((root / "trash").rglob("outside*")))

    def test_bad_cut_id_does_not_walk_versions_dir(self):
        res = na.create_native_project("A", None, {})
        pid = res["project"]["id"]
        self.assertEqual(self.store.list_versions(pid, "../../.."), [])
        self.assertEqual(self.store.list_versions(pid, "x-y"), [])

    def test_real_uuid7_project_still_works_end_to_end(self):
        res = na.create_native_project("Film", None, {})
        pid = res["project"]["id"]
        self.assertTrue(na.is_native_pid(pid))
        self.assertIsNotNone(self.store.get_project(pid))
        na.delete_native_project(pid)
        na.restore_native_project(pid)
        self.assertIsNotNone(self.store.get_project(pid))

    def test_merge_projects_marks_native(self):
        share = {
            "ok": True,
            "projects": [{"id": "proj1", "name": "Share", "cut_count": 2}],
        }
        self.store.create_project("Native one")
        merged = na.merge_projects_list(share)
        self.assertEqual(len(merged["projects"]), 2)
        self.assertTrue(merged["projects"][0]["native"])
        self.assertEqual(merged["projects"][0]["cut_count"], 1)
        self.assertFalse(merged["projects"][1]["native"])

    def test_create_rename_delete_restore(self):
        res = na.create_native_project("Film A")
        pid = res["project"]["id"]
        self.assertIn("-", pid)
        na.rename_native_project(pid, "Film B")
        doc = self.store.get_project(pid)
        self.assertEqual(doc["name"], "Film B")
        na.delete_native_project(pid)
        self.assertIsNone(self.store.get_project(pid))
        na.restore_native_project(pid)
        self.assertIsNotNone(self.store.get_project(pid))

    def test_timeline_edit_and_groups(self):
        doc = self.store.create_project("E")
        pid = doc["id"]
        cut1 = next(iter(doc["cuts"].values()))["id"]
        doc = self.store.add_cut(pid, name="cut2")
        cut2_id = [cid for cid in doc["cuts"] if cid != cut1][0]
        tl = na.native_timeline(pid)
        self.assertTrue(tl["ok"])
        na.native_save_groups(pid, [{
            "id": "s1",
            "name": "Scene A",
            "cut_ids": [cut1, cut2_id],
            "collapsed": False,
        }])
        tl2 = na.native_save_edit(pid, [cut2_id, cut1], {
            cut1: {"in": 0, "sec": 4.0},
            cut2_id: {"in": 0, "sec": 2.5},
        })
        self.assertEqual(tl2["track_order"], [cut2_id, cut1])
        self.assertEqual([c["id"] for c in tl2["cuts"]], [cut1, cut2_id])  # the cut list is not reordered
        self.assertEqual(next(c for c in tl2["cuts"] if c["id"] == cut2_id)["sec"], 2.5)

    def test_cut_source_workflow_template(self):
        wf_dir = Path(self._tmp.name) / "userwf"
        sub = wf_dir / "sub"
        sub.mkdir(parents=True)
        (sub / "draft.json").write_text(json.dumps(WF), encoding="utf-8")
        with mock.patch("gg_template.user_workflows_dir", lambda: wf_dir):
            res = na.create_native_project("T", template_ref="sub/draft.json")
            pid = res["project"]["id"]
            cut_id = next(iter(self.store.get_project(pid)["cuts"].values()))["id"]
            data = na.native_cut_source_workflow(pid, cut_id)
        self.assertEqual(data["source"], "stored")
        self.assertIsNotNone(data["workflow"])

    def test_add_cut_and_delete(self):
        doc = self.store.create_project("C")
        pid = doc["id"]
        out = na.native_add_cut(pid, None, None)
        self.assertTrue(out["ok"])
        self.assertEqual(len(out["timeline"]["cuts"]), 2)
        cid = out["cut"]["id"]
        del_out = na.native_delete_cuts(pid, [cid])
        self.assertEqual(len(del_out["timeline"]["cuts"]), 1)


if __name__ == "__main__":
    unittest.main()
