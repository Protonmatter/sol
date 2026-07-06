#!/usr/bin/env python3
from pathlib import Path

path = Path("tools/validate_ephemeris.py")
text = path.read_text(encoding="utf-8")
start = text.index("def main() -> int:")
end = text.index('\n\nif __name__ == "__main__":', start)
replacement = '''def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", help="path to the sky CLI")
    parser.add_argument("--report", help="write machine-readable validation evidence")
    args = parser.parse_args()
    binary = find_binary(args.binary)

    records = []
    failures = []
    print(f"{'case':<11}{'body':<9}{'radec(arcsec)':>15}{'altaz(arcsec)':>15}{'d_alt(arcsec)':>15}{'d_dut1(ms)':>13}")
    for label, when, lat, lon, elev in CASES:
        snapshot = engine_snapshot(binary, when, lat, lon, elev)
        bodies = {body["name"]: body for body in snapshot["bodies"]}
        engine_dut1 = float(snapshot["time"]["dut1_seconds"])
        for name, command in BODIES.items():
            reference = horizons_observation(command, when, lat, lon, elev)
            body = bodies[name]
            radec = angular_sep(
                body["topocentric_apparent_dec_deg"],
                body["topocentric_apparent_ra_deg"],
                reference["dec_deg"],
                reference["ra_deg"],
            )
            altaz = angular_sep(body["alt_deg"], body["az_deg"], reference["el_deg"], reference["az_deg"])
            d_alt = abs(body["alt_deg"] - reference["el_deg"])
            d_dut1 = abs(engine_dut1 - reference["dut1_seconds"])
            tolerance = MOON_TOL_ARCSEC if name == "Moon" else DEFAULT_TOL_ARCSEC
            passed = (
                radec * 3600.0 <= tolerance
                and altaz * 3600.0 <= tolerance
                and d_alt * 3600.0 <= tolerance
                and d_dut1 <= DUT1_TOL_SECONDS
            )
            record = {
                "case": label,
                "utc": when.isoformat(),
                "body": name,
                "radec_error_arcsec": radec * 3600.0,
                "altaz_error_arcsec": altaz * 3600.0,
                "altitude_error_arcsec": d_alt * 3600.0,
                "dut1_error_seconds": d_dut1,
                "tolerance_arcsec": tolerance,
                "passed": passed,
            }
            records.append(record)
            print(
                f"{label:<11}{name:<9}{record['radec_error_arcsec']:>15.2f}"
                f"{record['altaz_error_arcsec']:>15.2f}{record['altitude_error_arcsec']:>15.2f}"
                f"{record['dut1_error_seconds'] * 1000.0:>13.3f}"
            )
            if not passed:
                failures.append(
                    f"{label}/{name}: RADEC={record['radec_error_arcsec']:.2f} arcsec "
                    f"ALTAZ={record['altaz_error_arcsec']:.2f} arcsec DUT1={d_dut1:.6f} s"
                )

    report = {
        "schema_version": "ephemeris-validation-report.v2",
        "reference": "JPL Horizons observer quantities 2,4,49; airless; exact UT TLIST",
        "matrix_size": len(records),
        "thresholds": {
            "default_arcsec": DEFAULT_TOL_ARCSEC,
            "moon_arcsec": MOON_TOL_ARCSEC,
            "dut1_seconds": DUT1_TOL_SECONDS,
        },
        "maxima": {
            "radec_error_arcsec": max(row["radec_error_arcsec"] for row in records),
            "altaz_error_arcsec": max(row["altaz_error_arcsec"] for row in records),
            "altitude_error_arcsec": max(row["altitude_error_arcsec"] for row in records),
            "dut1_error_seconds": max(row["dut1_error_seconds"] for row in records),
        },
        "passed": not failures,
        "records": records,
    }
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\\n", encoding="utf-8")

    if failures:
        for failure in failures:
            print("FAIL:", failure, file=sys.stderr)
        return 1
    print("OK: topocentric RA/Dec, alt/az, and DUT1 satisfy the Horizons matrix")
    return 0
'''
text = text[:start] + replacement + text[end:]
path.write_text(text, encoding="utf-8")
