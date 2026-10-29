"""UUIDv7 and timestamps (stdlib only)."""
from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def uuid7(now_ms: int | None = None) -> str:
    """RFC 9562 UUID version 7: 48-bit unix ms timestamp + random."""
    if now_ms is None:
        now_ms = int(time.time() * 1000)
    ts = int(now_ms) & 0xFFFFFFFFFFFF
    rand_a = int.from_bytes(os.urandom(2), "big") & 0x0FFF
    rand_b = int.from_bytes(os.urandom(8), "big") & 0x3FFFFFFFFFFFFFFF
    uuid_int = ts << 80
    uuid_int |= 0x7 << 76
    uuid_int |= rand_a << 64
    uuid_int |= 0x8000000000000000
    uuid_int |= rand_b
    hex32 = f"{uuid_int:032x}"
    return f"{hex32[:8]}-{hex32[8:12]}-{hex32[12:16]}-{hex32[16:20]}-{hex32[20:]}"


# Native project / cut / version ids are always lowercase uuid-shaped. Anything else (".." , "/", "C:", a trailing
# dash, upper case that would alias on a case-insensitive disk ...) is never a native id and must never become a path.
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def is_uuid_id(value: object) -> bool:
    return isinstance(value, str) and _UUID_RE.fullmatch(value) is not None
