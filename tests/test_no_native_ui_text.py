"""User-visible strings must not contain 'native' or internal 'gonggan' paths (0.9.136)."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
_NATIVE_WORD = re.compile(r"(?<![A-Za-z0-9_$])native(?![A-Za-z0-9_$])", re.I)
_GONGGAN_WORD = re.compile(r"\bgonggan\b", re.I)
_USER_MSG_FILES = (
    REPO / "web" / "gg_confirm_core.js",
    REPO / "web" / "gg_text_core.js",
)


class NoNativeUiTextTests(unittest.TestCase):
    def test_routes_err_messages(self):
        text = (REPO / "routes.py").read_text(encoding="utf-8")
        bad = []
        for m in re.finditer(r'_err\(\d+,\s*"([^"]+)"\)', text):
            msg = m.group(1)
            if _NATIVE_WORD.search(msg) or _GONGGAN_WORD.search(msg):
                bad.append(msg)
        self.assertEqual(bad, [])

    def test_dialog_and_toast_helper_files_have_no_forbidden_literals(self):
        bad = []
        for path in _USER_MSG_FILES:
            if not path.is_file():
                continue
            src = path.read_text(encoding="utf-8")
            for m in re.finditer(r'"(?:[^"\\]|\\.)*"', src):
                lit = m.group(0)[1:-1]
                if _NATIVE_WORD.search(lit) or _GONGGAN_WORD.search(lit):
                    bad.append(f"{path.name}: {lit[:80]}")
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
