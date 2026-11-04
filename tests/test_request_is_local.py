"""_request_is_local follows the TCP peer only (never the Host header)."""
from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]

LOOPBACK = (
    "127.0.0.1",
    "127.0.0.8",
    "127.255.255.255",
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "::ffff:127.10.0.2",
    "::ffff:7f00:1",
)


class _Routes:
    def __getattr__(self, _name):
        def deco_for(_path):
            def deco(fn):
                return fn
            return deco
        return deco_for


class _Transport:
    def __init__(self, peername):
        self._peername = peername

    def get_extra_info(self, key):
        if key == "peername":
            return self._peername
        return None


class _Req:
    def __init__(self, remote, host="localhost", peername=None, with_transport=False):
        self.remote = remote
        self.host = host
        self.headers = {"Host": host}
        self.transport = _Transport(peername) if with_transport else None


def _load_request_is_local():
    repo = str(REPO)
    if repo not in sys.path:
        sys.path.insert(0, repo)
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(
        instance=types.SimpleNamespace(routes=_Routes(), send_sync=lambda *_a, **_k: None)
    )
    web = types.ModuleType("aiohttp.web")
    aiohttp = types.ModuleType("aiohttp")
    aiohttp.web = web
    pkg_name = "_gonggan_routes_local_test"
    pkg = types.ModuleType(pkg_name)
    pkg.__path__ = [repo]
    pkg.__package__ = pkg_name
    previous = {key: sys.modules.get(key) for key in ("server", "aiohttp", "aiohttp.web")}
    sys.modules["server"] = server
    sys.modules["aiohttp"] = aiohttp
    sys.modules["aiohttp.web"] = web
    sys.modules[pkg_name] = pkg
    try:
        routes = importlib.import_module(pkg_name + ".routes")
        return routes._request_is_local
    finally:
        for key, old in previous.items():
            if old is None:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = old


_request_is_local = _load_request_is_local()


def _peername(addr: str):
    if ":" in addr:
        return (addr, 40000, 0, 0)
    return (addr, 40000)


@pytest.mark.parametrize("addr", LOOPBACK)
def test_loopback_peers_are_local(addr):
    assert _request_is_local(_Req(remote=addr, host="attacker.example")) is True
    assert _request_is_local(
        _Req(remote="", host="attacker.example", peername=_peername(addr), with_transport=True)
    ) is True
    assert _request_is_local(
        _Req(remote=None, host="localhost", peername=_peername(addr), with_transport=True)
    ) is True


def test_non_loopback_peer_with_localhost_host_is_false():
    assert _request_is_local(_Req(remote="203.0.113.5", host="localhost")) is False
    assert _request_is_local(_Req(remote="203.0.113.5", host="localhost:8188")) is False
    assert _request_is_local(
        _Req(remote="", host="localhost", peername=("198.51.100.4", 8188), with_transport=True)
    ) is False
    assert _request_is_local(
        _Req(remote=None, host="localhost", peername=("::ffff:8.8.8.8", 9, 0, 0), with_transport=True)
    ) is False


def test_missing_peer_is_false():
    assert _request_is_local(_Req(remote=None, host="localhost")) is False
    assert _request_is_local(_Req(remote="", host="localhost")) is False
    assert _request_is_local(_Req(remote=None, host="127.0.0.1")) is False
    assert _request_is_local(
        _Req(remote=None, host="localhost", peername=None, with_transport=True)
    ) is False
