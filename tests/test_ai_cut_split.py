"""0.9.122: AI Cut Split through TextGenerate in ComfyUI on the Comfy SDK path (SDK run and ComfyUI HTTP mocked:
no proxy, no ComfyUI, no model)."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_cut_split
import gg_ltx
import gg_sdk

CUTS = [{"cut": 2, "duration": 2.5, "description": "Wide shot, a fox crosses a snowy field at dawn."},
        {"cut": 1, "duration": 3, "description": "Close-up, the fox sniffs the air, slow push in."}]
COMFY = "http://127.0.0.1:8188"


class FakeComfy:
    """Stands in for the SDK runner (gg_sdk.run_api_workflow) and ComfyUI's /history and /free."""

    def __init__(self, answers=None, run_results=None, history=None, free_error=None):
        self.answers = list(answers if answers is not None else [json.dumps(CUTS)])
        self.run_results = list(run_results or [])
        self.history = history
        self.free_error = free_error
        self.workflows: list[dict] = []
        self.wf_files: list[Path] = []
        self.http: list[tuple[str, dict | None]] = []
        self.runs = 0

    def run(self, wf_file, wait_sec):
        self.wf_files.append(Path(wf_file))
        self.workflows.append(json.loads(Path(wf_file).read_text(encoding="utf-8")))
        self.wait_sec = wait_sec
        self.runs += 1
        if self.run_results:
            return self.run_results.pop(0)
        return {"ok": True, "job_id": f"job-{self.runs}", "files": [], "seconds": 1.0}

    def http_call(self, url, payload=None, timeout=None):
        self.http.append((url, payload))
        if url == f"{COMFY}/free":
            if self.free_error:
                raise self.free_error
            return b""
        job_id = url.rsplit("/", 1)[-1]
        if self.history is not None:
            return json.dumps(self.history).encode("utf-8")
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        entry = {"status": {"status_str": "success", "completed": True, "messages": []},
                 "outputs": {"3": {"text": [answer]}}}
        return json.dumps({job_id: entry}).encode("utf-8")

    @property
    def free_calls(self):
        return [p for u, p in self.http if u.endswith("/free")]


class CutSplitTestBase(unittest.TestCase):
    def setUp(self):
        patches = [
            mock.patch.object(gg_cut_split.gg_data, "load_settings", return_value={}),
            mock.patch.object(gg_sdk.gg_data, "load_settings", return_value={}),
            mock.patch.object(gg_sdk, "busy_message", return_value=""),
            mock.patch.object(gg_cut_split, "HISTORY_WAIT_SEC", 0.0),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        if gg_cut_split._run_lock.locked():
            gg_cut_split._run_lock.release()
        self.addCleanup(lambda: gg_cut_split._run_lock.release() if gg_cut_split._run_lock.locked() else None)

    def split(self, fake, story="A fox in the snow."):
        with mock.patch.object(gg_sdk, "run_api_workflow", fake.run), \
                mock.patch.object(gg_cut_split, "_http", fake.http_call):
            return gg_cut_split.ai_cut_split(story)

    def split_error(self, fake, story="A fox in the snow."):
        with self.assertRaises(gg_cut_split.CutSplitError) as cm:
            self.split(fake, story)
        return cm.exception


class WorkflowTests(CutSplitTestBase):
    def test_textgenerate_graph(self):
        fake = FakeComfy()
        self.split(fake)
        (wf,) = fake.workflows
        self.assertEqual(wf["1"], {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_4b_int8_convrot.safetensors", "type": "stable_diffusion", "device": "default"}})
        self.assertEqual(wf["2"]["class_type"], "TextGenerate")
        gen = wf["2"]["inputs"]
        self.assertEqual(gen["clip"], ["1", 0])
        self.assertEqual(gen["prompt"], gg_cut_split.build_prompt("A fox in the snow."))
        self.assertEqual(gen["max_length"], 1536)
        self.assertEqual(gen["sampling_mode"], "off")
        self.assertIs(gen["thinking"], False)
        self.assertEqual(wf["3"], {"class_type": "PreviewAny", "inputs": {"source": ["2", 0]}})

    def test_model_from_settings(self):
        fake = FakeComfy()
        with mock.patch.object(gg_cut_split.gg_data, "load_settings",
                               return_value={"cut_split_clip": "other.safetensors", "cut_split_clip_type": "qwen_image"}):
            res = self.split(fake)
        self.assertEqual(fake.workflows[0]["1"]["inputs"]["clip_name"], "other.safetensors")
        self.assertEqual(fake.workflows[0]["1"]["inputs"]["type"], "qwen_image")
        self.assertEqual(res["model"], "other.safetensors")

    def test_default_settings_file_has_the_model_and_no_ollama(self):
        s = json.loads((REPO / "gonggan_settings.default.json").read_text(encoding="utf-8"))
        self.assertEqual(s["cut_split_clip"], gg_cut_split.DEFAULT_CLIP)
        self.assertEqual(s["cut_split_clip_type"], gg_cut_split.DEFAULT_CLIP_TYPE)
        self.assertNotIn("ollama_url", s)

    def test_workflow_file_is_removed_after_the_run(self):
        fake = FakeComfy()
        self.split(fake)
        self.assertFalse(fake.wf_files[0].exists())
        self.assertEqual(fake.wait_sec, gg_cut_split.RUN_TIMEOUT)

    def test_runner_command(self):
        with mock.patch.object(gg_sdk, "_runner", return_value={"ok": True}) as runner:
            gg_sdk.run_api_workflow(Path("wf.json"), 600)
        args, kw = runner.call_args
        self.assertEqual(args[0], ["run", "--workflow", "wf.json", "--confirm", "--timeout", "600"])
        self.assertGreater(kw["timeout"], 600)


class AnswerTests(CutSplitTestBase):
    def test_presplit_skips_text_model(self):
        story = """Cut 1: Snow field
A fox crosses the field.
Fox: Where is home?
"""
        fake = FakeComfy()
        res = self.split(fake, story)
        self.assertEqual((fake.runs, res.get("presplit"), len(res["cuts"])), (0, True, 1))
        self.assertEqual(res["cuts"][0]["caption"], "Fox: Where is home?")
        self.assertEqual(res["attempts"], 0)

    def test_valid_answer_returns_cuts_in_order_and_reads_history(self):
        fake = FakeComfy()
        res = self.split(fake)
        self.assertEqual(res["cuts"], [
            {"cut": 1, "duration": 3.0, "title": gg_ltx.normalize_cut_title(CUTS[1]["description"]),
             "description": CUTS[1]["description"], "caption": CUTS[1]["description"]},
            {"cut": 2, "duration": 2.5, "title": gg_ltx.normalize_cut_title(CUTS[0]["description"]),
             "description": CUTS[0]["description"], "caption": CUTS[0]["description"]},
        ])
        self.assertEqual(res["attempts"], 1)
        self.assertEqual(res["model"], gg_cut_split.DEFAULT_CLIP)
        self.assertEqual(fake.http[0], (f"{COMFY}/history/job-1", None))

    def test_code_fences_and_extra_text(self):
        fake = FakeComfy(answers=["Sure! Here are the cuts:\n```json\n" + json.dumps(CUTS) + "\n```\nEnjoy."])
        self.assertEqual(len(self.split(fake)["cuts"]), 2)

    def test_bad_json_is_retried_with_the_problems(self):
        bad = json.dumps([{"cut": 1, "duration": 5, "description": "Too long a shot"}])
        fake = FakeComfy(answers=[bad, json.dumps(CUTS)])
        res = self.split(fake)
        self.assertEqual((fake.runs, res["attempts"], len(res["cuts"])), (2, 2, 2))
        retry_prompt = fake.workflows[1]["2"]["inputs"]["prompt"]
        self.assertTrue(retry_prompt.startswith(gg_cut_split.build_prompt("A fox in the snow.")))
        self.assertIn('"duration" must be between 0.5 and 3 seconds (got 5)', retry_prompt)
        self.assertNotEqual(retry_prompt, fake.workflows[0]["2"]["inputs"]["prompt"])

    def test_gives_up_after_one_retry(self):
        fake = FakeComfy(answers=["I cannot help with that."])
        err = self.split_error(fake)
        self.assertEqual(err.code, "invalid")
        self.assertEqual(fake.runs, gg_cut_split.RETRIES + 1)
        self.assertIn("not a valid cut list (tried 2 times)", str(err))
        self.assertIn("No JSON array found", str(err))

    def test_empty_answer_is_invalid(self):
        self.assertEqual(self.split_error(FakeComfy(answers=["   "])).code, "invalid")

    def test_execution_error_in_history(self):
        hist = {"job-1": {"status": {"status_str": "error", "messages": [
            ["execution_start", {}],
            ["execution_error", {"node_type": "TextGenerate", "exception_message": "out of memory"}]]},
            "outputs": {}}}
        err = self.split_error(FakeComfy(history=hist))
        self.assertEqual(err.code, "sdk")
        self.assertEqual(str(err), "The text model failed in ComfyUI: TextGenerate: out of memory")

    def test_no_text_output(self):
        err = self.split_error(FakeComfy(history={"job-1": {"status": {}, "outputs": {"3": {}}}}))
        self.assertEqual((err.code, str(err)), ("no_text", "The text model finished but returned no text."))
        err = self.split_error(FakeComfy(history={}))
        self.assertEqual(err.code, "no_text")
        self.assertIn("ComfyUI history has no run job-1", str(err))


class FreeTests(CutSplitTestBase):
    def test_free_after_success(self):
        fake = FakeComfy()
        self.split(fake)
        self.assertEqual(fake.free_calls, [{"unload_models": True, "free_memory": True}])
        self.assertEqual(fake.http[-1][0], f"{COMFY}/free")

    def test_free_once_after_failure_and_retries(self):
        fake = FakeComfy(answers=["nope"])
        self.split_error(fake)
        self.assertEqual(len(fake.free_calls), 1)
        fake = FakeComfy(run_results=[{"ok": False, "error": "proxy unreachable at http://127.0.0.1:8189"}])
        self.split_error(fake)
        self.assertEqual(len(fake.free_calls), 1)

    def test_free_failure_is_ignored(self):
        res = self.split(FakeComfy(free_error=OSError("refused")))
        self.assertEqual(len(res["cuts"]), 2)


class ErrorTests(CutSplitTestBase):
    def run_error(self, error):
        return self.split_error(FakeComfy(run_results=[{"ok": False, "error": error}]))

    def test_proxy_down(self):
        err = self.run_error("ConnectError: [WinError 10061] No connection could be made")
        self.assertEqual(err.code, "sdk")
        self.assertEqual(str(err), "Comfy SDK proxy not reachable at http://127.0.0.1:8189. "
                                   "Start it with start_proxy.bat, then try again.")

    def test_model_missing(self):
        err = self.run_error("ComfyError: Prompt outputs failed validation: CLIPLoader: Value not in list: "
                             "clip_name: 'qwen3vl_4b_int8_convrot.safetensors' not in [...]")
        self.assertIn("Text model qwen3vl_4b_int8_convrot.safetensors not found in ComfyUI", str(err))
        self.assertIn('"cut_split_clip" in gonggan_settings.json', str(err))

    def test_node_missing(self):
        err = self.run_error("ComfyError: Cannot execute because node TextGenerate does not exist.")
        self.assertEqual(str(err), "This ComfyUI has no TextGenerate node. Update ComfyUI to use AI Make Cut.")

    def test_timeout_and_other(self):
        self.assertIn("did not finish within 600 s", str(self.run_error("timed out after 600 s; cancel requested")))
        self.assertEqual(str(self.run_error("boom")), "AI Make Cut failed in ComfyUI: boom")

    def test_failed_job_reads_the_comfy_error(self):
        hist = {"job-9": {"status": {"messages": [
            ["execution_error", {"node_type": "CLIPLoader", "exception_message": "file is corrupt"}]]}}}
        fake = FakeComfy(run_results=[{"ok": False, "job_id": "job-9", "error": "JobFailed: job job-9 ended failed"}],
                         history=hist)
        self.assertEqual(str(self.split_error(fake)), "The text model failed in ComfyUI: CLIPLoader: file is corrupt")

    def test_input_checks_before_any_run(self):
        fake = FakeComfy()
        for story in ("", "  ", None, 5, "x" * 20001):
            self.assertEqual(self.split_error(fake, story=story).code, "bad_request")
        self.assertEqual((fake.runs, fake.http), (0, []))

    def test_busy_while_another_sdk_job_runs(self):
        fake = FakeComfy()
        with mock.patch.object(gg_sdk, "busy_message", return_value="Generate All is running."):
            err = self.split_error(fake)
        self.assertEqual((err.code, str(err)), ("busy", "Generate All is running."))
        self.assertEqual(fake.runs, 0)



class BusyMessageTests(unittest.TestCase):
    def test_reflects_regen_and_generate_all(self):
        with mock.patch.dict(gg_sdk._job, {"status": "idle"}, clear=True), \
                mock.patch.dict(gg_sdk._batch, {"status": "idle", "items": []}, clear=True):
            self.assertEqual(gg_sdk.busy_message(), "")
            gg_sdk._job["status"] = "running"
            self.assertIn("Queue / Regen job is running", gg_sdk.busy_message())
            gg_sdk._batch["status"] = "running"
            self.assertIn("Generate All is running", gg_sdk.busy_message())


class NoOllamaTests(unittest.TestCase):
    def test_ollama_module_and_routes_are_gone(self):
        self.assertFalse((REPO / "gg_ollama.py").exists())
        routes = (REPO / "routes.py").read_text(encoding="utf-8")
        self.assertNotIn("ollama", routes.lower())
        self.assertIn('@routes.post("/gonggan/ai-cut-split")', routes)


if __name__ == "__main__":
    unittest.main()
