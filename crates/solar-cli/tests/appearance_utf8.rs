//! Regression for Windows locale re-encoding at the Python -> native boundary.
use solar_core::{solar_state_snapshot_json, SnapshotRequest, SolarGrid, SolarMode, SolarState};
use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
#[test]
fn python_shared_admission_preserves_non_ascii_source_utf8() {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let temp_parent = std::env::temp_dir().canonicalize().unwrap();
    let directory = temp_parent.join(format!(
        "sol-appearance-utf8-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&directory).unwrap();
    let state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
    let mut request = SnapshotRequest::synthetic(42, 0, 1.0, 0.5);
    request
        .warnings
        .push("Unicode source metadata: \u{00c5} \u{00b5} \u{03b5}");
    fs::write(
        directory.join("source.json"),
        solar_state_snapshot_json(&state, &request),
    )
    .unwrap();
    let script = r#"
import sys,pathlib,json,hashlib,subprocess
root=pathlib.Path(sys.argv[1]);directory=pathlib.Path(sys.argv[2]);binary=sys.argv[3]
source=(directory/'source.json').read_bytes()
assert any(v>127 for v in source), 'fixture must contain non-ASCII UTF-8'
manifest={'schema_version':'solar-appearance-source-sequence.v1','field_authority':'normalized_model','snapshots':[{'path':'source.json','sha256':hashlib.sha256(source).hexdigest()}]}
(directory/'sequence.json').write_text(json.dumps(manifest),encoding='utf-8')
subprocess.run([binary,'appearance','prepare-sequence','--sequence',str(directory/'sequence.json'),'--out',str(directory/'derived'),'--lmax','2','--count','4'],check=True,stdout=subprocess.DEVNULL)
sys.path.insert(0,str(root/'tools'))
from validate_solar_dynamic import validate
assert validate(directory/'derived/manifest.json',directory)['valid']
print('UTF-8 source admission passed')
"#;
    let result = Command::new(std::env::var("PYTHON").unwrap_or_else(|_| "python".into()))
        .args(["-c", script])
        .arg(&workspace)
        .arg(&directory)
        .arg(env!("CARGO_BIN_EXE_solar-cli"))
        .env("PYTHONUTF8", "0")
        .env("PYTHONIOENCODING", "cp1252")
        .current_dir(&workspace)
        .output()
        .unwrap();
    // Cleanup is restricted to the unique directory this test created.
    let canonical = directory.canonicalize().unwrap();
    assert_eq!(canonical.parent(), Some(temp_parent.as_path()));
    assert!(canonical
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("sol-appearance-utf8-"));
    fs::remove_dir_all(canonical).unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}
