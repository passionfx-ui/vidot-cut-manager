"""Local ComfyUI workflow submission (no generation in unit tests)."""
from __future__ import annotations

from typing import Any


class LocalComfyRunner:
    """Submit API-format workflows to the local ComfyUI queue (via pack SDK path)."""

    def submit(self, workflow: dict, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError(
            "LocalComfyRunner.submit is not wired in 0.6.0-dev storage layer; use gg_sdk regen from routes."
        )
