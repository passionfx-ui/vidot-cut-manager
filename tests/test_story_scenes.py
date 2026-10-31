"""Scene marker assignment for AI Make Cut."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_story_scenes import assign_scene_names, story_scene_sections


class StorySceneTests(unittest.TestCase):
    def test_sections_from_markers(self):
        story = "Scene 1\nCut one text.\nScene 2\nCut two text."
        secs = story_scene_sections(story)
        self.assertEqual([n for n, _ in secs], ["Scene 1", "Scene 2"])

    def test_assigns_cuts_across_scenes(self):
        story = "Scene 1\nA girl on a roof.\nScene 2\nShe looks at the moon."
        cuts = [
            {"cut": 1, "duration": 2, "description": "roof"},
            {"cut": 2, "duration": 2, "description": "moon"},
        ]
        out = assign_scene_names(story, cuts)
        self.assertEqual(out[0]["scene"], "Scene 1")
        self.assertEqual(out[1]["scene"], "Scene 2")


if __name__ == "__main__":
    unittest.main()
