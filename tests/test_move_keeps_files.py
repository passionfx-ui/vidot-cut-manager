"""Moving cuts between scenes / reordering keeps version files, workflows and picks linked."""
from __future__ import annotations

import hashlib
import json
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_data as gd
import gg_native_api as na
import gg_sdk
import gg_template as gt
import gg_wfstore as wfs
from gg_project import LocalStore
from gg_project.timeline import timeline_order

WF_A = {"nodes": [{"id": 1, "type": "KSampler"}], "links": [], "version": 0.4}
WF_B = {"nodes": [{"id": 2, "type": "SaveImage"}], "links": [], "version": 0.4}
SCENE2_ID = "s1730000000000"   # UI-made scene ids are "s" + Date.now()
REGROUP_ID = "s1730000000999"


def _png_chunk(ctype: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(ctype + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + ctype + data + struct.pack(">I", crc)


def _png(path: Path, workflow: dict | None = None, tag: bytes = b"") -> Path:
    """1x1 PNG, optionally with the ComfyUI `workflow` tEXt chunk embedded."""
    out = wfs._PNG_SIG + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
    out += _png_chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\xff\xff" + tag))
    if workflow is not None:
        out += _png_chunk(b"tEXt", b"workflow\x00" + json.dumps(workflow).encode("utf-8"))
    out += _png_chunk(b"IEND", b"")
    path.write_bytes(out)
    return path


def _snapshot(base: Path) -> dict[str, str]:
    """relative path -> sha256 for every file under base."""
    if not base.is_dir():
        return {}
    return {
        p.relative_to(base).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(base.rglob("*")) if p.is_file()
    }


def _last_output(path: Path, prompt_id: str) -> dict:
    return {
        "output": {"path": str(path), "name": path.name, "from": "history", "prompt_id": prompt_id},
        "reason": "",
    }


class NativeMoveKeepsFilesTests(unittest.TestCase):
    """Native projects: the Shots sidebar saves a move as /gonggan/groups then /gonggan/edit."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root)
        self._old_store = na._STORE
        na.set_native_store(self.store)
        self.patches = [mock.patch.object(gt, "TEMPLATES_DIR", self.root / "templates")]
        for p in self.patches:
            p.start()

        doc = self.store.create_project("Move")
        self.pid = doc["id"]
        self.s1 = doc["scenes"][0]["id"]
        for _ in range(3):
            self.store.add_cut(self.pid, scene_id=self.s1)
        self.c1, self.c2, self.c3, self.c4 = timeline_order(self.store.get_project(self.pid))
        na.native_save_groups(self.pid, [
            {"id": self.s1, "name": "Scene 1", "cut_ids": [self.c1, self.c2], "collapsed": False},
            {"id": SCENE2_ID, "name": "Scene 2", "cut_ids": [self.c3, self.c4], "collapsed": False},
        ])

        # Two takes on c2 through the real "Send last output" path (workflow embedded in the PNG).
        self.vids = {}
        for wf, name in ((WF_A, "out_a.png"), (WF_B, "out_b.png")):
            src = _png(self.root / name, wf, tag=name.encode())
            with mock.patch.object(gg_sdk, "last_output_info", lambda s=src: _last_output(s, "p-" + s.stem)):
                res = na.native_send_last_output(self.pid, self.c2)
            self.assertTrue(res["ok"])
            self.vids[res["version"]["id"]] = wf

        # Pick the take that is NOT the timeline's newest-first fallback, so a lost pick is visible.
        tl = self.store.to_timeline(self.pid)
        row = self._row(tl, self.c2)
        fallback = row["versions_list"][0]["id"]
        self.pick = next(v for v in self.vids if v != fallback)
        self.other = fallback
        self._persist([c["id"] for c in tl["cuts"]], tl["groups"], picks={self.c2: self.pick})

        self.assertEqual(self._row(self.store.to_timeline(self.pid), self.c2)["media"]["id"], self.pick)
        self.paths = {vid: na.native_media_path(vid) for vid in self.vids}
        self.pdir = self.root / "projects" / self.pid
        self.files = self._files()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        na.set_native_store(self._old_store)
        self._tmp.cleanup()

    # -- helpers ---------------------------------------------------------------------------------

    @staticmethod
    def _row(tl: dict, cid: str) -> dict:
        return next(c for c in tl["cuts"] if c["id"] == cid)

    def _files(self) -> dict[str, str]:
        out = {}
        for sub in ("assets", "versions", "workflows"):
            out.update({f"{sub}/{k}": v for k, v in _snapshot(self.pdir / sub).items()})
        return out

    def _persist(self, order, groups, picks=None) -> dict:
        """Same two calls, same order and same clip payload as gonggan.js persistShotsReorder."""
        self.assertIsNotNone(na.native_save_groups(self.pid, groups))
        tl = self.store.to_timeline(self.pid)
        clips = {c["id"]: {"in": c["in"], "sec": c["sec"], "pick": c.get("pick") or None} for c in tl["cuts"]}
        for cid, vid in (picks or {}).items():
            clips[cid]["pick"] = vid
        out = na.native_save_edit(self.pid, order, clips)
        self.assertIsNotNone(out)
        return out

    def _groups(self, *pairs) -> list[dict]:
        names = {self.s1: "Scene 1", SCENE2_ID: "Scene 2", REGROUP_ID: "Scene 3"}
        return [{"id": gid, "name": names[gid], "cut_ids": list(ids), "collapsed": False} for gid, ids in pairs]

    def _assert_linked(self, tl: dict) -> None:
        # Files: nothing renamed, moved, rewritten, added or dropped.
        self.assertEqual(self._files(), self.files)
        for vid, wf in self.vids.items():
            path = na.native_media_path(vid)
            self.assertEqual(path, self.paths[vid])
            self.assertTrue(path.is_file())
            self.assertEqual(path.parent.name, self.c2)
            self.assertTrue((self.pdir / "versions" / self.c2 / f"{vid}.json").is_file())
            self.assertEqual(na.native_version_workflow(self.pid, self.c2, vid)["workflow"], wf)
        src = na.native_cut_source_workflow(self.pid, self.c2)
        self.assertEqual(src["source"], "stored")
        self.assertEqual(src["workflow"], self.vids[self.pick])
        self.assertEqual(self.store.get_project(self.pid)["cuts"][self.c2]["pick_version_id"], self.pick)
        row = self._row(tl, self.c2)
        self.assertEqual(row["media"]["id"], self.pick)
        self.assertEqual(row["pick"], self.pick)
        self.assertEqual(row["versions"], 2)
        self.assertEqual({v["id"] for v in row["versions_list"]}, set(self.vids))
        for cid in (self.c1, self.c3, self.c4):
            self.assertIsNone(self._row(tl, cid)["media"])

    # -- tests -----------------------------------------------------------------------------------

    def test_move_to_other_scene_and_reorder(self):
        order = [self.c1, self.c3, self.c2, self.c4]
        tl = self._persist(order, self._groups((self.s1, [self.c1]), (SCENE2_ID, [self.c3, self.c2, self.c4])))
        self.assertEqual([c["id"] for c in tl["cuts"]], order)
        row = self._row(tl, self.c2)
        self.assertEqual(row["group_id"], SCENE2_ID)
        self.assertEqual(self.store.get_project(self.pid)["cuts"][self.c2]["scene_id"], SCENE2_ID)
        self.assertEqual(row["cut_in_scene"], 2)
        self.assertEqual(self._row(tl, self.c4)["cut_in_scene"], 3)
        self.assertEqual(self._row(tl, self.c1)["cut_in_scene"], 1)
        self._assert_linked(tl)
        # Reading again from disk gives the same answer.
        self._assert_linked(self.store.to_timeline(self.pid))

    def test_move_there_and_back_restores_layout(self):
        before = self.store.to_timeline(self.pid)
        self._persist([self.c1, self.c3, self.c4, self.c2],
                      self._groups((self.s1, [self.c1]), (SCENE2_ID, [self.c3, self.c4, self.c2])))
        tl = self._persist([self.c1, self.c2, self.c3, self.c4],
                           self._groups((self.s1, [self.c1, self.c2]), (SCENE2_ID, [self.c3, self.c4])))
        self.assertEqual([c["id"] for c in tl["cuts"]], [c["id"] for c in before["cuts"]])
        self.assertEqual(tl["groups"], before["groups"])
        for a, b in zip(tl["cuts"], before["cuts"]):
            self.assertEqual((a["group_id"], a["cut_in_scene"], a["media"]), (b["group_id"], b["cut_in_scene"], b["media"]))
        self._assert_linked(tl)

    def test_move_scene_block_keeps_links(self):
        # moveScene (scene header drag): Scene 2 as one block before Scene 1, groups in the new scene order
        order = [self.c3, self.c4, self.c1, self.c2]
        tl = self._persist(order, self._groups((SCENE2_ID, [self.c3, self.c4]), (self.s1, [self.c1, self.c2])))
        self.assertEqual([c["id"] for c in tl["cuts"]], order)
        self.assertEqual([g["id"] for g in tl["groups"]], [SCENE2_ID, self.s1])
        self.assertEqual(
            [(self._row(tl, c)["group_id"], self._row(tl, c)["scene_index"], self._row(tl, c)["cut_in_scene"]) for c in order],
            [(SCENE2_ID, 1, 1), (SCENE2_ID, 1, 2), (self.s1, 2, 1), (self.s1, 2, 2)],
        )
        self.assertEqual(timeline_order(self.store.get_project(self.pid)), order)
        self._assert_linked(tl)
        self._assert_linked(self.store.to_timeline(self.pid))

        back = [self.c1, self.c2, self.c3, self.c4]
        tl = self._persist(back, self._groups((self.s1, [self.c1, self.c2]), (SCENE2_ID, [self.c3, self.c4])))
        self.assertEqual([c["id"] for c in tl["cuts"]], back)
        self.assertEqual([g["id"] for g in tl["groups"]], [self.s1, SCENE2_ID])
        self._assert_linked(tl)

    def test_scene_move_needs_groups_in_new_order(self):
        # The flat order alone cannot move a scene: the store lays scenes out in groups-list order.
        tl = self._persist([self.c3, self.c4, self.c1, self.c2],
                           self._groups((self.s1, [self.c1, self.c2]), (SCENE2_ID, [self.c3, self.c4])))
        self.assertEqual([c["id"] for c in tl["cuts"]], [self.c1, self.c2, self.c3, self.c4])
        self._assert_linked(tl)

    def test_ungroup_then_regroup(self):
        self._persist([self.c1, self.c3, self.c2, self.c4],
                      self._groups((self.s1, [self.c1]), (SCENE2_ID, [self.c3, self.c2, self.c4])))
        # ungroupSceneGroup: the same groups list without Scene 2
        tl = na.native_save_groups(self.pid, self._groups((self.s1, [self.c1])))
        self.assertEqual(self._row(tl, self.c2)["group_id"], "")
        self.assertEqual([c["id"] for c in tl["cuts"]], [self.c1, self.c3, self.c2, self.c4])
        self._assert_linked(tl)
        # createSceneGroup: a fresh scene id for the same cuts
        tl = na.native_save_groups(self.pid, self._groups((self.s1, [self.c1]), (REGROUP_ID, [self.c3, self.c2, self.c4])))
        self.assertEqual(self._row(tl, self.c2)["group_id"], REGROUP_ID)
        self.assertEqual(self._row(tl, self.c2)["cut_in_scene"], 2)
        self.assertEqual([c["id"] for c in tl["cuts"]], [self.c1, self.c3, self.c2, self.c4])
        self._assert_linked(tl)

    def test_ungroup_single_cut_keeps_links(self):
        # ungroupCuts([c2]): strip c2 from its scene; it becomes an ungrouped cut
        tl = self._persist([self.c1, self.c3, self.c4, self.c2],
                           self._groups((self.s1, [self.c1]), (SCENE2_ID, [self.c3, self.c4])))
        self.assertEqual(self._row(tl, self.c2)["group_id"], "")
        self.assertIsNone(self.store.get_project(self.pid)["cuts"][self.c2]["scene_id"])
        self._assert_linked(tl)
        tl = self._persist([self.c1, self.c2, self.c3, self.c4],
                           self._groups((self.s1, [self.c1, self.c2]), (SCENE2_ID, [self.c3, self.c4])))
        self.assertEqual(self._row(tl, self.c2)["group_id"], self.s1)
        self._assert_linked(tl)

    def test_send_last_output_after_move_lands_on_moved_cut(self):
        self._persist([self.c1, self.c3, self.c2, self.c4],
                      self._groups((self.s1, [self.c1]), (SCENE2_ID, [self.c3, self.c2, self.c4])))
        src = _png(self.root / "out_c.png", WF_A, tag=b"c")
        with mock.patch.object(gg_sdk, "last_output_info", lambda: _last_output(src, "p-c")):
            res = na.native_send_last_output(self.pid, self.c2)
        new_vid = res["version"]["id"]
        path = na.native_media_path(new_vid)
        self.assertEqual(path.parent.name, self.c2)
        tl = self.store.to_timeline(self.pid)
        row = self._row(tl, self.c2)
        self.assertEqual(row["versions"], 3)
        self.assertEqual(row["media"]["id"], self.pick)
        self.assertEqual(row["group_id"], SCENE2_ID)
        self.assertEqual(self.store.get_project(self.pid)["cuts"][self.c2]["pick_version_id"], self.pick)


class PackVersionsMoveKeepsFilesTests(unittest.TestCase):
    """Imported projects: takes live in versions/<pid>/<cut_id>/, workflows in workflows/<pid>/<cut_id>/."""

    PID = "proj1"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.root = root
        data = root / "data" / "demo"
        data.mkdir(parents=True)
        self.versions = root / "versions"
        self.workflows = root / "workflows"
        ws = {"projects": [{
            "id": self.PID,
            "name": "Imported",
            "cuts": [
                {"id": "cutA", "name": "a", "tl_sec": 3.0, "scene": "S1", "scene_id": "sc1"},
                {"id": "cutB", "name": "b", "tl_sec": 3.0, "scene": "S1", "scene_id": "sc1"},
                {"id": "cutC", "name": "c", "tl_sec": 3.0, "scene": "S2", "scene_id": "sc2"},
                {"id": "cutD", "name": "d", "tl_sec": 3.0, "scene": "S2", "scene_id": "sc2"},
            ],
        }]}
        (data / "_workspace.json").write_text(json.dumps(ws), encoding="utf-8")
        settings = {"data_root": str(root / "data"), "uid": "demo"}
        self.patches = [
            mock.patch.object(gd, "PACK_DIR", root),
            mock.patch.object(gd, "EDITS_DIR", root / "edits"),
            mock.patch.object(gd, "VERSIONS_DIR", self.versions),
            mock.patch.object(gd, "CACHE_DIR", root / "cache"),
            mock.patch.object(gd, "load_settings", lambda: settings),
            mock.patch.object(gt, "PACK_DIR", root),
            mock.patch.object(gt, "TEMPLATES_DIR", root / "templates"),
            mock.patch.object(wfs, "PACK_DIR", root),
            mock.patch.object(wfs, "VERSIONS_DIR", self.versions),
            mock.patch.object(wfs, "WORKFLOWS_DIR", self.workflows),
        ]
        for p in self.patches:
            p.start()

        tl = gd.timeline(self.PID)
        self.assertEqual([g["id"] for g in tl["groups"]], ["sc1", "sc2"])
        self.vids = {}
        for wf, name in ((WF_A, "out_a.png"), (WF_B, "out_b.png")):
            src = _png(root / name, tag=name.encode())
            with mock.patch.object(gg_sdk, "last_output_info", lambda s=src: _last_output(s, "p-" + s.stem)):
                res = gg_sdk.send_last_output(self.PID, "cutB")
            self.assertTrue(res["ok"])
            vid = res["version"]["id"]
            wfs.save_version_workflow(self.PID, "cutB", vid, wf, None, "generated")
            self.vids[vid] = wf
        # add_version made the newest take the pick; choose the other one in the version picker.
        newest = gd.load_edit(self.PID)["clips"]["cutB"]["pick"]
        self.pick = next(v for v in self.vids if v != newest)
        tl = gd.timeline(self.PID)
        clips = {c["id"]: {"in": c["in"], "sec": c["sec"], **({"pick": c["pick"]} if c.get("pick") else {})}
                 for c in tl["cuts"]}
        clips["cutB"]["pick"] = self.pick
        gd.save_edit(self.PID, [c["id"] for c in tl["cuts"]], clips)
        self.paths = {vid: gd.media_path(vid) for vid in self.vids}
        self.files = {**{f"versions/{k}": v for k, v in _snapshot(self.versions).items()},
                      **{f"workflows/{k}": v for k, v in _snapshot(self.workflows).items()}}

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self._tmp.cleanup()

    @staticmethod
    def _row(tl: dict, cid: str) -> dict:
        return next(c for c in tl["cuts"] if c["id"] == cid)

    def _move(self, order, groups) -> dict:
        self.assertIsNotNone(gd.save_groups(self.PID, groups))
        tl = gd.timeline(self.PID)
        clips = {c["id"]: {"in": c["in"], "sec": c["sec"], **({"pick": c["pick"]} if c.get("pick") else {})}
                 for c in tl["cuts"]}
        out = gd.save_edit(self.PID, order, clips)
        self.assertIsNotNone(out)
        return out

    def _assert_linked(self, tl: dict) -> None:
        files = {**{f"versions/{k}": v for k, v in _snapshot(self.versions).items()},
                 **{f"workflows/{k}": v for k, v in _snapshot(self.workflows).items()}}
        self.assertEqual(files, self.files)
        for vid, wf in self.vids.items():
            path = gd.media_path(vid)
            self.assertEqual(path, self.paths[vid])
            self.assertEqual(path.parent, (self.versions / self.PID / "cutB").resolve())
            self.assertTrue(path.is_file())
            self.assertEqual(wfs.get_version_workflow(self.PID, "cutB", vid)["workflow"], wf)
        self.assertEqual(wfs.latest_cut_workflow(self.PID, "cutB")["workflow"], self.vids[self.pick])
        self.assertEqual(gd.load_edit(self.PID)["clips"]["cutB"]["pick"], self.pick)
        row = self._row(tl, "cutB")
        self.assertEqual(row["media"]["id"], self.pick)
        self.assertEqual(row["pick"], self.pick)
        self.assertEqual(row["versions"], 2)

    def test_move_to_other_scene_and_reorder(self):
        order = ["cutA", "cutC", "cutB", "cutD"]
        tl = self._move(order, [
            {"id": "sc1", "name": "S1", "cut_ids": ["cutA"]},
            {"id": "sc2", "name": "S2", "cut_ids": ["cutC", "cutB", "cutD"]},
        ])
        self.assertEqual([c["id"] for c in tl["cuts"]], order)
        self.assertEqual(self._row(tl, "cutB")["group_id"], "sc2")
        self._assert_linked(tl)

    def test_ungroup_then_regroup(self):
        self._move(["cutA", "cutC", "cutB", "cutD"], [
            {"id": "sc1", "name": "S1", "cut_ids": ["cutA"]},
            {"id": "sc2", "name": "S2", "cut_ids": ["cutC", "cutB", "cutD"]},
        ])
        tl = gd.save_groups(self.PID, [{"id": "sc1", "name": "S1", "cut_ids": ["cutA"]}])
        self.assertEqual(self._row(tl, "cutB")["group_id"], "")
        self._assert_linked(tl)
        tl = gd.save_groups(self.PID, [
            {"id": "sc1", "name": "S1", "cut_ids": ["cutA"]},
            {"id": REGROUP_ID, "name": "S3", "cut_ids": ["cutC", "cutB", "cutD"]},
        ])
        self.assertEqual(self._row(tl, "cutB")["group_id"], REGROUP_ID)
        self.assertEqual([c["id"] for c in tl["cuts"]], ["cutA", "cutC", "cutB", "cutD"])
        self._assert_linked(tl)


if __name__ == "__main__":
    unittest.main()
