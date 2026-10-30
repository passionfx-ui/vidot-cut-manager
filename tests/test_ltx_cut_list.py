"""0.9.115/0.9.116: cut list -> cuts with the bundled LTX workflow (description = prompt, frame count injected);
0.9.116 strict [{cut, duration, description}] validation shared with the JS parser and AI Cut Split."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_ltx
import gg_native_api as na
import gg_wfnodes
from gg_project import LocalStore


def _node(graph: dict, nid: int) -> dict:
    return next(n for n in graph["nodes"] if n["id"] == nid)


def _cut(i: int, sec, description="A red fox runs through snow, tracking shot."):
    return {"cut": i, "duration": sec, "description": description}


def _errors(entries) -> list[str]:
    with unittest.TestCase().assertRaises(gg_ltx.CutListError) as cm:
        gg_ltx.validate_cut_list(entries)
    return cm.exception.errors


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
    def test_sorted_by_cut_and_renumbered(self):
        rows = gg_ltx.validate_cut_list([_cut(5, 3, "B"), _cut(2, 0.5, "A")])
        self.assertEqual([(r["cut"], r["description"], r["duration"]) for r in rows], [(1, "A", 0.5), (2, "B", 3.0)])
        self.assertEqual(gg_ltx.public_cuts(rows), [{"cut": 1, "duration": 0.5, "description": "A"},
                                                    {"cut": 2, "duration": 3.0, "description": "B"}])

    def test_description_is_name_caption_and_prompt(self):
        rows = gg_ltx.validate_cut_list([_cut(1, 2, "  line one\nline two " + "x" * 100 + "  ")])
        r = rows[0]
        self.assertEqual(r["prompt"], r["caption"])
        self.assertEqual(r["caption"], r["description"])
        self.assertNotIn("\n", r["description"])
        self.assertTrue(r["description"].startswith("line one line two x"))
        self.assertEqual(r["name"], r["description"][:80])
        self.assertEqual(r["sec"], 2.0)

    def test_content_and_ltx_prompt_are_aliases(self):
        rows = gg_ltx.validate_cut_list([
            {"cut": 1, "duration": 2, "content": "Short", "ltx_prompt": "Long paragraph"},
            {"cut": 2, "duration": 2, "ltx_prompt": "Only prompt"},
            {"cut": 3, "duration": 2, "description": "Desc", "content": "ignored"},
        ])
        self.assertEqual([r["description"] for r in rows], ["Short", "Only prompt", "Desc"])

    def test_list_level_errors(self):
        self.assertIn("JSON array", _errors(None)[0])
        self.assertIn("JSON array", _errors({"cut": 1})[0])
        self.assertEqual(_errors([]), ["The cut list is empty."])
        self.assertIn("At most 200", _errors([_cut(i + 1, 1) for i in range(201)])[0])

    def test_every_problem_names_item_and_field(self):
        errs = _errors([
            _cut(1, 2),
            {"cut": 2, "duration": 4, "description": "x"},
            {"cut": "3", "duration": "2", "description": ""},
            "str",
            {"duration": 1, "description": 5},
            _cut(1, 1),
            {"cut": 7, "duration": 0.2, "description": "y" * 301},
            {"cut": 1.5, "duration": True, "description": "z"},
        ])
        expected = [
            'Item 2 (cut 2): "duration" must be between 0.5 and 3 seconds (got 4).',
            'Item 3: "cut" must be a whole number from 1 (got "3").',
            'Item 3: "duration" must be a number of seconds (got "2").',
            'Item 3: "description" is missing.',
            'Item 4: must be an object like {"cut": 1, "duration": 2, "description": "..."}.',
            'Item 5: "cut" is missing.',
            'Item 5: "description" must be text (got 5).',
            'Item 6 (cut 1): "cut" 1 is used twice (also item 1).',
            'Item 7 (cut 7): "duration" must be between 0.5 and 3 seconds (got 0.2).',
            'Item 7 (cut 7): "description" is too long (301 characters, max 300).',
            'Item 8: "cut" must be a whole number from 1 (got 1.5).',
            'Item 8: "duration" must be a number of seconds (got true).',
        ]
        self.assertEqual(errs, expected)

    def test_error_message_is_all_lines(self):
        with self.assertRaises(ValueError) as cm:
            gg_ltx.validate_cut_list([_cut(1, 9), _cut(2, 9)])
        self.assertEqual(str(cm.exception).count("\n"), 1)


class ExtractTests(unittest.TestCase):
    def test_bare_array_object_wrapper_and_prose(self):
        arr = [_cut(1, 2)]
        self.assertEqual(gg_ltx.extract_cut_items(json.dumps(arr)), arr)
        self.assertEqual(gg_ltx.extract_cut_items(json.dumps({"cuts": arr})), arr)
        self.assertEqual(gg_ltx.extract_cut_items(json.dumps({"shots": arr, "title": "x"})), arr)
        self.assertEqual(gg_ltx.extract_cut_items(json.dumps(arr[0])), arr)
        text = "Sure!\n```json\n" + json.dumps(arr) + "\n```\nEnjoy [really]."
        self.assertEqual(gg_ltx.extract_cut_items(text), arr)

    def test_no_array(self):
        for bad in ("no json here", '{"a": 1, "b": 2}', '[{"cut": 1,}]'):
            with self.assertRaises(gg_ltx.CutListError):
                gg_ltx.extract_cut_items(bad)


class PromptTests(unittest.TestCase):
    def test_prompt_asks_for_the_simple_schema(self):
        p = gg_ltx.CUT_SPLIT_PROMPT
        for key in ('"cut"', '"duration"', '"description"'):
            self.assertIn(key, p)
        self.assertNotIn("ltx_prompt", p)
        self.assertIn("never more than 3", p)
        self.assertTrue(p.rstrip().endswith("STORY:"))


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
        res = na.native_add_cut_list(self.pid, [_cut(2, 1.5, "Second shot"), _cut(1, 3, "First shot")], after=self.first)
        ids = res["cut_ids"]
        self.assertEqual(len(ids), 2)
        doc = self.store.get_project(self.pid)
        order = doc["scenes"][0]["cut_order"]
        self.assertEqual(order, [self.first, *ids])
        c1, c2 = (doc["cuts"][i] for i in ids)
        self.assertEqual((c1["name"], c1["caption"], c1["planned_sec"], c1["sec"], c1["prompt"]),
                         ("First shot", "First shot", 3.0, 3.0, "First shot"))
        self.assertEqual((c2["name"], c2["planned_sec"], c2["prompt"]), ("Second shot", 1.5, "Second shot"))
        wf = self.store.get_blob(self.pid, c2["workflow_sha"])
        self.assertEqual(gg_wfnodes.prompt_text(wf), "Second shot")
        self.assertFalse(any("LTX" in str(n.get("type")) for n in wf["nodes"]), "0.9.125: project Image template")
        src = na.native_cut_source_workflow(self.pid, ids[0])
        self.assertEqual((src["source"], src["kind"]), ("stored", "ui"))
        self.assertEqual([c["id"] for c in res["timeline"]["cuts"]][-2:], ids)

    def test_i2v_and_loose_without_after(self):
        res = na.native_add_cut_list(self.pid, [_cut(1, 2)], workflow="i2v")
        cid = res["cut_ids"][0]
        doc = self.store.get_project(self.pid)
        self.assertIn(cid, doc["loose_order"])
        wf = self.store.get_blob(self.pid, doc["cuts"][cid]["workflow_sha"])
        self.assertFalse(any(n["type"] == "LTXVImgToVideo" for n in wf["nodes"]), "workflow is ignored: Image template")

    def test_invalid_list_adds_nothing(self):
        with self.assertRaises(ValueError) as cm:
            na.native_add_cut_list(self.pid, [_cut(1, 2), _cut(2, 2, ""), _cut(3, 5)])
        self.assertIn('Item 2 (cut 2): "description" is missing.', str(cm.exception))
        self.assertIn('Item 3 (cut 3): "duration"', str(cm.exception))
        self.assertEqual(len(self.store.get_project(self.pid)["cuts"]), 1)

    def test_old_schema_still_creates_cuts(self):
        res = na.native_add_cut_list(self.pid, [{"cut": 1, "duration": 2, "content": "Old", "ltx_prompt": "Long"}])
        c = self.store.get_project(self.pid)["cuts"][res["cut_ids"][0]]
        self.assertEqual((c["name"], c["prompt"]), ("Old", "Old"))


if __name__ == "__main__":
    unittest.main()
