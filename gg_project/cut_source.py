"""Pure cut-source workflow resolution for native projects (no I/O)."""
from __future__ import annotations

from typing import Any, Callable


def normalize_media_kind(kind: str | None) -> str | None:
    if kind in ("image", "video"):
        return kind
    return None


_VIDEO_NODE_HINTS = ("video", "ltxv", "saveanimated", "webm", "vhs_")
_IMAGE_OUTPUT_NODES = ("saveimage", "previewimage")
_IMAGE_LATENT_HINTS = ("emptylatentimage", "emptysd3latentimage", "emptyflux2latentimage", "emptyhunyuanlatent")


def workflow_media_kind(wf: dict[str, Any] | None) -> str | None:
    """What a graph (UI or API format) makes, from its node types: "video", "image" or None (unknown)."""
    if not isinstance(wf, dict):
        return None
    nodes = wf.get("nodes")
    if isinstance(nodes, list):
        types = [str(n.get("type") or "") for n in nodes if isinstance(n, dict)]
    else:
        types = [str(n.get("class_type") or "") for n in wf.values() if isinstance(n, dict)]
    low = [t.lower() for t in types]
    if any(h in t for t in low for h in _VIDEO_NODE_HINTS):
        return "video"
    if any(t in _IMAGE_OUTPUT_NODES or t in _IMAGE_LATENT_HINTS for t in low):
        return "image"
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
    if source == "kind_template":
        return f"no {wanted} workflow yet — opened the {wanted.capitalize()} template"
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
    kind_template: Callable[[str], dict | None] | None = None,
) -> dict[str, Any]:
    """
    Resolve workflow graph and metadata.

    versions: newest-first (same order as LocalStore.list_versions).
    kind_template: the project's Image / Video template graph for a kind; with it, a cut showing an image never
    opens a video graph and the other way round (the template of the wanted kind comes before other-kind graphs).
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
        cut_kind = workflow_media_kind(wf)
        # The cut's own graph usually started from the Image template: an unknown graph never opens as video.
        if wf and (kind_template is None or cut_kind == wanted or (cut_kind is None and wanted == "image")):
            fb = format_source_fallback(wanted, None, "stored")
            return pack(wf, "stored", opened_kind=None, fallback=fb)

        if kind_template is not None:
            wf = kind_template(wanted)
            if wf:
                fb = format_source_fallback(wanted, None, "kind_template")
                return pack(wf, "template", opened_kind=wanted, fallback=fb)

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
