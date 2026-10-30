"""0.9.116: AI Cut Split through a local Ollama server (urlopen mocked: no network, no LLM)."""
from __future__ import annotations

import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_ltx
import gg_ollama

CUTS = [{"cut": 2, "duration": 2.5, "description": "Wide shot, a fox crosses a snowy field at dawn."},
        {"cut": 1, "duration": 3, "description": "Close-up, the fox sniffs the air, slow push in."}]


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


class FakeOllama:
    """Records requests; answers /api/tags and /api/chat like Ollama."""

    def __init__(self, content=None, models=None, error=None):
        self.requests = []
        self.content = json.dumps(CUTS) if content is None else content
        self.models = ["qwen2.5:7b", "nomic-embed-text:latest", "qwen2.5:3b"] if models is None else models
        self.error = error

    def __call__(self, req, timeout=None):
        body = json.loads(req.data.decode("utf-8")) if req.data else None
        self.requests.append({"url": req.full_url, "method": req.get_method(), "body": body, "timeout": timeout})
        if self.error is not None:
            raise self.error
        if req.full_url.endswith("/api/tags"):
            out = {"models": [{"name": m, "model": m} for m in self.models]}
        else:
            out = {"model": body["model"], "message": {"role": "assistant", "content": self.content}, "done": True}
        return _Resp(json.dumps(out).encode("utf-8"))


class OllamaTestBase(unittest.TestCase):
    def setUp(self):
        self._settings = mock.patch.object(gg_ollama.gg_data, "load_settings", return_value={})
        self._settings.start()

    def tearDown(self):
        self._settings.stop()

    def run_split(self, fake, **kw):
        with mock.patch.object(gg_ollama.urllib.request, "urlopen", fake):
            return gg_ollama.ai_cut_split(kw.pop("story", "A fox in the snow."), kw.pop("model", "qwen2.5:7b"), **kw)


class ChatRequestTests(OllamaTestBase):
    def test_keep_alive_zero_by_default(self):
        fake = FakeOllama()
        self.run_split(fake)
        (req,) = fake.requests
        self.assertEqual(req["url"], "http://127.0.0.1:11434/api/chat")
        self.assertEqual(req["method"], "POST")
        body = req["body"]
        self.assertEqual(body["keep_alive"], 0)
        self.assertIs(body["stream"], False)
        self.assertEqual(body["format"], "json")
        self.assertLessEqual(body["options"]["temperature"], 0.3)
        self.assertEqual(body["model"], "qwen2.5:7b")
        self.assertEqual(body["messages"], [{"role": "user", "content": gg_ltx.CUT_SPLIT_PROMPT + "A fox in the snow."}])
        self.assertEqual(req["timeout"], gg_ollama.CHAT_TIMEOUT)
        self.assertGreaterEqual(gg_ollama.CHAT_TIMEOUT, 120)

    def test_keep_llm_loaded_leaves_keep_alive_to_ollama(self):
        fake = FakeOllama()
        res = self.run_split(fake, keep_loaded=True)
        self.assertNotIn("keep_alive", fake.requests[0]["body"])
        self.assertTrue(res["keep_loaded"])

    def test_base_url_from_setting_then_settings_file(self):
        fake = FakeOllama()
        self.run_split(fake, url="http://10.0.0.5:11434/")
        self.assertEqual(fake.requests[0]["url"], "http://10.0.0.5:11434/api/chat")
        with mock.patch.object(gg_ollama.gg_data, "load_settings", return_value={"ollama_url": "http://box:1234"}):
            self.run_split(fake)
        self.assertEqual(fake.requests[1]["url"], "http://box:1234/api/chat")

    def test_bad_base_url(self):
        for bad in ("file:///etc/passwd", "ftp://x", "localhost:11434"):
            with self.assertRaises(gg_ollama.OllamaError) as cm:
                gg_ollama.base_url(bad)
            self.assertEqual(cm.exception.code, "bad_request")


class ChatAnswerTests(OllamaTestBase):
    def test_valid_answer_returns_cuts_in_order(self):
        res = self.run_split(FakeOllama())
        self.assertEqual(res["cuts"], [
            {"cut": 1, "duration": 3.0, "description": CUTS[1]["description"]},
            {"cut": 2, "duration": 2.5, "description": CUTS[0]["description"]},
        ])
        self.assertEqual((res["model"], res["keep_loaded"], res["base_url"]), ("qwen2.5:7b", False, gg_ollama.DEFAULT_URL))

    def test_object_wrapped_answer(self):
        res = self.run_split(FakeOllama(content=json.dumps({"cuts": CUTS})))
        self.assertEqual(len(res["cuts"]), 2)

    def test_invalid_answer_is_rejected_with_validator_messages(self):
        bad = [{"cut": 1, "duration": 5, "description": "Too long a shot"}]
        with self.assertRaises(gg_ollama.OllamaError) as cm:
            self.run_split(FakeOllama(content=json.dumps(bad)))
        self.assertEqual(cm.exception.code, "invalid")
        self.assertIn('Item 1 (cut 1): "duration" must be between 0.5 and 3 seconds (got 5).', str(cm.exception))
        self.assertEqual(json.loads(cm.exception.raw), bad)

    def test_not_json_and_empty_answers(self):
        for content in ("I cannot help with that.", "   "):
            with self.assertRaises(gg_ollama.OllamaError) as cm:
                self.run_split(FakeOllama(content=content))
            self.assertEqual(cm.exception.code, "invalid")

    def test_input_checks_before_any_request(self):
        fake = FakeOllama()
        for story, model in (("", "m"), ("  ", "m"), ("story", ""), (None, "m"), ("x" * 20001, "m")):
            with self.assertRaises(gg_ollama.OllamaError) as cm:
                self.run_split(fake, story=story, model=model)
            self.assertEqual(cm.exception.code, "bad_request")
        self.assertEqual(fake.requests, [])


class ConnectionTests(OllamaTestBase):
    def test_not_running(self):
        fake = FakeOllama(error=urllib.error.URLError(ConnectionRefusedError(10061, "refused")))
        with self.assertRaises(gg_ollama.OllamaError) as cm:
            self.run_split(fake)
        self.assertEqual(cm.exception.code, "unreachable")
        self.assertEqual(str(cm.exception), "Ollama not running at http://127.0.0.1:11434")

    def test_timeout(self):
        with self.assertRaises(gg_ollama.OllamaError) as cm:
            self.run_split(FakeOllama(error=TimeoutError()))
        self.assertEqual(cm.exception.code, "timeout")

    def test_http_error_carries_ollama_message(self):
        err = urllib.error.HTTPError("http://127.0.0.1:11434/api/chat", 404, "Not Found", {},
                                     io.BytesIO(b'{"error": "model \\"nope\\" not found"}'))
        with self.assertRaises(gg_ollama.OllamaError) as cm:
            self.run_split(FakeOllama(error=err), model="nope")
        self.assertEqual(cm.exception.code, "http")
        self.assertIn('model "nope" not found', str(cm.exception))


class ModelListTests(OllamaTestBase):
    def test_lists_chat_models_sorted(self):
        fake = FakeOllama()
        with mock.patch.object(gg_ollama.urllib.request, "urlopen", fake):
            res = gg_ollama.list_models()
        self.assertEqual(res, {"base_url": gg_ollama.DEFAULT_URL, "models": ["qwen2.5:3b", "qwen2.5:7b"]})
        self.assertEqual((fake.requests[0]["url"], fake.requests[0]["method"]), ("http://127.0.0.1:11434/api/tags", "GET"))

    def test_unreachable(self):
        fake = FakeOllama(error=urllib.error.URLError("refused"))
        with mock.patch.object(gg_ollama.urllib.request, "urlopen", fake), self.assertRaises(gg_ollama.OllamaError) as cm:
            gg_ollama.list_models("http://127.0.0.1:9")
        self.assertEqual(str(cm.exception), "Ollama not running at http://127.0.0.1:9")


if __name__ == "__main__":
    unittest.main()
