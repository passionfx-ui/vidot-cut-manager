"""Missing media (0.9.102): a version whose file is gone on disk is marked `missing` and treated like no media."""
from __future__ import annotations

import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_export
import gg_native_api as na
from gg_project import LocalStore
from gg_project.timeline import current_version


class CurrentVersionTests(unittest.TestCase):
    VERS = [{"id": "v3"}, {"id": "v2"}, {"id": "v1"}]

    def test_pick_wins(self):
        self.assertEqual(current_version({"pick_version_id": "v1"}, self.VERS)["id"], "v1")

    def test_no_pick_or_unknown_pick_is_newest(self):
        self.assertEqual(current_version({}, self.VERS)["id"], "v3")
        self.assertEqual(current_version({"pick_version_id": "gone"}, self.VERS)["id"], "v3")

    def test_no_versions(self):
        self.assertIsNone(current_version({"pick_version_id": "v1"}, []))


class NativeMissingMediaTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root)
        na.set_native_store(self.store)
        doc = self.store.create_project("Missing")
        self.pid = doc["id"]
        self.cid = next(iter(doc["cuts"]))

    def tearDown(self):
        self._tmp.cleanup()

    def _add(self, name: str) -> dict:
        time.sleep(0.002)
        src = self.root / name
        src.write_bytes(b"\x89PNG\r\n\x1a\n" + name.encode() * 4)
        return self.store.add_version(self.pid, self.cid, src)

    def _asset(self, ver: dict) -> Path:
        return self.root / "projects" / self.pid / ver["asset"]["path"]

    def _row(self) -> dict:
        return next(c for c in self.store.to_timeline(self.pid)["cuts"] if c["id"] == self.cid)

    def test_existing_files_are_not_missing(self):
        v1 = self._add("a.png")
        row = self._row()
        self.assertEqual(row["media"]["id"], v1["id"])
        self.assertEqual([v["missing"] for v in row["versions_list"]], [False])

    def test_deleted_newest_file_is_no_media_not_an_older_version(self):
        v1 = self._add("a.png")
        v2 = self._add("b.png")
        self._asset(v2).unlink()
        row = self._row()
        self.assertIsNone(row["media"])
        self.assertIsNone(row["src_dur"])
        flags = {v["id"]: v["missing"] for v in row["versions_list"]}
        self.assertEqual(flags, {v2["id"]: True, v1["id"]: False})
        self.assertEqual(len(row["versions_list"]), 2)

    def test_deleted_picked_file_keeps_pick_and_shows_no_media(self):
        v1 = self._add("a.png")
        self._add("b.png")
        self.store.apply_timeline_edit(self.pid, [self.cid], {self.cid: {"in": 0, "sec": 3.0, "pick": v1["id"]}})
        self._asset(v1).unlink()
        row = self._row()
        self.assertIsNone(row["media"])
        self.assertEqual(row["pick"], v1["id"])
        self.assertIsNone(na.native_media_path(v1["id"]))

    def test_picking_an_existing_version_again_brings_media_back(self):
        v1 = self._add("a.png")
        v2 = self._add("b.png")
        self._asset(v2).unlink()
        tl = na.native_save_edit(self.pid, [self.cid], {self.cid: {"in": 0, "sec": 3.0, "pick": v1["id"]}})
        row = next(c for c in tl["cuts"] if c["id"] == self.cid)
        self.assertEqual(row["media"]["id"], v1["id"])
        self.assertEqual(row["pick"], v1["id"])

    def test_saving_a_missing_pick_clamps_like_no_media(self):
        self._add("a.png")
        v2 = self._add("b.png")
        self._asset(v2).unlink()
        tl = na.native_save_edit(self.pid, [self.cid], {self.cid: {"in": 0, "sec": 2.5, "pick": v2["id"]}})
        row = next(c for c in tl["cuts"] if c["id"] == self.cid)
        self.assertIsNone(row["media"])
        self.assertEqual(row["sec"], 2.5)


class ExportMissingMediaTests(unittest.TestCase):
    def _cmd(self, kind: str) -> list[str]:
        clip = {"media": {"id": "x", "kind": kind}, "in": 0.0}
        return gg_export._segment_cmd("ffmpeg", clip, None, Path("seg.mkv"), 640, 360, 24, 24, False)

    def test_missing_file_exports_black(self):
        for kind in ("video", "image"):
            cmd = self._cmd(kind)
            self.assertIn("lavfi", cmd)
            self.assertTrue(any(a.startswith("color=c=black") for a in cmd), kind)
            self.assertNotIn("-ss", cmd)
            self.assertNotIn("-loop", cmd)


if __name__ == "__main__":
    unittest.main()
