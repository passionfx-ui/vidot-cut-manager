"""AI Cut Split through a local Ollama server (stdlib urllib, blocking; routes call it in a thread).

The story goes to /api/chat with the fixed cut split prompt; the answer is checked by the same validator as
Paste Cut List. keep_alive 0 by default, so the LLM leaves VRAM before LTX renders."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

try:
    from . import gg_data
    from . import gg_ltx
except ImportError:  # unit tests import this module directly
    import gg_data  # type: ignore
    import gg_ltx  # type: ignore

DEFAULT_URL = "http://127.0.0.1:11434"
TAGS_TIMEOUT = 5.0
CHAT_TIMEOUT = 180.0
TEMPERATURE = 0.2
STORY_MAX_LEN = 20000
RAW_MAX_LEN = 4000


class OllamaError(Exception):
    """`code`: "unreachable", "timeout", "http", "invalid" (answer is not a valid cut list), "bad_request"."""

    def __init__(self, code: str, message: str, raw: str = ""):
        super().__init__(message)
        self.code = code
        self.raw = raw


def base_url(value: str | None = None) -> str:
    """`value` (the browser setting) when set, else gonggan_settings.json "ollama_url", else the default."""
    url = (value or "").strip() or str(gg_data.load_settings().get("ollama_url") or "").strip() or DEFAULT_URL
    url = url.rstrip("/")
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise OllamaError("bad_request", f"Ollama URL must look like {DEFAULT_URL} (got {url})")
    return url


def not_running_message(url: str) -> str:
    return f"Ollama not running at {url}"


def _request(base: str, path: str, payload: dict | None, timeout: float) -> dict:
    url = base + path
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if payload is not None else "GET",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 (http/https checked in base_url)
            body = res.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as ex:
        detail = ""
        try:
            detail = json.loads(ex.read().decode("utf-8", errors="replace")).get("error") or ""
        except Exception:  # noqa: BLE001
            pass
        raise OllamaError("http", f"Ollama error {ex.code}: {detail or ex.reason}") from None
    except TimeoutError:
        raise OllamaError("timeout", f"Ollama did not answer within {timeout:g} s") from None
    except urllib.error.URLError as ex:
        if isinstance(ex.reason, TimeoutError):
            raise OllamaError("timeout", f"Ollama did not answer within {timeout:g} s") from None
        raise OllamaError("unreachable", not_running_message(base)) from None
    except OSError:
        raise OllamaError("unreachable", not_running_message(base)) from None
    try:
        out = json.loads(body)
    except ValueError:
        raise OllamaError("http", "Ollama sent an answer that is not JSON") from None
    return out if isinstance(out, dict) else {}


def list_models(url: str | None = None) -> dict:
    """{"base_url", "models": [name, ...]} of the installed chat models (embedding models left out)."""
    base = base_url(url)
    data = _request(base, "/api/tags", None, TAGS_TIMEOUT)
    names = [m.get("name") or m.get("model") for m in data.get("models") or [] if isinstance(m, dict)]
    names = [n for n in names if isinstance(n, str) and n and "embed" not in n.lower()]
    return {"base_url": base, "models": sorted(set(names), key=str.lower)}


def chat_payload(model: str, story: str, keep_loaded: bool = False) -> dict:
    """/api/chat request: the fixed prompt + story, JSON output, low temperature, unloaded right after."""
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": gg_ltx.CUT_SPLIT_PROMPT + story.strip()}],
        "stream": False,
        "format": "json",
        "options": {"temperature": TEMPERATURE},
    }
    if not keep_loaded:
        payload["keep_alive"] = 0
    return payload


def ai_cut_split(story, model, keep_loaded: bool = False, url: str | None = None) -> dict:
    """Story -> validated cuts [{cut, duration, description}] from the local LLM."""
    if not isinstance(story, str) or not story.strip():
        raise OllamaError("bad_request", "Write or paste a story first.")
    if len(story) > STORY_MAX_LEN:
        raise OllamaError("bad_request", f"The story is too long (max {STORY_MAX_LEN} characters).")
    if not isinstance(model, str) or not model.strip():
        raise OllamaError("bad_request", "Pick an Ollama model.")
    base = base_url(url)
    data = _request(base, "/api/chat", chat_payload(model.strip(), story, bool(keep_loaded)), CHAT_TIMEOUT)
    raw = str((data.get("message") or {}).get("content") or "")
    if not raw.strip():
        raise OllamaError("invalid", "The model returned an empty answer. Try again or pick a larger model.")
    try:
        rows = gg_ltx.validate_cut_list(gg_ltx.extract_cut_items(raw))
    except gg_ltx.CutListError as ex:
        raise OllamaError("invalid", "The model's answer is not a valid cut list:\n" + "\n".join(ex.errors[:6]),
                          raw[:RAW_MAX_LEN]) from None
    return {"base_url": base, "model": model.strip(), "keep_loaded": bool(keep_loaded),
            "cuts": gg_ltx.public_cuts(rows)}
