"""Invoke a validated ``pyproject.toml`` console-script target under debugpy."""

from __future__ import annotations

import importlib
import re
import sys
from collections.abc import Callable
from typing import Any, Optional


_PYTHON_REFERENCE = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$")


def _resolve_target(module_name: str, callable_name: str) -> Callable[[], Any]:
    if not _PYTHON_REFERENCE.fullmatch(module_name):
        raise ValueError("invalid console-script module")
    if not _PYTHON_REFERENCE.fullmatch(callable_name):
        raise ValueError("invalid console-script callable")

    target: Any = importlib.import_module(module_name)
    for part in callable_name.split("."):
        target = getattr(target, part)
    if not callable(target):
        raise TypeError("console-script target is not callable")
    return target


def main() -> Optional[int]:
    if len(sys.argv) != 5:
        raise SystemExit(
            "usage: python_project_script_launcher.py WORKSPACE SCRIPT MODULE CALLABLE"
        )

    _, workspace, script_name, module_name, callable_name = sys.argv
    sys.path.insert(0, workspace)
    sys.argv = [script_name]
    return _resolve_target(module_name, callable_name)()


if __name__ == "__main__":
    raise SystemExit(main())
