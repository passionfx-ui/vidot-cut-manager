"""0.9.125: AI Cut Split Use AI setting, missing-model and memory pre-check (gg_cut_split) and their routes
(folder_paths, comfy.model_management, PromptServer and aiohttp are stand-ins; no ComfyUI, no model, no GPU)."""
from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
for p in (REPO, TESTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import gg_cut_split
import gg_sdk
from test_ai_cut_split import FakeComfy
from test_cut_split_model import FakeRequest, lister, load_routes

DEFAULT = gg_cut_split.DEFAULT_CLIP
GB = 1024 ** 3
URL = "https://huggingface.co/Comfy-Org/Fibo-2.0/resolve/main/text_encoders/qwen3vl_4b_int8_convrot.safetensors"
PAGE = "https://huggingface.co/Comfy-Org/Fibo-2.0/blob/main/text_encoders/qwen3vl_4b_int8_convrot.safetensors"


def settings(value: dict):
    return mock.patch.object(gg_cut_split.gg_data, "load_settings", return_value=value)


class FakeDevice:
    def __init__(self, kind):
        self.type = kind

    def __str__(self):
        return f"{self.type}:0"


class FakeLoaded:
    def __init__(self, size, fail=False):
        self.size, self.fail = size, fail

    def model_loaded_memory(self):
        if self.fail:
            raise RuntimeError("gone")
        return self.size


def fake_mm(kind="cuda", free=8 * GB, loaded=(), cpu=False, directml=False, error=None):
    mm = types.SimpleNamespace(directml_enabled=directml, current_loaded_models=list(loaded))

    def get_torch_device():
        if error:
            raise error
        return FakeDevice(kind)

    mm.get_torch_device = get_torch_device
    mm.get_free_memory = lambda dev=None: free
    mm.cpu_mode = lambda: cpu
    return mm


class UseAiTests(unittest.TestCase):
    def test_default_on(self):
        for s in ({}, {"cut_split_enabled": True}, {"cut_split_enabled": None}, {"cut_split_enabled": "yes"}):
            self.assertTrue(gg_cut_split.use_ai_enabled(s), s)

    def test_off_values(self):
        for v in (False, 0, "false", "0", " Off ", "no"):
            self.assertFalse(gg_cut_split.use_ai_enabled({"cut_split_enabled": v}), v)

    def test_reads_settings_file(self):
        with settings({"cut_split_enabled": False}):
            self.assertFalse(gg_cut_split.use_ai_enabled())
            self.assertFalse(gg_cut_split.model_choices(lister({}))["use_ai"])

    def test_default_settings_file_has_use_ai_on(self):
        s = json.loads((REPO / "gonggan_settings.default.json").read_text(encoding="utf-8"))
        self.assertTrue(gg_cut_split.use_ai_enabled(s))


class SaveSettingsTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.file = self.dir / "gonggan_settings.json"
        default = self.dir / "gonggan_settings.default.json"
        default.write_text(json.dumps({"cut_split_clip": DEFAULT}), encoding="utf-8")
        for name, value in (("SETTINGS_FILE", self.file), ("DEFAULT_SETTINGS_FILE", default)):
            p = mock.patch.object(gg_cut_split.gg_data, name, value)
            p.start()
            self.addCleanup(p.stop)
        self.get = lister({"text_encoders": [DEFAULT, "other.safetensors"]})

    def saved(self):
        return json.loads(self.file.read_text(encoding="utf-8"))

    def test_use_ai_off_then_on_keeps_other_keys(self):
        self.file.write_text(json.dumps({"uid": "me", "cut_split_clip": "other.safetensors"}), encoding="utf-8")
        res = gg_cut_split.save_settings(use_ai=False, lister=self.get)
        self.assertEqual(self.saved(), {"uid": "me", "cut_split_clip": "other.safetensors", "cut_split_enabled": False})
        self.assertFalse(res["use_ai"])
        self.assertTrue(gg_cut_split.save_settings(use_ai=True, lister=self.get)["use_ai"])
        self.assertIs(self.saved()["cut_split_enabled"], True)

    def test_model_and_use_ai_together(self):
        res = gg_cut_split.save_settings("other.safetensors", False, lister=self.get)
        self.assertEqual(self.saved(), {"cut_split_clip": "other.safetensors", "cut_split_enabled": False})
        self.assertEqual((res["current"], res["use_ai"]), ("other.safetensors", False))

    def test_bad_input_writes_nothing(self):
        for kw in ({}, {"use_ai": "off"}, {"use_ai": 1}, {"clip_name": ""}, {"clip_name": "unlisted.safetensors"},
                   {"clip_name": "other.safetensors", "use_ai": "no"}):
            with self.assertRaises(gg_cut_split.CutSplitError) as cm:
                gg_cut_split.save_settings(lister=self.get, **kw)
            self.assertEqual(cm.exception.code, "bad_request", kw)
        self.assertFalse(self.file.exists())

    def test_broken_file_is_not_overwritten(self):
        self.file.write_text("{broken", encoding="utf-8")
        with self.assertRaises(gg_cut_split.CutSplitError):
            gg_cut_split.save_settings(use_ai=False, lister=self.get)
        self.assertEqual(self.file.read_text(encoding="utf-8"), "{broken")


class MissingModelTests(unittest.TestCase):
    def test_default_model_has_download_links_and_folder(self):
        self.assertEqual(gg_cut_split.missing_model_info(DEFAULT),
                         {"name": DEFAULT, "folder": "models/text_encoders", "url": URL, "page": PAGE})

    def test_other_model_folder_only(self):
        self.assertEqual(gg_cut_split.missing_model_info("x.safetensors"),
                         {"name": "x.safetensors", "folder": "models/text_encoders", "url": "", "page": ""})

    def test_precheck_reports_missing_and_checks_nothing_else(self):
        mm = mock.Mock()
        with settings({}):
            pre = gg_cut_split.precheck(lister({"text_encoders": ["other.safetensors"]}), mm=mm)
        self.assertEqual(pre, {"use_ai": True, "model": DEFAULT, "missing": gg_cut_split.missing_model_info(DEFAULT),
                               "memory": None})
        mm.get_torch_device.assert_not_called()

    def test_precheck_finds_model_in_clip_folder(self):
        with settings({}):
            pre = gg_cut_split.precheck(lister({"clip": [DEFAULT]}), resolver=lambda f, n: None, mm=fake_mm())
        self.assertIsNone(pre["missing"])


class MemoryTests(unittest.TestCase):
    def test_memory_info_gpu_counts_loaded_models(self):
        mm = fake_mm(free=2 * GB, loaded=[FakeLoaded(3 * GB), FakeLoaded(1 * GB, fail=True), FakeLoaded(-5)])
        self.assertEqual(gg_cut_split.memory_info(mm), {"gpu": True, "device": "cuda:0", "free": 5 * GB})

    def test_memory_info_xpu(self):
        self.assertEqual(gg_cut_split.memory_info(fake_mm(kind="xpu", free=20 * GB))["free"], 20 * GB)

    def test_memory_info_cpu(self):
        self.assertEqual(gg_cut_split.memory_info(fake_mm(kind="cpu")), {"gpu": False, "device": "cpu", "free": None})
        self.assertFalse(gg_cut_split.memory_info(fake_mm(kind="cuda", cpu=True))["gpu"])

    def test_memory_info_unmeasurable_or_broken(self):
        self.assertEqual(gg_cut_split.memory_info(fake_mm(kind="mps"))["free"], None)
        self.assertEqual(gg_cut_split.memory_info(fake_mm(directml=True))["free"], None)
        self.assertEqual(gg_cut_split.memory_info(fake_mm(error=RuntimeError("no torch"))),
                         {"gpu": None, "device": "", "free": None})

    def test_memory_info_outside_comfy(self):
        with mock.patch.dict(sys.modules, {"comfy": None, "comfy.model_management": None}):
            self.assertEqual(gg_cut_split.memory_info(), {"gpu": None, "device": "", "free": None})

    def test_memory_warning(self):
        size = 4 * GB
        need = size + gg_cut_split.VRAM_MARGIN
        self.assertIsNone(gg_cut_split.memory_warning({"gpu": True, "free": need}, size))
        self.assertEqual(gg_cut_split.memory_warning({"gpu": True, "free": need - 1}, size),
                         {"reason": "low_vram", "free": need - 1, "need": need, "size": size})
        self.assertEqual(gg_cut_split.memory_warning({"gpu": False, "free": None}, size)["reason"], "no_gpu")
        self.assertEqual(gg_cut_split.memory_warning({"gpu": False}, None),
                         {"reason": "no_gpu", "free": None, "need": None, "size": None})
        self.assertIsNone(gg_cut_split.memory_warning({"gpu": None, "free": None}, size))
        self.assertIsNone(gg_cut_split.memory_warning({"gpu": True, "free": 1}, None))

    def test_model_file_size(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "m.safetensors"
            f.write_bytes(b"\0" * 1234)
            calls = []

            def resolver(folder, name):
                calls.append(folder)
                return str(f) if folder == "clip" else None

            self.assertEqual(gg_cut_split.model_file_size("m.safetensors", resolver), 1234)
            self.assertEqual(calls, ["text_encoders", "clip"])
            self.assertIsNone(gg_cut_split.model_file_size("m.safetensors", lambda a, b: str(Path(d) / "nope")))
            self.assertIsNone(gg_cut_split.model_file_size("m.safetensors", mock.Mock(side_effect=KeyError("x"))))

    def precheck(self, mm, size=4 * GB):
        with settings({}), mock.patch.object(gg_cut_split, "model_file_size", return_value=size):
            return gg_cut_split.precheck(lister({"text_encoders": [DEFAULT]}), mm=mm)

    def test_precheck_low_vram(self):
        pre = self.precheck(fake_mm(free=3 * GB))
        self.assertEqual(pre["memory"]["reason"], "low_vram")
        self.assertEqual(pre["memory"]["need"], 4 * GB + gg_cut_split.VRAM_MARGIN)
        self.assertIsNone(pre["missing"])

    def test_precheck_enough_vram(self):
        self.assertIsNone(self.precheck(fake_mm(free=16 * GB))["memory"])

    def test_precheck_no_gpu(self):
        self.assertEqual(self.precheck(fake_mm(kind="cpu"))["memory"]["reason"], "no_gpu")


class UseAiOffTests(unittest.TestCase):
    def test_precheck_off_checks_nothing(self):
        get = mock.Mock(side_effect=AssertionError("must not list models"))
        mm = mock.Mock()
        with settings({"cut_split_enabled": False}):
            pre = gg_cut_split.precheck(get, mm=mm)
        self.assertEqual(pre, {"use_ai": False, "model": DEFAULT, "missing": None, "memory": None})
        mm.get_torch_device.assert_not_called()

    def test_split_refuses_without_loading_anything(self):
        fake = FakeComfy()
        with settings({"cut_split_enabled": False}), \
                mock.patch.object(gg_sdk, "run_api_workflow", fake.run), \
                mock.patch.object(gg_cut_split, "_http", fake.http_call):
            with self.assertRaises(gg_cut_split.CutSplitError) as cm:
                gg_cut_split.ai_cut_split("A fox.")
        self.assertEqual((cm.exception.code, str(cm.exception)), ("disabled", "Turn on Use AI in Project Settings."))
        self.assertEqual((fake.runs, fake.http), (0, []))


class SplitMissingModelTests(unittest.TestCase):
    def test_split_does_not_run_when_the_model_is_missing(self):
        fake = FakeComfy()
        fp = types.ModuleType("folder_paths")
        fp.get_filename_list = lister({"text_encoders": ["other.safetensors"]})
        with settings({}), mock.patch.dict(sys.modules, {"folder_paths": fp}), \
                mock.patch.object(gg_sdk, "run_api_workflow", fake.run), \
                mock.patch.object(gg_cut_split, "_http", fake.http_call):
            with self.assertRaises(gg_cut_split.CutSplitError) as cm:
                gg_cut_split.ai_cut_split("A fox.")
        self.assertEqual(cm.exception.code, "missing_model")
        self.assertIn("models/text_encoders", str(cm.exception))
        self.assertEqual(cm.exception.extra, {"missing": gg_cut_split.missing_model_info(DEFAULT)})
        self.assertEqual((fake.runs, fake.http), (0, []))

    def test_split_runs_when_the_model_is_listed(self):
        fake = FakeComfy()
        fp = types.ModuleType("folder_paths")
        fp.get_filename_list = lister({"text_encoders": [DEFAULT]})
        with settings({}), mock.patch.object(gg_sdk.gg_data, "load_settings", return_value={}), \
                mock.patch.object(gg_sdk, "busy_message", return_value=""), \
                mock.patch.object(gg_cut_split, "HISTORY_WAIT_SEC", 0.0), \
                mock.patch.dict(sys.modules, {"folder_paths": fp}), \
                mock.patch.object(gg_sdk, "run_api_workflow", fake.run), \
                mock.patch.object(gg_cut_split, "_http", fake.http_call):
            res = gg_cut_split.ai_cut_split("A fox.")
        self.assertEqual(fake.runs, 1)
        self.assertEqual(len(res["cuts"]), 2)


class RouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.routes, cls.cut_split, cls.handlers = load_routes()

    def call(self, method, path, body=None):
        return asyncio.run(self.handlers[(method, path)](FakeRequest(body)))

    def test_precheck_route(self):
        self.assertIn(("GET", "/gonggan/cut-split/precheck"), self.handlers)
        want = {"use_ai": True, "model": DEFAULT, "missing": self.cut_split.missing_model_info(DEFAULT), "memory": None}
        with mock.patch.object(self.cut_split, "precheck", return_value=want):
            res = self.call("GET", "/gonggan/cut-split/precheck")
        self.assertEqual((res.status, res.body), (200, {"ok": True, **want}))

    def test_post_use_ai(self):
        want = {"models": [], "current": DEFAULT, "default": DEFAULT, "use_ai": False}
        with mock.patch.object(self.cut_split, "save_settings", return_value=want) as save:
            res = self.call("POST", "/gonggan/cut-split/model", {"use_ai": False})
        save.assert_called_once_with(None, False)
        self.assertEqual((res.status, res.body), (200, {"ok": True, **want}))

    def test_split_missing_model_body_carries_the_notice(self):
        info = self.cut_split.missing_model_info(DEFAULT)
        err = self.cut_split.CutSplitError("missing_model", "Text model is missing.", {"missing": info})
        with mock.patch.object(self.cut_split, "ai_cut_split", side_effect=err):
            res = self.call("POST", "/gonggan/ai-cut-split", {"story": "x"})
        self.assertEqual(res.status, 409)
        self.assertEqual(res.body, {"ok": False, "code": "missing_model", "message": "Text model is missing.",
                                    "missing": info})

    def test_split_disabled_is_409(self):
        err = self.cut_split.CutSplitError("disabled", "Turn on Use AI in Project Settings.")
        with mock.patch.object(self.cut_split, "ai_cut_split", side_effect=err):
            res = self.call("POST", "/gonggan/ai-cut-split", {"story": "x"})
        self.assertEqual((res.status, res.body["code"]), (409, "disabled"))


if __name__ == "__main__":
    unittest.main()
