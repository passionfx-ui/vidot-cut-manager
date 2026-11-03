"""Qwen Image Edit 2511 reference images on an API prompt.

Linked references fill image1, image2, image3 in link order. Unused inputs are
removed, and the LoadImage / scale nodes that only fed them are removed, so the
queued graph stays valid. No image1 uses an empty latent.
"""
from __future__ import annotations

from typing import Any

QWEN_EDIT_TYPE = "TextEncodeQwenImageEditPlus"
QWEN_IMAGE_SLOTS = ("image1", "image2", "image3")


def qwen_ref_warning(live_count: int) -> str:
    n = int(live_count or 0)
    if n <= 3:
        return ""
    return f"Qwen Image Edit 2511 ref: {n} linked references; using the first 3"


def is_qwen_edit_api(prompt: Any) -> bool:
    if not isinstance(prompt, dict) or isinstance(prompt.get("nodes"), list):
        return False
    return any(isinstance(node, dict) and node.get("class_type") == QWEN_EDIT_TYPE for node in prompt.values())


def _is_link(value: Any) -> bool:
    return (
        isinstance(value, (list, tuple))
        and len(value) >= 2
        and isinstance(value[1], int)
        and not isinstance(value[1], bool)
        and isinstance(value[0], (str, int))
        and not isinstance(value[0], bool)
    )


def _link_target(value: Any) -> str:
    return str(value[0]) if _is_link(value) else ""


def _api_nodes(prompt: dict) -> list[tuple[str, dict]]:
    return [
        (str(nid), node)
        for nid, node in prompt.items()
        if isinstance(node, dict) and node.get("class_type")
    ]


def _chain_for_slot(prompt: dict, encoders: list[dict], slot: str) -> list[str]:
    ids: list[str] = []
    for enc in encoders:
        inputs = enc.get("inputs") if isinstance(enc.get("inputs"), dict) else {}
        target = _link_target(inputs.get(slot))
        node = prompt.get(target) if target else None
        if not isinstance(node, dict):
            continue
        ids.append(target)
        inner = _link_target((node.get("inputs") or {}).get("image") if isinstance(node.get("inputs"), dict) else None)
        if inner and inner != target and isinstance(prompt.get(inner), dict):
            ids.append(inner)
        break
    if slot == "image1":
        known = set(ids)
        for nid, node in _api_nodes(prompt):
            if node.get("class_type") != "VAEEncode":
                continue
            inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
            src = _link_target(inputs.get("pixels"))
            if src and src in known:
                ids.append(nid)
    return ids


def _load_id(prompt: dict, ids: list[str]) -> str:
    for nid in ids:
        node = prompt.get(nid)
        if isinstance(node, dict) and node.get("class_type") == "LoadImage":
            return nid
    return ""


def _referenced(prompt: dict) -> set[str]:
    refs: set[str] = set()
    for _nid, node in _api_nodes(prompt):
        inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
        for value in inputs.values():
            target = _link_target(value)
            if target:
                refs.add(target)
    return refs


def _drop_unreferenced(prompt: dict, candidates: set[str]) -> None:
    pending = set(candidates)
    changed = True
    while changed:
        changed = False
        refs = _referenced(prompt)
        for nid in list(pending):
            if nid not in prompt or nid in refs:
                continue
            del prompt[nid]
            pending.discard(nid)
            changed = True


def _ensure_empty_latent(prompt: dict) -> str:
    for nid, node in _api_nodes(prompt):
        if node.get("class_type") == "EmptySD3LatentImage":
            return nid
    nid = "qwen_text_latent"
    prompt[nid] = {
        "class_type": "EmptySD3LatentImage",
        "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        "_meta": {"title": "Text only latent"},
    }
    return nid


def _rewire_text_latent(prompt: dict, image_chain: list[str]) -> str:
    empty_id = _ensure_empty_latent(prompt)
    chain = set(image_chain)
    for _nid, node in _api_nodes(prompt):
        if node.get("class_type") != "KSampler":
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            inputs = {}
            node["inputs"] = inputs
        src = _link_target(inputs.get("latent_image"))
        if not src or src in chain:
            inputs["latent_image"] = [empty_id, 0]
    return empty_id


def apply_qwen_ref_images(prompt: dict, images: list[str] | tuple[str, ...]) -> bool:
    """Write filenames onto image1..image3. Empty strings disconnect that input.

    `images` is index-aligned and at most three long. Returns False when this
    prompt has no TextEncodeQwenImageEditPlus node.
    """
    if not isinstance(prompt, dict) or isinstance(prompt.get("nodes"), list):
        return False
    encoders = [node for _nid, node in _api_nodes(prompt) if node.get("class_type") == QWEN_EDIT_TYPE]
    if not encoders:
        return False
    files = [str(images[i]).strip() if i < len(images) and images[i] is not None else "" for i in range(3)]
    chains = [_chain_for_slot(prompt, encoders, slot) for slot in QWEN_IMAGE_SLOTS]
    drop: set[str] = set()
    for i, slot in enumerate(QWEN_IMAGE_SLOTS):
        file_name = files[i]
        loader = _load_id(prompt, chains[i])
        if file_name and loader:
            node = prompt.get(loader)
            inputs = node.get("inputs") if isinstance(node, dict) else None
            if not isinstance(inputs, dict):
                inputs = {}
                if isinstance(node, dict):
                    node["inputs"] = inputs
            if not _link_target(inputs.get("image")):
                inputs["image"] = file_name
        else:
            file_name = ""
            files[i] = ""
        if not file_name:
            for enc in encoders:
                inputs = enc.get("inputs")
                if isinstance(inputs, dict):
                    inputs.pop(slot, None)
            drop.update(chains[i])
    if not files[0]:
        _rewire_text_latent(prompt, chains[0])
    else:
        for nid, node in _api_nodes(prompt):
            if node.get("class_type") == "EmptySD3LatentImage":
                drop.add(nid)
    _drop_unreferenced(prompt, drop)
    return True
