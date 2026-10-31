"""Scene marker assignment for AI Make Cut."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_story_scenes import assign_scene_names, story_scene_sections, story_uses_per_scene_llm


class StorySceneTests(unittest.TestCase):
    HANA_STORY = (
        "Scene 1. Night, a small rooftop garden in Seoul. A girl named Hana waters a single sunflower under a street lamp.\n"
        'Hana looks up at the moon and says: "Please bloom before morning."\n'
        "Scene 2. Dawn, the same rooftop. The sunflower has opened. Hana smiles and takes a photo with her phone."
    )

    def test_sections_from_markers(self):
        story = "Scene 1\nCut one text.\nScene 2\nCut two text."
        secs = story_scene_sections(story)
        self.assertEqual([n for n, _ in secs], ["Scene 1", "Scene 2"])

    def test_sections_scene_number_with_inline_prose(self):
        secs = story_scene_sections(self.HANA_STORY)
        self.assertEqual([n for n, _ in secs], ["Scene 1", "Scene 2"])
        self.assertIn("sunflower", secs[0][1].lower())
        self.assertIn("dawn", secs[1][1].lower())

    def test_story_uses_per_scene_llm_for_multiple_headings(self):
        self.assertTrue(story_uses_per_scene_llm(self.HANA_STORY))
        story = "Scene 1\nA girl on a roof.\nScene 2\nShe looks at the moon."
        self.assertTrue(story_uses_per_scene_llm(story))

    def test_assign_scene_names_skips_multi_section_stories(self):
        """Multi-section stories get scenes from per-block LLM in gg_cut_split, not word overlap."""
        story = "Scene 1\nA girl on a roof.\nScene 2\nShe looks at the moon."
        cuts = [
            {"cut": 1, "duration": 2, "description": "roof"},
            {"cut": 2, "duration": 2, "description": "moon"},
        ]
        out = assign_scene_names(story, cuts)
        self.assertEqual(out, cuts)
        self.assertNotIn("scene", out[0])

    def test_llm_cuts_without_scene_field_map_to_story_headings(self):
        """Single full-story LLM answers for multi-section scripts are handled in gg_cut_split._split."""
        cuts = [
            {"cut": 1, "duration": 2.5, "description": "Night rooftop Hana waters sunflower under street lamp"},
            {"cut": 2, "duration": 2.5, "description": "Hana looks up at the moon speaking"},
            {"cut": 3, "duration": 2.5, "description": "Dawn same rooftop sunflower has opened"},
            {"cut": 4, "duration": 2.5, "description": "Hana smiles takes photo with phone"},
        ]
        out = assign_scene_names(self.HANA_STORY, cuts)
        self.assertEqual(out, cuts)


if __name__ == "__main__":
    unittest.main()
