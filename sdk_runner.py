"""Comfy SDK helper. Runs ONLY inside the pack's isolated venv (.venv-sdk), never in ComfyUI's python.

    python sdk_runner.py status
    python sdk_runner.py validate --workflow wf.json [--comfyui http://127.0.0.1:8188]
    python sdk_runner.py run --workflow wf.json --node 9 --out-dir DIR --confirm

COMFY_BASE_URL (default http://127.0.0.1:8189, the local comfy-api-proxy) selects the target.
`run` refuses to submit without --confirm. Every command prints one JSON object on stdout.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from importlib import metadata
from pathlib import Path

os.environ.setdefault("COMFY_BASE_URL", "http://127.0.0.1:8189")
BASE = os.environ["COMFY_BASE_URL"].rstrip("/")


def _ver(pkg: str) -> str | None:
    try:
        return metadata.version(pkg)
    except metadata.PackageNotFoundError:
        return None


def _get_json(url: str, timeout: float = 5.0):
    with urllib.request.urlopen(url, timeout=timeout) as r:  # noqa: S310 (local URLs only)
        return json.loads(r.read().decode("utf-8"))


def cmd_status(_a) -> dict:
    out = {"ok": False, "base_url": BASE, "python": sys.version.split()[0],
           "comfy_sdk": _ver("comfy-sdk"), "comfy_api_proxy": _ver("comfy-api-proxy")}
    try:
        h = _get_json(BASE + "/api/v2/health")
        out["proxy"] = h
    except Exception as ex:  # noqa: BLE001
        out["proxy"] = None
        out["error"] = f"proxy unreachable at {BASE}: {ex}"
        return out
    try:
        from comfy_sdk import Comfy
        t0 = time.time()
        with Comfy(timeout=10) as client:
            jobs = []
            for j in client.list_jobs(limit=5):
                jobs.append({"id": j.id, "status": getattr(j, "status", None)})
                if len(jobs) >= 5:
                    break
        out.update(ok=True, sdk_roundtrip_ms=int((time.time() - t0) * 1000), recent_jobs=jobs)
    except Exception as ex:  # noqa: BLE001
        out["error"] = f"SDK call through proxy failed: {type(ex).__name__}: {ex}"
    return out


def cmd_validate(a) -> dict:
    """SDK format check + node/model check against ComfyUI /object_info. Submits nothing."""
    from comfy_sdk import Comfy
    from comfy_sdk.client import _guard_ui_format  # same check submit() runs first
    wf_path = Path(a.workflow)
    graph = json.loads(wf_path.read_text(encoding="utf-8"))
    problems = []
    with Comfy(timeout=10) as client:
        wf = client.workflows.from_json(graph)
        try:
            _guard_ui_format(wf)
        except Exception as ex:  # noqa: BLE001
            problems.append(f"format: {ex}")
    info = _get_json(a.comfyui.rstrip("/") + "/object_info", timeout=30)
    for nid, node in graph.items():
        ct = node.get("class_type")
        spec = info.get(ct)
        if not spec:
            problems.append(f"node {nid}: class_type {ct!r} not installed")
            continue
        req = {**(spec.get("input", {}).get("required") or {}), **(spec.get("input", {}).get("optional") or {})}
        for field, val in (node.get("inputs") or {}).items():
            if isinstance(val, list):
                continue  # link
            opt = req.get(field)
            if not opt:
                continue
            choices = opt[0] if isinstance(opt, list) and opt and isinstance(opt[0], list) else None
            if choices is None and isinstance(opt, list) and len(opt) > 1 and isinstance(opt[1], dict):
                choices = opt[1].get("options") if opt[0] == "COMBO" else None
            if choices is not None and val not in choices:
                problems.append(f"node {nid} {ct}.{field}: {val!r} not available")
    return {"ok": not problems, "nodes": len(graph), "problems": problems,
            "classes": sorted({n.get("class_type") for n in graph.values()})}


def cmd_run(a) -> dict:
    if not a.confirm:
        return {"ok": False, "message": "refusing to submit without --confirm"}
    from comfy_sdk import Comfy
    graph = json.loads(Path(a.workflow).read_text(encoding="utf-8"))
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    with Comfy(timeout=60) as client:
        wf = client.workflows.from_json(graph)
        job = client.submit(wf)
        job_id = job.id
        job = job.result()
        files = []
        for o in job.get_outputs(a.node):
            dest = out_dir / o.name
            o.to_file(dest)
            files.append(str(dest))
    return {"ok": True, "job_id": job_id, "files": files, "seconds": round(time.time() - t0, 2)}


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    v = sub.add_parser("validate")
    v.add_argument("--workflow", required=True)
    v.add_argument("--comfyui", default="http://127.0.0.1:8188")
    r = sub.add_parser("run")
    r.add_argument("--workflow", required=True)
    r.add_argument("--node", default="9")
    r.add_argument("--out-dir", required=True)
    r.add_argument("--confirm", action="store_true")
    a = ap.parse_args()
    try:
        res = {"status": cmd_status, "validate": cmd_validate, "run": cmd_run}[a.cmd](a)
    except Exception as ex:  # noqa: BLE001
        res = {"ok": False, "error": f"{type(ex).__name__}: {ex}"}
    sys.stdout.write(json.dumps(res, ensure_ascii=False))
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
