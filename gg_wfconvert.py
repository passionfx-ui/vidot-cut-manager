"""UI (graph) workflow -> API prompt, so a cut's saved workflow can run through the Comfy SDK without its tab.

Subgraph instances (definitions.subgraphs) are flattened into ordinary nodes first: inner links stay,
boundary inputs become links or widget values from the instance, and boundary outputs feed the parent.
Muted/bypassed nodes that feed an active node are still refused. Widget values are matched to input names
in each node's INPUT_TYPES order (ComfyUI's NODE_CLASS_MAPPINGS when running inside ComfyUI, else the small
table below that covers the bundled templates in examples/workflows)."""
from __future__ import annotations

import copy
from typing import Any

WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"}
VIRTUAL_TYPES = {"Note", "MarkdownNote", "PrimitiveNode", "Reroute"}
SEED_NAMES = ("seed", "noise_seed")
ACTIVE_MODES = (0, None)

# (input name, default, extra UI-only values after it: control_after_generate / upload button)
_KNOWN: dict[str, list[tuple[str, Any, int]]] = {
    "CheckpointLoaderSimple": [("ckpt_name", None, 0)],
    "UNETLoader": [("unet_name", None, 0), ("weight_dtype", "default", 0)],
    "VAELoader": [("vae_name", None, 0)],
    "CLIPLoader": [("clip_name", None, 0), ("type", "stable_diffusion", 0), ("device", "default", 0)],
    "CLIPTextEncode": [("text", None, 0)],
    "ConditioningZeroOut": [],
    "ModelSamplingAuraFlow": [("shift", 1.73, 0)],
    "EmptySD3LatentImage": [("width", 1024, 0), ("height", 1024, 0), ("batch_size", 1, 0)],
    "EmptyFlux2LatentImage": [("width", 1024, 0), ("height", 1024, 0), ("batch_size", 1, 0)],
    "KSampler": [("seed", 0, 1), ("steps", 20, 0), ("cfg", 8.0, 0), ("sampler_name", None, 0), ("scheduler", None, 0),
                 ("denoise", 1.0, 0)],
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
    "CreateVideo": [("fps", 24.0, 0), ("bit_depth", "auto", 0), ("color_space", "sRGB", 0), ("codec", "none", 0)],
    "SaveVideo": [("filename_prefix", "video/ComfyUI", 0), ("format", "mp4", 0)],
    "TextEncodeQwenImageEditPlus": [("prompt", "", 0)],
    "FluxKontextImageScale": [],
    "FluxKontextMultiReferenceLatentMethod": [("reference_latents_method", "index_timestep_zero", 0)],
    "CFGNorm": [("strength", 1.0, 0)],
    "LoraLoaderModelOnly": [("lora_name", None, 0), ("strength_model", 1.0, 0)],
    "VAEEncode": [],
    "SaveImage": [("filename_prefix", "ComfyUI", 0)],
    "SaveAnimatedWEBP": [("filename_prefix", "ComfyUI", 0), ("fps", 6.0, 0), ("lossless", True, 0),
                         ("quality", 80, 0), ("method", "default", 0)],
    "SaveWEBM": [("filename_prefix", "ComfyUI", 0), ("codec", "vp9", 0), ("fps", 24.0, 0), ("crf", 32.0, 0)],
}


def _named_widget(value: Any) -> bool:
    """A saved widgets_values_named entry that should win over the positional array.

    An empty string does not win over a filled positional value, but it is still sent
    (see the widget loop). Dropping it makes ComfyUI reject required text inputs.
    """
    if isinstance(value, bool):
        return True
    if isinstance(value, str):
        return value != ""
    return isinstance(value, (int, float))


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


def _spec_from_saved_widgets(node: dict) -> list[tuple[str, Any, int]] | None:
    """Widget list for a type that is not registered. App graphs still store the values on the node.
    None when the node has nothing we can turn into inputs (unknown and empty)."""
    if not isinstance(node, dict):
        return None
    names: list[str] = []
    inputs = [i for i in (node.get("inputs") or []) if isinstance(i, dict)]
    for inp in inputs:
        widget = (inp.get("widget") or {}).get("name")
        if isinstance(widget, str) and widget not in names:
            names.append(widget)
    named = node.get("widgets_values_named") if isinstance(node.get("widgets_values_named"), dict) else {}
    if not names:
        for key in named:
            if (isinstance(key, str) and key not in ("upload", "control_after_generate", "fixed")
                    and not key.endswith("_upload")):
                names.append(key)
    has_link = any(inp.get("link") is not None for inp in inputs)
    if not names and not has_link and not node.get("outputs"):
        return None
    return [(name, None, 0) for name in names]


def _subgraph_defs(graph: dict) -> dict[str, dict]:
    raw = graph.get("definitions") if isinstance(graph, dict) else None
    defs: dict[str, dict] = {}
    if not isinstance(raw, dict):
        return defs
    for sg in raw.get("subgraphs") or []:
        if isinstance(sg, dict) and sg.get("id") is not None:
            defs[str(sg["id"])] = sg
    return defs


def _parse_link(link: Any):
    if isinstance(link, (list, tuple)) and len(link) >= 5:
        return link[1], link[2], link[3], link[4], link[5] if len(link) > 5 else None
    if isinstance(link, dict) and "origin_id" in link and "target_id" in link:
        return link.get("origin_id"), link.get("origin_slot"), link.get("target_id"), link.get("target_slot"), link.get("type")
    return None


def _join_id(prefix: str, nid: Any) -> Any:
    if not prefix:
        return nid
    return f"{prefix}:{nid}"


class _Linker:
    def __init__(self):
        self.links: list = []
        self._n = 1

    def add(self, origin_id, origin_slot, target: dict, target_slot, typ=None):
        lid = self._n
        self._n += 1
        slot = int(target_slot)
        row = [lid, origin_id, int(origin_slot), target.get("id"), slot]
        if typ:
            row.append(typ)
        self.links.append(row)
        inputs = target.get("inputs") or []
        if 0 <= slot < len(inputs) and isinstance(inputs[slot], dict):
            inputs[slot]["link"] = lid
        return lid


def _socket_by_name(node: dict, name: str) -> dict | None:
    for inp in node.get("inputs") or []:
        if isinstance(inp, dict) and inp.get("name") == name:
            return inp
    return None


def _instance_widget(instance: dict, name: str):
    """(found, value) from the subgraph instance. Named values win, including '' and 0."""
    named = instance.get("widgets_values_named")
    if isinstance(named, dict) and name in named:
        return True, named[name]
    return False, None


def _input_widget_name(node: dict, slot: int) -> str:
    inputs = node.get("inputs") or []
    if not (0 <= int(slot) < len(inputs)) or not isinstance(inputs[int(slot)], dict):
        return ""
    inp = inputs[int(slot)]
    return str((inp.get("widget") or {}).get("name") or inp.get("name") or "")


def _write_widget(node: dict, widget_name: str, value: Any) -> None:
    if not widget_name:
        return
    named = node.get("widgets_values_named")
    if not isinstance(named, dict):
        named = {}
        node["widgets_values_named"] = named
    vals = node.get("widgets_values")
    if widget_name in named and isinstance(vals, list):
        idx = list(named).index(widget_name)
        if idx < len(vals):
            vals[idx] = value
    elif isinstance(vals, list):
        wnames = []
        for inp in node.get("inputs") or []:
            if isinstance(inp, dict):
                w = (inp.get("widget") or {}).get("name")
                if w:
                    wnames.append(w)
        if widget_name in wnames and len(vals) == len(wnames):
            vals[wnames.index(widget_name)] = value
    elif isinstance(vals, dict):
        vals[widget_name] = value
    named[widget_name] = value


def _copy_node(node: dict, new_id: Any) -> dict:
    copied = copy.deepcopy(node)
    copied["id"] = new_id
    for inp in copied.get("inputs") or []:
        if isinstance(inp, dict):
            inp["link"] = None
    return copied


def _flatten_level(graph: dict, defs: dict[str, dict], prefix: str, linker: _Linker, stack: tuple[str, ...]) -> list:
    out_nodes: list = []
    nodes_by_old: dict[str, dict | None] = {}
    output_map: dict[tuple[str, int], tuple] = {}
    input_targets: dict[tuple[str, int], list] = {}
    for node in graph.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        ntype = str(node.get("type") or "")
        old = str(node.get("id"))
        if ntype in defs:
            if ntype in stack:
                raise ValueError(f'subgraph "{ntype}" contains itself')
            inst_prefix = str(_join_id(prefix, node.get("id")))
            inner_nodes, in_by_name, out_by_slot = _expand_instance(node, defs[ntype], defs, inst_prefix, linker, stack + (ntype,))
            out_nodes.extend(inner_nodes)
            nodes_by_old[old] = None
            for index, sock in enumerate(node.get("inputs") or []):
                if isinstance(sock, dict):
                    input_targets[(old, index)] = in_by_name.get(sock.get("name"), [])
            for slot, origin in out_by_slot.items():
                output_map[(old, slot)] = origin
            continue
        copied = _copy_node(node, _join_id(prefix, node.get("id")))
        out_nodes.append(copied)
        nodes_by_old[old] = copied
    for link in graph.get("links") or []:
        parsed = _parse_link(link)
        if not parsed:
            continue
        origin_id, origin_slot, target_id, target_slot, typ = parsed
        origin_key, target_key = str(origin_id), str(target_id)
        origin_slot, target_slot = int(origin_slot), int(target_slot)
        if (origin_key, origin_slot) in output_map:
            origin_id, origin_slot = output_map[(origin_key, origin_slot)]
        elif nodes_by_old.get(origin_key) is not None:
            origin_id = nodes_by_old[origin_key]["id"]
        else:
            continue
        if (target_key, target_slot) in input_targets:
            for target_node, inner_slot in input_targets[(target_key, target_slot)]:
                linker.add(origin_id, origin_slot, target_node, inner_slot, typ)
            continue
        target = nodes_by_old.get(target_key)
        if target is None:
            continue
        linker.add(origin_id, origin_slot, target, target_slot, typ)
    return out_nodes


def _expand_instance(instance: dict, sg: dict, defs: dict[str, dict], inst_prefix: str, linker: _Linker,
                     stack: tuple[str, ...]):
    input_id = (sg.get("inputNode") or {}).get("id", -10)
    output_id = (sg.get("outputNode") or {}).get("id", -20)
    sg_inputs = [inp for inp in (sg.get("inputs") or []) if isinstance(inp, dict)]
    inner_links = []
    boundary_in = []
    boundary_out: dict[int, tuple] = {}
    for link in sg.get("links") or []:
        parsed = _parse_link(link)
        if not parsed:
            continue
        origin_id, origin_slot, target_id, target_slot, typ = parsed
        if origin_id == input_id:
            boundary_in.append((int(origin_slot), target_id, int(target_slot), typ))
            continue
        if target_id == output_id:
            boundary_out[int(target_slot)] = (origin_id, int(origin_slot))
            continue
        inner_links.append(link)
    inner_nodes = _flatten_level(
        {"nodes": sg.get("nodes") or [], "links": inner_links, "definitions": {"subgraphs": list(defs.values())}},
        defs, inst_prefix, linker, stack)
    if instance.get("mode") not in ACTIVE_MODES:
        for node in inner_nodes:
            node["mode"] = instance.get("mode")
    direct = {}
    head = f"{inst_prefix}:"
    for node in inner_nodes:
        sid = str(node.get("id"))
        if sid.startswith(head) and ":" not in sid[len(head):]:
            direct[sid[len(head):]] = node
    in_by_name: dict[str, list] = {}
    for sg_slot, target_id, target_slot, _typ in boundary_in:
        name = sg_inputs[sg_slot].get("name") if 0 <= sg_slot < len(sg_inputs) else ""
        node = direct.get(str(target_id))
        if node is None:
            raise ValueError(f'subgraph "{sg.get("name") or sg.get("id")}" input "{name}" connects to missing node {target_id}')
        in_by_name.setdefault(name, []).append((node, target_slot))
        sock = _socket_by_name(instance, name)
        if isinstance(sock, dict) and sock.get("link") is not None:
            continue
        found, value = _instance_widget(instance, name)
        if not found:
            continue
        _write_widget(node, _input_widget_name(node, target_slot) or str(name or ""), value)
    out_by_slot = {}
    for slot, (origin_id, origin_slot) in boundary_out.items():
        node = direct.get(str(origin_id))
        if node is None:
            raise ValueError(f'subgraph "{sg.get("name") or sg.get("id")}" output {slot} connects to missing node {origin_id}')
        out_by_slot[slot] = (node.get("id"), origin_slot)
    return inner_nodes, in_by_name, out_by_slot


def flatten_subgraphs(graph: dict) -> dict:
    """Copy of a UI graph with subgraph instances replaced by their inner nodes.

    Node ids inside an instance are ``<instance id>:<inner id>`` so they do not collide with the
    parent graph. A linked instance input is wired to the inner socket. An unlinked one writes the
    instance widget value (including an empty string) onto that inner widget.
    """
    if not isinstance(graph, dict):
        return graph
    defs = _subgraph_defs(graph)
    if not defs:
        return graph
    used = any(isinstance(n, dict) and str(n.get("type") or "") in defs for n in (graph.get("nodes") or []))
    if not used:
        return graph
    linker = _Linker()
    nodes = _flatten_level(graph, defs, "", linker, ())
    out = {k: v for k, v in graph.items() if k not in ("nodes", "links", "definitions")}
    out["nodes"] = nodes
    out["links"] = linker.links
    return out


def _links(graph: dict) -> dict:
    out = {}
    for link in graph.get("links") or []:
        if isinstance(link, list) and len(link) >= 5:
            out[link[0]] = (link[1], link[2])
        elif isinstance(link, dict) and "id" in link:
            out[link["id"]] = (link.get("origin_id"), link.get("origin_slot"))
    return out


def ui_to_api(graph: dict, mappings: dict | None = None) -> dict:
    """API prompt {"<id>": {"class_type", "inputs", "_meta"}} of a UI graph. Subgraph instances are flattened first.
    Raises ValueError when a node cannot be converted outside the canvas (unknown type with no saved widgets,
    or a muted/bypassed node feeding an active one)."""
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list):
        raise ValueError("not a UI workflow")
    graph = flatten_subgraphs(graph)
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
            spec = _spec_from_saved_widgets(n)
        if spec is None:
            raise ValueError(f'node {nid} "{ntype}" is not a known node type')
        inputs: dict[str, Any] = {}
        vals = n.get("widgets_values")
        named = n.get("widgets_values_named") if isinstance(n.get("widgets_values_named"), dict) else {}
        if isinstance(vals, dict):
            inputs.update({name: vals[name] for name, _d, _x in spec if name in vals})
            for name, _d, _x in spec:
                if _named_widget(named.get(name)):
                    inputs[name] = named[name]
                elif inputs.get(name) in (None, "") and named.get(name) not in (None, ""):
                    inputs[name] = named[name]
                elif name not in inputs and name in named and named.get(name) == "":
                    inputs[name] = ""
        else:
            vals = vals if isinstance(vals, list) else []
            pos = 0
            for name, default, extra in spec:
                present = pos < len(vals)
                got = named[name] if _named_widget(named.get(name)) else (vals[pos] if present else None)
                if got in (None, "") and named.get(name) not in (None, ""):
                    got = named[name]
                elif got is None and name in named and named.get(name) == "":
                    got = ""
                # "" is a real input. Omitting required text/prompt fails prompt validation.
                if got is not None:
                    inputs[name] = got
                elif default is not None:
                    inputs[name] = default
                pos += 1 + extra
        # Dynamic widgets (SaveVideo format.codec, …) are stored by name and are not in the static widget list.
        for name, value in named.items():
            if not isinstance(name, str) or name in inputs:
                continue
            if name in ("upload", "control_after_generate") or name.endswith("_upload"):
                continue
            if _named_widget(value):
                inputs[name] = value
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
