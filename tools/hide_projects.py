"""CLI: hide / unhide projects in the Shots project list (no server needed, nothing is deleted).

  python tools/hide_projects.py --hide-all     write every current project id (native + imported)
  python tools/hide_projects.py --unhide-all   empty the list (all projects show again)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gg_data  # noqa: E402
import gg_native_api  # noqa: E402
from gg_project.hidden_projects import load_hidden_ids, write_hidden_ids  # noqa: E402


def current_project_ids() -> tuple[list[str], list[str]]:
    native = [r["id"] for r in gg_native_api.native_store().list_projects(include_deleted=False)
              if isinstance(r.get("id"), str) and r["id"]]
    legacy = [p["id"] for p in gg_data.list_projects().get("projects") or []
              if isinstance(p, dict) and isinstance(p.get("id"), str) and p["id"]]
    return native, legacy


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Hide or unhide projects in the Shots project list.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--hide-all", action="store_true", help="hide every project that exists now (native + imported)")
    g.add_argument("--unhide-all", action="store_true", help="empty the hide list")
    args = ap.parse_args(argv)

    path = gg_native_api.hidden_projects_path()
    before = len(load_hidden_ids(path))
    if args.hide_all:
        native, legacy = current_project_ids()
        written = write_hidden_ids(path, native + legacy)
        print(f"Hidden {len(written)} projects (native {len(native)}, imported {len(legacy)}); "
              f"previously hidden {before}.")
    else:
        write_hidden_ids(path, [])
        print(f"Unhid {before} projects; hide list is now empty.")
    print(f"File: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
