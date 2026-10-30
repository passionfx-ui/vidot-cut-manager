"""0.9.105: a finished run queued from a native cut becomes a version of that cut (POST /gonggan/capture-output).

Before, nothing recorded a run automatically: only a manual "Send last output" called add_version, so a
render in a new project never showed up as a version / cut thumbnail."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
import gg_sdk
from gg_project import LocalStore

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
NAME = "2026_Contest_KINFA_PreventionSong"


def _entry(files, status="success"):
    return {"status": {"status_str": status, "completed": status == "success"},
            "outputs": {"9": {"images": [{"filename": f, "subfolder": "", "type": "output"} for f in files]}}}


class PickPromptOutputTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        for n in ("a.png", "b.png"):
            (self.root / n).write_bytes(PNG)

    def tearDown(self):
        self._tmp.cleanup()

    def test_picks_that_prompt_not_the_newest(self):
        hist = {"pa": _entry(["a.png"]), "pb": _entry(["b.png"])}
        lo, why = gg_sdk.pick_prompt_output(hist, "pa", self.root)
        self.assertEqual((lo["name"], lo["prompt_id"], why), ("a.png", "pa", ""))

    def test_not_in_history_yet(self):
        lo, why = gg_sdk.pick_prompt_output({"pb": _entry(["b.png"])}, "pa", self.root)
        self.assertIsNone(lo)
        self.assertIn("not in the history", why)

    def test_failed_run(self):
        lo, why = gg_sdk.pick_prompt_output({"pa": _entry([], status="error")}, "pa", self.root)
        self.assertIsNone(lo)
        self.assertIn("failed", why)

    def test_last_output_unchanged(self):
        lo, _ = gg_sdk.pick_last_output({"pa": _entry(["a.png"]), "pb": _entry(["b.png"])}, self.root)
        self.assertEqual(lo["prompt_id"], "pb")


class CaptureNewProjectTests(unittest.TestCase):
    """Same shape as the reported project: New Project with a location, doubled non-ASCII folder name,
    non-ASCII template_ref, one cut, no versions."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root / "pack")
        na.set_native_store(self.store)
        loc = self.root / "개인" / NAME
        loc.mkdir(parents=True)
        (loc / "01_Planning").mkdir()
        res = na.create_native_project(NAME, None, None, str(loc))
        self.pid = res["project"]["id"]
        self.folder = loc / NAME
        self.store.set_template(self.pid, "로컬이미지생성.json")
        self.cut = next(iter(self.store.get_project(self.pid)["cuts"]))
        self.out = self.root / "output" / "z-image-turbo_00001_.png"
        self.out.parent.mkdir()
        self.out.write_bytes(PNG)
        self.lo = {"path": str(self.out), "name": self.out.name, "from": "history", "prompt_id": "p1"}

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def _info(self, *infos):
        return mock.patch.object(gg_sdk, "prompt_output_info", side_effect=list(infos))

    def _row(self):
        return next(c for c in self.store.to_timeline(self.pid)["cuts"] if c["id"] == self.cut)

    def test_finished_run_becomes_version_and_thumbnail(self):
        self.assertEqual(self.store.get_project(self.pid)["settings"]["project_folder"], str(self.folder))
        with self._info({"output": self.lo, "reason": "", "pending": False}):
            res = na.native_capture_prompt_output(self.pid, self.cut, "p1")
        self.assertTrue(res["ok"])
        self.assertFalse(res["duplicate"])
        ver = res["version"]
        saved = Path(ver["asset"]["path"])
        self.assertEqual(saved.parent, self.folder / "assets")
        self.assertTrue(saved.is_file())
        self.assertEqual(ver["run"]["prompt_id"], "p1")
        self.assertTrue(self.out.is_file())
        row = self._row()
        self.assertEqual(row["media"]["id"], ver["id"])
        self.assertEqual([(v["id"], v["missing"]) for v in row["versions_list"]], [(ver["id"], False)])
        self.assertEqual(na.native_media_path(ver["id"]), saved)
        journal = (self.store._project_dir(self.pid) / "journal.ndjson").read_text(encoding="utf-8")
        self.assertIn('"add_version"', journal)

    def test_waits_for_history_entry(self):
        pending = {"output": None, "reason": "not yet", "pending": True}
        with self._info(pending, pending, {"output": self.lo, "reason": "", "pending": False}) as m:
            res = na.native_capture_prompt_output(self.pid, self.cut, "p1", wait_sec=5, poll_sec=0)
        self.assertTrue(res["ok"])
        self.assertEqual(m.call_count, 3)

    def test_gives_up_when_never_in_history(self):
        with self._info({"output": None, "reason": "not yet", "pending": True}):
            res = na.native_capture_prompt_output(self.pid, self.cut, "p1", wait_sec=0)
        self.assertFalse(res["ok"])
        self.assertEqual(self.store.list_versions(self.pid, self.cut), [])

    def test_same_prompt_is_added_once(self):
        ok = {"output": self.lo, "reason": "", "pending": False}
        with self._info(ok, ok):
            first = na.native_capture_prompt_output(self.pid, self.cut, "p1")
            again = na.native_capture_prompt_output(self.pid, self.cut, "p1")
        self.assertTrue(again["duplicate"])
        self.assertEqual(again["version"]["id"], first["version"]["id"])
        self.assertEqual(len(self.store.list_versions(self.pid, self.cut)), 1)
        self.assertEqual(len(list((self.folder / "assets").iterdir())), 1)

    def test_failed_run_adds_nothing(self):
        with self._info({"output": None, "reason": "The last ComfyUI run failed", "pending": False}):
            res = na.native_capture_prompt_output(self.pid, self.cut, "p1")
        self.assertFalse(res["ok"])
        self.assertEqual(self.store.list_versions(self.pid, self.cut), [])

    def test_bad_input(self):
        with self.assertRaisesRegex(ValueError, "prompt_id"):
            na.native_capture_prompt_output(self.pid, self.cut, "")
        with self.assertRaisesRegex(ValueError, "cut not found"):
            na.native_capture_prompt_output(self.pid, "01a18b3f-271d-722b-81f4-e2f056fdca99", "p1")
        with self.assertRaisesRegex(ValueError, "project not found"):
            na.native_capture_prompt_output("01a18b3f-271a-7e85-9787-d2ad00dea599", self.cut, "p1")


if __name__ == "__main__":
    unittest.main()
