use std::fs;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_FIXTURE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn temp_dir(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "sol-cli-{label}-{}-{nonce}-{}",
        std::process::id(),
        NEXT_FIXTURE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    fs::create_dir_all(&path).expect("create temp directory");
    path
}

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .expect("solar-cli is inside the workspace crates directory")
        .to_path_buf()
}

fn cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_solar-cli"))
        .current_dir(workspace_root())
        .args(args)
        .output()
        .expect("run solar-cli")
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec()).expect("CLI output is UTF-8")
}

#[test]
fn source_bundle_manifest_attribution_reaches_activity_analysis() {
    let root = temp_dir("manifest-f107");
    let pointer = workspace_root().join("tests/fixtures/manifest-f107/current.json");
    let report = root.join("observations.json");
    let snapshot = root.join("snapshot.json");
    let ingested = cli(&[
        "ingest",
        "swpc",
        "--source-pointer",
        pointer.to_str().unwrap(),
        "--as-of-unix-seconds",
        "1789084800",
        "--out",
        report.to_str().unwrap(),
    ]);
    assert!(ingested.status.success(), "{}", text(&ingested.stderr));
    let normalized = solar_core::parse_json(&fs::read_to_string(&report).unwrap()).unwrap();
    assert_eq!(
        normalized
            .get("observed_context")
            .and_then(|c| c.get("activity_index"))
            .and_then(|v| v.as_f64()),
        Some(0.5)
    );
    let signal = normalized
        .get("frames")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f.get("id").and_then(|v| v.as_str()) == Some("swpc-f107-cm-flux"))
        .unwrap();
    assert_eq!(
        signal
            .get("provenance")
            .unwrap()
            .get("source")
            .and_then(|v| v.as_str()),
        Some("NOAA/SWPC F10.7")
    );
    assert!(
        signal
            .get("provenance")
            .unwrap()
            .get("raw_source_metadata")
            .unwrap()
            .get("source")
            .is_none(),
        "manifest attribution must not rewrite raw source rows"
    );
    let simulated = cli(&[
        "simulate",
        "--steps",
        "0",
        "--activity",
        "0.9",
        "--observations",
        report.to_str().unwrap(),
        "--out",
        snapshot.to_str().unwrap(),
    ]);
    assert!(simulated.status.success(), "{}", text(&simulated.stderr));
    let analyzed = solar_core::parse_json(&fs::read_to_string(snapshot).unwrap()).unwrap();
    let run = analyzed.get("run").unwrap();
    assert_eq!(
        run.get("mode").and_then(|v| v.as_str()),
        Some("Assimilation")
    );
    assert!((run.get("activity_index").unwrap().as_f64().unwrap() - 0.58).abs() < 1e-6);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn bundle_replay_validates_all_components_before_any_output() {
    let root = temp_dir("bundle-replay");
    let pointer = workspace_root().join("apps/web/data/current.json");
    let accepted = cli(&[
        "replay",
        "--bundle-pointer",
        pointer.to_str().unwrap(),
        "--out",
        root.to_str().unwrap(),
    ]);
    assert!(accepted.status.success(), "{}", text(&accepted.stderr));
    assert!(root.join("latest-state.json").is_file());
    let bad = root.join("current.json");
    fs::write(&bad, b"{}").unwrap();
    let sentinel = root.join("snapshot.json");
    fs::write(&sentinel, b"last valid").unwrap();
    let rejected = cli(&[
        "simulate",
        "--bundle-pointer",
        bad.to_str().unwrap(),
        "--steps",
        "0",
        "--out",
        sentinel.to_str().unwrap(),
    ]);
    assert_eq!(rejected.status.code(), Some(2));
    assert_eq!(fs::read(sentinel).unwrap(), b"last valid");
}

#[test]
fn historical_v2_copy_is_explicit_and_never_replaces_the_live_alias() {
    let root = temp_dir("historical-v2");
    let input = workspace_root().join("tests/fixtures/historical/solar-v2.json");
    fs::write(root.join("latest-state.json"), b"live v3 sentinel").unwrap();
    let rejected = cli(&[
        "replay",
        "--snapshot",
        input.to_str().unwrap(),
        "--out",
        root.to_str().unwrap(),
    ]);
    assert_eq!(rejected.status.code(), Some(2));
    let accepted = cli(&[
        "replay",
        "--historical-v2",
        "--snapshot",
        input.to_str().unwrap(),
        "--out",
        root.to_str().unwrap(),
    ]);
    assert!(accepted.status.success(), "{}", text(&accepted.stderr));
    assert_eq!(
        fs::read(root.join("historical-state-v2.json")).unwrap(),
        fs::read(input).unwrap()
    );
    assert_eq!(
        fs::read(root.join("latest-state.json")).unwrap(),
        b"live v3 sentinel"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn cli_noise_is_scalar_elapsed_time_and_invalid_rate_cannot_write() {
    let root = temp_dir("scalar-noise");
    let snapshot = root.join("snapshot.json");
    let output = cli(&[
        "simulate",
        "--steps",
        "2",
        "--dt-hours",
        "24",
        "--process-noise-per-day",
        "0.02",
        "--out",
        snapshot.to_str().unwrap(),
    ]);
    assert!(output.status.success(), "{}", text(&output.stderr));
    let raw = fs::read_to_string(&snapshot).unwrap();
    let parsed = solar_core::parse_json(&raw).unwrap();
    let uncertainty = parsed.get("uncertainty").unwrap().get("activity").unwrap();
    assert_eq!(uncertainty.get("variance").unwrap().as_f64(), Some(0.08));
    assert_eq!(
        uncertainty.get("at_time_seconds").unwrap().as_f64(),
        Some(172800.0)
    );
    assert_eq!(
        uncertainty.get("process_noise_status").unwrap().as_str(),
        Some("illustrative")
    );
    assert!(parsed
        .get("fields")
        .unwrap()
        .get("br_variance_normalized")
        .is_none());
    let replay = cli(&[
        "replay",
        "--snapshot",
        snapshot.to_str().unwrap(),
        "--out",
        root.to_str().unwrap(),
    ]);
    assert!(replay.status.success(), "{}", text(&replay.stderr));
    for rate in ["-0.1", "NaN", "inf"] {
        let rejected = cli(&[
            "simulate",
            "--steps",
            "0",
            "--process-noise-per-day",
            rate,
            "--out",
            snapshot.to_str().unwrap(),
        ]);
        assert_eq!(rejected.status.code(), Some(2));
        assert_eq!(fs::read_to_string(&snapshot).unwrap(), raw);
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn finite_noise_forecast_overflow_is_a_normal_error_and_preserves_output() {
    let root = temp_dir("finite-noise-overflow");
    let snapshot = root.join("snapshot.json");
    fs::write(&snapshot, b"last valid snapshot sentinel").unwrap();
    let output = cli(&[
        "simulate",
        "--steps",
        "2",
        "--dt-hours",
        "24",
        "--process-noise-per-day",
        "1e308",
        "--out",
        snapshot.to_str().unwrap(),
    ]);
    assert_eq!(output.status.code(), Some(2), "{}", text(&output.stderr));
    assert!(text(&output.stderr).contains("activity uncertainty forecast overflow"));
    assert!(!text(&output.stderr).contains("panicked"));
    assert_eq!(
        fs::read(&snapshot).unwrap(),
        b"last valid snapshot sentinel"
    );
    let output = cli(&[
        "simulate",
        "--steps",
        "2",
        "--dt-hours",
        "24",
        "--process-noise-per-day",
        "8e307",
        "--out",
        snapshot.to_str().unwrap(),
    ]);
    assert!(output.status.success(), "{}", text(&output.stderr));
    let parsed = solar_core::parse_json(&fs::read_to_string(&snapshot).unwrap()).unwrap();
    assert_eq!(
        parsed
            .get("uncertainty")
            .unwrap()
            .get("activity")
            .unwrap()
            .get("variance")
            .unwrap()
            .as_f64(),
        Some(1.6e308)
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn help_unknown_and_legacy_paths_have_stable_contracts() {
    for args in [&[][..], &["--help"][..], &["-h"][..]] {
        let output = cli(args);
        assert!(output.status.success());
        assert!(text(&output.stdout).contains("solar-cli simulate"));
    }
    let unknown = cli(&["unknown"]);
    assert_eq!(unknown.status.code(), Some(2));
    assert!(text(&unknown.stderr).contains("unknown command"));

    let legacy = cli(&["--steps", "0", "--dt-hours", "1", "--seed", "7"]);
    assert!(legacy.status.success());
    let stdout = text(&legacy.stdout);
    assert!(stdout.contains("CPU reference"));
    assert!(stdout.contains("steps=0"));
}

#[test]
fn simulate_ingest_and_replay_form_an_end_to_end_offline_pipeline() {
    let root = temp_dir("pipeline");
    let snapshot = root.join("snapshot.json");
    let simulated = cli(&[
        "simulate",
        "--steps",
        "0",
        "--dt-hours",
        "1",
        "--seed",
        "42",
        "--activity",
        "0.9",
        "--out",
        snapshot.to_str().unwrap(),
    ]);
    assert!(simulated.status.success(), "{}", text(&simulated.stderr));
    let snapshot_text = fs::read_to_string(&snapshot).unwrap();
    assert!(snapshot_text.contains("\"schema_version\": \"solar-state-snapshot.v3\""));
    assert!(snapshot_text.contains("\"frame\": \"heliographic_carrington\""));

    let replay = root.join("web-data");
    let replayed = cli(&[
        "replay",
        "--snapshot",
        snapshot.to_str().unwrap(),
        "--out",
        replay.to_str().unwrap(),
    ]);
    assert!(replayed.status.success(), "{}", text(&replayed.stderr));
    assert_eq!(
        fs::read_to_string(replay.join("latest-state.json")).unwrap(),
        snapshot_text
    );
    assert!(fs::read_to_string(replay.join("replay-manifest.json"))
        .unwrap()
        .contains("model-run-manifest.v1"));

    let observations = root.join("observations.json");
    let ingested = cli(&[
        "ingest",
        "swpc",
        "--out",
        observations.to_str().unwrap(),
        "--fallback-fixtures",
        "tests/swpc_scn26_21",
    ]);
    assert!(ingested.status.success(), "{}", text(&ingested.stderr));
    let report = fs::read_to_string(&observations).unwrap();
    assert!(report.contains("\"schema_version\": \"observation-frame.v1\""));
    assert!(report.contains("\"source_mode\": \"fixture\""));

    let assimilated = root.join("assimilated.json");
    let run = cli(&[
        "simulate",
        "--steps",
        "0",
        "--out",
        assimilated.to_str().unwrap(),
        "--observations",
        observations.to_str().unwrap(),
    ]);
    assert!(run.status.success(), "{}", text(&run.stderr));
    assert!(assimilated.is_file());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn malformed_arguments_and_replay_inputs_fail_closed() {
    let root = temp_dir("errors");
    for args in [
        vec!["simulate"],
        vec!["simulate", "--out", "x", "--steps", "not-a-number"],
        vec!["simulate", "--out", "x", "--dt-hours", "NaN"],
        vec!["ingest"],
        vec!["ingest", "other"],
        vec!["replay"],
    ] {
        let output = cli(&args);
        assert_eq!(output.status.code(), Some(2), "{args:?}");
    }

    let wrong_schema = root.join("wrong.json");
    fs::write(&wrong_schema, r#"{"schema_version":"other.v1"}"#).unwrap();
    let output = cli(&[
        "replay",
        "--snapshot",
        wrong_schema.to_str().unwrap(),
        "--out",
        root.join("out").to_str().unwrap(),
    ]);
    assert_eq!(output.status.code(), Some(2));
    assert!(text(&output.stderr).contains("not a live solar-state-snapshot.v3"));

    let no_frame = root.join("no-frame.json");
    fs::write(&no_frame, r#"{"schema_version":"solar-state-snapshot.v3"}"#).unwrap();
    let output = cli(&[
        "replay",
        "--snapshot",
        no_frame.to_str().unwrap(),
        "--out",
        root.join("out").to_str().unwrap(),
    ]);
    assert_eq!(output.status.code(), Some(2));
    assert!(text(&output.stderr).contains("Carrington"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn replay_rejects_incomplete_input_without_replacing_existing_output() {
    let root = temp_dir("atomic-replay");
    let input = root.join("input.json");
    let target = root.join("latest-state.json");
    let sentinel = b"previous verified snapshot sentinel";
    fs::write(&target, sentinel).unwrap();
    fs::write(&input, r#"{"schema_version":"solar-state-snapshot.v3","coordinates":{"frame":"heliographic_carrington"}}"#).unwrap();
    let result = cli(&[
        "replay",
        "--snapshot",
        input.to_str().unwrap(),
        "--out",
        root.to_str().unwrap(),
    ]);
    assert_eq!(result.status.code(), Some(2));
    assert_eq!(fs::read(&target).unwrap(), sentinel);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn replay_accepts_spacing_and_rejects_dimension_and_bounds_changes() {
    let root = temp_dir("replay-validation");
    let input = root.join("input.json");
    let raw = fs::read_to_string(workspace_root().join("apps/web/data/latest-state.json")).unwrap();
    let spaced = raw.replace("\": ", "\" \t:\n");
    fs::write(&input, &spaced).unwrap();
    let invoke = || {
        cli(&[
            "replay",
            "--snapshot",
            input.to_str().unwrap(),
            "--out",
            root.to_str().unwrap(),
        ])
    };
    let result = invoke();
    assert!(result.status.success(), "{}", text(&result.stderr));
    let sentinel = fs::read(root.join("latest-state.json")).unwrap();
    for invalid in [
        raw.replace("\"lon_count\": 72", "\"lon_count\": 73"),
        raw.replace("\"dt_hours\": 0.0", "\"dt_hours\": -1.0"),
        raw.replace(
            "\"source_mode\":",
            "\"source_mode\": \"duplicate\", \"source_mode\":",
        ),
    ] {
        assert!(invalid != raw, "test mutation must change input");
        fs::write(&input, invalid).unwrap();
        assert_eq!(invoke().status.code(), Some(2));
        assert_eq!(fs::read(root.join("latest-state.json")).unwrap(), sentinel);
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn ingest_f107_signal_changes_activity_and_metadata_only_stays_synthetic() {
    let root = temp_dir("actual-ingest");
    let report = root.join("observations.json");
    let snapshot = root.join("snapshot.json");
    let run = || {
        let output = cli(&[
            "ingest",
            "swpc",
            "--cache",
            root.to_str().unwrap(),
            "--as-of-unix-seconds",
            "1789084800",
            "--out",
            report.to_str().unwrap(),
        ]);
        assert!(output.status.success(), "{}", text(&output.stderr));
        let output = cli(&[
            "simulate",
            "--steps",
            "0",
            "--activity",
            "0.9",
            "--observations",
            report.to_str().unwrap(),
            "--out",
            snapshot.to_str().unwrap(),
        ]);
        assert!(output.status.success(), "{}", text(&output.stderr));
        solar_core::parse_json(&fs::read_to_string(&snapshot).unwrap()).unwrap()
    };
    let metadata = run();
    assert_eq!(
        metadata.get("run").unwrap().get("mode").unwrap().as_str(),
        Some("Synthetic")
    );
    fs::write(
        root.join("f107_cm_flux.json"),
        r#"[
      {"time_tag":"2026-09-10T00:00:00Z","source":"OLDER","flux":235,"active":true},
      {"time_tag":"2026-09-11T00:00:00Z","source":"F107","flux":150,"active":true}
    ]"#,
    )
    .unwrap();
    let assimilated = run();
    let activity = assimilated
        .get("run")
        .unwrap()
        .get("activity_index")
        .unwrap()
        .as_f64()
        .unwrap();
    assert!(
        (activity - 0.58).abs() < 1e-6,
        "K=.8 and observed activity=.5 give analysis=.58"
    );
    assert_eq!(
        assimilated
            .get("run")
            .unwrap()
            .get("mode")
            .unwrap()
            .as_str(),
        Some("Assimilation")
    );
    let replay = cli(&[
        "replay",
        "--snapshot",
        snapshot.to_str().unwrap(),
        "--out",
        root.to_str().unwrap(),
    ]);
    assert!(
        replay.status.success(),
        "assimilated result must pass complete snapshot validation: {}",
        text(&replay.stderr)
    );
    fs::remove_dir_all(root).unwrap();
}

fn check_unknown_f107_source(unknown: &str, include_older: bool) {
    let root = temp_dir("unknown-f107");
    let report = root.join("observations.json");
    let snapshot = root.join("snapshot.json");
    for file in ["rtsw_mag_1m.json", "rtsw_wind_1m.json"] {
        fs::write(
            root.join(file),
            r#"[{"time_tag":"2026-09-11T00:00:00Z","source":"ATTRIBUTABLE-WIND","active":true}]"#,
        )
        .unwrap();
    }
    let older = if include_older {
        r#"{"time_tag":"2026-09-10T00:00:00Z","source":"OLDER-F107","flux":150,"active":true},"#
    } else {
        ""
    };
    fs::write(root.join("f107_cm_flux.json"), format!(r#"[{older}{{"time_tag":"2026-09-11T00:00:00Z","source":"{unknown}","flux":235,"active":true}}]"#)).unwrap();
    let ingested = cli(&[
        "ingest",
        "swpc",
        "--cache",
        root.to_str().unwrap(),
        "--as-of-unix-seconds",
        "1789084800",
        "--out",
        report.to_str().unwrap(),
    ]);
    assert!(ingested.status.success(), "{}", text(&ingested.stderr));
    let simulated = cli(&[
        "simulate",
        "--steps",
        "0",
        "--activity",
        "0.9",
        "--observations",
        report.to_str().unwrap(),
        "--out",
        snapshot.to_str().unwrap(),
    ]);
    assert!(simulated.status.success(), "{}", text(&simulated.stderr));
    let parsed = solar_core::parse_json(&fs::read_to_string(&snapshot).unwrap()).unwrap();
    let run = parsed.get("run").unwrap();
    let activity = run.get("activity_index").unwrap().as_f64().unwrap();
    assert!(
        (activity - if include_older { 0.58 } else { 0.9 }).abs() < 1e-6,
        "unknown variant {unknown:?} must not supply activity (got {activity})"
    );
    assert_eq!(
        run.get("mode").unwrap().as_str(),
        Some(if include_older {
            "Assimilation"
        } else {
            "Synthetic"
        })
    );
    let report_json = solar_core::parse_json(&fs::read_to_string(&report).unwrap()).unwrap();
    let signal_frame = report_json
        .get("frames")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .find(|frame| {
            frame.get("id").and_then(solar_core::JsonValue::as_str) == Some("swpc-f107-cm-flux")
        });
    if include_older {
        let provenance = signal_frame.unwrap().get("provenance").unwrap();
        assert_eq!(
            provenance.get("source").unwrap().as_str(),
            Some("OLDER-F107")
        );
        assert_eq!(
            provenance.get("time_tag").unwrap().as_str(),
            Some("2026-09-10T00:00:00Z")
        );
        assert_eq!(
            provenance
                .get("raw_source_metadata")
                .unwrap()
                .get("flux")
                .unwrap()
                .as_f64(),
            Some(150.0)
        );
    } else {
        assert!(signal_frame.is_none());
        assert!(report_json.get("observed_context").is_none());
        let uncertainty = parsed.get("uncertainty").unwrap().get("activity").unwrap();
        assert_eq!(uncertainty.get("variance").unwrap().as_f64(), Some(0.04));
        assert_eq!(
            uncertainty.get("last_analysis_time_seconds"),
            Some(&solar_core::JsonValue::Null)
        );
        let baseline = root.join("baseline.json");
        assert!(cli(&[
            "simulate",
            "--steps",
            "0",
            "--activity",
            "0.9",
            "--out",
            baseline.to_str().unwrap()
        ])
        .status
        .success());
        let baseline = solar_core::parse_json(&fs::read_to_string(baseline).unwrap()).unwrap();
        assert_eq!(
            parsed.get("fields"),
            baseline.get("fields"),
            "unattributable observation must not change magnetic field or spatial score"
        );
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn unknown_uppercase_f107_cannot_borrow_wind_provenance() {
    check_unknown_f107_source("UNKNOWN", false);
}

#[test]
fn unknown_padded_f107_cannot_borrow_wind_provenance() {
    check_unknown_f107_source(" unknown ", false);
}

#[test]
fn unknown_uppercase_f107_preserves_older_attributable_signal() {
    check_unknown_f107_source("UNKNOWN", true);
}

#[test]
fn unknown_padded_f107_preserves_older_attributable_signal() {
    check_unknown_f107_source(" unknown ", true);
}
