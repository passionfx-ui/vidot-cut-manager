"""0.9.125: AI Make Cut (internally cut split) — compact JSON prompt, MAX_LENGTH 1536, cut-off answers reported as
"Story too long", and the background run the UI polls (POST /gonggan/ai-cut-split {background: true} +
GET /gonggan/ai-cut-split/status). SDK run and ComfyUI HTTP are mocked: no proxy, no ComfyUI, no model."""
from __future__ import annotations

import asyncio
import json
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
for p in (REPO, TESTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import gg_cut_split
import gg_ltx
from test_ai_cut_split import CutSplitTestBase, FakeComfy
from test_cut_split_model import FakeRequest, load_routes

PAPER_BOAT_STORY = (
    "A girl finds a paper boat on a rainy street. She picks it up and sees a drawing of a lighthouse inside. "
    "She follows the gutter stream to the harbor. At the end of the pier, an old lighthouse keeper waves at her. "
    "She smiles and hands him the boat."
)
# What the compact prompt asks for: one line, short descriptions, no prose.
PAPER_BOAT_ANSWER = (
    '[{"cut":1,"duration":3,"description":"Wide shot, a girl finds a paper boat on a rainy street"},'
    '{"cut":2,"duration":2.5,"description":"Close-up, the girl sees a lighthouse drawing inside the paper boat"},'
    '{"cut":3,"duration":3,"description":"Tracking shot, the girl follows the gutter stream to the rainy harbor"},'
    '{"cut":4,"duration":2,"description":"Medium shot, an old lighthouse keeper waves at the girl at the pier end"},'
    '{"cut":5,"duration":2.5,"description":"Close-up, the smiling girl hands the paper boat to the old keeper"}]'
)
# The same answer cut off by max_length in the middle of cut 4.
TRUNCATED_ANSWER = PAPER_BOAT_ANSWER[: PAPER_BOAT_ANSWER.index("an old lighthouse keeper")]


class CompactPromptTests(unittest.TestCase):
    def test_max_length_is_1536(self):
        self.assertEqual(gg_cut_split.MAX_LENGTH, 1536)
        wf = gg_cut_split.build_workflow("x", gg_cut_split.model_settings())
        self.assertEqual(wf["2"]["inputs"]["max_length"], 1536)

    def test_prompt_demands_compact_json_without_prose(self):
        p = gg_ltx.CUT_SPLIT_PROMPT
        for want in ("compact JSON on ONE line", "No prose", "no code fences", "no line breaks", "at most 15 words",
                     "Stop right after the closing ]"):
            self.assertIn(want, p)
        example = next(line for line in p.splitlines() if line.startswith("[{"))
        self.assertNotIn(": ", example)
        self.assertEqual(len(json.loads(example)), 2)
        self.assertTrue(p.rstrip().endswith("STORY:"))


class PaperBoatParseTests(CutSplitTestBase):
    def test_compact_answer_parses_into_five_cuts(self):
        cuts = gg_cut_split.parse_answer(PAPER_BOAT_ANSWER)
        self.assertEqual([c["cut"] for c in cuts], [1, 2, 3, 4, 5])
        self.assertEqual([c["duration"] for c in cuts], [3.0, 2.5, 3.0, 2.0, 2.5])
        self.assertIn("paper boat on a rainy street", cuts[0]["description"])
        self.assertIn("lighthouse keeper waves", cuts[3]["description"])
        self.assertEqual(set(cuts[0]), {"cut", "duration", "description"})

    def test_full_run_with_the_compact_answer(self):
        fake = FakeComfy(answers=[PAPER_BOAT_ANSWER])
        res = self.split(fake, story=PAPER_BOAT_STORY)
        self.assertEqual((fake.runs, res["attempts"], len(res["cuts"])), (1, 1, 5))
        self.assertTrue(fake.workflows[0]["2"]["inputs"]["prompt"].endswith(PAPER_BOAT_STORY))


class TruncatedAnswerTests(CutSplitTestBase):
    def test_unclosed_array_detection(self):
        self.assertTrue(gg_ltx.json_array_unclosed(TRUNCATED_ANSWER))
        self.assertTrue(gg_ltx.json_array_unclosed('```json\n[{"cut":1,"duration":3,"description":"A gi'))
        self.assertTrue(gg_ltx.json_array_unclosed('Here: [{"cut":1,"duration":3,"description":"A [girl]"},'))
        self.assertFalse(gg_ltx.json_array_unclosed(PAPER_BOAT_ANSWER))
        self.assertFalse(gg_ltx.json_array_unclosed("I cannot help with that."))
        self.assertFalse(gg_ltx.json_array_unclosed('[{"cut":1,"duration":5,"description":"x"}] extra'))
        self.assertFalse(gg_ltx.json_array_unclosed(""))

    def test_truncated_answer_is_story_too_long_without_a_retry(self):
        fake = FakeComfy(answers=[TRUNCATED_ANSWER])
        err = self.split_error(fake, story=PAPER_BOAT_STORY)
        self.assertEqual(err.code, "too_long")
        self.assertEqual(str(err), "Story too long for one split, try a shorter part.")
        self.assertEqual(fake.runs, 1)
        self.assertEqual(len(fake.free_calls), 1)
        self.assertFalse(gg_cut_split._run_lock.locked())

    def test_retry_answer_cut_off_is_also_too_long(self):
        bad = json.dumps([{"cut": 1, "duration": 5, "description": "Too long a shot"}])
        err = self.split_error(FakeComfy(answers=[bad, TRUNCATED_ANSWER]))
        self.assertEqual(err.code, "too_long")

    def test_complete_but_invalid_answer_still_retries(self):
        bad = '[{"cut":1,"duration":5,"description":"x"}]'
        fake = FakeComfy(answers=[bad, PAPER_BOAT_ANSWER])
        self.assertEqual(self.split(fake)["attempts"], 2)


class JobTests(CutSplitTestBase):
    def setUp(self):
        super().setUp()
        gg_cut_split._job.clear()
        self.addCleanup(gg_cut_split._job.clear)

    def run_job(self, fake, story=PAPER_BOAT_STORY):
        """start_job without its thread, then the thread body inline."""
        with mock.patch.object(gg_cut_split.gg_sdk, "run_api_workflow", fake.run), \
                mock.patch.object(gg_cut_split, "_http", fake.http_call):
            first = gg_cut_split.start_job(story, start_thread=False)
            self.assertTrue(gg_cut_split._run_lock.locked())
            gg_cut_split._job_main(first["id"], story, gg_cut_split.model_settings())
        return first, gg_cut_split.job_status(first["id"])

    def test_running_snapshot(self):
        first, _ = self.run_job(FakeComfy(answers=[PAPER_BOAT_ANSWER]))
        self.assertEqual(first["state"], "running")
        self.assertEqual((first["attempt"], first["max_attempts"]), (1, 2))
        self.assertEqual(first["story"], PAPER_BOAT_STORY)
        self.assertEqual(first["model"], gg_cut_split.DEFAULT_CLIP)
        self.assertIsInstance(first["seconds"], float)
        self.assertNotIn("started", first)

    def test_done_result_is_kept_until_the_next_run(self):
        first, done = self.run_job(FakeComfy(answers=[PAPER_BOAT_ANSWER]))
        self.assertEqual(done["state"], "done")
        self.assertEqual(len(done["cuts"]), 5)
        self.assertEqual(done["attempts"], 1)
        self.assertFalse(gg_cut_split._run_lock.locked())
        self.assertEqual(gg_cut_split.job_status()["id"], first["id"])
        self.assertEqual(gg_cut_split.job_status(first["id"])["cuts"], done["cuts"])
        self.assertIsNone(gg_cut_split.job_status("other"))

    def test_too_long_job_reports_the_error(self):
        _, job = self.run_job(FakeComfy(answers=[TRUNCATED_ANSWER]))
        self.assertEqual((job["state"], job["code"]), ("error", "too_long"))
        self.assertEqual(job["message"], "Story too long for one split, try a shorter part.")
        self.assertNotIn("cuts", job)
        self.assertFalse(gg_cut_split._run_lock.locked())

    def test_retry_updates_the_attempt(self):
        bad = '[{"cut":1,"duration":5,"description":"x"}]'
        _, job = self.run_job(FakeComfy(answers=[bad, PAPER_BOAT_ANSWER]))
        self.assertEqual((job["state"], job["attempt"], job["attempts"]), ("done", 2, 2))

    def test_unexpected_error_ends_the_job(self):
        fake = FakeComfy()
        with mock.patch.object(gg_cut_split, "_generate", side_effect=RuntimeError("boom")):
            _, job = self.run_job(fake)
        self.assertEqual((job["state"], job["code"], job["message"]), ("error", "sdk", "AI Make Cut failed: boom"))
        self.assertFalse(gg_cut_split._run_lock.locked())

    def test_checks_run_before_the_job_starts(self):
        with self.assertRaises(gg_cut_split.CutSplitError) as cm:
            gg_cut_split.start_job("  ", start_thread=False)
        self.assertEqual(cm.exception.code, "bad_request")
        self.assertIsNone(gg_cut_split.job_status())
        self.assertFalse(gg_cut_split._run_lock.locked())

    def test_second_start_while_running_is_busy_and_keeps_the_first(self):
        first = gg_cut_split.start_job(PAPER_BOAT_STORY, start_thread=False)
        self.addCleanup(lambda: gg_cut_split._run_lock.locked() and gg_cut_split._run_lock.release())
        with self.assertRaises(gg_cut_split.CutSplitError) as cm:
            gg_cut_split.start_job("Another story.", start_thread=False)
        self.assertEqual((cm.exception.code, str(cm.exception)), ("busy", "AI Make Cut is already running."))
        self.assertEqual(gg_cut_split.job_status()["id"], first["id"])

    def test_thread_runs_the_job(self):
        fake = FakeComfy(answers=[PAPER_BOAT_ANSWER])
        with mock.patch.object(gg_cut_split.gg_sdk, "run_api_workflow", fake.run), \
                mock.patch.object(gg_cut_split, "_http", fake.http_call):
            first = gg_cut_split.start_job(PAPER_BOAT_STORY)
            for _ in range(500):
                if gg_cut_split.job_status(first["id"])["state"] != "running":
                    break
                time.sleep(0.01)
        self.assertEqual(gg_cut_split.job_status(first["id"])["state"], "done")


class QueryRequest(FakeRequest):
    def __init__(self, body=None, query=None):
        super().__init__(body)
        self.query = query or {}


class JobRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.routes, cls.cut_split, cls.handlers = load_routes()

    def call(self, method, path, body=None, query=None):
        return asyncio.run(self.handlers[(method, path)](QueryRequest(body, query)))

    def test_status_route_registered(self):
        self.assertIn(("GET", "/gonggan/ai-cut-split/status"), self.handlers)

    def test_background_start_returns_the_job_at_once(self):
        job = {"id": "abc", "state": "running", "attempt": 1}
        with mock.patch.object(self.cut_split, "start_job", return_value=job) as start, \
                mock.patch.object(self.cut_split, "ai_cut_split") as sync_run:
            res = self.call("POST", "/gonggan/ai-cut-split", {"story": "S", "background": True})
        start.assert_called_once_with("S")
        sync_run.assert_not_called()
        self.assertEqual((res.status, res.body), (202, {"ok": True, "job": job}))

    def test_without_background_runs_synchronously(self):
        with mock.patch.object(self.cut_split, "ai_cut_split", return_value={"cuts": []}) as sync_run, \
                mock.patch.object(self.cut_split, "start_job") as start:
            res = self.call("POST", "/gonggan/ai-cut-split", {"story": "S"})
        sync_run.assert_called_once_with("S")
        start.assert_not_called()
        self.assertEqual((res.status, res.body), (200, {"ok": True, "cuts": []}))

    def test_start_errors_keep_their_status(self):
        err = self.cut_split.CutSplitError("busy", "AI Make Cut is already running.")
        with mock.patch.object(self.cut_split, "start_job", side_effect=err):
            res = self.call("POST", "/gonggan/ai-cut-split", {"story": "S", "background": True})
        self.assertEqual(res.status, 409)
        self.assertEqual(res.body["code"], "busy")

    def test_too_long_is_422(self):
        err = self.cut_split.CutSplitError("too_long", self.cut_split.TOO_LONG_MESSAGE)
        with mock.patch.object(self.cut_split, "ai_cut_split", side_effect=err):
            res = self.call("POST", "/gonggan/ai-cut-split", {"story": "S"})
        self.assertEqual((res.status, res.body["code"]), (422, "too_long"))
        self.assertEqual(res.body["message"], "Story too long for one split, try a shorter part.")

    def test_status_of_a_run(self):
        job = {"id": "abc", "state": "done", "cuts": []}
        with mock.patch.object(self.cut_split, "job_status", return_value=job) as st:
            res = self.call("GET", "/gonggan/ai-cut-split/status", query={"job": "abc"})
        st.assert_called_once_with("abc")
        self.assertEqual((res.status, res.body), (200, {"ok": True, "job": job}))

    def test_status_of_a_gone_run_is_404(self):
        with mock.patch.object(self.cut_split, "job_status", return_value=None):
            res = self.call("GET", "/gonggan/ai-cut-split/status", query={"job": "old"})
        self.assertEqual((res.status, res.body["code"]), (404, "no_job"))
        self.assertIn("Click Split to run it again", res.body["message"])

    def test_last_run_without_id(self):
        with mock.patch.object(self.cut_split, "job_status", return_value=None) as st:
            res = self.call("GET", "/gonggan/ai-cut-split/status")
        st.assert_called_once_with(None)
        self.assertEqual((res.status, res.body), (200, {"ok": True, "job": None}))


if __name__ == "__main__":
    unittest.main()
