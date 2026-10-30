"""0.9.114: native Regen / Queue run the cut's own saved workflow through the Comfy SDK path (runner mocked).

Regen sets new random sampler seeds, Queue keeps the saved ones; the finished run is added as a new version."""
from __future__ import annotations

import json
import random
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

API = {
    "3": {"class_type": "KSampler", "inputs": {"seed": 111, "steps": 4, "model": ["4", 0]}},
    "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "m.safetensors"}},
    "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "x"}},
}
UI = {"nodes": [{"id": 3, "type": "KSampler", "widgets_values": [111]}], "links": []}


def _png(path: Path, prompt: dict | None) -> Path:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    text = chunk(b"tEXt", b"prompt\x00" + json.dumps(prompt).encode()) if prompt else b""
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + text + chunk(b"IEND", b""))
    return path


class SeedTests(unittest.TestCase):
    def test_randomizes_sampler_seeds_only(self):
        wf = {
            "1": {"class_type": "KSampler", "inputs": {"seed": 5, "steps": 4}},
            "2": {"class_type": "KSamplerAdvanced", "inputs": {"noise_seed": 6}},
            "3": {"class_type": "RandomNoise", "inputs": {"noise_seed": 7}},
            "4": {"class_type": "SamplerCustom", "inputs": {"noise_seed": ["5", 0]}},
            "5": {"class_type": "PrimitiveInt", "inputs": {"value": 8}},
            "6": {"class_type": "SomeLoader", "inputs": {"seed": 9}},
        }
        out, seeds = gg_sdk.randomize_seeds(wf, random.Random(1))
        self.assertEqual(sorted(seeds), ["1.seed", "2.noise_seed", "3.noise_seed", "5.value"])
        self.assertEqual(out["1"]["inputs"]["seed"], seeds["1.seed"])
        self.assertEqual(out["5"]["inputs"]["value"], seeds["5.value"])
        self.assertEqual(out["4"]["inputs"]["noise_seed"], ["5", 0])
        self.assertEqual(out["6"]["inputs"]["seed"], 9)
        self.assertEqual(out["1"]["inputs"]["steps"], 4)
        self.assertNotEqual(seeds["1.seed"], 5)
        self.assertEqual(wf["1"]["inputs"]["seed"], 5, "input workflow is not changed")

    def test_two_runs_get_different_seeds(self):
        a = gg_sdk.randomize_seeds(API)[1]["3.seed"]
        b = gg_sdk.randomize_seeds(API)[1]["3.seed"]
        self.assertNotEqual(a, b)

    def test_workflow_seeds_reads_without_change(self):
        self.assertEqual(gg_sdk.workflow_seeds(API), {"3.seed": 111})


class NativeBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root / "pack")
        na.set_native_store(self.store)
        loc = self.root / "Film"
        loc.mkdir()
        self.pid = na.create_native_project("Film", None, None, str(loc))["project"]["id"]
        self.cut = next(iter(self.store.get_project(self.pid)["cuts"]))
        self.regen_dir = self.root / "regen"
        self._p = mock.patch.object(gg_sdk, "REGEN_DIR", self.regen_dir)
        self._p.start()

    def tearDown(self):
        self._p.stop()
        na.set_native_store(None)
        self._tmp.cleanup()

    def _version(self, name: str, workflow: dict | None, prompt: dict | None = None, prompt_id: str | None = None):
        src = self.root / name
        if name.endswith(".png"):
            _png(src, prompt)
        else:
            src.write_bytes(b"\x00" * 16)
        return self.store.add_version(self.pid, self.cut, src, workflow=workflow, prompt_id=prompt_id)


class WorkflowSelectionTests(NativeBase):
    def test_current_version_png_prompt(self):
        self._version("a.png", UI, prompt=API)
        res = na.native_cut_api_workflow(self.pid, self.cut)
        self.assertEqual((res["source"], res["workflow"]), ("embedded", API))

    def test_stored_api_workflow(self):
        self._version("a.mp4", API)
        res = na.native_cut_api_workflow(self.pid, self.cut)
        self.assertEqual((res["source"], res["workflow"]), ("stored", API))

    def test_newest_version_wins(self):
        old = {**API, "3": {"class_type": "KSampler", "inputs": {"seed": 1}}}
        self._version("old.mp4", old)
        self._version("new.mp4", API)
        self.assertEqual(na.native_cut_api_workflow(self.pid, self.cut)["workflow"], API)

    def test_history_prompt_of_current_run(self):
        self._version("a.mp4", UI, prompt_id="p1")
        with mock.patch.object(gg_sdk, "history_prompt", return_value=API) as hp:
            res = na.native_cut_api_workflow(self.pid, self.cut)
        hp.assert_called_once_with("p1")
        self.assertEqual(res["source"], "history")

    def test_ui_only_is_a_clear_error(self):
        self._version("a.png", UI)
        with self.assertRaises(na.NativeWorkflowError) as cm:
            na.native_cut_api_workflow(self.pid, self.cut)
        self.assertEqual(cm.exception.code, "ui_only")
        self.assertIn("UI (graph) format", str(cm.exception))

    def test_ui_only_uses_open_canvas_prompt(self):
        self._version("a.png", UI)
        res = na.native_cut_api_workflow(self.pid, self.cut, canvas=API)
        self.assertEqual(res["source"], "canvas")
        with self.assertRaises(ValueError):
            na.native_cut_api_workflow(self.pid, self.cut, canvas=UI)

    def test_empty_cut(self):
        """No workflow and no readable Image template (0.9.117: otherwise an empty cut runs the Image template)."""
        self.store.update_project(self.pid, {"settings": {"image_template": "missing/gone.json"}})
        before = set(self.store.get_project(self.pid)["cuts"])
        empty = next(c for c in self.store.add_cut(self.pid)["cuts"] if c not in before)
        with self.assertRaises(na.NativeWorkflowError) as cm:
            na.native_cut_api_workflow(self.pid, empty)
        self.assertEqual(cm.exception.code, "empty")

    def test_unknown_cut(self):
        with self.assertRaisesRegex(ValueError, "cut not found"):
            na.native_cut_api_workflow(self.pid, "01a18b3f-271d-722b-81f4-e2f056fdca99")


class _SyncThread:
    def __init__(self, target, args=(), **_kw):
        self._run = lambda: target(*args)

    def start(self):
        self._run()


class NativeRunTests(NativeBase):
    def setUp(self):
        super().setUp()
        self._version("a.mp4", API)
        gg_sdk._job.clear()
        gg_sdk._job["status"] = "idle"

    def _saved(self, plan):
        return json.loads((self.regen_dir / f"{plan['plan']}.json").read_text(encoding="utf-8"))

    def test_regen_plan_gets_new_seed(self):
        plan = gg_sdk.native_plan(self.pid, self.cut, new_seed=True)
        self.assertNotEqual(plan["seed"], 111)
        self.assertEqual(self._saved(plan)["3"]["inputs"]["seed"], plan["seed"])
        self.assertEqual(self._saved(plan)["9"], API["9"])

    def test_queue_plan_keeps_saved_seed(self):
        plan = gg_sdk.native_plan(self.pid, self.cut, new_seed=False)
        self.assertEqual(plan["seed"], 111)
        self.assertEqual(self._saved(plan), API)

    def test_confirmed_run_goes_through_runner_and_adds_version(self):
        plan = gg_sdk.native_plan(self.pid, self.cut, new_seed=True)
        ver = {"id": "v-new"}
        with mock.patch.object(gg_sdk, "_runner", return_value={"ok": True, "job_id": "job-1", "seconds": 2.0}) as run, \
                mock.patch.object(na, "native_capture_prompt_output",
                                  return_value={"ok": True, "version": ver}) as cap, \
                mock.patch.object(gg_sdk.threading, "Thread", _SyncThread):
            res = gg_sdk.run_native_confirmed(self.pid, self.cut, plan["plan"])
        self.assertTrue(res["ok"])
        args = run.call_args.args[0]
        self.assertEqual(args[0], "run")
        self.assertIn("--confirm", args)
        self.assertNotIn("--node", args)
        self.assertEqual(Path(args[args.index("--workflow") + 1]), self.regen_dir / f"{plan['plan']}.json")
        self.assertEqual(cap.call_args.args[:3], (self.pid, self.cut, "job-1"))
        job = gg_sdk.job_status()
        self.assertEqual((job["status"], job["versions"], job["native"], job["cut_id"]), ("done", ["v-new"], True, self.cut))

    def test_runner_error_reported(self):
        plan = gg_sdk.native_plan(self.pid, self.cut, new_seed=True)
        with mock.patch.object(gg_sdk, "_runner", return_value={"ok": False, "error": "proxy down"}), \
                mock.patch.object(na, "native_capture_prompt_output") as cap, \
                mock.patch.object(gg_sdk.threading, "Thread", _SyncThread):
            gg_sdk.run_native_confirmed(self.pid, self.cut, plan["plan"])
        cap.assert_not_called()
        self.assertEqual((gg_sdk.job_status()["status"], gg_sdk.job_status()["error"]), ("error", "proxy down"))

    def test_rejects_unknown_or_foreign_plan(self):
        plan = gg_sdk.native_plan(self.pid, self.cut, new_seed=True)
        other = "01a18b3f-271d-722b-81f4-e2f056fdca99"
        for bad in ("", "../x", plan["plan"].replace(self.cut, other), None):
            with self.assertRaises(ValueError):
                gg_sdk.run_native_confirmed(self.pid, self.cut, bad)

    def test_one_job_at_a_time(self):
        plan = gg_sdk.native_plan(self.pid, self.cut, new_seed=True)
        gg_sdk._job["status"] = "running"
        with mock.patch.object(gg_sdk, "_runner") as run:
            res = gg_sdk.run_native_confirmed(self.pid, self.cut, plan["plan"])
        self.assertFalse(res["ok"])
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
