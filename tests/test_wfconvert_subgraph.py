"""Subgraph instances flatten into ordinary nodes before an API prompt is built.

The two real app templates live in the local ComfyUI user workflows folder.
"""
from __future__ import annotations

import json
import sys
import unittest
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_wfconvert

_WF_DIRS = (
    Path(r"C:\ComfyUI_windows_portable\ComfyUI\user\default\workflows"),
    (Path.home() / r"AppData\Local\Comfy-Desktop\ComfyUI-Installs\comfyUI\ComfyUI\user\default\workflows"),
)
Z_TURBO = "image_z_image_turbo apps.app.json"
H3 = "test_app_h3_i2v_xpu.app.json"


def _load(name: str) -> dict:
    for folder in _WF_DIRS:
        path = folder / name
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    raise AssertionError(f"missing template {name}")


class FlattenTests(unittest.TestCase):
    def test_widget_override_and_external_link(self):
        sg_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        graph = {
            "nodes": [
                {"id": 1, "type": "LoadImage", "mode": 0, "widgets_values": ["in.png", "image"],
                 "outputs": [{"name": "IMAGE", "links": [2]}]},
                {"id": 7, "type": sg_id, "mode": 0,
                 "widgets_values_named": {"text": "", "steps": 4},
                 "inputs": [
                     {"name": "image", "type": "IMAGE", "link": 2},
                     {"name": "text", "type": "STRING", "widget": {"name": "text"}, "link": None},
                     {"name": "steps", "type": "INT", "widget": {"name": "steps"}, "link": None},
                 ],
                 "outputs": [{"name": "IMAGE", "links": [3]}]},
                {"id": 9, "type": "SaveImage", "mode": 0,
                 "inputs": [{"name": "images", "type": "IMAGE", "link": 3}],
                 "widgets_values": ["out"]},
            ],
            "links": [
                [2, 1, 0, 7, 0, "IMAGE"],
                [3, 7, 0, 9, 0, "IMAGE"],
            ],
            "definitions": {"subgraphs": [{
                "id": sg_id,
                "name": "Box",
                "inputNode": {"id": -10},
                "outputNode": {"id": -20},
                "inputs": [
                    {"name": "image", "type": "IMAGE"},
                    {"name": "text", "type": "STRING"},
                    {"name": "steps", "type": "INT"},
                ],
                "outputs": [{"name": "IMAGE", "type": "IMAGE"}],
                "nodes": [
                    {"id": 4, "type": "CLIPTextEncode", "mode": 0,
                     "widgets_values": ["inner"],
                     "widgets_values_named": {"text": "inner"},
                     "inputs": [{"name": "text", "type": "STRING", "widget": {"name": "text"}, "link": 11}]},
                    {"id": 5, "type": "KSampler", "mode": 0,
                     "widgets_values": [1, "fixed", 20, 1, "euler", "simple", 1],
                     "widgets_values_named": {
                         "seed": 1, "control_after_generate": "fixed", "steps": 20, "cfg": 1,
                         "sampler_name": "euler", "scheduler": "simple", "denoise": 1},
                     "inputs": [
                         {"name": "model", "link": None}, {"name": "positive", "link": None},
                         {"name": "negative", "link": None}, {"name": "latent_image", "link": None},
                         {"name": "seed", "widget": {"name": "seed"}, "link": None},
                         {"name": "steps", "widget": {"name": "steps"}, "link": 12},
                     ]},
                    {"id": 8, "type": "VAEDecode", "mode": 0,
                     "inputs": [{"name": "samples", "link": None}, {"name": "image", "type": "IMAGE", "link": 10}],
                     "outputs": [{"name": "IMAGE", "links": [13]}]},
                ],
                "links": [
                    {"id": 10, "origin_id": -10, "origin_slot": 0, "target_id": 8, "target_slot": 1, "type": "IMAGE"},
                    {"id": 11, "origin_id": -10, "origin_slot": 1, "target_id": 4, "target_slot": 0, "type": "STRING"},
                    {"id": 12, "origin_id": -10, "origin_slot": 2, "target_id": 5, "target_slot": 5, "type": "INT"},
                    {"id": 13, "origin_id": 8, "origin_slot": 0, "target_id": -20, "target_slot": 0, "type": "IMAGE"},
                ],
            }]},
        }
        api = gg_wfconvert.ui_to_api(graph, mappings={})
        self.assertNotIn("7", api)
        self.assertEqual(api["7:4"]["inputs"]["text"], "")
        self.assertEqual(api["7:5"]["inputs"]["steps"], 4)
        self.assertEqual(api["7:8"]["inputs"]["image"], ["1", 0])
        self.assertEqual(api["9"]["inputs"]["images"], ["7:8", 0])
        self.assertTrue(uuid.UUID(sg_id))
        self.assertNotIn(sg_id, {n["class_type"] for n in api.values()})

    def test_z_turbo_app_template(self):
        wf = _load(Z_TURBO)
        api = gg_wfconvert.ui_to_api(wf, mappings={})
        self.assertNotIn("57", api)
        self.assertTrue(any(nid.startswith("57:") for nid in api))
        self.assertNotIn("f2fdebf6-dfaf-43b6-9eb2-7f70613cfdc1", {n["class_type"] for n in api.values()})
        text = api["57:27"]["inputs"]["text"]
        inst = next(n for n in wf["nodes"] if n["id"] == 57)
        self.assertEqual(text, inst["widgets_values_named"]["text"])
        self.assertTrue(text.startswith("Latina female"))
        self.assertEqual(api["57:13"]["inputs"]["width"], 1024)
        self.assertEqual(api["57:13"]["inputs"]["height"], 1024)
        self.assertEqual(api["57:3"]["inputs"]["seed"], 0)
        self.assertEqual(api["57:3"]["inputs"]["steps"], 8)
        self.assertEqual(api["57:28"]["inputs"]["unet_name"], "z_image_turbo_bf16.safetensors")
        self.assertEqual(api["9"]["class_type"], "SaveImage")
        self.assertEqual(api["9"]["inputs"]["images"], ["57:8", 0])
        self.assertEqual(api["57:8"]["class_type"], "VAEDecode")

    def test_h3_app_template(self):
        wf = _load(H3)
        inst = next(n for n in wf["nodes"] if n["id"] == 105)
        api = gg_wfconvert.ui_to_api(wf, mappings={})
        self.assertNotIn("105", api)
        self.assertNotIn("4c314f31-ecda-4b08-ae98-faaba1bf613f", {n["class_type"] for n in api.values()})
        h3 = api["105:104"]
        self.assertEqual(h3["class_type"], "MiniMaxH3ImageToVideo")
        self.assertEqual(h3["inputs"]["prompt"], inst["widgets_values_named"]["prompt"])
        self.assertTrue(h3["inputs"]["prompt"].startswith("Editorial tech product film"))
        self.assertEqual(h3["inputs"]["first_frame"], ["114", 0])
        self.assertNotIn("last_frame", h3["inputs"])
        self.assertEqual(h3["inputs"]["width"], ["115", 0])
        self.assertEqual(h3["inputs"]["height"], ["115", 1])
        self.assertEqual(api["105:6"]["inputs"]["unet_name"], inst["widgets_values_named"]["unet_name"])
        self.assertEqual(api["105:111"]["inputs"]["value"], inst["widgets_values_named"]["value_1"])
        self.assertEqual(api["105:126"]["inputs"]["value"], inst["widgets_values_named"]["value"])
        self.assertEqual(api["105:121"]["inputs"]["strength_model"], inst["widgets_values_named"]["strength_model_1"])
        self.assertEqual(api["92"]["class_type"], "SaveVideo")
        self.assertEqual(api["92"]["inputs"]["video"], ["105:91", 0])
        self.assertEqual(api["105:91"]["class_type"], "CreateVideo")
        self.assertEqual(api["114"]["inputs"]["image"], "transparent_rgb_gaming_mouse.png")


if __name__ == "__main__":
    unittest.main()
