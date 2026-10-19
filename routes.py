"""aiohttp routes under /gonggan/* on ComfyUI's PromptServer (also reachable as /api/gonggan/*)."""
from __future__ import annotations

import asyncio
import logging

from aiohttp import web
from server import PromptServer

from . import gg_data

routes = PromptServer.instance.routes
log = logging.getLogger("gonggan-cut")


def _err(status: int, message: str) -> web.Response:
    return web.json_response({"ok": False, "message": message}, status=status)


@routes.get("/gonggan/settings")
async def gg_settings(request):
    s = gg_data.load_settings()
    try:
        d = await asyncio.to_thread(gg_data.user_dir, s)
        ok, where = True, str(d)
    except Exception as ex:  # noqa: BLE001
        ok, where = False, str(ex)
    return web.json_response({"ok": ok, "data_root": s.get("data_root"), "uid": s.get("uid"), "user_dir": where})


@routes.get("/gonggan/projects")
async def gg_projects(request):
    try:
        return web.json_response(await asyncio.to_thread(gg_data.list_projects))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] projects failed")
        return _err(500, str(ex))


@routes.get("/gonggan/timeline")
async def gg_timeline(request):
    pid = request.query.get("pid", "")
    if not pid:
        return _err(400, "pid required")
    try:
        data = await asyncio.to_thread(gg_data.timeline, pid)
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] timeline failed")
        return _err(500, str(ex))
    if data is None:
        return _err(404, "project not found")
    return web.json_response(data)


@routes.get("/gonggan/media")
async def gg_media(request):
    try:
        path = await asyncio.to_thread(gg_data.media_path, request.query.get("id", ""))
    except Exception as ex:  # noqa: BLE001
        return _err(500, str(ex))
    if path is None:
        return _err(404, "media not found")
    return web.FileResponse(
        path,
        headers={
            "Content-Type": gg_data.MIME.get(path.suffix.lower(), "application/octet-stream"),
            "Cache-Control": "private, max-age=300",
        },
    )
