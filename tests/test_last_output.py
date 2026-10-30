import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gg_sdk  # noqa: E402


def entry(files, status="success"):
    return {"status": {"status_str": status, "completed": status == "success"},
            "outputs": {"9": {"images": [{"filename": f, "subfolder": "", "type": "output"} for f in files]}}}


class PickLastOutput(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for n in ("old.png", "new.png", "newest_on_disk.png"):
            (self.root / n).write_bytes(b"x")
        os.utime(self.root / "newest_on_disk.png", (time.time() + 50, time.time() + 50))

    def tearDown(self):
        self.tmp.cleanup()

    def test_uses_only_the_newest_run(self):
        lo, why = gg_sdk.pick_last_output({"a": entry(["old.png"]), "b": entry(["new.png"])}, self.root)
        self.assertEqual(lo["name"], "new.png")
        self.assertEqual(lo["prompt_id"], "b")
        self.assertEqual(why, "")
        self.assertGreaterEqual(lo["age_sec"], 0)

    def test_failed_newest_run_does_not_fall_back_to_an_older_result(self):
        lo, why = gg_sdk.pick_last_output({"a": entry(["old.png"]), "b": entry([], status="error")}, self.root)
        self.assertIsNone(lo)
        self.assertIn("failed", why)

    def test_newest_run_without_output_does_not_fall_back(self):
        hist = {"a": entry(["old.png"]), "b": {"status": {"status_str": "success"}, "outputs": {}}}
        lo, why = gg_sdk.pick_last_output(hist, self.root)
        self.assertIsNone(lo)
        self.assertIn("no image or video", why)

    def test_missing_file_is_not_replaced_by_newest_file_in_output_folder(self):
        lo, why = gg_sdk.pick_last_output({"b": entry(["deleted.png"])}, self.root)
        self.assertIsNone(lo)
        self.assertTrue(why)

    def test_empty_history(self):
        lo, why = gg_sdk.pick_last_output({}, self.root)
        self.assertIsNone(lo)
        self.assertIn("No finished", why)

    def test_path_escape_is_ignored(self):
        outside = self.root.parent / "gg_outside_test.png"
        lo, _ = gg_sdk.pick_last_output({"b": entry(["../gg_outside_test.png"])}, self.root)
        self.assertIsNone(lo)
        self.assertFalse(outside.exists() and lo)

    def test_age(self):
        lo, _ = gg_sdk.pick_last_output({"b": entry(["new.png"])}, self.root, now=(self.root / "new.png").stat().st_mtime + 120)
        self.assertAlmostEqual(lo["age_sec"], 120, delta=1)


if __name__ == "__main__":
    unittest.main()