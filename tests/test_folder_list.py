"""GET /gonggan/folder/list helper (0.9.94; 0.9.101 drives + quick folders, input normalization): folder names only,
drives for an empty path, relative paths rejected."""
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
        self.assertEqual(set(res), {"ok", "path", "parent", "folders", "drives", "quick"})
        self.assertTrue(all(isinstance(n, str) for n in res["folders"]))

    def test_drives_and_quick_folders_in_every_answer(self):
        for res in (fl.list_folders(str(self.root)), fl.list_folders("")):
            self.assertEqual(res["drives"], fl.list_drives())
            self.assertEqual(res["quick"], fl.quick_folders())
        quick = fl.quick_folders()
        self.assertEqual(quick[0], {"name": "Home", "path": str(Path.home())})
        self.assertTrue(set(q["name"] for q in quick) <= {"Home", "Desktop", "Documents"})
        self.assertTrue(all(os.path.isdir(q["path"]) for q in quick))

    def test_quick_folders_skip_missing_and_duplicates(self):
        with mock.patch.object(fl.Path, "home", return_value=self.root), \
                mock.patch.object(fl, "_known_folder", side_effect=[str(self.root), None]):
            self.assertEqual(fl.quick_folders(), [{"name": "Home", "path": str(self.root)}])
        (self.root / "Documents").mkdir()
        with mock.patch.object(fl.Path, "home", return_value=self.root), \
                mock.patch.object(fl, "_known_folder", return_value=None):
            self.assertEqual([q["name"] for q in fl.quick_folders()], ["Home", "Documents"])

    def test_quoted_and_trailing_slash_input(self):
        for raw in (f'"{self.root / "beta"}"', f"'{self.root / 'beta'}'", f"{self.root / 'beta'}\\\\", f"{self.root / 'beta'}/",
                    f'  "{self.root / "beta"}\\"\r\n'):
            self.assertEqual(fl.list_folders(raw)["path"], str(self.root / "beta"), raw)

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

    def test_never_lists_files_links_to_files_or_broken_links(self):
        made = []
        for name, target, is_dir in (("link_to_file", self.root / "notes.txt", False),
                                     ("broken_link", self.root / "gone", True),
                                     ("link_to_dir", self.root / "beta", True)):
            try:
                os.symlink(target, self.root / name, target_is_directory=is_dir)
                made.append(name)
            except (OSError, NotImplementedError):
                pass  # no symlink privilege on this Windows account
        res = fl.list_folders(str(self.root))["folders"]
        self.assertNotIn("notes.txt", res)
        self.assertNotIn("clip.mp4", res)
        self.assertNotIn("link_to_file", res)
        self.assertNotIn("broken_link", res)
        if "link_to_dir" in made:
            self.assertIn("link_to_dir", res)
        for n in res:
            self.assertTrue(os.path.isdir(self.root / n), n)

    def test_entry_that_claims_folder_but_is_a_file_is_skipped(self):
        real_scandir = os.scandir

        class Liar:
            def __init__(self, entry):
                self._e = entry
                self.name, self.path = entry.name, entry.path

            def is_dir(self, follow_symlinks=True):
                return True

            def is_file(self, follow_symlinks=True):
                return False

            def stat(self, follow_symlinks=True):
                return self._e.stat()

        class Ctx:
            def __init__(self, path):
                self._it = real_scandir(path)

            def __enter__(self):
                return (Liar(e) for e in self._it)

            def __exit__(self, *a):
                self._it.close()

        with mock.patch.object(fl.os, "scandir", side_effect=Ctx):
            self.assertEqual(fl.list_folders(str(self.root))["folders"], ["Alpha", "beta", "gamma"])

    def test_relative_rejected(self):
        for bad in ("Films", "Films\\A", "./x", "..", "C:Films" if os.name == "nt" else "x/y"):
            with self.assertRaises(ValueError, msg=bad):
                fl.list_folders(bad)

    def test_missing_and_file(self):
        with self.assertRaises(FileNotFoundError):
            fl.list_folders(str(self.root / "nope"))
        with self.assertRaises(NotADirectoryError):
            fl.list_folders(str(self.root / "notes.txt"))


class NormalizeFolderInputTests(unittest.TestCase):
    def test_quotes_and_trailing_separators(self):
        cases = {
            '"D:\\Films\\My Film"': "D:\\Films\\My Film",
            "'D:\\Films'": "D:\\Films",
            "  D:\\Films\\\\  ": "D:\\Films",
            "D:/Films/": "D:/Films",
            '"D:\\Films\\"': "D:\\Films",
            "\\\\srv\\share\\": "\\\\srv\\share",
            "/home/a/": "/home/a",
            "": "",
            None: "",
            '""': "",
        }
        for raw, want in cases.items():
            self.assertEqual(fl.normalize_folder_input(raw), want, repr(raw))

    def test_roots_are_kept(self):
        for raw in ("C:\\", "C:", "C:/", "C:\\\\", '"C:\\"', "c:\\"):
            self.assertEqual(fl.normalize_folder_input(raw), raw.strip('"')[:2] + "\\", raw)
        self.assertEqual(fl.normalize_folder_input("/"), "/")
        self.assertEqual(fl.normalize_folder_input("//"), "/")


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
