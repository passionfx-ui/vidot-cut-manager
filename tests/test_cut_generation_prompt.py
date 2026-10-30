"""0.9.130: draft-cut Generate uses Prompt, else title + Info; empty both is refused."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
from gg_project import LocalStore
from gg_project.local_store import NEW_CUT_NAME


class CutPromptTextTests(unittest.TestCase):
    def test_prompt_wins_over_info(self):
        cut = {"name": "Title", "notes": "Notes", "prompt": "  Fox runs  "}
        self.assertEqual(na.cut_prompt_text(cut), "Fox runs")

    def test_info_is_title_and_notes(self):
        cut = {"name": "Harbor Dawn", "notes": "Calm water", "prompt": ""}
        self.assertEqual(na.cut_info_text(cut), "Harbor Dawn. Calm water")

    def test_default_new_cut_name_is_not_info(self):
        cut = {"name": NEW_CUT_NAME, "notes": "Only notes", "prompt": ""}
        self.assertEqual(na.cut_info_text(cut), "Only notes")

    def test_empty_prompt_and_info(self):
        cut = {"name": NEW_CUT_NAME, "notes": "", "prompt": ""}
        self.assertEqual(na.cut_prompt_text(cut), "")

    def test_video_prompt_appends_caption(self):
        cut = {"prompt": "Fox runs", "caption": "  Hello there  "}
        self.assertEqual(na.cut_video_prompt_text(cut), "Fox runs Dialogue: Hello there")

    def test_video_prompt_omits_empty_caption(self):
        cut = {"prompt": "Fox runs", "caption": ""}
        self.assertEqual(na.cut_video_prompt_text(cut), "Fox runs")

    def test_video_prompt_empty_base(self):
        cut = {"name": NEW_CUT_NAME, "prompt": "", "caption": "Only dialogue"}
        self.assertEqual(na.cut_video_prompt_text(cut), "")


class DraftCutWorkflowTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        na.set_native_store(self.store)

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def test_native_add_cut_empty_raises(self):
        loc = Path(self._tmp.name) / "P"
        loc.mkdir()
        pid = na.create_native_project("P", None, None, str(loc))["project"]["id"]
        cid = na.native_add_cut(pid, None, None)["cut"]["id"]
        with self.assertRaisesRegex(ValueError, na.WRITE_PROMPT_FIRST):
            na.native_cut_api_workflow(pid, cid, convert=True)


if __name__ == "__main__":
    unittest.main()
