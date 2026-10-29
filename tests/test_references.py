"""Reference Manager data layer (0.9.34): references are hidden cuts."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_native_api import native_add_reference, native_delete_cuts, native_rename_cut, set_native_store
from gg_project import LocalStore
from gg_project.timeline import timeline_order


class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root / "store")
        set_native_store(self.store)
        self.pid = self.store.create_project("P")["id"]

    def tearDown(self):
        self._tmp.cleanup()

    def _png(self, name):
        p = self.root / name
        p.write_bytes(b"\x89PNG\r\n\x1a\n" + name.encode())
        return p

    def test_add_is_hidden_from_timeline(self):
        res = native_add_reference(self.pid, " Mina ", "Character")
        self.assertTrue(res["ok"])
        tl = res["timeline"]
        self.assertEqual([r["name"] for r in tl["references"]], ["Mina"])
        self.assertEqual(tl["references"][0]["category"], "Character")
        self.assertEqual(len(tl["cuts"]), 1)  # only the default cut
        self.assertEqual(tl["cuts"][0]["name"], "cut1")
        doc = self.store.get_project(self.pid)
        self.assertEqual(len(timeline_order(doc)), 1)
        self.assertEqual(tl["total_sec"], 3.0)

    def test_new_cut_numbering_ignores_references(self):
        native_add_reference(self.pid, "cut9", "Prop")
        doc = self.store.add_cut(self.pid)
        names = sorted(c["name"] for c in doc["cuts"].values() if c.get("kind") != "reference")
        self.assertEqual(names, ["cut1", "cut2"])

    def test_validation_and_duplicates(self):
        with self.assertRaises(ValueError):
            native_add_reference(self.pid, "", "Character")
        with self.assertRaises(ValueError):
            native_add_reference(self.pid, "x", "Bogus")
        native_add_reference(self.pid, "Mina", "Character")
        with self.assertRaises(ValueError):
            native_add_reference(self.pid, "mina", "Character")
        native_add_reference(self.pid, "Mina", "Prop")  # other category is fine

    def test_rename_delete_use_cut_routes(self):
        rid = native_add_reference(self.pid, "Mina", "Character")["reference"]["id"]
        res = native_rename_cut(self.pid, rid, "Mina Park")
        self.assertEqual([r["name"] for r in res["timeline"]["references"]], ["Mina Park"])
        res = native_delete_cuts(self.pid, [rid])
        self.assertEqual(res["timeline"]["references"], [])
        self.assertEqual(self.store.list_deleted_cuts(self.pid), [])  # trash lists cuts only
        self.assertEqual(len(res["timeline"]["cuts"]), 1)

    def test_newest_version_is_best(self):
        rid = native_add_reference(self.pid, "Mina", "Character")["reference"]["id"]
        v1 = self.store.add_version(self.pid, rid, self._png("a.png"))
        v2 = self.store.add_version(self.pid, rid, self._png("b.png"))
        ref = self.store.to_timeline(self.pid)["references"][0]
        self.assertEqual(ref["versions"], 2)
        self.assertEqual(ref["pick"], v2["id"])
        self.assertEqual(ref["media"]["id"], v2["id"])
        self.assertNotEqual(v1["id"], v2["id"])

    def test_normal_cuts_are_not_auto_picked(self):
        cid = next(iter(self.store.get_project(self.pid)["cuts"]))
        self.store.add_version(self.pid, cid, self._png("a.png"))
        self.store.add_version(self.pid, cid, self._png("b.png"))
        self.assertIsNone(self.store.get_project(self.pid)["cuts"][cid]["pick_version_id"])

    def test_import_references_become_hidden_cuts(self):
        from gg_native_api import native_import_structure
        native_add_reference(self.pid, "Mina", "Character")
        native_import_structure(self.pid, {
            "loose": [{"name": "A", "sec": 2, "caption": ""}],
            "scenes": [],
            "references": [{"category": "Character", "name": "mina"}, {"category": "Place", "name": "Hall"}],
        })
        tl = self.store.to_timeline(self.pid)
        self.assertEqual([(r["category"], r["name"]) for r in tl["references"]],
                         [("Character", "Mina"), ("Place", "Hall")])
        self.assertEqual([c["name"] for c in tl["cuts"]], ["A"])


if __name__ == "__main__":
    unittest.main()