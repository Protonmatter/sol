"""Fresh scientific reports, confined to the repository's output directories."""
from __future__ import annotations

import json
from pathlib import Path


def admit_report_path(root: Path, path: Path) -> Path:
    """Admit an ordinary, fresh file strictly below an unredirected output root."""
    if not root.is_absolute() or root.resolve() != root:
        raise ValueError('report workspace root must be absolute and unredirected')
    target = path.resolve()
    roots = [root / 'build', root / 'coverage']
    allowed = any(directory.resolve() == directory
                  and (not directory.exists() or directory.is_dir())
                  and target != directory and target.is_relative_to(directory) for directory in roots)
    if not allowed or target.exists() or path.is_symlink():
        raise ValueError('report needs a new file strictly under an unredirected build/ or coverage/ directory')
    return target


def write_report(root: Path, target: Path, report: dict) -> None:
    """Recheck after calculation, then serialize finite JSON and create exclusively."""
    if admit_report_path(root, target) != target:
        raise ValueError('report destination changed during validation')
    text = json.dumps(report, indent=2, allow_nan=False) + '\n'
    target.parent.mkdir(parents=True, exist_ok=True)
    if admit_report_path(root, target) != target:
        raise ValueError('report destination changed before publication')
    with target.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(text)
