"""0.9.116: Generate All — every cut in list order, one Comfy SDK job at a time (runner mocked, nothing rendered);
UI-format cut workflows (AI Cut Split) converted to API format on the server, so no tab is needed."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_ltx
import gg_native_api as na
import gg_sdk
import gg_wfconvert
from gg_project import LocalStore


class _SyncThread:
    def __init__(self, target, args=(), **_kw):
        self._run = lambda: target(*args)

    def start(self):
        self._run()


class ConvertTests(unittest.TestCase):
    def test_bundled_t2v(self):
        g = gg_ltx.inject_ltx(gg_ltx.load_ltx_workflow("t2v"), "A fox runs.", 2)
        api = gg_wfconvert.ui_to_api(g, mappings={})
        self.assertNotIn("76", api, "Note is UI only")
        self.assertNotIn("77", api, "bypassed SaveWEBM with no consumers is left out")
        self.assertEqual(api["6"], {"class_type": "CLIPTextEncode", "inputs": {"text": "A fox runs.", "clip": ["38", 0]},
                                    "_meta": {"title": "CLIP Text Encode (Positive Prompt)"}})
        self.assertEqual(api["72"]["inputs"], {
            "add_noise": True, "noise_seed": 552872474466407, "cfg": 1, "model": ["44", 0], "positive": ["69", 0],
            "negative": ["69", 1], "sampler": ["73", 0], "sigmas": ["71", 0], "latent_image": ["70", 0]})
        self.assertEqual(api["70"]["inputs"], {"width": 768, "height": 512, "length": 49, "batch_size": 1})
        self.assertEqual(api["71"]["inputs"], {"steps": 8, "max_shift": 2.05, "base_shift": 0.95, "stretch": True,
                                               "terminal": 0.1, "latent": ["70", 0]})
        self.assertEqual(api["41"]["inputs"], {"filename_prefix": "ComfyUI", "fps": 24, "lossless": False, "quality": 95,
                                               "method": "default", "images": ["8", 0]})
        self.assertEqual(api["38"]["inputs"], {"clip_name": "t5xxl_fp8_e4m3fn_scaled.safetensors", "type": "ltxv",
                                               "device": "default"})
        self.assertEqual(api["69"]["inputs"]["frame_rate"], 24)
        self.assertEqual(gg_sdk.workflow_seeds(api), {"72.noise_seed": 552872474466407})

    def test_bundled_i2v_fills_missing_widget_defaults(self):
        api = gg_wfconvert.ui_to_api(gg_ltx.load_ltx_workflow("i2v"), mappings={})
        self.assertEqual(api["95"]["inputs"]["strength"], 1.0)
        self.assertEqual(api["95"]["inputs"]["image"], ["82", 0])
        self.assertEqual(api["78"]["inputs"], {"image": "fox.jpg"})
        self.assertEqual(api["82"]["inputs"], {"img_compression": 40, "image": ["78", 0]})

    def test_uses_comfyui_input_types_when_available(self):
        class KSampler:
            @classmethod
            def INPUT_TYPES(cls):
                return {"required": {"model": ("MODEL",), "seed": ("INT", {"default": 0}), "steps": ("INT", {"default": 20}),
                                     "sampler_name": (["euler", "dpm"],), "scheduler": ("COMBO", {"options": ["simple"]}),
                                     "positive": ("CONDITIONING",)},
                        "optional": {"denoise": ("FLOAT", {"default": 1.0}), "extra": ("STRING", {"forceInput": True})}}
        g = {"nodes": [{"id": 3, "type": "KSampler", "mode": 0, "widgets_values": [7, "fixed", 4],
                        "inputs": [{"name": "model", "link": None}]}], "links": []}
        api = gg_wfconvert.ui_to_api(g, mappings={"KSampler": KSampler})
        self.assertEqual(api["3"]["inputs"], {"seed": 7, "steps": 4, "sampler_name": "euler", "scheduler": "simple",
                                              "denoise": 1.0})

    def test_reroute_primitive_and_converted_widget(self):
        g = {"nodes": [
            {"id": 1, "type": "CheckpointLoaderSimple", "mode": 0, "widgets_values": ["m.safetensors"]},
            {"id": 2, "type": "Reroute", "mode": 0, "inputs": [{"name": "", "link": 10}]},
            {"id": 3, "type": "CLIPTextEncode", "mode": 0, "widgets_values": ["from primitive"],
             "inputs": [{"name": "clip", "link": 11}, {"name": "text", "widget": {"name": "text"}, "link": 12}]},
            {"id": 4, "type": "PrimitiveNode", "mode": 0, "widgets_values": ["from primitive"]},
        ], "links": [[10, 1, 1, 2, 0, "CLIP"], [11, 2, 0, 3, 0, "CLIP"], [12, 4, 0, 3, 1, "STRING"]]}
        api = gg_wfconvert.ui_to_api(g, mappings={})
        self.assertEqual(sorted(api), ["1", "3"])
        self.assertEqual(api["3"]["inputs"], {"text": "from primitive", "clip": ["1", 1]})

    def test_refuses_what_it_cannot_convert(self):
        bad_type = {"nodes": [{"id": 1, "type": "SomeCustomNode", "mode": 0}], "links": []}
        bypass_mid = gg_ltx.load_ltx_workflow("t2v")
        next(n for n in bypass_mid["nodes"] if n["id"] == 8)["mode"] = 4
        for g in (bad_type, bypass_mid, {"nodes": [], "links": []}, {"3": {"class_type": "X"}}):
            with self.assertRaises(ValueError):
                gg_wfconvert.ui_to_api(g, mappings={})


class GenerateAllBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = LocalStore(self.root / "pack")
        na.set_native_store(self.store)
        self.pid = self.store.create_project("P")["id"]
        self.empty = next(iter(self.store.get_project(self.pid)["cuts"]))
        cuts = [{"cut": i, "duration": 2, "description": f"Shot {i}"} for i in (1, 2, 3)]
        self.ids = na.native_add_cut_list(self.pid, cuts, workflow="t2v", after=self.empty)["cut_ids"]
        self.regen_dir = self.root / "regen"
        self.events = []
        self._patches = [
            mock.patch.object(gg_sdk, "REGEN_DIR", self.regen_dir),
            mock.patch.object(gg_sdk.threading, "Thread", _SyncThread),
            mock.patch.object(gg_sdk, "_batch_notify", lambda snap: self.events.append(snap)),
            mock.patch.object(gg_sdk, "_notify", None),
            mock.patch.object(gg_wfconvert, "_class_mappings", lambda: {}),
        ]
        for p in self._patches:
            p.start()
        gg_sdk._job.clear()
        gg_sdk._job["status"] = "idle"
        gg_sdk._batch.clear()
        gg_sdk._batch.update(status="idle", items=[])
        self.ran = []

    def tearDown(self):
        for p in reversed(self._patches):
            p.stop()
        na.set_native_store(None)
        self._tmp.cleanup()

    def cut_of_run(self, args) -> str:
        name = Path(args[args.index("--workflow") + 1]).stem
        return next(c for c in [self.empty, *self.ids] if f"_{c}_" in name)

    def runner(self, fail_cut=None, on_run=None):
        def _run(args, timeout):
            cut = self.cut_of_run(args)
            self.ran.append(cut)
            if on_run:
                on_run(cut)
            if cut == fail_cut:
                return {"ok": False, "error": "out of memory"}
            return {"ok": True, "job_id": f"job-{cut}", "seconds": 1.0}
        return _run

    def start(self, order, *, new_seed=False, **runner_kw):
        cap = lambda pid, cut, job, wait_sec=0: {"ok": True, "version": {"id": f"v-{cut}"}}  # noqa: E731
        with mock.patch.object(gg_sdk, "_runner", self.runner(**runner_kw)), \
                mock.patch.object(na, "native_capture_prompt_output", cap):
            return gg_sdk.start_generate_all(self.pid, order, new_seed=new_seed)


class NativeConvertTests(GenerateAllBase):
    def test_pasted_cut_needs_convert_flag(self):
        with self.assertRaises(na.NativeWorkflowError) as cm:
            na.native_cut_api_workflow(self.pid, self.ids[0])
        self.assertEqual(cm.exception.code, "ui_only")
        res = na.native_cut_api_workflow(self.pid, self.ids[0], convert=True)
        self.assertEqual(res["source"], "converted")
        self.assertEqual(res["workflow"]["6"]["inputs"]["text"], "Shot 1")

    def test_queue_plan_with_convert(self):
        plan = gg_sdk.native_plan(self.pid, self.ids[1], new_seed=False, convert=True)
        self.assertEqual((plan["source"], plan["seed"]), ("converted", 552872474466407))


class GenerateAllTests(GenerateAllBase):
    def test_runs_in_given_order_one_at_a_time_and_adds_versions(self):
        order = [self.ids[2], self.empty, self.ids[0], self.ids[1]]
        res = self.start(order)
        self.assertTrue(res["ok"])
        self.assertEqual(self.ran, order, "0.9.117: the empty cut runs the project Image template")
        b = gg_sdk.generate_all_status()
        self.assertEqual(b["status"], "done")
        self.assertEqual([(it["cut_id"], it["status"]) for it in b["items"]], [(c, "done") for c in order])
        self.assertEqual(b["items"][0]["version"], f"v-{self.ids[2]}")
        generating = [next(it["cut_id"] for it in e["items"] if it["status"] == "generating")
                      for e in self.events if any(it["status"] == "generating" for it in e["items"])]
        self.assertEqual(list(dict.fromkeys(generating)), [self.ids[2], self.empty, self.ids[0], self.ids[1]])
        for e in self.events:
            self.assertLessEqual(sum(it["status"] == "generating" for it in e["items"]), 1)
        self.assertEqual(gg_sdk.job_status()["status"], "done")

    def test_each_cut_runs_its_own_workflow(self):
        self.start(self.ids)
        texts = []
        for f in sorted(self.regen_dir.glob("native_*.json"), key=lambda p: p.stat().st_mtime_ns):
            texts.append(json.loads(f.read_text(encoding="utf-8"))["6"]["inputs"]["text"])
        self.assertEqual(sorted(texts), ["Shot 1", "Shot 2", "Shot 3"])

    def test_failure_does_not_stop_the_rest(self):
        self.start(self.ids, fail_cut=self.ids[1])
        b = gg_sdk.generate_all_status()
        self.assertEqual([it["status"] for it in b["items"]], ["done", "failed", "done"])
        self.assertEqual(b["items"][1]["error"], "out of memory")
        self.assertEqual(b["status"], "done")

    def test_stop_cancels_waiting_but_not_the_running_one(self):
        def stop_on_first(cut):
            if cut == self.ids[0]:
                self.assertTrue(gg_sdk.stop_generate_all()["ok"])
        self.start(self.ids, on_run=stop_on_first)
        self.assertEqual(self.ran, [self.ids[0]])
        b = gg_sdk.generate_all_status()
        self.assertEqual([it["status"] for it in b["items"]], ["done", "cancelled", "cancelled"])
        self.assertEqual(b["status"], "stopped")
        self.assertFalse(gg_sdk.stop_generate_all()["ok"])

    def test_waits_for_a_running_regen_job(self):
        gg_sdk._job["status"] = "running"
        sleeps = []

        def fake_sleep(sec):
            sleeps.append(sec)
            gg_sdk._job["status"] = "done"
        with mock.patch.object(gg_sdk.time, "sleep", fake_sleep):
            self.start(self.ids[:1])
        self.assertEqual(len(sleeps), 1)
        self.assertEqual(self.ran, [self.ids[0]])
        self.assertTrue(gg_sdk.job_status()["batch"])

    def test_one_batch_at_a_time_and_input_checks(self):
        gg_sdk._batch.update(status="running", id="x", items=[])
        res = gg_sdk.start_generate_all(self.pid, self.ids)
        self.assertFalse(res["ok"])
        gg_sdk._batch.update(status="done")
        for bad in (None, [], ["ok", 3], "abc", [""]):
            with self.assertRaises(ValueError):
                gg_sdk.start_generate_all(self.pid, bad)

    def test_duplicates_and_unknown_cuts(self):
        self.start([self.ids[0], self.ids[0], "01a18b3f-271d-722b-81f4-e2f056fdca99"])
        b = gg_sdk.generate_all_status()
        self.assertEqual([it["status"] for it in b["items"]], ["done", "failed"])
        self.assertIn("cut not found", b["items"][1]["error"])

    def test_new_seed_flag_on_generate_all(self):
        calls = []
        orig = gg_sdk.native_plan

        def track(pid, cut_id, **kw):
            p = orig(pid, cut_id, **kw)
            calls.append(kw.get("new_seed"))
            return p

        with mock.patch.object(gg_sdk, "native_plan", side_effect=track):
            self.start([self.ids[0]], new_seed=False)
        self.assertEqual(calls, [False])
        calls.clear()
        with mock.patch.object(gg_sdk, "native_plan", side_effect=track):
            self.start([self.ids[1]], new_seed=True)
        self.assertEqual(calls, [True])
        self.assertTrue(gg_sdk.generate_all_status().get("new_seed"))


if __name__ == "__main__":
    unittest.main()
