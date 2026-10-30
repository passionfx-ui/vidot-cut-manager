"""Which node of a workflow (UI graph or API prompt) gets the cut's prompt text and which gets the start image.

Prompt: the node titled "Prompt", else the CLIPTextEncode feeding a sampler/conditioning "positive" input.
Start image: the node titled "Start Image", else the only LoadImage node. Nothing else is guessed."""
from __future__ import annotations

from typing import Any

PROMPT_TITLE = "Prompt"
START_IMAGE_TITLE = "Start Image"
TEXT_KEYS = ("text", "prompt", "value", "string")
ACTIVE_MODES = (0, None)

PROMPT_MISSING = "Prompt node not found. Rename the prompt node to Prompt."
START_IMAGE_MISSING = "Start image node not found. Rename the input node to Start Image."


class NodeNotFound(ValueError):
    """No (or more than one) node matches the rule; the message is shown to the user as is."""


def is_ui(graph: Any) -> bool:
    return isinstance(graph, dict) and isinstance(graph.get("nodes"), list)


def _title(node: dict, ui: bool) -> str:
    t = node.get("title") if ui else (node.get("_meta") or {}).get("title")
    return str(t or "").strip().casefold()


def _type(node: dict, ui: bool) -> str:
    return str((node.get("type") if ui else node.get("class_type")) or "")


def _nodes(graph: dict) -> list[tuple[str, dict]]:
    """(id, node) of the active nodes (muted / bypassed UI nodes are left out)."""
    if is_ui(graph):
        return [(str(n.get("id")), n) for n in graph["nodes"]
                if isinstance(n, dict) and n.get("mode") in ACTIVE_MODES]
    return [(str(k), n) for k, n in graph.items() if isinstance(n, dict) and "class_type" in n]


def _titled(graph: dict, title: str) -> list[tuple[str, dict]]:
    ui = is_ui(graph)
    want = title.casefold()
    return [(nid, n) for nid, n in _nodes(graph) if _title(n, ui) == want]


def _positive_encoder(graph: dict) -> tuple[str, dict] | None:
    nodes = dict(_nodes(graph))
    if is_ui(graph):
        for link in graph.get("links") or []:
            if not isinstance(link, list) or len(link) < 5:
                continue
            src, dst, slot = nodes.get(str(link[1])), nodes.get(str(link[3])), link[4]
            if not src or not dst or src.get("type") != "CLIPTextEncode":
                continue
            inputs = dst.get("inputs") or []
            if isinstance(slot, int) and 0 <= slot < len(inputs) and (inputs[slot] or {}).get("name") == "positive":
                return str(link[1]), src
        return None
    for n in nodes.values():
        ref = (n.get("inputs") or {}).get("positive") if isinstance(n.get("inputs"), dict) else None
        if isinstance(ref, list) and ref:
            src = nodes.get(str(ref[0]))
            if src and src.get("class_type") == "CLIPTextEncode":
                return str(ref[0]), src
    return None


def find_prompt_node(graph: dict) -> tuple[str, dict]:
    """(id, node) that gets the prompt text. Raises NodeNotFound."""
    if not isinstance(graph, dict):
        raise NodeNotFound(PROMPT_MISSING)
    titled = _titled(graph, PROMPT_TITLE)
    if len(titled) > 1:
        raise NodeNotFound(f"More than one node is titled {PROMPT_TITLE}. Keep the title on one node only.")
    if titled:
        return titled[0]
    hit = _positive_encoder(graph)
    if hit is None:
        raise NodeNotFound(PROMPT_MISSING)
    return hit


def _ui_text_index(node: dict) -> int | None:
    wv = node.get("widgets_values")
    if isinstance(wv, list):
        return next((i for i, v in enumerate(wv) if isinstance(v, str)), None)
    return None


def prompt_text(graph: dict) -> str:
    """Current text of the prompt node ("" when none can be read)."""
    try:
        _nid, node = find_prompt_node(graph)
    except NodeNotFound:
        return ""
    if is_ui(graph):
        wv = node.get("widgets_values")
        if isinstance(wv, dict):
            return next((wv[k] for k in TEXT_KEYS if isinstance(wv.get(k), str)), "")
        i = _ui_text_index(node)
        return wv[i] if i is not None else ""
    inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
    return next((inputs[k] for k in TEXT_KEYS if isinstance(inputs.get(k), str)), "")


def set_prompt(graph: dict, text: str) -> str:
    """Write `text` into the prompt node of `graph` (in place); returns the node id. Raises NodeNotFound."""
    nid, node = find_prompt_node(graph)
    if is_ui(graph):
        wv = node.get("widgets_values")
        if isinstance(wv, dict):
            key = next((k for k in TEXT_KEYS if isinstance(wv.get(k), str)), "text")
            wv[key] = text
            return nid
        i = _ui_text_index(node)
        if i is not None:
            wv[i] = text
        elif isinstance(wv, list) and wv:
            wv[0] = text
        else:
            node["widgets_values"] = [text]
        return nid
    inputs = node.setdefault("inputs", {})
    key = next((k for k in TEXT_KEYS if isinstance(inputs.get(k), str)), None)
    if key is None:
        if any(k in inputs for k in TEXT_KEYS):
            raise NodeNotFound(f"The {PROMPT_TITLE} node gets its text from another node; set the text there.")
        key = "text"
    inputs[key] = text
    return nid


def find_start_image_node(graph: dict, *, titled_only: bool = False) -> tuple[str, dict]:
    """(id, node) that gets the start image: titled "Start Image", else the only LoadImage node.
    `titled_only` skips the LoadImage fallback. Raises NodeNotFound."""
    if not isinstance(graph, dict):
        raise NodeNotFound(START_IMAGE_MISSING)
    titled = _titled(graph, START_IMAGE_TITLE)
    if len(titled) > 1:
        raise NodeNotFound(f"More than one node is titled {START_IMAGE_TITLE}. Keep the title on one node only.")
    if titled:
        return titled[0]
    if not titled_only:
        ui = is_ui(graph)
        loaders = [(nid, n) for nid, n in _nodes(graph) if _type(n, ui) == "LoadImage"]
        if len(loaders) == 1:
            return loaders[0]
    raise NodeNotFound(START_IMAGE_MISSING)


def set_start_image(graph: dict, image_name: str, *, titled_only: bool = False) -> str:
    """Point the start image node of an API prompt at `image_name` (a ComfyUI input file); returns the node id."""
    if is_ui(graph):
        raise ValueError("convert the workflow to API format first")
    nid, node = find_start_image_node(graph, titled_only=titled_only)
    inputs = node.setdefault("inputs", {})
    if isinstance(inputs.get("image"), list):
        raise NodeNotFound(f"The {START_IMAGE_TITLE} node gets its image from another node; it must be a Load Image node.")
    inputs["image"] = image_name
    return nid
