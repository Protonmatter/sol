//! Ingest crate scaffold for public/free solar data sources.
//!
//! v0.1.1 adds explicit NOAA/SWPC schema-change handling from
//! NWS Service Change Notice 26-21. The adapter layer must tolerate both
//! old and new SWPC JSON shapes during migrations and tests must pin the
//! canonical field mappings for RTSW replacement products.

use solar_core::{parse_json, provenance::attributable_source, JsonValue};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Basic status metadata for the data sources used by the simulator.
pub struct SourceStatus {
    pub name: &'static str,
    pub free_public: bool,
    pub requires_registration: bool,
    pub operational_caveat: &'static str,
}

pub const SOURCES: &[SourceStatus] = &[
    SourceStatus {
        name: "NOAA/SWPC Data Service",
        free_public: true,
        requires_registration: false,
        operational_caveat: "Public JSON/text/image products; formats can change with service-change notices. SCN 26-21 changed several JSON products on/about 2026-03-31 and deprecated old RTSW endpoints on/about 2026-04-30.",
    },
    SourceStatus {
        name: "Helioviewer API",
        free_public: true,
        requires_registration: false,
        operational_caveat: "Public API; use politely, cache results, and treat quicklook imagery as lower-fidelity than calibrated FITS.",
    },
    SourceStatus {
        name: "JSOC/HMI",
        free_public: true,
        requires_registration: true,
        operational_caveat: "Email registration and staged export flow required for many science-grade data requests.",
    },
];

/// SWPC schema eras relevant to this project.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwpcSchemaEra {
    /// Header row followed by rows of quoted values, or old scalar/object shape.
    PreScn26_21,
    /// Standard JSON objects / arrays with numeric values unquoted, effective on/about 2026-03-31.
    Scn26_21,
    /// Deprecated real-time solar wind products removed on/about 2026-04-30.
    DeprecatedRtswRemoved,
}

/// Canonical SWPC endpoints used by the ingest layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwpcEndpoint {
    KyotoDst,
    Summary10cmFlux,
    Flux10cm30Day,
    PlanetaryKIndex,
    PlanetaryKIndexForecast,
    SummarySolarWindMagField,
    SummarySolarWindSpeed,
    RtswEphemerides1h,
    RtswMag1m,
    RtswWind1m,
}

impl SwpcEndpoint {
    pub fn url(self) -> &'static str {
        match self {
            SwpcEndpoint::KyotoDst => "https://services.swpc.noaa.gov/products/kyoto-dst.json",
            SwpcEndpoint::Summary10cmFlux => {
                "https://services.swpc.noaa.gov/products/summary/10cm-flux.json"
            }
            SwpcEndpoint::Flux10cm30Day => {
                "https://services.swpc.noaa.gov/products/10cm-flux-30-day.json"
            }
            SwpcEndpoint::PlanetaryKIndex => {
                "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
            }
            SwpcEndpoint::PlanetaryKIndexForecast => {
                "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"
            }
            SwpcEndpoint::SummarySolarWindMagField => {
                "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json"
            }
            SwpcEndpoint::SummarySolarWindSpeed => {
                "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json"
            }
            SwpcEndpoint::RtswEphemerides1h => {
                "https://services.swpc.noaa.gov/json/rtsw/rtsw_ephemerides_1h.json"
            }
            SwpcEndpoint::RtswMag1m => "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
            SwpcEndpoint::RtswWind1m => {
                "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json"
            }
        }
    }

    pub fn schema_era(self) -> SwpcSchemaEra {
        match self {
            SwpcEndpoint::RtswEphemerides1h
            | SwpcEndpoint::RtswMag1m
            | SwpcEndpoint::RtswWind1m => SwpcSchemaEra::Scn26_21,
            _ => SwpcSchemaEra::Scn26_21,
        }
    }
}

#[derive(Clone, Debug)]
pub struct PublicDataAdapter {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    pub layer_kind: &'static str,
    pub default_quality: &'static str,
}

pub const PUBLIC_ADAPTERS: &[PublicDataAdapter] = &[
    PublicDataAdapter {
        id: "swpc-rtsw-mag-1m",
        name: "NOAA/SWPC RTSW magnetometer",
        url: "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
        layer_kind: "observed",
        default_quality: "public real-time solar wind context; preserve source and active flags",
    },
    PublicDataAdapter {
        id: "swpc-rtsw-wind-1m",
        name: "NOAA/SWPC RTSW wind",
        url: "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
        layer_kind: "observed",
        default_quality: "public real-time plasma context; preserve source and active flags",
    },
    PublicDataAdapter {
        id: "helioviewer-hmi-aia",
        name: "Helioviewer SDO HMI/AIA quicklook",
        url: "https://api.helioviewer.org/v2/",
        layer_kind: "observed",
        default_quality: "quicklook imagery for visualization and low-friction overlays",
    },
    PublicDataAdapter {
        id: "jpl-horizons-observer-geometry",
        name: "JPL Horizons observer geometry",
        url: "https://ssd.jpl.nasa.gov/api/horizons.api",
        layer_kind: "inferred",
        default_quality:
            "observer geometry contract for Sun/Earth context; not a solar magnetic model",
    },
];

/// Deprecated RTSW products that must not be used by the assimilation engine.
pub const DEPRECATED_RTSW_ENDPOINTS: &[&str] = &[
    "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json",
    "https://services.swpc.noaa.gov/products/solar-wind/mag-2-hour.json",
    "https://services.swpc.noaa.gov/products/solar-wind/mag-3-day.json",
    "https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json",
    "https://services.swpc.noaa.gov/products/solar-wind/mag-6-hour.json",
    "https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json",
    "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json",
    "https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json",
    "https://services.swpc.noaa.gov/products/solar-wind/plasma-3-day.json",
    "https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json",
    "https://services.swpc.noaa.gov/products/solar-wind/plasma-6-hour.json",
    "https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json",
    "https://services.swpc.noaa.gov/products/solar-wind/ephemerides.json",
];

/// Canonical wind/plasma fields for the replacement RTSW wind product.
#[derive(Debug, Clone, PartialEq)]
pub struct RtswWindRecord {
    pub time_tag: String,
    pub proton_density: Option<f64>,
    pub proton_speed: Option<f64>,
    pub proton_temperature: Option<f64>,
    pub source: Option<String>,
    pub active: Option<bool>,
}

/// Canonical magnetometer fields for the replacement RTSW mag product.
#[derive(Debug, Clone, PartialEq)]
pub struct RtswMagRecord {
    pub time_tag: String,
    pub bx_gsm: Option<f64>,
    pub by_gsm: Option<f64>,
    pub bz_gsm: Option<f64>,
    pub bt: Option<f64>,
    pub phi_gsm: Option<f64>,
    pub theta_bsm: Option<f64>,
    pub source: Option<String>,
    pub active: Option<bool>,
}

/// Normalize numeric values from either old quoted-string JSON or new numeric JSON.
pub fn normalize_numeric(value: &str) -> Option<f64> {
    let trimmed = value.trim().trim_matches('"');
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("null")
        || trimmed.eq_ignore_ascii_case("nan")
    {
        return None;
    }
    trimmed.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// Map old RTSW plasma field names to the replacement wind product names.
pub fn canonical_wind_field_name(field: &str) -> &str {
    match field {
        "density" => "proton_density",
        "speed" => "proton_speed",
        "temperature" => "proton_temperature",
        other => other,
    }
}

/// Map old RTSW magnetometer field names to the replacement mag product names.
pub fn canonical_mag_field_name(field: &str) -> &str {
    match field {
        "lon_gsm" => "phi_gsm",
        "lat_gsm" => "theta_bsm",
        other => other,
    }
}

/// Return the replacement RTSW endpoint for a deprecated SWPC RTSW URL.
pub fn replacement_for_deprecated_rtsw(url: &str) -> Option<SwpcEndpoint> {
    if url.contains("/products/solar-wind/mag-") {
        Some(SwpcEndpoint::RtswMag1m)
    } else if url.contains("/products/solar-wind/plasma-") {
        Some(SwpcEndpoint::RtswWind1m)
    } else if url.ends_with("/products/solar-wind/ephemerides.json") {
        Some(SwpcEndpoint::RtswEphemerides1h)
    } else {
        None
    }
}

/// Retention rule for old 3-day/7-day users after SCN 26-21.
/// The replacement products contain 1-day, 2-hour, 5-minute, and 6-hour windows;
/// users needing 3-day/7-day history must retrieve and retain the 1-day file.
pub fn requires_local_retention_for_window(window: &str) -> bool {
    matches!(window, "3-day" | "7-day" | "3d" | "7d")
}

pub fn swpc_observation_report_json(
    cache_dir: Option<&Path>,
    fallback_dir: Option<&Path>,
) -> Result<String, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("freshness clock: {err}"))?
        .as_secs();
    swpc_observation_report_json_at(cache_dir, fallback_dir, now)
}

/// Reproducible ingestion with freshness evaluated at an explicit Unix UTC instant.
pub fn swpc_observation_report_json_at(
    cache_dir: Option<&Path>,
    fallback_dir: Option<&Path>,
    as_of_unix_seconds: u64,
) -> Result<String, String> {
    let mag = read_candidate(
        cache_dir,
        fallback_dir,
        "rtsw_mag_1m.json",
        "rtsw_mag_1m_new.json",
        SwpcEndpoint::RtswMag1m,
    )?;
    let wind = read_candidate(
        cache_dir,
        fallback_dir,
        "rtsw_wind_1m.json",
        "rtsw_wind_1m_new.json",
        SwpcEndpoint::RtswWind1m,
    )?;
    let f107 = cache_dir
        .map(|dir| dir.join("f107_cm_flux.json"))
        .filter(|path| path.is_file())
        .map(|path| read_source(path, "cached", SwpcEndpoint::Flux10cm30Day))
        .transpose()?;
    report_from_candidates(mag, wind, f107, as_of_unix_seconds)
}

/// Consume already validated, captured bundle payloads without touching a cache or
/// substituting fixtures. Tuple fields are product id, declared origin, raw JSON.
pub fn swpc_observation_report_from_payloads(
    bundle_id: &str,
    payloads: &[(String, String, String)],
    as_of_unix_seconds: u64,
) -> Result<String, String> {
    let captured: Vec<_> = payloads
        .iter()
        .map(|(id, origin, raw)| (id.as_str(), origin.as_str(), None, raw.as_str()))
        .collect();
    report_from_bundle_payloads(bundle_id, &captured, as_of_unix_seconds)
}

/// Consume hash-validated bundle products with their manifest attribution.
/// Tuple fields are product id, declared origin, manifest source, original raw JSON.
/// Manifest attribution fills an absent row source, never an explicitly invalid one.
pub fn swpc_observation_report_from_attributed_payloads(
    bundle_id: &str,
    payloads: &[(String, String, String, String)],
    as_of_unix_seconds: u64,
) -> Result<String, String> {
    if payloads
        .iter()
        .any(|(_, _, source, _)| !attributable_source(source))
    {
        return Err("bundle product source provenance unavailable".into());
    }
    let captured: Vec<_> = payloads
        .iter()
        .map(|(id, origin, source, raw)| {
            (
                id.as_str(),
                origin.as_str(),
                Some(source.as_str()),
                raw.as_str(),
            )
        })
        .collect();
    report_from_bundle_payloads(bundle_id, &captured, as_of_unix_seconds)
}

fn report_from_bundle_payloads(
    bundle_id: &str,
    payloads: &[(&str, &str, Option<&str>, &str)],
    as_of_unix_seconds: u64,
) -> Result<String, String> {
    let candidate =
        |name: &str, endpoint: SwpcEndpoint| -> Result<Option<SourceCandidate>, String> {
            let Some((_, origin, manifest_source, raw)) =
                payloads.iter().find(|(id, _, _, _)| *id == name)
            else {
                return Ok(None);
            };
            let mode = match *origin {
                "fixture" => "fixture",
                "current-fetch" | "cached-fallback" => "cached",
                _ => return Err("unknown bundle product origin".into()),
            };
            Ok(Some(SourceCandidate {
                endpoint,
                path: PathBuf::from(format!("bundle:{bundle_id}/{name}")),
                mode,
                raw: (*raw).to_owned(),
                manifest_source: manifest_source.map(str::to_owned),
                parsed: parse_json(raw).map_err(|e| e.to_string())?,
            }))
        };
    let mag = candidate("rtsw_mag_1m.json", SwpcEndpoint::RtswMag1m)?
        .ok_or("source bundle missing magnetometer")?;
    let wind = candidate("rtsw_wind_1m.json", SwpcEndpoint::RtswWind1m)?
        .ok_or("source bundle missing solar wind")?;
    let f107 = candidate("f107_cm_flux.json", SwpcEndpoint::Flux10cm30Day)?;
    report_from_candidates(mag, wind, f107, as_of_unix_seconds)
}

fn report_from_candidates(
    mag: SourceCandidate,
    wind: SourceCandidate,
    f107: Option<SourceCandidate>,
    as_of_unix_seconds: u64,
) -> Result<String, String> {
    let signal = f107.as_ref().and_then(|candidate| {
        newest_record(
            &candidate.parsed,
            true,
            candidate.manifest_source.as_deref(),
        )
    });

    let source_mode = if mag.mode == "cached"
        || wind.mode == "cached"
        || f107.as_ref().is_some_and(|p| p.mode == "cached")
    {
        "cached"
    } else {
        "fixture"
    };

    let mut out = String::new();
    out.push_str("{\n");
    json_string_field(&mut out, 1, "schema_version", "observation-frame.v1", true);
    json_string_field(&mut out, 1, "generated_by", "solar-ingest", true);
    json_string_field(&mut out, 1, "source_mode", source_mode, true);
    if let Some(row) = signal {
        let flux = numeric_field(row, "flux").ok_or("selected F10.7 signal has no finite flux")?;
        let timestamp = row
            .get("time_tag")
            .and_then(JsonValue::as_str)
            .ok_or("selected signal has no time_tag")?;
        let observed = timestamp_seconds(timestamp).ok_or("selected signal time_tag is invalid")?;
        let age_hours = (as_of_unix_seconds as f64 - observed as f64) / 3600.0;
        let stale = !(0.0..=48.0).contains(&age_hours);
        // Same documented F10.7 normalization and 48 h policy as the Python producer.
        let activity = ((flux - 65.0) / 170.0).clamp(0.25, 1.0);
        out.push_str(&format!("  \"observed_context\": {{\"activity_index\": {activity:.6}, \"signal_freshness\": {{\"swpc-f107-cm-flux\": {{\"age_hours\": {age_hours:.6}, \"stale\": {stale}}}}}, \"evaluated_at_unix_seconds\": {as_of_unix_seconds}}},\n"));
    }
    out.push_str("  \"adapters\": [\n");
    for (idx, adapter) in PUBLIC_ADAPTERS.iter().enumerate() {
        if idx > 0 {
            out.push_str(",\n");
        }
        adapter_json(&mut out, adapter);
    }
    out.push_str("\n  ],\n");
    out.push_str("  \"frames\": [\n");
    candidate_json(&mut out, &mag, "swpc-rtsw-mag-1m", true);
    candidate_json(&mut out, &wind, "swpc-rtsw-wind-1m", signal.is_some());
    if let (Some(candidate), Some(row)) = (f107.as_ref(), signal) {
        candidate_json_record(&mut out, candidate, "swpc-f107-cm-flux", Some(row), false);
    }
    out.push_str("  ],\n");
    out.push_str("  \"warnings\": [");
    if source_mode == "fixture" {
        out.push_str(
            "\"No live cache files were present; deterministic SWPC fixtures were used.\"",
        );
    } else {
        out.push_str(
            "\"Cached public data was used; freshness depends on the external fetch workflow.\"",
        );
    }
    if signal.is_none() {
        out.push_str(",\"Metadata-only inputs contain no attributable finite F10.7 activity signal; simulations remain Synthetic.\"");
    }
    out.push_str("]\n");
    out.push_str("}\n");
    Ok(out)
}

#[derive(Clone, Debug)]
struct SourceCandidate {
    endpoint: SwpcEndpoint,
    path: PathBuf,
    mode: &'static str,
    raw: String,
    manifest_source: Option<String>,
    parsed: JsonValue,
}

fn read_candidate(
    cache_dir: Option<&Path>,
    fallback_dir: Option<&Path>,
    cache_name: &str,
    fixture_name: &str,
    endpoint: SwpcEndpoint,
) -> Result<SourceCandidate, String> {
    if let Some(cache) = cache_dir {
        let path = cache.join(cache_name);
        if path.is_file() {
            return read_source(path, "cached", endpoint);
        }
    }

    let fallback = fallback_dir.ok_or_else(|| {
        format!("No cache file and no fallback fixture directory for {cache_name}")
    })?;
    for candidate in [
        fallback.join(fixture_name),
        fallback.join(cache_name),
        fallback.join("swpc_scn26_21").join(fixture_name),
        fallback.join("swpc_scn26_21").join(cache_name),
    ] {
        if candidate.is_file() {
            return read_source(candidate, "fixture", endpoint);
        }
    }

    Err(format!(
        "No SWPC source file found for {cache_name}; checked cache and fallback fixtures"
    ))
}

fn read_source(
    path: PathBuf,
    mode: &'static str,
    endpoint: SwpcEndpoint,
) -> Result<SourceCandidate, String> {
    let raw = fs::read_to_string(&path).map_err(|err| format!("{}: {err}", path.display()))?;
    let parsed = parse_json(&raw).map_err(|err| format!("{}: {err}", path.display()))?;
    Ok(SourceCandidate {
        endpoint,
        path,
        mode,
        raw,
        manifest_source: None,
        parsed,
    })
}

fn adapter_json(out: &mut String, adapter: &PublicDataAdapter) {
    out.push_str("    {");
    string_pair(out, "id", adapter.id, true);
    string_pair(out, "name", adapter.name, true);
    string_pair(out, "url", adapter.url, true);
    string_pair(out, "layer_kind", adapter.layer_kind, true);
    string_pair(out, "default_quality", adapter.default_quality, false);
    out.push('}');
}

fn candidate_json(out: &mut String, candidate: &SourceCandidate, id: &str, trailing: bool) {
    candidate_json_record(
        out,
        candidate,
        id,
        newest_record(
            &candidate.parsed,
            false,
            candidate.manifest_source.as_deref(),
        ),
        trailing,
    );
}

fn candidate_json_record(
    out: &mut String,
    candidate: &SourceCandidate,
    id: &str,
    row: Option<&JsonValue>,
    trailing: bool,
) {
    out.push_str("    {\n");
    json_string_field(out, 3, "id", id, true);
    json_string_field(out, 3, "schema_version", "observation-frame.v1", true);
    json_string_field(out, 3, "layer_kind", "observed", true);
    json_string_field(out, 3, "source_mode", candidate.mode, true);
    json_string_field(
        out,
        3,
        "endpoint",
        if id == "swpc-f107-cm-flux" {
            "https://services.swpc.noaa.gov/json/f107_cm_flux.json"
        } else {
            candidate.endpoint.url()
        },
        true,
    );
    json_string_field(
        out,
        3,
        "local_path",
        &candidate.path.display().to_string(),
        true,
    );
    out.push_str(&format!("      \"raw_bytes\": {},\n", candidate.raw.len()));
    out.push_str("      \"provenance\": {");
    string_pair(
        out,
        "time_tag",
        row.and_then(|r| scalar(r, "time_tag"))
            .as_deref()
            .unwrap_or("unknown"),
        true,
    );
    string_pair(
        out,
        "source",
        row.and_then(|r| record_source(r, candidate.manifest_source.as_deref()))
            .unwrap_or("unknown"),
        true,
    );
    out.push_str("\"active\": ");
    out.push_str(match row.and_then(|r| scalar(r, "active")).as_deref() {
        Some("true") => "true",
        Some("false") => "false",
        _ => "null",
    });
    out.push_str(", \"raw_source_metadata\": ");
    out.push_str(
        &row.map(JsonValue::to_compact_string)
            .unwrap_or_else(|| "{}".into()),
    );
    out.push_str(", ");
    string_pair(
        out,
        "raw_excerpt",
        raw_excerpt(&candidate.raw).as_str(),
        false,
    );
    out.push_str("},\n");
    out.push_str("      \"quality_flags\": [\"source metadata retained\", \"schema-era numeric normalization supported\", \"not promoted to operational truth\"]\n");
    out.push_str("    }");
    if trailing {
        out.push(',');
    }
    out.push('\n');
}

fn scalar(row: &JsonValue, key: &str) -> Option<String> {
    match row.get(key)? {
        JsonValue::String(s) => Some(s.clone()),
        JsonValue::Bool(b) => Some(b.to_string()),
        JsonValue::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn numeric_field(row: &JsonValue, key: &str) -> Option<f64> {
    let value = row.get(key)?;
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(normalize_numeric))
        .filter(|v| v.is_finite())
}

fn record_source<'a>(row: &'a JsonValue, manifest_source: Option<&'a str>) -> Option<&'a str> {
    match row.get("source") {
        None => manifest_source,
        Some(value) => value.as_str(),
    }
    .filter(|source| attributable_source(source))
}

fn newest_record<'a>(
    value: &'a JsonValue,
    require_flux: bool,
    manifest_source: Option<&str>,
) -> Option<&'a JsonValue> {
    let records = match value {
        JsonValue::Array(items) => items.as_slice(),
        _ => std::slice::from_ref(value),
    };
    records
        .iter()
        .filter(|row| {
            record_source(row, manifest_source).is_some()
                && (!require_flux
                    || (numeric_field(row, "flux").is_some()
                        && row.get("active").and_then(JsonValue::as_bool) != Some(false)))
        })
        .filter_map(|row| {
            let time = timestamp_seconds(row.get("time_tag")?.as_str()?)?;
            Some((time, row))
        })
        .max_by_key(|(time, _)| *time)
        .map(|(_, row)| row)
}

/// SWPC UTC dates / second-resolution timestamps; invalid dates and offsets fail closed.
fn timestamp_seconds(text: &str) -> Option<i64> {
    let text = text.strip_suffix('Z').unwrap_or(text);
    if !text.is_ascii() || (text.len() != 10 && text.len() != 19) {
        return None;
    }
    if &text[4..5] != "-" || &text[7..8] != "-" {
        return None;
    }
    let year: i64 = text[..4].parse().ok()?;
    let month: i64 = text[5..7].parse().ok()?;
    let day: i64 = text[8..10].parse().ok()?;
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return None,
    };
    if day < 1 || day > days_in_month {
        return None;
    }
    let (hour, minute, second): (i64, i64, i64) = if text.len() == 19 {
        if !["T", " "].contains(&&text[10..11]) || &text[13..14] != ":" || &text[16..17] != ":" {
            return None;
        }
        (
            text[11..13].parse().ok()?,
            text[14..16].parse().ok()?,
            text[17..19].parse().ok()?,
        )
    } else {
        (0, 0, 0)
    };
    if !(0..24).contains(&hour) || !(0..60).contains(&minute) || !(0..60).contains(&second) {
        return None;
    }
    // Gregorian civil date to days from Unix epoch (400-year era decomposition).
    let y = year - i64::from(month <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468;
    Some(days * 86400 + hour * 3600 + minute * 60 + second)
}

fn raw_excerpt(raw: &str) -> String {
    raw.chars()
        .filter(|ch| !ch.is_control() || *ch == '\n' || *ch == '\t')
        .take(240)
        .collect::<String>()
}

fn json_string_field(out: &mut String, indent: usize, key: &str, value: &str, trailing: bool) {
    out.push_str(&"  ".repeat(indent));
    out.push('"');
    push_escaped(out, key);
    out.push_str("\": \"");
    push_escaped(out, value);
    out.push('"');
    if trailing {
        out.push(',');
    }
    out.push('\n');
}

fn string_pair(out: &mut String, key: &str, value: &str, trailing: bool) {
    out.push('"');
    push_escaped(out, key);
    out.push_str("\":\"");
    push_escaped(out, value);
    out.push('"');
    if trailing {
        out.push(',');
    }
}

fn push_escaped(out: &mut String, value: &str) {
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn attributed_f107_payloads(raw: &str) -> Vec<(String, String, String, String)> {
        vec![
            (
                "rtsw_mag_1m.json".into(),
                "fixture".into(),
                "NOAA/SWPC RTSW".into(),
                include_str!("../../../tests/swpc_scn26_21/rtsw_mag_1m_new.json").into(),
            ),
            (
                "rtsw_wind_1m.json".into(),
                "fixture".into(),
                "NOAA/SWPC RTSW".into(),
                include_str!("../../../tests/swpc_scn26_21/rtsw_wind_1m_new.json").into(),
            ),
            (
                "f107_cm_flux.json".into(),
                "fixture".into(),
                "NOAA/SWPC F10.7".into(),
                raw.into(),
            ),
        ]
    }

    #[test]
    fn manifest_attribution_fills_only_an_absent_row_source() {
        for (field, expected) in [
            ("", Some("NOAA/SWPC F10.7")),
            (r#", "source":"row instrument""#, Some("row instrument")),
            (r#", "source":"""#, None),
            (r#", "source":"  ""#, None),
            (r#", "source":" UNKNOWN ""#, None),
            (r#", "source":null"#, None),
            (r#", "source":42"#, None),
        ] {
            let raw = format!(r#"[{{"time_tag":"2026-09-11T00:00:00Z","flux":150{field}}}]"#);
            let payloads = attributed_f107_payloads(&raw);
            let report =
                swpc_observation_report_from_attributed_payloads("source", &payloads, 1789084800)
                    .unwrap();
            let parsed = parse_json(&report).unwrap();
            assert_eq!(
                parsed.get("observed_context").is_some(),
                expected.is_some(),
                "{field}"
            );
            let signal = parsed
                .get("frames")
                .unwrap()
                .as_array()
                .unwrap()
                .iter()
                .find(|f| f.get("id").and_then(JsonValue::as_str) == Some("swpc-f107-cm-flux"));
            assert_eq!(
                signal
                    .and_then(|f| f.get("provenance"))
                    .and_then(|p| p.get("source"))
                    .and_then(JsonValue::as_str),
                expected,
                "{field}"
            );
            if let Some(signal) = signal {
                assert_eq!(
                    signal
                        .get("provenance")
                        .unwrap()
                        .get("raw_source_metadata")
                        .unwrap(),
                    &parse_json(&raw).unwrap().as_array().unwrap()[0]
                );
            }
            assert_eq!(payloads[2].3, raw);
        }
    }

    #[test]
    fn missing_or_invalid_manifest_attribution_cannot_invent_a_signal() {
        let mut payloads =
            attributed_f107_payloads(r#"[{"time_tag":"2026-09-11T00:00:00Z","flux":150}]"#);
        let legacy: Vec<_> = payloads
            .iter()
            .map(|(id, origin, _, raw)| (id.clone(), origin.clone(), raw.clone()))
            .collect();
        let report = swpc_observation_report_from_payloads("source", &legacy, 1789084800).unwrap();
        assert!(parse_json(&report)
            .unwrap()
            .get("observed_context")
            .is_none());
        for source in ["", " ", "unknown", " UNKNOWN "] {
            payloads[2].2 = source.into();
            assert!(
                swpc_observation_report_from_attributed_payloads("source", &payloads, 1789084800)
                    .is_err(),
                "{source:?}"
            );
        }
    }

    #[test]
    fn manifest_attribution_does_not_rescue_newer_explicit_unknown_signal() {
        let payloads = attributed_f107_payloads(
            r#"[
            {"time_tag":"2026-09-10T00:00:00Z","flux":150},
            {"time_tag":"2026-09-11T00:00:00Z","flux":235,"source":" UNKNOWN "}
        ]"#,
        );
        let report =
            swpc_observation_report_from_attributed_payloads("source", &payloads, 1789084800)
                .unwrap();
        let parsed = parse_json(&report).unwrap();
        assert_eq!(
            parsed
                .get("observed_context")
                .unwrap()
                .get("activity_index")
                .and_then(JsonValue::as_f64),
            Some(0.5)
        );
        let signal = parsed
            .get("frames")
            .unwrap()
            .as_array()
            .unwrap()
            .last()
            .unwrap();
        assert_eq!(
            signal
                .get("provenance")
                .unwrap()
                .get("time_tag")
                .and_then(JsonValue::as_str),
            Some("2026-09-10T00:00:00Z")
        );
    }

    #[test]
    fn captured_bundle_payloads_preserve_fixture_mode_and_never_fallback() {
        let mut payloads = vec![
            (
                "rtsw_mag_1m.json".into(),
                "fixture".into(),
                include_str!("../../../tests/swpc_scn26_21/rtsw_mag_1m_new.json").into(),
            ),
            (
                "rtsw_wind_1m.json".into(),
                "fixture".into(),
                include_str!("../../../tests/swpc_scn26_21/rtsw_wind_1m_new.json").into(),
            ),
        ];
        let report =
            swpc_observation_report_from_payloads("fixture-source", &payloads, 1789128000).unwrap();
        let parsed = parse_json(&report).unwrap();
        assert_eq!(
            parsed.get("source_mode").and_then(JsonValue::as_str),
            Some("fixture")
        );
        assert!(report.contains("bundle:fixture-source"));
        payloads[0].1 = "invalid".into();
        assert!(
            swpc_observation_report_from_payloads("fixture-source", &payloads, 1789128000).is_err()
        );
        payloads[0].1 = "cached-fallback".into();
        assert!(
            swpc_observation_report_from_payloads("fixture-source", &payloads, 1789128000)
                .unwrap()
                .contains("\"cached\"")
        );
        payloads.pop();
        assert!(
            swpc_observation_report_from_payloads("fixture-source", &payloads, 1789128000).is_err()
        );
        assert!(swpc_observation_report_from_payloads("fixture-source", &[], 1789128000).is_err());
    }
    use std::time::{SystemTime, UNIX_EPOCH};

    fn extract_json_scalar(raw: &str, key: &str) -> Option<String> {
        let parsed = parse_json(raw).ok()?;
        scalar(newest_record(&parsed, false, None)?, key)
    }

    fn temp_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("sol-ingest-{label}-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&path).expect("create temp fixture directory");
        path
    }

    #[test]
    fn parses_old_quoted_and_new_numeric_values() {
        assert_eq!(normalize_numeric("\"456.7\""), Some(456.7));
        assert_eq!(normalize_numeric("456.7"), Some(456.7));
        assert_eq!(normalize_numeric("null"), None);
        assert_eq!(normalize_numeric(" NAN "), None);
        assert_eq!(normalize_numeric(""), None);
        assert_eq!(normalize_numeric("not-a-number"), None);
    }

    #[test]
    fn maps_deprecated_wind_fields() {
        assert_eq!(canonical_wind_field_name("density"), "proton_density");
        assert_eq!(canonical_wind_field_name("speed"), "proton_speed");
        assert_eq!(
            canonical_wind_field_name("temperature"),
            "proton_temperature"
        );
        assert_eq!(canonical_wind_field_name("source"), "source");
    }

    #[test]
    fn maps_deprecated_mag_fields() {
        assert_eq!(canonical_mag_field_name("lon_gsm"), "phi_gsm");
        assert_eq!(canonical_mag_field_name("lat_gsm"), "theta_bsm");
        assert_eq!(canonical_mag_field_name("bz_gsm"), "bz_gsm");
    }

    #[test]
    fn replaces_deprecated_rtsw_urls() {
        assert_eq!(
            replacement_for_deprecated_rtsw(
                "https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json"
            ),
            Some(SwpcEndpoint::RtswWind1m)
        );
        assert_eq!(
            replacement_for_deprecated_rtsw(
                "https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json"
            ),
            Some(SwpcEndpoint::RtswMag1m)
        );
        assert_eq!(
            replacement_for_deprecated_rtsw(
                "https://services.swpc.noaa.gov/products/solar-wind/ephemerides.json"
            ),
            Some(SwpcEndpoint::RtswEphemerides1h)
        );
        assert_eq!(
            replacement_for_deprecated_rtsw("https://example.invalid"),
            None
        );
        assert!(requires_local_retention_for_window("3-day"));
        assert!(requires_local_retention_for_window("7d"));
        assert!(!requires_local_retention_for_window("1-day"));
    }

    #[test]
    fn replacement_endpoints_are_current_schema_era() {
        assert_eq!(
            SwpcEndpoint::RtswMag1m.schema_era(),
            SwpcSchemaEra::Scn26_21
        );
        assert_eq!(
            SwpcEndpoint::RtswWind1m.schema_era(),
            SwpcSchemaEra::Scn26_21
        );
        for endpoint in [
            SwpcEndpoint::KyotoDst,
            SwpcEndpoint::Summary10cmFlux,
            SwpcEndpoint::Flux10cm30Day,
            SwpcEndpoint::PlanetaryKIndex,
            SwpcEndpoint::PlanetaryKIndexForecast,
            SwpcEndpoint::SummarySolarWindMagField,
            SwpcEndpoint::SummarySolarWindSpeed,
            SwpcEndpoint::RtswEphemerides1h,
            SwpcEndpoint::RtswMag1m,
            SwpcEndpoint::RtswWind1m,
        ] {
            assert!(endpoint
                .url()
                .starts_with("https://services.swpc.noaa.gov/"));
            assert_eq!(endpoint.schema_era(), SwpcSchemaEra::Scn26_21);
        }
        assert_eq!(SOURCES.len(), 3);
        assert!(SOURCES.iter().all(|source| source.free_public));
        assert!(PUBLIC_ADAPTERS.iter().all(|adapter| {
            !adapter.id.is_empty()
                && !adapter.name.is_empty()
                && adapter.url.starts_with("https://")
                && !adapter.layer_kind.is_empty()
                && !adapter.default_quality.is_empty()
        }));
    }

    #[test]
    fn extracts_simple_json_scalars() {
        let raw = r#"[{"time_tag":"2026-04-30T00:00:00Z","source":"DSCOVR","active":true}]"#;
        assert_eq!(
            extract_json_scalar(raw, "time_tag"),
            Some("2026-04-30T00:00:00Z".to_string())
        );
        assert_eq!(
            extract_json_scalar(raw, "source"),
            Some("DSCOVR".to_string())
        );
        assert_eq!(extract_json_scalar(raw, "active"), Some("true".to_string()));
        assert_eq!(extract_json_scalar(raw, "missing"), None);
        assert_eq!(extract_json_scalar(r#"{"x" 1}"#, "x"), None);
        assert_eq!(extract_json_scalar(r#"{"x":"unterminated}"#, "x"), None);
    }

    #[test]
    fn report_uses_fixtures_then_prefers_cache_and_is_valid_json_shape() {
        let fallback = temp_dir("fallback");
        fs::write(
            fallback.join("rtsw_mag_1m_new.json"),
            r#"[{"time_tag":"2026-04-30T00:00:00Z","source":"DSCOVR","active":true}]"#,
        )
        .unwrap();
        fs::write(
            fallback.join("rtsw_wind_1m_new.json"),
            r#"[{"time_tag":"2026-04-30T00:01:00Z","source":"ACE","active":false}]"#,
        )
        .unwrap();
        let fixture = swpc_observation_report_json(None, Some(&fallback)).unwrap();
        assert!(fixture.contains(r#""source_mode": "fixture""#));
        assert!(fixture.contains("deterministic SWPC fixtures"));
        assert!(fixture.contains(r#""active": true"#));
        assert!(fixture.contains(r#""active": false"#));
        for adapter in PUBLIC_ADAPTERS {
            assert!(fixture.contains(adapter.id));
        }

        let cache = temp_dir("cache");
        fs::write(
            cache.join("rtsw_mag_1m.json"),
            r#"[{"time_tag":"2026-05-01","source":"SOLAR1","active":null}]"#,
        )
        .unwrap();
        fs::write(
            cache.join("rtsw_wind_1m.json"),
            r#"[{"time_tag":"2026-05-01","source":"DSCOVR"}]"#,
        )
        .unwrap();
        let cached = swpc_observation_report_json(Some(&cache), Some(&fallback)).unwrap();
        assert!(cached.contains(r#""source_mode": "cached""#));
        assert!(cached.contains("Cached public data was used"));
        assert!(cached.contains(r#""active": null"#));
        assert!(cached.ends_with("}\n"));

        fs::remove_dir_all(cache).unwrap();
        fs::remove_dir_all(fallback).unwrap();
    }

    #[test]
    fn report_errors_are_specific_and_fallback_layouts_are_supported() {
        let empty = temp_dir("empty");
        let error = swpc_observation_report_json(None, None).unwrap_err();
        assert!(error.contains("no fallback fixture directory"));
        let error = swpc_observation_report_json(None, Some(&empty)).unwrap_err();
        assert!(error.contains("No SWPC source file found"));

        let nested = empty.join("swpc_scn26_21");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("rtsw_mag_1m_new.json"), "{}").unwrap();
        fs::write(nested.join("rtsw_wind_1m_new.json"), "{}").unwrap();
        assert!(swpc_observation_report_json(None, Some(&empty)).is_ok());

        let directory = nested.join("rtsw_mag_1m.json");
        fs::create_dir_all(&directory).unwrap();
        assert!(read_source(directory, "fixture", SwpcEndpoint::RtswMag1m).is_err());
        fs::remove_dir_all(empty).unwrap();
    }

    #[test]
    fn escaping_and_excerpt_never_emit_raw_controls() {
        let mut out = String::new();
        json_string_field(&mut out, 1, "k\n", "\"\\\r\t\u{0001}", false);
        assert_eq!(out, "  \"k\\n\": \"\\\"\\\\\\r\\t\\u0001\"\n");
        let mut pair = String::new();
        string_pair(&mut pair, "key", "value", true);
        assert_eq!(pair, r#""key":"value","#);
        let long = format!("{}\u{0000}tail", "x".repeat(300));
        let excerpt = raw_excerpt(&long);
        assert_eq!(excerpt.chars().count(), 240);
        assert!(!excerpt.contains('\u{0000}'));
    }

    #[test]
    fn structural_selection_uses_newest_attributable_record_not_embedded_text() {
        let raw = r#"[{"time_tag":"2026-09-10T01:00:00Z","source":"OLD","active":true},
          {"note":"source: misleading","time_tag":"2026-09-11T01:00:00Z","source":"NEW","active":false},
          {"time_tag":"2026-09-12T01:00:00Z","source":"","active":true}]"#;
        assert_eq!(extract_json_scalar(raw, "source"), Some("NEW".into()));
        assert_eq!(extract_json_scalar(raw, "active"), Some("false".into()));
    }

    #[test]
    fn numeric_normalization_rejects_nonfinite() {
        for value in ["inf", "Infinity", "1e999", "\"NaN\""] {
            assert_eq!(normalize_numeric(value), None);
        }
    }

    #[test]
    fn newest_signal_ignores_metadata_only_and_inactive_records() {
        let parsed = parse_json(
            r#"[
          {"time_tag":"2026-09-12T00:00:00Z","source":"NEW-METADATA"},
          {"time_tag":"2026-09-11T00:00:00Z","source":"F107","flux":"150","active":true},
          {"time_tag":"2026-09-13T00:00:00Z","source":"INACTIVE","flux":235,"active":false},
          {"time_tag":"2026-09-10T00:00:00Z","source":"OLDER","flux":235}
        ]"#,
        )
        .unwrap();
        let selected = newest_record(&parsed, true, None).unwrap();
        assert_eq!(scalar(selected, "source"), Some("F107".into()));
        assert_eq!(numeric_field(selected, "flux"), Some(150.0));
        assert_eq!(timestamp_seconds("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(timestamp_seconds("2026-09-11T00:00:00Z"), Some(1789084800));
        for invalid in [
            "2026-02-29",
            "2026-09-31",
            "2026-13-01",
            "2026-09-11T24:00:00Z",
            "2026-09-11T12:00:00+02:00",
        ] {
            assert!(timestamp_seconds(invalid).is_none(), "{invalid}");
        }
    }

    #[test]
    fn cached_f107_freshness_is_saved_at_the_requested_evaluation_time() {
        let root = temp_dir("freshness");
        fs::write(root.join("rtsw_mag_1m.json"), "[]").unwrap();
        fs::write(root.join("rtsw_wind_1m.json"), "[]").unwrap();
        fs::write(
            root.join("f107_cm_flux.json"),
            r#"[{"time_tag":"2026-09-11T00:00:00Z","source":"F107","flux":150}]"#,
        )
        .unwrap();
        for (at, stale) in [
            (1789084800, false),
            (1789257600, false),
            (1789257601, true),
            (1789084799, true),
        ] {
            let report = swpc_observation_report_json_at(Some(&root), None, at).unwrap();
            let parsed = parse_json(&report).unwrap();
            let context = parsed.get("observed_context").unwrap();
            assert_eq!(context.get("activity_index").unwrap().as_f64(), Some(0.5));
            let freshness = context
                .get("signal_freshness")
                .unwrap()
                .get("swpc-f107-cm-flux")
                .unwrap();
            assert_eq!(freshness.get("stale").unwrap().as_bool(), Some(stale));
        }
        fs::write(root.join("f107_cm_flux.json"), r#"[{"flux":1,"flux":2}]"#).unwrap();
        assert!(
            swpc_observation_report_json_at(Some(&root), None, 1789084800)
                .unwrap_err()
                .contains("duplicate")
        );
        fs::remove_dir_all(root).unwrap();
    }
}
