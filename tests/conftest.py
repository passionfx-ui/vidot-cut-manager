"""Keep pytest from creating project folders in the repo output directory.

Without ComfyUI's folder_paths, comfyui_output_directory() is <repo>/output.
create_native_project() with no location writes <that>/assets there, and
gg_export.output_dir() creates <that>/gonggan. Both are pointed at a temp
directory for each test and removed afterwards.
"""
from __future__ import annotations

import importlib
import sys
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolated_default_output(monkeypatch):
    tmp = tempfile.TemporaryDirectory(prefix="ggout-")
    out = Path(tmp.name).resolve()

    def _output() -> Path:
        return out

    def _export_dir() -> Path:
        dest = out / "gonggan"
        dest.mkdir(parents=True, exist_ok=True)
        return dest

    def _redirect(mod) -> None:
        ns = getattr(mod, "__dict__", None)
        if not ns:
            return
        current = ns.get("comfyui_output_directory")
        if current is not None and current is not _output:
            monkeypatch.setattr(mod, "comfyui_output_directory", _output, raising=False)
        export_fn = ns.get("output_dir")
        if (
            export_fn is not None
            and export_fn is not _export_dir
            and str(getattr(export_fn, "__module__", "")).endswith("gg_export")
        ):
            monkeypatch.setattr(mod, "output_dir", _export_dir, raising=False)

    for loaded in list(sys.modules.values()):
        _redirect(loaded)

    real_import_module = importlib.import_module

    def _import_module(name, package=None):
        before = set(sys.modules)
        mod = real_import_module(name, package)
        _redirect(mod)
        for key, loaded in list(sys.modules.items()):
            if key not in before:
                _redirect(loaded)
        return mod

    monkeypatch.setattr(importlib, "import_module", _import_module)
    try:
        yield out
    finally:
        tmp.cleanup()
