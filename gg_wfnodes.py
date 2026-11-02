"""Which node of a workflow (UI graph or API prompt) gets the cut's prompt text and which gets the start image.

Prompt: the node titled "Prompt", else the CLIPTextEncode feeding a sampler/conditioning "positive" input.
Start image: the node titled "Start Image", else the first LoadImage node (lowest id). Nothing else is guessed."""
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


def _id_key(nid) -> tuple:
    s = str(nid)
    return (0, int(s), s) if s.isdigit() else (1, 0, s)


def _parse_linear_input(row: Any) -> tuple[str, str, str, str] | None:
    """(graph id, node id, widget name, label) from one linearData input row."""
    if not isinstance(row, (list, tuple)) or len(row) < 2:
        return None
    head, label = row[0], row[1]
    if isinstance(head, str) and head.count(":") >= 2:
        parts = head.split(":")
        widget, node_id = parts[-1], parts[-2]
        graph_id = ":".join(parts[:-2])
        if graph_id and node_id and widget:
            return graph_id, str(node_id), str(widget), str(label if label is not None else widget)
    if isinstance(head, (int, str)) and label is not None:
        return "", str(head), str(label), str(label)
    return None


def _nodes_deep(graph: dict) -> list[tuple[str, dict, str]]:
    """(id, node, graph id) for the root graph, then each subgraph definition."""
    ui = is_ui(graph)
    rows = [(nid, node, "") for nid, node in _nodes(graph)]
    if not ui:
        return rows
    defs = graph.get("definitions") if isinstance(graph.get("definitions"), dict) else {}
    for sg in defs.get("subgraphs") or []:
        if not isinstance(sg, dict):
            continue
        gid = str(sg.get("id") or "")
        for node in sg.get("nodes") or []:
            if isinstance(node, dict) and node.get("mode") in ACTIVE_MODES:
                rows.append((str(node.get("id")), node, gid))
    return rows


def _linear_load_image(graph: dict) -> tuple[str, dict] | None:
    """LoadImage named by extra.linearData inputs, or None."""
    extra = graph.get("extra") if isinstance(graph.get("extra"), dict) else None
    linear = extra.get("linearData") if isinstance(extra, dict) else None
    rows = linear.get("inputs") if isinstance(linear, dict) else None
    if not isinstance(rows, list):
        return None
    ui = is_ui(graph)
    nodes = _nodes_deep(graph)
    hits: list[tuple[str, dict, str]] = []
    for row in rows:
        parsed = _parse_linear_input(row)
        if not parsed:
            continue
        graph_id, node_id, widget, label = parsed
        matches = [item for item in nodes if item[0] == node_id]
        if graph_id:
            exact = [item for item in matches if item[2] == graph_id]
            if exact:
                matches = exact
        for nid, node, _gid in matches:
            if _type(node, ui) == "LoadImage":
                hits.append((nid, node, f"{label} {widget}"))
                break
    if not hits:
        return None

    def rank(blob: str) -> int:
        text = blob.casefold()
        if "start" in text:
            return 0
        if "image" in text:
            return 1
        return 2

    hits.sort(key=lambda item: rank(item[2]))
    return hits[0][0], hits[0][1]


def find_start_image_node(graph: dict, *, titled_only: bool = False) -> tuple[str, dict]:
    """(id, node) that gets the start image.

    An app template's linearData input that points at a LoadImage wins.
    Otherwise the node titled "Start Image", else the first LoadImage (lowest id;
    a subgraph LoadImage is used when the root graph has none).
    `titled_only` keeps the title-only rule. Raises NodeNotFound."""
    if not isinstance(graph, dict):
        raise NodeNotFound(START_IMAGE_MISSING)
    if not titled_only:
        linear = _linear_load_image(graph)
        if linear:
            return linear
    titled = _titled(graph, START_IMAGE_TITLE)
    if len(titled) > 1:
        raise NodeNotFound(f"More than one node is titled {START_IMAGE_TITLE}. Keep the title on one node only.")
    if titled:
        return titled[0]
    if not titled_only:
        ui = is_ui(graph)
        root_ids = {nid for nid, _node in _nodes(graph)}
        loaders = [(nid, node) for nid, node, _gid in _nodes_deep(graph) if _type(node, ui) == "LoadImage"]
        root_loaders = [item for item in loaders if item[0] in root_ids]
        chosen = root_loaders or loaders
        if chosen:  # several Load Image nodes: the first one (lowest node id) is the start image
            return min(chosen, key=lambda it: _id_key(it[0]))
    raise NodeNotFound(START_IMAGE_MISSING)


def _write_ui_image_value(node: dict, image_name: str) -> None:
    """Write the filename into both widget stores. Saved graphs restore widgets_values_named over the array."""
    wv = node.get("widgets_values")
    if isinstance(wv, dict):
        wv["image"] = image_name
    elif isinstance(wv, list) and wv:
        wv[0] = image_name
    else:
        node["widgets_values"] = [image_name, "image"]
    named = node.get("widgets_values_named")
    if not isinstance(named, dict):
        named = {}
        node["widgets_values_named"] = named
    named["image"] = image_name
    if named.get("upload") is None:
        named["upload"] = "image"


def set_node_image(graph: dict, node_id: str, image_name: str) -> str:
    """Write `image_name` onto one already chosen node. Raises NodeNotFound when that id is gone."""
    nid = str(node_id)
    if is_ui(graph):
        for cand, node, _gid in _nodes_deep(graph):
            if cand == nid:
                _write_ui_image_value(node, image_name)
                return nid
        raise NodeNotFound(START_IMAGE_MISSING)
    node = graph.get(nid)
    if not isinstance(node, dict):
        raise NodeNotFound(START_IMAGE_MISSING)
    inputs = node.setdefault("inputs", {})
    if isinstance(inputs.get("image"), list):
        raise NodeNotFound(f"The {START_IMAGE_TITLE} node gets its image from another node; it must be a Load Image node.")
    inputs["image"] = image_name
    return nid


def set_start_image(graph: dict, image_name: str, *, titled_only: bool = False) -> str:
    """Point the start image node at `image_name` (a ComfyUI input file); returns the node id.

    UI graphs get widgets_values and widgets_values_named (ComfyUI restores the named file).
    API prompts get inputs.image."""
    nid, node = find_start_image_node(graph, titled_only=titled_only)
    if is_ui(graph):
        _write_ui_image_value(node, image_name)
        return nid
    inputs = node.setdefault("inputs", {})
    if isinstance(inputs.get("image"), list):
        raise NodeNotFound(f"The {START_IMAGE_TITLE} node gets its image from another node; it must be a Load Image node.")
    inputs["image"] = image_name
    return nid
