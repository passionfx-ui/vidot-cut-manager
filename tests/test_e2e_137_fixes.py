"""0.9.137: fixes verified on the paths the UI actually uses (E2E 136 retest)."""
from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
for p in (REPO, TESTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import gg_native_api as na
import gg_script_presplit
from gg_project import LocalStore
from test_cut_split_model import FakeRequest, load_routes

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32

SCENE_STORY = """Scene 1
Cut 1: Girl on a rainy rooftop
Cut 2: She finds a paper boat
Scene 2
Cut 3: Moon over the harbor
Cut 4: An old keeper waves
"""


class CutAddListUiPathTests(unittest.TestCase):
    """POST /gonggan/cut/add-list with the same body shape as web/gg_cut_list_core.cutListPayload."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self.tmp.name))
        na.set_native_store(self.store)
        self._sync_route_store()
        self.pid = self.store.create_project("E2E137")["id"]
        self.seed = next(iter(self.store.get_project(self.pid)["cuts"]))

    def _sync_route_store(self):
        import sys
        alt = sys.modules.get("gg_routes_pkg.gg_native_api")
        if alt is not None:
            alt.set_native_store(self.store)

    def tearDown(self):
        na.set_native_store(None)
        self.tmp.cleanup()

    def test_presplit_scenes_survive_add_list_and_seed_cut_removed(self):
        draft = gg_script_presplit.presplit_public(SCENE_STORY, "dialogue_only")
        self.assertIsNotNone(draft)
        res = na.native_add_cut_list(self.pid, draft, after=self.seed)
        doc = self.store.get_project(self.pid)
        self.assertTrue(doc["cuts"][self.seed].get("deleted_at"), "pristine seed New cut should be removed")
        tl = res["timeline"]
        groups = {g["name"]: list(g.get("cut_ids") or []) for g in tl.get("groups") or []}
        self.assertIn("Scene 1", groups)
        self.assertIn("Scene 2", groups)
        self.assertEqual(len(groups["Scene 1"]), 2)
        self.assertEqual(len(groups["Scene 2"]), 2)
        for cid in groups["Scene 1"] + groups["Scene 2"]:
            self.assertIn(cid, res["cut_ids"])


class CutAddListRouteTests(unittest.TestCase):
    def setUp(self):
        self.routes, _cs, self.handlers = load_routes()
        self._route_na = self.routes.gg_native_api
        self.tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self.tmp.name))
        na.set_native_store(self.store)
        self._route_na.set_native_store(self.store)
        self.pid = self.store.create_project("Route137")["id"]
        self.seed = next(iter(self.store.get_project(self.pid)["cuts"]))

    def tearDown(self):
        na.set_native_store(None)
        self._route_na.set_native_store(None)
        self.tmp.cleanup()
        for name in [n for n in list(sys.modules) if n.startswith("gg_routes_pkg.")]:
            del sys.modules[name]

    def test_route_handler_accepts_ui_payload(self):
        draft = gg_script_presplit.presplit_public(SCENE_STORY, "no_captions")
        payload = {"pid": self.pid, "cuts": draft, "after": self.seed}
        res = asyncio.run(self.handlers[("POST", "/gonggan/cut/add-list")](FakeRequest(payload)))
        self.assertEqual(res.status, 200)
        self.assertEqual(len(res.body["cut_ids"]), 4)
        doc = self.store.get_project(self.pid)
        self.assertTrue(doc["cuts"][self.seed].get("deleted_at"))

    def test_route_add_list_ui_payload_splits_scenes(self):
        """POST /gonggan/cut/add-list with cutListPayload-shaped body after presplit (real create path)."""
        draft = gg_script_presplit.presplit_public(SCENE_STORY, "dialogue_only")
        self.assertIsNotNone(draft)
        payload = {
            "pid": self.pid,
            "cuts": [
                {
                    "cut": c["cut"],
                    "duration": c["duration"],
                    "description": c["description"],
                    "title": c.get("title") or "",
                    "caption": c.get("caption") or "",
                    **({"scene": c["scene"]} if c.get("scene") else {}),
                }
                for c in draft
            ],
            "after": self.seed,
        }
        res = asyncio.run(self.handlers[("POST", "/gonggan/cut/add-list")](FakeRequest(payload)))
        self.assertEqual(res.status, 200)
        groups = {g["name"]: list(g.get("cut_ids") or []) for g in res.body["timeline"].get("groups") or []}
        self.assertEqual(len(groups.get("Scene 1") or []), 2)
        self.assertEqual(len(groups.get("Scene 2") or []), 2)


class PackAssetsSubdirTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self.tmp.name))
        na.set_native_store(self.store)
        self.pid = self.store.create_project("Pack137")["id"]
        self.cut = next(iter(self.store.get_project(self.pid)["cuts"]))

    def tearDown(self):
        na.set_native_store(None)
        self.tmp.cleanup()

    def test_new_version_in_assets_images_not_cut_subfolder(self):
        src = Path(self.tmp.name) / "out.png"
        src.write_bytes(PNG)
        ver = self.store.add_version(self.pid, self.cut, src)
        rel = ver["asset"]["path"].replace("\\", "/")
        self.assertTrue(rel.startswith("assets/images/"), rel)
        saved = self.store._project_dir(self.pid) / rel
        self.assertTrue(saved.is_file())

    def test_legacy_assets_cut_id_path_still_reads(self):
        legacy_dir = self.store._project_dir(self.pid) / "assets" / self.cut
        legacy_dir.mkdir(parents=True)
        legacy_file = legacy_dir / "old.png"
        legacy_file.write_bytes(PNG)
        from gg_project.timeline import version_asset_file

        pdir = self.store._project_dir(self.pid)
        self.assertEqual(
            version_asset_file(pdir, {"path": f"assets/{self.cut}/old.png"}),
            legacy_file,
        )


class RegenStatusUiPathTests(unittest.TestCase):
    """GET /gonggan/regen/status — same job snapshot the Shots UI polls during Queue / Make Video."""

    def setUp(self):
        pass

    def tearDown(self):
        pass

    def test_regen_status_running_native_job_shape(self):
        pid = "01a19098-3f60-77be-a648-dffead1ac5b0"
        cut_id = "01a19099-a656-722b-81f4-e2f056fdca99"
        routes_mod, _cs, handlers = load_routes()
        routes_mod.gg_sdk._job.clear()
        routes_mod.gg_sdk._job.update(
            status="running",
            native=True,
            pid=pid,
            cut_id=cut_id,
            started_at=1730360000.0,
            versions=[],
        )
        res = asyncio.run(handlers[("GET", "/gonggan/regen/status")](FakeRequest()))
        self.assertEqual(res.status, 200)
        job = res.body["job"]
        self.assertEqual(job["status"], "running")
        self.assertTrue(job["native"])
        self.assertEqual(job["pid"], pid)
        self.assertEqual(job["cut_id"], cut_id)
        for name in [n for n in list(sys.modules) if n.startswith("gg_routes_pkg.")]:
            del sys.modules[name]

    def test_regen_status_done_after_native_job(self):
        pid = "01a19098-3f60-77be-a648-dffead1ac5b0"
        cut_id = "01a19099-a656-722b-81f4-e2f056fdca99"
        routes_mod, _cs, handlers = load_routes()
        routes_mod.gg_sdk._job.clear()
        routes_mod.gg_sdk._job.update(
            status="done",
            native=True,
            pid=pid,
            cut_id=cut_id,
            versions=["01a19099-085a-722b-81f4-e2f056fdca99"],
            finished_at=1730360100.0,
        )
        res = asyncio.run(handlers[("GET", "/gonggan/regen/status")](FakeRequest()))
        job = res.body["job"]
        self.assertEqual(job["status"], "done")
        self.assertEqual(job["cut_id"], cut_id)
        for name in [n for n in list(sys.modules) if n.startswith("gg_routes_pkg.")]:
            del sys.modules[name]


class SettingsNativeProjectsDirTests(unittest.TestCase):
    def test_settings_includes_native_projects_dir(self):
        _routes, _cs, handlers = load_routes()
        res = asyncio.run(handlers[("GET", "/gonggan/settings")](FakeRequest()))
        data = res.body
        self.assertIn("native_projects_dir", data)
        self.assertTrue(str(data["native_projects_dir"]).endswith("projects"))
        self.assertIn("default_project_location", data)
        self.assertTrue(str(data["default_project_location"]))
        for name in [n for n in list(sys.modules) if n.startswith("gg_routes_pkg.")]:
            del sys.modules[name]


if __name__ == "__main__":
    unittest.main()
