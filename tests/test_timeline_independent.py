"""0.9.78: the timeline track is stored apart from the Shots cut list (native projects)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_export
import gg_native_api as na
from gg_project import LocalStore
from gg_project.local_store import _atomic_write_json
from gg_project.timeline import place_clips, timeline_order

S2 = "s1730000000002"


class TimelineIndependentTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        self._old = na._STORE
        na.set_native_store(self.store)
        doc = self.store.create_project("T")
        self.pid = doc["id"]
        self.s1 = doc["scenes"][0]["id"]
        for _ in range(4):
            self.store.add_cut(self.pid, scene_id=self.s1)
        self.c1, self.c2, self.c3, self.c4, self.c5 = timeline_order(self.store.get_project(self.pid))
        # Scene 1 = c1 c2, Scene 2 = c3 c4, c5 ungrouped
        na.native_save_groups(self.pid, [
            {"id": self.s1, "name": "Scene 1", "cut_ids": [self.c1, self.c2], "collapsed": False},
            {"id": S2, "name": "Scene 2", "cut_ids": [self.c3, self.c4], "collapsed": False},
        ])
        self.cut_list = [self.c1, self.c2, self.c3, self.c4, self.c5]

    def tearDown(self):
        na.set_native_store(self._old)
        self._tmp.cleanup()

    def _doc(self) -> dict:
        return self.store.get_project(self.pid)

    def _tl(self) -> dict:
        return na.native_timeline(self.pid)

    @staticmethod
    def _row(tl: dict, cid: str) -> dict:
        return next(c for c in tl["cuts"] if c["id"] == cid)

    def _cut_list_state(self) -> dict:
        doc = self._doc()
        return {
            "scenes": [(s["id"], list(s["cut_order"])) for s in doc["scenes"]],
            "loose": list(doc["loose_order"]),
            "own": {cid: (c["sec"], c["in"]) for cid, c in doc["cuts"].items()},
        }

    # -- storage / back-compat ---------------------------------------------------------------------

    def test_no_stored_timeline_is_derived_from_cut_list(self):
        doc = self._doc()
        self.assertNotIn("timeline", doc)
        doc["cuts"][self.c2]["sec"] = 4.5  # a trim written into the cut by 0.9.77 and earlier
        doc["cuts"][self.c3]["sec"] = 2.0
        _atomic_write_json(self.store._project_path(self.pid), doc)
        tl = self._tl()
        self.assertEqual([c["id"] for c in tl["cuts"]], self.cut_list)
        self.assertEqual(tl["track_order"], self.cut_list)
        self.assertEqual([self._row(tl, c)["start"] for c in self.cut_list], [0.0, 3.0, 7.5, 9.5, 12.5])
        self.assertEqual(self._row(tl, self.c2)["sec"], 4.5)
        self.assertEqual(tl["total_sec"], 15.5)

    def test_timeline_edit_syncs_cut_sec_not_cut_list_order(self):
        before = self._cut_list_state()
        numbers = [c["number"] for c in self._tl()["cuts"]]
        track = [self.c5, self.c3, self.c1, self.c4, self.c2]
        tl = na.native_save_edit(self.pid, track, {
            self.c5: {"in": 0, "sec": 2.0, "start": 0},
            self.c3: {"in": 0, "sec": 1.5, "start": 4},
            self.c1: {"in": 0, "sec": 3.0, "start": 6},
            self.c4: {"in": 0, "sec": 3.0, "start": 9},
            self.c2: {"in": 0, "sec": 5.0, "start": 12},
        })
        after = self._cut_list_state()
        self.assertEqual(after["scenes"], before["scenes"])
        self.assertEqual(after["loose"], before["loose"])
        self.assertEqual(after["own"][self.c3][0], 1.5)
        self.assertEqual(after["own"][self.c2][0], 5.0)
        self.assertEqual([c["id"] for c in tl["cuts"]], self.cut_list)
        self.assertEqual([c["number"] for c in tl["cuts"]], numbers)
        self.assertEqual(tl["track_order"], track)
        self.assertEqual(self._doc()["timeline"]["order"], track)
        self.assertEqual(self._row(tl, self.c3)["start"], 4.0)
        self.assertEqual(self._row(tl, self.c3)["sec"], 1.5)
        self.assertEqual(self._row(tl, self.c3)["tl_sec"], 1.5)
        self.assertEqual(tl["total_sec"], 17.0)

    def test_clip_entry_holds_only_trim_and_start(self):
        na.native_save_edit(self.pid, self.cut_list, {self.c1: {"pick": "not-a-version"}})
        self.assertIsNone(self._doc()["cuts"][self.c1]["pick_version_id"])
        self.assertEqual(self._doc()["timeline"]["clips"][self.c1], {"in": 0.0, "sec": 3.0})

    def test_missing_start_keeps_stored_start_and_null_packs(self):
        na.native_save_edit(self.pid, self.cut_list, {self.c2: {"in": 0, "sec": 3.0, "start": 10}})
        tl = na.native_save_edit(self.pid, self.cut_list, {self.c2: {"in": 0, "sec": 2.0}})
        self.assertEqual(self._row(tl, self.c2)["start"], 10.0)
        tl = na.native_save_edit(self.pid, self.cut_list, {self.c2: {"start": None}})
        self.assertEqual(self._row(tl, self.c2)["start"], 3.0)
        self.assertEqual(self._row(tl, self.c2)["sec"], 2.0)

    # -- gaps / no overlap ----------------------------------------------------------------------------

    def test_gaps_count_and_overlap_is_pushed(self):
        tl = na.native_save_edit(self.pid, self.cut_list, {
            self.c1: {"sec": 2.0, "start": 0},
            self.c2: {"sec": 3.0, "start": 5},    # 3 s gap before it
            self.c3: {"sec": 1.0, "start": 6},    # overlaps c2 -> pushed to its end
        })
        starts = [self._row(tl, c)["start"] for c in self.cut_list]
        self.assertEqual(starts, [0.0, 5.0, 8.0, 9.0, 12.0])
        self.assertEqual(tl["total_sec"], 15.0)

    def test_place_clips(self):
        self.assertEqual(place_clips([(0.0, 3.0), (5.0, 2.0)]), ([0.0, 5.0], 7.0))
        self.assertEqual(place_clips([(0.0, 6.0), (5.0, 2.0)]), ([0.0, 6.0], 8.0))  # longer trim pushes
        self.assertEqual(place_clips([(None, 2.0), (None, 1.0), (4.0, 1.0)]), ([0.0, 2.0, 4.0], 5.0))

    # -- new / deleted / restored cuts ------------------------------------------------------------------

    def test_new_cut_appends_to_timeline_end(self):
        track = [self.c5, self.c4, self.c3, self.c2, self.c1]
        na.native_save_edit(self.pid, track, {self.c1: {"sec": 3.0, "start": 20}})
        out = na.native_add_cut(self.pid, self.s1, self.c1)
        new_id = out["cut"]["id"]
        tl = out["timeline"]
        self.assertEqual([c["id"] for c in tl["cuts"]][:3], [self.c1, new_id, self.c2])
        self.assertEqual(tl["track_order"], track + [new_id])
        self.assertEqual(self._row(tl, new_id)["start"], 23.0)

    def test_deleted_cut_drops_out_and_restore_appends(self):
        track = [self.c2, self.c1, self.c3, self.c4, self.c5]
        na.native_save_edit(self.pid, track, {c: {"sec": 3.0} for c in track})
        tl = na.native_delete_cuts(self.pid, [self.c2])["timeline"]
        self.assertNotIn(self.c2, tl["track_order"])
        self.assertNotIn(self.c2, self._doc()["timeline"]["clips"])
        self.assertEqual(self._row(tl, self.c1)["start"], 0.0)
        tl = na.native_restore_cuts(self.pid, [self.c2])["timeline"]
        self.assertEqual(tl["track_order"], [self.c1, self.c3, self.c4, self.c5, self.c2])
        self.assertEqual(self._row(tl, self.c2)["start"], 12.0)

    # -- reset ------------------------------------------------------------------------------------------

    def test_reset_rebuilds_from_cut_list(self):
        self.store.update_cut(self.pid, self.c1, {"planned_sec": 2.0})
        na.native_save_edit(self.pid, [self.c5, self.c4, self.c3, self.c2, self.c1], {
            self.c5: {"sec": 1.0, "start": 2},
            self.c2: {"sec": 0.5, "start": 30},
        })
        before = self._cut_list_state()
        tl = na.native_reset_timeline(self.pid)
        after = self._cut_list_state()
        self.assertEqual(after["scenes"], before["scenes"])
        self.assertEqual(after["loose"], before["loose"])
        self.assertEqual(after["own"][self.c1][0], 2.0)
        self.assertEqual(after["own"][self.c2][0], 3.0)
        self.assertEqual(tl["track_order"], self.cut_list)
        self.assertEqual([self._row(tl, c)["in"] for c in self.cut_list], [0.0] * 5)
        self.assertEqual([self._row(tl, c)["sec"] for c in self.cut_list], [2.0, 3.0, 3.0, 3.0, 3.0])
        self.assertEqual([self._row(tl, c)["start"] for c in self.cut_list], [0.0, 2.0, 5.0, 8.0, 11.0])
        self.assertEqual(tl["total_sec"], 14.0)
        journal = (self.store._journal_path(self.pid)).read_text(encoding="utf-8").splitlines()
        backup = [json.loads(x) for x in journal if '"timeline_backup"' in x]
        self.assertEqual(backup[-1]["data"]["order"][0], self.c5)

    # -- apply order to cuts ----------------------------------------------------------------------------

    def test_apply_order_reorders_cut_list_by_scene(self):
        track = [self.c4, self.c5, self.c2, self.c3, self.c1]
        na.native_save_edit(self.pid, track, {
            self.c4: {"sec": 3.0, "start": 0},
            self.c5: {"sec": 3.0, "start": 5},
            self.c2: {"sec": 3.0, "start": 8},
            self.c3: {"sec": 3.0, "start": 20},
            self.c1: {"sec": 3.0, "start": 23},
        })
        starts = {c["id"]: c["start"] for c in self._tl()["cuts"]}
        files = sorted(p.name for p in (Path(self._tmp.name) / "projects" / self.pid).rglob("*") if p.is_file())
        tl = na.native_apply_track_order(self.pid)
        # Scene 2 (first clip at 0 s) moves above Scene 1; each scene follows timeline order; c5 stays ungrouped last.
        self.assertEqual([c["id"] for c in tl["cuts"]], [self.c4, self.c3, self.c2, self.c1, self.c5])
        self.assertEqual([g["id"] for g in tl["groups"]], [S2, self.s1])
        self.assertEqual([c["number"] for c in tl["cuts"]], [1, 2, 3, 4, 5])
        self.assertEqual([c["cut_in_scene"] for c in tl["cuts"]][:4], [1, 2, 1, 2])
        self.assertEqual(tl["track_order"], track)
        self.assertEqual({c["id"]: c["start"] for c in tl["cuts"]}, starts)
        self.assertEqual(set(self._doc()["cuts"]), set(self.cut_list))
        after = sorted(p.name for p in (Path(self._tmp.name) / "projects" / self.pid).rglob("*") if p.is_file())
        self.assertEqual(after, files)

    def test_reorder_cuts_does_not_touch_timeline(self):
        na.native_save_edit(self.pid, self.cut_list, {self.c1: {"sec": 3.0, "start": 4}})
        track = self._doc()["timeline"]
        tl = na.native_reorder_cuts(self.pid, [self.c2, self.c1, self.c3, self.c4, self.c5])
        self.assertEqual([c["id"] for c in tl["cuts"]], [self.c2, self.c1, self.c3, self.c4, self.c5])
        self.assertEqual(self._doc()["timeline"], track)
        self.assertEqual(tl["track_order"], self.cut_list)

    # -- never-edited timeline (no doc["timeline"]) stays put when the cut list changes ----------------

    def test_reorder_cuts_never_edited_keeps_timeline_order(self):
        self.assertNotIn("timeline", self._doc())
        before = self.store.to_timeline(self.pid)
        self.store.reorder(self.pid, [self.c5, self.c4, self.c2, self.c1, self.c3])
        after = self.store.to_timeline(self.pid)
        self.assertEqual(after["track_order"], before["track_order"])
        self.assertEqual({c["id"]: c["start"] for c in after["cuts"]}, {c["id"]: c["start"] for c in before["cuts"]})
        self.assertNotEqual([c["id"] for c in after["cuts"]], self.cut_list)

    def test_scene_reorder_never_edited_keeps_timeline_order(self):
        tl = na.native_save_groups(self.pid, [
            {"id": S2, "name": "Scene 2", "cut_ids": [self.c3, self.c4], "collapsed": False},
            {"id": self.s1, "name": "Scene 1", "cut_ids": [self.c1, self.c2], "collapsed": False},
        ])
        self.assertEqual([c["id"] for c in tl["cuts"]], [self.c3, self.c4, self.c1, self.c2, self.c5])
        self.assertEqual(tl["track_order"], self.cut_list)

    def test_cut_into_and_out_of_ungrouped_goes_last_in_list_not_on_timeline(self):
        # 0.9.90: a cut dragged out of a scene joins the one Ungrouped block at the bottom of the cut
        # list, even if the client sends it between scenes; the timeline stays where it was.
        def move(groups, order):
            na.native_save_groups(self.pid, groups)
            return na.native_reorder_cuts(self.pid, order)

        for edited in (False, True):
            with self.subTest(edited=edited):
                if edited:
                    na.native_save_edit(self.pid, self.cut_list, {self.c1: {"sec": 3.0, "start": 4}})
                before = self._tl()
                tl = move([
                    {"id": self.s1, "name": "Scene 1", "cut_ids": [self.c1], "collapsed": False},
                    {"id": S2, "name": "Scene 2", "cut_ids": [self.c3, self.c4], "collapsed": False},
                ], [self.c1, self.c2, self.c3, self.c4, self.c5])
                self.assertEqual([c["id"] for c in tl["cuts"]], [self.c1, self.c3, self.c4, self.c2, self.c5])
                self.assertEqual(self._doc()["loose_order"], [self.c2, self.c5])
                self.assertEqual(tl["track_order"], before["track_order"])
                self.assertEqual({c["id"]: c["start"] for c in tl["cuts"]}, {c["id"]: c["start"] for c in before["cuts"]})
                tl = move([
                    {"id": self.s1, "name": "Scene 1", "cut_ids": [self.c1, self.c2], "collapsed": False},
                    {"id": S2, "name": "Scene 2", "cut_ids": [self.c3, self.c4], "collapsed": False},
                ], [self.c1, self.c2, self.c3, self.c4, self.c5])
                self.assertEqual([c["id"] for c in tl["cuts"]], self.cut_list)
                self.assertEqual(tl["track_order"], before["track_order"])
                self.assertEqual({c["id"]: c["start"] for c in tl["cuts"]}, {c["id"]: c["start"] for c in before["cuts"]})

    def test_insert_cut_never_edited_appends_to_timeline_end(self):
        out = na.native_add_cut(self.pid, self.s1, self.c1)
        new_id = out["cut"]["id"]
        self.assertEqual([c["id"] for c in out["timeline"]["cuts"]][:2], [self.c1, new_id])
        self.assertEqual(out["timeline"]["track_order"], self.cut_list + [new_id])

    def test_append_cut_never_edited_stays_derived(self):
        self.store.add_cut(self.pid)
        self.assertNotIn("timeline", self._doc())

    def test_apply_timeline_edit_never_edited_keeps_cut_list(self):
        before = self._cut_list_state()
        track = list(reversed(self.cut_list))
        self.store.apply_timeline_edit(self.pid, track, {})
        self.assertEqual(self._cut_list_state(), before)
        self.assertEqual(timeline_order(self._doc()), self.cut_list)
        self.assertEqual(self.store.to_timeline(self.pid)["track_order"], track)


class ExportPlanTests(unittest.TestCase):
    def test_gap_becomes_black_segment(self):
        a = {"id": "a", "start": 0.0, "sec": 1.0, "media": {"id": "x", "kind": "image"}, "in": 0}
        b = {"id": "b", "start": 2.0, "sec": 1.5, "media": None, "in": 0}
        plan = gg_export.export_plan([b, a], 24)  # native cuts come in cut list order, not time order
        self.assertEqual([(c.get("id"), f) for c, f in plan], [("a", 24), (None, 24), ("b", 36)])
        self.assertIs(plan[1][0], gg_export.GAP_CLIP)
        self.assertEqual(sum(f for _, f in plan), 84)

    def test_packed_timeline_matches_cumulative_frames(self):
        cuts = [{"id": str(i), "sec": s, "media": None, "in": 0} for i, s in enumerate((1.04, 2.02, 0.5))]
        plan = gg_export.export_plan(cuts, 25)
        bounds, at = [0], 0.0
        for c in cuts:
            at += c["sec"]
            bounds.append(round(at * 25))
        self.assertEqual([f for _, f in plan], [bounds[i + 1] - bounds[i] for i in range(3)])


if __name__ == "__main__":
    unittest.main()
