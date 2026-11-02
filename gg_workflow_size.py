"""Apply project generation width/height to workflow latent / video size nodes.

Queue time uses the API prompt (`apply_generation_size`). A new cut's copied
template (UI graph or .app.json) is patched once in `apply_new_cut_generation_size`.
"""
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


_KNOWN_SIZE_TYPES = frozenset(t for t, _w, _h, _r in _SIZE_NODES)
_SIZE_DIMS = ("width", "height")
_INACTIVE_MODES = (2, 4)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_size_node_type(node_type: str) -> bool:
    """Latent / image / video size nodes. Scale, crop, and size-reader nodes are not size setters."""
    if node_type in _KNOWN_SIZE_TYPES:
        return True
    name = node_type.lower().replace(" ", "").replace("_", "")
    if any(bad in name for bad in ("upscale", "composite", "crop", "scale", "getimagesize", "imagesize")):
        return False
    if name.startswith("empty") and "latent" in name:
        return True
    if "latentimage" in name or "latentvideo" in name:
        return True
    if name.endswith("imagetovideo") or name.endswith("imgtovideo"):
        return True
    return False


def _is_sampler_type(node_type: str) -> bool:
    name = node_type.lower().replace(" ", "").replace("_", "")
    if "samplerselect" in name or name.endswith("select"):
        return False
    return "sampler" in name


def _dims_for_type(node_type: str, width: int, height: int) -> tuple[int, int]:
    """Settings width/height are already snapped to 8. Snap again so a raw value cannot land off-grid."""
    del node_type
    return _round_dim(width, 8), _round_dim(height, 8)


def _widget_spec(node_type: str):
    try:
        from gg_wfconvert import _class_mappings, _spec_for
    except ImportError:
        from .gg_wfconvert import _class_mappings, _spec_for  # type: ignore
    return _spec_for(node_type, _class_mappings())


def _widget_index(node_type: str, widget_name: str) -> int | None:
    spec = _widget_spec(node_type)
    if spec:
        pos = 0
        for name, _default, extra in spec:
            if name == widget_name:
                return pos
            pos += 1 + int(extra or 0)
        return None
    if _is_size_node_type(node_type) and widget_name == "width":
        return 0
    if _is_size_node_type(node_type) and widget_name == "height":
        return 1
    return None


def _linked_widget(node: dict, widget_name: str) -> bool:
    for inp in node.get("inputs") or []:
        if not isinstance(inp, dict) or inp.get("link") is None:
            continue
        widget = inp.get("widget") if isinstance(inp.get("widget"), dict) else {}
        linked_name = widget.get("name") or inp.get("name")
        if linked_name == widget_name:
            return True
    return False


def _active(node: dict) -> bool:
    return node.get("mode") not in _INACTIVE_MODES


def _node_type(node: dict) -> str:
    return str(node.get("type") or node.get("class_type") or "")


def _ui_graphs(root: dict) -> list[tuple[str, dict]]:
    """Root graph plus subgraph definitions (id, graph). Subgraph nodes live on the definition."""
    graphs: list[tuple[str, dict]] = []
    if isinstance(root.get("nodes"), list):
        graphs.append(("", root))
    defs = root.get("definitions")
    if isinstance(defs, dict):
        for sg in defs.get("subgraphs") or []:
            if isinstance(sg, dict) and isinstance(sg.get("nodes"), list):
                graphs.append((str(sg.get("id") or ""), sg))
    return graphs


def _incoming(graph: dict) -> dict[str, list[str]]:
    inc: dict[str, list[str]] = {}
    for link in graph.get("links") or []:
        if isinstance(link, (list, tuple)) and len(link) >= 4:
            src, dst = str(link[1]), str(link[3])
        elif isinstance(link, dict) and "origin_id" in link and "target_id" in link:
            src, dst = str(link.get("origin_id")), str(link.get("target_id"))
        else:
            continue
        inc.setdefault(dst, []).append(src)
    return inc


def _ancestors(start_ids: list[str], incoming: dict[str, list[str]]) -> set[str]:
    seen: set[str] = set()
    stack = list(start_ids)
    while stack:
        nid = stack.pop()
        if nid in seen:
            continue
        seen.add(nid)
        stack.extend(incoming.get(nid, []))
    return seen


def _write_widget(node: dict, widget_name: str, number: int) -> bool:
    """Write one named widget. A linked socket keeps its link (the link wins at run time)."""
    if _linked_widget(node, widget_name):
        return False
    wrote = False
    values = node.get("widgets_values")
    if isinstance(values, dict):
        values[widget_name] = number
        wrote = True
    inputs = node.get("inputs")
    if isinstance(inputs, dict) and widget_name in inputs and not isinstance(inputs.get(widget_name), (list, tuple)):
        inputs[widget_name] = number
        wrote = True
    named = node.get("widgets_values_named")
    if isinstance(named, dict):
        named[widget_name] = number
        wrote = True
    if isinstance(values, list):
        idx = _widget_index(_node_type(node), widget_name)
        if idx is None and widget_name in ("width", "value") and values and _is_number(values[0]):
            idx = 0
        elif idx is None and widget_name == "height" and len(values) > 1 and _is_number(values[1]):
            idx = 1
        if idx is not None and idx < len(values):
            values[idx] = number
            wrote = True
        elif idx is not None and idx == len(values):
            values.append(number)
            wrote = True
    return wrote


def _has_size_widgets(node: dict) -> bool:
    values = node.get("widgets_values")
    if isinstance(values, dict):
        return "width" in values and "height" in values
    if isinstance(values, list) and len(values) >= 2 and _is_number(values[0]) and _is_number(values[1]):
        return True
    named = node.get("widgets_values_named")
    if isinstance(named, dict) and "width" in named and "height" in named:
        return True
    inputs = node.get("inputs")
    if isinstance(inputs, dict) and "width" in inputs and "height" in inputs:
        return not isinstance(inputs.get("width"), (list, tuple)) or not isinstance(inputs.get("height"), (list, tuple))
    return False


def _record(node: dict, graph_id: str, width: int, height: int, via: str) -> dict[str, Any]:
    return {
        "id": str(node.get("id", "")),
        "type": _node_type(node),
        "graph": graph_id,
        "width": width,
        "height": height,
        "via": via,
    }


def _set_node_size(node: dict, width: int, height: int) -> tuple[int | None, int | None] | None:
    node_type = _node_type(node)
    w, h = _dims_for_type(node_type, width, height)
    ok_w = _write_widget(node, "width", w)
    ok_h = _write_widget(node, "height", h)
    if not ok_w and not ok_h:
        return None
    return (w if ok_w else None, h if ok_h else None)


def _parse_linear_input(row: Any) -> tuple[str | None, str, str, str] | None:
    """(graph id or None, node id, widget name, label).

    .app.json inputs are either `[nodeId, widgetName]` or
    `["<graphId>:<nodeId>:<widgetName>", label]`.
    """
    if not isinstance(row, (list, tuple)) or len(row) < 2:
        return None
    head, label = row[0], row[1]
    if isinstance(head, str) and head.count(":") >= 2:
        parts = head.split(":")
        widget = parts[-1]
        node_id = parts[-2]
        graph_id = ":".join(parts[:-2])
        if not graph_id or not node_id or not widget:
            return None
        return graph_id, str(node_id), str(widget), str(label if label is not None else widget)
    if isinstance(head, (int, str)) and label is not None:
        return None, str(head), str(label), str(label)
    return None


def _dimension_name(*names: str) -> str | None:
    for name in names:
        key = str(name or "").strip().casefold()
        if key in _SIZE_DIMS:
            return key
    return None


def _find_linear_nodes(graphs: list[tuple[str, dict]], graph_id: str | None, node_id: str) -> list[tuple[str, dict]]:
    def hits(only: str | None) -> list[tuple[str, dict]]:
        found = []
        for gid, graph in graphs:
            if only is not None and gid != only:
                continue
            for node in graph.get("nodes") or []:
                if isinstance(node, dict) and str(node.get("id")) == node_id and _active(node):
                    found.append((gid, node))
        return found

    if graph_id:
        found = hits(graph_id)
        if found:
            return found
    found = hits(None if not graph_id else "")
    if graph_id and not found:
        return hits(None)
    if not graph_id:
        root = [item for item in hits(None) if item[0] == ""]
        return root or hits(None)
    return found


def _apply_linear_size(graph: dict, width: int, height: int) -> list[dict[str, Any]]:
    extra = graph.get("extra") if isinstance(graph.get("extra"), dict) else None
    linear = extra.get("linearData") if isinstance(extra, dict) else None
    rows = linear.get("inputs") if isinstance(linear, dict) else None
    if not isinstance(rows, list):
        return []
    graphs = _ui_graphs(graph)
    pending: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        parsed = _parse_linear_input(row)
        if not parsed:
            continue
        graph_id, node_id, widget, label = parsed
        dimension = _dimension_name(widget, label)
        if not dimension:
            continue
        for gid, node in _find_linear_nodes(graphs, graph_id, node_id):
            slot = pending.setdefault((gid, str(node.get("id"))), {"node": node, "graph": gid, "widgets": {}})
            # `widget` is the node widget. A label of width/height still selects the dimension.
            slot["widgets"][dimension] = widget
    written: list[dict[str, Any]] = []
    for slot in pending.values():
        node = slot["node"]
        node_type = _node_type(node)
        w, h = _dims_for_type(node_type, width, height)
        widgets: dict[str, str] = slot["widgets"]
        wrote_w = "width" in widgets and _write_widget(node, widgets["width"], w)
        wrote_h = "height" in widgets and _write_widget(node, widgets["height"], h)
        if wrote_w or wrote_h:
            written.append(_record(node, slot["graph"], w if wrote_w else None, h if wrote_h else None, "linear"))
    return written


def _size_nodes_in(graph: dict) -> list[dict]:
    out = []
    for node in graph.get("nodes") or []:
        if not isinstance(node, dict) or not _active(node):
            continue
        if _is_size_node_type(_node_type(node)) and _has_size_widgets(node):
            out.append(node)
    return out


def _subgraphs_by_id(root: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    defs = root.get("definitions")
    if not isinstance(defs, dict):
        return out
    for sg in defs.get("subgraphs") or []:
        if isinstance(sg, dict) and sg.get("id") and isinstance(sg.get("nodes"), list):
            out[str(sg["id"])] = sg
    return out


def _nodes_feeding_output(sg: dict) -> list[dict]:
    output = sg.get("outputNode") if isinstance(sg.get("outputNode"), dict) else {}
    out_id = str(output.get("id", "-20"))
    ancestors = _ancestors([out_id], _incoming(sg))
    return [n for n in _size_nodes_in(sg) if str(n.get("id")) in ancestors]


def _size_nodes_feeding_samplers(root: dict) -> tuple[list[tuple[str, dict]], bool]:
    """(size nodes that reach a sampler, whether any sampler was found).

    A subgraph instance whose output reaches a sampler also contributes size nodes
    inside that subgraph that reach the subgraph output.
    """
    graphs = _ui_graphs(root)
    subs = _subgraphs_by_id(root)
    found_sampler = False
    chosen: list[tuple[str, dict]] = []
    seen: set[tuple[str, str]] = set()

    def add(graph_id: str, node: dict) -> None:
        key = (graph_id, str(node.get("id")))
        if key in seen:
            return
        seen.add(key)
        chosen.append((graph_id, node))

    for gid, graph in graphs:
        nodes = [n for n in graph.get("nodes") or [] if isinstance(n, dict) and _active(n)]
        by_id = {str(n.get("id")): n for n in nodes}
        samplers = [nid for nid, n in by_id.items() if _is_sampler_type(_node_type(n))]
        if not samplers:
            continue
        found_sampler = True
        ancestors = _ancestors(samplers, _incoming(graph))
        for nid in ancestors:
            node = by_id.get(nid)
            if node and _is_size_node_type(_node_type(node)) and _has_size_widgets(node):
                add(gid, node)
            if node:
                inner = subs.get(_node_type(node))
                if inner:
                    for inner_node in _nodes_feeding_output(inner):
                        add(_node_type(node), inner_node)
    return chosen, found_sampler


def _apply_ui_size_nodes(graph: dict, width: int, height: int) -> list[dict[str, Any]]:
    chosen, found_sampler = _size_nodes_feeding_samplers(graph)
    targets = chosen
    if not found_sampler:
        targets = [(gid, node) for gid, g in _ui_graphs(graph) for node in _size_nodes_in(g)]
    written = []
    for gid, node in targets:
        dims = _set_node_size(node, width, height)
        if dims:
            written.append(_record(node, gid, dims[0], dims[1], "size"))
    return written


def _api_size_nodes_feeding_samplers(workflow: dict) -> tuple[list[tuple[str, dict]], bool]:
    nodes = [(str(nid), node) for nid, node in workflow.items() if isinstance(node, dict) and "class_type" in node]
    incoming: dict[str, list[str]] = {}
    for nid, node in nodes:
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for value in inputs.values():
            if isinstance(value, (list, tuple)) and value and isinstance(value[0], (str, int)):
                incoming.setdefault(nid, []).append(str(value[0]))
    samplers = [nid for nid, node in nodes if _is_sampler_type(str(node.get("class_type") or ""))]
    if not samplers:
        return [], False
    ancestors = _ancestors(samplers, incoming)
    chosen = []
    for nid, node in nodes:
        ct = str(node.get("class_type") or "")
        if nid in ancestors and _is_size_node_type(ct):
            inputs = node.get("inputs")
            if isinstance(inputs, dict) and ("width" in inputs or "height" in inputs):
                chosen.append((nid, node))
    return chosen, True


def _apply_api_size_nodes(workflow: dict, width: int, height: int) -> list[dict[str, Any]]:
    chosen, found_sampler = _api_size_nodes_feeding_samplers(workflow)
    if not found_sampler:
        chosen = []
        for nid, node in workflow.items():
            if not isinstance(node, dict):
                continue
            ct = str(node.get("class_type") or "")
            inputs = node.get("inputs")
            if _is_size_node_type(ct) and isinstance(inputs, dict) and ("width" in inputs or "height" in inputs):
                chosen.append((str(nid), node))
    written = []
    for nid, node in chosen:
        ct = str(node.get("class_type") or "")
        w, h = _dims_for_type(ct, width, height)
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if isinstance(inputs.get("width"), (list, tuple)) or isinstance(inputs.get("height"), (list, tuple)):
            continue
        if "width" not in inputs and "height" not in inputs:
            continue
        if "width" in inputs:
            inputs["width"] = w
        if "height" in inputs:
            inputs["height"] = h
        written.append({
            "id": nid,
            "type": ct,
            "graph": "",
            "width": w,
            "height": h,
            "via": "size",
        })
    return written


def template_is_app(ref: str | None, graph: dict) -> bool:
    """.app.json, or a graph saved with App mode on (linearMode true)."""
    if isinstance(ref, str) and ref.replace("\\", "/").lower().endswith(".app.json"):
        return True
    extra = graph.get("extra") if isinstance(graph, dict) else None
    return isinstance(extra, dict) and extra.get("linearMode") is True


def apply_new_cut_generation_size(
    graph: dict,
    width: int,
    height: int,
    *,
    app: bool = False,
) -> list[dict[str, Any]]:
    """Write generation width/height into a copied template. Mutates `graph`.

    App templates (`.app.json` / linearMode) use linearData inputs named width and height.
    Other templates set width and height on latent / video size nodes that feed a sampler.
    When an app template has no such inputs, the size-node path is used.
    When no sampler can be seen, every size node is set.
    """
    if not isinstance(graph, dict):
        return []
    if app:
        written = _apply_linear_size(graph, width, height)
        if written:
            return written
    if isinstance(graph.get("nodes"), list):
        return _apply_ui_size_nodes(graph, width, height)
    if graph and "nodes" not in graph:
        return _apply_api_size_nodes(graph, width, height)
    return []
