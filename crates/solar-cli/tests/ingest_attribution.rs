use solar_core::{parse_json, JsonValue};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

struct FixtureDirectory(PathBuf);

impl FixtureDirectory {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "sol-ingest-attribution-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("create unique temporary directory");
        Self(root)
    }
}

impl Drop for FixtureDirectory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("remove only this test's unique temporary directory");
    }
}

fn cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_solar-cli"))
        .args(args)
        .output()
        .expect("run solar-cli")
}

fn read_json(path: &Path) -> JsonValue {
    parse_json(&fs::read_to_string(path).expect("read JSON output")).expect("parse JSON output")
}

fn write_supporting_feeds(root: &Path) {
    for (file, source) in [
        ("rtsw_mag_1m.json", "ATTRIBUTABLE-MAG"),
        ("rtsw_wind_1m.json", "ATTRIBUTABLE-WIND"),
    ] {
        fs::write(
            root.join(file),
            format!(r#"[{{"time_tag":"2026-09-11T00:00:00Z","source":"{source}","active":true}}]"#),
        )
        .expect("write supporting feed");
    }
}

fn ingest(root: &Path, report: &Path) -> Output {
    cli(&[
        "ingest",
        "swpc",
        "--cache",
        root.to_str().unwrap(),
        "--as-of-unix-seconds",
        "1789084800",
        "--out",
        report.to_str().unwrap(),
    ])
}

fn simulate(report: Option<&Path>, snapshot: &Path) -> Output {
    let mut args = vec![
        "simulate",
        "--steps",
        "0",
        "--activity",
        "0.9",
        "--out",
        snapshot.to_str().unwrap(),
    ];
    if let Some(report) = report {
        args.extend(["--observations", report.to_str().unwrap()]);
    }
    cli(&args)
}

fn f107_frame(report: &JsonValue) -> Option<&JsonValue> {
    report
        .get("frames")?
        .as_array()?
        .iter()
        .find(|frame| frame.get("id").and_then(JsonValue::as_str) == Some("swpc-f107-cm-flux"))
}

#[test]
fn shared_source_corpus_controls_real_ingest_and_simulation() {
    let root = FixtureDirectory::new();
    write_supporting_feeds(&root.0);
    let report_path = root.0.join("observations.json");
    let snapshot_path = root.0.join("snapshot.json");
    let baseline_report_path = root.0.join("baseline-observations.json");
    let baseline_path = root.0.join("baseline.json");
    let baseline_ingested = ingest(&root.0, &baseline_report_path);
    assert!(
        baseline_ingested.status.success(),
        "supporting-feed baseline ingest: {}",
        String::from_utf8_lossy(&baseline_ingested.stderr)
    );
    let baseline_report = read_json(&baseline_report_path);
    assert!(
        baseline_report.get("observed_context").is_none(),
        "magnetic/wind-only ingest must not invent F10.7 activity"
    );
    assert!(
        f107_frame(&baseline_report).is_none(),
        "magnetic/wind-only ingest must not invent an F10.7 frame"
    );
    for (id, source) in [
        ("swpc-rtsw-mag-1m", "ATTRIBUTABLE-MAG"),
        ("swpc-rtsw-wind-1m", "ATTRIBUTABLE-WIND"),
    ] {
        let frame = baseline_report
            .get("frames")
            .and_then(JsonValue::as_array)
            .unwrap()
            .iter()
            .find(|frame| frame.get("id").and_then(JsonValue::as_str) == Some(id))
            .unwrap_or_else(|| panic!("supporting frame {id} must be retained"));
        assert_eq!(
            frame
                .get("provenance")
                .and_then(|provenance| provenance.get("source"))
                .and_then(JsonValue::as_str),
            Some(source),
            "supporting frame {id} must retain attributable source"
        );
    }
    let baseline_result = simulate(Some(&baseline_report_path), &baseline_path);
    assert!(
        baseline_result.status.success(),
        "supporting-feed baseline simulation: {}",
        String::from_utf8_lossy(&baseline_result.stderr)
    );
    let baseline = read_json(&baseline_path);
    let baseline_mode = baseline
        .get("run")
        .and_then(|run| run.get("mode"))
        .and_then(JsonValue::as_str);
    let baseline_activity = baseline
        .get("run")
        .and_then(|run| run.get("activity_index"))
        .and_then(JsonValue::as_f64);
    assert_eq!(baseline_mode, Some("Synthetic"));
    assert_eq!(baseline_activity, Some(0.9));
    let cases = parse_json(include_str!(
        "../../../tests/fixtures/standalone-provenance.json"
    ))
    .unwrap();
    assert_eq!(cases.as_array().unwrap().len(), 47);

    let mut failures = Vec::new();
    for case in cases.as_array().unwrap() {
        let id = case.get("id").unwrap().as_str().unwrap();
        let expected_attributable = case.get("attributable").unwrap().as_bool().unwrap();
        let source = case.get("source").unwrap();
        fs::write(
            root.0.join("f107_cm_flux.json"),
            format!(
                r#"[{{"time_tag":"2026-09-11T00:00:00Z","source":{},"flux":150,"active":true}}]"#,
                source.to_compact_string()
            ),
        )
        .unwrap();

        let ingested = ingest(&root.0, &report_path);
        if !ingested.status.success() {
            failures.push(format!(
                "{id}: ingest failed: {}",
                String::from_utf8_lossy(&ingested.stderr)
            ));
            continue;
        }
        let report = read_json(&report_path);
        let simulated = simulate(Some(&report_path), &snapshot_path);
        if !simulated.status.success() {
            failures.push(format!(
                "{id}: simulation failed: {}",
                String::from_utf8_lossy(&simulated.stderr)
            ));
            continue;
        }
        let snapshot = read_json(&snapshot_path);
        let mode = snapshot
            .get("run")
            .and_then(|run| run.get("mode"))
            .and_then(JsonValue::as_str);
        let activity = snapshot
            .get("run")
            .and_then(|run| run.get("activity_index"))
            .and_then(JsonValue::as_f64);

        if expected_attributable {
            let selected = f107_frame(&report).expect("attributable F10.7 must be retained");
            assert_eq!(
                selected.get("provenance").and_then(|p| p.get("source")),
                Some(source),
                "{id}: admitted source text must be retained without rewriting"
            );
            assert_eq!(mode, Some("Assimilation"), "{id}");
            assert_eq!(activity, Some(0.58), "{id}");
        } else {
            let observed_activity = report
                .get("observed_context")
                .and_then(|context| context.get("activity_index"))
                .and_then(JsonValue::as_f64);
            if observed_activity.is_some()
                || f107_frame(&report).is_some()
                || mode != baseline_mode
                || activity != baseline_activity
                || snapshot.get("fields") != baseline.get("fields")
            {
                failures.push(format!(
                    "{id}: invalid F10.7 changed ingest/simulation; context={observed_activity:?} mode={mode:?} activity={activity:?}"
                ));
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn invalid_newer_f107_preserves_older_attributable_signal() {
    let root = FixtureDirectory::new();
    write_supporting_feeds(&root.0);
    let report_path = root.0.join("observations.json");
    let snapshot_path = root.0.join("snapshot.json");
    fs::write(
        root.0.join("f107_cm_flux.json"),
        r#"[
          {"time_tag":"2026-09-10T00:00:00Z","source":"OLDER-F107","flux":150,"active":true},
          {"time_tag":"2026-09-11T00:00:00Z","source":"\u001cUnKnOwN\u001f","flux":235,"active":true}
        ]"#,
    )
    .unwrap();

    let ingested = ingest(&root.0, &report_path);
    assert!(
        ingested.status.success(),
        "{}",
        String::from_utf8_lossy(&ingested.stderr)
    );
    let report = read_json(&report_path);
    assert_eq!(
        report
            .get("observed_context")
            .and_then(|context| context.get("activity_index"))
            .and_then(JsonValue::as_f64),
        Some(0.5)
    );
    let provenance = f107_frame(&report).unwrap().get("provenance").unwrap();
    assert_eq!(
        provenance.get("source").and_then(JsonValue::as_str),
        Some("OLDER-F107")
    );
    assert_eq!(
        provenance.get("time_tag").and_then(JsonValue::as_str),
        Some("2026-09-10T00:00:00Z")
    );

    let simulated = simulate(Some(&report_path), &snapshot_path);
    assert!(
        simulated.status.success(),
        "{}",
        String::from_utf8_lossy(&simulated.stderr)
    );
    let snapshot = read_json(&snapshot_path);
    assert_eq!(
        snapshot
            .get("run")
            .and_then(|run| run.get("mode"))
            .and_then(JsonValue::as_str),
        Some("Assimilation")
    );
    assert_eq!(
        snapshot
            .get("run")
            .and_then(|run| run.get("activity_index"))
            .and_then(JsonValue::as_f64),
        Some(0.58)
    );
}
