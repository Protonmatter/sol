#!/usr/bin/env python3
"""Minimal, dependency-free JSON Schema validator (Python stdlib only).

Supports exactly the JSON Schema keywords the Solar Maximum Engine contract
schemas use: ``type``, ``const``, ``enum``, ``required``, ``properties``,
``additionalProperties``, array/string lengths, numeric bounds, boolean schemas,
conditionals/combinators, and local ``$ref`` into ``$defs``. Unknown keywords are
rejected even in unused branches; all input numbers must be finite.

It exists because the project is deliberately dependency-free — the CI runners
install no pip packages — so the standard ``jsonschema`` library is unavailable.
This is NOT a complete JSON Schema implementation; it validates only the subset
the schemas exercise. Keep the schemas within that subset (or extend this file
in lock-step).
"""

from __future__ import annotations

from typing import Any
import math

_KEYWORDS = {
    "$schema", "$id", "$defs", "$ref", "title", "description", "$comment",
    "type", "const", "enum", "required", "properties", "additionalProperties",
    "items", "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum",
    "exclusiveMinimum", "exclusiveMaximum", "if", "then", "else", "allOf", "anyOf", "oneOf", "not",
}

_TYPE_CHECKS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
    # bool is a subclass of int in Python; exclude it so True is not an integer/number.
    "integer": lambda v: not isinstance(v, bool) and (
        isinstance(v, int) or isinstance(v, float) and math.isfinite(v) and v.is_integer()),
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


def _schema_errors(schema: Any, path: str = "$schema") -> list[str]:
    if isinstance(schema, bool):
        return []
    if not isinstance(schema, dict):
        return [f"{path}: invalid schema (expected object or boolean)"]
    errors = [f"{path}: unsupported schema keyword {key}" for key in sorted(set(schema) - _KEYWORDS)]
    for key in ("$defs", "properties"):
        for name, child in schema.get(key, {}).items():
            errors += _schema_errors(child, f"{path}.{key}.{name}")
    for key in ("items", "additionalProperties", "if", "then", "else", "not"):
        if key in schema:
            errors += _schema_errors(schema[key], f"{path}.{key}")
    for key in ("allOf", "anyOf", "oneOf"):
        for index, child in enumerate(schema.get(key, [])):
            errors += _schema_errors(child, f"{path}.{key}[{index}]")
    return errors


def _finite_tree(value: Any, path: str) -> list[str]:
    if isinstance(value, float) and not math.isfinite(value):
        return [f"{path}: number must be finite"]
    if isinstance(value, dict):
        return [error for key, child in value.items() for error in _finite_tree(child, f"{path}.{key}")]
    if isinstance(value, list):
        return [error for index, child in enumerate(value) for error in _finite_tree(child, f"{path}[{index}]")]
    return []


def validate(instance: Any, schema: Any, root: dict[str, Any] | None = None, path: str = "$") -> list[str]:
    """Return a list of human-readable error strings (empty when valid)."""
    if root is None:
        root = schema
        preflight = _schema_errors(schema) + _finite_tree(instance, path)
        if preflight:
            return preflight
    errors: list[str] = []
    if isinstance(schema, bool):
        return [] if schema else [f"{path}: false schema rejects value"]
    if not isinstance(schema, dict):
        return [f"{path}: invalid schema (expected object or boolean)"]
    unsupported = set(schema) - _KEYWORDS
    if unsupported:
        return [f"{path}: unsupported schema keyword {key}" for key in sorted(unsupported)]

    if "$ref" in schema:
        target = _resolve_ref(schema["$ref"], root)
        if target is None:
            return [f"{path}: unresolved $ref {schema['$ref']!r}"]
        errors += validate(instance, target, root, path)

    if isinstance(instance, float) and not math.isfinite(instance):
        return [f"{path}: number must be finite"]

    if "if" in schema:
        branch = "else" if validate(instance, schema["if"], root, path) else "then"
        if branch in schema:
            errors += validate(instance, schema[branch], root, path)
    for keyword in ("allOf", "anyOf", "oneOf"):
        if keyword in schema:
            results = [validate(instance, child, root, path) for child in schema[keyword]]
            matches = sum(not result for result in results)
            if (keyword == "allOf" and matches != len(results)
                    or keyword == "anyOf" and matches == 0
                    or keyword == "oneOf" and matches != 1):
                errors.append(f"{path}: {keyword} failed")
    if "not" in schema and not validate(instance, schema["not"], root, path):
        errors.append(f"{path}: not schema matched")

    if "const" in schema and not _json_equal(instance, schema["const"]):
        errors.append(f"{path}: must equal {_short(schema['const'])}, got {_short(instance)}")

    if "enum" in schema and not any(_json_equal(instance, option) for option in schema["enum"]):
        errors.append(f"{path}: {_short(instance)} is not one of {schema['enum']}")

    types = schema.get("type")
    if types is not None:
        type_list = [types] if isinstance(types, str) else list(types)
        if any(t not in _TYPE_CHECKS for t in type_list):
            return [f"{path}: unsupported schema type {types}"]
        if not any(_TYPE_CHECKS[t](instance) for t in type_list):
            errors.append(f"{path}: expected type {'|'.join(type_list)}, got {_type_name(instance)}")
            # Type mismatch makes the structural checks below meaningless.
            return errors

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        for keyword, invalid in (
            ("minimum", lambda n, b: n < b), ("maximum", lambda n, b: n > b),
            ("exclusiveMinimum", lambda n, b: n <= b), ("exclusiveMaximum", lambda n, b: n >= b),
        ):
            if keyword in schema and invalid(instance, schema[keyword]):
                errors.append(f"{path}: violates {keyword} {schema[keyword]}")
    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            errors.append(f"{path}: shorter than minLength {schema['minLength']}")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            errors.append(f"{path}: longer than maxLength {schema['maxLength']}")

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
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            errors.append(f"{path}: exceeds maxItems {schema['maxItems']}")
        item_schema = schema.get("items")
        if isinstance(item_schema, (dict, bool)):
            for index, item in enumerate(instance):
                errors += validate(item, item_schema, root, f"{path}[{index}]")

    return errors
