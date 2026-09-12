"""Fixed-clock freshness bounds, including the unrounded one-second edges."""
from __future__ import annotations

import copy
import datetime as dt
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import generate_fixture_snapshot as generate


class FutureFreshnessTests(unittest.TestCase):
    def candidate(self, age_seconds: int, feed: str = "swpc-f107-cm-flux") -> dict:
        now = dt.datetime(2026, 9, 12, tzinfo=dt.timezone.utc)
        stamp = now - dt.timedelta(seconds=age_seconds)
        row = {"time_tag": stamp.isoformat().replace("+00:00", "Z"),
               "source": "synthetic test observatory", "flux": 150}
        return {"id": feed, "source_mode": "cached", "data": [row],
                "evaluated_at_utc": "2026-09-12T00:00:00Z"}

    def test_freshness_uses_unrounded_two_sided_limits_for_each_feed(self):
        for feed, hours in {**generate.FRESHNESS_LIMITS_HOURS, "unknown-feed": 48}.items():
            limit = int(hours * 3600)
            for age, expected in ((-3600, True), (-1, True), (0, False),
                                  (1, False), (limit, False), (limit + 1, True)):
                with self.subTest(feed=feed, age=age):
                    candidate = self.candidate(age, feed)
                    before = copy.deepcopy(candidate)
                    report, warnings = generate.evaluate_freshness([candidate])
                    self.assertIs(report[feed]["stale"], expected)
                    self.assertEqual(bool(warnings), expected)
                    self.assertEqual(report[feed]["age_hours"], round(age / 3600, 1))
                    self.assertEqual(candidate, before, "captured source must not be rewritten")
                    if age < 0:
                        self.assertIn("future", warnings[0])

    def test_selected_future_value_stays_visible_but_is_stale_and_warned_in_snapshot(self):
        candidate = self.candidate(-1)
        candidate["freshness_rows"] = copy.deepcopy(candidate["data"])
        # A different row cannot relabel the selected future value as fresh.
        candidate["data"].append({"time_tag": "2026-09-12T00:00:00Z", "flux": 80})
        context = generate.build_observed_context([candidate])
        self.assertTrue(context["signal_freshness"][candidate["id"]]["stale"])
        self.assertEqual(context["space_weather_signals"]["latest_f107"], 150)
        self.assertIn("future", context["stale_feeds"][0])
        report = {"source_mode": "cached", "frames": [], "observed_context": context}
        snapshot = generate.build_snapshot(42, 12, 6, report)
        self.assertEqual(snapshot["run"]["mode"], "SyntheticFixture")
        self.assertTrue(any("future" in warning for warning in snapshot["warnings"]))

    def test_fixture_rows_are_not_reclassified_by_wall_clock(self):
        candidate = self.candidate(-3600)
        candidate["source_mode"] = "fixture"
        self.assertEqual(generate.evaluate_freshness([candidate]), ({}, []))

    def test_native_invalid_offset_timestamps_do_not_supply_freshness(self):
        for stamp in (
            "2026-09-12T01:00:00+01:00",
            "2026-09-11T19:00:00-05:00",
            "2026-09-12T00:00:00-00:00",
        ):
            with self.subTest(stamp=stamp):
                candidate = self.candidate(0)
                candidate["data"][0]["time_tag"] = stamp
                before = copy.deepcopy(candidate)
                report, warnings = generate.evaluate_freshness([candidate])
                self.assertEqual(report, {})
                self.assertEqual(warnings, [])
                self.assertEqual(candidate, before, "captured source must not be rewritten")


if __name__ == "__main__":
    unittest.main()
