"""0.9.117: built-in default templates, project Image / Video templates, prompt / start image node rules and
Image to Video (SDK runner never called, nothing rendered)."""
from __future__ import annotations

import json
import re
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

import gg_ltx
import gg_native_api as na
import gg_sdk
import gg_template
import gg_wfconvert
import gg_wfnodes as wn
from gg_project import LocalStore
from gg_project.project_settings import DEFAULT_PROJECT_SETTINGS, normalize_settings


def _node(graph: dict, nid: int) -> dict:
    return next(n for n in graph["nodes"] if n["id"] == nid)


def _png(path: Path) -> Path:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IEND", b""))
    return path


def _animated_webp(path: Path) -> Path:
    frame = b"ANMF" + struct.pack("<I", 16) + b"\x00" * 12 + (40).to_bytes(3, "little") + b"\x00"
    body = b"VP8X" + struct.pack("<I", 10) + b"\x02" + b"\x00" * 9 + frame * 2
    path.write_bytes(b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body)
    return path


class BuiltinListTests(unittest.TestCase):
    def test_listing_order_refs_and_labels(self):
        self.assertEqual([(t["ref"], t["label"], t["kind"]) for t in gg_template.list_builtin_templates()], [
            ("builtin:image", "Image (default)", "image"),
            ("builtin:video-ltx", "Video LTX (default)", "video"),
            ("builtin:video-ltx-t2v", "Video LTX text-to-video", "video"),
        ])
        self.assertEqual(gg_template.template_label("builtin:video-ltx"), "Video LTX (default)")
        self.assertEqual(gg_template.template_label("my/flow.json"), "my/flow.json")

    def test_same_list_as_js(self):
        js = (REPO / "web" / "gg_template_pick_core.js").read_text(encoding="utf-8")
        body = re.search(r"export const BUILTIN_TEMPLATES = \[(.*?)\];", js, re.S).group(1)
        pairs = re.findall(r'value: "([^"]+)", label: "([^"]+)"', body)
        self.assertEqual(pairs, [(t["ref"], t["label"]) for t in gg_template.list_builtin_templates()])
        self.assertIn('DEFAULT_IMAGE_TEMPLATE = "builtin:image"', js)
        self.assertIn('DEFAULT_VIDEO_TEMPLATE = "builtin:video-ltx"', js)

    def test_builtin_refs_resolve_and_unknown_ones_do_not(self):
        for t in gg_template.list_builtin_templates():
            self.assertTrue(gg_template.workflow_ref_exists(t["ref"]))
            self.assertTrue(gg_template._is_ui_workflow(gg_template.read_workflow_ref(t["ref"])))
        self.assertFalse(gg_template.workflow_ref_exists("builtin:nope"))
        with self.assertRaises(ValueError):
            gg_template.read_workflow_ref("builtin:nope")

    def test_image_default_is_z_image_turbo(self):
        g = gg_template.read_workflow_ref("builtin:image")
        by_type = {n["type"]: n for n in g["nodes"]}
        self.assertEqual(by_type["UNETLoader"]["widgets_values"][0], "z_image_turbo_bf16.safetensors")
        self.assertEqual(by_type["CLIPLoader"]["widgets_values"][:2], ["qwen_3_4b.safetensors", "lumina2"])
        self.assertEqual(by_type["VAELoader"]["widgets_values"], ["ae.safetensors"])
        self.assertEqual(by_type["ModelSamplingAuraFlow"]["widgets_values"], [3])
        self.assertEqual(by_type["EmptySD3LatentImage"]["widgets_values"][:2], [1024, 576])
        self.assertEqual(by_type["KSampler"]["widgets_values"][2:6], [8, 1, "res_multistep", "simple"])
        self.assertIn("SaveImage", by_type)
        nid, prompt = wn.find_prompt_node(g)
        self.assertEqual((prompt["type"], prompt["title"]), ("CLIPTextEncode", "Prompt"))
        api = gg_wfconvert.ui_to_api(g, mappings={})
        self.assertEqual(api["8"]["inputs"]["positive"], [nid, 0])
        self.assertEqual({k: api["8"]["inputs"][k] for k in ("steps", "cfg", "sampler_name", "scheduler", "denoise")},
                         {"steps": 8, "cfg": 1, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1})
        self.assertEqual(api["4"]["inputs"], {"shift": 3, "model": ["1", 0]})
        self.assertEqual(api["7"]["inputs"], {"width": 1024, "height": 576, "batch_size": 1})

    def test_video_default_is_ltx_i2v(self):
        g = gg_template.read_workflow_ref("builtin:video-ltx")
        self.assertEqual(wn.find_start_image_node(g)[1]["title"], "Start Image")
        self.assertEqual(wn.find_prompt_node(g)[1]["title"], "Prompt")
        self.assertLessEqual(_node(g, 95)["widgets_values"][2], 73)
        self.assertEqual(gg_ltx.workflow_fps(g), 24.0)
        self.assertEqual(_node(g, 71)["widgets_values"][0], 8)
        self.assertEqual(_node(g, 72)["widgets_values"][3], 1)
        t2v = gg_template.read_workflow_ref("builtin:video-ltx-t2v")
        self.assertTrue(any(n["type"] == "EmptyLTXVLatentVideo" for n in t2v["nodes"]))


def _ui(nodes, links=()):
    return {"nodes": [{"mode": 0, **n} for n in nodes], "links": [list(x) for x in links]}


class PromptNodeTests(unittest.TestCase):
    def test_titled_prompt_wins_over_positive_link(self):
        g = _ui([{"id": 1, "type": "CLIPTextEncode", "widgets_values": ["a"]},
                 {"id": 2, "type": "PrimitiveStringMultiline", "title": " prompt ", "widgets_values": ["b"]},
                 {"id": 3, "type": "KSampler", "inputs": [{"name": "model"}, {"name": "positive", "link": 9}]}],
                [(9, 1, 0, 3, 1, "CONDITIONING")])
        self.assertEqual(wn.find_prompt_node(g)[0], "2")
        wn.set_prompt(g, "new")
        self.assertEqual((_node(g, 1)["widgets_values"], _node(g, 2)["widgets_values"]), (["a"], ["new"]))

    def test_positive_encoder_when_nothing_is_titled(self):
        g = _ui([{"id": 7, "type": "CLIPTextEncode", "widgets_values": ["neg"]},
                 {"id": 6, "type": "CLIPTextEncode", "widgets_values": ["pos"]},
                 {"id": 3, "type": "KSampler", "inputs": [{"name": "positive", "link": 1}, {"name": "negative", "link": 2}]}],
                [(1, 6, 0, 3, 0, "CONDITIONING"), (2, 7, 0, 3, 1, "CONDITIONING")])
        self.assertEqual(wn.find_prompt_node(g)[0], "6")
        self.assertEqual(wn.prompt_text(g), "pos")

    def test_api_format(self):
        api = {"1": {"class_type": "CLIPTextEncode", "inputs": {"text": "x"}},
               "2": {"class_type": "StringNode", "inputs": {"value": "y"}, "_meta": {"title": "Prompt"}},
               "3": {"class_type": "KSampler", "inputs": {"positive": ["1", 0]}}}
        wn.set_prompt(api, "z")
        self.assertEqual((api["1"]["inputs"]["text"], api["2"]["inputs"]["value"]), ("x", "z"))
        del api["2"]
        self.assertEqual(wn.find_prompt_node(api)[0], "1")

    def test_no_guessing(self):
        lone = _ui([{"id": 1, "type": "CLIPTextEncode", "widgets_values": ["a"]}])
        with self.assertRaises(wn.NodeNotFound) as cm:
            wn.find_prompt_node(lone)
        self.assertEqual(str(cm.exception), wn.PROMPT_MISSING)
        two = _ui([{"id": 1, "type": "CLIPTextEncode", "title": "Prompt"}, {"id": 2, "type": "CLIPTextEncode", "title": "Prompt"}])
        with self.assertRaisesRegex(wn.NodeNotFound, "More than one node is titled Prompt"):
            wn.find_prompt_node(two)
        self.assertEqual(wn.prompt_text(lone), "")


class StartImageNodeTests(unittest.TestCase):
    def test_titled_node_wins(self):
        g = _ui([{"id": 1, "type": "LoadImage"}, {"id": 2, "type": "LoadImage", "title": "Start Image"}])
        self.assertEqual(wn.find_start_image_node(g)[0], "2")

    def test_single_load_image(self):
        g = _ui([{"id": 1, "type": "LoadImage"}, {"id": 2, "type": "LoadImage", "mode": 4}])
        self.assertEqual(wn.find_start_image_node(g)[0], "1", "muted nodes do not count")
        with self.assertRaises(wn.NodeNotFound):
            wn.find_start_image_node(g, titled_only=True)

    def test_none_or_two_load_images_is_an_error(self):
        for g in (_ui([{"id": 1, "type": "LoadImage"}, {"id": 2, "type": "LoadImage"}]), _ui([{"id": 1, "type": "KSampler"}]), {}):
            with self.assertRaises(wn.NodeNotFound) as cm:
                wn.find_start_image_node(g)
            self.assertEqual(str(cm.exception), "Start image node not found. Rename the input node to Start Image.")

    def test_api_set_start_image(self):
        api = {"5": {"class_type": "LoadImage", "inputs": {"image": "fox.jpg"}, "_meta": {"title": "Start Image"}}}
        self.assertEqual(wn.set_start_image(api, "gonggan/a.png"), "5")
        self.assertEqual(api["5"]["inputs"]["image"], "gonggan/a.png")
        with self.assertRaises(ValueError):
            wn.set_start_image(_ui([{"id": 1, "type": "LoadImage"}]), "x.png")


class ProjectDefaultsBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root / "pack")
        na.set_native_store(self.store)
        self.input_dir = self.root / "comfy_input"
        self.regen_dir = self.root / "regen"
        self._patches = [
            mock.patch.object(na, "_comfy_input_dir", lambda: self.input_dir),
            mock.patch.object(gg_sdk, "REGEN_DIR", self.regen_dir),
            mock.patch.object(gg_wfconvert, "_class_mappings", lambda: {}),
            mock.patch.object(gg_template, "user_workflows_dir", lambda: self.root / "user_wf"),
            mock.patch.object(gg_template, "TEMPLATES_DIR", self.root / "templates"),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in reversed(self._patches):
            p.stop()
        na.set_native_store(None)
        self._tmp.cleanup()

    def new_project(self, settings=None, template_ref=None) -> str:
        return na.create_native_project("Film", template_ref, settings)["project"]["id"]

    def cut_graph(self, pid: str, cut_id: str) -> dict:
        return self.store.get_blob(pid, self.store.get_project(pid)["cuts"][cut_id]["workflow_sha"])

    def user_workflow(self, rel: str, graph: dict) -> str:
        f = self.root / "user_wf" / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(graph), encoding="utf-8")
        return rel


class ProjectDefaultsTests(ProjectDefaultsBase):
    def test_settings_defaults_and_clamp(self):
        self.assertEqual((DEFAULT_PROJECT_SETTINGS["image_template"], DEFAULT_PROJECT_SETTINGS["video_template"]),
                         ("builtin:image", "builtin:video-ltx"))
        s = normalize_settings({"image_template": "  ", "video_template": "a\\b.json"})
        self.assertEqual((s["image_template"], s["video_template"]), ("builtin:image", "a/b.json"))

    def test_new_project_saves_templates_and_first_cut_uses_image_template(self):
        pid = self.new_project({"video_template": "builtin:video-ltx-t2v"})
        doc = self.store.get_project(pid)
        s = self.store.to_timeline(pid)["project"]["settings"]
        self.assertEqual((s["image_template"], s["video_template"]), ("builtin:image", "builtin:video-ltx-t2v"))
        first = next(iter(doc["cuts"]))
        self.assertEqual(self.cut_graph(pid, first), gg_template.read_workflow_ref("builtin:image"))

    def test_unknown_template_is_refused(self):
        with self.assertRaisesRegex(ValueError, "Video template not found: nope.json"):
            self.new_project({"video_template": "nope.json"})
        pid = self.new_project()
        with self.assertRaisesRegex(ValueError, "Image template not found"):
            na.native_update_project(pid, {"settings": {"image_template": "builtin:nope"}})
        rel = self.user_workflow("mine/img.json", gg_template.read_workflow_ref("builtin:image"))
        na.native_update_project(pid, {"settings": {"image_template": rel}})
        self.assertEqual(self.store.to_timeline(pid)["project"]["settings"]["image_template"], rel)

    def test_new_cut_uses_image_template_unless_a_default_template_is_linked(self):
        img = {"nodes": [{"id": 1, "type": "CLIPTextEncode", "title": "Prompt", "widgets_values": ["mine"]}], "links": []}
        pid = self.new_project({"image_template": self.user_workflow("img.json", img)})
        res = na.native_add_cut(pid, None, None)
        self.assertTrue(res["template_copied"])
        self.assertEqual(self.cut_graph(pid, res["cut"]["id"]), img)
        linked = self.user_workflow("linked.json", {"nodes": [{"id": 9, "type": "X"}], "links": []})
        na.native_set_template_ref(pid, linked)
        res = na.native_add_cut(pid, None, None)
        self.assertEqual(self.cut_graph(pid, res["cut"]["id"])["nodes"][0]["id"], 9, "Default template overrides")

    def test_cut_list_uses_image_template(self):
        """0.9.125: AI Make Cut cuts start from the Image template, even with workflow="i2v"."""
        img = self.user_workflow("img.json", {"nodes": [
            {"id": 3, "type": "CLIPTextEncode", "title": "Prompt", "widgets_values": ["old"]},
            {"id": 4, "type": "SaveImage"}], "links": []})
        pid = self.new_project({"image_template": img, "video_template": "builtin:video-ltx-t2v"})
        for wf in (None, "i2v"):
            ids = na.native_add_cut_list(pid, [{"cut": 1, "duration": 2, "description": "Fox"}], workflow=wf)["cut_ids"]
            g = self.cut_graph(pid, ids[0])
            self.assertEqual([n["id"] for n in g["nodes"]], [3, 4])
            self.assertEqual(_node(g, 3)["widgets_values"][0], "Fox")

    def test_cut_list_with_template_without_prompt_node(self):
        bad = self.user_workflow("v.json", {"nodes": [{"id": 1, "type": "SaveImage"}], "links": []})
        pid = self.new_project({"image_template": bad})
        with self.assertRaisesRegex(ValueError, "Image template: Prompt node not found"):
            na.native_add_cut_list(pid, [{"cut": 1, "duration": 2, "description": "Fox"}])

    def test_empty_cut_runs_image_template_with_its_caption(self):
        pid = self.new_project()
        before = set(self.store.get_project(pid)["cuts"])
        cid = next(c for c in self.store.add_cut(pid)["cuts"] if c not in before)
        self.store.update_cut(pid, cid, {"caption": "A lighthouse at dusk"})
        res = na.native_cut_api_workflow(pid, cid, convert=True)
        self.assertEqual(res["source"], "template")
        self.assertEqual(wn.prompt_text(res["workflow"]), "A lighthouse at dusk")
        self.assertEqual(res["workflow"]["10"]["class_type"], "SaveImage")


class ImageToVideoTests(ProjectDefaultsBase):
    def setUp(self):
        super().setUp()
        self.pid = self.new_project()
        self.cut = next(iter(self.store.get_project(self.pid)["cuts"]))
        self.store.update_cut(self.pid, self.cut, {"caption": "A fox looks up", "planned_sec": 2})

    def add(self, name: str, maker=_png) -> dict:
        return self.store.add_version(self.pid, self.cut, maker(self.root / name))

    def test_plan_fills_start_image_prompt_and_length(self):
        v = self.add("still.png")
        plan = gg_sdk.image_to_video_plan(self.pid, self.cut)
        self.assertEqual((plan["start_version"], plan["template"], plan["frames"]), (v["id"], "Video LTX (default)", 49))
        self.assertEqual(plan["image"], f"gonggan/start_{v['id']}.png")
        self.assertTrue((self.input_dir / "gonggan" / f"start_{v['id']}.png").is_file())
        wf = json.loads((self.regen_dir / f"{plan['plan']}.json").read_text(encoding="utf-8"))
        self.assertEqual(wf["78"]["inputs"]["image"], plan["image"])
        self.assertEqual(wf["6"]["inputs"]["text"], "A fox looks up")
        self.assertEqual(wf["95"]["inputs"]["length"], 49)
        self.assertNotEqual(wf["72"]["inputs"]["noise_seed"], 1092847494041144, "new random seed")
        self.assertTrue(gg_sdk._NATIVE_PLAN_RE.fullmatch(plan["plan"]), "runs through run_native_confirmed")

    def test_best_then_selected_then_newest_still_image(self):
        old = self.add("old.png")
        mid = self.add("mid.png")
        self.add("anim.webp", _animated_webp)
        self.assertEqual(na.pick_start_version(self.pid, self.cut)[0]["id"], mid["id"], "animated webp is skipped")
        self.assertEqual(na.pick_start_version(self.pid, self.cut, old["id"])[0]["id"], old["id"])
        self.store.apply_timeline_edit(self.pid, [], {self.cut: {"pick": old["id"]}})
        self.assertEqual(na.pick_start_version(self.pid, self.cut, mid["id"])[0]["id"], old["id"], "Best wins")

    def test_start_vid_is_exactly_the_selected_image(self):
        """0.9.125 version row Make Video: the selected image even when another one is Best."""
        old = self.add("old.png")
        mid = self.add("mid.png")
        self.store.apply_timeline_edit(self.pid, [], {self.cut: {"pick": mid["id"]}})
        self.assertEqual(na.pick_start_version(self.pid, self.cut, None, old["id"])[0]["id"], old["id"])
        plan = gg_sdk.image_to_video_plan(self.pid, self.cut, old["id"], old["id"])
        self.assertEqual(plan["start_version"], old["id"])
        self.assertEqual(plan["image"], f"gonggan/start_{old['id']}.png")
        self.assertEqual(gg_sdk.image_to_video_plan(self.pid, self.cut, old["id"])["start_version"], mid["id"],
                         "without start_vid Best still wins (right-click Image to Video)")

    def test_start_vid_must_be_a_still_image_of_the_cut(self):
        self.add("still.png")
        anim = self.add("anim.webp", _animated_webp)
        with self.assertRaisesRegex(ValueError, "not a still image"):
            na.pick_start_version(self.pid, self.cut, None, anim["id"])
        with self.assertRaisesRegex(ValueError, "not in this cut"):
            gg_sdk.image_to_video_plan(self.pid, self.cut, None, "no-such-version")
        self.assertFalse(self.regen_dir.exists(), "no plan written")

    def test_no_image_version(self):
        with self.assertRaisesRegex(ValueError, "no still image version"):
            gg_sdk.image_to_video_plan(self.pid, self.cut)

    def test_start_image_node_rule_errors(self):
        self.add("still.png")
        two = gg_template.read_workflow_ref("builtin:video-ltx")
        loader = next(n for n in two["nodes"] if n["type"] == "LoadImage")
        loader.pop("title")
        two["nodes"].append({**loader, "id": 999})
        na.native_update_project(self.pid, {"settings": {"video_template": self.user_workflow("two.json", two)}})
        with self.assertRaises(ValueError) as cm:
            gg_sdk.image_to_video_plan(self.pid, self.cut)
        self.assertEqual(str(cm.exception), "Start image node not found. Rename the input node to Start Image.")
        self.assertFalse(self.regen_dir.exists(), "no plan written")

    def test_prompt_from_the_image_when_the_cut_has_no_description(self):
        self.store.update_cut(self.pid, self.cut, {"caption": ""})
        img = gg_template.read_workflow_ref("builtin:image")
        wn.set_prompt(img, "Harbor at sunrise")
        self.store.add_version(self.pid, self.cut, _png(self.root / "a.png"), workflow=img)
        self.assertEqual(gg_sdk.image_to_video_plan(self.pid, self.cut)["prompt"], "Harbor at sunrise")
        self.store.add_version(self.pid, self.cut, _png(self.root / "b.png"))
        with self.assertRaisesRegex(ValueError, "no description"):
            gg_sdk.image_to_video_plan(self.pid, self.cut)

    def test_generate_all_fills_titled_start_image(self):
        v = self.add("still.png")
        video = na.project_video_template(self.store.get_project(self.pid))[1]
        with mock.patch.object(na, "project_template_graph", return_value=video):
            ids = na.native_add_cut_list(self.pid, [{"cut": 1, "duration": 2, "description": "Fox"}])["cut_ids"]
        plan = gg_sdk.native_plan(self.pid, ids[0], new_seed=False, convert=True, fill_start=True)
        self.assertNotIn("start_version", plan, "cut without image runs as saved")
        self.store.add_version(self.pid, ids[0], _png(self.root / "c.png"))
        plan = gg_sdk.native_plan(self.pid, ids[0], new_seed=False, convert=True, fill_start=True)
        wf = json.loads((self.regen_dir / f"{plan['plan']}.json").read_text(encoding="utf-8"))
        self.assertTrue(wf["78"]["inputs"]["image"].startswith("gonggan/start_"))
        self.assertNotEqual(plan["start_version"], v["id"])


if __name__ == "__main__":
    unittest.main()
