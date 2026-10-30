"""0.9.112: version row Import (POST /gonggan/import-version) copies a picked file in as a new cut version."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_native_api as na
from gg_project import LocalStore

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture
def project(tmp_path):
    store = LocalStore(tmp_path / "pack")
    na.set_native_store(store)
    loc = tmp_path / "loc"
    loc.mkdir()
    pid = na.create_native_project("Imp", None, None, str(loc))["project"]["id"]
    cut = next(iter(store.get_project(pid)["cuts"]))
    yield store, pid, cut, loc / "Imp" / "assets"
    na.set_native_store(None)


def test_copies_with_unique_names_and_leaves_originals(project, tmp_path):
    store, pid, cut, assets = project
    existing = assets / "keep.png"
    existing.write_bytes(b"old")
    src = tmp_path / "picked" / "shot.png"
    src.parent.mkdir()
    src.write_bytes(PNG)

    first = na.native_import_version(pid, cut, src)["version"]
    second = na.native_import_version(pid, cut, src)["version"]

    a, b = Path(first["asset"]["path"]), Path(second["asset"]["path"])
    assert a.parent == assets and b.parent == assets
    assert a != b and a.name != src.name
    assert a.read_bytes() == PNG and b.read_bytes() == PNG
    assert src.read_bytes() == PNG
    assert existing.read_bytes() == b"old"
    assert {v["id"] for v in store.list_versions(pid, cut)} == {first["id"], second["id"]}


def test_rejects_bad_input(project, tmp_path):
    _, pid, cut, assets = project
    txt = tmp_path / "notes.txt"
    txt.write_text("x")
    with pytest.raises(ValueError, match="Unsupported"):
        na.native_import_version(pid, cut, txt)
    png = tmp_path / "a.png"
    png.write_bytes(PNG)
    with pytest.raises(ValueError, match="cut not found"):
        na.native_import_version(pid, "01a18b3f-271d-722b-81f4-e2f056fdca99", png)
    assert list(assets.iterdir()) == []
    assert txt.read_text() == "x" and png.read_bytes() == PNG
