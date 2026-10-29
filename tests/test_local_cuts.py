"""Tests for pack-local cuts (local_cuts in edits)."""
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
import gg_template as gt
import gg_wfstore as wfs

UI_WF = {"nodes": [{"id": 1, "type": "KSampler"}], "links": [], "version": 0.4}


class LocalCutTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.data = root / "data" / "demo"
        self.data.mkdir(parents=True)
        self.edits = root / "edits"
        self.templates = root / "templates"
        self.workflows = root / "workflows"
        ws = {
            "projects": [
                {
                    "id": "proj1",
                    "name": "Test",
                    "cuts": [
                        {"id": "cutA", "name": "one", "tl_sec": 3.0, "prompt": "hello"},
                    ],
                }
            ]
        }
        (self.data / "_workspace.json").write_text(json.dumps(ws), encoding="utf-8")
        settings = {"data_root": str(root / "data"), "uid": "demo"}
        self.patches = [
            mock.patch.object(gd, "EDITS_DIR", self.edits),
            mock.patch.object(gd, "PACK_DIR", root),
            mock.patch.object(gt, "TEMPLATES_DIR", self.templates),
            mock.patch.object(gt, "PACK_DIR", root),
            mock.patch.object(wfs, "WORKFLOWS_DIR", self.workflows),
            mock.patch.object(wfs, "PACK_DIR", root),
            mock.patch.object(gd, "load_settings", lambda: settings),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self._tmp.cleanup()

    def test_add_cut_appears_on_timeline(self):
        entry = gd.add_local_cut("proj1")
        self.assertTrue(gd.LOCAL_CUT_ID_RE.fullmatch(entry["id"]))
        self.assertEqual(entry["name"], "New cut")
        tl = gd.timeline("proj1")
        self.assertIsNotNone(tl)
        ids = [c["id"] for c in tl["cuts"]]
        self.assertIn(entry["id"], ids)
        self.assertEqual(ids[-1], entry["id"])
        edit = gd.load_edit("proj1")
        self.assertIsInstance(edit.get("local_cuts"), list)
        self.assertEqual(edit["local_cuts"][0]["id"], entry["id"])

    def test_save_edit_preserves_local_cuts(self):
        gd.add_local_cut("proj1")
        gd.save_edit("proj1", None, {})
        edit = gd.load_edit("proj1")
        self.assertEqual(len(edit.get("local_cuts") or []), 1)

    def test_template_copied_to_initial_workflow(self):
        wf_dir = Path(self._tmp.name) / "userwf"
        sub = wf_dir / "sub"
        sub.mkdir(parents=True)
        (sub / "draft.json").write_text(json.dumps(UI_WF), encoding="utf-8")
        with mock.patch.object(gt, "user_workflows_dir", lambda: wf_dir):
            gt.save_template_ref("proj1", "sub/draft.json")
            tpl = gt.get_template("proj1")
            self.assertIsNotNone(tpl)
            entry = gd.add_local_cut("proj1")
            wfs.save_initial_workflow("proj1", entry["id"], tpl, "template")
        initial = wfs.get_initial_workflow("proj1", entry["id"])
        self.assertIsNotNone(initial)
        self.assertEqual(initial["source"], "template")
        hit = wfs.latest_cut_workflow("proj1", entry["id"])
        self.assertEqual(hit["workflow"]["nodes"][0]["type"], "KSampler")


if __name__ == "__main__":
    unittest.main()
