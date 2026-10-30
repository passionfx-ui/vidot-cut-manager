"""Tests for per-project workflow templates (stdlib unittest only)."""
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

import gg_template as gt


API_WF = {
    "3": {"class_type": "KSampler", "inputs": {"seed": 1}},
    "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0]}},
}

UI_WF = {"nodes": [{"id": 1, "type": "KSampler"}], "links": [], "groups": [], "config": {}, "extra": {}, "version": 0.4}


class TemplateTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.templates = Path(self._tmp.name) / "templates"
        self.patcher = mock.patch.object(gt, "TEMPLATES_DIR", self.templates)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self._tmp.cleanup()

    def test_missing_returns_none(self):
        self.assertIsNone(gt.get_template("proj1"))

    def test_save_and_get_ui(self):
        path = gt.save_template("proj1", UI_WF)
        self.assertTrue(path.is_file())
        loaded = gt.get_template("proj1")
        self.assertEqual(loaded["nodes"][0]["type"], "KSampler")

    def test_workflow_ref_resolves_from_user_dir(self):
        wf_root = Path(self._tmp.name) / "user" / "default" / "workflows"
        sub = wf_root / "sub"
        sub.mkdir(parents=True)
        (sub / "mine.json").write_text(json.dumps(UI_WF), encoding="utf-8")
        with mock.patch.object(gt, "user_workflows_dir", lambda: wf_root):
            gt.save_template_ref("refproj", "sub/mine.json")
            info = gt.get_template_info("refproj")
            self.assertEqual(info["ref"], "sub/mine.json")
            self.assertTrue(info["exists"])
            self.assertEqual(info["workflow"]["nodes"][0]["type"], "KSampler")

    def test_legacy_full_graph_still_loads(self):
        gt.save_template("legacy", UI_WF)
        info = gt.get_template_info("legacy")
        self.assertTrue(info["exists"])
        self.assertIsNone(info["ref"])
        self.assertEqual(info["workflow"]["nodes"][0]["type"], "KSampler")

    def test_save_and_get_api(self):
        gt.save_template("p2", API_WF)
        loaded = gt.get_template("p2")
        self.assertIn("3", loaded)
        self.assertEqual(loaded["3"]["class_type"], "KSampler")

    def test_atomic_write(self):
        gt.save_template("p3", API_WF)
        f = self.templates / "p3.json"
        self.assertFalse(f.with_suffix(".tmp").exists())

    def test_invalid_pid_rejected(self):
        with self.assertRaises(ValueError):
            gt.save_template("../escape", API_WF)

    def test_invalid_workflow_rejected(self):
        with self.assertRaises(ValueError):
            gt.validate_workflow({"foo": "bar"})
        with self.assertRaises(ValueError):
            gt.validate_workflow([])

    def test_corrupt_file_raises(self):
        self.templates.mkdir(parents=True)
        bad = self.templates / "bad.json"
        bad.write_text("{not json", encoding="utf-8")
        with self.assertRaises(ValueError):
            gt.get_template("bad")


if __name__ == "__main__":
    unittest.main()
