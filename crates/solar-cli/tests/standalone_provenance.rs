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
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "sol-standalone-provenance-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir(&root).unwrap();
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
        .unwrap()
}

fn field_mut<'a>(value: &'a mut JsonValue, key: &str) -> &'a mut JsonValue {
    let JsonValue::Object(fields) = value else {
        panic!("object required")
    };
    &mut fields.iter_mut().find(|(name, _)| name == key).unwrap().1
}

fn first_mut(value: &mut JsonValue) -> &mut JsonValue {
    let JsonValue::Array(items) = value else {
        panic!("array required")
    };
    &mut items[0]
}

fn source_mut(snapshot: &mut JsonValue) -> &mut JsonValue {
    let report = first_mut(field_mut(snapshot, "observations"));
    let frame = first_mut(field_mut(report, "frames"));
    field_mut(field_mut(frame, "provenance"), "source")
}

fn cases() -> JsonValue {
    parse_json(include_str!(
        "../../../tests/fixtures/standalone-provenance.json"
    ))
    .unwrap()
}

fn read_json(path: &Path) -> JsonValue {
    parse_json(&fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn standalone_replay_rejects_unattributable_sources_before_replacing_output() {
    let root = FixtureDirectory::new();
    let input = root.0.join("input.json");
    let output = root.0.join("replay");
    fs::create_dir(&output).unwrap();
    let selected = output.join("latest-state.json");
    let template = parse_json(include_str!("../../../apps/web/data/latest-state.json")).unwrap();
    let mut failures = Vec::new();
    for case in cases().as_array().unwrap() {
        let id = case.get("id").unwrap().as_str().unwrap();
        let accepted = case.get("attributable").unwrap().as_bool().unwrap();
        let mut snapshot = template.clone();
        *source_mut(&mut snapshot) = case.get("source").unwrap().clone();
        let raw = snapshot.to_compact_string();
        fs::write(&input, &raw).unwrap();
        fs::write(&selected, b"last valid snapshot").unwrap();
        let result = cli(&[
            "replay",
            "--snapshot",
            input.to_str().unwrap(),
            "--out",
            output.to_str().unwrap(),
        ]);
        if accepted {
            assert!(
                result.status.success(),
                "{id}: {}",
                String::from_utf8_lossy(&result.stderr)
            );
            assert_eq!(
                fs::read_to_string(&selected).unwrap(),
                raw,
                "{id}: accepted bytes must be preserved"
            );
        } else if result.status.code() != Some(2)
            || fs::read(&selected).unwrap() != b"last valid snapshot"
        {
            failures.push(format!("{id}: rejected input must return 2 and preserve the selected snapshot; status={:?}", result.status.code()));
        }
        assert_eq!(
            fs::read_to_string(&input).unwrap(),
            raw,
            "{id}: source input must be unchanged"
        );
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn standalone_simulate_assimilates_only_attributable_observations() {
    let root = FixtureDirectory::new();
    let input = root.0.join("observations.json");
    let output = root.0.join("snapshot.json");
    let mut failures = Vec::new();
    for case in cases().as_array().unwrap() {
        let id = case.get("id").unwrap().as_str().unwrap();
        let accepted = case.get("attributable").unwrap().as_bool().unwrap();
        let source = case.get("source").unwrap();
        let raw = format!(
            r#"{{"schema_version":"observation-frame.v1","source_mode":"fixture","frames":[{{"id":"test-observation","layer_kind":"observed","source_mode":"fixture","provenance":{{"source":{},"active":true,"raw_source_metadata":{{}}}},"quality_flags":["offline test"]}}],"observed_context":{{"activity_index":0.5,"signal_freshness":{{"test":{{"stale":false}}}}}}}}"#,
            source.to_compact_string()
        );
        fs::write(&input, &raw).unwrap();
        let result = cli(&[
            "simulate",
            "--steps",
            "0",
            "--activity",
            "0.9",
            "--observations",
            input.to_str().unwrap(),
            "--out",
            output.to_str().unwrap(),
        ]);
        if !result.status.success() {
            failures.push(format!(
                "{id}: simulation failed: {}",
                String::from_utf8_lossy(&result.stderr)
            ));
            continue;
        }
        let snapshot = read_json(&output);
        let run = snapshot.get("run").unwrap();
        let mode = run.get("mode").unwrap().as_str().unwrap();
        let activity = run.get("activity_index").unwrap().as_f64().unwrap();
        let observations = snapshot.get("observations").unwrap().as_array().unwrap();
        if accepted {
            assert_eq!(mode, "Assimilation", "{id}");
            assert!((activity - 0.58).abs() < 1e-6, "{id}: activity={activity}");
            assert_eq!(
                observations[0].get("frames").unwrap().as_array().unwrap()[0]
                    .get("provenance")
                    .unwrap()
                    .get("source"),
                Some(source),
                "{id}: attribution must not rewrite source"
            );
        } else if mode != "Synthetic" || (activity - 0.9).abs() >= 1e-6 || !observations.is_empty()
        {
            failures.push(format!("{id}: unattributable evidence changed forecast: mode={mode} activity={activity} reports={}", observations.len()));
        }
        assert_eq!(
            fs::read_to_string(&input).unwrap(),
            raw,
            "{id}: observation input must be unchanged"
        );
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
