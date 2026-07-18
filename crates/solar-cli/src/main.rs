use solar_core::{
    advance_flux_transport, assimilate_activity, parse_json, solar_state_snapshot_json,
    ActivityObservation, Field2D, FluxTransportConfig, JsonValue, SnapshotRequest, SolarGrid,
    SolarMode, SolarState, SyntheticConfig, SyntheticSolarModel,
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
    let observations = optional_path(args, "--observations");
    validate_run_span(steps, dt_hours)?;

    // ADR 0005: an observation report corrects the SCALAR activity forecast through the
    // tested Kalman primitive before the transport run. Absent the flag, this path is
    // byte-identical to the historical synthetic behavior (the determinism matrix runs
    // without it and must never notice this feature exists).
    let outcome = match &observations {
        Some(path) => {
            let text = fs::read_to_string(path)
                .map_err(|err| format!("read observations {}: {err}", path.display()))?;
            Some(assess_observations(&text, activity)?)
        }
        None => None,
    };
    let analysis_activity = outcome
        .as_ref()
        .map(|o| o.analysis_activity)
        .unwrap_or(activity);

    let mut state = simulate_state(steps, dt_hours, seed, analysis_activity);
    let snapshot = match &outcome {
        Some(o) if o.assimilated => {
            state.mode = SolarMode::Assimilation;
            // v1 scope: the scalar activity analysis is the ONLY corrected quantity; the
            // variance field carries its analysis variance uniformly, and a warning says
            // exactly that. Painting spatial structure from a scalar would fabricate
            // what was not observed.
            state.br_variance =
                Field2D::filled(state.br_variance.values.len(), o.analysis_variance);
            let mut request = SnapshotRequest::synthetic(seed, steps, dt_hours, analysis_activity);
            request.source_mode = &o.source_mode;
            request.observations_json = Some(&o.observations_json);
            for warning in &o.warnings {
                request.warnings.push(warning);
            }
            solar_state_snapshot_json(&state, &request)
        }
        Some(o) => {
            // Observations present but unusable: stay Synthetic and say why — degraded
            // inputs must never inflate the mode.
            let mut request = SnapshotRequest::synthetic(seed, steps, dt_hours, analysis_activity);
            for warning in &o.warnings {
                request.warnings.push(warning);
            }
            solar_state_snapshot_json(&state, &request)
        }
        None => solar_state_snapshot_json(
            &state,
            &SnapshotRequest::synthetic(seed, steps, dt_hours, analysis_activity),
        ),
    };
    write_text(&out, &snapshot)?;
    println!("wrote snapshot={}", out.display());
    let (mode_label, source_label) = match &outcome {
        Some(o) if o.assimilated => ("Assimilation", o.source_mode.as_str()),
        _ => ("Synthetic", "synthetic"),
    };
    println!(
        "schema=solar-state-snapshot.v2 mode={mode_label} source_mode={source_label} steps={steps} dt_hours={dt_hours} seed={seed} activity={analysis_activity} internal_max_step_hours=1"
    );
    if let Some(o) = &outcome {
        println!(
            "observations: assimilated={} forecast_activity={activity} analysis_activity={} freshness_gain={:.3} usable_frames={}",
            o.assimilated, o.analysis_activity, o.freshness_gain, o.usable_frames
        );
    }
    Ok(())
}

/// Everything `simulate --observations` derives from one report file. Pure and
/// deterministic: every number comes from the file's own content, never the clock.
struct ObservationOutcome {
    assimilated: bool,
    analysis_activity: f32,
    analysis_variance: f32,
    freshness_gain: f32,
    usable_frames: usize,
    source_mode: String,
    /// Embedded verbatim into the snapshot's `observations` array: the report envelope
    /// with its frames, minus bulk (adapter_health / observed_context).
    observations_json: String,
    warnings: Vec<String>,
}

/// Forecast-error variance for the scalar activity prior (σ = 0.2: the synthetic
/// default is a broad guess) and observation-error variance for the pipeline's
/// multi-proxy activity index (σ = 0.1: the blend of region/sunspot/flare/F10.7
/// proxies scatters roughly that much against each other).
const ACTIVITY_FORECAST_VARIANCE: f32 = 0.04;
const ACTIVITY_OBSERVATION_VARIANCE: f32 = 0.01;

fn assess_observations(
    report_text: &str,
    forecast_activity: f32,
) -> Result<ObservationOutcome, String> {
    let report = parse_json(report_text).map_err(|err| format!("observations file: {err}"))?;
    let schema = report
        .get("schema_version")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if schema != "observation-frame.v1" {
        return Err(format!(
            "observations file is {schema:?}, expected \"observation-frame.v1\""
        ));
    }

    let frames = report
        .get("frames")
        .and_then(|v| v.as_array())
        .unwrap_or(&[]);
    // Only frames with attributable provenance qualify as embeddable evidence — the
    // snapshot contract requires provenance.source on every attached frame, and it is
    // right to: evidence you cannot attribute is not evidence. The rest still informed
    // the pipeline's activity index; they are counted and disclosed, not embedded.
    let evidence: Vec<JsonValue> = frames
        .iter()
        .filter(|frame| {
            frame
                .get("provenance")
                .and_then(|p| p.get("source"))
                .and_then(|s| s.as_str())
                .is_some_and(|s| !s.trim().is_empty())
        })
        .cloned()
        .collect();
    let observed_activity = report
        .get("observed_context")
        .and_then(|c| c.get("activity_index"))
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite());
    // Freshness is judged from the report's own generation-time evaluation (age vs the
    // per-feed limits), so the run is reproducible from the file alone: the gain is the
    // fraction of feeds that were fresh when the report was written.
    let (fresh, total) = report
        .get("observed_context")
        .and_then(|c| c.get("signal_freshness"))
        .map(|freshness| match freshness {
            JsonValue::Object(entries) => {
                let total = entries.len();
                let fresh = entries
                    .iter()
                    .filter(|(_, entry)| {
                        entry.get("stale").and_then(|s| s.as_bool()) == Some(false)
                    })
                    .count();
                (fresh, total)
            }
            _ => (0, 0),
        })
        .unwrap_or((0, 0));
    let freshness_gain = if total == 0 {
        0.0
    } else {
        fresh as f32 / total as f32
    };
    let report_source_mode = report
        .get("source_mode")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    let usable = observed_activity.is_some() && !evidence.is_empty() && freshness_gain > 0.0;
    if !usable {
        let reason = if observed_activity.is_none() {
            "no finite observed_context.activity_index"
        } else if evidence.is_empty() {
            "no observation frames with attributable provenance"
        } else {
            "every observation feed was stale at generation"
        };
        return Ok(ObservationOutcome {
            assimilated: false,
            analysis_activity: forecast_activity,
            analysis_variance: ACTIVITY_FORECAST_VARIANCE,
            freshness_gain,
            usable_frames: 0,
            source_mode: "synthetic".to_string(),
            observations_json: String::new(),
            warnings: vec![format!(
                "Observation report was not usable ({reason}); the run remains synthetic."
            )],
        });
    }

    let obs = ActivityObservation {
        value: observed_activity.unwrap_or(f64::from(forecast_activity)) as f32,
        variance: ACTIVITY_OBSERVATION_VARIANCE,
        freshness_gain,
    };
    let (analysis_activity, analysis_variance) =
        assimilate_activity(forecast_activity, ACTIVITY_FORECAST_VARIANCE, &obs);

    // Embed the report envelope + frames (order preserved) as the snapshot's evidence.
    let embedded = vec![
        (
            "schema_version".to_string(),
            JsonValue::String(schema.to_string()),
        ),
        (
            "source_mode".to_string(),
            JsonValue::String(report_source_mode.to_string()),
        ),
        ("frames".to_string(), JsonValue::Array(evidence.clone())),
    ];
    let observations_json = JsonValue::Array(vec![JsonValue::Object(embedded)]).to_compact_string();

    let mut warnings = vec![
        "Assimilation corrected the scalar activity index only; surface fields remain synthetic."
            .to_string(),
    ];
    if fresh < total {
        warnings.push(format!(
            "{} of {} observation feeds were stale at report generation; the update was damped accordingly.",
            total - fresh,
            total
        ));
    }
    if evidence.len() < frames.len() {
        warnings.push(format!(
            "{} of {} observation frames lacked attributable provenance and are not embedded as evidence (they still informed the pipeline's activity index).",
            frames.len() - evidence.len(),
            frames.len()
        ));
    }

    Ok(ObservationOutcome {
        assimilated: true,
        analysis_activity,
        analysis_variance,
        freshness_gain,
        usable_frames: evidence.len(),
        source_mode: format!("assimilated+{report_source_mode}"),
        observations_json,
        warnings,
    })
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
    println!("  solar-cli simulate --steps <n> --dt-hours <h> --seed <seed> --activity <0..1> --out <snapshot.json> [--observations <observations.json>]");
    println!("    Public dt-hours is internally subdivided to at most one-hour physics steps.");
    println!("    --observations: an observation-frame.v1 report; a usable report corrects the");
    println!("    scalar activity forecast (Kalman update, freshness-damped) and the snapshot");
    println!("    is emitted in Assimilation mode with the frames embedded as evidence.");
    println!(
        "  solar-cli ingest swpc --cache <dir> --out <observations.json> --fallback-fixtures <dir>"
    );
    println!("  solar-cli replay --snapshot <solar-state-snapshot.v2> --out <web-data-dir>");
}

#[cfg(test)]
mod tests {
    use super::*;

    const USABLE_REPORT: &str = r#"{
      "schema_version": "observation-frame.v1",
      "source_mode": "cached",
      "observed_context": {
        "activity_index": 0.972059,
        "signal_freshness": {
          "a": {"stale": false}, "b": {"stale": false},
          "c": {"stale": false}, "d": {"stale": true}
        }
      },
      "frames": [
        {"id": "swpc-rtsw-mag-1m", "source_mode": "cached", "schema_version": "observation-frame.v1",
         "provenance": {"source": "SOLAR1", "time_tag": "2026-07-02T03:19:00"}},
        {"id": "swpc-solar-regions", "source_mode": "cached", "schema_version": "observation-frame.v1",
         "provenance": {"active": true}}
      ]
    }"#;

    #[test]
    fn usable_report_produces_a_damped_kalman_correction() {
        let outcome = assess_observations(USABLE_REPORT, 0.9).unwrap();
        assert!(outcome.assimilated);
        // Two frames in the report, but only the provenance-attributed one is evidence.
        assert_eq!(outcome.usable_frames, 1);
        assert!(outcome.observations_json.contains("swpc-rtsw-mag-1m"));
        assert!(!outcome.observations_json.contains("swpc-solar-regions"));
        assert!(outcome
            .warnings
            .iter()
            .any(|w| w.contains("lacked attributable provenance")));
        assert!((outcome.freshness_gain - 0.75).abs() < 1e-6, "3 of 4 fresh");
        // g = 0.75 * K, K = 0.04/(0.04+0.01) = 0.8 -> x_a = 0.9 + 0.6 * 0.072059.
        assert!((outcome.analysis_activity - 0.943_235).abs() < 1e-4);
        assert!(outcome.analysis_variance < ACTIVITY_FORECAST_VARIANCE);
        assert_eq!(outcome.source_mode, "assimilated+cached");
        assert!(outcome.observations_json.starts_with('['));
        assert!(outcome.observations_json.contains("\"frames\""));
        assert!(outcome.warnings.iter().any(|w| w.contains("stale")));
    }

    #[test]
    fn all_stale_feeds_keep_the_run_synthetic() {
        let report = USABLE_REPORT.replace("{\"stale\": false}", "{\"stale\": true}");
        let outcome = assess_observations(&report, 0.9).unwrap();
        assert!(!outcome.assimilated);
        assert_eq!(outcome.analysis_activity, 0.9);
        assert_eq!(outcome.source_mode, "synthetic");
        assert!(outcome.warnings[0].contains("stale"));
    }

    #[test]
    fn missing_activity_or_frames_keep_the_run_synthetic() {
        let no_context = r#"{"schema_version": "observation-frame.v1", "frames": [{"id": "x"}]}"#;
        assert!(!assess_observations(no_context, 0.9).unwrap().assimilated);
        let no_frames = r#"{"schema_version": "observation-frame.v1",
          "observed_context": {"activity_index": 0.9, "signal_freshness": {"a": {"stale": false}}},
          "frames": []}"#;
        assert!(!assess_observations(no_frames, 0.9).unwrap().assimilated);
    }

    #[test]
    fn wrong_schema_or_malformed_json_is_an_error_not_a_guess() {
        assert!(assess_observations("{\"schema_version\": \"other.v9\"}", 0.9).is_err());
        assert!(assess_observations("not json at all", 0.9).is_err());
    }

    #[test]
    fn assimilated_snapshot_carries_the_mode_and_the_evidence() {
        let outcome = assess_observations(USABLE_REPORT, 0.9).unwrap();
        let mut state = simulate_state(4, 1.0, 42, outcome.analysis_activity);
        state.mode = SolarMode::Assimilation;
        state.br_variance =
            Field2D::filled(state.br_variance.values.len(), outcome.analysis_variance);
        let mut request = SnapshotRequest::synthetic(42, 4, 1.0, outcome.analysis_activity);
        request.source_mode = &outcome.source_mode;
        request.observations_json = Some(&outcome.observations_json);
        for warning in &outcome.warnings {
            request.warnings.push(warning);
        }
        let json = solar_state_snapshot_json(&state, &request);
        assert!(json.contains("\"mode\": \"Assimilation\""));
        assert!(json.contains("\"source_mode\": \"assimilated+cached\""));
        assert!(json.contains("\"observation_mode\": \"assimilated+cached\""));
        assert!(json.contains("swpc-rtsw-mag-1m"));
        assert!(json.contains("surface fields remain synthetic"));
    }
}
