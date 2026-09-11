//! Live v3 snapshot-copy validation. Frozen historical v2 has a separate explicit path.
use solar_core::{parse_json, JsonValue};

pub(crate) fn validate_document(raw: &str, schema_raw: &str) -> Result<JsonValue, String> {
    let value = parse_json(raw).map_err(|e| e.to_string())?;
    let schema = parse_json(schema_raw).map_err(|e| e.to_string())?;
    check_schema(&value, &schema, &schema, "$")?;
    Ok(value)
}

fn member<'a>(value: &'a JsonValue, key: &str) -> Result<&'a JsonValue, String> {
    value
        .get(key)
        .ok_or_else(|| format!("missing required property {key}"))
}

fn number(value: &JsonValue, key: &str) -> Result<f64, String> {
    member(value, key)?
        .as_f64()
        .ok_or_else(|| format!("{key} must be a number"))
}

fn string<'a>(value: &'a JsonValue, key: &str) -> Result<&'a str, String> {
    member(value, key)?
        .as_str()
        .ok_or_else(|| format!("{key} must be a string"))
}

fn array<'a>(value: &'a JsonValue, key: &str) -> Result<&'a [JsonValue], String> {
    member(value, key)?
        .as_array()
        .ok_or_else(|| format!("{key} must be an array"))
}

fn check_schema(
    value: &JsonValue,
    schema: &JsonValue,
    root: &JsonValue,
    path: &str,
) -> Result<(), String> {
    let JsonValue::Object(entries) = schema else {
        return if schema.as_bool() == Some(true) {
            Ok(())
        } else {
            Err(format!("{path}: invalid or rejecting schema"))
        };
    };
    for (key, _) in entries {
        if ![
            "$schema",
            "$id",
            "$defs",
            "$ref",
            "title",
            "description",
            "type",
            "const",
            "enum",
            "required",
            "properties",
            "additionalProperties",
            "items",
            "minItems",
            "maxItems",
            "minLength",
            "maxLength",
            "minimum",
            "maximum",
            "exclusiveMinimum",
            "exclusiveMaximum",
        ]
        .contains(&key.as_str())
        {
            return Err(format!("{path}: unsupported schema keyword {key}"));
        }
    }
    if let Some(reference) = schema.get("$ref").and_then(JsonValue::as_str) {
        let mut target = root;
        let suffix = reference
            .strip_prefix("#/")
            .ok_or_else(|| format!("unsupported schema reference {reference}"))?;
        for part in suffix.split('/') {
            target = member(target, &part.replace("~1", "/").replace("~0", "~"))?;
        }
        check_schema(value, target, root, path)?;
    }
    if schema
        .get("const")
        .is_some_and(|constant| constant != value)
    {
        return Err(format!("{path}: violates const"));
    }
    if let Some(options) = schema.get("enum").and_then(JsonValue::as_array) {
        if !options.contains(value) {
            return Err(format!("{path}: not an allowed enum value"));
        }
    }
    if let Some(type_value) = schema.get("type") {
        let types: Vec<&str> = if let Some(kind) = type_value.as_str() {
            vec![kind]
        } else {
            type_value
                .as_array()
                .ok_or("schema type must be string or array")?
                .iter()
                .map(|kind| kind.as_str().ok_or("schema type member must be string"))
                .collect::<Result<_, _>>()?
        };
        let mut matches = false;
        for kind in &types {
            matches |= match *kind {
                "object" => matches!(value, JsonValue::Object(_)),
                "array" => matches!(value, JsonValue::Array(_)),
                "string" => value.as_str().is_some(),
                "boolean" => value.as_bool().is_some(),
                "null" => matches!(value, JsonValue::Null),
                "number" => value.as_f64().is_some_and(f64::is_finite),
                "integer" => value
                    .as_f64()
                    .is_some_and(|n| n.is_finite() && n.fract() == 0.0),
                _ => return Err(format!("unsupported schema type {kind}")),
            };
        }
        if !matches {
            return Err(format!("{path}: expected {types:?}"));
        }
    }
    if let Some(n) = value.as_f64() {
        for key in ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"] {
            if let Some(bound) = schema.get(key).and_then(JsonValue::as_f64) {
                let invalid = match key {
                    "minimum" => n < bound,
                    "maximum" => n > bound,
                    "exclusiveMinimum" => n <= bound,
                    _ => n >= bound,
                };
                if invalid {
                    return Err(format!("{path}: violates {key} {bound}"));
                }
            }
        }
    }
    if let Some(text) = value.as_str() {
        if schema
            .get("maxLength")
            .and_then(JsonValue::as_f64)
            .is_some_and(|max| text.chars().count() as f64 > max)
        {
            return Err(format!("{path}: violates maxLength"));
        }
        if schema
            .get("minLength")
            .and_then(JsonValue::as_f64)
            .is_some_and(|min| (text.chars().count() as f64) < min)
        {
            return Err(format!("{path}: violates minLength"));
        }
    }
    if let JsonValue::Object(fields) = value {
        if let Some(required) = schema.get("required").and_then(JsonValue::as_array) {
            for key in required {
                let key = key.as_str().ok_or("schema required keys must be strings")?;
                if value.get(key).is_none() {
                    return Err(format!("{path}: missing required property {key}"));
                }
            }
        }
        for (key, child) in fields {
            let child_schema = schema.get("properties").and_then(|p| p.get(key));
            if let Some(child_schema) = child_schema {
                check_schema(child, child_schema, root, &format!("{path}.{key}"))?;
            } else if let Some(additional) = schema.get("additionalProperties") {
                check_schema(child, additional, root, &format!("{path}.{key}"))?;
            }
        }
    }
    if let Some(items) = value.as_array() {
        if schema
            .get("maxItems")
            .and_then(JsonValue::as_f64)
            .is_some_and(|max| items.len() as f64 > max)
        {
            return Err(format!("{path}: violates maxItems"));
        }
        if schema
            .get("minItems")
            .and_then(JsonValue::as_f64)
            .is_some_and(|min| (items.len() as f64) < min)
        {
            return Err(format!("{path}: violates minItems"));
        }
        if let Some(item_schema) = schema.get("items") {
            for (i, item) in items.iter().enumerate() {
                check_schema(item, item_schema, root, &format!("{path}[{i}]"))?;
            }
        }
    }
    Ok(())
}

fn unique_ids(items: &[JsonValue], path: &str) -> Result<(), String> {
    for (index, item) in items.iter().enumerate() {
        let id = member(item, "id")?;
        if items[..index]
            .iter()
            .any(|previous| previous.get("id") == Some(id))
        {
            return Err(format!("{path}: ids must be unique"));
        }
    }
    Ok(())
}

pub fn validate(raw: &str) -> Result<(), String> {
    let value = parse_json(raw).map_err(|err| format!("snapshot JSON: {err}"))?;
    if value.get("schema_version").and_then(JsonValue::as_str) != Some("solar-state-snapshot.v3") {
        return Err(
            "not a live solar-state-snapshot.v3 file; v2 requires explicit --historical-v2 copy"
                .into(),
        );
    }
    if value
        .get("coordinates")
        .and_then(|v| v.get("frame"))
        .and_then(JsonValue::as_str)
        != Some("heliographic_carrington")
    {
        return Err("snapshot lacks required Carrington coordinate metadata".into());
    }
    let schema = parse_json(include_str!(
        "../../../docs/solar-state-snapshot-v3.schema.json"
    ))
    .map_err(|err| format!("embedded v3 schema: {err}"))?;
    check_schema(&value, &schema, &schema, "$")?;
    semantics(&value)
}

fn semantics(value: &JsonValue) -> Result<(), String> {
    if !string(value, "calibration_state")?
        .to_lowercase()
        .contains("normalized")
    {
        return Err("calibration_state must disclose normalized units".into());
    }
    if string(value, "source_mode")?.trim().is_empty() {
        return Err("source_mode must be nonempty".into());
    }
    let run = member(value, "run")?;
    let time = number(run, "time_seconds")?;
    let expected = number(run, "steps")? * number(run, "dt_hours")? * 3600.0;
    if !expected.is_finite() || (time - expected).abs() > (expected.abs() * 1e-12).max(1e-6) {
        return Err("run.time_seconds must equal steps * dt_hours * 3600".into());
    }
    let coordinates = member(value, "coordinates")?;
    if (number(coordinates, "rotation_reference_deg_per_day")? - 14.1844).abs() > 1e-9 {
        return Err("coordinates.rotation_reference_deg_per_day must be 14.1844".into());
    }
    let grid = member(value, "grid")?;
    let lon = number(grid, "lon_count")?;
    let lat = number(grid, "lat_count")?;
    if (number(grid, "dlon_deg")? - 360.0 / lon).abs() > 1e-5
        || (number(grid, "dlat_deg")? - 180.0 / lat).abs() > 1e-5
    {
        return Err("grid spacing must agree with dimensions".into());
    }
    let fields = member(value, "fields")?;
    for key in ["br_normalized", "continuum_proxy", "confidence"] {
        let values = array(member(fields, key)?, "values")?;
        if values.len() as f64 != lon * lat {
            return Err(format!(
                "fields.{key}.values length must equal grid dimensions"
            ));
        }
        for v in values {
            let n = v.as_f64().ok_or("field value must be numeric")?;
            if key == "confidence" && !(0.0..=1.0).contains(&n) {
                return Err(format!("fields.{key}.values outside allowed range"));
            }
        }
    }
    let layers = array(value, "layers")?;
    unique_ids(layers, "layers")?;
    for key in ["br_normalized", "continuum_proxy", "confidence"] {
        if !layers
            .iter()
            .any(|l| l.get("id").and_then(JsonValue::as_str) == Some(key))
        {
            return Err(format!("layers missing {key}"));
        }
    }
    let regions = array(value, "active_regions")?;
    unique_ids(regions, "active_regions")?;
    for region in regions {
        let birth = member(region, "birth")?;
        let position = member(region, "model_position")?;
        if number(birth, "time_seconds")? > time {
            return Err("active_regions birth is in the future".into());
        }
        if number(position, "at_time_seconds")? != time
            || number(position, "lat_deg")? != number(birth, "lat_deg")?
        {
            return Err("active_regions current anchor time/latitude mismatch".into());
        }
    }
    let activity = member(member(value, "uncertainty")?, "activity")?;
    if number(activity, "at_time_seconds")? != time {
        return Err("activity uncertainty time mismatch".into());
    }
    if let Some(analysis_time) = member(activity, "last_analysis_time_seconds")?.as_f64() {
        if analysis_time > time {
            return Err("activity analysis time is in the future".into());
        }
    }
    if (number(activity, "process_noise_per_day")? == 0.0)
        != (string(activity, "process_noise_status")? == "disabled")
    {
        return Err("process noise rate/status mismatch".into());
    }
    let observations = array(value, "observations")?;
    for report in observations {
        if string(report, "schema_version")? != "observation-frame.v1"
            || string(report, "source_mode")?.is_empty()
        {
            return Err("observations require observation-frame.v1 and source_mode".into());
        }
        for frame in array(report, "frames")? {
            if !["synthetic", "observed", "blended", "inferred", "degraded"]
                .contains(&string(frame, "layer_kind")?)
                || string(frame, "source_mode")?.is_empty()
            {
                return Err("invalid observation layer_kind or source_mode".into());
            }
            let provenance = member(frame, "provenance")?;
            if string(provenance, "source")?.trim().is_empty() {
                return Err("observation provenance.source required".into());
            }
            member(provenance, "active")?;
            if !matches!(
                member(provenance, "raw_source_metadata")?,
                JsonValue::Object(_)
            ) {
                return Err("raw_source_metadata must be object".into());
            }
            if array(frame, "quality_flags")?.is_empty() {
                return Err("observation quality_flags must be nonempty".into());
            }
        }
    }
    let readiness = member(value, "operational_readiness")?;
    let data_state = member(readiness, "data_state")?;
    if string(data_state, "source_mode")? != string(value, "source_mode")? {
        return Err("readiness source_mode must match source_mode".into());
    }
    if (string(data_state, "observation_mode")? == "none") != observations.is_empty() {
        return Err("readiness observation_mode must reflect attached observations".into());
    }
    if member(data_state, "live_data_present")?.as_bool() == Some(true) && observations.is_empty() {
        return Err("live_data_present requires observations".into());
    }
    let gates = array(readiness, "gates")?;
    unique_ids(gates, "readiness.gates")?;
    for id in [
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
        let gate = gates
            .iter()
            .find(|g| g.get("id").and_then(JsonValue::as_str) == Some(id))
            .ok_or_else(|| format!("readiness gates missing {id}"))?;
        if id == "public_data_provenance" && member(gate, "passed")?.as_bool() != Some(true) {
            return Err("public_data_provenance gate must reflect valid observations".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mutate(value: &mut JsonValue, path: &[JsonValue], replacement: Option<&JsonValue>) {
        let (key, rest) = path.split_first().unwrap();
        match value {
            JsonValue::Object(entries) => {
                if rest.is_empty()
                    && !entries
                        .iter()
                        .any(|(k, _)| Some(k.as_str()) == key.as_str())
                {
                    entries.push((key.as_str().unwrap().into(), replacement.unwrap().clone()));
                    return;
                }
                let position = entries
                    .iter()
                    .position(|(k, _)| Some(k.as_str()) == key.as_str())
                    .unwrap();
                if rest.is_empty() {
                    if let Some(replacement) = replacement {
                        entries[position].1 = replacement.clone();
                    } else {
                        entries.remove(position);
                    }
                } else {
                    mutate(&mut entries[position].1, rest, replacement);
                }
            }
            JsonValue::Array(items) => {
                let index = key.as_f64().unwrap() as usize;
                if rest.is_empty() {
                    items[index] = replacement.unwrap().clone();
                } else {
                    mutate(&mut items[index], rest, replacement);
                }
            }
            _ => panic!("invalid fixture mutation path"),
        }
    }

    #[test]
    fn shared_snapshot_mutation_corpus() {
        let baseline =
            parse_json(include_str!("../../../apps/web/data/latest-state.json")).unwrap();
        let cases =
            parse_json(include_str!("../../../tests/fixtures/snapshot-intake.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let mut snapshot = baseline.clone();
            mutate(
                &mut snapshot,
                case.get("path").unwrap().as_array().unwrap(),
                case.get("value"),
            );
            let result = validate(&snapshot.to_compact_string());
            assert_eq!(
                result.is_ok(),
                case.get("accepted").unwrap().as_bool().unwrap(),
                "case {}: {result:?}",
                case.get("id").unwrap().as_str().unwrap()
            );
        }
    }
}
