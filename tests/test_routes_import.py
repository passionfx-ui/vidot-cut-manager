"""Static checks on routes.py imports (no ComfyUI startup)."""
from __future__ import annotations

import ast
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROUTES_SRC = REPO / "routes.py"


def _module_level_imported_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                names.add(alias.asname or alias.name)
        elif isinstance(node, ast.Try):
            for sub in node.body + [s for h in node.handlers for s in h.body]:
                if isinstance(sub, ast.ImportFrom):
                    for alias in sub.names:
                        names.add(alias.asname or alias.name)
    return names


def _in_function_gg_project_imports(tree: ast.Module) -> list[ast.ImportFrom]:
    found: list[ast.ImportFrom] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for sub in ast.walk(node):
            if sub is node:
                continue
            if isinstance(sub, ast.ImportFrom) and sub.module == "gg_project" and sub.level == 0:
                found.append(sub)
    return found


class RoutesImportTests(unittest.TestCase):
    def test_no_in_function_from_gg_project_import(self):
        tree = ast.parse(ROUTES_SRC.read_text(encoding="utf-8"))
        self.assertEqual(
            _in_function_gg_project_imports(tree),
            [],
            "routes must not use in-function 'from gg_project import ...'",
        )

    def test_conflict_error_module_level(self):
        tree = ast.parse(ROUTES_SRC.read_text(encoding="utf-8"))
        self.assertIn("ConflictError", _module_level_imported_names(tree))


if __name__ == "__main__":
    unittest.main()
