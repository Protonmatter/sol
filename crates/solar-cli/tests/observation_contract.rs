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
            "sol-observation-contract-{}-{nonce}",
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

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
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

fn simulate(report: &Path, snapshot: &Path) -> Output {
    cli(&[
        "simulate",
        "--steps",
        "0",
        "--activity",
        "0.9",
        "--observations",
        report.to_str().unwrap(),
        "--out",
        snapshot.to_str().unwrap(),
    ])
}

fn assert_safe_synthetic(snapshot: &Path, id: &str) {
    let raw = fs::read_to_string(snapshot).expect("read snapshot");
    let value = parse_json(&raw).expect("parse snapshot");
    assert_eq!(
        value
            .get("run")
            .and_then(|run| run.get("mode"))
            .and_then(JsonValue::as_str),
        Some("Synthetic"),
        "{id}"
    );
    assert_eq!(
        value
            .get("run")
            .and_then(|run| run.get("activity_index"))
            .and_then(JsonValue::as_f64),
        Some(0.9),
        "{id}"
    );
    assert!(
        value
            .get("observations")
            .and_then(JsonValue::as_array)
            .is_some_and(<[JsonValue]>::is_empty),
        "{id}: invalid evidence must not be embedded"
    );

    let replay = snapshot.with_file_name(format!("{id}-replay"));
    let result = cli(&[
        "replay",
        "--snapshot",
        snapshot.to_str().unwrap(),
        "--out",
        replay.to_str().unwrap(),
    ]);
    assert!(
        result.status.success(),
        "{id}: safe fallback snapshot must satisfy v3 replay: {}",
        text(&result.stderr)
    );
}

#[test]
fn incomplete_frames_cannot_influence_or_invalidate_a_snapshot() {
    let root = FixtureDirectory::new();
    let report = root.0.join("observations.json");
    let snapshot = root.0.join("snapshot.json");
    let frames = [
        (
            "missing-layer-kind",
            r#"{"id":"test","source_mode":"fixture","provenance":{"source":"synthetic observatory","active":true,"raw_source_metadata":{}},"quality_flags":["offline test"]}"#,
        ),
        (
            "missing-source-mode",
            r#"{"id":"test","layer_kind":"observed","provenance":{"source":"synthetic observatory","active":true,"raw_source_metadata":{}},"quality_flags":["offline test"]}"#,
        ),
        (
            "missing-active",
            r#"{"id":"test","layer_kind":"observed","source_mode":"fixture","provenance":{"source":"synthetic observatory","raw_source_metadata":{}},"quality_flags":["offline test"]}"#,
        ),
        (
            "missing-raw-source-metadata",
            r#"{"id":"test","layer_kind":"observed","source_mode":"fixture","provenance":{"source":"synthetic observatory","active":true},"quality_flags":["offline test"]}"#,
        ),
        (
            "nonobject-raw-source-metadata",
            r#"{"id":"test","layer_kind":"observed","source_mode":"fixture","provenance":{"source":"synthetic observatory","active":true,"raw_source_metadata":[]},"quality_flags":["offline test"]}"#,
        ),
        (
            "missing-quality-flags",
            r#"{"id":"test","layer_kind":"observed","source_mode":"fixture","provenance":{"source":"synthetic observatory","active":true,"raw_source_metadata":{}}}"#,
        ),
        (
            "empty-quality-flags",
            r#"{"id":"test","layer_kind":"observed","source_mode":"fixture","provenance":{"source":"synthetic observatory","active":true,"raw_source_metadata":{}},"quality_flags":[]}"#,
        ),
    ];

    for (id, frame) in frames {
        let raw = format!(
            r#"{{"schema_version":"observation-frame.v1","source_mode":"fixture","frames":[{frame}],"observed_context":{{"activity_index":0.5,"signal_freshness":{{"test":{{"stale":false}}}}}}}}"#
        );
        fs::write(&report, raw).expect("write synthetic observation report");
        let result = simulate(&report, &snapshot);
        assert!(
            result.status.success(),
            "{id}: unusable report must take the safe synthetic path: {}",
            text(&result.stderr)
        );
        assert_safe_synthetic(&snapshot, id);
    }
}

#[test]
fn accepted_report_metadata_and_context_are_preserved_semantically() {
    let root = FixtureDirectory::new();
    let report = root.0.join("observations.json");
    let snapshot = root.0.join("snapshot.json");
    let valid_frame = r#"{"id":"valid","schema_version":"observation-frame.v1","layer_kind":"observed","source_mode":"fixture","provenance":{"source":"synthetic observatory","active":true,"raw_source_metadata":{"fixture":true}},"quality_flags":["offline test"]}"#;
    let invalid_frame = r#"{"id":"unattributable","schema_version":"observation-frame.v1","layer_kind":"observed","source_mode":"fixture","provenance":{"source":" unknown ","active":true,"raw_source_metadata":{"fixture":true}},"quality_flags":["offline test"]}"#;
    let context = r#"{"activity_index":0.5,"signal_freshness":{"test":{"age_hours":0.0,"stale":false}},"evaluated_at_unix_seconds":1789084800,"audit_marker":"retain-me"}"#;
    let raw = format!(
        r#"{{"schema_version":"observation-frame.v1","generated_by":"synthetic regression","source_mode":"fixture","adapters":[{{"id":"adapter-a"}}],"frames":[{valid_frame},{invalid_frame}],"observed_context":{context},"warnings":["offline test"],"audit_metadata":{{"id":"report-a"}}}}"#
    );
    fs::write(&report, &raw).expect("write synthetic observation report");

    let result = simulate(&report, &snapshot);
    assert!(result.status.success(), "{}", text(&result.stderr));
    let value = parse_json(&fs::read_to_string(&snapshot).unwrap()).unwrap();
    let expected_report = parse_json(&format!(
        r#"{{"schema_version":"observation-frame.v1","generated_by":"synthetic regression","source_mode":"fixture","adapters":[{{"id":"adapter-a"}}],"frames":[{valid_frame}],"observed_context":{context},"warnings":["offline test"],"audit_metadata":{{"id":"report-a"}}}}"#
    ))
    .unwrap();
    assert_eq!(
        value.get("observations").and_then(JsonValue::as_array),
        Some(&[expected_report][..]),
        "the accepted report must retain all metadata except inadmissible frames"
    );
    assert_eq!(
        value.get("observed_context"),
        Some(&parse_json(context).unwrap()),
        "the exact accepted analysis inputs must remain available at snapshot level"
    );
    assert_eq!(
        value
            .get("run")
            .and_then(|run| run.get("activity_index"))
            .and_then(JsonValue::as_f64),
        Some(0.58)
    );

    let replay = root.0.join("replay");
    let replayed = cli(&[
        "replay",
        "--snapshot",
        snapshot.to_str().unwrap(),
        "--out",
        replay.to_str().unwrap(),
    ]);
    assert!(
        replayed.status.success(),
        "preserved observation evidence must satisfy v3 replay: {}",
        text(&replayed.stderr)
    );
}

#[test]
fn malformed_freshness_entries_cannot_influence_analysis() {
    let root = FixtureDirectory::new();
    let report = root.0.join("observations.json");
    let snapshot = root.0.join("snapshot.json");
    fs::write(
        &report,
        r#"{"schema_version":"observation-frame.v1","source_mode":"fixture","frames":[{"id":"test","layer_kind":"observed","source_mode":"fixture","provenance":{"source":"synthetic observatory","active":true,"raw_source_metadata":{}},"quality_flags":["offline test"]}],"observed_context":{"activity_index":0.5,"signal_freshness":{"valid":{"stale":false},"malformed":{"stale":"false"}}}}"#,
    )
    .expect("write synthetic observation report");

    let result = simulate(&report, &snapshot);
    assert!(
        result.status.success(),
        "malformed freshness must take the safe synthetic path: {}",
        text(&result.stderr)
    );
    assert_safe_synthetic(&snapshot, "malformed-freshness");
}
