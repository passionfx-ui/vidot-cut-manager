"""AI Cut Split through ComfyUI's own TextGenerate node, run on the Comfy SDK path
(gg_sdk -> .venv-sdk sdk_runner.py -> comfy-api-proxy :8189 -> ComfyUI :8188). Blocking; routes call it in a thread.

Graph: CLIPLoader (text model) -> TextGenerate (fixed cut split prompt + story, greedy) -> PreviewAny. The answer is
read from ComfyUI /history and checked with the same validator as the cut list route; an invalid answer is retried
with its problems listed. Afterwards ComfyUI is asked to unload models (/free) so LTX gets the VRAM.
A run needs Use AI on and the model file present; precheck() also reports no GPU / low VRAM for the UI to confirm."""
from __future__ import annotations

import importlib
import json
import logging
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from . import gg_data
    from . import gg_ltx
    from . import gg_script_presplit
    from . import gg_sdk
except ImportError:  # unit tests import this module directly
    import gg_data  # type: ignore
    import gg_ltx  # type: ignore
    import gg_script_presplit  # type: ignore
    import gg_sdk  # type: ignore

log = logging.getLogger("gonggan-cut")

DEFAULT_CLIP = "qwen3vl_4b_int8_convrot.safetensors"
DEFAULT_CLIP_TYPE = "stable_diffusion"
MAX_LENGTH = 1536
RETRIES = 1
RUN_TIMEOUT = 600.0
HTTP_TIMEOUT = 10.0
HISTORY_WAIT_SEC = 5.0
STORY_MAX_LEN = 20000
OUTPUT_NODE = "3"
WORK_DIR = gg_data.CACHE_DIR / "cut_split"

_run_lock = threading.Lock()


class CutSplitError(Exception):
    """`code`: "bad_request", "busy", "disabled" (Use AI is off), "missing_model", "sdk" (the run failed),
    "no_text" (no answer in /history), "invalid", "too_long" (the answer was cut off at MAX_LENGTH).
    `extra` is added to the route's JSON body."""

    def __init__(self, code: str, message: str, extra: dict | None = None):
        super().__init__(message)
        self.code = code
        self.extra = extra or {}


def model_settings() -> dict:
    """Text model for TextGenerate: gonggan_settings.json "cut_split_clip" / "cut_split_clip_type"."""
    s = gg_data.load_settings()
    return {"clip_name": str(s.get("cut_split_clip") or "").strip() or DEFAULT_CLIP,
            "type": str(s.get("cut_split_clip_type") or "").strip() or DEFAULT_CLIP_TYPE}


MODEL_FOLDERS = ("text_encoders", "clip")
MODEL_NAME_MAX_LEN = 260
MODEL_TARGET_FOLDER = "models/text_encoders"
DEFAULT_CLIP_URL = ("https://huggingface.co/Comfy-Org/Fibo-2.0/resolve/main/text_encoders/"
                    "qwen3vl_4b_int8_convrot.safetensors")
DEFAULT_CLIP_PAGE = ("https://huggingface.co/Comfy-Org/Fibo-2.0/blob/main/text_encoders/"
                     "qwen3vl_4b_int8_convrot.safetensors")
# Free VRAM below the model file size + this margin (activations, KV cache) is "clearly too little".
VRAM_MARGIN = 1024 ** 3
USE_AI_OFF_MESSAGE = "Turn on Use AI in Project Settings."
TOO_LONG_MESSAGE = "Story too long for one split, try a shorter part."


def use_ai_enabled(settings: dict | None = None) -> bool:
    """gonggan_settings.json "cut_split_enabled" (Project Settings › Use AI); on unless set to false."""
    v = (settings if settings is not None else gg_data.load_settings()).get("cut_split_enabled", True)
    if isinstance(v, str):
        return v.strip().lower() not in ("false", "0", "off", "no")
    return v is not False and v != 0


def _comfy(name: str):
    """A ComfyUI module (folder_paths, comfy.model_management), or None outside ComfyUI."""
    try:
        return importlib.import_module(name)
    except Exception:  # noqa: BLE001
        return None


def list_text_models(lister=None) -> list[str]:
    """Files ComfyUI lists for CLIPLoader: folder_paths text_encoders + clip (older ComfyUI), deduped and sorted.
    A folder name this ComfyUI does not know is skipped; outside ComfyUI (no folder_paths) the list is empty."""
    if lister is None:
        fp = _comfy("folder_paths")
        if fp is None:
            return []
        lister = fp.get_filename_list
    names: set[str] = set()
    for folder in MODEL_FOLDERS:
        try:
            found = lister(folder) or []
        except Exception:  # noqa: BLE001
            continue
        names.update(n for n in found if isinstance(n, str) and n.strip())
    return sorted(names, key=lambda n: (n.lower(), n))


def model_choices(lister=None) -> dict:
    """{"models", "current", "default", "use_ai"} for the Project Settings AI Cut Split fields."""
    return {"models": list_text_models(lister), "current": model_settings()["clip_name"], "default": DEFAULT_CLIP,
            "use_ai": use_ai_enabled()}


def _read_local_settings() -> dict:
    """gonggan_settings.json as a dict ({} when missing); a broken file is reported, never overwritten."""
    path = gg_data.SETTINGS_FILE
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "{}")
    except (OSError, ValueError) as ex:
        raise CutSplitError("bad_request", f"Could not read {path.name}: {ex}") from None
    if not isinstance(data, dict):
        raise CutSplitError("bad_request", f"{path.name} is not a JSON object.")
    return data


def _write_local_settings(data: dict) -> None:
    path = gg_data.SETTINGS_FILE
    tmp = path.with_name(f"{path.name}.{secrets.token_hex(3)}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def save_settings(clip_name=None, use_ai=None, lister=None) -> dict:
    """Write "cut_split_clip" and / or "cut_split_enabled" (Use AI) into gonggan_settings.json (other keys kept).
    The model name must be a listed file or the current setting; use_ai must be a bool."""
    if clip_name is None and use_ai is None:
        raise CutSplitError("bad_request", "Nothing to save.")
    clip = ""
    if clip_name is not None:
        clip = clip_name.strip() if isinstance(clip_name, str) else ""
        if not clip or len(clip) > MODEL_NAME_MAX_LEN or any(ch < " " for ch in clip):
            raise CutSplitError("bad_request", "Choose a text model file.")
    if use_ai is not None and not isinstance(use_ai, bool):
        raise CutSplitError("bad_request", "use_ai must be true or false.")
    data = _read_local_settings()
    if clip and clip != model_settings()["clip_name"] and clip not in list_text_models(lister):
        raise CutSplitError("bad_request", f"Text model {clip} is not in ComfyUI's text_encoders folder.")
    if clip:
        data["cut_split_clip"] = clip
    if use_ai is not None:
        data["cut_split_enabled"] = use_ai
    _write_local_settings(data)
    return model_choices(lister)


def save_model(name, lister=None) -> dict:
    """Write "cut_split_clip" into gonggan_settings.json (other keys kept). The name must be a listed file
    or the current setting."""
    if name is None:
        raise CutSplitError("bad_request", "Choose a text model file.")
    return save_settings(clip_name=name, lister=lister)


def missing_model_info(name: str) -> dict:
    """What the missing-model notice shows: file name, target folder, and for the default model its download links."""
    known = name == DEFAULT_CLIP
    return {"name": name, "folder": MODEL_TARGET_FOLDER, "url": DEFAULT_CLIP_URL if known else "",
            "page": DEFAULT_CLIP_PAGE if known else ""}


def model_file_size(name: str, resolver=None) -> int | None:
    """Bytes of the model file ComfyUI would load (text_encoders, then clip); None when it cannot be found."""
    if resolver is None:
        fp = _comfy("folder_paths")
        if fp is None:
            return None
        resolver = fp.get_full_path
    for folder in MODEL_FOLDERS:
        try:
            p = resolver(folder, name)
            if p and os.path.isfile(p):
                return os.path.getsize(p)
        except Exception:  # noqa: BLE001
            continue
    return None


def memory_info(mm=None) -> dict:
    """{"gpu": True / False / None (unknown), "device", "free": bytes or None} from comfy.model_management.
    "free" counts models ComfyUI keeps loaded, because it unloads them before loading the text model."""
    unknown = {"gpu": None, "device": "", "free": None}
    if mm is None:
        mm = _comfy("comfy.model_management")
        if mm is None:
            return unknown
    try:
        dev = mm.get_torch_device()
        kind = str(getattr(dev, "type", dev) or "").lower()
        cpu_mode = getattr(mm, "cpu_mode", None)
        if kind == "cpu" or (callable(cpu_mode) and cpu_mode()):
            return {"gpu": False, "device": "cpu", "free": None}
        if kind == "mps" or getattr(mm, "directml_enabled", False):
            return {"gpu": True, "device": str(dev), "free": None}  # shared memory / not measurable
        free = int(mm.get_free_memory(dev))
        for lm in list(getattr(mm, "current_loaded_models", None) or []):
            try:
                free += max(0, int(lm.model_loaded_memory()))
            except Exception:  # noqa: BLE001
                continue
        return {"gpu": True, "device": str(dev), "free": free}
    except Exception:  # noqa: BLE001
        return unknown


def memory_warning(mem: dict, size: int | None) -> dict | None:
    """{"reason": "no_gpu" | "low_vram", "free", "need", "size"} when the run may fall back to the CPU, else None."""
    need = size + VRAM_MARGIN if size else None
    if mem.get("gpu") is False:
        return {"reason": "no_gpu", "free": None, "need": need, "size": size}
    free = mem.get("free")
    if need is None or free is None or free >= need:
        return None
    return {"reason": "low_vram", "free": int(free), "need": need, "size": size}


def precheck(lister=None, resolver=None, mm=None) -> dict:
    """Before AI Cut Split runs: {"use_ai", "model", "missing" (notice info or None), "memory" (warning or None)}.
    With Use AI off nothing is checked."""
    name = model_settings()["clip_name"]
    if not use_ai_enabled():
        return {"use_ai": False, "model": name, "missing": None, "memory": None}
    if name not in list_text_models(lister):
        return {"use_ai": True, "model": name, "missing": missing_model_info(name), "memory": None}
    size = model_file_size(name, resolver)
    return {"use_ai": True, "model": name, "missing": None, "memory": memory_warning(memory_info(mm), size)}


def _check_can_run(lister=None) -> None:
    """Server-side guard: Use AI on and (inside ComfyUI) the model file listed."""
    if not use_ai_enabled():
        raise CutSplitError("disabled", USE_AI_OFF_MESSAGE)
    if lister is None:
        fp = _comfy("folder_paths")
        if fp is None:
            return
        lister = fp.get_filename_list
    name = model_settings()["clip_name"]
    if name not in list_text_models(lister):
        info = missing_model_info(name)
        raise CutSplitError("missing_model", f"Text model {name} is missing. Put it in {info['folder']}.",
                            {"missing": info})


def build_prompt(story: str, captions_mode: str | None = None, problems: list[str] | None = None) -> str:
    """The fixed cut split prompt + story; on a retry, the previous answer's problems after it."""
    mode = gg_script_presplit.normalize_caption_mode(captions_mode)
    text = gg_ltx.CUT_SPLIT_PROMPT + gg_ltx.cut_split_caption_hint(mode) + "\n\nSTORY:\n" + story.strip()
    if problems:
        text += ("\n\nYOUR PREVIOUS ANSWER WAS NOT A VALID CUT LIST:\n" + "\n".join(f"- {p}" for p in problems[:8])
                 + "\nAnswer again with ONLY the corrected JSON array.")
    return text


def build_workflow(prompt: str, model: dict) -> dict:
    """API-format graph; node 3 (PreviewAny) holds the generated text in /history outputs."""
    return {
        "1": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": model["clip_name"], "type": model["type"], "device": "default"}},
        "2": {"class_type": "TextGenerate",
              "inputs": {"clip": ["1", 0], "prompt": prompt, "max_length": MAX_LENGTH, "sampling_mode": "off",
                         "thinking": False}},
        OUTPUT_NODE: {"class_type": "PreviewAny", "inputs": {"source": ["2", 0]}},
    }


def _http(url: str, payload: dict | None = None, timeout: float = HTTP_TIMEOUT) -> bytes:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if payload is not None else "GET",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 (local ComfyUI URL from settings)
        return res.read()


def _history_entry(job_id: str) -> dict:
    url = f"{gg_sdk.settings()['comfyui_url']}/history/{urllib.parse.quote(job_id, safe='')}"
    deadline = time.time() + HISTORY_WAIT_SEC
    while True:
        try:
            hist = json.loads(_http(url).decode("utf-8", errors="replace") or "{}")
        except (OSError, ValueError) as ex:
            raise CutSplitError("no_text", f"Could not read the answer from ComfyUI history ({ex}).") from None
        entry = hist.get(job_id) if isinstance(hist, dict) else None
        if isinstance(entry, dict) or time.time() >= deadline:
            return entry if isinstance(entry, dict) else {}
        time.sleep(0.5)


def _execution_error(entry: dict) -> str:
    """ComfyUI's exception message of a failed run in /history ("" when there is none)."""
    status = entry.get("status") if isinstance(entry.get("status"), dict) else {}
    for msg in status.get("messages") or []:
        if isinstance(msg, (list, tuple)) and len(msg) > 1 and msg[0] == "execution_error" and isinstance(msg[1], dict):
            node = msg[1].get("node_type") or "node"
            return f"{node}: {str(msg[1].get('exception_message') or 'error').strip()}"
    return ""


def history_text(job_id: str) -> str:
    """The generated text of one run: /history/<job_id> -> outputs[3]["text"][0]."""
    entry = _history_entry(job_id)
    if not entry:
        raise CutSplitError("no_text", f"ComfyUI history has no run {job_id}, so the answer could not be read.")
    err = _execution_error(entry)
    if err:
        raise CutSplitError("sdk", f"The text model failed in ComfyUI: {err}")
    text = ((entry.get("outputs") or {}).get(OUTPUT_NODE) or {}).get("text")
    if isinstance(text, (list, tuple)):
        text = text[0] if text else None
    if not isinstance(text, str):
        raise CutSplitError("no_text", "The text model finished but returned no text.")
    return text


def sdk_error_message(error: str, model: dict) -> str:
    """Plain-English message for a failed SDK run."""
    e = str(error or "").strip() or "unknown error"
    low = e.lower()
    proxy = gg_sdk.settings()["proxy_url"]
    if "sdk venv python not found" in low:
        return f"Comfy SDK is not set up: {e}. See README › Comfy SDK path."
    if "proxy unreachable" in low or "connect" in low or "refused" in low or "10061" in low:
        return f"Comfy SDK proxy not reachable at {proxy}. Start it with start_proxy.bat, then try again."
    if "textgenerate" in low and ("does not exist" in low or "not found" in low or "not installed" in low):
        return "This ComfyUI has no TextGenerate node. Update ComfyUI to use AI Make Cut."
    if "not in list" in low or model["clip_name"].lower() in low:
        return (f"Text model {model['clip_name']} not found in ComfyUI (models/text_encoders). Install it or set "
                f'"cut_split_clip" in gonggan_settings.json.')
    if "timed out" in low:
        return f"The text model did not finish within {RUN_TIMEOUT:g} s; the job was cancelled."
    return f"AI Make Cut failed in ComfyUI: {e}"


def free_models() -> None:
    """Best effort: unload models and free memory in ComfyUI so the next render gets the VRAM."""
    try:
        _http(f"{gg_sdk.settings()['comfyui_url']}/free", {"unload_models": True, "free_memory": True})
    except Exception as ex:  # noqa: BLE001
        log.warning("[gonggan-cut] AI Cut Split: /free failed: %s", ex)


def _generate(prompt: str, model: dict) -> str:
    """One TextGenerate run through the SDK; returns the answer text."""
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    wf_file = WORK_DIR / f"cut_split_{time.strftime('%Y%m%d-%H%M%S')}_{secrets.token_hex(3)}.json"
    wf_file.write_text(json.dumps(build_workflow(prompt, model), ensure_ascii=False, indent=1), encoding="utf-8")
    try:
        res = gg_sdk.run_api_workflow(wf_file, RUN_TIMEOUT)
    finally:
        Path(wf_file).unlink(missing_ok=True)
    job_id = str(res.get("job_id") or "")
    if not res.get("ok"):
        detail = ""
        if job_id:
            try:
                detail = _execution_error(_history_entry(job_id))
            except CutSplitError:
                pass
        if detail:
            raise CutSplitError("sdk", f"The text model failed in ComfyUI: {detail}")
        raise CutSplitError("sdk", sdk_error_message(res.get("error") or res.get("message"), model))
    if not job_id:
        raise CutSplitError("no_text", "The Comfy SDK run returned no job id, so the answer could not be read.")
    return history_text(job_id)


def parse_answer(raw: str) -> list[dict]:
    """The model's answer -> validated public cuts. A JSON array that never closes means the answer hit
    MAX_LENGTH: CutSplitError "too_long" (a retry would be cut off the same way). Other problems: CutListError."""
    if not raw.strip():
        raise gg_ltx.CutListError(["The answer was empty."])
    try:
        return gg_ltx.public_cuts(gg_ltx.validate_cut_list(gg_ltx.extract_cut_items(raw)))
    except gg_ltx.CutListError:
        if gg_ltx.json_array_unclosed(raw):
            raise CutSplitError("too_long", TOO_LONG_MESSAGE) from None
        raise


def _check_story(story) -> None:
    if not isinstance(story, str) or not story.strip():
        raise CutSplitError("bad_request", "Write or paste a story first.")
    if len(story) > STORY_MAX_LEN:
        raise CutSplitError("bad_request", f"The story is too long (max {STORY_MAX_LEN} characters).")


def _begin(story) -> dict:
    """Checks before a run; on success holds _run_lock (released by _split) and returns the model."""
    _check_story(story)
    _check_can_run()
    busy = gg_sdk.busy_message()
    if busy:
        raise CutSplitError("busy", busy)
    if not _run_lock.acquire(blocking=False):
        raise CutSplitError("busy", "AI Make Cut is already running.")
    return model_settings()


def _split(story: str, model: dict, captions_mode: str | None = None, on_attempt=None) -> dict:
    """The TextGenerate runs (at most RETRIES + 1); releases _run_lock and frees the models at the end."""
    mode = gg_script_presplit.normalize_caption_mode(captions_mode)
    t0 = time.time()
    try:
        problems: list[str] = []
        for attempt in range(1, RETRIES + 2):
            if on_attempt:
                on_attempt(attempt)
            raw = _generate(build_prompt(story, mode, problems), model)
            try:
                cuts = parse_answer(raw)
            except gg_ltx.CutListError as ex:
                problems = ex.errors
                log.info("[gonggan-cut] AI Cut Split attempt %d: invalid answer (%s)", attempt, problems[:3])
                continue
            except CutSplitError:
                log.info("[gonggan-cut] AI Cut Split attempt %d: answer cut off at max_length %d (%d chars)",
                         attempt, MAX_LENGTH, len(raw))
                raise
            return {"model": model["clip_name"], "attempts": attempt, "seconds": round(time.time() - t0, 1),
                    "cuts": cuts}
        raise CutSplitError("invalid", f"The model's answer is not a valid cut list (tried {RETRIES + 1} times):\n"
                            + "\n".join(problems[:6]))
    finally:
        free_models()
        _run_lock.release()


def ai_cut_split(story, captions_mode=None) -> dict:
    """Story -> validated cuts from pre-split parsing or TextGenerate in ComfyUI. Creates nothing."""
    mode = gg_script_presplit.normalize_caption_mode(captions_mode)
    model = _begin(story)
    presplit = gg_script_presplit.presplit_public(story, mode)
    if presplit is not None:
        try:
            return {"model": model["clip_name"], "attempts": 0, "seconds": 0.0, "cuts": presplit, "presplit": True}
        finally:
            _run_lock.release()
    return _split(story, model, mode)


# One background run at a time (the UI polls it). The last result stays here until the next run starts, so a
# client that lost its connection or closed the dialog can still pick it up.
_job_lock = threading.Lock()
_job: dict = {}


def job_status(job_id: str | None = None) -> dict | None:
    """Snapshot of the last background run (`job_id` given: only that run), or None.
    {"id", "state": "running" | "done" | "error", "story", "attempt", "max_attempts", "seconds"} + when done
    {"cuts", "model", "attempts"}, on error {"code", "message", ...extra}."""
    with _job_lock:
        if not _job or (job_id and _job.get("id") != job_id):
            return None
        snap = {k: v for k, v in _job.items() if k not in ("started", "finished")}
        end = _job.get("finished") or time.time()
        snap["seconds"] = round(end - _job["started"], 1)
        return snap


def _job_update(job_id: str, **fields) -> None:
    with _job_lock:
        if _job.get("id") == job_id:
            _job.update(fields)


def _job_main(job_id: str, story: str, model: dict, captions_mode: str | None) -> None:
    try:
        mode = gg_script_presplit.normalize_caption_mode(captions_mode)
        presplit = gg_script_presplit.presplit_public(story, mode)
        if presplit is not None:
            _job_update(job_id, state="done", finished=time.time(), cuts=presplit, model=model["clip_name"],
                        attempts=0, presplit=True)
            return
        res = _split(story, model, mode, on_attempt=lambda n: _job_update(job_id, attempt=n))
        _job_update(job_id, state="done", finished=time.time(), cuts=res["cuts"], model=res["model"],
                    attempts=res["attempts"])
    except CutSplitError as ex:
        _job_update(job_id, state="error", finished=time.time(), code=ex.code, message=str(ex), **ex.extra)
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] AI Cut Split job failed")
        _job_update(job_id, state="error", finished=time.time(), code="sdk", message=f"AI Make Cut failed: {ex}")
    finally:
        if _run_lock.locked():
            _run_lock.release()


def start_job(story, captions_mode=None, start_thread=True) -> dict:
    """Same checks as ai_cut_split, then the run continues in a background thread; returns its first snapshot."""
    mode = gg_script_presplit.normalize_caption_mode(captions_mode)
    model = _begin(story)
    job_id = secrets.token_hex(6)
    with _job_lock:
        _job.clear()
        _job.update({"id": job_id, "state": "running", "story": story, "model": model["clip_name"], "attempt": 1,
                     "max_attempts": RETRIES + 1, "started": time.time(), "finished": None, "captions": mode})
    presplit = gg_script_presplit.presplit_public(story, mode)
    if presplit is not None:
        _job_update(job_id, state="done", finished=time.time(), cuts=presplit, attempts=0, presplit=True)
        if _run_lock.locked():
            _run_lock.release()
        return job_status(job_id) or {}
    if start_thread:
        try:
            threading.Thread(target=_job_main, args=(job_id, story, model, mode), name="gonggan-ai-make-cut",
                             daemon=True).start()
        except Exception:
            _run_lock.release()
            with _job_lock:
                _job.clear()
            raise
    return job_status(job_id) or {}
