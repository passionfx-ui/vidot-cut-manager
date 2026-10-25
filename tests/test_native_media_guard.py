"""native_media_path skips legacy 공간쉐어 job/version ids."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_native_api import _skip_native_media_lookup, native_media_path, set_native_store
from gg_project import LocalStore


class NativeMediaGuardTests(unittest.TestCase):
    def test_skip_legacy_ids(self):
        self.assertTrue(_skip_native_media_lookup("j0211_4c1d51"))
        self.assertTrue(_skip_native_media_lookup("v12345678901_ab12cd"))
        self.assertFalse(_skip_native_media_lookup("a1b2c3d4-e5f6-7890-abcd-ef1234567890"))

    def test_native_media_path_not_scanned_for_job_id(self):
        tmp = tempfile.TemporaryDirectory()
        try:
            store = LocalStore(Path(tmp.name))
            set_native_store(store)
            with patch.object(store, "find_version_asset") as spy:
                self.assertIsNone(native_media_path("j0211_4c1d51"))
                spy.assert_not_called()
        finally:
            tmp.cleanup()


if __name__ == "__main__":
    unittest.main()
