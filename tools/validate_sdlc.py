#!/usr/bin/env python3
"""Validate Sol's specification-driven SDLC and release workflow contracts."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

REQUIREMENT_ID = re.compile(r"^SOL-[A-Z]+-\d{3}$")
RFC_FILE = re.compile(r"^\d{4}-[a-z0-9-]+\.md$")
RFC_STATUSES = {"Draft", "Accepted", "Implemented", "Rejected", "Superseded"}
REQUIREMENT_STATUSES = {"planned", "implemented", "deprecated"}
ACTION_USE = re.compile(
    r"^\s*-\s+uses:\s+([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)@([^\s#]+)",
    re.MULTILINE,
)

REQUIRED_DOCS = (
    "README.md",
    "CONTRIBUTING.md",
    "docs/SPEC.md",
    "docs/STANDARDS.md",
    "docs/SDLC.md",
    "docs/REQUIREMENTS.md",
    "docs/requirements.json",
    "docs/UX_GUIDELINES.md",
    "docs/VALIDATION_PLAN.md",
    "docs/IMPLEMENTATION_PLAN.md",
    "docs/INSTRUCTIONS.md",
    "docs/OPERATIONS.md",
    "docs/OPERATIONAL_READINESS.md",
    "docs/STATUS.md",
    "docs/RFC_ALIGNMENT.md",
    "docs/rfcs/README.md",
    "docs/rfcs/0000-template.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/dependabot.yml",
)

REQUIRED_RFC_SECTIONS = (
    "Summary",
    "Context",
    "Requirements",
    "Design",
    "UX and accessibility",
    "Security and privacy",
    "Alternatives",
    "Risks",
    "Acceptance criteria",
    "Validation",
    "Rollout and rollback",
    "Documentation",
)


def slugify_heading(value: str) -> str:
    """Return the stable GitHub-style slug needed by canonical source links."""
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"[`*_~]", "", value).strip().lower()
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE)
    return re.sub(r"[\s-]+", "-", value).strip("-")


def split_reference(reference: str) -> tuple[str, str]:
    path, marker, anchor = reference.partition("#")
    return path, anchor if marker else ""


def validate_source_reference(reference: str, root: Path, label: str) -> list[str]:
    errors: list[str] = []
    relative, anchor = split_reference(reference)
    path = root / relative
    if not path.is_file():
        return [f"{label}: source does not exist: {relative}"]
    if anchor and path.suffix.lower() == ".md":
        headings = {
            slugify_heading(match.group(1))
            for match in re.finditer(r"^#{1,6}\s+(.+?)\s*$", path.read_text(encoding="utf-8"), re.MULTILINE)
        }
        if anchor not in headings:
            errors.append(f"{label}: source anchor does not exist: {reference}")
    return errors


def validate_requirements_data(data: Any, root: Path) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    if not isinstance(data, dict) or data.get("schema_version") != "sol-requirements.v1":
        return ["docs/requirements.json: schema_version must be sol-requirements.v1"], set()
    requirements = data.get("requirements")
    if not isinstance(requirements, list) or not requirements:
        return ["docs/requirements.json: requirements must be a non-empty array"], set()

    ids: set[str] = set()
    for index, item in enumerate(requirements):
        label = f"docs/requirements.json requirement[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{label}: must be an object")
            continue
        req_id = item.get("id")
        if not isinstance(req_id, str) or not REQUIREMENT_ID.fullmatch(req_id):
            errors.append(f"{label}: invalid requirement id {req_id!r}")
            continue
        label = req_id
        if req_id in ids:
            errors.append(f"{label}: duplicate requirement id")
        ids.add(req_id)
        if item.get("status") not in REQUIREMENT_STATUSES:
            errors.append(f"{label}: status must be one of {sorted(REQUIREMENT_STATUSES)}")
        statement = item.get("statement")
        if not isinstance(statement, str) or not statement.strip():
            errors.append(f"{label}: statement is required")
        elif not re.search(r"\b(MUST|MUST NOT|SHOULD|MAY)\b", statement):
            errors.append(f"{label}: statement must use a BCP 14 keyword")
        source = item.get("source")
        if not isinstance(source, str) or not source.startswith("docs/"):
            errors.append(f"{label}: source must be a docs/ reference")
        else:
            errors.extend(validate_source_reference(source, root, label))
        for field in ("implementation", "verification", "ci_gates"):
            values = item.get(field)
            if not isinstance(values, list) or not values or not all(
                isinstance(value, str) and value.strip() for value in values
            ):
                errors.append(f"{label}: {field} must be a non-empty string array")
                continue
            if field != "ci_gates":
                for value in values:
                    relative, _ = split_reference(value)
                    if not (root / relative).exists():
                        errors.append(f"{label}: {field} evidence does not exist: {value}")
    return errors, ids


def workflow_inventory(root: Path) -> tuple[dict[str, set[str]], list[str]]:
    inventory: dict[str, set[str]] = {}
    errors: list[str] = []
    workflow_dir = root / ".github" / "workflows"
    for path in sorted((*workflow_dir.glob("*.yml"), *workflow_dir.glob("*.yaml"))):
        text = path.read_text(encoding="utf-8")
        name_match = re.search(r"^name:\s*(.+?)\s*$", text, re.MULTILINE)
        if not name_match:
            errors.append(f"{path.relative_to(root)}: missing workflow name")
            continue
        workflow_name = name_match.group(1).strip("\"'")
        job_names = {
            match.group(1).strip("\"'")
            for match in re.finditer(r"^    name:\s*(.+?)\s*$", text, re.MULTILINE)
        }
        inventory[workflow_name] = job_names
    return inventory, errors


def validate_ci_gate_references(data: dict[str, Any], root: Path) -> list[str]:
    inventory, errors = workflow_inventory(root)
    for item in data.get("requirements", []):
        if not isinstance(item, dict):
            continue
        for gate in item.get("ci_gates", []):
            workflow, separator, job = gate.partition(" / ")
            if workflow not in inventory:
                errors.append(f"{item.get('id')}: unknown CI workflow: {workflow}")
            elif separator and job not in inventory[workflow]:
                errors.append(f"{item.get('id')}: unknown job in {workflow}: {job}")
    return errors


def validate_rfc(path: Path, known_ids: set[str], root: Path) -> list[str]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    relative = path.relative_to(root)
    metadata: dict[str, str] = {}
    for match in re.finditer(r"^-\s+(Status|Authors|Created|Target|Requirements):\s+(.+?)\s*$", text, re.MULTILINE):
        metadata[match.group(1)] = match.group(2)
    for key in ("Status", "Authors", "Created", "Target", "Requirements"):
        if key not in metadata:
            errors.append(f"{relative}: missing {key} metadata")
    if metadata.get("Status") not in RFC_STATUSES:
        errors.append(f"{relative}: invalid RFC status {metadata.get('Status')!r}")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", metadata.get("Created", "")):
        errors.append(f"{relative}: Created must use YYYY-MM-DD")
    headings = {
        match.group(1).strip()
        for match in re.finditer(r"^##\s+(.+?)\s*$", text, re.MULTILINE)
    }
    for section in REQUIRED_RFC_SECTIONS:
        if section not in headings:
            errors.append(f"{relative}: missing section ## {section}")
    referenced = set(re.findall(r"`(SOL-[A-Z]+-\d{3})`", metadata.get("Requirements", "")))
    if not referenced:
        errors.append(f"{relative}: Requirements metadata must reference at least one SOL-* id")
    for req_id in sorted(referenced - known_ids):
        errors.append(f"{relative}: references unknown requirement {req_id}")
    return errors


def validate_action_pins(path: Path, text: str, root: Path) -> list[str]:
    errors: list[str] = []
    relative = path.relative_to(root)
    if "permissions:" not in text:
        errors.append(f"{relative}: workflow must declare permissions")
    if re.search(r"^\s*permissions:\s+write-all\s*$", text, re.MULTILINE):
        errors.append(f"{relative}: write-all permissions are forbidden")
    for action, ref in ACTION_USE.findall(text):
        if not re.fullmatch(r"[0-9a-fA-F]{40}", ref):
            errors.append(f"{relative}: {action}@{ref} is not pinned to a full commit SHA")
    return errors


def require_tokens(relative: str, text: str, tokens: tuple[str, ...]) -> list[str]:
    return [f"{relative}: missing release contract token {token!r}" for token in tokens if token not in text]


def validate_workflows(root: Path) -> list[str]:
    errors: list[str] = []
    workflow_dir = root / ".github" / "workflows"
    for path in sorted(workflow_dir.glob("*.yml")):
        errors.extend(validate_action_pins(path, path.read_text(encoding="utf-8"), root))

    ci = (workflow_dir / "ci.yml").read_text(encoding="utf-8")
    errors.extend(require_tokens(".github/workflows/ci.yml", ci, (
        "Governance and specification contracts",
        "python tools/validate_sdlc.py",
        "python tools/validate_docs.py",
        "python tools/validate_ux_contract.py",
        "python tools/browser_smoke.py",
        "node tools/browser_validation.mjs",
        "python tools/build_wasm.py",
    )))

    coverage = (workflow_dir / "coverage.yml").read_text(encoding="utf-8")
    errors.extend(require_tokens(".github/workflows/coverage.yml", coverage, (
        "--fail-under-lines 90",
        "--test-coverage-lines=90",
        "--test-coverage-branches=90",
        "--test-coverage-functions=90",
        "--minimum-lines=90",
        "--fail-under=90",
        "node tools/browser_validation.mjs",
        "tools/validate_sdlc.py",
        "tools/validate_ux_contract.py",
        "if: always()",
    )))

    deploy = (workflow_dir / "deploy-pages.yml").read_text(encoding="utf-8")
    errors.extend(require_tokens(".github/workflows/deploy-pages.yml", deploy, (
        'workflows: ["CI"]',
        "github.event.workflow_run.conclusion == 'success'",
        "github.event.workflow_run.head_branch == 'master'",
        "github.event.workflow_run.head_sha",
        "environment:",
        "name: github-pages",
    )))

    docs = (workflow_dir / "docs.yml").read_text(encoding="utf-8")
    errors.extend(require_tokens(".github/workflows/docs.yml", docs, (
        "python tools/validate_docs.py",
        "python tools/validate_sdlc.py",
    )))

    dependabot = (root / ".github" / "dependabot.yml").read_text(encoding="utf-8")
    errors.extend(require_tokens(".github/dependabot.yml", dependabot, (
        "package-ecosystem: cargo",
        "package-ecosystem: npm",
        "package-ecosystem: github-actions",
        "interval: weekly",
    )))
    return errors


def validate(root: Path) -> list[str]:
    errors = [
        f"missing required SDLC artifact: {relative}"
        for relative in REQUIRED_DOCS
        if not (root / relative).is_file()
    ]
    requirements_path = root / "docs" / "requirements.json"
    if not requirements_path.is_file():
        return errors
    try:
        data = json.loads(requirements_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        return [*errors, f"docs/requirements.json: {exc}"]

    requirement_errors, known_ids = validate_requirements_data(data, root)
    errors.extend(requirement_errors)
    errors.extend(validate_ci_gate_references(data, root))

    requirements_doc = (root / "docs" / "REQUIREMENTS.md").read_text(encoding="utf-8")
    for req_id in sorted(known_ids):
        if requirements_doc.count(f"`{req_id}`") != 1:
            errors.append(f"docs/REQUIREMENTS.md: {req_id} must appear exactly once in the catalogue")

    rfc_dir = root / "docs" / "rfcs"
    for path in sorted(rfc_dir.glob("*.md")):
        if path.name in {"README.md", "0000-template.md"}:
            continue
        if not RFC_FILE.fullmatch(path.name):
            errors.append(f"{path.relative_to(root)}: RFC filename must be NNNN-lowercase-slug.md")
            continue
        errors.extend(validate_rfc(path, known_ids, root))

    errors.extend(validate_workflows(root))
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    errors = validate(root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"\n{len(errors)} SDLC contract problem(s).", file=sys.stderr)
        return 1
    count = len(json.loads((root / "docs" / "requirements.json").read_text(encoding="utf-8"))["requirements"])
    print(f"OK: SDLC, {count} requirements, RFCs, evidence paths, and workflows validate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
