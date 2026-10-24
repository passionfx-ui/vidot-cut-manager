"""Content-addressed workflow JSON blobs."""
from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_workflow_bytes(obj: dict[str, Any]) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def workflow_sha256(obj: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_workflow_bytes(obj)).hexdigest()
