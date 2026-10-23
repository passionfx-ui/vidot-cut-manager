"""Per-project ComfyUI workflow templates (pack-local templates/<pid>.json)."""
from __future__ import annotations

import json
from pathlib import Path

try:
    from .gg_data import PACK_DIR, PID_RE
except ImportError:
    from gg_data import PACK_DIR, PID_RE  # unittest / plain script

TEMPLATES_DIR = PACK_DIR / "templates"


def _template_file(pid: str) -> Path:
    if not PID_RE.fullmatch(pid or ""):
        raise ValueError("invalid project id")
    return TEMPLATES_DIR / f"{pid}.json"


def _is_ui_workflow(wf: dict) -> bool:
    nodes = wf.get("nodes")
    return isinstance(nodes, list) and all(isinstance(n, dict) for n in nodes)


def _is_api_workflow(wf: dict) -> bool:
    if not wf or "nodes" in wf:
        return False
    for key, val in wf.items():
        if not isinstance(key, str) or not isinstance(val, dict):
            return False
        if "class_type" not in val:
            return False
    return True


def validate_workflow(wf) -> dict:
    """UI graph (serialize nodes list) or Comfy API-format node map."""
    if not isinstance(wf, dict):
        raise ValueError("workflow must be a JSON object")
    if _is_ui_workflow(wf):
        return wf
    if _is_api_workflow(wf):
        return wf
    raise ValueError("workflow must be a UI graph (nodes[]) or API-format node map")


def get_template(pid: str) -> dict | None:
    f = _template_file(pid)
    if not f.is_file():
        return None
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError) as ex:
        raise ValueError(f"invalid template file: {ex}") from ex
    return validate_workflow(data)


def save_template(pid: str, workflow_dict: dict) -> Path:
    wf = validate_workflow(workflow_dict)
    f = _template_file(pid)
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(wf, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)
    return f
