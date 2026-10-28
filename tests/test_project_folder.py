"""project_folder setting (0.9.33): optional, display + future sync target only."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_project.project_settings import DEFAULT_PROJECT_SETTINGS, merge_settings_patch, normalize_settings


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


if __name__ == "__main__":
    unittest.main()