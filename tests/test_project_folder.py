"""project_folder setting (0.9.33): optional, display + future sync target only.
0.9.82: shown as "Output folder" in Project Settings, checked on Save via check_output_folder."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_project.project_settings import (
    DEFAULT_PROJECT_SETTINGS,
    check_output_folder,
    merge_settings_patch,
    normalize_settings,
)


class ProjectFolderTests(unittest.TestCase):
    def test_default_empty(self):
        self.assertEqual(DEFAULT_PROJECT_SETTINGS["project_folder"], "")
        self.assertEqual(normalize_settings(None)["project_folder"], "")

    def test_clamp(self):
        self.assertEqual(normalize_settings({"project_folder": "  N:\\Films\x01\\A "})["project_folder"], "N:\\Films\\A")
        self.assertEqual(len(normalize_settings({"project_folder": "x" * 400})["project_folder"]), 260)

    def test_merge_keeps_unless_patched(self):
        cur = normalize_settings({"project_folder": "N:\\A"})
        self.assertEqual(merge_settings_patch(cur, {"fps": 25})["project_folder"], "N:\\A")
        self.assertEqual(merge_settings_patch(cur, {"project_folder": ""})["project_folder"], "")


class CheckOutputFolderTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_empty_is_default(self):
        self.assertEqual(check_output_folder("  "), {"ok": True, "path": "", "exists": False})
        self.assertTrue(check_output_folder(None)["ok"])

    def test_existing_folder(self):
        res = check_output_folder(f"  {self.root}  ")
        self.assertEqual(res, {"ok": True, "path": str(self.root), "exists": True})

    def test_missing_folder_can_be_created_and_is_not_created(self):
        target = self.root / "Film" / "Scenes"
        res = check_output_folder(str(target))
        self.assertTrue(res["ok"])
        self.assertFalse(res["exists"])
        self.assertFalse((self.root / "Film").exists())

    def test_relative_path_rejected(self):
        res = check_output_folder("Films\\A")
        self.assertFalse(res["ok"])
        self.assertIn("full path", res["message"])

    def test_file_rejected(self):
        f = self.root / "a.txt"
        f.write_text("x", encoding="utf-8")
        self.assertFalse(check_output_folder(str(f))["ok"])
        self.assertFalse(check_output_folder(str(f / "sub"))["ok"])

    @unittest.skipUnless(os.name == "nt", "Windows name rules")
    def test_windows_bad_names(self):
        self.assertFalse(check_output_folder(str(self.root / "a?b"))["ok"])
        self.assertFalse(check_output_folder(str(self.root / "trailing."))["ok"])


if __name__ == "__main__":
    unittest.main()