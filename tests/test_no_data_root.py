"""Fresh installs without legacy (gonggan-share) data must still list projects."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_data as gd


class NoDataRootTests(unittest.TestCase):
    def test_empty_data_root_lists_no_legacy_projects(self):
        with mock.patch.object(gd, "load_settings", return_value={"data_root": "", "uid": "demo"}):
            res = gd.list_projects()
        self.assertTrue(res["ok"])
        self.assertEqual(res["projects"], [])
        self.assertIn("data_root not set", res["legacy_unavailable"])

    def test_missing_data_root_lists_no_legacy_projects(self):
        with tempfile.TemporaryDirectory() as t:
            missing = str(Path(t) / "nope")
            with mock.patch.object(gd, "load_settings", return_value={"data_root": missing, "uid": "demo"}):
                res = gd.list_projects()
        self.assertTrue(res["ok"])
        self.assertEqual(res["projects"], [])

    def test_user_dir_rejects_empty_root(self):
        with self.assertRaises(FileNotFoundError):
            gd.user_dir({"data_root": "  ", "uid": "demo"})


if __name__ == "__main__":
    unittest.main()