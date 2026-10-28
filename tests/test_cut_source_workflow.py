"""Tests for native cut-source workflow resolution (gg_project.cut_source)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
from gg_project import LocalStore
from gg_project.cut_source import (
    effective_workflow_kind,
    format_source_fallback,
    resolve_native_cut_source,
    version_media_kind,
)

WF_IMAGE = {"nodes": [{"id": 1, "type": "SaveImage"}], "version": 0.4}
WF_VIDEO = {"nodes": [{"id": 2, "type": "SaveVideo"}], "version": 0.4}
WF_CUT = {"nodes": [{"id": 9, "type": "EmptyLatentImage"}], "version": 0.4}
WF_TPL = {"nodes": [{"id": 3, "type": "Template"}], "version": 0.4}


def _is_ui(wf: dict) -> bool:
    return isinstance(wf.get("nodes"), list)


class CutSourceLogicTests(unittest.TestCase):
    def test_effective_kind_switch_over_rep(self):
        cut = {"pick_version_id": "v1"}
        versions = [{"id": "v1", "asset": {"kind": "video"}}]
        self.assertEqual(effective_workflow_kind("image", cut, versions), "image")
        self.assertEqual(effective_workflow_kind(None, cut, versions), "video")

    def test_fallback_label(self):
        fb = format_source_fallback("video", "image", "stored")
        self.assertIn("no video workflow", fb)
        self.assertIn("image", fb)

    def test_resolve_prefers_video_version_over_cut_sha(self):
        cut = {"pick_version_id": "vp", "workflow_sha": "cutsha"}
        versions = [
            {"id": "vp", "asset": {"kind": "video"}, "workflow_sha": "vsha"},
        ]
        blobs = {"vsha": WF_VIDEO, "cutsha": WF_CUT}

        def get_workflow(sha):
            return blobs.get(sha)

        out = resolve_native_cut_source(
            cut, versions, get_workflow, None, requested_kind=None, is_ui_workflow=_is_ui
        )
        self.assertEqual(out["source"], "stored")
        self.assertEqual(out["workflow"], WF_VIDEO)
        self.assertIsNone(out["fallback"])

    def test_resolve_switch_to_video_with_image_pick(self):
        cut = {"pick_version_id": "vi", "workflow_sha": "cutsha"}
        versions = [
            {"id": "vv", "asset": {"kind": "video"}, "workflow_sha": "vsha"},
            {"id": "vi", "asset": {"kind": "image"}, "workflow_sha": "isha"},
        ]
        blobs = {"vsha": WF_VIDEO, "isha": WF_IMAGE, "cutsha": WF_CUT}

        def get_workflow(sha):
            return blobs.get(sha)

        out = resolve_native_cut_source(
            cut, versions, get_workflow, WF_TPL, requested_kind="video", is_ui_workflow=_is_ui
        )
        self.assertEqual(out["workflow"], WF_VIDEO)
        self.assertIsNone(out["fallback"])

    def test_resolve_fallback_to_image_when_no_video(self):
        cut = {"pick_version_id": "vi", "workflow_sha": None}
        versions = [{"id": "vi", "asset": {"kind": "image"}, "workflow_sha": "isha"}]
        blobs = {"isha": WF_IMAGE}

        def get_workflow(sha):
            return blobs.get(sha)

        out = resolve_native_cut_source(
            cut, versions, get_workflow, WF_TPL, requested_kind="video", is_ui_workflow=_is_ui
        )
        self.assertEqual(out["workflow"], WF_IMAGE)
        self.assertIsNotNone(out["fallback"])
        self.assertIn("no video workflow", out["fallback"])

    def test_template_last(self):
        cut = {"pick_version_id": None, "workflow_sha": None}
        versions = []

        def get_workflow(_sha):
            return None

        out = resolve_native_cut_source(
            cut, versions, get_workflow, WF_TPL, requested_kind="video", is_ui_workflow=_is_ui
        )
        self.assertEqual(out["source"], "template")
        self.assertEqual(out["workflow"], WF_TPL)
        self.assertIn("template", out["fallback"] or "")


class NativeCutSourceIntegrationTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        na.set_native_store(self.store)

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def _png(self, name: str) -> Path:
        p = Path(self._tmp.name) / name
        p.write_bytes(b"\x89PNG\r\n\x1a\n" + b"x" * 16)
        return p

    def test_api_video_pick_beats_cut_workflow(self):
        doc = self.store.create_project("P", template_graph=WF_CUT)
        pid = doc["id"]
        cut_id = next(iter(doc["cuts"].values()))["id"]
        png = self._png("a.png")
        mp4 = Path(self._tmp.name) / "b.mp4"
        mp4.write_bytes(b"\x00" * 8)
        self.store.add_version(pid, cut_id, png, workflow=WF_IMAGE)
        v_vid = self.store.add_version(pid, cut_id, mp4, workflow=WF_VIDEO)
        self.store.apply_timeline_edit(pid, [cut_id], {cut_id: {"in": 0, "sec": 3.0, "pick": v_vid["id"]}})

        data = na.native_cut_source_workflow(pid, cut_id)
        self.assertEqual(data["workflow"], WF_VIDEO)
        self.assertIsNone(data.get("fallback"))

    def test_api_kind_query_override(self):
        doc = self.store.create_project("P")
        pid = doc["id"]
        cut_id = next(iter(doc["cuts"].values()))["id"]
        png = self._png("a.png")
        v_img = self.store.add_version(pid, cut_id, png, workflow=WF_IMAGE)
        self.store.apply_timeline_edit(pid, [cut_id], {cut_id: {"in": 0, "sec": 3.0, "pick": v_img["id"]}})

        data = na.native_cut_source_workflow(pid, cut_id, kind="video")
        self.assertEqual(data["workflow"], WF_IMAGE)
        self.assertIn("no video workflow", data.get("fallback") or "")

    def test_version_media_kind(self):
        self.assertEqual(version_media_kind({"asset": {"kind": "video"}}), "video")


if __name__ == "__main__":
    unittest.main()
