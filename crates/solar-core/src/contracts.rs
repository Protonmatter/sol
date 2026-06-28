use crate::{ActiveRegion, Field2D, Polarity, SolarMode, SolarState};

pub const SOLAR_STATE_SNAPSHOT_SCHEMA: &str = "solar-state-snapshot.v1";
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
                "Research and learning use only; not operational space-weather forecasting.",
            ],
            observations_json: None,
        }
    }
}

pub fn solar_state_snapshot_json(state: &SolarState, request: &SnapshotRequest<'_>) -> String {
    let mut out = String::with_capacity(256 + state.br.values.len() * 40);
    out.push_str("{\n");
    json_string_field(&mut out, 1, "schema_version", SOLAR_STATE_SNAPSHOT_SCHEMA, true);
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
    operational_readiness_json(&mut out);

    out.push_str("  \"manifest\": {\n");
    json_string_field(&mut out, 2, "schema_version", MODEL_RUN_MANIFEST_SCHEMA, true);
    json_string_field(&mut out, 2, "model_name", "Solar Maximum Engine CPU reference", true);
    json_string_field(&mut out, 2, "math_basis", "differential rotation + diffusion + source injection + decay + diagonal Kalman-style assimilation contract", true);
    json_string_field(&mut out, 2, "rendering_rule", "UI renders immutable state snapshots and does not own the physics model", false);
    out.push_str("  },\n");

    out.push_str("  \"run\": {\n");
    out.push_str(&format!("    \"seed\": {},\n", request.seed));
    out.push_str(&format!("    \"steps\": {},\n", request.steps));
    out.push_str(&format!("    \"dt_hours\": {:.6},\n", request.dt_hours));
    out.push_str(&format!("    \"activity_index\": {:.6},\n", request.activity_index));
    out.push_str(&format!("    \"time_seconds\": {:.6},\n", state.time_seconds));
    json_string_field(&mut out, 2, "mode", solar_mode_name(&state.mode), false);
    out.push_str("  },\n");

    out.push_str("  \"grid\": {\n");
    out.push_str(&format!("    \"lon_count\": {},\n", state.grid.lon_count));
    out.push_str(&format!("    \"lat_count\": {},\n", state.grid.lat_count));
    out.push_str(&format!("    \"dlon_deg\": {:.6},\n", state.grid.dlon_deg));
    out.push_str(&format!("    \"dlat_deg\": {:.6}\n", state.grid.dlat_deg));
    out.push_str("  },\n");

    out.push_str("  \"layers\": [\n");
    out.push_str("    {\"id\":\"br_normalized\",\"label\":\"Radial magnetic field\",\"kind\":\"synthetic\",\"units\":\"normalized magnetic field\"},\n");
    out.push_str("    {\"id\":\"continuum_proxy\",\"label\":\"Continuum brightness proxy\",\"kind\":\"inferred\",\"units\":\"relative intensity\"},\n");
    out.push_str("    {\"id\":\"confidence\",\"label\":\"Model confidence\",\"kind\":\"inferred\",\"units\":\"0..1\"},\n");
    out.push_str("    {\"id\":\"active_regions\",\"label\":\"Active region births\",\"kind\":\"synthetic\",\"units\":\"normalized metadata\"}\n");
    out.push_str("  ],\n");

    out.push_str("  \"fields\": {\n");
    field_json(&mut out, "br_normalized", &state.br, "normalized magnetic field", true);
    field_json(
        &mut out,
        "br_variance_normalized",
        &state.br_variance,
        "normalized variance",
        true,
    );
    field_json(&mut out, "continuum_proxy", &state.continuum, "relative intensity", true);
    field_json(&mut out, "confidence", &state.confidence, "0..1", false);
    out.push_str("  },\n");

    out.push_str("  \"active_regions\": [");
    for (idx, region) in state.active_regions.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        active_region_json(&mut out, region);
    }
    out.push_str("],\n");

    out.push_str("  \"learning\": {\n");
    json_string_field(&mut out, 2, "cycle_stage", cycle_stage(request.activity_index), true);
    json_string_field(&mut out, 2, "plain_language_insight", insight(state), false);
    out.push_str("  },\n");

    out.push_str("  \"observations\": ");
    match request.observations_json {
        Some(raw) => out.push_str(raw),
        None => out.push_str("[]"),
    }
    out.push_str(",\n");

    out.push_str("  \"warnings\": [");
    for (idx, warning) in request.warnings.iter().enumerate() {
        if idx > 0 {
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

fn operational_readiness_json(out: &mut String) {
    out.push_str("  \"operational_readiness\": {\n");
    json_string_field(out, 2, "schema_version", "operational-readiness.v1", true);
    json_string_field(out, 2, "status", "research_learning_ready", true);
    out.push_str("    \"research_learning_ready\": true,\n");
    out.push_str("    \"space_weather_operational\": false,\n");
    out.push_str("    \"data_state\": {\n");
    json_string_field(out, 3, "source_mode", "synthetic", true);
    json_string_field(out, 3, "observation_mode", "none", true);
    json_string_field(out, 3, "cache_state", "none", true);
    out.push_str("      \"live_data_present\": false\n");
    out.push_str("    },\n");
    out.push_str("    \"gates\": [\n");
    out.push_str("      {\"id\":\"snapshot_contract\",\"label\":\"Versioned snapshot contract present\",\"passed\":true},\n");
    out.push_str("      {\"id\":\"deterministic_replay\",\"label\":\"Deterministic replay available\",\"passed\":true},\n");
    out.push_str("      {\"id\":\"public_data_provenance\",\"label\":\"Public-data provenance retained when observations are attached\",\"passed\":true},\n");
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
    out.push_str("      \"Outputs are not approved for warning, mission safety, or fleet operations.\"\n");
    out.push_str("    ]\n");
    out.push_str("  },\n");
}

fn field_json(out: &mut String, id: &str, field: &Field2D, units: &str, trailing: bool) {
    out.push_str("    \"");
    push_escaped(out, id);
    out.push_str("\": {\"units\":\"");
    push_escaped(out, units);
    out.push_str("\",\"values\":[");
    for (idx, value) in field.values.iter().enumerate() {
        if idx > 0 {
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
    if value.is_finite() {
        out.push_str(&format!("{:.6}", value));
    } else {
        out.push_str("null");
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
    fn snapshot_contract_includes_schema_and_layer_labels() {
        let state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
        let json = solar_state_snapshot_json(&state, &SnapshotRequest::synthetic(42, 1, 1.0, 0.9));
        assert!(json.contains("\"schema_version\": \"solar-state-snapshot.v1\""));
        assert!(json.contains("\"schema_version\": \"model-run-manifest.v1\""));
        assert!(json.contains("\"kind\":\"synthetic\""));
        assert!(json.contains("\"kind\":\"inferred\""));
        assert!(json.contains("\"operational_use\": false"));
        assert!(json.contains("\"schema_version\": \"operational-readiness.v1\""));
        assert!(json.contains("\"space_weather_operational\": false"));
    }
}
