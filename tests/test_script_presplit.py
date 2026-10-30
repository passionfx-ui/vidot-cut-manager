"""0.9.130: deterministic pre-split for AI Make Cut (gg_script_presplit)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_script_presplit as presplit
import gg_ltx


class PresplitTests(unittest.TestCase):
    def test_cut_headers_keep_order_and_dialogue(self):
        story = """Cut 1: Kitchen morning
Wide shot of the stove steaming.
Maya: Good morning.

Cut 2: Window
Close-up of rain on glass.
"""
        cuts = presplit.presplit_public(story, "dialogue_only")
        self.assertIsNotNone(cuts)
        assert cuts is not None
        self.assertEqual(len(cuts), 2)
        self.assertEqual(cuts[0]["title"], "Kitchen Morning")
        self.assertEqual(cuts[0]["caption"], "Maya: Good morning.")
        self.assertIn("stove", cuts[0]["description"])
        self.assertEqual(cuts[1]["cut"], 2)

    def test_scene_shot_header(self):
        story = """Scene 1 / Shot 2: Alley
A cat runs past dumpsters.
Jin: Wait up!
"""
        cuts = presplit.presplit_public(story)
        self.assertIsNotNone(cuts)
        assert cuts is not None
        self.assertEqual(cuts[0]["title"], "Scene 1 Shot 2 Alley")
        self.assertEqual(cuts[0]["caption"], "Jin: Wait up!")

    def test_no_captions_mode(self):
        story = """Cut 1: Park
Sam: Hello there.
"""
        cuts = presplit.presplit_public(story, "no_captions")
        assert cuts is not None
        self.assertEqual(cuts[0]["caption"], "")

    def test_include_narration(self):
        story = """Cut 1: Rooftop
The city glows at dusk.
Lee: We made it.
"""
        cuts = presplit.presplit_public(story, "include_narration")
        assert cuts is not None
        self.assertIn("city glows", cuts[0]["caption"])
        self.assertIn("Lee: We made it.", cuts[0]["caption"])

    def test_free_prose_is_not_presplit(self):
        story = "Once upon a time a fox walked through the snow for many miles without any cut markers."
        self.assertIsNone(presplit.presplit_public(story))

    def test_quoted_dialogue(self):
        story = """Cut 1: Street
"Stop right there," she said.
"""
        cuts = presplit.presplit_public(story, "dialogue_only")
        assert cuts is not None
        self.assertIn("Stop right there", cuts[0]["caption"])

    def test_normalize_caption_mode(self):
        self.assertEqual(presplit.normalize_caption_mode("Dialogue only"), "dialogue_only")
        self.assertEqual(presplit.normalize_caption_mode("no-captions"), "no_captions")
        self.assertEqual(presplit.normalize_caption_mode(None), presplit.DEFAULT_CAPTION_MODE)

    def test_presplit_sets_notes_and_prompt(self):
        story = """Cut 1: Kitchen morning
Wide shot of the stove steaming.
Maya: Good morning.
"""
        draft = presplit.presplit_story(story, "dialogue_only")
        assert draft is not None
        rows = gg_ltx.validate_cut_list(draft)
        self.assertIn("stove", rows[0]["prompt"])
        self.assertIn("stove", rows[0]["notes"])


if __name__ == "__main__":
    unittest.main()
