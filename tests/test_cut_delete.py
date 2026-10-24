"""Tests for soft-delete (hidden), trash move, restore."""
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

import gg_data as gd


class CutDeleteTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.data = root / "data" / "demo"
        self.data.mkdir(parents=True)
        self.edits = root / "edits"
        self.trash = root / "trash"
        self.workflows = root / "workflows"
        self.versions = root / "versions"
        ws = {
            "projects": [
                {
                    "id": "proj1",
                    "name": "Test",
                    "cuts": [
                        {"id": "cutA", "name": "one", "tl_sec": 3.0, "prompt": "hello"},
                        {"id": "cutB", "name": "two", "tl_sec": 2.0, "prompt": "world"},
                    ],
                }
            ]
        }
        self.ws_path = self.data / "_workspace.json"
        self.ws_path.write_text(json.dumps(ws), encoding="utf-8")
        self.ws_mtime = self.ws_path.stat().st_mtime_ns
        settings = {"data_root": str(root / "data"), "uid": "demo"}
        self.patches = [
            mock.patch.object(gd, "EDITS_DIR", self.edits),
            mock.patch.object(gd, "PACK_DIR", root),
            mock.patch.object(gd, "TRASH_DIR", self.trash),
            mock.patch.object(gd, "WORKFLOWS_DIR", self.workflows),
            mock.patch.object(gd, "VERSIONS_DIR", self.versions),
            mock.patch.object(gd, "load_settings", lambda: settings),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self._tmp.cleanup()

    def assert_data_root_untouched(self):
        self.assertEqual(self.ws_path.stat().st_mtime_ns, self.ws_mtime)
        self.assertEqual(json.loads(self.ws_path.read_text(encoding="utf-8"))["projects"][0]["cuts"][0]["id"], "cutA")

    def test_hide_share_cut_excluded_from_timeline(self):
        tl = gd.delete_cuts("proj1", ["cutA"])
        self.assertIsNotNone(tl)
        ids = [c["id"] for c in tl["cuts"]]
        self.assertNotIn("cutA", ids)
        self.assertIn("cutB", ids)
        edit = gd.load_edit("proj1")
        self.assertIn("cutA", edit.get("hidden") or [])
        self.assert_data_root_untouched()

    def test_save_edit_preserves_hidden(self):
        gd.delete_cuts("proj1", ["cutA"])
        gd.save_edit("proj1", None, {})
        edit = gd.load_edit("proj1")
        self.assertIn("cutA", edit.get("hidden") or [])

    def test_local_cut_moves_to_trash_with_manifest(self):
        entry = gd.add_local_cut("proj1")
        cut_id = entry["id"]
        wf_dir = self.workflows / "proj1" / cut_id
        wf_dir.mkdir(parents=True)
        (wf_dir / "initial.workflow.json").write_text("{}", encoding="utf-8")
        ver_dir = self.versions / "proj1" / cut_id
        ver_dir.mkdir(parents=True)
        (ver_dir / "note.txt").write_text("v", encoding="utf-8")

        gd.delete_cuts("proj1", [cut_id])
        self.assertFalse(wf_dir.exists())
        self.assertFalse(ver_dir.exists())
        items = gd.list_trash("proj1")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["cut_id"], cut_id)
        self.assertTrue(items[0].get("local"))
        manifest_path = Path(items[0]["path"]) / "manifest.json"
        self.assertTrue(manifest_path.is_file())
        edit = gd.load_edit("proj1")
        self.assertNotIn(cut_id, [lc["id"] for lc in edit.get("local_cuts") or []])
        self.assert_data_root_untouched()

    def test_restore_local_cut(self):
        entry = gd.add_local_cut("proj1")
        cut_id = entry["id"]
        wf_dir = self.workflows / "proj1" / cut_id
        wf_dir.mkdir(parents=True)
        (wf_dir / "initial.workflow.json").write_text("{}", encoding="utf-8")

        gd.delete_cuts("proj1", [cut_id])
        tl = gd.restore_cuts("proj1", [cut_id])
        ids = [c["id"] for c in tl["cuts"]]
        self.assertIn(cut_id, ids)
        self.assertTrue(wf_dir.is_dir())
        edit = gd.load_edit("proj1")
        self.assertNotIn(cut_id, edit.get("hidden") or [])
        self.assertEqual(len(edit.get("local_cuts") or []), 1)

    def test_groups_rename_and_ungroup(self):
        gd.save_groups("proj1", [{"id": "s1", "name": "Act 1", "cut_ids": ["cutA", "cutB"], "collapsed": False}])
        edit = gd.load_edit("proj1")
        self.assertEqual(edit["groups"][0]["name"], "Act 1")
        gd.save_groups(
            "proj1",
            [{"id": "s1", "name": "Renamed", "cut_ids": ["cutA", "cutB"], "collapsed": False}],
        )
        tl = gd.timeline("proj1")
        self.assertEqual(tl["groups"][0]["name"], "Renamed")
        gd.save_groups("proj1", [])
        tl = gd.timeline("proj1")
        self.assertEqual(len(tl["groups"]), 0)
        self.assertEqual(len(tl["cuts"]), 2)


if __name__ == "__main__":
    unittest.main()
