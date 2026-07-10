use crate::{ActiveRegion, Field2D, Polarity, SolarMode, SolarState};

pub const SOLAR_STATE_SNAPSHOT_SCHEMA: &str = "solar-state-snapshot.v2";
pub const OBSERVATION_FRAME_SCHEMA: &str = "observation-frame.v1";
pub const MODEL_RUN_MANIFEST_SCHEMA: &str = "model-run-manifest.v1";

#[derive(Clone, Debug)]
pub struct SnapshotRequest<'a> {
    pub model_version: &'a str,
    pub seed: u64,
    pub steps: usize,
    pub dt_hours: f64,
    pub activity_index: f32,
    pub source_mode: &'a str,
    pub warnings: Vec<&'a str>,
    /// Trusted JSON array produced by the ingest layer. The serializer verifies
    /// that it is a balanced JSON array envelope before embedding it.
    pub observations_json: Option<&'a str>,
}

impl<'a> SnapshotRequest<'a> {
    pub fn synthetic(seed: u64, steps: usize, dt_hours: f64, activity_index: f32) -> Self {
        Self {
            model_version: env!("CARGO_PKG_VERSION"),
            seed,
            steps,
            dt_hours,
            activity_index,
            source_mode: "synthetic",
            warnings: vec![
                "Reduced surface flux transport model in normalized magnetic units.",
                "Grid coordinates are west-positive heliographic Carrington coordinates.",
                "Research and learning use only; not operational space-weather forecasting.",
            ],
            observations_json: None,
        }
    }
}

pub fn solar_state_snapshot_json(state: &SolarState, request: &SnapshotRequest<'_>) -> String {
    validate_snapshot_inputs(state, request);

    let mut out = String::with_capacity(512 + state.br.values.len() * 40);
    out.push_str("{\n");
    json_string_field(
        &mut out,
        1,
        "schema_version",
        SOLAR_STATE_SNAPSHOT_SCHEMA,
        true,
    );
    json_string_field(&mut out, 1, "model_version", request.model_version, true);
    json_string_field(&mut out, 1, "source_mode", request.source_mode, true);
    out.push_str("  \"operational_use\": false,\n");
    json_string_field(
        &mut out,
        1,
        "calibration_state",
        "normalized magnetic units; physical Gauss/Mx calibration not asserted",
        true,
    );
    operational_readiness_json(&mut out, request);

    out.push_str("  \"manifest\": {\n");
    json_string_field(
        &mut out,
        2,
        "schema_version",
        MODEL_RUN_MANIFEST_SCHEMA,
        true,
    );
    json_string_field(
        &mut out,
        2,
        "model_name",
        "Solar Maximum Engine CPU reference",
        true,
    );
    json_string_field(
        &mut out,
        2,
        "math_basis",
        "Carrington-frame differential rotation + fixed-clock diffusion + event-timed source injection + exponential decay + diagonal assimilation contract",
        true,
    );
    json_string_field(
        &mut out,
        2,
        "rendering_rule",
        "UI renders immutable state snapshots and does not own the physics model",
        false,
    );
    out.push_str("  },\n");

    out.push_str("  \"run\": {\n");
    out.push_str(&format!("    \"seed\": {},\n", request.seed));
    out.push_str(&format!("    \"steps\": {},\n", request.steps));
    out.push_str(&format!("    \"dt_hours\": {:.6},\n", request.dt_hours));
    out.push_str(&format!(
        "    \"activity_index\": {:.6},\n",
        request.activity_index
    ));
    out.push_str(&format!(
        "    \"time_seconds\": {:.6},\n",
        state.time_seconds
    ));
    json_string_field(&mut out, 2, "mode", solar_mode_name(&state.mode), false);
    out.push_str("  },\n");

    out.push_str("  \"coordinates\": {\n");
    json_string_field(
        &mut out,
        2,
        "frame",
        state.grid.coordinates.frame.name(),
        true,
    );
    json_string_field(
        &mut out,
        2,
        "longitude_positive",
        state.grid.coordinates.longitude_positive.name(),
        true,
    );
    json_string_field(
        &mut out,
        2,
        "latitude_type",
        state.grid.coordinates.latitude_type.name(),
        true,
    );
    out.push_str(&format!(
        "    \"reference_epoch_jd_tt\": {:.9},\n",
        state.grid.coordinates.reference_epoch_jd_tt
    ));
    out.push_str(&format!(
        "    \"central_meridian_longitude_deg\": {:.9},\n",
        state.grid.coordinates.central_meridian_longitude_deg
    ));
    out.push_str(&format!(
        "    \"rotation_reference_deg_per_day\": {:.9},\n",
        state.grid.coordinates.rotation_reference_deg_per_day
    ));
    json_string_field(
        &mut out,
        2,
        "observer",
        state.grid.coordinates.observer,
        false,
    );
    out.push_str("  },\n");

    out.push_str("  \"grid\": {\n");
    out.push_str(&format!("    \"lon_count\": {},\n", state.grid.lon_count));
    out.push_str(&format!("    \"lat_count\": {},\n", state.grid.lat_count));
    out.push_str(&format!("    \"dlon_deg\": {:.6},\n", state.grid.dlon_deg));
    out.push_str(&format!("    \"dlat_deg\": {:.6},\n", state.grid.dlat_deg));
    json_string_field(
        &mut out,
        2,
        "storage_order",
        "lat_major_lon_contiguous",
        true,
    );
    json_string_field(
        &mut out,
        2,
        "index_formula",
        "lat_i * lon_count + lon_i",
        false,
    );
    out.push_str("  },\n");

    out.push_str("  \"layers\": [\n");
    out.push_str("    {\"id\":\"br_normalized\",\"label\":\"Radial magnetic field\",\"kind\":\"synthetic\",\"units\":\"normalized magnetic field\"},\n");
    out.push_str("    {\"id\":\"continuum_proxy\",\"label\":\"Continuum brightness proxy\",\"kind\":\"inferred\",\"units\":\"relative intensity\"},\n");
    out.push_str("    {\"id\":\"confidence\",\"label\":\"Model confidence\",\"kind\":\"inferred\",\"units\":\"0..1\"},\n");
    out.push_str("    {\"id\":\"active_regions\",\"label\":\"Active region births\",\"kind\":\"synthetic\",\"units\":\"normalized metadata\"}\n");
    out.push_str("  ],\n");

    out.push_str("  \"fields\": {\n");
    field_json(
        &mut out,
        "br_normalized",
        &state.br,
        "normalized magnetic field",
        true,
    );
    field_json(
        &mut out,
        "br_variance_normalized",
        &state.br_variance,
        "normalized variance",
        true,
    );
    field_json(
        &mut out,
        "continuum_proxy",
        &state.continuum,
        "relative intensity",
        true,
    );
    field_json(&mut out, "confidence", &state.confidence, "0..1", false);
    out.push_str("  },\n");

    out.push_str("  \"active_regions\": [");
    for (index, region) in state.active_regions.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        active_region_json(&mut out, region);
    }
    out.push_str("],\n");

    out.push_str("  \"learning\": {\n");
    json_string_field(
        &mut out,
        2,
        "cycle_stage",
        cycle_stage(request.activity_index),
        true,
    );
    json_string_field(&mut out, 2, "plain_language_insight", insight(state), false);
    out.push_str("  },\n");

    out.push_str("  \"observations\": ");
    match request.observations_json {
        Some(raw) => out.push_str(raw.trim()),
        None => out.push_str("[]"),
    }
    out.push_str(",\n");

    out.push_str("  \"warnings\": [");
    for (index, warning) in request.warnings.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push('"');
        push_escaped(&mut out, warning);
        out.push('"');
    }
    out.push_str("]\n");
    out.push_str("}\n");
    out
}

fn validate_snapshot_inputs(state: &SolarState, request: &SnapshotRequest<'_>) {
    assert!(!request.model_version.is_empty());
    assert!(!request.source_mode.is_empty());
    assert!(request.dt_hours.is_finite() && request.dt_hours >= 0.0);
    assert!(request.activity_index.is_finite());
    assert!((0.0..=1.0).contains(&request.activity_index));
    assert!(state.time_seconds.is_finite() && state.time_seconds >= 0.0);

    let expected = state.grid.len();
    for field in [
        &state.br,
        &state.br_variance,
        &state.continuum,
        &state.confidence,
    ] {
        assert_eq!(field.values.len(), expected);
        assert!(field.values.iter().all(|value| value.is_finite()));
    }
    assert!(state.br_variance.values.iter().all(|value| *value >= 0.0));
    assert!(state
        .confidence
        .values
        .iter()
        .all(|value| (0.0..=1.0).contains(value)));
    for region in &state.active_regions {
        assert!(region.birth_seconds.is_finite() && region.birth_seconds >= 0.0);
        assert!(region.birth_seconds <= state.time_seconds + 1.0e-6);
        assert!(region.lat_deg.is_finite() && (-90.0..=90.0).contains(&region.lat_deg));
        assert!(region.lon_deg.is_finite() && (0.0..360.0).contains(&region.lon_deg));
        assert!(region.flux_norm.is_finite() && region.flux_norm > 0.0);
        assert!(region.area_msh.is_finite() && region.area_msh >= 0.0);
        assert!(region.tilt_deg.is_finite() && (-90.0..=90.0).contains(&region.tilt_deg));
        assert!(region.complexity.is_finite() && (0.0..=1.0).contains(&region.complexity));
        assert!(region.confidence.is_finite() && (0.0..=1.0).contains(&region.confidence));
    }
    if let Some(raw) = request.observations_json {
        assert!(
            balanced_json_array_envelope(raw),
            "observations_json must be a balanced JSON array"
        );
    }
}

fn balanced_json_array_envelope(raw: &str) -> bool {
    let text = raw.trim();
    if !text.starts_with('[') || !text.ends_with(']') {
        return false;
    }

    let mut stack = Vec::new();
    let mut in_string = false;
    let mut escaped = false;
    for character in text.chars() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            match character {
                '\\' => escaped = true,
                '"' => in_string = false,
                control if control.is_control() => return false,
                _ => {}
            }
            continue;
        }
        match character {
            '"' => in_string = true,
            '[' | '{' => stack.push(character),
            ']' => {
                if stack.pop() != Some('[') {
                    return false;
                }
            }
            '}' => {
                if stack.pop() != Some('{') {
                    return false;
                }
            }
            control if control.is_control() && !control.is_whitespace() => return false,
            _ => {}
        }
    }
    !in_string && !escaped && stack.is_empty()
}

fn operational_readiness_json(out: &mut String, request: &SnapshotRequest<'_>) {
    let observations = request
        .observations_json
        .map(str::trim)
        .filter(|raw| *raw != "[]");
    let source_lower = request.source_mode.to_ascii_lowercase();
    let observation_mode = observations.map(|_| request.source_mode).unwrap_or("none");
    let cache_state = if source_lower.contains("cached") {
        "cached"
    } else if source_lower.contains("fixture") {
        "fixture"
    } else {
        "none"
    };
    let live_data_present = observations.is_some()
        && !source_lower.contains("fixture")
        && ["live", "cached", "observed", "assimilation"]
            .iter()
            .any(|token| source_lower.contains(token));
    let provenance_present = observations.is_none()
        || observations
            .is_some_and(|raw| raw.contains("\"provenance\"") && raw.contains("\"source\""));

    out.push_str("  \"operational_readiness\": {\n");
    json_string_field(out, 2, "schema_version", "operational-readiness.v1", true);
    json_string_field(out, 2, "status", "research_learning_ready", true);
    out.push_str("    \"research_learning_ready\": true,\n");
    out.push_str("    \"space_weather_operational\": false,\n");
    out.push_str("    \"data_state\": {\n");
    json_string_field(out, 3, "source_mode", request.source_mode, true);
    json_string_field(out, 3, "observation_mode", observation_mode, true);
    json_string_field(out, 3, "cache_state", cache_state, true);
    out.push_str(&format!(
        "      \"live_data_present\": {}\n",
        live_data_present
    ));
    out.push_str("    },\n");
    out.push_str("    \"gates\": [\n");
    out.push_str("      {\"id\":\"snapshot_contract\",\"label\":\"Versioned snapshot contract present\",\"passed\":true},\n");
    out.push_str("      {\"id\":\"coordinate_frame_explicit\",\"label\":\"Solar coordinate frame and storage order explicit\",\"passed\":true},\n");
    out.push_str("      {\"id\":\"deterministic_replay\",\"label\":\"Deterministic replay available\",\"passed\":true},\n");
    out.push_str(&format!(
        "      {{\"id\":\"public_data_provenance\",\"label\":\"Public-data provenance retained when observations are attached\",\"passed\":{}}},\n",
        provenance_present
    ));
    out.push_str("      {\"id\":\"normalized_units_disclosed\",\"label\":\"Normalized magnetic units disclosed\",\"passed\":true},\n");
    out.push_str("      {\"id\":\"calibrated_physical_units\",\"label\":\"Calibrated Gauss/Mx units\",\"passed\":false},\n");
    out.push_str("      {\"id\":\"historical_validation\",\"label\":\"Historical forecast validation\",\"passed\":false},\n");
    out.push_str("      {\"id\":\"swpc_product_comparison\",\"label\":\"Comparison against operational SWPC products\",\"passed\":false},\n");
    out.push_str("      {\"id\":\"operational_monitoring\",\"label\":\"Adapter freshness monitoring and alerting\",\"passed\":false}\n");
    out.push_str("    ],\n");
    out.push_str("    \"blockers\": [\n");
    out.push_str("      \"Calibrated physical magnetic units are not implemented.\",\n");
    out.push_str("      \"No historical validation skill score is present.\",\n");
    out.push_str("      \"No on-call alerting, SLA, or operational authority is configured.\",\n");
    out.push_str(
        "      \"Outputs are not approved for warning, mission safety, or fleet operations.\"\n",
    );
    out.push_str("    ]\n");
    out.push_str("  },\n");
}

fn field_json(out: &mut String, id: &str, field: &Field2D, units: &str, trailing: bool) {
    out.push_str("    \"");
    push_escaped(out, id);
    out.push_str("\": {\"units\":\"");
    push_escaped(out, units);
    out.push_str("\",\"values\":[");
    for (index, value) in field.values.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        push_f32(out, *value);
    }
    out.push_str("]}");
    if trailing {
        out.push(',');
    }
    out.push('\n');
}

fn active_region_json(out: &mut String, region: &ActiveRegion) {
    out.push('{');
    out.push_str(&format!("\"id\":{},", region.id));
    out.push_str(&format!("\"birth_seconds\":{:.6},", region.birth_seconds));
    out.push_str(&format!("\"lat_deg\":{:.6},", region.lat_deg));
    out.push_str(&format!("\"lon_deg\":{:.6},", region.lon_deg));
    out.push_str(&format!("\"flux_norm\":{:.6},", region.flux_norm));
    out.push_str(&format!("\"area_msh\":{:.6},", region.area_msh));
    out.push_str(&format!("\"tilt_deg\":{:.6},", region.tilt_deg));
    out.push_str(&format!("\"complexity\":{:.6},", region.complexity));
    out.push_str("\"polarity\":\"");
    out.push_str(match region.polarity {
        Polarity::LeadingPositive => "leading_positive",
        Polarity::LeadingNegative => "leading_negative",
    });
    out.push_str("\",");
    out.push_str(&format!("\"confidence\":{:.6}", region.confidence));
    out.push('}');
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

fn push_f32(out: &mut String, value: f32) {
    assert!(value.is_finite());
    out.push_str(&format!("{:.6}", value));
}

fn push_escaped(out: &mut String, value: &str) {
    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            control if control.is_control() => out.push_str(&format!("\\u{:04x}", control as u32)),
            other => out.push(other),
        }
    }
}

fn solar_mode_name(mode: &SolarMode) -> &'static str {
    match mode {
        SolarMode::Synthetic => "Synthetic",
        SolarMode::Assimilation => "Assimilation",
        SolarMode::DegradedSyntheticFallback => "DegradedSyntheticFallback",
    }
}

fn cycle_stage(activity_index: f32) -> &'static str {
    if activity_index >= 0.75 {
        "solar maximum"
    } else if activity_index >= 0.45 {
        "rising or declining phase"
    } else {
        "solar minimum"
    }
}

fn insight(state: &SolarState) -> &'static str {
    if state.active_regions.len() >= 24 {
        "Many active regions are present, so the model shows a busy solar maximum surface."
    } else if state.active_regions.is_empty() {
        "No active regions have emerged yet; the surface is quiet in this run."
    } else {
        "Active regions are emerging and being carried by differential rotation."
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SolarGrid, SolarMode, SolarState};

    #[test]
    fn snapshot_contract_includes_coordinate_semantics() {
        let state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
        let json = solar_state_snapshot_json(&state, &SnapshotRequest::synthetic(42, 0, 1.0, 0.9));
        assert!(json.contains("\"schema_version\": \"solar-state-snapshot.v2\""));
        assert!(json.contains("\"frame\": \"heliographic_carrington\""));
        assert!(json.contains("\"longitude_positive\": \"west\""));
        assert!(json.contains("\"index_formula\": \"lat_i * lon_count + lon_i\""));
        assert!(json.contains("\"operational_use\": false"));
    }

    #[test]
    fn readiness_reflects_observation_source_instead_of_hardcoding_synthetic() {
        let state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Assimilation);
        let mut request = SnapshotRequest::synthetic(42, 0, 1.0, 0.9);
        request.source_mode = "cached";
        request.observations_json = Some(
            "[{\"schema_version\":\"observation-frame.v1\",\"source_mode\":\"cached\",\"provenance\":{\"source\":\"NOAA\"}}]",
        );
        let json = solar_state_snapshot_json(&state, &request);
        assert!(json.contains("\"source_mode\": \"cached\""));
        assert!(json.contains("\"observation_mode\": \"cached\""));
        assert!(json.contains("\"cache_state\": \"cached\""));
        assert!(json.contains("\"live_data_present\": true"));
    }

    #[test]
    #[should_panic(expected = "observations_json must be a balanced JSON array")]
    fn malformed_observation_envelope_is_rejected() {
        let state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
        let mut request = SnapshotRequest::synthetic(42, 0, 1.0, 0.9);
        request.observations_json = Some("[{\"broken\":true}");
        let _ = solar_state_snapshot_json(&state, &request);
    }

    #[test]
    #[should_panic]
    fn nonfinite_run_parameters_are_rejected_before_serialization() {
        let state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
        let request = SnapshotRequest::synthetic(42, 0, f64::NAN, 0.9);
        let _ = solar_state_snapshot_json(&state, &request);
    }

    #[test]
    fn schema_file_documents_all_emitted_modes_and_gates() {
        let schema = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../docs/solar-state-snapshot-v2.schema.json"
        ))
        .expect("read docs/solar-state-snapshot-v2.schema.json");

        assert!(schema.contains("solar-state-snapshot.v2"));
        for mode in [
            solar_mode_name(&SolarMode::Synthetic),
            solar_mode_name(&SolarMode::Assimilation),
            solar_mode_name(&SolarMode::DegradedSyntheticFallback),
        ] {
            assert!(schema.contains(&format!("\"{mode}\"")));
        }
        for gate in [
            "snapshot_contract",
            "coordinate_frame_explicit",
            "deterministic_replay",
            "public_data_provenance",
            "normalized_units_disclosed",
            "calibrated_physical_units",
            "historical_validation",
            "swpc_product_comparison",
            "operational_monitoring",
        ] {
            assert!(schema.contains(&format!("\"{gate}\"")));
        }
    }
}
