"""0.9.104: New scene adds an empty scene every time; empty scenes stack instead of being dropped."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_native_api import native_save_groups, set_native_store
from gg_project import LocalStore


class SceneStackTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        set_native_store(self.store)
        doc = self.store.create_project("Stack")
        self.pid = doc["id"]
        self.s1 = doc["scenes"][0]["id"]
        self.c1 = next(iter(doc["cuts"]))
        doc = self.store.add_cut(self.pid, scene_id=None, name="loose")
        self.c2 = next(cid for cid in doc["cuts"] if cid != self.c1)

    def tearDown(self):
        self._tmp.cleanup()

    def _groups(self) -> list[dict]:
        return [dict(g, cut_ids=list(g["cut_ids"])) for g in self.store.to_timeline(self.pid)["groups"]]

    def _new_scene(self, gid: str, name: str) -> dict:
        """What the New scene button sends: the current groups plus one empty group at the end."""
        return native_save_groups(self.pid, self._groups() + [{"id": gid, "name": name, "cut_ids": [], "collapsed": False}])

    def test_each_click_stacks_one_more_empty_scene(self):
        for i, name in enumerate(["Scene 2", "Scene 3", "Scene 4"], start=1):
            tl = self._new_scene(f"new{i}", name)
            self.assertEqual(len(tl["groups"]), 1 + i)
        tl = self.store.to_timeline(self.pid)
        self.assertEqual(
            [(g["id"], g["name"], g["cut_ids"]) for g in tl["groups"]],
            [(self.s1, "Scene 1", [self.c1]), ("new1", "Scene 2", []), ("new2", "Scene 3", []), ("new3", "Scene 4", [])],
        )
        by_id = {c["id"]: c for c in tl["cuts"]}
        self.assertEqual(by_id[self.c1]["group_id"], self.s1)
        self.assertEqual(by_id[self.c2]["group_id"], "")

    def test_empty_scenes_do_not_shift_scene_numbers(self):
        native_save_groups(self.pid, [{"id": "e0", "name": "Scene 2", "cut_ids": []}] + self._groups())
        tl = self.store.to_timeline(self.pid)
        self.assertEqual([g["id"] for g in tl["groups"]], ["e0", self.s1])
        self.assertEqual(next(c for c in tl["cuts"] if c["id"] == self.c1)["scene_index"], 1)

    def test_undo_drops_the_new_scene_and_redo_brings_it_back(self):
        before = self._groups()
        self._new_scene("new1", "Scene 2")
        after = self._groups()
        tl = native_save_groups(self.pid, before)
        self.assertEqual([g["id"] for g in tl["groups"]], [self.s1])
        tl = native_save_groups(self.pid, after)
        self.assertEqual([(g["id"], g["cut_ids"]) for g in tl["groups"]], [(self.s1, [self.c1]), ("new1", [])])

    def test_new_empty_scene_can_be_filled_and_emptied_again(self):
        self._new_scene("new1", "Scene 2")
        native_save_groups(self.pid, [*self._groups()[:1], {"id": "new1", "name": "Scene 2", "cut_ids": [self.c2]}])
        self.assertEqual(self.store.to_timeline(self.pid)["groups"][1]["cut_ids"], [self.c2])
        tl = native_save_groups(self.pid, [*self._groups()[:1], {"id": "new1", "name": "Scene 2", "cut_ids": []}])
        self.assertEqual([(g["id"], g["cut_ids"]) for g in tl["groups"]], [(self.s1, [self.c1]), ("new1", [])])

    def test_existing_scene_whose_last_cut_moves_out_is_still_dropped(self):
        tl = native_save_groups(self.pid, [{"id": self.s1, "name": "Scene 1", "cut_ids": []}])
        self.assertEqual(tl["groups"], [])

    def test_scene_emptied_by_deleting_its_cut_stays_hidden(self):
        self.store.delete_cuts(self.pid, [self.c1])
        self.assertEqual(self.store.to_timeline(self.pid)["groups"], [])

    def test_add_cut_into_empty_scene(self):
        self._new_scene("new1", "Scene 2")
        doc = self.store.add_cut(self.pid, scene_id="new1", name="into empty")
        cid = next(c for c in doc["cuts"] if c not in (self.c1, self.c2))
        groups = {g["id"]: g["cut_ids"] for g in self.store.to_timeline(self.pid)["groups"]}
        self.assertEqual(groups["new1"], [cid])

    def test_cut_dropped_into_empty_scene_then_undo(self):
        """0.9.108 drag-and-drop: the UI posts the cut inside the empty scene; Undo posts the old groups."""
        self._new_scene("new1", "Scene 2")
        before = self._groups()
        tl = native_save_groups(self.pid, [dict(before[0], cut_ids=[]), {"id": "new1", "name": "Scene 2", "cut_ids": [self.c1]}])
        self.assertEqual([(g["id"], g["cut_ids"]) for g in tl["groups"]], [("new1", [self.c1])])
        self.assertEqual(next(c for c in tl["cuts"] if c["id"] == self.c1)["group_id"], "new1")
        tl = native_save_groups(self.pid, before)
        self.assertEqual([(g["id"], g["cut_ids"]) for g in tl["groups"]], [(self.s1, [self.c1]), ("new1", [])])
        self.assertEqual([c["id"] for c in tl["cuts"]], [self.c1, self.c2])

    def test_new_cut_without_scene_or_after_goes_ungrouped_below_the_last_scene(self):
        """What New cut sends with no cut selected (native): just the pid."""
        self._new_scene("new1", "Scene 2")
        native_save_groups(self.pid, [*self._groups()[:1], {"id": "new1", "name": "Scene 2", "cut_ids": [self.c2]}])
        doc = self.store.add_cut(self.pid, scene_id=None, after=None)
        cid = next(c for c in doc["cuts"] if c not in (self.c1, self.c2))
        tl = self.store.to_timeline(self.pid)
        self.assertEqual([c["id"] for c in tl["cuts"]], [self.c1, self.c2, cid])
        self.assertEqual(next(c for c in tl["cuts"] if c["id"] == cid)["group_id"], "")
        self.assertEqual([g["id"] for g in tl["groups"]], [self.s1, "new1"])

    def test_add_scene_without_cuts_is_shown(self):
        self.store.add_scene(self.pid, "Scene 2")
        names = [g["name"] for g in self.store.to_timeline(self.pid)["groups"]]
        self.assertEqual(names, ["Scene 1", "Scene 2"])


if __name__ == "__main__":
    unittest.main()
