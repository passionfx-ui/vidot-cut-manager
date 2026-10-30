"""Comfy SDK path: ComfyUI process <-> isolated venv (sdk_runner.py) <-> comfy-api-proxy :8189 <-> ComfyUI :8188.

ComfyUI's own python never imports comfy_sdk. Generation only happens through regen(..., confirm=True).
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import os
import random
import secrets
import subprocess
import threading
import time
from pathlib import Path

try:
    from . import gg_data
except ImportError:  # unit tests import this module directly
    import gg_data  # type: ignore

RUNNER = gg_data.PACK_DIR / "sdk_runner.py"
REGEN_DIR = gg_data.CACHE_DIR / "regen"
DRAFT = {"model": "Qwen-Image 2.1 + turbo LoRA (draft)", "steps": 4, "megapixels": 0.25, "cfg": 1.0,
         "sampler": "euler", "scheduler": "simple"}
UNET = "qwen_image_2.1_int8_convrot.safetensors"
CLIP = "qwen3vl_8b_int8_convrot.safetensors"
VAE = "qwen_image_2.1_vae_bf16.safetensors"
LORA = "qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors"
ASPECTS = {"1:1": "1:1 (Square)", "2:3": "2:3 (Portrait Photo)", "3:2": "3:2 (Photo)",
           "3:4": "3:4 (Portrait Standard)", "4:3": "4:3 (Standard)", "9:16": "9:16 (Portrait Widescreen)",
           "16:9": "16:9 (Widescreen)", "21:9": "21:9 (Ultrawide)"}

_lock = threading.Lock()
_status_cache: dict = {}
_job: dict = {"status": "idle"}
_notify = None


def settings() -> dict:
    s = gg_data.load_settings()
    py = s.get("sdk_python") or str(gg_data.PACK_DIR / ".venv-sdk" / "Scripts" / "python.exe")
    return {"python": py, "proxy_url": (s.get("proxy_url") or "http://127.0.0.1:8189").rstrip("/"),
            "comfyui_url": (s.get("comfyui_url") or "http://127.0.0.1:8188").rstrip("/")}


def _runner(args: list[str], timeout: float) -> dict:
    cfg = settings()
    if not Path(cfg["python"]).is_file():
        return {"ok": False, "error": f"SDK venv python not found: {cfg['python']}"}
    env = {**os.environ, "COMFY_BASE_URL": cfg["proxy_url"], "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    try:
        p = subprocess.run([cfg["python"], "-s", str(RUNNER), *args], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout, env=env,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"sdk_runner timed out after {timeout}s"}
    try:
        return json.loads(p.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {"ok": False, "error": (p.stderr or p.stdout or "no output").strip()[-600:]}


def status(force: bool = False) -> dict:
    with _lock:
        if not force and _status_cache.get("t", 0) > time.time() - 10:
            return _status_cache["v"]
    v = _runner(["status"], timeout=30)
    v["proxy_url"] = settings()["proxy_url"]
    with _lock:
        _status_cache.update(t=time.time(), v=v)
    return v


_NULL = r"(?:none|null|undefined|nan|n/a)"
_NULL_FRAG = re.compile(r"\s*[;,]\s*" + _NULL + r"\s*(?=[.;,!?]|$)", re.I)       # "trousers; None."
_NULL_SENT = re.compile(r"(^|(?<=[.;!?]))\s*(?:[\w ]{1,30}:\s*)?" + _NULL + r"\s*[.;,]?(?=\s|$)", re.I)  # "None." / "Outfit: None."
_EMPTY_FRAG = re.compile(r"\s*([;,])\s*(?=[.;,!?])")                               # "a; ." / "a, ,"


def clean_prompt(text: str) -> str:
    """Drop None/null/empty fragments that legacy imported templates leave behind (e.g. 'trousers; None.')."""
    t = str(text or "")
    for _ in range(3):
        t2 = _NULL_FRAG.sub("", t)
        t2 = _NULL_SENT.sub(lambda m: m.group(1), t2)
        t2 = _EMPTY_FRAG.sub("", t2)
        t2 = re.sub(r"([.;,!?])(?:\s*[.;,])+", r"\1", t2)
        t2 = re.sub(r"[ \t]{2,}", " ", t2).strip(" ;,")
        if t2 == t:
            break
        t = t2
    return t.strip()


def build_draft_workflow(prompt: str, seed: int, aspect: str, prefix: str) -> dict:
    """Same graph as the legacy draft Qwen workflow (server.py:3226), with draft steps/size."""
    return {
        "13": {"class_type": "ResolutionSelector",
               "inputs": {"aspect_ratio": ASPECTS.get(aspect) or ASPECTS["16:9"],
                          "megapixels": DRAFT["megapixels"], "multiple": 8}},
        "451": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "453": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "default"}},
        "454": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "456": {"class_type": "EmptyLatentImage", "inputs": {"width": ["13", 0], "height": ["13", 1], "batch_size": 1}},
        "452": {"class_type": "TextEncodeQwenImage21",
                "inputs": {"clip": ["453", 0], "prompt": prompt, "negative_prompt": "", "resolution": 1024}},
        "481": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["451", 0], "lora_name": LORA, "strength_model": 1.0}},
        "480": {"class_type": "QwenImage21Cache", "inputs": {"model": ["481", 0], "device": "auto", "dtype": "default"}},
        "458": {"class_type": "KSampler",
                "inputs": {"model": ["480", 0], "positive": ["452", 0], "negative": ["452", 1],
                           "latent_image": ["456", 0], "seed": int(seed), "steps": DRAFT["steps"],
                           "cfg": DRAFT["cfg"], "sampler_name": DRAFT["sampler"], "scheduler": DRAFT["scheduler"],
                           "denoise": 1.0}},
        "457": {"class_type": "VAEDecode", "inputs": {"samples": ["458", 0], "vae": ["454", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["457", 0], "filename_prefix": prefix}},
    }


def _draft_size(aspect: str) -> tuple[int, int]:
    """Approximate ResolutionSelector output for display (the node computes the real size)."""
    a, b = (int(x) for x in (aspect if aspect in ASPECTS else "16:9").split(":"))
    px = DRAFT["megapixels"] * 1_000_000
    h = (px * b / a) ** 0.5
    w = h * a / b
    return int(round(w / 8) * 8), int(round(h / 8) * 8)


def _default_seed(pid: str, cut: dict) -> int:
    pick = cut.get("pick")
    if isinstance(pick, str) and gg_data.VER_ID_RE.fullmatch(pick):
        vf = gg_data.VERSIONS_DIR / pid / cut["id"] / f"{pick}.json"
        if vf.is_file():
            try:
                s = json.loads(vf.read_text(encoding="utf-8")).get("seed")
                if isinstance(s, int) and not isinstance(s, bool):
                    return s
                if s is not None:
                    return int(s)
            except (OSError, ValueError, TypeError):
                pass
    h = hashlib.sha256(f"{pid}:{cut['id']}".encode()).hexdigest()
    return int(h[:8], 16) % (2**31 - 1) or 1


def cut_workflow(pid: str, cut_id: str, seed: int | None = None, *, save_file: bool = False) -> dict:
    """Draft API-format workflow for a cut (canvas load / dry run). Never queues."""
    tl = gg_data.timeline(pid)
    if tl is None:
        raise ValueError("project not found")
    cut = next((c for c in tl["cuts"] if c["id"] == cut_id), None)
    if not cut:
        raise ValueError("cut not found")
    prompt = clean_prompt(cut.get("prompt") or "")
    if not prompt:
        raise ValueError("cut has no prompt in imported project data")
    aspect = cut.get("prompt_aspect") if cut.get("prompt_aspect") in ASPECTS else "16:9"
    if seed is None:
        seed = _default_seed(pid, cut)
    else:
        seed = int(seed)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    prefix = f"gonggan_regen/{cut_id}_{stamp}"
    wf = build_draft_workflow(prompt, seed, aspect, prefix)
    wf_file = ""
    if save_file:
        REGEN_DIR.mkdir(parents=True, exist_ok=True)
        wf_file = str(REGEN_DIR / f"{pid}_{cut_id}_{stamp}.json")
        Path(wf_file).write_text(json.dumps(wf, ensure_ascii=False, indent=1), encoding="utf-8")
    w, h = _draft_size(aspect)
    return {"pid": pid, "project": tl["project"]["name"], "cut_id": cut_id, "cut_no": cut["pos"] + 1,
            "cut_name": cut["name"], "model": DRAFT["model"], "unet": UNET, "lora": LORA,
            "steps": DRAFT["steps"], "cfg": DRAFT["cfg"], "sampler": DRAFT["sampler"],
            "megapixels": DRAFT["megapixels"], "aspect": aspect, "approx_size": f"{w}x{h}",
            "seed": seed, "prompt": prompt, "workflow_file": wf_file, "output_node": "9", "workflow": wf}


def plan(pid: str, cut_id: str, seed: int | None = None) -> dict:
    if seed is None:
        seed = random.randint(1, 2**31 - 1)
    return cut_workflow(pid, cut_id, seed, save_file=True)


def dry_run(pid: str, cut_id: str, seed: int | None = None) -> dict:
    p = plan(pid, cut_id, seed)
    val = _runner(["validate", "--workflow", p["workflow_file"], "--comfyui", settings()["comfyui_url"]], timeout=60)
    return {"ok": bool(val.get("ok")), "dry_run": True, "queued": False, "plan": p, "validation": val}


# ---- confirmed run (generation). Only reached with confirm=True from the UI's confirm dialog. ----
def job_status() -> dict:
    with _lock:
        return dict(_job)


def _set(**kw):
    with _lock:
        _job.update(kw)
        snap = dict(_job)
    if _notify:
        try:
            _notify(snap)
        except Exception:  # noqa: BLE001
            pass


def _run_worker(p: dict) -> None:
    out_dir = REGEN_DIR / ("out_" + Path(p["workflow_file"]).stem)
    res = _runner(["run", "--workflow", p["workflow_file"], "--node", p["output_node"],
                   "--out-dir", str(out_dir), "--confirm"], timeout=1800)
    if not res.get("ok"):
        _set(status="error", error=res.get("error") or res.get("message"), finished_at=time.time())
        return
    added = []
    for f in res.get("files") or []:
        info = gg_data.add_version(p["pid"], p["cut_id"], Path(f), {
            "source": "local-sdk", "model": p["model"], "seed": p["seed"], "steps": p["steps"],
            "prompt": p["prompt"], "aspect": p["aspect"], "sdk_job_id": res.get("job_id"),
            "base_url": settings()["proxy_url"], "render_seconds": res.get("seconds"),
            "api_prompt": p["workflow"]})
        added.append(info["id"])
    _set(status="done", versions=added, sdk_job_id=res.get("job_id"), render_seconds=res.get("seconds"),
         finished_at=time.time())


def run_confirmed(pid: str, cut_id: str, seed: int) -> dict:
    with _lock:
        if _job.get("status") == "running":
            return {"ok": False, "message": "a regen job is already running"}
    p = plan(pid, cut_id, seed)
    _set(status="running", native=False, pid=pid, cut_id=cut_id, seed=p["seed"], started_at=time.time(), error=None,
         versions=[])
    threading.Thread(target=_run_worker, args=(p,), name="gonggan-regen", daemon=True).start()
    return {"ok": True, "queued": True, "plan": {k: v for k, v in p.items() if k != "workflow"}}


# ---- native cuts: the cut's own saved workflow (API format) through the SDK, output -> new version ----
SEED_KEYS = ("seed", "noise_seed")
_NATIVE_PLAN_RE = re.compile(r"native_[0-9a-f-]{36}_[0-9a-f-]{36}_\d{8}-\d{6}_[0-9a-f]{6}", re.I)


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _seed_slots(wf: dict):
    """(node id, inputs, key) of each sampler/noise node's seed widget. A seed fed by a link points at the
    source node's int widget (e.g. a primitive seed node). Each widget once."""
    seen = set()
    for nid, node in wf.items():
        if not isinstance(node, dict) or not isinstance(node.get("inputs"), dict):
            continue
        ct = str(node.get("class_type") or "").lower()
        if "sampler" not in ct and "noise" not in ct:
            continue
        for key in SEED_KEYS:
            val = node["inputs"].get(key)
            slot = None
            if _is_int(val):
                slot = (str(nid), node["inputs"], key)
            elif isinstance(val, list) and val:
                src = wf.get(str(val[0]))
                src_in = src.get("inputs") if isinstance(src, dict) else None
                if isinstance(src_in, dict):
                    k = next((k for k in (*SEED_KEYS, "value") if _is_int(src_in.get(k))), None)
                    if k:
                        slot = (str(val[0]), src_in, k)
            if slot and (slot[0], slot[2]) not in seen:
                seen.add((slot[0], slot[2]))
                yield slot


def workflow_seeds(wf: dict) -> dict:
    """{"<node id>.<input>": seed} of an API workflow's sampler seeds."""
    return {f"{nid}.{key}": inputs[key] for nid, inputs, key in _seed_slots(wf)}


def randomize_seeds(wf: dict, rng=None) -> tuple[dict, dict]:
    """Copy of an API workflow with every sampler seed / noise_seed set to a new random value."""
    rng = rng or random
    out = copy.deepcopy(wf)
    seeds = {}
    for nid, inputs, key in list(_seed_slots(out)):
        inputs[key] = rng.randint(1, 2**31 - 1)
        seeds[f"{nid}.{key}"] = inputs[key]
    return out, seeds


def history_prompt(prompt_id: str) -> dict | None:
    """API prompt of one run still in ComfyUI's /history (None after a restart or when unknown)."""
    try:
        from server import PromptServer
        h = PromptServer.instance.prompt_queue.get_history(prompt_id=prompt_id) or {}
    except Exception:  # noqa: BLE001
        return None
    p = (h.get(prompt_id) or {}).get("prompt")
    api = p[2] if isinstance(p, (list, tuple)) and len(p) > 2 else None
    return api if isinstance(api, dict) else None


def _native_api():
    try:
        from . import gg_native_api
    except ImportError:
        import gg_native_api  # type: ignore
    return gg_native_api


def native_plan(pid: str, cut_id: str, *, new_seed: bool, canvas: dict | None = None) -> dict:
    """Resolve the cut's current saved workflow, set its seeds (new random ones for Regen, the saved ones for
    Queue) and store it under cache/regen. Never queues; run_native_confirmed runs exactly this file."""
    src = _native_api().native_cut_api_workflow(pid, cut_id, canvas)
    if new_seed:
        wf, seeds = randomize_seeds(src["workflow"])
    else:
        wf, seeds = src["workflow"], workflow_seeds(src["workflow"])
    name = f"native_{pid}_{cut_id}_{time.strftime('%Y%m%d-%H%M%S')}_{secrets.token_hex(3)}"
    REGEN_DIR.mkdir(parents=True, exist_ok=True)
    (REGEN_DIR / f"{name}.json").write_text(json.dumps(wf, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"pid": pid, "cut_id": cut_id, "plan": name, "source": src["source"], "new_seed": bool(new_seed),
            "seeds": seeds, "seed": next(iter(seeds.values()), None), "nodes": len(wf)}


def _run_native_worker(wf_file: Path, pid: str, cut_id: str) -> None:
    res = _runner(["run", "--workflow", str(wf_file), "--confirm"], timeout=1800)
    if not res.get("ok"):
        _set(status="error", error=res.get("error") or res.get("message"), finished_at=time.time())
        return
    try:
        cap = _native_api().native_capture_prompt_output(pid, cut_id, str(res.get("job_id") or ""), wait_sec=15)
    except Exception as ex:  # noqa: BLE001
        cap = {"ok": False, "message": str(ex)}
    if not cap.get("ok"):
        _set(status="error", error=cap.get("message"), sdk_job_id=res.get("job_id"), finished_at=time.time())
        return
    _set(status="done", versions=[cap["version"]["id"]], sdk_job_id=res.get("job_id"),
         render_seconds=res.get("seconds"), finished_at=time.time())


def run_native_confirmed(pid: str, cut_id: str, plan_name) -> dict:
    if not isinstance(plan_name, str) or not _NATIVE_PLAN_RE.fullmatch(plan_name) \
            or not plan_name.startswith(f"native_{pid}_{cut_id}_"):
        raise ValueError("unknown plan; run Regen again")
    wf_file = REGEN_DIR / f"{plan_name}.json"
    if not wf_file.is_file():
        raise ValueError("plan not found; run Regen again")
    with _lock:
        if _job.get("status") == "running":
            return {"ok": False, "message": "a regen job is already running"}
        _job.clear()
        _job.update(status="running", native=True, pid=pid, cut_id=cut_id, started_at=time.time(), error=None,
                    versions=[])
    _set()
    threading.Thread(target=_run_native_worker, args=(wf_file, pid, cut_id), name="gonggan-regen-native",
                     daemon=True).start()
    return {"ok": True, "queued": True, "plan": plan_name}


# ---- send last ComfyUI output to a cut (no generation) ----
IMG_EXT = {".png", ".jpg", ".jpeg", ".webp"}
VID_EXT = {".mp4", ".webm"}


def _output_root() -> Path:
    import folder_paths
    return Path(folder_paths.get_output_directory()).resolve()


def pick_last_output(history: dict, root: Path, now: float | None = None) -> tuple[dict | None, str]:
    """Only the newest finished ComfyUI run counts (no fallback to older runs or to files in output/).

    Returns (output, "") or (None, reason) so the UI can say why nothing was attached.
    """
    items = list((history or {}).items())
    if not items:
        return None, "No finished ComfyUI run yet. Run the workflow first."
    prompt_id, h = items[-1]
    return _run_output(prompt_id, h, root, now)


def pick_prompt_output(history: dict, prompt_id: str, root: Path, now: float | None = None) -> tuple[dict | None, str]:
    """Output of one finished run (by prompt id); (None, reason) when it is not in history yet or has none."""
    h = (history or {}).get(prompt_id)
    if h is None:
        return None, "That ComfyUI run is not in the history yet."
    return _run_output(prompt_id, h, root, now)


def _run_output(prompt_id: str, h, root: Path, now: float | None) -> tuple[dict | None, str]:
    h = h if isinstance(h, dict) else {}
    st = h.get("status") if isinstance(h.get("status"), dict) else {}
    if st.get("status_str") == "error":
        return None, "The last ComfyUI run failed, so nothing was sent. Fix it and run again."
    root = Path(root).resolve()
    for node_id, out in (h.get("outputs") or {}).items():
        if not isinstance(out, dict):
            continue
        for key in ("images", "gifs", "videos", "video"):
            for it in reversed(out.get(key) or []):
                if not isinstance(it, dict) or it.get("type") != "output":
                    continue
                f = (root / (it.get("subfolder") or "") / it.get("filename", "")).resolve()
                if f.is_file() and f.suffix.lower() in IMG_EXT | VID_EXT and root in f.parents:
                    mtime = f.stat().st_mtime
                    age = max(0.0, (time.time() if now is None else now) - mtime)
                    return {"path": str(f), "from": "history", "prompt_id": prompt_id, "node": node_id,
                            "name": f.name, "subfolder": it.get("subfolder") or "", "mtime": mtime,
                            "age_sec": round(age, 1)}, ""
    return None, "The last ComfyUI run saved no image or video (add a Save Image / Save Video node)."


def last_output_info() -> dict:
    """{"output": dict|None, "reason": str} for the newest finished run in ComfyUI's /history."""
    try:
        from server import PromptServer
        hist = PromptServer.instance.prompt_queue.get_history(max_items=64) or {}
    except Exception as ex:  # noqa: BLE001
        return {"output": None, "reason": f"Could not read ComfyUI history: {ex}"}
    lo, reason = pick_last_output(hist, _output_root())
    return {"output": lo, "reason": reason}


def prompt_output_info(prompt_id: str) -> dict:
    """Like last_output_info, for one prompt id. `pending` = the run is not in /history yet."""
    try:
        from server import PromptServer
        hist = PromptServer.instance.prompt_queue.get_history(prompt_id=prompt_id) or {}
    except Exception as ex:  # noqa: BLE001
        return {"output": None, "reason": f"Could not read ComfyUI history: {ex}", "pending": False}
    lo, reason = pick_prompt_output(hist, prompt_id, _output_root())
    return {"output": lo, "reason": reason, "pending": prompt_id not in hist}


def last_output() -> dict | None:
    return last_output_info()["output"]

def send_last_output(pid: str, cut_id: str) -> dict:
    info = last_output_info()
    lo = info["output"]
    if not lo:
        return {"ok": False, "message": info["reason"]}
    info = gg_data.add_version(pid, cut_id, Path(lo["path"]),
                               {"source": "comfy-" + lo["from"], "from_file": lo["name"],
                                "prompt_id": lo.get("prompt_id")})
    return {"ok": True, "version": info, "output": lo}
