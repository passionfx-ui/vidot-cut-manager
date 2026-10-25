"""Per-cut caption field on native projects (0.9.3)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_native_api import native_update_cut, set_native_store
from gg_project import ConflictError, LocalStore


class CutCaptionTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        set_native_store(self.store)

    def tearDown(self):
        self._tmp.cleanup()

    def _first_cut_id(self, doc: dict) -> str:
        return next(iter((doc.get("cuts") or {}).keys()))

    def test_new_cut_default_caption(self):
        doc = self.store.create_project("P")
        cut = (doc.get("cuts") or {}).popitem()[1]
        self.assertEqual(cut.get("caption"), "")

    def test_update_caption_persists(self):
        doc = self.store.create_project("U")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        self.store.update_cut(pid, cut_id, {"caption": "Hello"})
        c = self.store.get_project(pid)["cuts"][cut_id]
        self.assertEqual(c["caption"], "Hello")
        tl = self.store.to_timeline(pid)
        row = next(x for x in tl["cuts"] if x["id"] == cut_id)
        self.assertEqual(row["caption"], "Hello")

    def test_caption_non_string_rejected(self):
        doc = self.store.create_project("R")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        with self.assertRaises(ValueError):
            self.store.update_cut(pid, cut_id, {"caption": 1})

    def test_caption_too_long_rejected(self):
        doc = self.store.create_project("L")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        with self.assertRaises(ValueError):
            self.store.update_cut(pid, cut_id, {"caption": "x" * 4001})

    def test_old_doc_without_caption_key(self):
        doc = self.store.create_project("Legacy")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        path = Path(self._tmp.name) / "projects" / pid / "project.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw["cuts"][cut_id].pop("caption", None)
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
        tl = self.store.to_timeline(pid)
        row = next(x for x in tl["cuts"] if x["id"] == cut_id)
        self.assertEqual(row["caption"], "")

    def test_revision_and_unknown_field(self):
        doc = self.store.create_project("Rev")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        cut_rev = doc["cuts"][cut_id]["rev"]
        self.store.update_cut(pid, cut_id, {"caption": "a"})
        with self.assertRaises(ConflictError):
            self.store.update_cut(pid, cut_id, {"caption": "b"}, expected_rev=cut_rev)
        with self.assertRaises(ValueError):
            self.store.update_cut(pid, cut_id, {"bogus": 1})

    def test_native_update_cut_route_shape(self):
        doc = self.store.create_project("API")
        pid = doc["id"]
        cut_id = self._first_cut_id(doc)
        res = native_update_cut(pid, cut_id, {"caption": "line"})
        self.assertTrue(res and res.get("ok"))
        row = next(c for c in res["timeline"]["cuts"] if c["id"] == cut_id)
        self.assertEqual(row["caption"], "line")


if __name__ == "__main__":
    unittest.main()
