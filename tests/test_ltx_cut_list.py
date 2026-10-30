"""0.9.115: Paste Cut List -> cuts with the bundled LTX workflow (prompt + frame count injected)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_ltx
import gg_native_api as na
from gg_project import LocalStore


def _node(graph: dict, nid: int) -> dict:
    return next(n for n in graph["nodes"] if n["id"] == nid)


def _cut(i: int, sec, content="A fox runs", prompt="A red fox runs through snow, tracking shot."):
    return {"cut": i, "duration": sec, "content": content, "ltx_prompt": prompt}


class FramesTests(unittest.TestCase):
    def test_frames_are_multiple_of_8_plus_1(self):
        self.assertEqual(gg_ltx.frames_for_duration(3, 24), 73)
        self.assertEqual(gg_ltx.frames_for_duration(2, 24), 49)
        self.assertEqual(gg_ltx.frames_for_duration(0.5, 24), 17)
        self.assertEqual(gg_ltx.frames_for_duration(1.5, 24), 41)
        self.assertEqual(gg_ltx.frames_for_duration(4, 25), 73)
        for sec in (0.5, 0.7, 1.3, 2.25, 3):
            self.assertEqual(gg_ltx.frames_for_duration(sec, 24) % 8, 1)

    def test_frames_never_below_9(self):
        self.assertEqual(gg_ltx.frames_for_duration(0.1, 24), 9)

    def test_clamp_duration(self):
        self.assertEqual(gg_ltx.clamp_duration(10), 3.0)
        self.assertEqual(gg_ltx.clamp_duration(0.1), 0.5)
        self.assertEqual(gg_ltx.clamp_duration(1.234), 1.23)
        for bad in ("2", None, True, float("nan")):
            with self.assertRaises(ValueError):
                gg_ltx.clamp_duration(bad)


class InjectTests(unittest.TestCase):
    def test_t2v_prompt_and_length(self):
        base = gg_ltx.load_ltx_workflow("t2v")
        self.assertEqual(gg_ltx.workflow_fps(base), 24.0)
        g = gg_ltx.inject_ltx(base, "A cat jumps.", 2)
        self.assertEqual(_node(g, 6)["widgets_values"][0], "A cat jumps.")
        self.assertNotEqual(_node(g, 7)["widgets_values"][0], "A cat jumps.")  # negative untouched
        self.assertEqual(_node(g, 70)["widgets_values"], [768, 512, 49, 1])
        self.assertEqual(_node(base, 70)["widgets_values"][2], 73, "the loaded example is not mutated")

    def test_i2v_prompt_and_length(self):
        g = gg_ltx.inject_ltx(gg_ltx.load_ltx_workflow("i2v"), "Waves crash.", 3)
        self.assertEqual(_node(g, 6)["widgets_values"][0], "Waves crash.")
        self.assertEqual(_node(g, 95)["widgets_values"][2], 73)

    def test_positive_found_by_link_not_order(self):
        base = gg_ltx.load_ltx_workflow("t2v")
        for n in base["nodes"]:
            n.pop("title", None)
        base["nodes"].sort(key=lambda n: n["id"] != 7)  # negative encoder first
        g = gg_ltx.inject_ltx(base, "P", 1)
        self.assertEqual(_node(g, 6)["widgets_values"][0], "P")
        self.assertNotEqual(_node(g, 7)["widgets_values"][0], "P")

    def test_fps_fallbacks(self):
        g = gg_ltx.load_ltx_workflow("t2v")
        g["nodes"] = [n for n in g["nodes"] if n["type"] != "SaveAnimatedWEBP"]
        self.assertEqual(gg_ltx.workflow_fps(g), 24.0)
        g["nodes"] = [n for n in g["nodes"] if n["type"] != "LTXVConditioning"]
        self.assertEqual(gg_ltx.workflow_fps(g), 24.0)

    def test_api_format(self):
        api = {
            "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "old", "clip": ["38", 0]}},
            "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg", "clip": ["38", 0]}},
            "69": {"class_type": "LTXVConditioning", "inputs": {"positive": ["6", 0], "negative": ["7", 0], "frame_rate": 25}},
            "70": {"class_type": "EmptyLTXVLatentVideo", "inputs": {"width": 768, "height": 512, "length": 97, "batch_size": 1}},
            "41": {"class_type": "SaveAnimatedWEBP", "inputs": {"fps": 24}},
        }
        g = gg_ltx.inject_ltx(api, "new", 1)
        self.assertEqual(g["6"]["inputs"]["text"], "new")
        self.assertEqual(g["7"]["inputs"]["text"], "neg")
        self.assertEqual(g["70"]["inputs"]["length"], 25)

    def test_unknown_kind(self):
        with self.assertRaises(ValueError):
            gg_ltx.load_ltx_workflow("nope")


class ValidateTests(unittest.TestCase):
    def test_sorted_by_cut_and_clamped(self):
        rows = gg_ltx.validate_cut_list([_cut(2, 9, "B"), _cut(1, 0.2, "A")])
        self.assertEqual([r["name"] for r in rows], ["A", "B"])
        self.assertEqual([r["sec"] for r in rows], [0.5, 3.0])

    def test_name_is_one_line_80_chars(self):
        rows = gg_ltx.validate_cut_list([_cut(1, 2, "line one\nline two " + "x" * 100)])
        self.assertNotIn("\n", rows[0]["name"])
        self.assertLessEqual(len(rows[0]["name"]), 80)
        self.assertTrue(rows[0]["caption"].startswith("line one\nline two"))

    def test_rejects_bad_entries(self):
        for bad in ([], None, [_cut(1, 2, "")], [_cut(1, 2, prompt=" ")], [_cut(1, "x")], ["str"]):
            with self.assertRaises(ValueError):
                gg_ltx.validate_cut_list(bad)


class AddCutListTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self.tmp.name))
        na.set_native_store(self.store)
        self.pid = self.store.create_project("P")["id"]
        self.first = next(iter(self.store.get_project(self.pid)["cuts"]))

    def tearDown(self):
        na.set_native_store(None)
        self.tmp.cleanup()

    def test_creates_cuts_in_order_with_fields_and_workflow(self):
        res = na.native_add_cut_list(self.pid, [_cut(2, 1.5, "Second", "P2"), _cut(1, 3, "First", "P1")], after=self.first)
        ids = res["cut_ids"]
        self.assertEqual(len(ids), 2)
        doc = self.store.get_project(self.pid)
        order = doc["scenes"][0]["cut_order"]
        self.assertEqual(order, [self.first, *ids])
        c1, c2 = (doc["cuts"][i] for i in ids)
        self.assertEqual((c1["name"], c1["caption"], c1["planned_sec"], c1["sec"], c1["prompt"]), ("First", "First", 3.0, 3.0, "P1"))
        self.assertEqual((c2["name"], c2["planned_sec"], c2["prompt"]), ("Second", 1.5, "P2"))
        wf = self.store.get_blob(self.pid, c2["workflow_sha"])
        self.assertEqual(_node(wf, 6)["widgets_values"][0], "P2")
        self.assertEqual(_node(wf, 70)["widgets_values"][2], 41)
        src = na.native_cut_source_workflow(self.pid, ids[0])
        self.assertEqual((src["source"], src["kind"]), ("stored", "ui"))
        self.assertEqual([c["id"] for c in res["timeline"]["cuts"]][-2:], ids)

    def test_i2v_and_loose_without_after(self):
        res = na.native_add_cut_list(self.pid, [_cut(1, 2)], workflow="i2v")
        cid = res["cut_ids"][0]
        doc = self.store.get_project(self.pid)
        self.assertIn(cid, doc["loose_order"])
        wf = self.store.get_blob(self.pid, doc["cuts"][cid]["workflow_sha"])
        self.assertTrue(any(n["type"] == "LTXVImgToVideo" for n in wf["nodes"]))

    def test_invalid_list_adds_nothing(self):
        with self.assertRaises(ValueError):
            na.native_add_cut_list(self.pid, [_cut(1, 2), _cut(2, 2, "")])
        self.assertEqual(len(self.store.get_project(self.pid)["cuts"]), 1)


if __name__ == "__main__":
    unittest.main()
