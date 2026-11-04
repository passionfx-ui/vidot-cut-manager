"""Explorer reveal for Export tab (subprocess args, paths with spaces and Korean)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_export
import gg_native_api as na
from gg_project import LocalStore


class ExplorerRevealArgsTests(unittest.TestCase):
    def test_folder_only_windows(self):
        with mock.patch.object(gg_export.os, "name", "nt"):
            args = gg_export.explorer_reveal_args(Path(r"N:\개인\My Exports"))
            self.assertEqual(args, ["explorer", r"N:\개인\My Exports"])

    def test_select_file_windows(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            file = folder / "clip.mp4"
            file.write_bytes(b"x")
            with mock.patch.object(gg_export.os, "name", "nt"):
                args = gg_export.explorer_reveal_args(folder, file)
                self.assertEqual(args[0], "explorer")
                self.assertTrue(args[1].startswith("/select,"))
                self.assertIn("clip.mp4", args[1])


class RevealProjectExportTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root)
        na.set_native_store(self.store)
        doc = self.store.create_project("Rev")
        self.pid = doc["id"]
        with gg_export._lock:
            gg_export._job.clear()
            gg_export._job.update(status="idle")

    def tearDown(self):
        with gg_export._lock:
            gg_export._job.clear()
            gg_export._job.update(status="idle")
        na.set_native_store(None)
        self._tmp.cleanup()

    @mock.patch.object(gg_export, "run_explorer_reveal", return_value=["explorer", "D:\\x"])
    def test_missing_folder_is_created_and_opened(self, run):
        out_dir = na.native_export_timeline(self.pid)[1]
        self.assertFalse(out_dir.exists())
        res = gg_export.reveal_project_export(self.pid)
        self.assertTrue(res["ok"], res)
        self.assertTrue(out_dir.is_dir())
        self.assertEqual(res["path"], str(out_dir.resolve()))
        run.assert_called_once()

    @mock.patch.object(gg_export, "run_explorer_reveal", return_value=["explorer", "D:\\x"])
    def test_ok_with_existing_export_dir(self, run):
        out_dir = na.native_export_timeline(self.pid)[1]
        out_dir.mkdir(parents=True, exist_ok=True)
        res = gg_export.reveal_project_export(self.pid)
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["path"], str(out_dir.resolve()))
        run.assert_called_once()

    @mock.patch.object(gg_export, "run_explorer_reveal", return_value=["explorer", "/select,x"])
    def test_select_last_export_file(self, run):
        out_dir = na.native_export_timeline(self.pid)[1]
        out_dir.mkdir(parents=True, exist_ok=True)
        mp4 = out_dir / "test.mp4"
        mp4.write_bytes(b"x")
        with gg_export._lock:
            gg_export._job.clear()
            gg_export._job.update(
                status="done",
                pid=self.pid,
                file="test.mp4",
                path=str(mp4),
            )
        res = gg_export.reveal_project_export(self.pid, "test.mp4")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["selected"], str(mp4.resolve()))
        run.assert_called_once()


if __name__ == "__main__":
    unittest.main()
