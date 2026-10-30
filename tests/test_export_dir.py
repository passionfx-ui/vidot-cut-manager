"""MP4 export folder naming (03_Edit vs edit) and animated WebP segments."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_export
from gg_project.project_settings import FALLBACK_MP4_EXPORT_DIR, STANDARD_EDIT_DIR, project_mp4_export_dir


class ExportDirTests(unittest.TestCase):
    def test_fallback_edit_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "MyProject"
            base.mkdir()
            out = project_mp4_export_dir(base)
            self.assertEqual(out.name, FALLBACK_MP4_EXPORT_DIR)
            self.assertEqual(out.parent, base)

    def test_standard_03_edit(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "Proj"
            (base / STANDARD_EDIT_DIR).mkdir(parents=True)
            out = project_mp4_export_dir(base)
            self.assertEqual(out.name, STANDARD_EDIT_DIR)


@unittest.skipUnless(subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0, "ffmpeg")
class AnimatedWebpSegmentTests(unittest.TestCase):
    def test_segment_cmd_uses_ignore_loop_for_webp(self):
        with tempfile.TemporaryDirectory() as tmp:
            webp = Path(tmp) / "a.webp"
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "2", str(webp),
                ],
                check=True,
            )
            clip = {"media": {"kind": "video"}, "in": 0.0}
            cmd = gg_export._segment_cmd("ffmpeg", clip, webp, Path(tmp) / "out.mkv", 320, 240, 24, 24, False)
            joined = " ".join(cmd)
            self.assertIn("-ignore_loop", joined)
            self.assertNotIn("-ss", joined)


if __name__ == "__main__":
    unittest.main()
