"""AI Make Cut as the cut-card menu runs it.

Right-click -> dialog POST /gonggan/ai-cut-split {background:true} -> poll
GET /gonggan/ai-cut-split/status -> POST /gonggan/cut/add-list.

The text model is a stand-in (FakeComfy). Nothing is sent to ComfyUI at 127.0.0.1:8188.
Use AI off is the settings gate: the job is refused before any model run.
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
for p in (REPO, TESTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import gg_native_api as na
import gg_wfnodes
from gg_project import LocalStore
from test_ai_cut_split import FakeComfy
from test_ai_make_cut import PAPER_BOAT_ANSWER, PAPER_BOAT_STORY
from test_cut_split_model import FakeRequest, load_routes

SG = "f2fdebf6-dfaf-43b6-9eb2-7f70613cfdc1"


def _app_template():
    """Image app template: the prompt lives on a subgraph widget, not a root node titled Prompt."""
    return {
        "nodes": [
            {"id": 57, "type": SG, "mode": 0,
             "widgets_values": ["old"], "widgets_values_named": {"text": "old"}},
            {"id": 9, "type": "SaveImage", "mode": 0},
        ],
        "definitions": {"subgraphs": [{
            "id": SG,
            "nodes": [{"id": 27, "type": "CLIPTextEncode", "mode": 0,
                       "widgets_values": ["old"], "widgets_values_named": {"text": "old"}}],
        }]},
        "extra": {"linearData": {"inputs": [[f"{SG}:27", "text"]]}},
    }


class QueryRequest(FakeRequest):
    def __init__(self, body=None, query=None):
        super().__init__(body)
        self.query = query or {}


class AiMakeCutUiPathTests(unittest.TestCase):
    def setUp(self):
        self.routes, self.cut_split, self.handlers = load_routes()
        self.route_na = self.routes.gg_native_api
        self.tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self.tmp.name))
        na.set_native_store(self.store)
        self.route_na.set_native_store(self.store)
        self.pid = self.store.create_project("AI Make")["id"]
        self.seed = next(iter(self.store.get_project(self.pid)["cuts"]))
        if self.cut_split._run_lock.locked():
            self.cut_split._run_lock.release()
        with self.cut_split._job_lock:
            self.cut_split._job.clear()

    def tearDown(self):
        if self.cut_split._run_lock.locked():
            self.cut_split._run_lock.release()
        with self.cut_split._job_lock:
            self.cut_split._job.clear()
        na.set_native_store(None)
        self.route_na.set_native_store(None)
        self.tmp.cleanup()
        for name in [n for n in list(sys.modules) if n.startswith("gg_routes_pkg.")]:
            del sys.modules[name]

    def call(self, method, path, body=None, query=None):
        return asyncio.run(self.handlers[(method, path)](QueryRequest(body, query)))

    def test_use_ai_off_stops_before_the_model(self):
        """Same answer the live precheck gives when Use AI is off. No workflow is run."""
        fake = FakeComfy(answers=[PAPER_BOAT_ANSWER])
        with mock.patch.object(self.cut_split.gg_data, "load_settings", return_value={"cut_split_enabled": False}), \
                mock.patch.object(self.cut_split.gg_sdk, "run_api_workflow", fake.run), \
                mock.patch.object(self.cut_split, "_http", fake.http_call):
            pre = self.call("GET", "/gonggan/cut-split/precheck")
            res = self.call("POST", "/gonggan/ai-cut-split", {
                "story": PAPER_BOAT_STORY,
                "captions": "dialogue_only",
                "background": True,
                "pid": self.pid,
            })
        self.assertEqual(pre.status, 200)
        self.assertEqual(pre.body["use_ai"], False)
        self.assertIsNone(pre.body["missing"])
        self.assertEqual(pre.body["model"], self.cut_split.DEFAULT_CLIP)
        self.assertEqual(res.status, 409)
        self.assertEqual(res.body["code"], "disabled")
        self.assertEqual(fake.runs, 0)
        self.assertEqual(fake.http, [])
        self.assertEqual(len(self.store.get_project(self.pid)["cuts"]), 1)

    def test_dialog_job_then_add_list_creates_cuts(self):
        """Dialog body, status poll, then the Create button's add-list body. Model call is FakeComfy."""
        fake = FakeComfy(answers=[PAPER_BOAT_ANSWER])
        settings = {"cut_split_enabled": True}
        with mock.patch.object(self.cut_split.gg_data, "load_settings", return_value=settings), \
                mock.patch.object(self.cut_split.gg_sdk, "busy_message", return_value=""), \
                mock.patch.object(self.cut_split.gg_sdk, "run_api_workflow", fake.run), \
                mock.patch.object(self.cut_split, "_http", fake.http_call), \
                mock.patch.object(self.cut_split, "list_text_models", return_value=[self.cut_split.DEFAULT_CLIP]), \
                mock.patch.object(self.cut_split, "model_file_size", return_value=1024), \
                mock.patch.object(self.cut_split, "memory_info", return_value={"gpu": True, "free": 10 ** 12}):
            pre = self.call("GET", "/gonggan/cut-split/precheck")
            self.assertEqual(pre.body["use_ai"], True)
            self.assertIsNone(pre.body["missing"])
            started = self.call("POST", "/gonggan/ai-cut-split", {
                "story": PAPER_BOAT_STORY,
                "captions": "dialogue_only",
                "background": True,
                "pid": self.pid,
            })
            self.assertEqual(started.status, 202)
            job_id = started.body["job"]["id"]
            done = None
            for _ in range(500):
                status = self.call("GET", "/gonggan/ai-cut-split/status", query={"job": job_id})
                done = status.body["job"]
                if done and done.get("state") != "running":
                    break
                time.sleep(0.01)
        self.assertEqual(done["state"], "done", done)
        self.assertEqual(done["pid"], self.pid)
        self.assertGreaterEqual(fake.runs, 1)
        self.assertTrue(fake.http, "the model run must go through the stand-in, not ComfyUI")
        cuts = done["cuts"]
        payload = {
            "pid": self.pid,
            "cuts": [
                {
                    "cut": c["cut"],
                    "duration": c["duration"],
                    "description": c["description"],
                    "title": c.get("title") or "",
                    "caption": c.get("caption") or "",
                    "notes": c.get("notes") or "",
                    **({"scene": c["scene"]} if c.get("scene") else {}),
                }
                for c in cuts
            ],
            "after": self.seed,
        }
        created = self.call("POST", "/gonggan/cut/add-list", payload)
        self.assertEqual(created.status, 200, created.body)
        ids = created.body["cut_ids"]
        self.assertEqual(len(ids), len(cuts))
        doc = self.store.get_project(self.pid)
        for cid, src in zip(ids, cuts):
            cut = doc["cuts"][cid]
            self.assertEqual(cut["prompt"], src["description"])
            graph = self.store.get_blob(self.pid, cut["workflow_sha"])
            self.assertIn(src["description"], gg_wfnodes.prompt_text(graph))

    def test_add_list_writes_an_app_template_subgraph_prompt(self):
        app = _app_template()
        with mock.patch.object(self.route_na, "copy_new_cut_template", return_value=app):
            res = self.route_na.native_add_cut_list(
                self.pid, [{"cut": 1, "duration": 2.5, "description": "Harbor at sunrise"}],
            )
        cid = res["cut_ids"][0]
        graph = self.store.get_blob(self.pid, self.store.get_project(self.pid)["cuts"][cid]["workflow_sha"])
        inner = graph["definitions"]["subgraphs"][0]["nodes"][0]
        self.assertEqual(inner["widgets_values_named"]["text"], "Harbor at sunrise")
        self.assertEqual(graph["nodes"][0]["widgets_values_named"]["text"], "Harbor at sunrise")
