"""AI Cut Split through ComfyUI's own TextGenerate node, run on the Comfy SDK path
(gg_sdk -> .venv-sdk sdk_runner.py -> comfy-api-proxy :8189 -> ComfyUI :8188). Blocking; routes call it in a thread.

Graph: CLIPLoader (text model) -> TextGenerate (fixed cut split prompt + story, greedy) -> PreviewAny. The answer is
read from ComfyUI /history and checked with the same validator as the cut list route; an invalid answer is retried
with its problems listed. Afterwards ComfyUI is asked to unload models (/free) so LTX gets the VRAM."""
from __future__ import annotations

import json
import logging
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
    from . import gg_sdk
except ImportError:  # unit tests import this module directly
    import gg_data  # type: ignore
    import gg_ltx  # type: ignore
    import gg_sdk  # type: ignore

log = logging.getLogger("gonggan-cut")

DEFAULT_CLIP = "qwen3vl_4b_int8_convrot.safetensors"
DEFAULT_CLIP_TYPE = "stable_diffusion"
MAX_LENGTH = 2048
RETRIES = 1
RUN_TIMEOUT = 600.0
HTTP_TIMEOUT = 10.0
HISTORY_WAIT_SEC = 5.0
STORY_MAX_LEN = 20000
OUTPUT_NODE = "3"
WORK_DIR = gg_data.CACHE_DIR / "cut_split"

_run_lock = threading.Lock()


class CutSplitError(Exception):
    """`code`: "bad_request", "busy", "sdk" (the run failed), "no_text" (no answer in /history), "invalid"."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def model_settings() -> dict:
    """Text model for TextGenerate: gonggan_settings.json "cut_split_clip" / "cut_split_clip_type"."""
    s = gg_data.load_settings()
    return {"clip_name": str(s.get("cut_split_clip") or "").strip() or DEFAULT_CLIP,
            "type": str(s.get("cut_split_clip_type") or "").strip() or DEFAULT_CLIP_TYPE}


def build_prompt(story: str, problems: list[str] | None = None) -> str:
    """The fixed cut split prompt + story; on a retry, the previous answer's problems after it."""
    text = gg_ltx.CUT_SPLIT_PROMPT + story.strip()
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
        return "This ComfyUI has no TextGenerate node. Update ComfyUI to use AI Cut Split."
    if "not in list" in low or model["clip_name"].lower() in low:
        return (f"Text model {model['clip_name']} not found in ComfyUI (models/text_encoders). Install it or set "
                f'"cut_split_clip" in gonggan_settings.json.')
    if "timed out" in low:
        return f"The text model did not finish within {RUN_TIMEOUT:g} s; the job was cancelled."
    return f"AI Cut Split failed in ComfyUI: {e}"


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


def ai_cut_split(story) -> dict:
    """Story -> validated cuts [{cut, duration, description}] from TextGenerate in ComfyUI. Creates nothing."""
    if not isinstance(story, str) or not story.strip():
        raise CutSplitError("bad_request", "Write or paste a story first.")
    if len(story) > STORY_MAX_LEN:
        raise CutSplitError("bad_request", f"The story is too long (max {STORY_MAX_LEN} characters).")
    busy = gg_sdk.busy_message()
    if busy:
        raise CutSplitError("busy", busy)
    if not _run_lock.acquire(blocking=False):
        raise CutSplitError("busy", "AI Cut Split is already running.")
    model = model_settings()
    t0 = time.time()
    try:
        problems: list[str] = []
        for attempt in range(1, RETRIES + 2):
            raw = _generate(build_prompt(story, problems), model)
            try:
                if not raw.strip():
                    raise gg_ltx.CutListError(["The answer was empty."])
                rows = gg_ltx.validate_cut_list(gg_ltx.extract_cut_items(raw))
            except gg_ltx.CutListError as ex:
                problems = ex.errors
                log.info("[gonggan-cut] AI Cut Split attempt %d: invalid answer (%s)", attempt, problems[:3])
                continue
            return {"model": model["clip_name"], "attempts": attempt, "seconds": round(time.time() - t0, 1),
                    "cuts": gg_ltx.public_cuts(rows)}
        raise CutSplitError("invalid", f"The model's answer is not a valid cut list (tried {RETRIES + 1} times):\n"
                            + "\n".join(problems[:6]))
    finally:
        free_models()
        _run_lock.release()
