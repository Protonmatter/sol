#!/usr/bin/env python3
"""Static checks for the Solar Maximum Engine no-build web app."""

from __future__ import annotations

import argparse
import logging
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

LOGGER = logging.getLogger("validate_web_static")

REQUIRED_IDS = {
    "solarCanvas",
    "stageRail",
    "baseLabel",
    "termTip",
    "plainInsight",
    "summaryPrimary",
    "summaryDetail",
    "dataState",
    "ingestState",
    "readinessState",
    "layerLegend",
    "modeTitle",
    "applicationTitle",
    "applicationText",
    "applicationSignals",
    "selectionTitle",
    "selectionText",
    "feedHealth",
    "sourceAnchors",
    "operationalReadiness",
    "butterflyCanvas",
}


class WebAppParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.asset_refs: list[str] = []
        self.open_research_panel = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value for key, value in attrs}
        element_id = values.get("id")
        if element_id:
            self.ids.add(element_id)
        if tag == "link" and values.get("href"):
            self.asset_refs.append(values["href"] or "")
        if tag == "script" and values.get("src"):
            self.asset_refs.append(values["src"] or "")
        if tag == "details" and values.get("class") == "research-panel" and "open" in values:
            self.open_research_panel = True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="apps/web")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    root = Path(args.root)
    errors = validate(root)
    if errors:
        for error in errors:
            LOGGER.error("%s", error)
        return 1
    LOGGER.info("%s passed static web checks", root)
    return 0


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    index = root / "index.html"
    if not index.is_file():
        return [f"{index} not found"]
    parser = WebAppParser()
    parser.feed(index.read_text(encoding="utf-8"))
    missing_ids = sorted(REQUIRED_IDS.difference(parser.ids))
    if missing_ids:
        errors.append(f"index.html missing ids: {', '.join(missing_ids)}")
    if parser.open_research_panel:
        errors.append("research panel must be hidden by default")
    for ref in parser.asset_refs:
        path_part = urlsplit(ref).path
        if path_part and not (root / path_part).is_file():
            errors.append(f"missing asset referenced by index.html: {ref}")
    css = root / "styles.css"
    js = root / "app.js"
    if not css.is_file():
        errors.append("styles.css not found")
    elif "@media (max-width: 880px)" not in css.read_text(encoding="utf-8"):
        errors.append("styles.css must keep a responsive max-width: 880px breakpoint")
    if not js.is_file():
        errors.append("app.js not found")
    else:
        js_text = js.read_text(encoding="utf-8")
        for token in ("operational_readiness", "summaryPrimary", "layerLegend", "applicationTitle", "readinessChecklistItems", "butterflyCanvas"):
            if token not in js_text:
                errors.append(f"app.js missing {token} binding")
    return errors


if __name__ == "__main__":
    raise SystemExit(main())
