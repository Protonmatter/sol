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
            "sol-snapshot-admission-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("create unique temporary directory");
        Self(root)
    }
}

impl Drop for FixtureDirectory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("remove only this test's temporary directory");
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

fn mutate(value: &mut JsonValue, path: &[JsonValue], replacement: JsonValue) {
    let (key, rest) = path.split_first().expect("nonempty mutation path");
    match value {
        JsonValue::Object(entries) => {
            let (_, child) = entries
                .iter_mut()
                .find(|(name, _)| Some(name.as_str()) == key.as_str())
                .expect("fixture object path exists");
            if rest.is_empty() {
                *child = replacement;
            } else {
                mutate(child, rest, replacement);
            }
        }
        JsonValue::Array(items) => {
            let index = key.as_f64().expect("array index") as usize;
            if rest.is_empty() {
                items[index] = replacement;
            } else {
                mutate(&mut items[index], rest, replacement);
            }
        }
        _ => panic!("invalid fixture mutation path"),
    }
}

fn set(snapshot: &mut JsonValue, path: &str, replacement: JsonValue) {
    let path = parse_json(path).expect("valid path");
    mutate(
        snapshot,
        path.as_array().expect("path is an array"),
        replacement,
    );
}

fn assert_replay_rejected(snapshot: &JsonValue, directory: &Path, id: &str) {
    fs::create_dir(directory).expect("create case directory");
    let input = directory.join("input.json");
    let output = directory.join("output");
    fs::create_dir(&output).expect("create replay output directory");
    let selected = output.join("latest-state.json");
    let sentinel = b"previous verified snapshot";
    fs::write(&input, snapshot.to_compact_string()).expect("write synthetic snapshot");
    fs::write(&selected, sentinel).expect("write sentinel");

    let result = cli(&[
        "replay",
        "--snapshot",
        input.to_str().unwrap(),
        "--out",
        output.to_str().unwrap(),
    ]);
    assert_eq!(result.status.code(), Some(2), "{id}");
    assert_eq!(fs::read(selected).unwrap(), sentinel, "{id}");
}

#[test]
fn replay_rejects_evidence_free_assimilation_without_replacing_output() {
    let root = FixtureDirectory::new();
    let baseline =
        parse_json(include_str!("../../../apps/web/data/latest-state.json")).expect("snapshot");

    let mut assimilation = baseline.clone();
    set(
        &mut assimilation,
        r#"["run","mode"]"#,
        JsonValue::String("Assimilation".into()),
    );
    set(
        &mut assimilation,
        r#"["observations"]"#,
        JsonValue::Array(Vec::new()),
    );
    set(
        &mut assimilation,
        r#"["operational_readiness","data_state","observation_mode"]"#,
        JsonValue::String("none".into()),
    );
    assert_replay_rejected(
        &assimilation,
        &root.0.join("empty-assimilation"),
        "empty assimilation",
    );
}

#[test]
fn replay_rejects_retired_region_without_replacing_output() {
    let root = FixtureDirectory::new();
    let mut retired =
        parse_json(include_str!("../../../apps/web/data/latest-state.json")).expect("snapshot");
    let epoch = 1_209_600.000_001;
    let mut region = retired
        .get("active_regions")
        .and_then(JsonValue::as_array)
        .unwrap()[0]
        .clone();
    set(
        &mut region,
        r#"["model_position","at_time_seconds"]"#,
        JsonValue::Number(epoch),
    );
    set(
        &mut region,
        r#"["model_position","lon_deg"]"#,
        JsonValue::Number(85.412_881_185_031_28),
    );
    for (path, replacement) in [
        (r#"["run","steps"]"#, JsonValue::Number(1.0)),
        (
            r#"["run","dt_hours"]"#,
            JsonValue::Number(336.000_000_000_277_8),
        ),
        (r#"["run","time_seconds"]"#, JsonValue::Number(epoch)),
        (
            r#"["uncertainty","activity","at_time_seconds"]"#,
            JsonValue::Number(epoch),
        ),
        (
            r#"["active_regions"]"#,
            JsonValue::Array(vec![region.clone()]),
        ),
    ] {
        set(&mut retired, path, replacement);
    }
    assert_replay_rejected(&retired, &root.0.join("retired-region"), "retired region");
}
