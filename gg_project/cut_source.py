"""Pure cut-source workflow resolution for native projects (no I/O)."""
from __future__ import annotations

from typing import Any, Callable


def normalize_media_kind(kind: str | None) -> str | None:
    if kind in ("image", "video"):
        return kind
    return None


def version_media_kind(ver: dict[str, Any] | None) -> str | None:
    if not ver or not isinstance(ver, dict):
        return None
    asset = ver.get("asset")
    if isinstance(asset, dict):
        return normalize_media_kind(asset.get("kind"))
    return None


def _version_id_on_cut(cut: dict[str, Any], versions: list[dict[str, Any]], key: str) -> str | None:
    vid = cut.get(key)
    if isinstance(vid, str) and any(ver.get("id") == vid for ver in versions):
        return vid
    return None


def current_version_id(cut: dict[str, Any], versions: list[dict[str, Any]]) -> str | None:
    """Displayed version: explicit display, else manual Best pick, else the newest (versions are newest-first)."""
    return (
        _version_id_on_cut(cut, versions, "display_version_id")
        or _version_id_on_cut(cut, versions, "pick_version_id")
        or (versions[0].get("id") if versions else None)
    )


def rep_media_kind(cut: dict[str, Any], versions: list[dict[str, Any]]) -> str | None:
    cur = current_version_id(cut, versions)
    for ver in versions:
        if ver.get("id") == cur:
            return version_media_kind(ver)
    return None


def effective_workflow_kind(
    requested_kind: str | None,
    cut: dict[str, Any],
    versions: list[dict[str, Any]],
) -> str | None:
    req = normalize_media_kind(requested_kind)
    if req:
        return req
    return rep_media_kind(cut, versions)


def format_source_fallback(wanted: str | None, opened_kind: str | None, source: str) -> str | None:
    """Human-readable fallback line for toast detail (English)."""
    if not wanted or wanted not in ("image", "video"):
        return None
    if source == "template":
        return f"no {wanted} workflow yet — opened project template"
    if opened_kind in ("image", "video") and opened_kind != wanted:
        return f"no {wanted} workflow yet — opened latest {opened_kind} workflow"
    if source == "stored" and opened_kind is None:
        return f"no {wanted} workflow yet — opened cut workflow"
    return None


def resolve_native_cut_source(
    cut: dict[str, Any],
    versions: list[dict[str, Any]],
    get_workflow: Callable[[str | None], dict | None],
    template_workflow: dict | None,
    requested_kind: str | None = None,
    is_ui_workflow: Callable[[dict], bool] | None = None,
) -> dict[str, Any]:
    """
    Resolve workflow graph and metadata.

    versions: newest-first (same order as LocalStore.list_versions).
    Returns keys: ok, source, workflow, kind (ui|api), kind_used, fallback.
    """
    is_ui = is_ui_workflow or (lambda _wf: False)
    wanted = effective_workflow_kind(requested_kind, cut, versions)

    def pack(wf: dict | None, source: str, *, opened_kind: str | None, fallback: str | None = None) -> dict[str, Any]:
        if not wf:
            return {
                "ok": True,
                "source": source if source != "stored" else None,
                "workflow": None,
                "kind": None,
                "kind_used": wanted,
                "fallback": fallback,
            }
        kind = "ui" if is_ui(wf) else "api"
        return {
            "ok": True,
            "source": source,
            "workflow": wf,
            "kind": kind,
            "kind_used": wanted or opened_kind,
            "fallback": fallback,
        }

    if wanted in ("image", "video"):
        pick = current_version_id(cut, versions)
        if isinstance(pick, str):
            for ver in versions:
                if ver.get("id") != pick:
                    continue
                if version_media_kind(ver) != wanted:
                    break
                wf = get_workflow(ver.get("workflow_sha"))
                if wf:
                    return pack(wf, "stored", opened_kind=wanted, fallback=None)
                break
        for ver in versions:
            if version_media_kind(ver) != wanted:
                continue
            wf = get_workflow(ver.get("workflow_sha"))
            if wf:
                return pack(wf, "stored", opened_kind=wanted, fallback=None)

        wf = get_workflow(cut.get("workflow_sha"))
        if wf:
            fb = format_source_fallback(wanted, None, "stored")
            return pack(wf, "stored", opened_kind=None, fallback=fb)

        for ver in versions:
            wf = get_workflow(ver.get("workflow_sha"))
            if wf:
                ok = version_media_kind(ver)
                fb = format_source_fallback(wanted, ok, "stored")
                return pack(wf, "stored", opened_kind=ok, fallback=fb)

        if template_workflow:
            fb = format_source_fallback(wanted, None, "template")
            return pack(template_workflow, "template", opened_kind=None, fallback=fb)

        return pack(None, "stored", opened_kind=None, fallback=None)

    wf = get_workflow(cut.get("workflow_sha"))
    if wf:
        return pack(wf, "stored", opened_kind=None, fallback=None)

    pick = current_version_id(cut, versions)
    if isinstance(pick, str):
        for ver in versions:
            if ver.get("id") == pick:
                wf = get_workflow(ver.get("workflow_sha"))
                if wf:
                    return pack(wf, "stored", opened_kind=version_media_kind(ver), fallback=None)
                break

    for ver in versions:
        wf = get_workflow(ver.get("workflow_sha"))
        if wf:
            return pack(wf, "stored", opened_kind=version_media_kind(ver), fallback=None)

    if template_workflow:
        return pack(template_workflow, "template", opened_kind=None, fallback=None)

    return pack(None, "stored", opened_kind=None, fallback=None)
