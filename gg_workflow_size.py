"""Apply project generation width/height to workflow latent / video size nodes at queue time."""
from __future__ import annotations

import copy
import logging
from typing import Any

log = logging.getLogger("gonggan.gen_size")

# (class_type, width key, height key, round_to when video job)
_SIZE_NODES: tuple[tuple[str, str, str, int], ...] = (
    ("EmptyLatentImage", "width", "height", 8),
    ("EmptySD3LatentImage", "width", "height", 8),
    ("EmptyFlux2LatentImage", "width", "height", 8),
    ("EmptyLTXVLatentVideo", "width", "height", 16),
    ("LTXVImgToVideo", "width", "height", 16),
    ("EmptyHunyuanLatentVideo", "width", "height", 16),
    ("WanImageToVideo", "width", "height", 16),
    ("Wan22ImageToVideo", "width", "height", 16),
    ("Wan22ImageToVideoExtend", "width", "height", 16),
)

_VIDEO_ROUND_TYPES = frozenset(
    {t for t, _w, _h, r in _SIZE_NODES if r >= 16}
)


def _round_dim(value: Any, round_to: int) -> int:
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = 512
    v = max(round_to, min(4096, v))
    return (v // round_to) * round_to


def apply_generation_size(
    workflow: dict[str, Any],
    width: int,
    height: int,
    *,
    video: bool = False,
) -> dict[str, Any]:
    """Patch matching nodes in place. Returns summary for logs and dry-run responses."""
    if not isinstance(workflow, dict):
        return {"patched": 0, "warned": True, "width": width, "height": height, "nodes": []}

    w_base, h_base = int(width), int(height)
    patched: list[dict[str, Any]] = []
    for nid, node in workflow.items():
        if not isinstance(node, dict):
            continue
        ct = str(node.get("class_type") or "")
        spec = next((s for s in _SIZE_NODES if s[0] == ct), None)
        if not spec:
            continue
        _ct, wkey, hkey, _default_round = spec
        round_to = 16 if video and ct in _VIDEO_ROUND_TYPES else 8
        w = _round_dim(w_base, round_to)
        h = _round_dim(h_base, round_to)
        inputs = node.setdefault("inputs", {})
        if not isinstance(inputs, dict):
            continue
        if wkey not in inputs and hkey not in inputs:
            continue
        if isinstance(inputs.get(wkey), (list, tuple)) or isinstance(inputs.get(hkey), (list, tuple)):
            continue
        inputs[wkey] = w
        inputs[hkey] = h
        patched.append({"id": str(nid), "class_type": ct, "width": w, "height": h})

    warned = not patched
    if warned:
        log.warning(
            "No latent/size node found for generation settings (%sx%s); workflow sizes unchanged",
            w_base,
            h_base,
        )
    elif patched:
        log.info(
            "Applied generation size %sx%s to %s node(s)",
            patched[0]["width"],
            patched[0]["height"],
            len(patched),
        )
    return {
        "patched": len(patched),
        "warned": warned,
        "width": patched[0]["width"] if patched else w_base,
        "height": patched[0]["height"] if patched else h_base,
        "nodes": patched,
    }


def apply_generation_size_copy(
    workflow: dict[str, Any],
    width: int,
    height: int,
    *,
    video: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    wf = copy.deepcopy(workflow)
    info = apply_generation_size(wf, width, height, video=video)
    return wf, info
