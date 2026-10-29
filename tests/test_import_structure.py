"""Auto Cut Split import + cut rename (0.9.32)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_native_api import native_import_structure, native_rename_cut, native_update_cut, set_native_store
from gg_project import LocalStore
from gg_project.timeline import timeline_order


class ImportStructureTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        set_native_store(self.store)
        self.doc = self.store.create_project("P")
        self.pid = self.doc["id"]

    def tearDown(self):
        self._tmp.cleanup()

    def _payload(self):
        return {
            "loose": [{"name": "Loose one", "sec": 2, "caption": "loose cap"}],
            "scenes": [
                {"name": "Arrival", "cuts": [
                    {"name": "Platform wide", "sec": 3, "caption": "Rain | on platform"},
                    {"name": "Ticket", "sec": 2, "caption": ""},
                ]},
                {"name": "Night", "cuts": [{"name": "Window", "sec": 3, "caption": "Her face."}]},
            ],
            "references": [
                {"category": "Character", "name": "Mina"},
                {"category": "Place", "name": "Old station"},
                {"category": "Bogus", "name": "ignored"},
                {"category": "Character", "name": "mina"},
            ],
        }

    def test_import_creates_scenes_cuts_refs(self):
        res = native_import_structure(self.pid, self._payload())
        self.assertTrue(res["ok"])
        doc = self.store.get_project(self.pid)
        order = timeline_order(doc)
        names = [doc["cuts"][c]["name"] for c in order]
        self.assertEqual(names, ["Platform wide", "Ticket", "Window", "Loose one"])  # app order: scenes first, loose last
        self.assertEqual(len(order), 4)
        self.assertEqual([s["name"] for s in doc["scenes"]], ["Arrival", "Night"])
        cut = doc["cuts"][order[0]]
        self.assertEqual(cut["caption"], "Rain | on platform")
        self.assertEqual(cut["planned_sec"], 3.0)
        self.assertIsNone(doc["cuts"][order[3]]["scene_id"])
        refs = [(r["category"], r["name"]) for r in self.store.to_timeline(self.pid)["references"]]
        self.assertEqual(refs, [("Character", "Mina"), ("Place", "Old station")])

    def test_refuses_project_with_cuts(self):
        native_import_structure(self.pid, self._payload())
        with self.assertRaises(ValueError):
            native_import_structure(self.pid, self._payload())

    def test_refuses_edited_first_cut(self):
        cid = next(iter(self.doc["cuts"]))
        native_update_cut(self.pid, cid, {"caption": "mine"})
        with self.assertRaises(ValueError):
            native_import_structure(self.pid, self._payload())

    def test_bad_values_rejected_and_nothing_saved(self):
        bad = {"scenes": [{"name": "S", "cuts": [{"name": "x", "sec": 9999, "caption": ""}]}]}
        with self.assertRaises(ValueError):
            native_import_structure(self.pid, bad)
        doc = self.store.get_project(self.pid)
        self.assertEqual(len(doc["cuts"]), 1)
        self.assertEqual(next(iter(doc["cuts"].values()))["name"], "New cut")

    def test_empty_payload_rejected(self):
        with self.assertRaises(ValueError):
            native_import_structure(self.pid, {"scenes": [], "loose": []})

    def test_rename_cut(self):
        cid = next(iter(self.doc["cuts"]))
        res = native_rename_cut(self.pid, cid, "  Opening  ")
        self.assertTrue(res["ok"])
        self.assertEqual(self.store.get_project(self.pid)["cuts"][cid]["name"], "Opening")
        for bad in ("", "   ", "x" * 81):
            with self.assertRaises(ValueError):
                native_rename_cut(self.pid, cid, bad)
        self.assertIsNone(native_rename_cut("nope", cid, "a"))


if __name__ == "__main__":
    unittest.main()