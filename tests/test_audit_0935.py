"""0.9.135 audit fixes: start image with several Load Image nodes, Image template precedence, quoted Dialogue,
display name, no 'gonggan'/'native' in user-visible strings."""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
import gg_wfnodes


class StartImageTests(unittest.TestCase):
    def test_several_load_image_nodes_use_lowest_id(self):
        api = {
            "12": {"class_type": "LoadImage", "inputs": {"image": "b.png"}},
            "7": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
            "30": {"class_type": "LoadImage", "inputs": {"image": "c.png"}},
        }
        self.assertEqual(gg_wfnodes.set_start_image(api, "start.png"), "7")
        self.assertEqual(api["7"]["inputs"]["image"], "start.png")
        self.assertEqual(api["12"]["inputs"]["image"], "b.png")

    def test_titled_start_image_still_wins(self):
        api = {
            "2": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
            "9": {"class_type": "LoadImage", "inputs": {"image": "b.png"}, "_meta": {"title": gg_wfnodes.START_IMAGE_TITLE}},
        }
        self.assertEqual(gg_wfnodes.set_start_image(api, "s.png"), "9")

    def test_ui_graph_several_loaders(self):
        ui = {"nodes": [{"id": 40, "type": "LoadImage", "widgets_values": ["x.png"]},
                        {"id": 5, "type": "LoadImage", "widgets_values": ["y.png"]}], "links": []}
        nid, _node = gg_wfnodes.find_start_image_node(ui)
        self.assertEqual(str(nid), "5")

    def test_no_loader_is_still_an_error(self):
        with self.assertRaises(gg_wfnodes.NodeNotFound):
            gg_wfnodes.set_start_image({"1": {"class_type": "KSampler", "inputs": {}}}, "s.png")


class DialogueTests(unittest.TestCase):
    def test_dialogue_is_quoted(self):
        cut = {"prompt": "Fox runs", "caption": "  Hello   there "}
        self.assertEqual(na.cut_video_prompt_text(cut), 'Fox runs Dialogue: "Hello there"')
        self.assertEqual(na.cut_video_prompt_text({"prompt": "Fox runs"}), "Fox runs")


class ImageTemplatePrecedenceTests(unittest.TestCase):
    """The Default template field is gone (0.9.135): an explicit Image template wins over an old linked one."""

    def _graph(self, ref):
        return {"ref": ref}

    def test_explicit_image_template_wins(self):
        doc = {"id": "p", "template_ref": "old.json", "settings": {"image_template": "mine.json"}}
        with mock.patch.object(na, "resolve_template_graph", side_effect=self._graph):
            self.assertEqual(na.project_template_graph(doc, "image"), {"ref": "mine.json"})

    def test_old_default_template_still_used_when_image_template_is_default(self):
        doc = {"id": "p", "template_ref": "old.json", "settings": {}}
        with mock.patch.object(na, "resolve_template_graph", side_effect=self._graph):
            self.assertEqual(na.project_template_graph(doc, "image"), {"ref": "old.json"})

    def test_no_default_template_falls_back_to_image_template(self):
        doc = {"id": "p", "settings": {}}
        with mock.patch.object(na, "resolve_template_graph", side_effect=self._graph), \
                mock.patch.object(na.gg_template, "get_template", return_value=None):
            self.assertEqual(na.project_template_graph(doc, "image"), {"ref": na.DEFAULT_IMAGE_TEMPLATE})


class DisplayNameTests(unittest.TestCase):
    NAME = "Vidot Studio \u2013 Cut Manager"

    def test_display_name_everywhere(self):
        self.assertIn(f'DisplayName = "{self.NAME}"', (REPO / "pyproject.toml").read_text(encoding="utf-8"))
        self.assertTrue((REPO / "__init__.py").read_text(encoding="utf-8").startswith(f'"""{self.NAME}'))
        self.assertTrue((REPO / "README.md").read_text(encoding="utf-8").startswith(f"# {self.NAME}"))
        self.assertIn(f'tooltip: "{self.NAME}"', (REPO / "web" / "gonggan.js").read_text(encoding="utf-8"))

    def test_readme_select_all_is_ctrl_a(self):
        text = (REPO / "README.md").read_text(encoding="utf-8")
        self.assertNotRegex(text, r"right-click\s*>\s*\**Select All")
        self.assertIn("Ctrl+A", text)


if __name__ == "__main__":
    unittest.main()
