from __future__ import annotations

import contextlib
import io
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps" / "web"
sys.path.insert(0, str(ROOT / "tools"))

import validate_ux_contract


class UxContractTests(unittest.TestCase):
    def test_repository_contract_passes(self) -> None:
        self.assertEqual(validate_ux_contract.validate(WEB), [])

    def _copy_web_contract(self, target: Path) -> None:
        target.mkdir()
        shutil.copy2(WEB / "index.html", target / "index.html")
        shutil.copy2(WEB / "styles.css", target / "styles.css")
        shutil.copy2(WEB / "app.js", target / "app.js")
        shutil.copytree(WEB / "js", target / "js")

    def test_research_open_by_default_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "web"
            self._copy_web_contract(target)
            index = (target / "index.html").read_text(encoding="utf-8")
            index = index.replace(
                '<details class="sun-section" id="sunResearch">',
                '<details class="sun-section" id="sunResearch" open>',
            )
            (target / "index.html").write_text(index, encoding="utf-8")
            errors = validate_ux_contract.validate(target)
            self.assertTrue(any("#sunResearch must be closed" in error for error in errors))

    def test_unlabelled_canvas_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "web"
            self._copy_web_contract(target)
            index = (target / "index.html").read_text(encoding="utf-8")
            index = index.replace(
                'id="solarCanvas" width="900" height="900" aria-label="Solar disk rendering"',
                'id="solarCanvas" width="900" height="900"',
            )
            (target / "index.html").write_text(index, encoding="utf-8")
            errors = validate_ux_contract.validate(target)
            self.assertTrue(any("every canvas must have" in error for error in errors))

    def test_missing_files_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            errors = validate_ux_contract.validate(Path(temp))
            self.assertEqual(len(errors), 3)
            self.assertTrue(all("not found" in error for error in errors))

    def test_destination_state_is_enforced(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "web"
            self._copy_web_contract(target)
            index = (target / "index.html").read_text(encoding="utf-8")
            index = index.replace('data-mode="today" aria-pressed="true"', 'data-mode="today" aria-pressed="false"')
            index = index.replace('data-mode="sky" aria-pressed="false"', 'data-mode="sky" aria-pressed="true"')
            (target / "index.html").write_text(index, encoding="utf-8")
            errors = validate_ux_contract.validate(target)
            self.assertTrue(any("The Sun must be" in error for error in errors))
            self.assertTrue(any("sky must not be" in error for error in errors))

            index = index.replace('data-mode="orrery"', 'data-mode="other"')
            (target / "index.html").write_text(index, encoding="utf-8")
            errors = validate_ux_contract.validate(target)
            self.assertTrue(any("exactly today, sky, and orrery" in error for error in errors))

    def test_parser_detects_hidden_primary_and_excessive_nesting(self) -> None:
        parser = validate_ux_contract.UXParser()
        parser.feed(
            "<details><summary>One</summary><details><summary>Two</summary>"
            "<details><summary>Three</summary><section class='summary-panel'>x</section>"
            "</details></details></details>"
        )
        self.assertEqual(parser.summary_panel_detail_depth, 3)
        self.assertEqual(parser.max_detail_depth, 3)

    def test_comprehensive_accessibility_regressions_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "web"
            self._copy_web_contract(target)
            index_path = target / "index.html"
            index = index_path.read_text(encoding="utf-8")
            replacements = (
                ('id="plainInsight"', 'id="plainInsightMissing"'),
                ('id="baseLabel" class="base-label" aria-live="polite"', 'id="baseLabel" class="base-label"'),
                ('id="skyTimeLabel"', 'id="skyTimeLabelMissing"'),
                ('id="sunInside"', 'id="sunInsideMissing"'),
                ("<summary>Inside the Sun — its layers</summary>", "<summary></summary>"),
                ("<summary>What it means for Earth</summary>", "<summary>More</summary>"),
                ('<details class="orrery-group">\n                <summary>Overlays</summary>',
                 '<details class="orrery-group" open>\n                <summary>Overlays</summary>'),
                ('id="regionList"', 'id="regionListMissing"'),
                ('role="dialog" aria-modal="true" aria-labelledby="tourTitle"', 'role="region"'),
                ('id="panelToggle" class="panel-toggle" type="button" aria-label="Collapse the control panel" aria-expanded="true"',
                 'id="panelToggle" class="panel-toggle" type="button" aria-label="Collapse the control panel" aria-expanded="false"'),
                ("</body>", '<button id="unnamed"></button></body>'),
            )
            for old, new in replacements:
                self.assertIn(old, index)
                index = index.replace(old, new, 1)
            index_path.write_text(index, encoding="utf-8")

            css_path = target / "styles.css"
            css = css_path.read_text(encoding="utf-8")
            css = css.replace(":focus-visible", ":focus-regressed")
            css = css.replace("prefers-reduced-motion", "motion-regressed")
            css = css.replace("@media (max-width: 880px)", "@media (max-width: 879px)")
            css_path.write_text(css, encoding="utf-8")

            app_path = target / "app.js"
            app_path.write_text(
                app_path.read_text(encoding="utf-8").replace(
                    'setAttribute("aria-expanded"', 'setAttribute("expanded-regressed"'
                ),
                encoding="utf-8",
            )
            for module_path in (target / "js").glob("*.js"):
                module_path.write_text(
                    module_path.read_text(encoding="utf-8").replace(
                        'setAttribute("aria-pressed"', 'setAttribute("pressed-regressed"'
                    ),
                    encoding="utf-8",
                )

            joined = "\n".join(validate_ux_contract.validate(target))
            for expected in (
                "missing essential UX ids",
                "#baseLabel must declare aria-live",
                "missing dynamic status #skyTimeLabel",
                "missing native disclosure #sunInside",
                "non-empty summary",
                "lacks information scent",
                "'Overlays' must be closed",
                "textual alternative #regionList",
                "interactive control #unnamed",
                "labelled modal dialog",
                "initially expanded state",
                "visible keyboard-focus",
                "respect reduced motion",
                "responsive breakpoint",
                "update aria-expanded",
                "update aria-pressed",
            ):
                self.assertIn(expected, joined)

    def test_solar_system_disclosure_and_primary_location_are_enforced(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "web"
            self._copy_web_contract(target)
            index_path = target / "index.html"
            index = index_path.read_text(encoding="utf-8")
            index = index.replace("<summary>Camera &amp; motion</summary>", "<summary>Camera controls</summary>")
            index = index.replace(
                '<section class="summary-panel" aria-label="Snapshot summary">',
                '<details><summary>Hidden status</summary><section class="summary-panel" aria-label="Snapshot summary">',
            )
            index = index.replace("</section>\n\n          <nav class=\"mode-nav\"", "</section></details>\n\n          <nav class=\"mode-nav\"", 1)
            index_path.write_text(index, encoding="utf-8")
            joined = "\n".join(validate_ux_contract.validate(target))
            self.assertIn("primary status summary must not be hidden", joined)
            self.assertIn("missing Solar System disclosure 'Camera & motion'", joined)

    def test_main_success_and_error_exit_codes(self) -> None:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            with mock.patch.object(sys, "argv", ["validate_ux_contract.py", "--root", str(WEB)]):
                self.assertEqual(validate_ux_contract.main(), 0)
            with tempfile.TemporaryDirectory() as temp:
                with mock.patch.object(sys, "argv", ["validate_ux_contract.py", "--root", temp]):
                    self.assertEqual(validate_ux_contract.main(), 1)


if __name__ == "__main__":
    unittest.main()
