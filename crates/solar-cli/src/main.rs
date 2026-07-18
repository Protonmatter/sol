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
        Some(first) if first.starts_with('-') => legacy_summary(&args),
        Some(other) => Err(format!(
            "unknown command '{other}' (expected simulate, ingest, or replay — see --help)"
        )),
    }
}

fn simulate_command(args: &[String]) -> Result<(), String> {
    let steps = parse_or_default(args, "--steps", 24usize)?;
    let dt_hours = parse_finite(args, "--dt-hours", 1.0f64)?.clamp(0.001, 8760.0);
    let seed = parse_or_default(args, "--seed", 42u64)?;
    let activity = (parse_finite(args, "--activity", 0.9f64)? as f32).clamp(0.0, 1.0);
    let out = required_path(args, "--out")?;
    validate_run_span(steps, dt_hours)?;

    let state = simulate_state(steps, dt_hours, seed, activity);
    let snapshot = solar_state_snapshot_json(
        &state,
        &SnapshotRequest::synthetic(seed, steps, dt_hours, activity),
    );
    write_text(&out, &snapshot)?;
    println!("wrote snapshot={}", out.display());
    println!(
        "schema=solar-state-snapshot.v2 source_mode=synthetic steps={steps} dt_hours={dt_hours} seed={seed} activity={activity} internal_max_step_hours=1"
    );
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
    if !raw.contains("\"schema_version\": \"solar-state-snapshot.v2\"")
        && !raw.contains("\"schema_version\":\"solar-state-snapshot.v2\"")
    {
        return Err(format!(
            "{} is not a solar-state-snapshot.v2 file",
            snapshot.display()
        ));
    }
    if !raw.contains("\"frame\": \"heliographic_carrington\"")
        && !raw.contains("\"frame\":\"heliographic_carrington\"")
    {
        return Err(format!(
            "{} lacks required Carrington coordinate metadata",
            snapshot.display()
        ));
    }
    fs::create_dir_all(&out_dir).map_err(|err| format!("create {}: {err}", out_dir.display()))?;
    let target = out_dir.join("latest-state.json");
    write_text(&target, &raw)?;
    write_text(
        &out_dir.join("replay-manifest.json"),
        &format!(
            "{{\n  \"schema_version\": \"model-run-manifest.v1\",\n  \"source_snapshot\": \"{}\",\n  \"snapshot_contract\": \"solar-state-snapshot.v2\",\n  \"web_entry\": \"latest-state.json\"\n}}\n",
            escape_json(&snapshot.display().to_string())
        ),
    )?;
    println!("wrote replay_data={}", target.display());
    Ok(())
}

fn legacy_summary(args: &[String]) -> Result<(), String> {
    let steps = parse_or_default(args, "--steps", 24usize)?;
    let dt_hours = parse_finite(args, "--dt-hours", 1.0f64)?.clamp(0.001, 8760.0);
    let seed = parse_or_default(args, "--seed", 42u64)?;
    let activity = (parse_finite(args, "--activity", 0.9f64)? as f32).clamp(0.0, 1.0);
    validate_run_span(steps, dt_hours)?;
    let state = simulate_state(steps, dt_hours, seed, activity);

    println!("Solar Maximum Engine v0.2 CPU reference");
    println!("steps={steps} dt_hours={dt_hours} seed={seed} internal_max_step_hours=1");
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

fn validate_run_span(steps: usize, dt_hours: f64) -> Result<(), String> {
    let total_seconds = steps as f64 * dt_hours * 3600.0;
    if !total_seconds.is_finite() {
        return Err("steps * dt-hours exceeds finite simulation time".to_string());
    }
    Ok(())
}

fn simulate_state(steps: usize, dt_hours: f64, seed: u64, activity_index: f32) -> SolarState {
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

    state
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

fn parse_finite(args: &[String], flag: &str, default: f64) -> Result<f64, String> {
    let value = parse_or_default(args, flag, default)?;
    if !value.is_finite() {
        return Err(format!("invalid value for {flag}: must be a finite number"));
    }
    Ok(value)
}

fn value_after<'a>(args: &'a [String], flag: &str) -> Option<&'a String> {
    args.iter()
        .position(|argument| argument == flag)
        .and_then(|index| args.get(index + 1))
}

fn display_optional(path: &Option<PathBuf>) -> String {
    path.as_ref()
        .map(|value| value.display().to_string())
        .unwrap_or_else(|| "none".to_string())
}

fn escape_json(value: &str) -> String {
    value
        .chars()
        .flat_map(|character| match character {
            '"' => "\\\"".chars().collect::<Vec<_>>(),
            '\\' => "\\\\".chars().collect::<Vec<_>>(),
            '\n' => "\\n".chars().collect::<Vec<_>>(),
            '\r' => "\\r".chars().collect::<Vec<_>>(),
            '\t' => "\\t".chars().collect::<Vec<_>>(),
            other => vec![other],
        })
        .collect()
}

fn print_help() {
    println!("Solar Maximum Engine");
    println!("Commands:");
    println!("  solar-cli simulate --steps <n> --dt-hours <h> --seed <seed> --activity <0..1> --out <snapshot.json>");
    println!("    Public dt-hours is internally subdivided to at most one-hour physics steps.");
    println!(
        "  solar-cli ingest swpc --cache <dir> --out <observations.json> --fallback-fixtures <dir>"
    );
    println!("  solar-cli replay --snapshot <solar-state-snapshot.v2> --out <web-data-dir>");
}
