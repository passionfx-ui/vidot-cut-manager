"""0.9.119: animated outputs (history `animated: [true]`, multi-frame WebP / GIF / APNG) are stored as video
versions, and Image to Video only starts from still images (nothing rendered)."""
from __future__ import annotations

import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
import gg_sdk
from gg_project import LocalStore
from gg_project.media_anim import animation_info

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None


def _riff(fourcc: bytes, data: bytes) -> bytes:
    return fourcc + struct.pack("<I", len(data)) + data + (b"\x00" if len(data) & 1 else b"")


def webp(path: Path, durations_ms=(500, 500)) -> Path:
    body = _riff(b"VP8X", bytes([0x02 if durations_ms else 0]) + b"\x00" * 9)
    if durations_ms:
        body += _riff(b"ANIM", b"\x00" * 6)
        for ms in durations_ms:
            body += _riff(b"ANMF", b"\x00" * 12 + ms.to_bytes(3, "little") + b"\x00" + _riff(b"VP8L", b"\x2f" + b"\x00" * 4))
    else:
        body += _riff(b"VP8L", b"\x2f" + b"\x00" * 4)
    path.write_bytes(b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body)
    return path


def gif(path: Path, frames=2, delay_cs=10) -> Path:
    out = b"GIF89a" + struct.pack("<HH", 1, 1) + b"\x80\x00\x00" + b"\x00" * 6
    for _ in range(frames):
        out += b"\x21\xf9\x04\x00" + struct.pack("<H", delay_cs) + b"\x00\x00"
        out += b"\x2c" + struct.pack("<HHHH", 0, 0, 1, 1) + b"\x00" + b"\x02\x02\x4c\x01\x00"
    path.write_bytes(out + b"\x3b")
    return path


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def png(path: Path, apng_frames=0) -> Path:
    out = b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0))
    if apng_frames:
        out += _png_chunk(b"acTL", struct.pack(">II", apng_frames, 0))
        out += _png_chunk(b"fcTL", struct.pack(">IIIIIHHBB", 0, 1, 1, 0, 0, 1, 4, 0, 0))
    out += _png_chunk(b"IDAT", zlib.compress(b"\x00\x00"))
    for i in range(1, apng_frames):
        out += _png_chunk(b"fcTL", struct.pack(">IIIIIHHBB", 2 * i - 1, 1, 1, 0, 0, 1, 4, 0, 0))
        out += _png_chunk(b"fdAT", struct.pack(">I", 2 * i) + zlib.compress(b"\x00\x00"))
    path.write_bytes(out + _png_chunk(b"IEND", b""))
    return path


class AnimationInfoTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_animated_files(self):
        self.assertEqual(animation_info(webp(self.dir / "a.webp", (500, 250, 250))), {"frames": 3, "seconds": 1.0})
        self.assertEqual(animation_info(gif(self.dir / "a.gif", 4, 5)), {"frames": 4, "seconds": 0.2})
        self.assertEqual(animation_info(png(self.dir / "a.png", 3)), {"frames": 3, "seconds": 0.75})
        self.assertEqual(animation_info(webp(self.dir / "z.webp", (0, 0))), {"frames": 2, "seconds": None})

    def test_still_or_unreadable_files(self):
        self.assertIsNone(animation_info(webp(self.dir / "s.webp", ())))
        self.assertIsNone(animation_info(webp(self.dir / "one.webp", (40,))), "one frame is a still")
        self.assertIsNone(animation_info(gif(self.dir / "s.gif", 1)))
        self.assertIsNone(animation_info(png(self.dir / "s.png")))
        (self.dir / "bad.webp").write_bytes(b"RIFF")
        self.assertIsNone(animation_info(self.dir / "bad.webp"))
        self.assertIsNone(animation_info(self.dir / "missing.gif"))
        (self.dir / "x.mp4").write_bytes(b"\x00" * 32)
        self.assertIsNone(animation_info(self.dir / "x.mp4"))

    @unittest.skipIf(Image is None, "Pillow not installed")
    def test_real_encoder_output(self):
        frames = [Image.new("RGB", (8, 8), c) for c in ("red", "green", "blue", "white")]
        for ext, kw in ((".webp", {"lossless": True}), (".gif", {}), (".png", {})):
            path = self.dir / f"real{ext}"
            frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0, **kw)
            self.assertEqual(animation_info(path), {"frames": 4, "seconds": 0.4}, ext)
            still = self.dir / f"still{ext}"
            frames[0].save(still)
            self.assertIsNone(animation_info(still), ext)


class OutputPickTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def _hist(self, name: str, **extra):
        return {"p": {"status": {"status_str": "success"},
                      "outputs": {"9": {"images": [{"filename": name, "subfolder": "", "type": "output"}], **extra}}}}

    def test_animated_flag_from_history(self):
        webp(self.root / "ltx.webp")
        lo, _ = gg_sdk.pick_prompt_output(self._hist("ltx.webp", animated=[True]), "p", self.root)
        self.assertIs(lo["animated"], True)
        lo, _ = gg_sdk.pick_prompt_output(self._hist("ltx.webp", animated=[False]), "p", self.root)
        self.assertIs(lo["animated"], False)
        png(self.root / "still.png")
        lo, _ = gg_sdk.pick_prompt_output(self._hist("still.png"), "p", self.root)
        self.assertIs(lo["animated"], False)

    def test_gif_output_is_picked(self):
        gif(self.root / "a.gif")
        lo, why = gg_sdk.pick_prompt_output(self._hist("a.gif"), "p", self.root)
        self.assertEqual((lo and lo["name"], why), ("a.gif", ""))


class StoreBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root / "pack")
        na.set_native_store(self.store)
        self.pid = self.store.create_project("Anim")["id"]
        self.cut = next(iter(self.store.get_project(self.pid)["cuts"]))
        self.store.update_cut(self.pid, self.cut, {"caption": "A fox looks up", "planned_sec": 2})

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def row(self):
        return next(c for c in self.store.to_timeline(self.pid)["cuts"] if c["id"] == self.cut)


class AddVersionKindTests(StoreBase):
    def test_multi_frame_files_become_video(self):
        for name, maker in (("a.webp", webp), ("a.gif", gif), ("a.png", lambda p: png(p, 2))):
            asset = self.store.add_version(self.pid, self.cut, maker(self.root / name))["asset"]
            self.assertEqual((asset["kind"], asset["animated"], asset["frames"]), ("video", True, 2), name)
            self.assertTrue(Path(self.store.version_file(self.pid, self.store.list_versions(self.pid, self.cut)[0])).is_file())

    def test_animated_flag_marks_video_even_when_the_file_says_one_frame(self):
        asset = self.store.add_version(self.pid, self.cut, png(self.root / "one.png"), animated=True)["asset"]
        self.assertEqual((asset["kind"], asset["animated"]), ("video", True))
        self.assertNotIn("seconds", asset)

    def test_stills_and_real_videos_unchanged(self):
        asset = self.store.add_version(self.pid, self.cut, png(self.root / "s.png"))["asset"]
        self.assertEqual(asset["kind"], "image")
        self.assertNotIn("animated", asset)
        (self.root / "v.mp4").write_bytes(b"\x00" * 64)
        asset = self.store.add_version(self.pid, self.cut, self.root / "v.mp4", animated=True)["asset"]
        self.assertEqual(asset["kind"], "video")
        self.assertNotIn("animated", asset)

    def test_timeline_rows_carry_animated_and_seconds(self):
        ver = self.store.add_version(self.pid, self.cut, webp(self.root / "a.webp", (500, 500, 500, 500)))
        row = self.row()
        self.assertEqual({k: row["media"][k] for k in ("id", "kind", "animated", "seconds")},
                         {"id": ver["id"], "kind": "video", "animated": True, "seconds": 2.0})
        self.assertEqual(row["src_dur"], 2.0)
        v = row["versions_list"][0]
        self.assertEqual((v["kind"], v["animated"], v["seconds"]), ("video", True, 2.0))

    def test_capture_output_with_animated_flag(self):
        out = png(self.root / "ltx_00001_.png")
        lo = {"path": str(out), "name": out.name, "from": "history", "prompt_id": "p1", "animated": True}
        with mock.patch.object(gg_sdk, "prompt_output_info", return_value={"output": lo, "reason": "", "pending": False}):
            res = na.native_capture_prompt_output(self.pid, self.cut, "p1")
        self.assertEqual((res["version"]["asset"]["kind"], res["version"]["asset"]["animated"]), ("video", True))

    def test_import_of_animated_webp(self):
        res = na.native_import_version(self.pid, self.cut, webp(self.root / "clip.webp"))
        self.assertEqual(res["version"]["asset"]["kind"], "video")


class StartImageTests(StoreBase):
    def add(self, name, maker=png, **kw):
        return self.store.add_version(self.pid, self.cut, maker(self.root / name), **kw)

    def test_best_video_falls_back_to_newest_still(self):
        old = self.add("old.png")
        new = self.add("new.png")
        anim = self.add("ltx.png", animated=True)
        self.add("clip.webp", webp)
        self.store.apply_timeline_edit(self.pid, [], {self.cut: {"pick": anim["id"]}})
        self.assertEqual(na.pick_start_version(self.pid, self.cut)[0]["id"], new["id"])
        self.assertEqual(na.pick_start_version(self.pid, self.cut, anim["id"])[0]["id"], new["id"], "selected video skipped")
        self.assertEqual(na.pick_start_version(self.pid, self.cut, old["id"])[0]["id"], old["id"], "selected still kept")

    def test_only_videos_is_a_clear_error(self):
        self.add("ltx.png", animated=True)
        self.add("clip.webp", webp)
        (self.root / "v.mp4").write_bytes(b"\x00" * 64)
        self.store.add_version(self.pid, self.cut, self.root / "v.mp4")
        with self.assertRaises(ValueError) as cm:
            na.pick_start_version(self.pid, self.cut)
        self.assertEqual(str(cm.exception), na.NO_START_IMAGE)
        self.assertIn("still image", na.NO_START_IMAGE)

    def test_old_image_kind_record_of_an_animated_file_is_still_skipped(self):
        still = self.add("s.png")
        self.add("old.webp", webp)
        ver = self.store.list_versions(self.pid, self.cut)[0]
        ver["asset"]["kind"] = "image"
        ver["asset"].pop("animated")
        with mock.patch.object(self.store, "list_versions", return_value=[ver, *self.store.list_versions(self.pid, self.cut)[1:]]):
            self.assertEqual(na.pick_start_version(self.pid, self.cut)[0]["id"], still["id"])


if __name__ == "__main__":
    unittest.main()
