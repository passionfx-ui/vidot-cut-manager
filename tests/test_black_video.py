"""0.9.135: black video detection + one automatic retry with a new seed, then Failed (files kept)."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from PIL import Image

import gg_black
import gg_native_api as na
import gg_sdk
from gg_project import LocalStore

FFMPEG = shutil.which("ffmpeg")


def _webp(path: Path, colors) -> Path:
    frames = [Image.new("RGB", (64, 36), c) for c in colors]
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0, lossless=True)
    return path


def _clip(path: Path, color: str) -> Path:
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={color}:s=128x72:d=1:r=8",
                    "-pix_fmt", "yuv420p", str(path)], check=True, timeout=60)
    return path


class DetectTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_animated_webp_black_and_not(self):
        self.assertIs(gg_black.is_black_media(_webp(self.tmp / "b.webp", [(0, 0, 0)] * 4)), True)
        self.assertIs(gg_black.is_black_media(_webp(self.tmp / "n.webp", [(0, 0, 0), (200, 120, 40), (0, 0, 0)])), False)
        self.assertIs(gg_black.is_black_media(_webp(self.tmp / "g.webp", [(90, 90, 90)] * 3)), False)

    def test_dark_frame_with_bright_detail_is_not_black(self):
        im = Image.new("RGB", (64, 36), (2, 2, 2))
        im.putpixel((5, 5), (255, 255, 255))
        im.save(self.tmp / "d.png")
        self.assertIs(gg_black.is_black_media(self.tmp / "d.png"), False)

    def test_unreadable_is_unknown(self):
        (self.tmp / "x.mp4").write_bytes(b"not a video")
        self.assertIsNone(gg_black.is_black_media(self.tmp / "x.mp4"))
        self.assertIsNone(gg_black.is_black_media(self.tmp / "missing.mp4"))

    @unittest.skipUnless(FFMPEG, "ffmpeg not installed")
    def test_mp4_and_webm(self):
        for ext in ("mp4", "webm"):
            self.assertIs(gg_black.is_black_media(_clip(self.tmp / f"b.{ext}", "black")), True, ext)
            self.assertIs(gg_black.is_black_media(_clip(self.tmp / f"r.{ext}", "red")), False, ext)


class _SyncThread:
    def __init__(self, target, args=(), **_kw):
        self._run = lambda: target(*args)

    def start(self):
        self._run()


# frames must differ or the WebP encoder merges them into one still image
BLACK = [(0, 0, 0), (2, 2, 2), (1, 1, 1)]
API = {
    "3": {"class_type": "KSampler", "inputs": {"seed": 111, "steps": 4}},
    "9": {"class_type": "SaveAnimatedWEBP", "inputs": {"images": ["8", 0]}},
}


class RetryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.store = LocalStore(self.tmp / "pack")
        na.set_native_store(self.store)
        loc = self.tmp / "Film"
        loc.mkdir()
        self.pid = na.create_native_project("Film", None, None, str(loc))["project"]["id"]
        self.cut = next(iter(self.store.get_project(self.pid)["cuts"]))
        self.regen = self.tmp / "regen"
        self.regen.mkdir()
        self._patch = mock.patch.object(gg_sdk, "REGEN_DIR", self.regen)
        self._patch.start()
        self.plan = "native_x"
        (self.regen / f"{self.plan}.json").write_text(json.dumps(API), encoding="utf-8")
        gg_sdk._job.clear()
        gg_sdk._job["status"] = "running"

    def tearDown(self):
        self._patch.stop()
        na.set_native_store(None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, colors_per_run):
        runs = iter(colors_per_run)
        workflows = []

        def runner(args, timeout):
            workflows.append(json.loads(Path(args[args.index("--workflow") + 1]).read_text(encoding="utf-8")))
            return {"ok": True, "job_id": f"job-{len(workflows)}", "seconds": 1.0}

        def capture(pid, cut_id, job_id, wait_sec=0, api_workflow=None, poll_sec=0.25, gen=None, output_nodes=None):
            src = _webp(self.tmp / f"{job_id}.webp", next(runs))
            return {"ok": True, "version": self.store.add_version(pid, cut_id, src, workflow=api_workflow, prompt_id=job_id)}

        with mock.patch.object(gg_sdk, "_runner", side_effect=runner), \
                mock.patch.object(na, "native_capture_prompt_output", side_effect=capture):
            gg_sdk._run_native_worker(self.regen / f"{self.plan}.json", self.pid, self.cut)
        return workflows

    def _versions(self):
        return {v["id"]: v for v in self.store.list_versions(self.pid, self.cut)}

    def test_good_video_runs_once(self):
        wfs = self._run([[(200, 100, 50), (180, 90, 40), (160, 80, 30)]])
        self.assertEqual(len(wfs), 1)
        self.assertEqual(gg_sdk.job_status()["status"], "done")
        self.assertFalse(any(v.get("failed") for v in self._versions().values()))

    def test_black_then_good_retries_once_with_new_seed(self):
        wfs = self._run([BLACK, [(200, 100, 50), (180, 90, 40), (160, 80, 30)]])
        self.assertEqual(len(wfs), 2)
        self.assertNotEqual(wfs[1]["3"]["inputs"]["seed"], 111)
        job = gg_sdk.job_status()
        self.assertEqual(job["status"], "done")
        vers = self._versions()
        self.assertEqual(len(vers), 2, "the black file is kept as a version")
        self.assertEqual(sum(1 for v in vers.values() if v.get("failed")), 1)
        self.assertNotIn(job["versions"][0], [k for k, v in vers.items() if v.get("failed")])

    def test_black_twice_is_failed_and_files_kept(self):
        wfs = self._run([BLACK, [(1, 1, 1), (3, 3, 3), (2, 2, 2)]])
        self.assertEqual(len(wfs), 2, "only one automatic retry")
        job = gg_sdk.job_status()
        self.assertEqual(job["status"], "error")
        self.assertEqual(job["error"], gg_sdk.BLACK_VIDEO_FAILED_MSG)
        vers = self._versions()
        self.assertEqual(len(vers), 2)
        self.assertTrue(all(v.get("failed") for v in vers.values()))
        for v in vers.values():
            self.assertTrue(self.store.version_file(self.pid, v).is_file(), "black files are never deleted")
        tl = self.store.to_timeline(self.pid)
        row = next(c for c in tl["cuts"] if c["id"] == self.cut)
        self.assertTrue(all(v["failed"] for v in row["versions_list"]))
        self.assertTrue(all("black" in v["error"].lower() for v in row["versions_list"]))


if __name__ == "__main__":
    unittest.main()
