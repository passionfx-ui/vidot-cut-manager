"""0.9.129: plugin project outputs go under assets/images or assets/videos; flat assets/ still readable."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_project.project_settings import (
    ensure_project_assets_dir,
    is_external_project_asset_media,
    project_assets_type_subdir,
)
from gg_project.timeline import version_asset_file

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class ProjectAssetsSubdirTests(unittest.TestCase):
    def test_type_subdir_by_extension(self):
        self.assertEqual(project_assets_type_subdir(".png"), "images")
        self.assertEqual(project_assets_type_subdir(".MP4"), "videos")
        self.assertEqual(project_assets_type_subdir(".webm"), "videos")

    def test_ensure_creates_typed_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "proj"
            img_dir = ensure_project_assets_dir(root, ".png")
            vid_dir = ensure_project_assets_dir(root, ".mp4")
            self.assertEqual(img_dir, root / "assets" / "images")
            self.assertEqual(vid_dir, root / "assets" / "videos")
            self.assertTrue(img_dir.is_dir())
            self.assertTrue(vid_dir.is_dir())

    def test_external_asset_media_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            flat = root / "assets" / "a.png"
            typed = root / "assets" / "videos" / "b.mp4"
            flat.parent.mkdir(parents=True)
            typed.parent.mkdir(parents=True)
            flat.write_bytes(PNG)
            typed.write_bytes(b"\x00" * 4)
            self.assertTrue(is_external_project_asset_media(flat))
            self.assertTrue(is_external_project_asset_media(typed))
            self.assertFalse(is_external_project_asset_media(root / "assets" / "notes.txt"))
            self.assertFalse(is_external_project_asset_media(root / "out.png"))

    def test_version_asset_file_reads_flat_and_typed(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdir = Path(tmp) / "projects" / "p"
            flat = Path(tmp) / "disk" / "assets" / "old.png"
            typed = Path(tmp) / "disk" / "assets" / "images" / "new.png"
            flat.parent.mkdir(parents=True)
            typed.parent.mkdir(parents=True)
            flat.write_bytes(PNG)
            typed.write_bytes(PNG)
            self.assertEqual(version_asset_file(pdir, {"path": str(flat)}), flat)
            self.assertEqual(version_asset_file(pdir, {"path": str(typed)}), typed)


if __name__ == "__main__":
    unittest.main()
