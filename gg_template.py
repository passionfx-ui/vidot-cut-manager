"""Per-project ComfyUI workflow templates (pack-local templates/<pid>.json)."""
from __future__ import annotations

import json
import time
from pathlib import Path

try:
    from .gg_data import PACK_DIR, PID_RE
except ImportError:
    from gg_data import PACK_DIR, PID_RE  # unittest / plain script

TEMPLATES_DIR = PACK_DIR / "templates"
_USER_WF_SUB = Path("default") / "workflows"


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


def user_workflows_dir() -> Path:
    """ComfyUI user/default/workflows (override in tests)."""
    try:
        import folder_paths

        return Path(folder_paths.get_user_directory()) / _USER_WF_SUB
    except ImportError:
        return Path()


def _normalize_ref(ref: str) -> str:
    ref = (ref or "").replace("\\", "/").strip().lstrip("/")
    if ref.startswith("workflows/"):
        ref = ref[len("workflows/") :]
    return ref


def safe_workflow_path(rel_ref: str) -> Path | None:
    """Resolve a workflows-relative path with no directory traversal."""
    ref = _normalize_ref(rel_ref)
    if not ref or ref.startswith("..") or "/.." in ref or ".." in ref.split("/"):
        return None
    if not ref.lower().endswith(".json"):
        return None
    base = user_workflows_dir()
    if not base:
        return None
    base = base.resolve()
    full = (base / ref).resolve()
    try:
        full.relative_to(base)
    except ValueError:
        return None
    return full if full.is_file() else None


def read_workflow_ref(rel_ref: str) -> dict:
    path = safe_workflow_path(rel_ref)
    if path is None:
        raise ValueError("workflow ref not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as ex:
        raise ValueError(f"invalid workflow file: {ex}") from ex
    return validate_workflow(data)


def _load_template_store(pid: str) -> dict | None:
    f = _template_file(pid)
    if not f.is_file():
        return None
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError) as ex:
        raise ValueError(f"invalid template file: {ex}") from ex
    if not isinstance(data, dict):
        raise ValueError("invalid template file")
    if isinstance(data.get("workflow_ref"), str):
        return {"ref": _normalize_ref(data["workflow_ref"]), "updated": data.get("updated")}
    if _is_ui_workflow(data) or _is_api_workflow(data):
        return {"legacy_graph": data}
    raise ValueError("template file must be workflow_ref or a workflow graph")


def get_template_ref(pid: str) -> str | None:
    store = _load_template_store(pid)
    if store is None:
        return None
    return store.get("ref")


def template_ref_exists(pid: str) -> bool:
    store = _load_template_store(pid)
    if store is None:
        return False
    if "legacy_graph" in store:
        return True
    ref = store.get("ref")
    if not ref:
        return False
    return safe_workflow_path(ref) is not None


def get_template(pid: str) -> dict | None:
    store = _load_template_store(pid)
    if store is None:
        return None
    if "legacy_graph" in store:
        return validate_workflow(store["legacy_graph"])
    ref = store.get("ref")
    if not ref:
        return None
    return read_workflow_ref(ref)


def get_template_info(pid: str) -> dict:
    """{ref, exists, workflow} for GET /gonggan/template."""
    store = _load_template_store(pid)
    if store is None:
        return {"ref": None, "exists": False, "workflow": None}
    if "legacy_graph" in store:
        wf = validate_workflow(store["legacy_graph"])
        return {"ref": None, "exists": True, "workflow": wf}
    ref = store.get("ref") or None
    if not ref:
        return {"ref": None, "exists": False, "workflow": None}
    path_ok = safe_workflow_path(ref) is not None
    wf = read_workflow_ref(ref) if path_ok else None
    return {"ref": ref, "exists": path_ok, "workflow": wf}


def save_template_ref(pid: str, ref: str) -> Path | None:
    """Set workflow_ref, or clear template when ref is empty."""
    if not PID_RE.fullmatch(pid or ""):
        raise ValueError("invalid project id")
    f = _template_file(pid)
    ref = _normalize_ref(ref) if ref else ""
    if not ref:
        if f.is_file():
            f.unlink()
        return None
    read_workflow_ref(ref)
    data = {"workflow_ref": ref, "updated": time.time()}
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)
    return f


def save_template(pid: str, workflow_dict: dict) -> Path:
    """Legacy: store a full workflow graph in templates/<pid>.json (still accepted on read)."""
    wf = validate_workflow(workflow_dict)
    f = _template_file(pid)
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(wf, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)
    return f
