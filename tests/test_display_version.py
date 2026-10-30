"""Version row thumbnail click persists display_version_id (0.9.130); Best (pick) stays separate."""
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
from gg_project.timeline import current_version


class DisplayVersionTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root)
        na.set_native_store(self.store)
        doc = self.store.create_project("Display")
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

    def test_display_version_drives_timeline_media(self):
        tl = self._save({"display": self.v1["id"]})
        row = next(c for c in tl["cuts"] if c["id"] == self.cid)
        self.assertEqual(row["media"]["id"], self.v1["id"])
        self.assertEqual(row["display"], self.v1["id"])
        cut = self.store.get_project(self.pid)["cuts"][self.cid]
        vers = self.store.list_versions(self.pid, self.cid)
        self.assertEqual(current_version(cut, vers)["id"], self.v1["id"])

    def test_display_and_best_are_independent(self):
        self._save({"display": self.v1["id"], "pick": self.v2["id"]})
        row = self._row()
        self.assertEqual(row["pick"], self.v2["id"])
        self.assertEqual(row["display"], self.v1["id"])
        self.assertEqual(row["media"]["id"], self.v1["id"], "display wins for timeline media")

    def _save(self, clip: dict) -> dict:
        return na.native_save_edit(self.pid, [self.cid], {self.cid: {"in": 0, "sec": 3.0, **clip}})


if __name__ == "__main__":
    unittest.main()
