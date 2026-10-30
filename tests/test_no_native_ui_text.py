"""User-visible API error strings must not contain the word 'native' (0.9.124+, 0.9.131)."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
_NATIVE_WORD = re.compile(r"(?<![A-Za-z0-9_$])native(?![A-Za-z0-9_$])", re.I)


class NoNativeUiTextTests(unittest.TestCase):
    def test_routes_err_messages(self):
        text = (REPO / "routes.py").read_text(encoding="utf-8")
        bad = []
        for m in re.finditer(r'_err\(\d+,\s*"([^"]+)"\)', text):
            msg = m.group(1)
            if _NATIVE_WORD.search(msg):
                bad.append(msg)
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
