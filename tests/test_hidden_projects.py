"""Reversible project hide list (projects/hidden_projects.json) and tools/hide_projects.py."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
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
from gg_project.hidden_projects import filter_hidden, load_hidden_ids, write_hidden_ids


def _load_cli():
    spec = importlib.util.spec_from_file_location("hide_projects_cli", REPO / "tools" / "hide_projects.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


LEGACY = {
    "ok": True,
    "active_project_id": "legacyA",
    "projects": [{"id": "legacyA", "name": "Old A", "cut_count": 1}, {"id": "legacyB", "name": "Old B", "cut_count": 2}],
}


class HiddenFileTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name) / "projects" / "hidden_projects.json"

    def tearDown(self):
        self._tmp.cleanup()

    def test_missing_file_hides_nothing(self):
        self.assertEqual(load_hidden_ids(self.path), set())

    def test_invalid_files_hide_nothing(self):
        self.path.parent.mkdir(parents=True)
        for text in ("{not json", "[]", '"x"', '{"hidden_ids": "abc"}', '{"other": ["a"]}', ""):
            self.path.write_text(text, encoding="utf-8")
            self.assertEqual(load_hidden_ids(self.path), set(), text)

    def test_non_string_ids_ignored(self):
        self.path.parent.mkdir(parents=True)
        self.path.write_text(json.dumps({"hidden_ids": ["a", 1, None, "", "b"]}), encoding="utf-8")
        self.assertEqual(load_hidden_ids(self.path), {"a", "b"})

    def test_write_roundtrip_and_empty(self):
        self.assertEqual(write_hidden_ids(self.path, ["b", "a", "a"]), ["a", "b"])
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), {"hidden_ids": ["a", "b"]})
        write_hidden_ids(self.path, [])
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), {"hidden_ids": []})
        self.assertEqual(load_hidden_ids(self.path), set())

    def test_filter_hidden(self):
        rows = [{"id": "a"}, {"id": "b"}, {"name": "no id"}]
        self.assertEqual(filter_hidden(rows, {"a"}), [{"id": "b"}, {"name": "no id"}])
        self.assertIs(filter_hidden(rows, set()), rows)


class MergeListTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        na.set_native_store(self.store)

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def _ids(self, payload=LEGACY):
        return [p["id"] for p in na.merge_projects_list(payload)["projects"]]

    def test_hidden_file_lives_next_to_native_index(self):
        self.assertEqual(na.hidden_projects_path(), self.store.projects_dir / "hidden_projects.json")

    def test_hides_native_and_legacy_but_deletes_nothing(self):
        keep = self.store.create_project("Keep")["id"]
        gone = self.store.create_project("Gone")["id"]
        write_hidden_ids(na.hidden_projects_path(), [gone, "legacyA"])
        merged = na.merge_projects_list(LEGACY)
        self.assertEqual([p["id"] for p in merged["projects"]], [keep, "legacyB"])
        self.assertIsNone(merged["active_project_id"])
        self.assertIsNotNone(self.store.get_project(gone))
        self.assertEqual(len(LEGACY["projects"]), 2)

    def test_new_project_after_hiding_shows(self):
        old = self.store.create_project("Old")["id"]
        write_hidden_ids(na.hidden_projects_path(), [old, "legacyA", "legacyB"])
        self.assertEqual(self._ids(), [])
        new = self.store.create_project("New")["id"]
        self.assertEqual(self._ids(), [new])

    def test_unhide_restores_everything(self):
        pid = self.store.create_project("P")["id"]
        write_hidden_ids(na.hidden_projects_path(), [pid, "legacyA", "legacyB"])
        self.assertEqual(self._ids(), [])
        write_hidden_ids(na.hidden_projects_path(), [])
        self.assertEqual(self._ids(), [pid, "legacyA", "legacyB"])

    def test_invalid_file_hides_nothing(self):
        pid = self.store.create_project("P")["id"]
        p = na.hidden_projects_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("{broken", encoding="utf-8")
        merged = na.merge_projects_list(LEGACY)
        self.assertEqual([r["id"] for r in merged["projects"]], [pid, "legacyA", "legacyB"])
        self.assertEqual(merged["active_project_id"], "legacyA")


class CliTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(Path(self._tmp.name))
        na.set_native_store(self.store)
        self.cli = _load_cli()

    def tearDown(self):
        na.set_native_store(None)
        self._tmp.cleanup()

    def _run(self, *argv):
        buf = io.StringIO()
        with mock.patch.object(self.cli.gg_data, "list_projects", lambda: LEGACY), contextlib.redirect_stdout(buf):
            self.assertEqual(self.cli.main(list(argv)), 0)
        return buf.getvalue()

    def test_hide_all_then_unhide_all(self):
        a = self.store.create_project("A")["id"]
        trashed = self.store.create_project("T")["id"]
        self.store.delete_project(trashed)
        out = self._run("--hide-all")
        self.assertIn("Hidden 3 projects (native 1, imported 2)", out)
        self.assertEqual(load_hidden_ids(na.hidden_projects_path()), {a, "legacyA", "legacyB"})
        self.assertEqual([p["id"] for p in na.merge_projects_list(LEGACY)["projects"]], [])
        self.assertIsNotNone(self.store.get_project(a))

        out = self._run("--unhide-all")
        self.assertIn("Unhid 3 projects", out)
        self.assertEqual(json.loads(na.hidden_projects_path().read_text(encoding="utf-8")), {"hidden_ids": []})

    def test_option_required(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            self.cli.main([])
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            self.cli.main(["--hide-all", "--unhide-all"])
        self.assertFalse(na.hidden_projects_path().exists())


if __name__ == "__main__":
    unittest.main()
