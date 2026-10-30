"""Version row Best toggle (0.9.125): an explicit "pick": null in POST /gonggan/edit clears Best on native projects,
so the newest version is current again. Clips that leave "pick" out keep their Best."""
from __future__ import annotations

import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
from gg_project import LocalStore


class BestToggleTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root)
        na.set_native_store(self.store)
        doc = self.store.create_project("Best")
        self.pid = doc["id"]
        self.cid = next(iter(doc["cuts"]))
        self.v1 = self._add("a.png")
        self.v2 = self._add("b.png")

    def tearDown(self):
        self._tmp.cleanup()

    def _add(self, name: str) -> dict:
        time.sleep(0.002)
        src = self.root / name
        src.write_bytes(b"\x89PNG\r\n\x1a\n" + name.encode() * 4)
        return self.store.add_version(self.pid, self.cid, src)

    def _row(self, tl: dict | None = None) -> dict:
        tl = tl or self.store.to_timeline(self.pid)
        return next(c for c in tl["cuts"] if c["id"] == self.cid)

    def _save(self, clip: dict) -> dict:
        return self._row(na.native_save_edit(self.pid, [self.cid], {self.cid: {"in": 0, "sec": 3.0, **clip}}))

    def test_null_pick_clears_best_and_newest_is_current(self):
        row = self._save({"pick": self.v1["id"]})
        self.assertEqual((row["pick"], row["media"]["id"]), (self.v1["id"], self.v1["id"]))
        row = self._save({"pick": None})
        self.assertIsNone(row["pick"])
        self.assertEqual(row["media"]["id"], self.v2["id"], "newest is current again")
        self.assertIsNone(self.store.get_project(self.pid)["cuts"][self.cid]["pick_version_id"])

    def test_leaving_pick_out_keeps_best(self):
        self._save({"pick": self.v1["id"]})
        row = self._save({})
        self.assertEqual(row["pick"], self.v1["id"])

    def test_unknown_pick_string_keeps_best(self):
        self._save({"pick": self.v1["id"]})
        row = self._save({"pick": "not-a-version"})
        self.assertEqual(row["pick"], self.v1["id"])

    def test_null_pick_without_best_is_a_no_op(self):
        rev = self.store.get_project(self.pid)["cuts"][self.cid].get("rev")
        row = self._save({"pick": None})
        self.assertIsNone(row["pick"])
        self.assertEqual(row["media"]["id"], self.v2["id"])
        self.assertEqual(self.store.get_project(self.pid)["cuts"][self.cid].get("rev"), rev, "cut not touched")

    def test_store_level_null_pick(self):
        self.store.apply_timeline_edit(self.pid, [self.cid], {self.cid: {"pick": self.v1["id"]}})
        self.assertEqual(self._row()["pick"], self.v1["id"])
        self.store.apply_timeline_edit(self.pid, [self.cid], {self.cid: {"pick": None}})
        self.assertIsNone(self._row()["pick"])
        self.assertEqual(self.store.get_project(self.pid)["timeline"]["clips"].get(self.cid, {}).get("pick"), None,
                         "the clip entry never stores pick")


if __name__ == "__main__":
    unittest.main()
