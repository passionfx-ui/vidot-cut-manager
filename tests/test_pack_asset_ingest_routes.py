"""0.9.137 item 6: pack-store projects (empty project_folder) ingest via the same routes/handlers as the UI.

Paths traced:
  Queue / SDK regen done -> gg_sdk._run_native_worker -> native_capture_prompt_output
    <- UI also POST /gonggan/capture-output on execution_success (same handler).
  Make Video -> POST /gonggan/regen confirm -> _run_native_worker -> same capture path
    (animated WebP output -> assets/videos).
  Import -> POST /gonggan/import-version multipart {pid, cut_id, file} -> native_import_version.
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
for p in (REPO, TESTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import gg_native_api as na
import gg_sdk
from gg_project import LocalStore
from gg_project.timeline import version_asset_file
from test_animated_versions import webp
from test_cut_split_model import FakeRequest, load_routes

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
TINY_MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"


class FakeMultipartPart:
    def __init__(self, name: str, *, data: bytes | None = None, text: str | None = None, filename: str | None = None):
        self.name = name
        self.filename = filename
        self._data = data if data is not None else (text or "").encode()
        self._pos = 0

    async def text(self) -> str:
        return self._data.decode()

    async def read_chunk(self, size: int) -> bytes:
        chunk = self._data[self._pos : self._pos + size]
        self._pos += len(chunk)
        return chunk


class FakeMultipartReader:
    def __init__(self, parts: list[FakeMultipartPart]):
        self._parts = parts

    def __aiter__(self):
        self._it = iter(self._parts)
        return self

    async def __anext__(self) -> FakeMultipartPart:
        try:
            return next(self._it)
        except StopIteration as ex:
            raise StopAsyncIteration from ex


class FakeMultipartRequest:
    def __init__(self, parts: list[FakeMultipartPart]):
        self._parts = parts

    async def multipart(self) -> FakeMultipartReader:
        return FakeMultipartReader(self._parts)


class PackAssetIngestRouteTests(unittest.TestCase):
    """Plugin `projects/<pid>/` storage (E2E 136b): new files under assets/images|videos, not assets/<cutId>/."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self.tmp.name))
        na.set_native_store(self.store)
        self.routes, _, self.handlers = load_routes()
        self.routes.gg_native_api.set_native_store(self.store)
        self.pid = self.store.create_project("PackIngest")["id"]
        self.cut = next(iter(self.store.get_project(self.pid)["cuts"]))
        self.pdir = self.store._project_dir(self.pid)
        self.legacy_dir = self.pdir / "assets" / self.cut
        self.legacy_dir.mkdir(parents=True)
        self.legacy_file = self.legacy_dir / "legacy_keep.png"
        self.legacy_file.write_bytes(b"LEGACY_KEEP")

    def tearDown(self):
        na.set_native_store(None)
        self.tmp.cleanup()
        for name in [n for n in list(sys.modules) if n.startswith("gg_routes_pkg.")]:
            del sys.modules[name]

    def _legacy_untouched(self):
        self.assertTrue(self.legacy_file.is_file())
        self.assertEqual(self.legacy_file.read_bytes(), b"LEGACY_KEEP")
        self.assertEqual(
            version_asset_file(self.pdir, {"path": f"assets/{self.cut}/legacy_keep.png"}),
            self.legacy_file,
        )

    def test_capture_output_route_regen_png_goes_to_assets_images(self):
        """UI: execution_success -> POST /gonggan/capture-output {pid, cut_id, prompt_id}."""
        out = Path(self.tmp.name) / "z-image_00001_.png"
        out.write_bytes(PNG)
        lo = {"path": str(out), "name": out.name, "from": "history", "prompt_id": "job-regen-1"}
        with mock.patch.object(gg_sdk, "prompt_output_info", return_value={"output": lo, "reason": "", "pending": False}):
            res = asyncio.run(
                self.handlers[("POST", "/gonggan/capture-output")](
                    FakeRequest({"pid": self.pid, "cut_id": self.cut, "prompt_id": "job-regen-1"})
                )
            )
        self.assertEqual(res.status, 200)
        self.assertTrue(res.body.get("ok"))
        rel = res.body["version"]["asset"]["path"].replace("\\", "/")
        self.assertTrue(rel.startswith("assets/images/"), rel)
        self.assertNotIn(f"assets/{self.cut}/", rel)
        saved = self.pdir / rel
        self.assertTrue(saved.is_file())
        self._legacy_untouched()

    def test_capture_output_route_make_video_webp_goes_to_assets_videos(self):
        """Make Video SDK job -> same native_capture_prompt_output (animated WebP -> kind video)."""
        out = webp(Path(self.tmp.name) / "ltx_00001_.webp", (400, 400))
        lo = {
            "path": str(out),
            "name": out.name,
            "from": "history",
            "prompt_id": "job-i2v-1",
            "animated": True,
        }
        with mock.patch.object(gg_sdk, "prompt_output_info", return_value={"output": lo, "reason": "", "pending": False}):
            res = asyncio.run(
                self.handlers[("POST", "/gonggan/capture-output")](
                    FakeRequest({"pid": self.pid, "cut_id": self.cut, "prompt_id": "job-i2v-1"})
                )
            )
        rel = res.body["version"]["asset"]["path"].replace("\\", "/")
        self.assertTrue(rel.startswith("assets/videos/"), rel)
        self.assertEqual(res.body["version"]["asset"]["kind"], "video")
        self._legacy_untouched()

    def test_import_version_route_image_and_mp4_subdirs(self):
        """UI Import button -> POST /gonggan/import-version multipart."""
        handler = self.handlers[("POST", "/gonggan/import-version")]
        img_req = FakeMultipartRequest(
            [
                FakeMultipartPart("pid", text=self.pid),
                FakeMultipartPart("cut_id", text=self.cut),
                FakeMultipartPart("file", data=PNG, filename="picked.png"),
            ]
        )
        img_res = asyncio.run(handler(img_req))
        self.assertEqual(img_res.status, 200)
        img_rel = img_res.body["version"]["asset"]["path"].replace("\\", "/")
        self.assertTrue(img_rel.startswith("assets/images/"), img_rel)

        vid_req = FakeMultipartRequest(
            [
                FakeMultipartPart("pid", text=self.pid),
                FakeMultipartPart("cut_id", text=self.cut),
                FakeMultipartPart("file", data=TINY_MP4, filename="clip.mp4"),
            ]
        )
        vid_res = asyncio.run(handler(vid_req))
        vid_rel = vid_res.body["version"]["asset"]["path"].replace("\\", "/")
        self.assertTrue(vid_rel.startswith("assets/videos/"), vid_rel)
        self.assertNotEqual(Path(img_rel).name, Path(vid_rel).name)
        self._legacy_untouched()


if __name__ == "__main__":
    unittest.main()
