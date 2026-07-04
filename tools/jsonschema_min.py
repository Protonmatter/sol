#!/usr/bin/env python3
"""Minimal, dependency-free JSON Schema validator (Python stdlib only).

Supports exactly the JSON Schema keywords the Solar Maximum Engine contract
schemas use: ``type``, ``const``, ``enum``, ``required``, ``properties``,
``additionalProperties``, ``items``, ``minItems``, and local ``$ref`` into
``$defs`` (JSON-pointer within the same document).

It exists because the project is deliberately dependency-free — the CI runners
install no pip packages — so the standard ``jsonschema`` library is unavailable.
This is NOT a complete JSON Schema implementation; it validates only the subset
the schemas exercise. Keep the schemas within that subset (or extend this file
in lock-step).
"""

from __future__ import annotations

from typing import Any

_TYPE_CHECKS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
    # bool is a subclass of int in Python; exclude it so True is not an integer/number.
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
}


def _type_name(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    if value is None:
        return "null"
    return type(value).__name__


def _short(value: Any) -> str:
    text = repr(value)
    return text if len(text) <= 60 else text[:57] + "..."


def _json_equal(a: Any, b: Any) -> bool:
    """Bool-aware equality: JSON distinguishes true/false from 1/0, but Python's
    ``1 == True`` is truthy, so compare booleans strictly by type."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    return a == b


def _resolve_ref(ref: str, root: dict[str, Any]) -> Any:
    if not ref.startswith("#"):
        return None
    node: Any = root
    for part in ref.lstrip("#").split("/"):
        if not part:
            continue
        part = part.replace("~1", "/").replace("~0", "~")
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return None
    return node


def validate(instance: Any, schema: Any, root: dict[str, Any] | None = None, path: str = "$") -> list[str]:
    """Return a list of human-readable error strings (empty when valid)."""
    if root is None:
        root = schema
    errors: list[str] = []
    if not isinstance(schema, dict):
        return errors

    if "$ref" in schema:
        target = _resolve_ref(schema["$ref"], root)
        if target is None:
            return [f"{path}: unresolved $ref {schema['$ref']!r}"]
        return validate(instance, target, root, path)

    if "const" in schema and not _json_equal(instance, schema["const"]):
        errors.append(f"{path}: must equal {_short(schema['const'])}, got {_short(instance)}")

    if "enum" in schema and not any(_json_equal(instance, option) for option in schema["enum"]):
        errors.append(f"{path}: {_short(instance)} is not one of {schema['enum']}")

    types = schema.get("type")
    if types is not None:
        type_list = [types] if isinstance(types, str) else list(types)
        if not any(_TYPE_CHECKS.get(t, lambda v: True)(instance) for t in type_list):
            errors.append(f"{path}: expected type {'|'.join(type_list)}, got {_type_name(instance)}")
            # Type mismatch makes the structural checks below meaningless.
            return errors

    if isinstance(instance, dict):
        properties = schema.get("properties", {})
        for required in schema.get("required", []):
            if required not in instance:
                errors.append(f"{path}: missing required property '{required}'")
        additional = schema.get("additionalProperties", True)
        for key in sorted(instance):
            child_path = f"{path}.{key}"
            if key in properties:
                errors += validate(instance[key], properties[key], root, child_path)
            elif additional is False:
                errors.append(f"{path}: unexpected property '{key}'")
            elif isinstance(additional, dict):
                errors += validate(instance[key], additional, root, child_path)

    if isinstance(instance, list):
        min_items = schema.get("minItems")
        if isinstance(min_items, int) and len(instance) < min_items:
            errors.append(f"{path}: expected at least {min_items} item(s), got {len(instance)}")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(instance):
                errors += validate(item, item_schema, root, f"{path}[{index}]")

    return errors
