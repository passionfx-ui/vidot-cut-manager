"""Tests for native cut-source workflow resolution (gg_project.cut_source)."""
from __future__ import annotations

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
from gg_project.cut_source import (
    effective_workflow_kind,
    format_source_fallback,
    resolve_native_cut_source,
    version_media_kind,
    workflow_media_kind,
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

    def test_no_pick_uses_newest_version(self):
        cut = {"pick_version_id": None, "workflow_sha": "cutsha"}
        versions = [
            {"id": "vv", "asset": {"kind": "video"}, "workflow_sha": "vsha"},
            {"id": "vi", "asset": {"kind": "image"}, "workflow_sha": "isha"},
        ]
        blobs = {"vsha": WF_VIDEO, "isha": WF_IMAGE, "cutsha": WF_CUT}
        self.assertEqual(effective_workflow_kind(None, cut, versions), "video")
        out = resolve_native_cut_source(cut, versions, blobs.get, None, is_ui_workflow=_is_ui)
        self.assertEqual(out["workflow"], WF_VIDEO)
        cut["pick_version_id"] = "gone"
        self.assertEqual(effective_workflow_kind(None, cut, versions), "video")

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
        """I14: opening a cut returns that cut's graph. A video Best take does not replace it."""
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
        self.assertEqual(data["workflow"], WF_CUT)
        self.assertEqual(data["source"], "stored")
        self.assertIsNone(data.get("fallback"))
        self.assertEqual(na.native_version_workflow(pid, cut_id, v_vid["id"])["workflow"], WF_VIDEO)
        again = na.native_cut_source_workflow(pid, cut_id, kind="video")
        self.assertEqual(again["workflow"], WF_CUT)
        self.assertIsNone(again.get("kind_used"))

    def test_api_kind_query_override(self):
        """I14: kind=video does not substitute the project Video template."""
        doc = self.store.create_project("P")
        pid = doc["id"]
        cut_id = next(iter(doc["cuts"].values()))["id"]
        png = self._png("a.png")
        v_img = self.store.add_version(pid, cut_id, png, workflow=WF_IMAGE)
        self.store.apply_timeline_edit(pid, [cut_id], {cut_id: {"in": 0, "sec": 3.0, "pick": v_img["id"]}})

        data = na.native_cut_source_workflow(pid, cut_id, kind="video")
        self.assertIsNone(data["workflow"])
        self.assertIsNone(data["source"])
        self.assertIsNone(data["kind_used"])
        self.assertIsNone(data.get("fallback"))
        self.assertEqual(na.native_version_workflow(pid, cut_id, v_img["id"])["workflow"], WF_IMAGE)

    def test_video_tab_gets_start_image_and_description(self):
        """I14: opening a cut does not build a Video-template tab. Image to Video is a separate plan."""
        video_tpl = {"nodes": [
            {"id": 1, "type": "LoadImage", "title": "Start Image",
             "widgets_values": ["old.png", "image"],
             "widgets_values_named": {"image": "old.png", "upload": "image"}},
            {"id": 2, "type": "CLIPTextEncode", "title": "Prompt", "widgets_values": ["old"]},
        ], "links": [], "version": 0.4}
        doc = self.store.create_project("P")
        pid = doc["id"]
        cut_id = next(iter(doc["cuts"].values()))["id"]
        v_img = self.store.add_version(pid, cut_id, self._png("a.png"), workflow=WF_IMAGE)
        with mock.patch.object(na, "project_video_template", return_value=("V", video_tpl)) as video_tpl_call, \
             mock.patch.object(na, "cut_prompt_text", return_value="a cat runs"), \
             mock.patch.object(na, "stage_start_image", return_value=f"gonggan/start_{v_img['id']}.png"):
            data = na.native_cut_source_workflow(pid, cut_id, kind="video")
        video_tpl_call.assert_not_called()
        self.assertIsNone(data["workflow"])
        self.assertIsNone(data["source"])
        self.assertEqual(video_tpl["nodes"][1]["widgets_values"][0], "old")
        self.assertEqual(na.native_version_workflow(pid, cut_id, v_img["id"])["workflow"], WF_IMAGE)
        self.assertIsNone(na.native_cut_source_workflow(pid, cut_id, kind="image")["workflow"])

    def test_version_media_kind(self):
        self.assertEqual(version_media_kind({"asset": {"kind": "video"}}), "video")

    def test_selected_kind_never_opens_the_other_kind(self):
        """Imported image + video without workflows: each opens its own kind's template, not the cut's image graph."""
        doc = self.store.create_project("P", template_graph=WF_IMAGE)
        pid = doc["id"]
        cut_id = next(iter(doc["cuts"].values()))["id"]
        mp4 = Path(self._tmp.name) / "b.mp4"
        mp4.write_bytes(b"\x00" * 8)
        self.store.add_version(pid, cut_id, self._png("a.png"))
        v_vid = self.store.add_version(pid, cut_id, mp4)
        video_tpl = {"nodes": [{"id": 5, "type": "LTXVImgToVideo"}], "links": [], "version": 0.4}
        with mock.patch.object(na, "project_video_template", return_value=("V", video_tpl)) as video_tpl_call:
            vid = na.native_cut_source_workflow(pid, cut_id, kind="video")
            video_tpl_call.assert_not_called()
            self.assertEqual(vid["workflow"], WF_IMAGE)
            self.assertEqual(vid["source"], "stored")
            self.assertIsNone(vid.get("fallback"))
            self.assertEqual(workflow_media_kind(vid["workflow"]), "image")
            self.assertEqual(na.native_cut_source_workflow(pid, cut_id, kind="image")["workflow"], WF_IMAGE)
            self.store.apply_timeline_edit(pid, [cut_id], {cut_id: {"in": 0, "sec": 3.0, "pick": v_vid["id"]}})
            self.assertEqual(na.native_cut_source_workflow(pid, cut_id)["workflow"], WF_IMAGE)


class WorkflowMediaKindTests(unittest.TestCase):
    def test_ui_and_api_graphs(self):
        self.assertEqual(workflow_media_kind(WF_IMAGE), "image")
        self.assertEqual(workflow_media_kind(WF_VIDEO), "video")
        self.assertEqual(workflow_media_kind(WF_CUT), "image")
        self.assertIsNone(workflow_media_kind(WF_TPL))
        self.assertIsNone(workflow_media_kind(None))
        api = {"1": {"class_type": "EmptyFlux2LatentImage"}, "2": {"class_type": "SaveImage"}}
        self.assertEqual(workflow_media_kind(api), "image")
        self.assertEqual(workflow_media_kind({"9": {"class_type": "SaveAnimatedWEBP"}}), "video")
        self.assertEqual(workflow_media_kind({"nodes": [{"type": "VHS_VideoCombine"}]}), "video")

    def test_kind_template_beats_other_kind_graphs(self):
        cut = {"pick_version_id": "vv", "workflow_sha": "cutsha"}
        versions = [
            {"id": "vv", "asset": {"kind": "video"}, "workflow_sha": None},
            {"id": "vi", "asset": {"kind": "image"}, "workflow_sha": "isha"},
        ]
        blobs = {"isha": WF_IMAGE, "cutsha": WF_CUT}
        tpls = {"video": WF_VIDEO, "image": WF_TPL}
        out = resolve_native_cut_source(cut, versions, blobs.get, WF_TPL, is_ui_workflow=_is_ui, kind_template=tpls.get)
        self.assertEqual(out["workflow"], WF_VIDEO)
        self.assertEqual(out["source"], "template")
        self.assertEqual(out["kind_used"], "video")
        out = resolve_native_cut_source(cut, versions, blobs.get, WF_TPL, requested_kind="image",
                                        is_ui_workflow=_is_ui, kind_template=tpls.get)
        self.assertEqual(out["workflow"], WF_IMAGE)

    def test_cut_graph_of_the_wanted_kind_still_opens(self):
        cut = {"pick_version_id": None, "workflow_sha": "cutsha"}
        versions = [{"id": "vi", "asset": {"kind": "image"}, "workflow_sha": None}]
        out = resolve_native_cut_source(cut, versions, {"cutsha": WF_CUT}.get, None, is_ui_workflow=_is_ui,
                                        kind_template=lambda _k: WF_TPL)
        self.assertEqual(out["workflow"], WF_CUT)
        cut["workflow_sha"] = "unknown"
        out = resolve_native_cut_source(cut, versions, {"unknown": WF_TPL}.get, None, requested_kind="video",
                                        is_ui_workflow=_is_ui, kind_template={"video": WF_VIDEO}.get)
        self.assertEqual(out["workflow"], WF_VIDEO)


if __name__ == "__main__":
    unittest.main()


class ImportStyleGuard(unittest.TestCase):
    """ComfyUI loads this pack as a package: top-level 'from gg_project' inside a function must have a relative try-first."""

    def test_native_api_has_no_bare_gg_project_import(self):
        import ast
        src = Path(__file__).resolve().parent.parent.joinpath("gg_native_api.py").read_text(encoding="utf-8")
        tree = ast.parse(src)
        bad = []
        for fn in [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]:
            for node in ast.walk(fn):
                if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("gg_project") and node.level == 0:
                    # allowed only inside an `except ImportError` handler
                    in_handler = any(
                        isinstance(h, ast.ExceptHandler) and node in list(ast.walk(h))
                        for t in ast.walk(fn) if isinstance(t, ast.Try) for h in t.handlers
                    )
                    if not in_handler:
                        bad.append(node.lineno)
        self.assertEqual(bad, [])

