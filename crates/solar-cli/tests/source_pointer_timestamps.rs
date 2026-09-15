use solar_core::{parse_json, JsonValue};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_FIXTURE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

struct FixtureDirectory(PathBuf);

impl FixtureDirectory {
    fn new(label: &str) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "sol-source-pointer-{label}-{}-{nonce}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).expect("create fixture directory");
        Self(path)
    }
}

impl Drop for FixtureDirectory {
    fn drop(&mut self) {
        let removed = fs::remove_dir_all(&self.0);
        if !std::thread::panicking() {
            removed.expect("remove only this test's unique temporary directory");
        }
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

fn output_text(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec()).expect("CLI output is UTF-8")
}

fn product(product_id: &str, source: &str, path: &str, raw: &str) -> String {
    format!(
        r#"{{"product_id":"{product_id}","source":"{source}","origin":"fixture","observation_time_utc":"2026-09-11T00:00:00.250+00:00","retrieved_at_utc":null,"quality":["offline behavioral fixture"],"failure":null,"license":"synthetic test data","critical":true,"path":"{path}","size_bytes":{},"sha256":"{}"}}"#,
        raw.len(),
        sha256(raw.as_bytes())
    )
}

fn write_source_bundle(root: &Path, f107: &str) -> PathBuf {
    let bundle = root.join("bundles/source");
    fs::create_dir_all(&bundle).unwrap();
    let mag = r#"[{"time_tag":"2026-09-11T00:00:00Z","source":"DSCOVR","active":true}]"#;
    let wind = mag;
    fs::write(bundle.join("mag.json"), mag).unwrap();
    fs::write(bundle.join("wind.json"), wind).unwrap();
    fs::write(bundle.join("f107.json"), f107).unwrap();
    let manifest = format!(
        r#"{{"schema_version":"public-data-cache-manifest.v2","bundle_id":"source","acquired_at_utc":"2026-09-11T00:00:00.250Z","products":[{},{},{}],"failures":[]}}"#,
        product("rtsw_mag_1m.json", "NOAA/SWPC RTSW", "mag.json", mag),
        product("rtsw_wind_1m.json", "NOAA/SWPC RTSW", "wind.json", wind),
        product("f107_cm_flux.json", "NOAA/SWPC F10.7", "f107.json", f107)
    );
    fs::write(bundle.join("manifest.json"), &manifest).unwrap();
    let pointer = format!(
        r#"{{"schema_version":"bundle-pointer.v1","bundle_id":"source","manifest_path":"bundles/source/manifest.json","manifest_sha256":"{}"}}"#,
        sha256(manifest.as_bytes())
    );
    let pointer_path = root.join("current.json");
    fs::write(&pointer_path, pointer).unwrap();
    pointer_path
}

fn signal(report: &JsonValue) -> &JsonValue {
    report
        .get("frames")
        .and_then(JsonValue::as_array)
        .unwrap()
        .iter()
        .find(|frame| frame.get("id").and_then(JsonValue::as_str) == Some("swpc-f107-cm-flux"))
        .expect("F10.7 signal frame")
}

fn run_pipeline(root: &Path, f107: &str, as_of: &str) -> JsonValue {
    let pointer = write_source_bundle(root, f107);
    let report_path = root.join("observations.json");
    let snapshot_path = root.join("snapshot.json");
    let replay_path = root.join("replay");
    let ingested = cli(&[
        "ingest",
        "swpc",
        "--source-pointer",
        pointer.to_str().unwrap(),
        "--as-of-unix-seconds",
        as_of,
        "--out",
        report_path.to_str().unwrap(),
    ]);
    assert!(
        ingested.status.success(),
        "{}",
        output_text(&ingested.stderr)
    );
    let report = parse_json(&fs::read_to_string(&report_path).unwrap()).unwrap();
    assert!(
        report.get("observed_context").is_some(),
        "ingested report did not retain F10.7 context: {}; source manifest: {}; F10.7: {}",
        report.to_compact_string(),
        fs::read_to_string(root.join("bundles/source/manifest.json")).unwrap(),
        fs::read_to_string(root.join("bundles/source/f107.json")).unwrap()
    );

    let simulated = cli(&[
        "simulate",
        "--steps",
        "0",
        "--activity",
        "0.9",
        "--observations",
        report_path.to_str().unwrap(),
        "--out",
        snapshot_path.to_str().unwrap(),
    ]);
    assert!(
        simulated.status.success(),
        "{}",
        output_text(&simulated.stderr)
    );
    let replayed = cli(&[
        "replay",
        "--snapshot",
        snapshot_path.to_str().unwrap(),
        "--out",
        replay_path.to_str().unwrap(),
    ]);
    assert!(
        replayed.status.success(),
        "{}",
        output_text(&replayed.stderr)
    );
    assert_eq!(
        fs::read(replay_path.join("latest-state.json")).unwrap(),
        fs::read(snapshot_path).unwrap()
    );
    report
}

#[test]
fn source_pointer_pipeline_accepts_each_explicit_utc_spelling() {
    for (index, time_tag) in [
        "2026-09-11T00:00:00Z",
        "2026-09-11T00:00:00.500Z",
        "2026-09-11T00:00:00+00:00",
        "2026-09-11T00:00:00.500+00:00",
    ]
    .into_iter()
    .enumerate()
    {
        let root = FixtureDirectory::new(&format!("utc-form-{index}"));
        let raw = format!(r#"[{{"time_tag":"{time_tag}","flux":150}}]"#);
        let report = run_pipeline(&root.0, &raw, "1789084801");
        let provenance = signal(&report).get("provenance").unwrap();
        assert_eq!(
            provenance.get("time_tag").and_then(JsonValue::as_str),
            Some(time_tag)
        );
        assert_eq!(
            provenance
                .get("raw_source_metadata")
                .unwrap()
                .get("time_tag")
                .and_then(JsonValue::as_str),
            Some(time_tag),
            "the original source timestamp bytes must not be normalized"
        );
    }
}

#[test]
fn source_pointer_pipeline_uses_fractional_order_and_unrounded_freshness() {
    let under = FixtureDirectory::new("freshness-under");
    let report = run_pipeline(
        &under.0,
        r#"[
          {"time_tag":"2026-09-11T00:00:00.000001Z","flux":150},
          {"time_tag":"2026-09-11T00:00:00.000000+00:00","flux":235}
        ]"#,
        "1789257600",
    );
    assert_eq!(
        signal(&report)
            .get("provenance")
            .unwrap()
            .get("time_tag")
            .and_then(JsonValue::as_str),
        Some("2026-09-11T00:00:00.000001Z"),
        "subsecond ordering must select the genuinely newest row"
    );
    let freshness = report
        .get("observed_context")
        .unwrap()
        .get("signal_freshness")
        .unwrap()
        .get("swpc-f107-cm-flux")
        .unwrap();
    assert_eq!(
        freshness.get("age_hours").and_then(JsonValue::as_f64),
        Some(48.0)
    );
    assert_eq!(
        freshness.get("stale").and_then(JsonValue::as_bool),
        Some(false)
    );

    let over = FixtureDirectory::new("freshness-over");
    let report = run_pipeline(
        &over.0,
        r#"[{"time_tag":"2026-09-10T23:59:59.999999+00:00","flux":150}]"#,
        "1789257600",
    );
    let freshness = report
        .get("observed_context")
        .unwrap()
        .get("signal_freshness")
        .unwrap()
        .get("swpc-f107-cm-flux")
        .unwrap();
    assert_eq!(
        freshness.get("age_hours").and_then(JsonValue::as_f64),
        Some(48.0)
    );
    assert_eq!(
        freshness.get("stale").and_then(JsonValue::as_bool),
        Some(true)
    );
}

// FIPS 180-4 SHA-256 for dynamically generated immutable test bundles.
fn sha256(bytes: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut data = bytes.to_vec();
    data.push(0x80);
    while data.len() % 64 != 56 {
        data.push(0);
    }
    data.extend_from_slice(&((bytes.len() as u64) * 8).to_be_bytes());
    let mut state: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    for chunk in data.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (index, part) in chunk.chunks_exact(4).enumerate() {
            w[index] = u32::from_be_bytes([part[0], part[1], part[2], part[3]]);
        }
        for index in 16..64 {
            let a = w[index - 15];
            let b = w[index - 2];
            w[index] = w[index - 16]
                .wrapping_add(a.rotate_right(7) ^ a.rotate_right(18) ^ (a >> 3))
                .wrapping_add(w[index - 7])
                .wrapping_add(b.rotate_right(17) ^ b.rotate_right(19) ^ (b >> 10));
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = state;
        for index in 0..64 {
            let t1 = h
                .wrapping_add(e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25))
                .wrapping_add((e & f) ^ (!e & g))
                .wrapping_add(K[index])
                .wrapping_add(w[index]);
            let t2 = (a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22))
                .wrapping_add((a & b) ^ (a & c) ^ (b & c));
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (value, next) in state.iter_mut().zip([a, b, c, d, e, f, g, h]) {
            *value = value.wrapping_add(next);
        }
    }
    state.iter().map(|value| format!("{value:08x}")).collect()
}
