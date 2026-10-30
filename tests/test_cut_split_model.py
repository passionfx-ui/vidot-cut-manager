"""0.9.125: AI Cut Split model list / save (gg_cut_split) and the /gonggan/cut-split/model routes
(ComfyUI's folder_paths, PromptServer and aiohttp are stand-ins; no ComfyUI needed)."""
from __future__ import annotations

import asyncio
import importlib
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_cut_split

DEFAULT = gg_cut_split.DEFAULT_CLIP


def lister(folders: dict):
    """folder_paths.get_filename_list stand-in: unknown folder names raise like ComfyUI does."""
    def get(name):
        if name not in folders:
            raise KeyError(name)
        return list(folders[name])
    return get


class ListTests(unittest.TestCase):
    def test_merges_text_encoders_and_clip_deduped_sorted(self):
        get = lister({"text_encoders": ["t5xxl.safetensors", DEFAULT, "b.gguf"],
                      "clip": [DEFAULT, "clip_l.safetensors", "B.gguf"]})
        self.assertEqual(gg_cut_split.list_text_models(get),
                         ["B.gguf", "b.gguf", "clip_l.safetensors", DEFAULT, "t5xxl.safetensors"])

    def test_missing_folder_is_skipped(self):
        self.assertEqual(gg_cut_split.list_text_models(lister({"text_encoders": ["a.safetensors"]})),
                         ["a.safetensors"])
        self.assertEqual(gg_cut_split.list_text_models(lister({"clip": ["old.safetensors"]})), ["old.safetensors"])
        self.assertEqual(gg_cut_split.list_text_models(lister({})), [])

    def test_ignores_empty_and_non_string_names(self):
        get = lister({"text_encoders": ["", "  ", None, 3, "sub/x.safetensors"], "clip": None})
        self.assertEqual(gg_cut_split.list_text_models(get), ["sub/x.safetensors"])

    def test_uses_comfy_folder_paths(self):
        fp = types.ModuleType("folder_paths")
        fp.get_filename_list = lister({"text_encoders": ["q.safetensors"], "clip": ["q.safetensors"]})
        with mock.patch.dict(sys.modules, {"folder_paths": fp}):
            self.assertEqual(gg_cut_split.list_text_models(), ["q.safetensors"])

    def test_empty_outside_comfy(self):
        with mock.patch.dict(sys.modules, {"folder_paths": None}):
            self.assertEqual(gg_cut_split.list_text_models(), [])


class ChoicesTests(unittest.TestCase):
    def choices(self, settings):
        with mock.patch.object(gg_cut_split.gg_data, "load_settings", return_value=settings):
            return gg_cut_split.model_choices(lister({"text_encoders": ["a.safetensors"]}))

    def test_current_setting(self):
        self.assertEqual(self.choices({"cut_split_clip": "a.safetensors"}),
                         {"models": ["a.safetensors"], "current": "a.safetensors", "default": DEFAULT, "use_ai": True})

    def test_default_when_unset(self):
        for s in ({}, {"cut_split_clip": ""}, {"cut_split_clip": "  "}):
            self.assertEqual(self.choices(s)["current"], DEFAULT)

    def test_current_missing_from_list_is_still_reported(self):
        self.assertEqual(self.choices({"cut_split_clip": "gone.safetensors"})["current"], "gone.safetensors")


class SaveTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.file = self.dir / "gonggan_settings.json"
        default = self.dir / "gonggan_settings.default.json"
        default.write_text(json.dumps({"data_root": "", "uid": "demo", "cut_split_clip": DEFAULT,
                                       "cut_split_clip_type": "stable_diffusion"}), encoding="utf-8")
        for name, value in (("SETTINGS_FILE", self.file), ("DEFAULT_SETTINGS_FILE", default)):
            p = mock.patch.object(gg_cut_split.gg_data, name, value)
            p.start()
            self.addCleanup(p.stop)
        self.get = lister({"text_encoders": [DEFAULT, "other.safetensors"]})

    def test_writes_only_cut_split_clip_and_keeps_other_keys(self):
        self.file.write_text(json.dumps({"data_root": "D:/data", "uid": "me", "cut_split_clip_type": "qwen_image"}),
                             encoding="utf-8")
        res = gg_cut_split.save_model(" other.safetensors ", self.get)
        self.assertEqual(json.loads(self.file.read_text(encoding="utf-8")),
                         {"data_root": "D:/data", "uid": "me", "cut_split_clip_type": "qwen_image",
                          "cut_split_clip": "other.safetensors"})
        self.assertEqual(res, {"models": ["other.safetensors", DEFAULT], "current": "other.safetensors",
                               "default": DEFAULT, "use_ai": True})
        self.assertEqual(gg_cut_split.model_settings(), {"clip_name": "other.safetensors", "type": "qwen_image"})
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()),
                         ["gonggan_settings.default.json", "gonggan_settings.json"])

    def test_creates_the_local_file_when_missing(self):
        gg_cut_split.save_model("other.safetensors", self.get)
        self.assertEqual(json.loads(self.file.read_text(encoding="utf-8")), {"cut_split_clip": "other.safetensors"})

    def test_current_value_may_be_missing_from_the_list(self):
        self.file.write_text(json.dumps({"cut_split_clip": "gone.safetensors"}), encoding="utf-8")
        self.assertEqual(gg_cut_split.save_model("gone.safetensors", self.get)["current"], "gone.safetensors")

    def test_rejects_unlisted_and_bad_names(self):
        for name in ("unknown.safetensors", "", "   ", None, 5, "a\nb.safetensors", "x" * 261):
            with self.assertRaises(gg_cut_split.CutSplitError) as cm:
                gg_cut_split.save_model(name, self.get)
            self.assertEqual(cm.exception.code, "bad_request", repr(name))
        self.assertFalse(self.file.exists())

    def test_broken_settings_file_is_not_overwritten(self):
        for text in ("{broken", "[1, 2]"):
            self.file.write_text(text, encoding="utf-8")
            with self.assertRaises(gg_cut_split.CutSplitError):
                gg_cut_split.save_model("other.safetensors", self.get)
            self.assertEqual(self.file.read_text(encoding="utf-8"), text)


class FakeResponse:
    def __init__(self, body, status=200):
        self.body, self.status = body, status


class FakeRoutes:
    def __init__(self):
        self.handlers: dict[tuple[str, str], object] = {}

    def _add(self, method):
        def deco_for(path):
            def deco(fn):
                self.handlers[(method, path)] = fn
                return fn
            return deco
        return deco_for

    def __getattr__(self, method):
        if method in ("get", "post", "put", "delete", "patch"):
            return self._add(method.upper())
        raise AttributeError(method)


class FakeRequest:
    def __init__(self, body=None):
        self._body = body

    async def json(self):
        if self._body is None:
            raise ValueError("no body")
        return self._body


def load_routes():
    """Import routes.py as part of a throwaway package with stand-in server / aiohttp modules."""
    fake_routes = FakeRoutes()
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=fake_routes))
    web = types.ModuleType("aiohttp.web")
    web.Response = FakeResponse
    web.json_response = lambda body, status=200: FakeResponse(body, status)
    aiohttp = types.ModuleType("aiohttp")
    aiohttp.web = web
    pkg = types.ModuleType("gg_routes_pkg")
    pkg.__path__ = [str(REPO)]
    mods = {"server": server, "aiohttp": aiohttp, "aiohttp.web": web, "gg_routes_pkg": pkg}
    with mock.patch.dict(sys.modules, mods):
        routes = importlib.import_module("gg_routes_pkg.routes")
        cut_split = sys.modules["gg_routes_pkg.gg_cut_split"]
    for name in [n for n in sys.modules if n.startswith("gg_routes_pkg.")]:
        del sys.modules[name]
    return routes, cut_split, fake_routes.handlers


class RouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.routes, cls.cut_split, cls.handlers = load_routes()

    def call(self, method, body=None):
        return asyncio.run(self.handlers[(method, "/gonggan/cut-split/model")](FakeRequest(body)))

    def test_routes_registered(self):
        self.assertIn(("GET", "/gonggan/cut-split/model"), self.handlers)
        self.assertIn(("POST", "/gonggan/cut-split/model"), self.handlers)
        self.assertIn(("POST", "/gonggan/ai-cut-split"), self.handlers)

    def test_get_returns_list_current_and_default(self):
        fp = types.ModuleType("folder_paths")
        fp.get_filename_list = lister({"text_encoders": ["b.safetensors", "a.safetensors"], "clip": ["a.safetensors"]})
        with mock.patch.dict(sys.modules, {"folder_paths": fp}), \
                mock.patch.object(self.cut_split.gg_data, "load_settings", return_value={}):
            res = self.call("GET")
        self.assertEqual(res.status, 200)
        self.assertEqual(res.body, {"ok": True, "models": ["a.safetensors", "b.safetensors"], "current": DEFAULT,
                                    "default": DEFAULT, "use_ai": True})

    def test_post_saves(self):
        want = {"models": ["a.safetensors"], "current": "a.safetensors", "default": DEFAULT, "use_ai": True}
        with mock.patch.object(self.cut_split, "save_settings", return_value=want) as save:
            res = self.call("POST", {"clip_name": "a.safetensors"})
        save.assert_called_once_with("a.safetensors", None)
        self.assertEqual((res.status, res.body), (200, {"ok": True, **want}))

    def test_post_bad_name_is_400(self):
        err = self.cut_split.CutSplitError("bad_request", "Choose a text model file.")
        with mock.patch.object(self.cut_split, "save_settings", side_effect=err):
            res = self.call("POST", None)
        self.assertEqual((res.status, res.body), (400, {"ok": False, "message": "Choose a text model file."}))

    def test_post_unexpected_error_is_500(self):
        with mock.patch.object(self.cut_split, "save_settings", side_effect=OSError("disk full")):
            res = self.call("POST", {"clip_name": "a.safetensors"})
        self.assertEqual(res.status, 500)
        self.assertIn("disk full", res.body["message"])


if __name__ == "__main__":
    unittest.main()
