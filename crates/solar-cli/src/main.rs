use solar_core::{
    advance_flux_transport, assimilate_activity, parse_json, solar_state_snapshot_json,
    ActivityObservation, ActivityUncertainty, FluxTransportConfig, JsonValue, SnapshotRequest,
    SolarGrid, SolarMode, SolarState, SyntheticConfig, SyntheticSolarModel,
};
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process;
use std::sync::atomic::{AtomicU64, Ordering};

mod bundle_intake;
mod provenance;
mod snapshot_validation;
mod snapshot_validation_v2;

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
    let bundle_pointer = optional_path(args, "--bundle-pointer");
    if observations.is_some() && bundle_pointer.is_some() {
        return Err("--observations and --bundle-pointer are mutually exclusive".into());
    }
    let noise = parse_finite(args, "--process-noise-per-day", 0.0)?;
    let mut uncertainty = ActivityUncertainty::new(0.04, noise)?;
    validate_run_span(steps, dt_hours)?;

    // ADR 0005: an observation report corrects the SCALAR activity forecast through the
    // tested Kalman primitive before the transport run. Absent the flag, this path is
    // byte-identical to the historical synthetic behavior (the determinism matrix runs
    // without it and must never notice this feature exists).
    let outcome = if let Some(pointer) = &bundle_pointer {
        let bundle = bundle_intake::resolve(pointer, false)?;
        Some(assess_observations(
            bundle
                .components
                .get("observations")
                .ok_or("bundle observations missing")?,
            activity,
        )?)
    } else {
        match &observations {
            Some(path) => {
                let text = fs::read_to_string(path)
                    .map_err(|err| format!("read observations {}: {err}", path.display()))?;
                Some(assess_observations(&text, activity)?)
            }
            None => None,
        }
    };
    let analysis_activity = outcome
        .as_ref()
        .map(|o| o.analysis_activity)
        .unwrap_or(activity);

    if let Some(o) = &outcome {
        if o.assimilated {
            uncertainty.record_analysis(f64::from(o.analysis_variance))?;
        }
    }
    let mut state =
        simulate_state_with_uncertainty(steps, dt_hours, seed, analysis_activity, uncertainty)?;
    let snapshot = match &outcome {
        Some(o) if o.assimilated => {
            state.mode = SolarMode::Assimilation;
            // Scalar uncertainty is distinct from unavailable magnetic covariance.
            let mut request = SnapshotRequest::synthetic(seed, steps, dt_hours, analysis_activity);
            request.source_mode = &o.source_mode;
            request.observations_json = Some(&o.observations_json);
            request.observed_context_json = Some(&o.observed_context_json);
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
        "schema=solar-state-snapshot.v3 mode={mode_label} source_mode={source_label} steps={steps} dt_hours={dt_hours} seed={seed} activity={analysis_activity} internal_max_step_hours=1"
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
    /// with only inadmissible frames removed.
    observations_json: String,
    /// The validated context that determined activity and freshness, preserved at the
    /// snapshot top level for audit and deterministic reproduction.
    observed_context_json: String,
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
    // Use the same complete frame contract as replay. Evidence rejected here cannot
    // influence the analysis or make a newly produced snapshot fail later admission.
    let evidence: Vec<JsonValue> = frames
        .iter()
        .filter(|frame| snapshot_validation::validate_observation_frame(frame).is_ok())
        .cloned()
        .collect();
    let context = report.get("observed_context").and_then(|value| {
        snapshot_validation::assess_observed_context(value)
            .ok()
            .map(|assessment| (value, assessment))
    });
    let observed_activity = context.map(|(_, assessment)| assessment.activity_index);
    // Freshness is judged from the report's own generation-time evaluation (age vs the
    // per-feed limits), so the run is reproducible from the file alone: the gain is the
    // fraction of feeds that were fresh when the report was written.
    let (fresh, total) = context
        .map(|(_, assessment)| (assessment.fresh, assessment.total))
        .unwrap_or((0, 0));
    let freshness_gain = if total == 0 {
        0.0
    } else {
        fresh as f32 / total as f32
    };
    let report_source_mode = report
        .get("source_mode")
        .and_then(|v| v.as_str())
        .filter(|mode| !mode.is_empty());

    let usable = observed_activity.is_some()
        && !evidence.is_empty()
        && freshness_gain > 0.0
        && report_source_mode.is_some();
    if !usable {
        let reason = if observed_activity.is_none() {
            "no valid observed_context activity/freshness values"
        } else if evidence.is_empty() {
            "no complete observation frames with attributable provenance"
        } else if report_source_mode.is_none() {
            "no nonempty observation report source_mode"
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
            observed_context_json: String::new(),
            warnings: vec![format!(
                "Observation report was not usable ({reason}); the run remains synthetic."
            )],
        });
    }
    let report_source_mode = report_source_mode.ok_or("validated report source_mode missing")?;

    let obs = ActivityObservation {
        value: observed_activity.unwrap_or(f64::from(forecast_activity)) as f32,
        variance: ACTIVITY_OBSERVATION_VARIANCE,
        freshness_gain,
    };
    let (analysis_activity, analysis_variance) =
        assimilate_activity(forecast_activity, ACTIVITY_FORECAST_VARIANCE, &obs);

    // Preserve the accepted report semantically and in field order, replacing only its
    // frame array with the complete admissible projection.
    let mut embedded_report = report.clone();
    let JsonValue::Object(fields) = &mut embedded_report else {
        return Err("observations report must be an object".into());
    };
    let frames_field = fields
        .iter_mut()
        .find(|(name, _)| name == "frames")
        .ok_or("observations report frames missing")?;
    frames_field.1 = JsonValue::Array(evidence.clone());
    let observations_json = JsonValue::Array(vec![embedded_report]).to_compact_string();
    let observed_context_json = context
        .map(|(value, _)| value.to_compact_string())
        .ok_or("validated observed_context missing")?;

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
            "{} of {} observation frames lacked attributable provenance or required metadata and are not embedded as evidence.",
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
        observed_context_json,
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
    if let Some(pointer) = optional_path(args, "--source-pointer") {
        if cache.is_some() || optional_path(args, "--fallback-fixtures").is_some() {
            return Err("--source-pointer cannot be mixed with cache/fixture paths".into());
        }
        if value_after(args, "--as-of-unix-seconds").is_none() {
            return Err("source bundle ingestion requires explicit --as-of-unix-seconds".into());
        }
        let as_of = parse_or_default(args, "--as-of-unix-seconds", 0u64)?;
        let bundle = bundle_intake::resolve(&pointer, true)?;
        let mut payloads = Vec::new();
        for p in bundle
            .manifest
            .get("products")
            .and_then(JsonValue::as_array)
            .ok_or("source products missing")?
        {
            let name = p
                .get("product_id")
                .and_then(JsonValue::as_str)
                .ok_or("product id missing")?;
            let origin = p
                .get("origin")
                .and_then(JsonValue::as_str)
                .ok_or("product origin missing")?;
            payloads.push((
                name.to_owned(),
                origin.to_owned(),
                p.get("source")
                    .and_then(JsonValue::as_str)
                    .ok_or("product source missing")?
                    .to_owned(),
                bundle
                    .components
                    .get(name)
                    .ok_or("source bytes missing")?
                    .clone(),
            ));
        }
        let json = solar_ingest::swpc_observation_report_from_attributed_payloads(
            &bundle.id, &payloads, as_of,
        )?;
        write_text(&out, &json)?;
        println!(
            "wrote observations={} source_bundle={}",
            out.display(),
            bundle.id
        );
        return Ok(());
    }
    let fallback = optional_path(args, "--fallback-fixtures")
        .or_else(|| Some(PathBuf::from("tests").join("swpc_scn26_21")));

    if let Some(cache_dir) = &cache {
        fs::create_dir_all(cache_dir)
            .map_err(|err| format!("create cache {}: {err}", cache_dir.display()))?;
    }

    let json = if value_after(args, "--as-of-unix-seconds").is_some() {
        let as_of = parse_or_default(args, "--as-of-unix-seconds", 0u64)?;
        solar_ingest::swpc_observation_report_json_at(cache.as_deref(), fallback.as_deref(), as_of)?
    } else {
        solar_ingest::swpc_observation_report_json(cache.as_deref(), fallback.as_deref())?
    };
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
    let snapshot = optional_path(args, "--snapshot");
    let pointer = optional_path(args, "--bundle-pointer");
    if snapshot.is_some() == pointer.is_some() {
        return Err("provide exactly one of --snapshot or --bundle-pointer".into());
    }
    let out_dir = required_path(args, "--out")?;
    let historical = args.iter().any(|arg| arg == "--historical-v2");
    let (raw, source_name) = if let Some(pointer) = pointer {
        if historical {
            return Err("--historical-v2 cannot select a live bundle".into());
        }
        let bundle = bundle_intake::resolve(&pointer, false)?;
        (
            bundle
                .components
                .get("snapshot")
                .ok_or("bundle snapshot missing")?
                .clone(),
            format!("bundle:{}", bundle.id),
        )
    } else {
        let snapshot = snapshot.ok_or("snapshot missing")?;
        (
            fs::read_to_string(&snapshot)
                .map_err(|err| format!("read snapshot {}: {err}", snapshot.display()))?,
            snapshot.display().to_string(),
        )
    };
    if historical {
        snapshot_validation_v2::validate(&raw)?;
    } else {
        snapshot_validation::validate(&raw)?;
    }
    fs::create_dir_all(&out_dir).map_err(|err| format!("create {}: {err}", out_dir.display()))?;
    let entry = if historical {
        "historical-state-v2.json"
    } else {
        "latest-state.json"
    };
    let contract = if historical {
        "solar-state-snapshot.v2"
    } else {
        "solar-state-snapshot.v3"
    };
    let target = out_dir.join(entry);
    atomic_write_text(&target, &raw)?;
    atomic_write_text(
        &out_dir.join("replay-manifest.json"),
        &format!(
            "{{\n  \"schema_version\": \"model-run-manifest.v1\",\n  \"source_snapshot\": \"{}\",\n  \"snapshot_contract\": \"{contract}\",\n  \"web_entry\": \"{entry}\"\n}}\n",
            escape_json(&source_name)
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
    let state = simulate_state(steps, dt_hours, seed, activity)?;

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

fn simulate_state(
    steps: usize,
    dt_hours: f64,
    seed: u64,
    activity_index: f32,
) -> Result<SolarState, String> {
    simulate_state_with_uncertainty(
        steps,
        dt_hours,
        seed,
        activity_index,
        ActivityUncertainty::default(),
    )
}

fn simulate_state_with_uncertainty(
    steps: usize,
    dt_hours: f64,
    seed: u64,
    activity_index: f32,
    uncertainty: ActivityUncertainty,
) -> Result<SolarState, String> {
    let grid = SolarGrid::new(144, 72);
    let mut state = SolarState::new(grid.clone(), SolarMode::Synthetic);
    state.activity_uncertainty = uncertainty;
    let mut model = SyntheticSolarModel::new(SyntheticConfig {
        seed,
        activity_index,
        ..SyntheticConfig::default()
    });
    let cfg = FluxTransportConfig::default();

    for _ in 0..steps {
        // Check the exact next accumulated epoch before births or physical transport.
        // Keep this fallible boundary outside the core's infallible transport API.
        let mut forecast = state.activity_uncertainty.clone();
        forecast.forecast_to(state.time_seconds + dt_hours * 3600.0)?;
        let births = model.generate_births(state.time_seconds, dt_hours * 3600.0, &grid);
        state.active_regions.extend(births);
        advance_flux_transport(&mut state, dt_hours * 3600.0, &cfg);
    }

    Ok(state)
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

/// A sibling created exclusively by this process is the only cleanup target.
/// rename replaces existing files atomically on Windows and Unix; never unlink first.
fn atomic_write_text(path: &Path, content: &str) -> Result<(), String> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let file_name = path
        .file_name()
        .ok_or("output requires a file name")?
        .to_string_lossy();
    let temporary = path.with_file_name(format!(
        ".{file_name}.{}.{}.tmp",
        process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|err| format!("create temporary {}: {err}", temporary.display()))?;
    let result = (|| {
        file.write_all(content.as_bytes())
            .map_err(|err| format!("write temporary: {err}"))?;
        file.sync_all()
            .map_err(|err| format!("sync temporary: {err}"))?;
        drop(file);
        fs::rename(&temporary, path).map_err(|err| format!("replace {}: {err}", path.display()))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
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
    println!(
        "    Optional --as-of-unix-seconds <UTC seconds> fixes the freshness evaluation time."
    );
    println!("    Cached f107_cm_flux.json supplies attributable numeric activity using the 48-hour freshness policy.");
    println!("  solar-cli replay --snapshot <solar-state-snapshot.v3> --out <web-data-dir>");
    println!("  replay/simulate --bundle-pointer <derived/current.json> validates all immutable components before output (mutually exclusive with --snapshot/--observations).");
    println!("  ingest swpc --source-pointer <source/current.json> --as-of-unix-seconds <UTC seconds> --out <observations.json> has no cache/fixture fallback.");
    println!("  Historical copy only: replay --historical-v2 --snapshot <v2-file> --out <archive-dir>; never restores a transport checkpoint or selects a live feed.");
    println!("  simulate --process-noise-per-day <finite nonnegative activity_index_squared/day> (default 0: disabled; nonzero is illustrative)");
    println!("    Validates and atomically copies a frozen v2 snapshot for viewing.");
    println!("    This is not resumable checkpoint restoration and cannot continue a simulation.");
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
         "layer_kind": "observed", "provenance": {"source": "SOLAR1", "active": true,
         "raw_source_metadata": {}, "time_tag": "2026-07-02T03:19:00"}, "quality_flags": ["test"]},
        {"id": "swpc-solar-regions", "source_mode": "cached", "schema_version": "observation-frame.v1",
         "layer_kind": "observed", "provenance": {"active": true,
         "raw_source_metadata": {}}, "quality_flags": ["test"]}
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
    fn unknown_source_and_out_of_range_activity_are_not_assimilated() {
        let unknown = USABLE_REPORT.replace("SOLAR1", "unknown");
        assert!(!assess_observations(&unknown, 0.9).unwrap().assimilated);
        let invalid = USABLE_REPORT.replace("0.972059", "1e300");
        assert!(!assess_observations(&invalid, 0.9).unwrap().assimilated);
    }

    #[test]
    fn assimilated_snapshot_carries_the_mode_and_the_evidence() {
        let outcome = assess_observations(USABLE_REPORT, 0.9).unwrap();
        let mut state = simulate_state(4, 1.0, 42, outcome.analysis_activity).unwrap();
        state.mode = SolarMode::Assimilation;
        state
            .activity_uncertainty
            .record_analysis(f64::from(outcome.analysis_variance))
            .unwrap();
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
