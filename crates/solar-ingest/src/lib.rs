//! Ingest crate scaffold for public/free solar data sources.
//!
//! v0.1.1 adds explicit NOAA/SWPC schema-change handling from
//! NWS Service Change Notice 26-21. The adapter layer must tolerate both
//! old and new SWPC JSON shapes during migrations and tests must pin the
//! canonical field mappings for RTSW replacement products.

use std::fs;
use std::path::{Path, PathBuf};

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
            SwpcEndpoint::Summary10cmFlux => "https://services.swpc.noaa.gov/products/summary/10cm-flux.json",
            SwpcEndpoint::Flux10cm30Day => "https://services.swpc.noaa.gov/products/10cm-flux-30-day.json",
            SwpcEndpoint::PlanetaryKIndex => "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
            SwpcEndpoint::PlanetaryKIndexForecast => "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
            SwpcEndpoint::SummarySolarWindMagField => "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
            SwpcEndpoint::SummarySolarWindSpeed => "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
            SwpcEndpoint::RtswEphemerides1h => "https://services.swpc.noaa.gov/json/rtsw/rtsw_ephemerides_1h.json",
            SwpcEndpoint::RtswMag1m => "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
            SwpcEndpoint::RtswWind1m => "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
        }
    }

    pub fn schema_era(self) -> SwpcSchemaEra {
        match self {
            SwpcEndpoint::RtswEphemerides1h | SwpcEndpoint::RtswMag1m | SwpcEndpoint::RtswWind1m => SwpcSchemaEra::Scn26_21,
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
        default_quality: "observer geometry contract for Sun/Earth context; not a solar magnetic model",
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
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") || trimmed.eq_ignore_ascii_case("nan") {
        return None;
    }
    trimmed.parse::<f64>().ok()
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

pub fn swpc_observation_report_json(cache_dir: Option<&Path>, fallback_dir: Option<&Path>) -> Result<String, String> {
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

    let source_mode = if mag.mode == "cached" || wind.mode == "cached" {
        "cached"
    } else {
        "fixture"
    };

    let mut out = String::new();
    out.push_str("{\n");
    json_string_field(&mut out, 1, "schema_version", "observation-frame.v1", true);
    json_string_field(&mut out, 1, "generated_by", "solar-ingest", true);
    json_string_field(&mut out, 1, "source_mode", source_mode, true);
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
    candidate_json(&mut out, &wind, "swpc-rtsw-wind-1m", false);
    out.push_str("  ],\n");
    out.push_str("  \"warnings\": [");
    if source_mode == "fixture" {
        out.push_str("\"No live cache files were present; deterministic SWPC fixtures were used.\"");
    } else {
        out.push_str("\"Cached public data was used; freshness depends on the external fetch workflow.\"");
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

    let fallback = fallback_dir.ok_or_else(|| format!("No cache file and no fallback fixture directory for {cache_name}"))?;
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

fn read_source(path: PathBuf, mode: &'static str, endpoint: SwpcEndpoint) -> Result<SourceCandidate, String> {
    let raw = fs::read_to_string(&path).map_err(|err| format!("{}: {err}", path.display()))?;
    Ok(SourceCandidate { endpoint, path, mode, raw })
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
    out.push_str("    {\n");
    json_string_field(out, 3, "id", id, true);
    json_string_field(out, 3, "schema_version", "observation-frame.v1", true);
    json_string_field(out, 3, "layer_kind", "observed", true);
    json_string_field(out, 3, "source_mode", candidate.mode, true);
    json_string_field(out, 3, "endpoint", candidate.endpoint.url(), true);
    json_string_field(out, 3, "local_path", &candidate.path.display().to_string(), true);
    out.push_str(&format!("      \"raw_bytes\": {},\n", candidate.raw.len()));
    out.push_str("      \"provenance\": {");
    string_pair(out, "time_tag", extract_json_scalar(&candidate.raw, "time_tag").as_deref().unwrap_or("unknown"), true);
    string_pair(out, "source", extract_json_scalar(&candidate.raw, "source").as_deref().unwrap_or("unknown"), true);
    out.push_str("\"active\": ");
    out.push_str(match extract_json_scalar(&candidate.raw, "active").as_deref() {
        Some("true") => "true",
        Some("false") => "false",
        _ => "null",
    });
    out.push_str(", ");
    string_pair(out, "raw_excerpt", raw_excerpt(&candidate.raw).as_str(), false);
    out.push_str("},\n");
    out.push_str("      \"quality_flags\": [\"source metadata retained\", \"schema-era numeric normalization supported\", \"not promoted to operational truth\"]\n");
    out.push_str("    }");
    if trailing {
        out.push(',');
    }
    out.push('\n');
}

fn extract_json_scalar(raw: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let start = raw.find(&needle)?;
    let after_key = &raw[start + needle.len()..];
    let colon = after_key.find(':')?;
    let mut value = after_key[colon + 1..].trim_start();
    if value.starts_with('"') {
        value = &value[1..];
        let end = value.find('"')?;
        return Some(value[..end].to_string());
    }
    let end = value
        .find(|ch: char| ch == ',' || ch == '}' || ch == ']')
        .unwrap_or(value.len());
    Some(value[..end].trim().trim_matches('"').to_string())
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

    #[test]
    fn parses_old_quoted_and_new_numeric_values() {
        assert_eq!(normalize_numeric("\"456.7\""), Some(456.7));
        assert_eq!(normalize_numeric("456.7"), Some(456.7));
        assert_eq!(normalize_numeric("null"), None);
    }

    #[test]
    fn maps_deprecated_wind_fields() {
        assert_eq!(canonical_wind_field_name("density"), "proton_density");
        assert_eq!(canonical_wind_field_name("speed"), "proton_speed");
        assert_eq!(canonical_wind_field_name("temperature"), "proton_temperature");
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
            replacement_for_deprecated_rtsw("https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json"),
            Some(SwpcEndpoint::RtswWind1m)
        );
        assert_eq!(
            replacement_for_deprecated_rtsw("https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json"),
            Some(SwpcEndpoint::RtswMag1m)
        );
    }

    #[test]
    fn replacement_endpoints_are_current_schema_era() {
        assert_eq!(SwpcEndpoint::RtswMag1m.schema_era(), SwpcSchemaEra::Scn26_21);
        assert_eq!(SwpcEndpoint::RtswWind1m.schema_era(), SwpcSchemaEra::Scn26_21);
    }

    #[test]
    fn extracts_simple_json_scalars() {
        let raw = r#"[{"time_tag":"2026-04-30T00:00:00Z","source":"DSCOVR","active":true}]"#;
        assert_eq!(extract_json_scalar(raw, "time_tag"), Some("2026-04-30T00:00:00Z".to_string()));
        assert_eq!(extract_json_scalar(raw, "source"), Some("DSCOVR".to_string()));
        assert_eq!(extract_json_scalar(raw, "active"), Some("true".to_string()));
    }
}
