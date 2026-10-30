"""New Project location (0.9.99): the project folder is <location>/<name> with one `assets` subfolder,
set as settings.project_folder; generated outputs are saved there."""
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

import gg_native_api as na
from gg_project import LocalStore
from gg_project.project_settings import make_project_folder, project_folder_name
from gg_project.timeline import version_asset_file

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _tree(folder: Path) -> list[str]:
    return sorted(str(p.relative_to(folder)).replace("\\", "/") for p in folder.rglob("*"))


class ProjectFolderNameTests(unittest.TestCase):
    def test_keeps_normal_names(self):
        self.assertEqual(project_folder_name("  My Film 2 "), "My Film 2")
        self.assertEqual(project_folder_name("박 속의 이름"), "박 속의 이름")

    def test_replaces_bad_chars_and_trailing_dots(self):
        self.assertEqual(project_folder_name('a/b\\c:d*e?f"g<h>i|j'), "a_b_c_d_e_f_g_h_i_j")
        self.assertEqual(project_folder_name("Film. . "), "Film")
        self.assertEqual(project_folder_name("x\x01y"), "x_y")

    def test_empty_and_reserved(self):
        self.assertEqual(project_folder_name(" .. "), "Project")
        self.assertEqual(project_folder_name(None), "Project")
        self.assertEqual(project_folder_name("con"), "con_")
        self.assertEqual(project_folder_name("LPT1.txt"), "LPT1.txt_")
        self.assertEqual(project_folder_name("Console"), "Console")

    def test_length_cap(self):
        self.assertEqual(len(project_folder_name("x" * 300)), 120)


class MakeProjectFolderTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_creates_only_assets(self):
        created: list[Path] = []
        folder = make_project_folder(str(self.root / "Films"), "My Film", created)
        self.assertEqual(folder, self.root / "Films" / "My Film")
        self.assertEqual(_tree(folder), ["assets"])
        self.assertEqual(created, [self.root / "Films", folder, folder / "assets"])

    def test_empty_existing_folder_is_reused(self):
        (self.root / "A").mkdir()
        created: list[Path] = []
        folder = make_project_folder(str(self.root), "A", created)
        self.assertEqual(_tree(folder), ["assets"])
        self.assertEqual(created, [folder / "assets"])

    def test_non_empty_existing_folder_is_refused(self):
        (self.root / "A").mkdir()
        (self.root / "A" / "x.txt").write_text("x", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "already exists"):
            make_project_folder(str(self.root), "A")
        (self.root / "B.txt").write_text("x", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "already exists"):
            make_project_folder(str(self.root), "B.txt")

    def test_location_ending_with_the_name_is_used_as_is(self):
        loc = self.root / "Work" / "2026_Contest_KINFA_PreventionSong"
        created: list[Path] = []
        folder = make_project_folder(str(loc) + os.sep + os.sep, "2026_Contest_KINFA_PreventionSong", created)
        self.assertEqual(folder, loc)
        self.assertEqual(_tree(self.root), ["Work", "Work/2026_Contest_KINFA_PreventionSong", "Work/2026_Contest_KINFA_PreventionSong/assets"])
        self.assertEqual(created, [self.root / "Work", loc, loc / "assets"])

    def test_existing_empty_location_with_the_name_is_reused(self):
        (self.root / "Night_ Walk").mkdir()
        created: list[Path] = []
        folder = make_project_folder(str(self.root / "Night_ Walk"), "Night: Walk", created)
        self.assertEqual(folder, self.root / "Night_ Walk")
        self.assertEqual(_tree(self.root), ["Night_ Walk", "Night_ Walk/assets"])
        self.assertEqual(created, [folder / "assets"])

    def test_non_empty_location_with_the_name_only_gets_assets(self):
        loc = self.root / "Film"
        (loc / "Film").mkdir(parents=True)
        (loc / "notes.txt").write_text("x", encoding="utf-8")
        created: list[Path] = []
        folder = make_project_folder(str(loc), "Film", created)
        self.assertEqual(folder, loc)
        self.assertEqual(_tree(self.root), ["Film", "Film/Film", "Film/assets", "Film/notes.txt"])
        self.assertEqual((loc / "notes.txt").read_text(encoding="utf-8"), "x")
        self.assertEqual(created, [loc / "assets"])

    def test_location_with_the_name_and_an_assets_file_is_refused(self):
        loc = self.root / "Film"
        loc.mkdir()
        (loc / "assets").write_text("x", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Cannot create the project folder"):
            make_project_folder(str(loc), "Film")
        self.assertEqual(_tree(self.root), ["Film", "Film/assets"])

    @unittest.skipUnless(os.name == "nt", "case-insensitive match on Windows only")
    def test_name_match_ignores_case_on_windows(self):
        folder = make_project_folder(str(self.root / "my film"), "My Film")
        self.assertEqual(folder, self.root / "my film")
        self.assertEqual(_tree(self.root), ["my film", "my film/assets"])

    def test_only_the_whole_last_segment_counts(self):
        folder = make_project_folder(str(self.root / "My Film" / "Out"), "My Film")
        self.assertEqual(folder, self.root / "My Film" / "Out" / "My Film")
        folder = make_project_folder(str(self.root / "My Film 2"), "My Film")
        self.assertEqual(folder, self.root / "My Film 2" / "My Film")

    def test_bad_locations(self):
        with self.assertRaisesRegex(ValueError, "Choose a location"):
            make_project_folder("  ", "A")
        with self.assertRaisesRegex(ValueError, "full path"):
            make_project_folder("Films\\A", "A")
        self.assertEqual(list(self.root.iterdir()), [])


class CreateNativeProjectLocationTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root / "pack")
        na.set_native_store(self.store)
        self.loc = self.root / "Films"

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def test_location_sets_project_folder(self):
        res = na.create_native_project("Night: Walk", None, None, str(self.loc))
        folder = self.loc / "Night_ Walk"
        self.assertEqual(res["project"]["folder"], str(folder))
        doc = self.store.get_project(res["project"]["id"])
        self.assertEqual(doc["settings"]["project_folder"], str(folder))
        self.assertEqual(_tree(folder), ["assets"])

    def test_location_ending_with_the_name_sets_that_folder(self):
        loc = self.loc / "Film"
        res = na.create_native_project("Film", None, None, str(loc))
        self.assertEqual(res["project"]["folder"], str(loc))
        doc = self.store.get_project(res["project"]["id"])
        self.assertEqual(doc["settings"]["project_folder"], str(loc))
        self.assertEqual(_tree(self.loc), ["Film", "Film/assets"])

    def test_without_location_keeps_default_storage(self):
        res = na.create_native_project("Plain")
        self.assertEqual(res["project"]["folder"], "")
        self.assertFalse(self.loc.exists())

    def test_bad_location_creates_nothing(self):
        with self.assertRaises(ValueError):
            na.create_native_project("A", None, None, "relative\\path")
        self.assertEqual(self.store.list_projects(), [])

    def test_failed_create_removes_the_new_folders(self):
        with mock.patch.object(self.store, "create_project", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                na.create_native_project("A", None, None, str(self.loc))
        self.assertFalse(self.loc.exists())

    def test_failed_create_keeps_an_existing_location_with_the_name(self):
        loc = self.loc / "Film"
        (loc / "01_Planning").mkdir(parents=True)
        with mock.patch.object(self.store, "create_project", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                na.create_native_project("Film", None, None, str(loc))
        self.assertEqual(_tree(self.loc), ["Film", "Film/01_Planning"])

    def test_outputs_saved_flat_in_assets(self):
        pid = na.create_native_project("Film", None, None, str(self.loc))["project"]["id"]
        folder = self.loc / "Film"
        cut_id = next(iter(self.store.get_project(pid)["cuts"]))
        src = self.root / "out.png"
        src.write_bytes(PNG)
        ver = self.store.add_version(pid, cut_id, src)
        saved = Path(ver["asset"]["path"])
        self.assertEqual(saved.parent, folder / "assets")
        self.assertTrue(saved.is_file())
        self.assertEqual(_tree(folder), ["assets", f"assets/{saved.name}"])
        self.assertFalse((self.root / "pack" / "projects" / pid / "assets").exists())
        self.assertEqual(self.store.find_version_asset(ver["id"]), (pid, saved))
        cut = next(c for c in self.store.to_timeline(pid)["cuts"] if c["id"] == cut_id)
        self.assertEqual(cut["media"]["id"], ver["id"])

    def test_unreachable_project_folder_is_a_clear_error(self):
        pid = na.create_native_project("Film", None, None, str(self.loc))["project"]["id"]
        cut_id = next(iter(self.store.get_project(pid)["cuts"]))
        src = self.root / "out.png"
        src.write_bytes(PNG)
        (self.loc / "Film" / "assets").rmdir()
        (self.loc / "Film" / "assets").write_text("not a folder", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Cannot save to the project folder"):
            self.store.add_version(pid, cut_id, src)


class VersionAssetFileTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.pdir = self.root / "projects" / "p"
        (self.pdir / "assets" / "c").mkdir(parents=True)
        (self.pdir / "assets" / "c" / "v.png").write_bytes(PNG)
        (self.root / "ext" / "assets").mkdir(parents=True)
        (self.root / "ext" / "assets" / "v.png").write_bytes(PNG)
        (self.root / "ext" / "v.png").write_bytes(PNG)
        (self.root / "ext" / "assets" / "notes.txt").write_text("x", encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def test_relative_inside_pack_project(self):
        self.assertEqual(version_asset_file(self.pdir, {"path": "assets/c/v.png"}), self.pdir / "assets" / "c" / "v.png")
        self.assertIsNone(version_asset_file(self.pdir, {"path": "../../ext/v.png"}))
        self.assertIsNone(version_asset_file(self.pdir, {"path": "assets/c/missing.png"}))
        self.assertIsNone(version_asset_file(self.pdir, None))

    def test_absolute_only_media_directly_in_an_assets_folder(self):
        ok = self.root / "ext" / "assets" / "v.png"
        self.assertEqual(version_asset_file(self.pdir, {"path": str(ok)}), ok)
        self.assertIsNone(version_asset_file(self.pdir, {"path": str(self.root / "ext" / "v.png")}))
        self.assertIsNone(version_asset_file(self.pdir, {"path": str(self.root / "ext" / "assets" / "notes.txt")}))

    @unittest.skipUnless(os.name == "nt", "Windows drive-relative paths")
    def test_drive_relative_rejected(self):
        self.assertIsNone(version_asset_file(self.pdir, {"path": "C:assets\\v.png"}))


if __name__ == "__main__":
    unittest.main()
