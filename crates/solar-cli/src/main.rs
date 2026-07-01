use solar_core::{
    advance_flux_transport, solar_state_snapshot_json, FluxTransportConfig, SnapshotRequest,
    SolarGrid, SolarMode, SolarState, SyntheticConfig, SyntheticSolarModel,
};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;

fn main() {
    if let Err(err) = run() {
        eprintln!("solar-cli: {err}");
        process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("simulate") => simulate_command(&args[1..]),
        Some("ingest") => ingest_command(&args[1..]),
        Some("replay") => replay_command(&args[1..]),
        Some("-h") | Some("--help") | None => {
            print_help();
            Ok(())
        }
        _ => legacy_summary(&args),
    }
}

fn simulate_command(args: &[String]) -> Result<(), String> {
    let steps = parse_or_default(args, "--steps", 24usize)?;
    let dt_hours = parse_or_default(args, "--dt-hours", 1.0f64)?;
    let seed = parse_or_default(args, "--seed", 42u64)?;
    let out = required_path(args, "--out")?;

    let (state, activity_index) = simulate_state(steps, dt_hours, seed);
    let snapshot = solar_state_snapshot_json(
        &state,
        &SnapshotRequest::synthetic(seed, steps, dt_hours, activity_index),
    );
    write_text(&out, &snapshot)?;
    println!("wrote snapshot={}", out.display());
    println!("source_mode=synthetic steps={steps} dt_hours={dt_hours} seed={seed}");
    Ok(())
}

fn ingest_command(args: &[String]) -> Result<(), String> {
    match args.first().map(String::as_str) {
        Some("swpc") => ingest_swpc_command(&args[1..]),
        _ => Err("expected ingest swpc".to_string()),
    }
}

fn ingest_swpc_command(args: &[String]) -> Result<(), String> {
    let cache = optional_path(args, "--cache");
    let out = required_path(args, "--out")?;
    let fallback = optional_path(args, "--fallback-fixtures")
        .or_else(|| Some(PathBuf::from("tests").join("swpc_scn26_21")));

    if let Some(cache_dir) = &cache {
        fs::create_dir_all(cache_dir)
            .map_err(|err| format!("create cache {}: {err}", cache_dir.display()))?;
    }

    let json = solar_ingest::swpc_observation_report_json(cache.as_deref(), fallback.as_deref())?;
    write_text(&out, &json)?;
    println!("wrote observations={}", out.display());
    println!(
        "cache={} fallback={}",
        display_optional(&cache),
        display_optional(&fallback)
    );
    Ok(())
}

fn replay_command(args: &[String]) -> Result<(), String> {
    let snapshot = required_path(args, "--snapshot")?;
    let out_dir = required_path(args, "--out")?;
    let raw = fs::read_to_string(&snapshot)
        .map_err(|err| format!("read snapshot {}: {err}", snapshot.display()))?;
    if !raw.contains("\"schema_version\": \"solar-state-snapshot.v1\"")
        && !raw.contains("\"schema_version\":\"solar-state-snapshot.v1\"")
    {
        return Err(format!(
            "{} is not a solar-state-snapshot.v1 file",
            snapshot.display()
        ));
    }
    fs::create_dir_all(&out_dir).map_err(|err| format!("create {}: {err}", out_dir.display()))?;
    let target = out_dir.join("latest-state.json");
    write_text(&target, &raw)?;
    write_text(
        &out_dir.join("replay-manifest.json"),
        &format!(
            "{{\n  \"schema_version\": \"model-run-manifest.v1\",\n  \"source_snapshot\": \"{}\",\n  \"web_entry\": \"latest-state.json\"\n}}\n",
            escape_json(&snapshot.display().to_string())
        ),
    )?;
    println!("wrote replay_data={}", target.display());
    Ok(())
}

fn legacy_summary(args: &[String]) -> Result<(), String> {
    let steps = parse_or_default(args, "--steps", 24usize)?;
    let dt_hours = parse_or_default(args, "--dt-hours", 1.0f64)?;
    let seed = parse_or_default(args, "--seed", 42u64)?;
    let (state, _) = simulate_state(steps, dt_hours, seed);

    println!("Solar Maximum Engine v0.1 CPU reference");
    println!("steps={steps} dt_hours={dt_hours} seed={seed}");
    println!("time_days={:.2}", state.time_seconds / 86_400.0);
    println!("active_regions={}", state.active_regions.len());
    println!("br_max_abs={:.4}", state.br.max_abs());
    println!(
        "continuum_min={:.4}",
        state
            .continuum
            .values
            .iter()
            .fold(f32::INFINITY, |a, &b| a.min(b))
    );
    Ok(())
}

fn simulate_state(steps: usize, dt_hours: f64, seed: u64) -> (SolarState, f32) {
    let activity_index = 0.9;
    let grid = SolarGrid::new(144, 72);
    let mut state = SolarState::new(grid.clone(), SolarMode::Synthetic);
    let mut model = SyntheticSolarModel::new(SyntheticConfig {
        seed,
        activity_index,
        ..SyntheticConfig::default()
    });
    let cfg = FluxTransportConfig::default();

    for _ in 0..steps {
        let births = model.generate_births(state.time_seconds, dt_hours * 3600.0, &grid);
        state.active_regions.extend(births);
        advance_flux_transport(&mut state, dt_hours * 3600.0, &cfg);
    }

    (state, activity_index)
}

fn write_text(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("create {}: {err}", parent.display()))?;
        }
    }
    fs::write(path, content).map_err(|err| format!("write {}: {err}", path.display()))
}

fn required_path(args: &[String], flag: &str) -> Result<PathBuf, String> {
    optional_path(args, flag).ok_or_else(|| format!("missing required {flag} <path>"))
}

fn optional_path(args: &[String], flag: &str) -> Option<PathBuf> {
    value_after(args, flag).map(PathBuf::from)
}

fn parse_or_default<T>(args: &[String], flag: &str, default: T) -> Result<T, String>
where
    T: std::str::FromStr,
{
    match value_after(args, flag) {
        Some(value) => value
            .parse::<T>()
            .map_err(|_| format!("invalid value for {flag}: {value}")),
        None => Ok(default),
    }
}

fn value_after<'a>(args: &'a [String], flag: &str) -> Option<&'a String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
}

fn display_optional(path: &Option<PathBuf>) -> String {
    path.as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "none".to_string())
}

fn escape_json(value: &str) -> String {
    value
        .chars()
        .flat_map(|ch| match ch {
            '"' => "\\\"".chars().collect::<Vec<_>>(),
            '\\' => "\\\\".chars().collect::<Vec<_>>(),
            '\n' => "\\n".chars().collect::<Vec<_>>(),
            '\r' => "\\r".chars().collect::<Vec<_>>(),
            '\t' => "\\t".chars().collect::<Vec<_>>(),
            c => vec![c],
        })
        .collect()
}

fn print_help() {
    println!("Solar Maximum Engine");
    println!("Commands:");
    println!("  solar-cli simulate --steps <n> --dt-hours <h> --seed <seed> --out <snapshot.json>");
    println!(
        "  solar-cli ingest swpc --cache <dir> --out <observations.json> --fallback-fixtures <dir>"
    );
    println!("  solar-cli replay --snapshot <snapshot.json> --out <web-data-dir>");
}
