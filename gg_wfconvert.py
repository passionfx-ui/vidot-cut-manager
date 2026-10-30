"""UI (graph) workflow -> API prompt, so a cut's saved workflow can run through the Comfy SDK without its tab.

Plain graphs only: no subgraphs, and no muted/bypassed node feeding an active one. Widget values are matched to
input names in each node's INPUT_TYPES order (ComfyUI's NODE_CLASS_MAPPINGS when running inside ComfyUI, else the
small table below that covers the bundled LTX examples)."""
from __future__ import annotations

from typing import Any

WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"}
VIRTUAL_TYPES = {"Note", "MarkdownNote", "PrimitiveNode", "Reroute"}
SEED_NAMES = ("seed", "noise_seed")
ACTIVE_MODES = (0, None)

# (input name, default, extra UI-only values after it: control_after_generate / upload button)
_KNOWN: dict[str, list[tuple[str, Any, int]]] = {
    "CheckpointLoaderSimple": [("ckpt_name", None, 0)],
    "CLIPLoader": [("clip_name", None, 0), ("type", "stable_diffusion", 0), ("device", "default", 0)],
    "CLIPTextEncode": [("text", None, 0)],
    "VAEDecode": [],
    "KSamplerSelect": [("sampler_name", None, 0)],
    "SamplerCustom": [("add_noise", True, 0), ("noise_seed", 0, 1), ("cfg", 8.0, 0)],
    "LTXVConditioning": [("frame_rate", 25.0, 0)],
    "LTXVScheduler": [("steps", 20, 0), ("max_shift", 2.05, 0), ("base_shift", 0.95, 0), ("stretch", True, 0),
                      ("terminal", 0.1, 0)],
    "EmptyLTXVLatentVideo": [("width", 768, 0), ("height", 512, 0), ("length", 97, 0), ("batch_size", 1, 0)],
    "LTXVImgToVideo": [("width", 768, 0), ("height", 512, 0), ("length", 97, 0), ("batch_size", 1, 0),
                       ("strength", 1.0, 0)],
    "LTXVPreprocess": [("img_compression", 35, 0)],
    "LoadImage": [("image", None, 1)],
    "SaveImage": [("filename_prefix", "ComfyUI", 0)],
    "SaveAnimatedWEBP": [("filename_prefix", "ComfyUI", 0), ("fps", 6.0, 0), ("lossless", True, 0),
                         ("quality", 80, 0), ("method", "default", 0)],
    "SaveWEBM": [("filename_prefix", "ComfyUI", 0), ("codec", "vp9", 0), ("fps", 24.0, 0), ("crf", 32.0, 0)],
}


def _class_mappings() -> dict:
    try:
        import nodes  # ComfyUI's module; absent in unit tests
        return getattr(nodes, "NODE_CLASS_MAPPINGS", None) or {}
    except Exception:  # noqa: BLE001
        return {}


def widget_spec_from_input_types(input_types: dict) -> list[tuple[str, Any, int]]:
    """[(name, default, extra values)] of the widget inputs in INPUT_TYPES order (required, then optional)."""
    out = []
    for section in ("required", "optional"):
        for name, spec in ((input_types or {}).get(section) or {}).items():
            spec = spec if isinstance(spec, (list, tuple)) else (spec,)
            kind = spec[0] if spec else None
            opts = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
            if not (isinstance(kind, list) or kind in WIDGET_TYPES) or opts.get("forceInput"):
                continue
            extra = 1 if opts.get("control_after_generate") or (kind == "INT" and name in SEED_NAMES) else 0
            extra += sum(1 for k, v in opts.items() if k.endswith("_upload") and v)
            default = opts.get("default")
            if default is None:
                options = kind if isinstance(kind, list) else opts.get("options")
                default = options[0] if isinstance(options, list) and options else None
            out.append((name, default, extra))
    return out


def _spec_for(node_type: str, mappings: dict) -> list[tuple[str, Any, int]] | None:
    cls = mappings.get(node_type)
    if cls is not None:
        try:
            return widget_spec_from_input_types(cls.INPUT_TYPES())
        except Exception:  # noqa: BLE001
            pass
    return _KNOWN.get(node_type)


def _links(graph: dict) -> dict:
    out = {}
    for link in graph.get("links") or []:
        if isinstance(link, list) and len(link) >= 5:
            out[link[0]] = (link[1], link[2])
        elif isinstance(link, dict) and "id" in link:
            out[link["id"]] = (link.get("origin_id"), link.get("origin_slot"))
    return out


def ui_to_api(graph: dict, mappings: dict | None = None) -> dict:
    """API prompt {"<id>": {"class_type", "inputs", "_meta"}} of a UI graph. Raises ValueError when a node cannot be
    converted outside the canvas (unknown type, subgraph, bypassed node in the middle)."""
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list):
        raise ValueError("not a UI workflow")
    mappings = _class_mappings() if mappings is None else mappings
    nodes = {n.get("id"): n for n in graph["nodes"] if isinstance(n, dict)}
    links = _links(graph)

    def source(link_id):
        seen = set()
        while link_id in links and link_id not in seen:
            seen.add(link_id)
            src_id, slot = links[link_id]
            src = nodes.get(src_id)
            if src is None:
                return None
            if src.get("type") != "Reroute":
                return src, slot
            ins = src.get("inputs") or []
            link_id = ins[0].get("link") if ins and isinstance(ins[0], dict) else None
        return None

    out: dict[str, dict] = {}
    for nid, n in nodes.items():
        ntype = str(n.get("type") or "")
        if n.get("mode") not in ACTIVE_MODES or ntype in VIRTUAL_TYPES:
            continue
        spec = _spec_for(ntype, mappings)
        if spec is None:
            raise ValueError(f'node {nid} "{ntype}" is not a known node type')
        inputs: dict[str, Any] = {}
        vals = n.get("widgets_values")
        if isinstance(vals, dict):
            inputs.update({name: vals[name] for name, _d, _x in spec if name in vals})
        else:
            vals = vals if isinstance(vals, list) else []
            pos = 0
            for name, default, extra in spec:
                if pos < len(vals):
                    inputs[name] = vals[pos]
                elif default is not None:
                    inputs[name] = default
                pos += 1 + extra
        for inp in n.get("inputs") or []:
            if not isinstance(inp, dict) or inp.get("link") is None:
                continue
            name = (inp.get("widget") or {}).get("name") or inp.get("name")
            src = source(inp["link"])
            if src is None:
                continue
            src_node, slot = src
            if src_node.get("type") == "PrimitiveNode":
                continue
            if src_node.get("mode") not in ACTIVE_MODES:
                raise ValueError(f'node {nid} "{ntype}" gets "{name}" from a muted or bypassed node')
            inputs[name] = [str(src_node.get("id")), slot]
        out[str(nid)] = {"class_type": ntype, "inputs": inputs, "_meta": {"title": n.get("title") or ntype}}
    if not out:
        raise ValueError("the workflow has no nodes to run")
    return out
