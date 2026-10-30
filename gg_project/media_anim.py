"""Animated image files (WebP, GIF, APNG): frame count and length read from the file structure, no decoding."""
from __future__ import annotations

import struct
from pathlib import Path
from typing import BinaryIO

ANIM_EXT = {".webp", ".gif", ".png"}


def animation_info(path: Path | str) -> dict | None:
    """{"frames": n, "seconds": s | None} for a WebP / GIF / PNG with more than one frame, else None
    (still image, other type, unreadable file)."""
    p = Path(path)
    reader = {".webp": _webp, ".gif": _gif, ".png": _apng}.get(p.suffix.lower())
    if reader is None:
        return None
    try:
        with open(p, "rb") as f:
            frames, ms = reader(f)
    except (OSError, ValueError, struct.error, IndexError):
        return None
    if frames < 2:
        return None
    return {"frames": frames, "seconds": round(ms / 1000.0, 3) if ms > 0 else None}


def _webp(f: BinaryIO) -> tuple[int, float]:
    head = f.read(12)
    if len(head) < 12 or head[:4] != b"RIFF" or head[8:12] != b"WEBP":
        return 0, 0.0
    frames, ms = 0, 0.0
    while True:
        hdr = f.read(8)
        if len(hdr) < 8:
            break
        fourcc, size = hdr[:4], struct.unpack("<I", hdr[4:])[0]
        if fourcc == b"VP8X":
            data = f.read(size)
            if not data or not data[0] & 0x02:
                return 0, 0.0
            rest = size - len(data)
        elif fourcc == b"ANMF":
            data = f.read(16)
            if len(data) < 16:
                break
            frames += 1
            ms += int.from_bytes(data[12:15], "little")
            rest = size - 16
        elif fourcc in (b"VP8 ", b"VP8L"):
            return 0, 0.0
        else:
            rest = size
        f.seek(rest + (size & 1), 1)
    return frames, ms


def _skip_sub_blocks(f: BinaryIO) -> None:
    while True:
        n = f.read(1)
        if not n:
            raise ValueError("truncated GIF")
        if n[0] == 0:
            return
        f.seek(n[0], 1)


def _gif(f: BinaryIO) -> tuple[int, float]:
    head = f.read(13)
    if len(head) < 13 or head[:6] not in (b"GIF87a", b"GIF89a"):
        return 0, 0.0
    if head[10] & 0x80:
        f.seek(3 << ((head[10] & 0x07) + 1), 1)
    frames, ms, delay = 0, 0.0, 0
    while True:
        b = f.read(1)
        if not b or b == b"\x3b":
            break
        if b == b"\x21":
            label = f.read(1)
            if label == b"\xf9":
                n = f.read(1)
                data = f.read(n[0]) if n else b""
                if len(data) >= 3:
                    delay = int.from_bytes(data[1:3], "little") * 10
                if n and n[0]:
                    _skip_sub_blocks(f)
            else:
                _skip_sub_blocks(f)
        elif b == b"\x2c":
            desc = f.read(9)
            if len(desc) < 9:
                break
            if desc[8] & 0x80:
                f.seek(3 << ((desc[8] & 0x07) + 1), 1)
            f.read(1)
            _skip_sub_blocks(f)
            frames += 1
            ms += delay
            delay = 0
        else:
            break
    return frames, ms


def _apng(f: BinaryIO) -> tuple[int, float]:
    if f.read(8) != b"\x89PNG\r\n\x1a\n":
        return 0, 0.0
    frames, ms = 0, 0.0
    while True:
        hdr = f.read(8)
        if len(hdr) < 8:
            break
        size, kind = struct.unpack(">I", hdr[:4])[0], hdr[4:]
        if kind == b"acTL":
            frames = struct.unpack(">I", f.read(4))[0]
            f.seek(size, 1)
        elif kind == b"fcTL":
            data = f.read(size)
            num, den = struct.unpack(">HH", data[20:24])
            ms += num * 1000.0 / (den or 100)
            f.seek(4, 1)
        elif kind == b"IDAT" and not frames:
            return 0, 0.0
        elif kind == b"IEND":
            break
        else:
            f.seek(size + 4, 1)
    return frames, ms
