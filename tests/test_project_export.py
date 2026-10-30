"""0.9.128: MP4 export of a project made in the plugin (Best, else newest video, else newest image)."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_data
import gg_export
import gg_native_api as na
from gg_project import LocalStore

FF = gg_data.ffmpeg_exe()


@unittest.skipUnless(FF, "ffmpeg not found")
class ProjectExportTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root)
        na.set_native_store(self.store)
        doc = self.store.create_project("Exp")
        self.pid = doc["id"]
        self.c1 = next(iter(doc["cuts"]))
        doc = self.store.add_cut(self.pid)
        self.c2 = [c for c in doc["cuts"] if c != self.c1][0]

    def tearDown(self):
        self._tmp.cleanup()

    def _make(self, name, video=False):
        out = self.root / name
        src = ["-f", "lavfi", "-i", "testsrc=s=320x240:r=24:d=2"] if video else ["-f", "lavfi", "-i", "color=c=red:s=320x240", "-frames:v", "1"]
        subprocess.run([FF, "-y", "-loglevel", "error", *src, str(out)], check=True)
        time.sleep(0.01)
        return out

    def test_pick_order_and_export(self):
        vid = self.store.add_version(self.pid, self.c1, self._make("a.mp4", True))
        self.store.add_version(self.pid, self.c1, self._make("b.png"))   # newest is an image
        img = self.store.add_version(self.pid, self.c2, self._make("c.png"))
        tl, out_dir = na.native_export_timeline(self.pid)
        by = {c["id"]: c for c in tl["cuts"]}
        self.assertEqual(by[self.c1]["media"]["id"], vid["id"])
        self.assertEqual(by[self.c2]["media"], {"id": img["id"], "kind": "image"} | {k: by[self.c2]["media"][k] for k in by[self.c2]["media"] if k not in ("id", "kind")})
        self.assertEqual(out_dir.name, "04_Export")
        res = gg_export.start(self.pid, "720p", tl=tl, out_dir=out_dir, resolve=na.native_media_path)
        self.assertTrue(res["ok"], res)
        for _ in range(600):
            if gg_export.status()["status"] != "running":
                break
            time.sleep(0.1)
        st = gg_export.status()
        self.assertEqual(st["status"], "done", st)
        p = Path(st["path"])
        self.assertTrue(p.is_file())
        self.assertEqual(p.parent, out_dir)
        self.assertEqual(gg_export.export_file(st["file"]), p)

    def test_message_wording(self):
        self.assertNotIn("native", na.NATIVE_UNAVAILABLE.lower())


if __name__ == "__main__":
    unittest.main()
