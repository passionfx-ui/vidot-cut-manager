"""Store and runner interfaces.

# CloudStore / ComfyCloudRunner — future cloud-backed project sync and remote Comfy runs.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ProjectStore(Protocol):
    def list_projects(self, include_deleted: bool = False) -> list[dict[str, Any]]: ...

    def create_project(
        self,
        name: str,
        template_ref: str | None = None,
        template_graph: dict | None = None,
    ) -> dict[str, Any]: ...

    def get_project(self, pid: str) -> dict[str, Any] | None: ...

    def rename_project(self, pid: str, name: str, expected_rev: int | None = None) -> dict[str, Any]: ...

    def delete_project(self, pid: str) -> dict[str, Any]: ...

    def restore_project(self, pid: str) -> dict[str, Any]: ...

    def add_scene(self, pid: str, name: str, cut_ids: list[str] | None = None) -> dict[str, Any]: ...

    def rename_scene(self, pid: str, scene_id: str, name: str) -> dict[str, Any]: ...

    def ungroup_scene(self, pid: str, scene_id: str) -> dict[str, Any]: ...

    def add_cut(
        self,
        pid: str,
        scene_id: str | None = None,
        after: str | None = None,
        name: str | None = None,
        template_graph: dict | None = None,
    ) -> dict[str, Any]: ...

    def rename_cut(self, pid: str, cut_id: str, name: str) -> dict[str, Any]: ...

    def delete_cuts(self, pid: str, ids: list[str]) -> dict[str, Any]: ...

    def restore_cuts(self, pid: str, ids: list[str] | None = None) -> dict[str, Any]: ...

    def reorder(self, pid: str, order: list[str]) -> dict[str, Any]: ...

    def set_template(self, pid: str, ref: str | None) -> dict[str, Any]: ...

    def put_blob(self, pid: str, obj: dict) -> str: ...

    def get_blob(self, pid: str, sha: str) -> dict | None: ...

    def add_version(
        self,
        pid: str,
        cut_id: str,
        src_file: Path | str,
        workflow: dict | None = None,
        prompt_id: str | None = None,
    ) -> dict[str, Any]: ...

    def list_versions(self, pid: str, cut_id: str) -> list[dict[str, Any]]: ...

    def to_timeline(self, pid: str) -> dict | None: ...


@runtime_checkable
class Runner(Protocol):
    def submit(self, workflow: dict, **kwargs: Any) -> dict[str, Any]: ...
