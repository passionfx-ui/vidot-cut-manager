"""Workflow generation size patching."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_workflow_size as gws
from gg_project.project_settings import dimensions_from_gen_settings, normalize_settings


class WorkflowSizeTests(unittest.TestCase):
    def test_apply_empty_latent(self):
        wf = {"1": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}}}
        dims = dimensions_from_gen_settings("9:16", 512)
        info = gws.apply_generation_size(wf, dims["width"], dims["height"])
        self.assertEqual(info["patched"], 1)
        self.assertFalse(info["warned"])
        self.assertEqual(wf["1"]["inputs"]["width"], 512)
        self.assertEqual(wf["1"]["inputs"]["height"], 904)

    def test_no_size_node_warns(self):
        wf = {"1": {"class_type": "SaveImage", "inputs": {"filename_prefix": "x"}}}
        info = gws.apply_generation_size(wf, 512, 512)
        self.assertEqual(info["patched"], 0)
        self.assertTrue(info["warned"])
        self.assertEqual(wf["1"]["inputs"]["filename_prefix"], "x")

    def test_linked_inputs_skipped(self):
        wf = {"1": {"class_type": "EmptyLatentImage", "inputs": {"width": ["2", 0], "height": 512, "batch_size": 1}}}
        info = gws.apply_generation_size(wf, 640, 640)
        self.assertEqual(info["patched"], 0)
        self.assertTrue(info["warned"])

    def test_normalize_gen_settings_dimensions(self):
        s = normalize_settings({"gen_aspect": "1:1", "resolution_short": 512})
        self.assertEqual(s["width"], 512)
        self.assertEqual(s["height"], 512)
        self.assertEqual(s["random_seed"], True)


if __name__ == "__main__":
    unittest.main()
