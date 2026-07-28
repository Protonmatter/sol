#!/usr/bin/env python3
"""Validate the static, accessible progressive-disclosure contract for Sol."""

from __future__ import annotations

import argparse
import logging
from html.parser import HTMLParser
from pathlib import Path

LOGGER = logging.getLogger("validate_ux_contract")

ESSENTIAL_IDS = {
    "plainInsight",
    "summaryPrimary",
    "dataState",
    "ingestState",
    "readinessState",
    "solarCanvas",
    "skyCanvas",
    "orreryCanvas",
    "regionList",
    "skyList",
    "orreryPositions",
    "tourCard",
    "panelToggle",
}

DYNAMIC_STATUS_IDS = {
    "baseLabel",
    "skyInsight",
    "skyLocLabel",
    "skyTimeLabel",
    "skyProvenance",
    "orreryInsight",
    "orreryDetail",
    "liveStatus",
}


class UXParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: dict[str, dict[str, str]] = {}
        self.modes: list[dict[str, str]] = []
        self.details: list[dict[str, object]] = []
        self.canvases: list[dict[str, str]] = []
        self.controls: list[dict[str, object]] = []
        self.stack: list[tuple[str, dict[str, str]]] = []
        self.current_detail: dict[str, object] | None = None
        self.current_summary: list[str] | None = None
        self.current_control: dict[str, object] | None = None
        self.max_detail_depth = 0
        self.summary_panel_detail_depth: int | None = None

    @property
    def detail_depth(self) -> int:
        return sum(1 for tag, _ in self.stack if tag == "details")

    @property
    def inside_label(self) -> bool:
        return any(tag == "label" for tag, _ in self.stack)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        self.stack.append((tag, values))
        element_id = values.get("id")
        if element_id:
            self.ids[element_id] = values
        classes = set(values.get("class", "").split())
        if "summary-panel" in classes:
            self.summary_panel_detail_depth = self.detail_depth
        if tag == "button" and "mode-button" in classes:
            self.modes.append(values)
        if tag == "canvas":
            self.canvases.append(values)
        if tag == "details":
            self.max_detail_depth = max(self.max_detail_depth, self.detail_depth)
            self.current_detail = {
                "attrs": values,
                "summary": "",
                "depth": self.detail_depth,
            }
            self.details.append(self.current_detail)
        elif tag == "summary" and self.current_detail is not None:
            self.current_summary = []
        if tag in {"button", "select", "textarea"} or (
            tag == "input" and values.get("type", "text") != "hidden"
        ):
            self.current_control = {
                "tag": tag,
                "attrs": values,
                "text": [],
                "inside_label": self.inside_label,
            }
            self.controls.append(self.current_control)

    def handle_data(self, data: str) -> None:
        if self.current_summary is not None:
            self.current_summary.append(data)
        if self.current_control is not None:
            self.current_control["text"].append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "summary" and self.current_summary is not None and self.current_detail is not None:
            self.current_detail["summary"] = " ".join("".join(self.current_summary).split())
            self.current_summary = None
        if tag in {"button", "select", "textarea", "input"}:
            self.current_control = None
        if tag == "details":
            self.current_detail = next(
                (
                    detail for detail in reversed(self.details[:-1])
                    if int(detail["depth"]) < self.detail_depth
                ),
                None,
            )
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break


def is_open(attrs: dict[str, str]) -> bool:
    return "open" in attrs


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    index = root / "index.html"
    css_path = root / "styles.css"
    app_path = root / "app.js"
    for path in (index, css_path, app_path):
        if not path.is_file():
            errors.append(f"{path} not found")
    if errors:
        return errors

    parser = UXParser()
    parser.feed(index.read_text(encoding="utf-8"))

    missing = sorted(ESSENTIAL_IDS - parser.ids.keys())
    if missing:
        errors.append(f"missing essential UX ids: {', '.join(missing)}")
    for status_id in sorted(DYNAMIC_STATUS_IDS):
        attrs = parser.ids.get(status_id)
        if attrs is None:
            errors.append(f"missing dynamic status #{status_id}")
        elif attrs.get("aria-live") not in {"polite", "assertive"}:
            errors.append(f"dynamic status #{status_id} must declare aria-live")

    modes = {item.get("data-mode"): item for item in parser.modes}
    if set(modes) != {"today", "sky", "orrery"}:
        errors.append("destination group must contain exactly today, sky, and orrery modes")
    else:
        if modes["today"].get("aria-pressed") != "true":
            errors.append("The Sun must be the initially selected destination")
        for mode in ("sky", "orrery"):
            if modes[mode].get("aria-pressed") != "false":
                errors.append(f"{mode} must not be initially selected")

    if parser.summary_panel_detail_depth != 0:
        errors.append("the primary status summary must not be hidden inside a disclosure")
    if parser.max_detail_depth > 2:
        errors.append("normal workflows must not exceed two disclosure levels")

    details_by_id = {
        str(item["attrs"].get("id")): item
        for item in parser.details
        if item["attrs"].get("id")
    }
    expected = {
        "sunInside": False,
        "sunExplore": True,
        "sunWeather": False,
        "sunResearch": False,
    }
    for element_id, open_by_default in expected.items():
        item = details_by_id.get(element_id)
        if item is None:
            errors.append(f"missing native disclosure #{element_id}")
        elif is_open(item["attrs"]) != open_by_default:
            state = "open" if open_by_default else "closed"
            errors.append(f"#{element_id} must be {state} by default")
    for item in parser.details:
        summary = str(item["summary"]).strip()
        if not summary:
            errors.append("every details element must have a non-empty summary")
        if summary.lower() in {"more", "advanced", "details"}:
            errors.append(f"disclosure label lacks information scent: {summary!r}")
    summary_open = {str(item["summary"]): is_open(item["attrs"]) for item in parser.details}
    for label, expected_open in {
        "View": True,
        "Overlays": False,
        "Camera & motion": False,
    }.items():
        if label not in summary_open:
            errors.append(f"missing Solar System disclosure {label!r}")
        elif summary_open[label] != expected_open:
            state = "open" if expected_open else "closed"
            errors.append(f"Solar System disclosure {label!r} must be {state} by default")

    for canvas in parser.canvases:
        if not canvas.get("id") or not canvas.get("aria-label"):
            errors.append("every canvas must have an id and descriptive aria-label")
    for alternative in ("regionList", "skyList", "orreryPositions"):
        if alternative not in parser.ids:
            errors.append(f"canvas information needs textual alternative #{alternative}")

    for control in parser.controls:
        attrs = control["attrs"]
        text = " ".join("".join(control["text"]).split())
        named = bool(
            attrs.get("aria-label")
            or attrs.get("aria-labelledby")
            or attrs.get("title")
            or text
            or control["inside_label"]
        )
        if not named:
            element = f"#{attrs.get('id')}" if attrs.get("id") else str(control["tag"])
            errors.append(f"interactive control {element} has no accessible name")

    tour = parser.ids.get("tourCard", {})
    if tour.get("role") != "dialog" or tour.get("aria-modal") != "true" or not tour.get("aria-labelledby"):
        errors.append("#tourCard must be a labelled modal dialog")
    panel = parser.ids.get("panelToggle", {})
    if panel.get("aria-expanded") != "true":
        errors.append("#panelToggle must expose its initially expanded state")

    css = css_path.read_text(encoding="utf-8")
    for token, message in (
        (":focus-visible", "styles must provide a visible keyboard-focus rule"),
        ("prefers-reduced-motion", "styles must respect reduced motion"),
        ("@media (max-width: 880px)", "styles must retain the responsive breakpoint"),
    ):
        if token not in css:
            errors.append(message)

    js = app_path.read_text(encoding="utf-8")
    if 'setAttribute("aria-expanded"' not in js:
        errors.append("panel collapse must update aria-expanded at runtime")
    module_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((root / "js").glob("*.js"))
    )
    if 'setAttribute("aria-pressed"' not in module_text:
        errors.append("destination changes must update aria-pressed at runtime")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="apps/web")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    errors = validate(Path(args.root))
    if errors:
        for error in errors:
            LOGGER.error("%s", error)
        return 1
    LOGGER.info("%s passed progressive-disclosure and accessibility structure checks", args.root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
