"""Seed synthetic placeholder images (flat gradients, no real content) as takes for demo cuts.

Usage: python seed_demo_thumbs.py <pid> <cut_id> [<cut_id> ...]
Writes through LocalStore.add_version (same code the server uses). Temp PNGs go to the OS temp dir.
"""
import struct
import sys
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from gg_project.local_store import LocalStore  # noqa: E402

W, H = 640, 360
PALETTE = [((38, 70, 110), (190, 150, 90)), ((70, 40, 90), (220, 120, 100)), ((30, 90, 80), (200, 210, 150)),
           ((90, 50, 40), (240, 200, 120)), ((40, 50, 70), (150, 190, 220)), ((60, 30, 60), (180, 120, 170))]


def png(path: Path, c1, c2) -> None:
    rows = []
    for y in range(H):
        t = y / (H - 1)
        row = bytearray([0])
        for x in range(W):
            u = (t * 0.7) + (x / (W - 1)) * 0.3
            row += bytes(int(c1[i] + (c2[i] - c1[i]) * u) for i in range(3))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 6)

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def main() -> None:
    pid, cut_ids = sys.argv[1], sys.argv[2:]
    store = LocalStore(ROOT)
    with tempfile.TemporaryDirectory(prefix="gg-seed-") as tmp:
        for i, cid in enumerate(cut_ids):
            p = Path(tmp) / f"demo_{i}.png"
            png(p, *PALETTE[i % len(PALETTE)])
            store.add_version(pid, cid, p)
    print(f"seeded {len(cut_ids)}")


if __name__ == "__main__":
    main()