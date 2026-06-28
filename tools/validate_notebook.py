#!/usr/bin/env python3
"""Small structural validator for project notebooks."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("notebook")
    args = parser.parse_args()

    path = Path(args.notebook)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        errors = validate(data)
    except Exception as exc:  # noqa: BLE001 - CLI validation should report any parse failure.
        errors = [f"{path}: {exc}"]

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {path} notebook structure is valid")
    return 0


def validate(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if data.get("nbformat") != 4:
        errors.append("nbformat must be 4")
    cells = data.get("cells")
    if not isinstance(cells, list) or not cells:
        errors.append("cells must be a non-empty list")
        return errors
    markdown_count = 0
    code_count = 0
    for index, cell in enumerate(cells):
        cell_type = cell.get("cell_type")
        source = cell.get("source")
        if cell_type not in {"markdown", "code"}:
            errors.append(f"cell {index} has invalid cell_type {cell_type}")
        if not isinstance(source, list) or not source:
            errors.append(f"cell {index} source must be a non-empty list")
        if cell_type == "markdown":
            markdown_count += 1
        if cell_type == "code":
            code_count += 1
            if cell.get("execution_count") is not None:
                errors.append(f"cell {index} execution_count must be null in scaffolded notebooks")
            if cell.get("outputs") != []:
                errors.append(f"cell {index} outputs must be empty in scaffolded notebooks")
    if markdown_count < 3:
        errors.append("notebook should include at least three markdown cells")
    if code_count < 2:
        errors.append("notebook should include at least two code cells")
    return errors


if __name__ == "__main__":
    raise SystemExit(main())
