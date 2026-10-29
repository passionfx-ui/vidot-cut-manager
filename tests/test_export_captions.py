"""Captions burned into the mp4 export (0.9.92): timing, text, wrapping, drawtext filter."""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_export


def _clip(cid, start, sec, caption="", media=None):
    return {"id": cid, "start": start, "sec": sec, "in": 0, "media": media, "caption": caption}


class CaptionTimingTests(unittest.TestCase):
    def _spans(self, cuts, fps):
        """(clip id, start sec, end sec, caption) for each plan segment that gets a caption."""
        out, frame = [], 0
        for c, frames in gg_export.export_plan(cuts, fps):
            text = gg_export.caption_text(c)
            if text:
                out.append((c["id"], frame / fps, (frame + frames) / fps, text))
            frame += frames
        return out

    def test_span_is_placed_start_to_start_plus_sec_with_gaps(self):
        cuts = [
            _clip("b", 3.0, 1.5, "Second"),
            _clip("a", 0.0, 2.0, "First"),
            _clip("c", 6.0, 1.0, "Third"),
        ]
        self.assertEqual(self._spans(cuts, 24), [
            ("a", 0.0, 2.0, "First"),
            ("b", 3.0, 4.5, "Second"),
            ("c", 6.0, 7.0, "Third"),
        ])

    def test_gap_and_blank_captions_get_nothing(self):
        cuts = [_clip("a", 0.0, 1.0, "  \n\t "), _clip("b", 2.0, 1.0, "Hi"), _clip("c", 3.0, 1.0)]
        plan = gg_export.export_plan(cuts, 25)
        self.assertIs(plan[1][0], gg_export.GAP_CLIP)
        self.assertEqual(gg_export.caption_text(gg_export.GAP_CLIP), "")
        self.assertEqual(self._spans(cuts, 25), [("b", 2.0, 3.0, "Hi")])

    def test_trimmed_length_drives_the_span(self):
        cuts = [_clip("a", 0.0, 1.25, "Trimmed", media={"id": "x", "kind": "video"})]
        self.assertEqual(self._spans(cuts, 24), [("a", 0.0, 1.25, "Trimmed")])

    def test_overlapping_clip_caption_starts_at_previous_end(self):
        cuts = [_clip("a", 0.0, 2.0, "A"), _clip("b", 1.0, 1.0, "B")]
        self.assertEqual(self._spans(cuts, 24), [("a", 0.0, 2.0, "A"), ("b", 2.0, 3.0, "B")])

    def test_legacy_cut_without_caption_key(self):
        self.assertEqual(gg_export.caption_text({"id": "a", "sec": 1.0, "notes": "legacy"}), "")
        self.assertEqual(gg_export.caption_text({"caption": None}), "")


class CaptionTextTests(unittest.TestCase):
    def test_normalizes_like_overlay(self):
        raw = "\r\n  \n안녕하세요   \r\n\r\n\r\n\nSecond\tline  \n\n"
        self.assertEqual(gg_export.caption_text({"caption": raw}), "안녕하세요\n\nSecond line")

    def test_drops_control_chars(self):
        self.assertEqual(gg_export.caption_text({"caption": "a\x00b\x1bc"}), "abc")

    def test_wrap_breaks_at_spaces(self):
        self.assertEqual(gg_export.wrap_caption("aaaa bbbb cccc", 4.0, 9), "aaaa\nbbbb\ncccc")
        self.assertEqual(gg_export.wrap_caption("aaaa bbbb", 9.0, 9), "aaaa bbbb")

    def test_wrap_counts_korean_as_wide(self):
        self.assertEqual(gg_export.wrap_caption("가나다라마바", 3.0, 9), "가나다\n라마바")
        self.assertEqual(gg_export.wrap_caption("제비가 박씨를", 7.0, 9), "제비가 박씨를")
        self.assertEqual(gg_export.wrap_caption("제비가 박씨를", 6.0, 9), "제비가\n박씨를")

    def test_wrap_keeps_blank_lines_and_limits_lines(self):
        self.assertEqual(gg_export.wrap_caption("a\n\nb", 10.0, 9), "a\n\nb")
        self.assertEqual(gg_export.wrap_caption("one\ntwo\nthree\nfour", 10.0, 2), "one\ntwo…")


class CaptionFilterTests(unittest.TestCase):
    def test_filter_value_escapes_both_levels(self):
        self.assertEqual(gg_export._filter_value("C:/Windows/Fonts/malgun.ttf"), r"C\\:/Windows/Fonts/malgun.ttf")
        self.assertEqual(gg_export._filter_value("a'b[c],d;e"), r"a\\\'b\[c\]\,d\;e")

    def test_overlay_style(self):
        f = gg_export.caption_filter("cap_001.txt", 1280, 720, Path(r"C:\Windows\Fonts\malgun.ttf"))
        self.assertTrue(f.startswith(r"drawtext=fontfile=C\\:/Windows/Fonts/malgun.ttf:textfile=cap_001.txt:"))
        for part in ("expansion=none", "text_align=center", "fontcolor=white", "box=1",
                     "boxcolor=black@0.65", "x=(w-text_w)/2", "y=h-text_h-"):
            self.assertIn(part, f)

    def test_no_font_falls_back_to_fontconfig(self):
        self.assertIn("drawtext=font=Sans:", gg_export.caption_filter("cap_000.txt", 854, 480, None))

    def test_layout_scales_with_height(self):
        small, big = gg_export.caption_layout(854, 480), gg_export.caption_layout(1920, 1080)
        self.assertLess(small["size"], big["size"])
        self.assertGreaterEqual(small["max_lines"], 1)

    def test_segment_cmd_inserts_caption_before_format(self):
        cap = gg_export.caption_filter("cap_000.txt", 1280, 720, None)
        cmd = gg_export._segment_cmd("ffmpeg", gg_export.GAP_CLIP, None, Path("seg.mkv"), 1280, 720, 24, 24,
                                     False, cap)
        vf = cmd[cmd.index("-vf") + 1]
        self.assertTrue(vf.endswith("," + cap + ",format=yuv420p"))
        plain = gg_export._segment_cmd("ffmpeg", gg_export.GAP_CLIP, None, Path("seg.mkv"), 1280, 720, 24, 24,
                                       False)
        self.assertNotIn("drawtext", plain[plain.index("-vf") + 1])


@unittest.skipUnless(shutil.which("ffmpeg") and gg_export.caption_font(), "needs ffmpeg and a Korean font")
class CaptionFfmpegTests(unittest.TestCase):
    def test_tiny_segment_with_korean_and_special_chars(self):
        w, h, fps = 320, 180, 24
        lay = gg_export.caption_layout(w, h)
        text = gg_export.caption_text({"caption": "제비: 100% 'quote' [x], a;b \\n %{pts}"})
        with tempfile.TemporaryDirectory(prefix="gg cap '") as d:
            work = Path(d)
            (work / "cap_000.txt").write_text(gg_export.wrap_caption(text, lay["max_em"], lay["max_lines"]),
                                              encoding="utf-8", newline="\n")
            cap = gg_export.caption_filter("cap_000.txt", w, h, gg_export.caption_font())
            cmd = gg_export._segment_cmd(shutil.which("ffmpeg"), gg_export.GAP_CLIP, None, work / "seg.mkv",
                                         w, h, fps, 6, False, cap)
            r = subprocess.run(cmd, cwd=work, capture_output=True, text=True, encoding="utf-8", errors="replace",
                               timeout=60)
            self.assertEqual(r.returncode, 0, r.stderr[-600:])
            self.assertGreater((work / "seg.mkv").stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
