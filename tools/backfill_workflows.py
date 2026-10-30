"""CLI shim: backfill version workflow JSON from PNG metadata (no ComfyUI server needed)."""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from gg_wfstore import _main

if __name__ == "__main__":
    raise SystemExit(_main())
