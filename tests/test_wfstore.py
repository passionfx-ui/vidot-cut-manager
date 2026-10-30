"""Tests for per-version workflow store (stdlib unittest only)."""
from __future__ import annotations

import json
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_wfstore as wfs

API_PROMPT = {"3": {"class_type": "KSampler", "inputs": {"seed": 42}}}
UI_WF = {"nodes": [{"id": 1, "type": "KSampler"}], "links": [], "version": 0.4}


def _png_chunk(ctype: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(ctype + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + ctype + data + struct.pack(">I", crc)


def _minimal_png(text_chunks: dict[str, str]) -> bytes:
    out = wfs._PNG_SIG
    # 1x1 RGBA
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    out += _png_chunk(b"IHDR", ihdr)
    raw = zlib.compress(b"\x00" + b"\x00\x00\xff\x00\x00\xff\x00\x00\xff\xff")
    out += _png_chunk(b"IDAT", raw)
    for key, val in text_chunks.items():
        data = key.encode("latin-1") + b"\x00" + val.encode("utf-8")
        out += _png_chunk(b"tEXt", data)
    out += _png_chunk(b"IEND", b"")
    return out


class WfstoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.workflows = root / "workflows"
        self.versions = root / "versions"
        self.patches = [
            mock.patch.object(wfs, "WORKFLOWS_DIR", self.workflows),
            mock.patch.object(wfs, "VERSIONS_DIR", self.versions),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self._tmp.cleanup()

    def test_save_and_get_roundtrip(self):
        wfs.save_version_workflow("p1", "c1", "v1700000000000_abc123", UI_WF, API_PROMPT, "generated")
        rec = wfs.get_version_workflow("p1", "c1", "v1700000000000_abc123")
        self.assertIsNotNone(rec)
        self.assertEqual(rec["source"], "generated")
        self.assertEqual(rec["workflow"]["nodes"][0]["type"], "KSampler")
        self.assertIn("3", rec["prompt"])

    def test_extract_png_meta(self):
        png = _minimal_png({
            "workflow": json.dumps(UI_WF),
            "prompt": json.dumps(API_PROMPT),
        })
        path = Path(self._tmp.name) / "x.png"
        path.write_bytes(png)
        meta = wfs.extract_png_meta(path)
        self.assertEqual(meta["workflow"]["nodes"][0]["type"], "KSampler")
        self.assertEqual(meta["prompt"]["3"]["class_type"], "KSampler")

    def test_backfill_idempotent_and_png_unchanged(self):
        pid, cut, vid = "proj1", "cutA", "v1700000000001_a1b2c3"
        d = self.versions / pid / cut
        d.mkdir(parents=True)
        png_path = d / f"{vid}.png"
        png_bytes = _minimal_png({"prompt": json.dumps(API_PROMPT)})
        png_path.write_bytes(png_bytes)
        (d / f"{vid}.json").write_text(json.dumps({"id": vid, "ext": ".png"}), encoding="utf-8")

        c1 = wfs.backfill()
        self.assertEqual(c1["written"], 1)
        self.assertEqual(png_path.read_bytes(), png_bytes)

        c2 = wfs.backfill()
        self.assertEqual(c2["skipped"], 1)
        self.assertEqual(c2["written"], 0)
        self.assertEqual(png_path.read_bytes(), png_bytes)

        rec = wfs.get_version_workflow(pid, cut, vid)
        self.assertEqual(rec["source"], "png-backfill")
        self.assertEqual(rec["prompt"]["3"]["class_type"], "KSampler")

    def test_invalid_ids_rejected(self):
        with self.assertRaises(ValueError):
            wfs.save_version_workflow("../x", "c1", "v1700000000000_abc123", None, API_PROMPT, "generated")


if __name__ == "__main__":
    unittest.main()
