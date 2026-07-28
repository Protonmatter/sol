use std::fs;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "sol-cli-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&path).expect("create temp directory");
    path
}

fn cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_solar-cli"))
        .args(args)
        .output()
        .expect("run solar-cli")
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec()).expect("CLI output is UTF-8")
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
        "simulate", "--steps", "0", "--dt-hours", "1", "--seed", "42",
        "--activity", "0.9", "--out", snapshot.to_str().unwrap(),
    ]);
    assert!(simulated.status.success(), "{}", text(&simulated.stderr));
    let snapshot_text = fs::read_to_string(&snapshot).unwrap();
    assert!(snapshot_text.contains("\"schema_version\": \"solar-state-snapshot.v2\""));
    assert!(snapshot_text.contains("\"frame\": \"heliographic_carrington\""));

    let replay = root.join("web-data");
    let replayed = cli(&[
        "replay", "--snapshot", snapshot.to_str().unwrap(),
        "--out", replay.to_str().unwrap(),
    ]);
    assert!(replayed.status.success(), "{}", text(&replayed.stderr));
    assert_eq!(fs::read_to_string(replay.join("latest-state.json")).unwrap(), snapshot_text);
    assert!(fs::read_to_string(replay.join("replay-manifest.json"))
        .unwrap()
        .contains("model-run-manifest.v1"));

    let observations = root.join("observations.json");
    let ingested = cli(&[
        "ingest", "swpc", "--out", observations.to_str().unwrap(),
        "--fallback-fixtures", "tests/swpc_scn26_21",
    ]);
    assert!(ingested.status.success(), "{}", text(&ingested.stderr));
    let report = fs::read_to_string(observations).unwrap();
    assert!(report.contains("\"schema_version\": \"observation-frame.v1\""));
    assert!(report.contains("\"source_mode\": \"fixture\""));

    let assimilated = root.join("assimilated.json");
    let run = cli(&[
        "simulate", "--steps", "0", "--out", assimilated.to_str().unwrap(),
        "--observations", observations.to_str().unwrap(),
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
        "replay", "--snapshot", wrong_schema.to_str().unwrap(),
        "--out", root.join("out").to_str().unwrap(),
    ]);
    assert_eq!(output.status.code(), Some(2));
    assert!(text(&output.stderr).contains("not a solar-state-snapshot.v2"));

    let no_frame = root.join("no-frame.json");
    fs::write(&no_frame, r#"{"schema_version":"solar-state-snapshot.v2"}"#).unwrap();
    let output = cli(&[
        "replay", "--snapshot", no_frame.to_str().unwrap(),
        "--out", root.join("out").to_str().unwrap(),
    ]);
    assert_eq!(output.status.code(), Some(2));
    assert!(text(&output.stderr).contains("Carrington"));
    fs::remove_dir_all(root).unwrap();
}
