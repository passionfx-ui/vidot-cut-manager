"""comfyui-gonggan-cut - shot list + rough-cut timeline tab for ComfyUI, reading 공간쉐어 project data."""

__version__ = "0.9.25"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web"

try:  # routes need the running PromptServer; skip when imported outside ComfyUI
    from . import routes  # noqa: F401
except Exception as _ex:  # pragma: no cover
    import logging
    logging.warning(f"[gonggan-cut] routes not registered: {_ex}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
