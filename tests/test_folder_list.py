"""GET /gonggan/folder/list helper (0.9.94): folder names only, drives for an empty path, relative paths rejected."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_project import folder_list as fl


class ListFoldersTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        for name in ("beta", "Alpha", "gamma"):
            (self.root / name).mkdir()
        (self.root / "notes.txt").write_text("secret", encoding="utf-8")
        (self.root / "clip.mp4").write_bytes(b"\0" * 64)

    def tearDown(self):
        self._tmp.cleanup()

    def test_lists_only_folder_names_sorted(self):
        res = fl.list_folders(str(self.root))
        self.assertEqual(res["folders"], ["Alpha", "beta", "gamma"])
        self.assertEqual(set(res), {"ok", "path", "parent", "folders"})
        self.assertTrue(all(isinstance(n, str) for n in res["folders"]))

    def test_path_and_parent(self):
        res = fl.list_folders(f"  {self.root / 'beta'}  ")
        self.assertEqual(res["path"], str(self.root / "beta"))
        self.assertEqual(res["parent"], str(self.root))
        self.assertEqual(res["folders"], [])

    def test_dotdot_is_normalized(self):
        res = fl.list_folders(str(self.root / "beta" / ".." / "gamma"))
        self.assertEqual(res["path"], str(self.root / "gamma"))

    def test_drive_root_parent_is_drive_list(self):
        anchor = Path(self.root.anchor)
        res = fl.list_folders(str(anchor))
        self.assertEqual(res["parent"], "")
        self.assertEqual(res["path"], str(anchor))

    def test_empty_path_lists_drives(self):
        res = fl.list_folders("")
        self.assertIsNone(res["parent"])
        self.assertEqual(res["path"], "")
        self.assertTrue(res["folders"])
        if os.name == "nt":
            self.assertIn(Path(self.root.anchor).drive.upper() + "\\", [d.upper() for d in res["folders"]])
        else:
            self.assertEqual(res["folders"], ["/"])
        self.assertEqual(fl.list_folders(None)["parent"], None)

    def test_hidden_folders_skipped(self):
        hidden = self.root / ".hidden"
        hidden.mkdir()
        if os.name == "nt":
            import ctypes
            self.assertTrue(ctypes.windll.kernel32.SetFileAttributesW(str(hidden), 0x2))
        self.assertNotIn(".hidden", fl.list_folders(str(self.root))["folders"])

    def test_relative_rejected(self):
        for bad in ("Films", "Films\\A", "./x", "..", "C:Films" if os.name == "nt" else "x/y"):
            with self.assertRaises(ValueError, msg=bad):
                fl.list_folders(bad)

    def test_missing_and_file(self):
        with self.assertRaises(FileNotFoundError):
            fl.list_folders(str(self.root / "nope"))
        with self.assertRaises(NotADirectoryError):
            fl.list_folders(str(self.root / "notes.txt"))


class FolderListResponseTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / "Shots").mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def test_ok(self):
        status, body = fl.folder_list_response(str(self.root))
        self.assertEqual(status, 200)
        self.assertEqual(body["folders"], ["Shots"])

    def test_relative_is_400(self):
        status, body = fl.folder_list_response("relative\\folder")
        self.assertEqual(status, 400)
        self.assertFalse(body["ok"])
        self.assertIn("full path", body["message"])

    def test_missing_is_404_and_file_is_400(self):
        self.assertEqual(fl.folder_list_response(str(self.root / "missing"))[0], 404)
        f = self.root / "a.txt"
        f.write_text("x", encoding="utf-8")
        status, body = fl.folder_list_response(str(f))
        self.assertEqual(status, 400)
        self.assertEqual(body["message"], "This path is a file, not a folder")

    def test_permission_error_is_403_with_message(self):
        with mock.patch.object(fl.os, "scandir", side_effect=PermissionError(13, "Access is denied")):
            status, body = fl.folder_list_response(str(self.root))
        self.assertEqual(status, 403)
        self.assertEqual(body, {"ok": False, "message": "Permission denied: this folder cannot be opened"})

    def test_other_os_error_is_400(self):
        with mock.patch.object(fl.os, "scandir", side_effect=OSError(21, "The device is not ready")):
            status, body = fl.folder_list_response(str(self.root))
        self.assertEqual(status, 400)
        self.assertIn("The device is not ready", body["message"])

    def test_control_chars_rejected(self):
        self.assertEqual(fl.folder_list_response(f"{self.root}\x00x")[0], 400)


if __name__ == "__main__":
    unittest.main()
