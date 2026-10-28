"""Project setup settings (native store + API)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
from gg_project import LocalStore
from gg_project.project_settings import DEFAULT_PROJECT_SETTINGS, normalize_settings


class ProjectSettingsTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        na.set_native_store(self.store)

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def test_old_project_missing_settings_get_defaults(self):
        doc = self.store.create_project("Legacy")
        pid = doc["id"]
        path = Path(self._tmp.name) / "projects" / pid / "project.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw.pop("settings", None)
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
        tl = self.store.to_timeline(pid)
        s = tl["project"]["settings"]
        self.assertEqual(s["fps"], 24)
        self.assertEqual(s["cut_seconds"], 3.0)
        self.assertEqual(s["width"], 1280)
        self.assertEqual(s["height"], 720)

    def test_old_default_sec_maps_to_cut_seconds(self):
        doc = self.store.create_project("OldSec")
        pid = doc["id"]
        path = Path(self._tmp.name) / "projects" / pid / "project.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw["settings"] = {"fps": 24, "default_sec": 5.5}
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
        s = normalize_settings(raw["settings"])
        self.assertEqual(s["cut_seconds"], 5.5)

    def test_clamp_settings(self):
        s = normalize_settings({
            "fps": 60,
            "cut_seconds": 999,
            "width": 100,
            "height": 5000,
            "aspect": "16:9",
        })
        self.assertEqual(s["fps"], 24)
        self.assertEqual(s["cut_seconds"], 60.0)
        self.assertEqual(s["width"] % 8, 0)
        self.assertEqual(s["height"] % 8, 0)
        self.assertGreaterEqual(s["width"], 256)
        self.assertLessEqual(s["height"], 4096)

    def test_create_and_update_persist_settings(self):
        custom = {"aspect": "9:16", "width": 720, "height": 1280, "fps": 30, "cut_seconds": 4.5}
        doc = self.store.create_project("S", settings=custom)
        pid = doc["id"]
        got = normalize_settings(doc["settings"])
        self.assertEqual(got["fps"], 30)
        self.assertEqual(got["cut_seconds"], 4.5)
        self.assertEqual(got["width"], 720)
        self.store.update_project(pid, {"settings": {"fps": 25, "cut_seconds": 2}})
        fresh = self.store.get_project(pid)
        s2 = normalize_settings(fresh["settings"])
        self.assertEqual(s2["fps"], 25)
        self.assertEqual(s2["cut_seconds"], 2.0)
        self.assertEqual(s2["width"], 720)

    def test_native_create_update_round_trip(self):
        settings = {"aspect": "1:1", "width": 1024, "height": 1024, "fps": 25, "cut_seconds": 6}
        res = na.create_native_project("Round", settings=settings)
        pid = res["project"]["id"]
        tl = na.native_timeline(pid)
        self.assertEqual(tl["project"]["settings"]["cut_seconds"], 6.0)
        na.native_update_project(pid, {"settings": {"cut_seconds": 8, "fps": 30}})
        tl2 = na.native_timeline(pid)
        self.assertEqual(tl2["project"]["settings"]["cut_seconds"], 8.0)
        self.assertEqual(tl2["project"]["settings"]["fps"], 30)

    def test_new_cut_uses_cut_seconds(self):
        doc = self.store.create_project("Len", settings={"cut_seconds": 7.5})
        pid = doc["id"]
        first = next(iter(doc["cuts"].values()))
        self.assertEqual(first["sec"], 7.5)
        doc2 = self.store.add_cut(pid, name="cut2")
        added = [c for cid, c in doc2["cuts"].items() if c["name"] == "cut2"][0]
        self.assertEqual(added["sec"], 7.5)
        self.store.update_project(pid, {"cut_seconds": 4})
        doc3 = self.store.add_cut(pid, name="cut3")
        cut3 = [c for cid, c in doc3["cuts"].items() if c["name"] == "cut3"][0]
        self.assertEqual(cut3["sec"], 4.0)
        first_again = doc3["cuts"][first["id"]]
        self.assertEqual(first_again["sec"], 7.5)


if __name__ == "__main__":
    unittest.main()
