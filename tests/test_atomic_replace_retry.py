"""project.json replace retries a brief Windows lock. Temp dir only; never the real projects/ folder."""
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

from gg_project import local_store


class AtomicReplaceRetryTests(unittest.TestCase):
    def test_first_locks_then_replace_succeeds(self):
        real = Path.replace
        left = {"n": 3}
        calls = {"n": 0}

        def wrapped(self, target):
            calls["n"] += 1
            if left["n"] > 0:
                left["n"] -= 1
                err = PermissionError(13, "Access is denied")
                err.winerror = 5
                raise err
            return real(self, target)

        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw) / "project.json"
            with mock.patch.object(Path, "replace", wrapped), \
                    mock.patch.object(local_store.time, "sleep") as slept:
                local_store._atomic_write_json(dest, {"ok": True, "n": 1})
            self.assertEqual(json.loads(dest.read_text(encoding="utf-8")), {"ok": True, "n": 1})
            self.assertEqual(calls["n"], 4)
            self.assertEqual(slept.call_count, 3)
            self.assertFalse(dest.with_suffix(dest.suffix + ".tmp").exists())

    def test_lock_that_lasts_reraises_the_same_error(self):
        calls = {"n": 0}

        def wrapped(self, target):
            calls["n"] += 1
            err = PermissionError(13, "Access is denied")
            err.winerror = 5
            raise err

        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw) / "project.json"
            with mock.patch.object(Path, "replace", wrapped), \
                    mock.patch.object(local_store.time, "sleep"):
                with self.assertRaises(PermissionError) as caught:
                    local_store._atomic_write_json(dest, {"ok": False})
            self.assertEqual(caught.exception.winerror, 5)
            self.assertEqual(calls["n"], local_store._REPLACE_ATTEMPTS)
            self.assertFalse(dest.exists())
