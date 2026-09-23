//! Shared, fail-closed packet semantic admission for native, WASM and tooling.
use super::*;
use crate::{parse_json, JsonValue};
use std::collections::BTreeSet;
type Check = Result<(), String>;
fn fail(s: &str) -> String {
    s.into()
}
fn get<'a>(v: &'a JsonValue, k: &str) -> Result<&'a JsonValue, String> {
    v.get(k).ok_or_else(|| format!("missing {k}"))
}
fn num(v: &JsonValue) -> Result<f64, String> {
    let n = v.as_f64().ok_or_else(|| fail("finite number required"))?;
    if !n.is_finite() {
        return Err(fail("nonfinite number"));
    }
    Ok(n)
}
fn number(v: &JsonValue, k: &str) -> Result<f64, String> {
    num(get(v, k)?)
}
fn text<'a>(v: &'a JsonValue, k: &str) -> Result<&'a str, String> {
    get(v, k)?.as_str().ok_or_else(|| format!("string {k}"))
}
fn array(v: &JsonValue) -> Result<&[JsonValue], String> {
    v.as_array().ok_or_else(|| fail("array required"))
}
fn keys(v: &JsonValue, expected: &[&str]) -> Check {
    let JsonValue::Object(items) = v else {
        return Err(fail("object required"));
    };
    if items.len() != expected.len() || items.iter().any(|(k, _)| !expected.contains(&k.as_str())) {
        return Err(fail("unexpected or missing nested keys"));
    }
    Ok(())
}
fn integer(v: &JsonValue, lo: u64, hi: u64) -> Result<u64, String> {
    let x = num(v)?;
    if x.fract() != 0.0 || x < lo as f64 || x > hi as f64 {
        return Err(fail("integer bounds"));
    }
    Ok(x as u64)
}
fn exact_number(v: &JsonValue, k: &str, expected: f64) -> Check {
    if number(v, k)? != expected {
        return Err(format!("pinned {k}"));
    }
    Ok(())
}
fn exact_text(v: &JsonValue, k: &str, expected: &str) -> Check {
    if text(v, k)? != expected {
        return Err(format!("pinned {k}"));
    }
    Ok(())
}
fn bounded(v: &JsonValue, lo: f64, hi: f64) -> Result<f64, String> {
    let n = num(v)?;
    if !(lo..=hi).contains(&n) {
        return Err(fail("numeric range"));
    }
    Ok(n)
}
pub fn valid_sha256(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn surface(v: &JsonValue) -> Check {
    keys(
        v,
        &[
            "wavelength_nm",
            "quiet_temperature_k",
            "limb_u",
            "granule_km",
            "lifetime_s",
            "amplitude_k",
            "euv_texture",
        ],
    )?;
    for (k, n) in [
        ("wavelength_nm", 550.0),
        ("quiet_temperature_k", 5772.0),
        ("limb_u", 0.6),
        ("granule_km", 1000.0),
        ("lifetime_s", 1200.0),
        ("amplitude_k", 150.0),
    ] {
        exact_number(v, k, n)?;
    }
    let e = get(v, "euv_texture")?;
    keys(
        e,
        &[
            "cell_km",
            "lifetime_s",
            "amplitude",
            "domain_warp",
            "kind",
            "spatial_scale_factor",
            "octave_weights",
            "epoch_law",
        ],
    )?;
    exact_text(e, "kind", "correlated_value_noise_v1")?;
    exact_text(e, "epoch_law", "quintic_crossfade_of_hashed_fields")?;
    exact_number(e, "spatial_scale_factor", 0.35)?;
    let weights = array(get(e, "octave_weights")?)?;
    if weights.len() != 3 {
        return Err(fail("EUV octave count"));
    }
    for (v, w) in weights.iter().zip([0.55, 0.3, 0.15]) {
        if num(v)? != w {
            return Err(fail("EUV octave weights"));
        }
    }
    exact_number(e, "cell_km", 10000.0)?;
    exact_number(e, "lifetime_s", 1200.0)?;
    exact_number(e, "amplitude", 0.65)?;
    let w = get(e, "domain_warp")?;
    keys(w, &["kind", "frequency_per_cell", "amplitude_cells"])?;
    exact_text(w, "kind", "quintic_hashed_vector_v1")?;
    exact_number(w, "frequency_per_cell", 0.18)?;
    exact_number(w, "amplitude_cells", 1.25)
}
fn rotation(v: &JsonValue) -> Check {
    keys(
        v,
        &["id", "coefficients_deg_per_day", "frame_rate_deg_per_day"],
    )?;
    exact_text(v, "id", "engine-magnetic-tracer-v1")?;
    exact_number(v, "frame_rate_deg_per_day", 14.1844)?;
    let a = array(get(v, "coefficients_deg_per_day")?)?;
    if a.len() != 3 {
        return Err(fail("rotation coefficients"));
    }
    for (x, y) in a.iter().zip([14.713, -2.396, -1.787]) {
        if num(x)? != y {
            return Err(fail("rotation coefficients"));
        }
    }
    Ok(())
}
fn field(v: &JsonValue) -> Check {
    keys(
        v,
        &[
            "source_surface_R",
            "lmax",
            "monopole_removed",
            "coefficients",
        ],
    )?;
    exact_number(v, "source_surface_R", 2.5)?;
    let lmax = integer(get(v, "lmax")?, 1, 64)? as usize;
    bounded(get(v, "monopole_removed")?, -1e6, 1e6)?;
    let coefficients = array(get(v, "coefficients")?)?;
    if coefficients.len() != lmax * (lmax + 3) / 2 {
        return Err(fail("harmonic count"));
    }
    let mut index = 0;
    for l in 1..=lmax {
        for m in 0..=l {
            let c = &coefficients[index];
            keys(c, &["l", "m", "cosine", "sine"])?;
            if integer(get(c, "l")?, 1, 64)? != l as u64
                || integer(get(c, "m")?, 0, 64)? != m as u64
            {
                return Err(fail("harmonic ordering/degree"));
            }
            bounded(get(c, "cosine")?, -1e9, 1e9)?;
            let sine = bounded(get(c, "sine")?, -1e9, 1e9)?;
            if m == 0 && sine != 0.0 {
                return Err(fail("m0 sine coefficient"));
            }
            index += 1;
        }
    }
    Ok(())
}
/// Validate complete nested schema and physics/identity bounds; no trusted inputs
/// are inferred from a successful JSON parse or an outer resource digest.
pub fn validate_packet_json(raw: &str) -> Check {
    if raw.len() > 4 * 1024 * 1024 {
        return Err(fail("packet byte capacity"));
    }
    let v = parse_json(raw).map_err(|e| e.to_string())?;
    let derived = match text(&v, "schema_version")? {
        "solar-render-packet.v1" => false,
        "solar-derived-render-packet.v1" => true,
        _ => return Err(fail("packet schema")),
    };
    if !derived && raw.len() > 1024 * 1024 {
        return Err(fail("compact packet byte capacity"));
    }
    let mut top = vec![
        "schema_version",
        "abi",
        "recipe_id",
        "recipe_hash",
        "seed",
        "time_s",
        "valid_time_range_seconds",
        "frame",
        "radius_km",
        "rotation_law",
        "topology_id",
        "source_mode",
        "field_units",
        "field_provenance",
        "relative_emission",
        "surface",
        "regions",
        "strands",
        "field",
        "limitations",
    ];
    if !derived {
        top.extend(["emission_model", "emission_regions", "attachment_groups"]);
    }
    if derived {
        top.extend([
            "source_snapshot_sha256",
            "seed_distribution",
            "region_lifecycles",
        ]);
    }
    keys(&v, &top)?;
    exact_number(&v, "abi", 1.0)?;
    exact_text(&v, "frame", "carrington_z_north_west_positive")?;
    exact_number(&v, "radius_km", 695700.0)?;
    exact_text(&v, "field_units", "normalized")?;
    if get(&v, "relative_emission")?.as_bool() != Some(true) {
        return Err(fail("relative emission authority"));
    }
    let seed = integer(get(&v, "seed")?, 0, u64::from(u32::MAX))? as u32;
    let time = number(&v, "time_s")?;
    let interval = array(get(&v, "valid_time_range_seconds")?)?;
    if interval.len() != 2 || num(&interval[0])? != 0.0 {
        return Err(fail("validity start"));
    }
    let duration = bounded(
        &interval[1],
        0.0,
        if derived {
            ROTATION_DURATION_S
        } else {
            21600.0
        },
    )?;
    if !derived && duration != 21600.0 || time < 0.0 || time > duration {
        return Err(fail("validity interval"));
    }
    let recipe = text(&v, "recipe_id")?;
    let recipe_index = if !derived {
        match recipe {
            "quiet-v1" => 0,
            "active-v1" => 1,
            _ => return Err(fail("pinned recipe ID")),
        }
    } else {
        match recipe {
            "rotation-v1" | "snapshot-boundary-v1" => 1,
            _ => return Err(fail("derived recipe ID")),
        }
    };
    if !derived {
        exact_text(&v, "recipe_hash", RECIPE_HASHES[recipe_index])?;
        exact_text(&v, "source_mode", "synthetic_statistical_pfss")?;
        exact_text(
            &v,
            "field_provenance",
            "synthetic global dipole and paired Gaussian polarities; not observed or calibrated",
        )?;
    } else {
        if get(&v, "recipe_hash")? != &JsonValue::Null {
            return Err(fail("derived custom recipe has no pinned ABI hash"));
        }
        exact_text(
            &v,
            "seed_distribution",
            "equal-area-candidate-exponential-race-abs-Br; fixed reference IDs; differential poses",
        )?;
        if recipe == "snapshot-boundary-v1" {
            exact_text(&v, "source_mode", "simulation_derived_pfss")?;
            if !valid_sha256(text(&v, "source_snapshot_sha256")?) {
                return Err(fail("source snapshot hash"));
            }
            exact_text(&v,"field_provenance","validated solar-state-snapshot.v3 normalized br cell averages; area-weighted monopole removal; not observed magnetogram")?;
        } else {
            exact_text(&v, "source_mode", "synthetic_lifecycle_pfss")?;
            if get(&v, "source_snapshot_sha256")? != &JsonValue::Null {
                return Err(fail("rotation has no source snapshot"));
            }
            exact_text(
                &v,
                "field_provenance",
                "synthetic bipolar lifecycle model; normalized field; not observed",
            )?;
        }
    }
    exact_text(&v, "topology_id", &format!("{recipe}-seed{seed}-t{time}"))?;
    rotation(get(&v, "rotation_law")?)?;
    surface(get(&v, "surface")?)?;
    let rs = array(get(&v, "regions")?)?;
    if rs.len() > 128 || (!derived && rs.len() != if recipe_index == 0 { 3 } else { 10 }) {
        return Err(fail("region count"));
    }
    let expected = if derived {
        Vec::new()
    } else {
        regions(seed, time, recipe_index as u32)
    };
    let mut region_ids = BTreeSet::new();
    for r in rs {
        let mut rk = vec!["id", "center", "radius_rad", "temperature_k"];
        if derived {
            rk.push("strength");
        }
        keys(r, &rk)?;
        let id = integer(get(r, "id")?, 0, u64::from(u32::MAX))? as u32;
        if !region_ids.insert(id) {
            return Err(fail("duplicate region ID"));
        }
        let center = array(get(r, "center")?)?;
        if center.len() != 3 {
            return Err(fail("center dimensions"));
        }
        let mut point = [0.0; 3];
        for (i, x) in center.iter().enumerate() {
            point[i] = bounded(x, -1.0, 1.0)?;
        }
        if (norm(point) - 1.0).abs() > 1e-8 {
            return Err(fail("region unit center"));
        }
        let radius = bounded(get(r, "radius_rad")?, 0.0, 0.3)?;
        let temperature = bounded(get(r, "temperature_k")?, 2000.0, 20000.0)?;
        if derived {
            bounded(get(r, "strength")?, 0.0, 1e6)?;
        } else {
            let e = expected
                .iter()
                .find(|e| e.id == id)
                .ok_or_else(|| fail("pinned region ID"))?;
            if radius != e.radius
                || temperature != e.temperature
                || norm(add(point, scale(e.center, -1.0))) > 1e-8
            {
                return Err(fail("pinned region pose/recipe"));
            }
        }
    }
    if derived {
        let lifecycle = array(get(&v, "region_lifecycles")?)?;
        if lifecycle.len() != rs.len() {
            return Err(fail("lifecycle count"));
        }
        let mut ids = BTreeSet::new();
        for l in lifecycle {
            keys(
                l,
                &[
                    "id",
                    "birth_s",
                    "lifetime_s",
                    "rise_s",
                    "decay_s",
                    "envelope",
                ],
            )?;
            let id = integer(get(l, "id")?, 0, u64::from(u32::MAX))? as u32;
            if !region_ids.contains(&id) || !ids.insert(id) {
                return Err(fail("lifecycle ID"));
            }
            bounded(get(l, "birth_s")?, -14.0 * 86400.0, duration)?;
            exact_number(
                l,
                "lifetime_s",
                if recipe == "rotation-v1" {
                    345600.0
                } else {
                    14.0 * 86400.0
                },
            )?;
            exact_number(l, "rise_s", 21600.0)?;
            exact_number(
                l,
                "decay_s",
                if recipe == "rotation-v1" {
                    86400.0
                } else {
                    3.0 * 86400.0
                },
            )?;
            exact_text(
                l,
                "envelope",
                "C1 smoothstep growth times decay; zero outside finite lifetime",
            )?;
        }
    }
    let f = get(&v, "field")?;
    let strands = array(get(&v, "strands")?)?;
    if strands.len() > 64 {
        return Err(fail("strand count"));
    }
    if f == &JsonValue::Null {
        if derived || !strands.is_empty() {
            return Err(fail("field required for geometry/derived product"));
        }
    } else {
        field(f)?;
        if !derived && strands.is_empty() {
            return Err(fail("pinned geometry strand count"));
        }
    }
    let mut ids = BTreeSet::new();
    let mut total = 0;
    for s in strands {
        let mut sk = vec![
            "id",
            "classification",
            "termination",
            "emission_relative",
            "points",
        ];
        if !derived {
            sk.extend(["pulse", "family_id", "region_id", "role", "emissivity_gain"]);
        }
        keys(s, &sk)?;
        let id = integer(get(s, "id")?, 0, 4095)?;
        if !ids.insert(id) {
            return Err(fail("duplicate strand ID"));
        }
        let ends = array(get(s, "termination")?)?;
        if ends.len() != 2 {
            return Err(fail("termination width"));
        }
        let ends = [
            ends[0].as_str().ok_or_else(|| fail("termination string"))?,
            ends[1].as_str().ok_or_else(|| fail("termination string"))?,
        ];
        if ends.iter().any(|e| {
            ![
                "surface",
                "source_surface",
                "budget",
                "weak_field",
                "tolerance",
            ]
            .contains(e)
        }) {
            return Err(fail("termination code"));
        }
        let class = if ends == ["surface", "surface"] {
            "closed"
        } else if ends
            .iter()
            .all(|e| ["surface", "source_surface"].contains(e))
        {
            "open"
        } else {
            "incomplete"
        };
        exact_text(s, "classification", class)?;
        let role = if derived { "derived" } else { text(s, "role")? };
        if derived {
            exact_number(
                s,
                "emission_relative",
                if class == "closed" { 1.0 } else { 0.25 },
            )?;
        } else {
            integer(get(s, "family_id")?, 0, 4095)?;
            let rid = integer(get(s, "region_id")?, 0, u64::from(u32::MAX))? as u32;
            if !region_ids.contains(&rid) {
                return Err(fail("strand source region"));
            }
            let (lo, hi) = match role {
                "individual" => (1.275, 4.0),
                "bundle_envelope" => (0.12, 0.32),
                "long_arc" => (0.15, 0.35),
                _ => return Err(fail("strand role")),
            };
            bounded(get(s, "emission_relative")?, lo, hi)?;
            if role != "long_arc" && class != "closed" {
                return Err(fail("bundle must be closed"));
            }
        }
        let points = array(get(s, "points")?)?;
        if points.len() < if class == "incomplete" { 1 } else { 2 } || points.len() > 8193 {
            return Err(fail("strand points"));
        }
        total += points.len();
        if total > 300000 {
            return Err(fail("total point capacity"));
        }
        for (i, p) in points.iter().enumerate() {
            let p = array(p)?;
            if p.len() != 4 {
                return Err(fail("point dimension"));
            }
            let mut xyz = [0.0; 3];
            for j in 0..3 {
                xyz[j] = bounded(&p[j], -2.500001, 2.500001)?;
            }
            if derived {
                if num(&p[3])? != 0.008 {
                    return Err(fail("pinned strand width"));
                }
            } else {
                let (lo, hi) = match role {
                    "bundle_envelope" => (0.00899, 0.01261),
                    "long_arc" => (0.00299, 0.00421),
                    _ => (0.00199, 0.00491),
                };
                bounded(&p[3], lo, hi)?;
            }
            let radius = norm(xyz);
            if !(0.999999..=2.500001).contains(&radius) {
                return Err(fail("point radius"));
            }
            for (end_index, end_radius) in [(0, ends[0]), (points.len() - 1, ends[1])] {
                if i == end_index {
                    let target = match end_radius {
                        "surface" => Some(1.0),
                        "source_surface" => Some(2.5),
                        _ => None,
                    };
                    if target.is_some_and(|r| (radius - r).abs() > 1e-6) {
                        return Err(fail("trace endpoint/termination mismatch"));
                    }
                }
            }
        }
        if !derived {
            let gains = array(get(s, "emissivity_gain")?)?;
            if gains.len() != points.len() {
                return Err(fail("emissivity profile length"));
            }
            for gain in gains {
                bounded(gain, 0.0, 1.0)?;
            }
            let p = get(s, "pulse")?;
            keys(
                p,
                &[
                    "onset_s",
                    "duration_s",
                    "speed_R_per_s",
                    "amplitude",
                    "width_R",
                    "path_origin",
                    "window",
                ],
            )?;
            for (k, n) in [
                (
                    "onset_s",
                    number(s, "region_id")? * 1700.0 + (id % 8) as f64 * 73.0,
                ),
                ("duration_s", 1800.0),
                ("speed_R_per_s", 0.0002),
                ("amplitude", 0.3),
                ("width_R", 0.04),
            ] {
                exact_number(p, k, n)?;
            }
            exact_text(p, "path_origin", "first_point")?;
            exact_text(p, "window", "sin_squared_nonrepeating")?;
        }
    }
    if !derived {
        validate_hierarchy(&v, &region_ids)?;
        if strands
            .iter()
            .map(|s| array(get(s, "points").unwrap()).unwrap().len() - 1)
            .sum::<usize>()
            > 16384
        {
            return Err(fail("hierarchy segment capacity"));
        }
    }
    let limits = array(get(&v, "limitations")?)?;
    if limits.is_empty()
        || limits.len() > 16
        || limits
            .iter()
            .any(|s| s.as_str().is_none_or(|s| s.is_empty() || s.len() > 1024))
    {
        return Err(fail("limitations"));
    }
    Ok(())
}

fn resource(v: &JsonValue, maximum: u64) -> Check {
    keys(v, &["path", "bytes", "sha256"])?;
    let p = text(v, "path")?;
    if p.is_empty()
        || p.len() > 512
        || p.contains('\\')
        || p.contains(':')
        || p.split('/').any(|c| c.is_empty() || c == "." || c == "..")
    {
        return Err(fail("resource relative path"));
    }
    integer(get(v, "bytes")?, 1, maximum)?;
    if !valid_sha256(text(v, "sha256")?) {
        return Err(fail("resource digest"));
    }
    Ok(())
}
/// Structural and identity admission of a derived manifest. The filesystem tool
/// additionally verifies every captured source/resource byte digest and source v3.
pub fn validate_derived_manifest_json(raw: &str) -> Check {
    if raw.len() > 1024 * 1024 {
        return Err(fail("derived manifest bytes"));
    }
    let v = parse_json(raw).map_err(|e| e.to_string())?;
    keys(
        &v,
        &[
            "schema_version",
            "id",
            "seed",
            "duration_seconds",
            "source_epoch_seconds",
            "source_sequence_sha256",
            "source_snapshot_schema",
            "seed_reference_source_time_seconds",
            "source_receipt",
            "source_snapshots",
            "field_units",
            "plasma_authority",
            "frame",
            "radius_km",
            "seed_policy",
            "keyframes",
            "limits",
        ],
    )?;
    exact_text(&v, "schema_version", "solar-appearance-derived-sequence.v1")?;
    exact_text(&v, "field_units", "normalized")?;
    exact_text(&v, "plasma_authority", "illustrative")?;
    exact_text(&v, "frame", "carrington_z_north_west_positive")?;
    exact_number(&v, "radius_km", 695700.0)?;
    exact_text(
        &v,
        "seed_policy",
        "field-weighted reference candidates; stable IDs and differential advection",
    )?;
    integer(get(&v, "seed")?, 0, u64::from(u32::MAX))?;
    let source = match text(&v, "id")? {
        "snapshot-boundary-v1" => true,
        "rotation-v1" => false,
        _ => return Err(fail("derived manifest ID")),
    };
    let duration = bounded(get(&v, "duration_seconds")?, 0.0, ROTATION_DURATION_S)?;
    let epoch = bounded(get(&v, "source_epoch_seconds")?, 0.0, 1e12)?;
    let reference = bounded(
        get(&v, "seed_reference_source_time_seconds")?,
        epoch,
        epoch + duration,
    )?;
    let frames = array(get(&v, "keyframes")?)?;
    let sources = array(get(&v, "source_snapshots")?)?;
    if frames.is_empty() || frames.len() > 25 {
        return Err(fail("derived frame count"));
    }
    if source {
        exact_text(&v, "source_snapshot_schema", "solar-state-snapshot.v3")?;
        let hash = text(&v, "source_sequence_sha256")?;
        if !valid_sha256(hash) {
            return Err(fail("source sequence digest"));
        }
        resource(get(&v, "source_receipt")?, 65536)?;
        if text(get(&v, "source_receipt")?, "sha256")? != hash || sources.len() != frames.len() {
            return Err(fail("source receipt correspondence"));
        }
    } else {
        if get(&v, "source_snapshot_schema")? != &JsonValue::Null
            || get(&v, "source_sequence_sha256")? != &JsonValue::Null
            || get(&v, "source_receipt")? != &JsonValue::Null
            || !sources.is_empty()
            || duration != ROTATION_DURATION_S
            || epoch != 0.0
            || reference != 0.0
            || frames.len() != 25
        {
            return Err(fail("rotation source/interval contract"));
        }
    }
    let mut previous = -1.0;
    let mut found_reference = !source;
    let mut paths = BTreeSet::new();
    for (i, key) in frames.iter().enumerate() {
        keys(key, &["time_s", "packet", "source_snapshot_sha256"])?;
        let time = bounded(get(key, "time_s")?, 0.0, duration)?;
        if time <= previous
            || (i == 0 && time != 0.0)
            || (i + 1 == frames.len() && time != duration)
            || (!source && time != i as f64 * 21600.0)
        {
            return Err(fail("derived ordered time coverage"));
        }
        previous = time;
        resource(get(key, "packet")?, 4 * 1024 * 1024)?;
        if !paths.insert(text(get(key, "packet")?, "path")?) {
            return Err(fail("duplicate packet path"));
        }
        if source {
            let receipt = &sources[i];
            keys(receipt, &["time_seconds", "resource"])?;
            let absolute = number(receipt, "time_seconds")?;
            if absolute != epoch + time {
                return Err(fail("source time correspondence"));
            }
            found_reference |= absolute == reference;
            let r = get(receipt, "resource")?;
            resource(r, 16 * 1024 * 1024)?;
            if text(r, "sha256")? != text(key, "source_snapshot_sha256")? {
                return Err(fail("source snapshot correspondence"));
            }
            if !paths.insert(text(r, "path")?) {
                return Err(fail("duplicate source path"));
            }
        } else if get(key, "source_snapshot_sha256")? != &JsonValue::Null {
            return Err(fail("rotation source digest"));
        }
    }
    if !found_reference {
        return Err(fail("seed reference source time"));
    }
    let limits = array(get(&v, "limits")?)?;
    if limits.is_empty()
        || limits.len() > 16
        || limits
            .iter()
            .any(|s| s.as_str().is_none_or(|s| s.is_empty() || s.len() > 1024))
    {
        return Err(fail("derived limits"));
    }
    Ok(())
}

fn unit_vector(v: &JsonValue) -> Result<Vec3, String> {
    let a = array(v)?;
    if a.len() != 3 {
        return Err(fail("vector width"));
    }
    let p = [
        bounded(&a[0], -1.0, 1.0)?,
        bounded(&a[1], -1.0, 1.0)?,
        bounded(&a[2], -1.0, 1.0)?,
    ];
    if (norm(p) - 1.0).abs() > 1e-8 {
        return Err(fail("unit vector"));
    }
    Ok(p)
}
fn strand_endpoint(s: &JsonValue, end: usize) -> Result<Vec3, String> {
    let ps = array(get(s, "points")?)?;
    let p = array(if end == 0 { &ps[0] } else { ps.last().unwrap() })?;
    let xyz = [num(&p[0])?, num(&p[1])?, num(&p[2])?];
    Ok(scale(xyz, 1.0 / norm(xyz)))
}
fn validate_hierarchy(v: &JsonValue, source_ids: &BTreeSet<u32>) -> Check {
    let expected = parse_json(EMISSION_MODEL_JSON).map_err(|e| e.to_string())?;
    let JsonValue::Object(fields) = expected else {
        return Err(fail("internal model"));
    };
    let model = get(v, "emission_model")?;
    keys(
        model,
        &fields.iter().map(|(k, _)| k.as_str()).collect::<Vec<_>>(),
    )?;
    for (k, value) in fields {
        if get(model, &k)? != &value {
            return Err(fail("pinned emission model"));
        }
    }
    let regions = array(get(v, "emission_regions")?)?;
    let groups = array(get(v, "attachment_groups")?)?;
    let strands = array(get(v, "strands")?)?;
    if get(v, "field")? == &JsonValue::Null {
        if !regions.is_empty() || !groups.is_empty() {
            return Err(fail("compact descriptor cannot invent attachments"));
        }
        return Ok(());
    }
    if regions.is_empty() || regions.len() > 10 || groups.len() != 2 * regions.len() {
        return Err(fail("emission region/group count"));
    }
    let mut ids = BTreeSet::new();
    let mut group_ids = BTreeSet::new();
    for g in groups {
        keys(
            g,
            &[
                "id",
                "region_id",
                "center",
                "axis_u",
                "core_emission_budget",
                "structure_emission_budget",
                "strand_ids",
            ],
        )?;
        exact_number(g, "core_emission_budget", 1.4)?;
        exact_number(g, "structure_emission_budget", 0.22)?;
        let ga = unit_vector(get(g, "axis_u")?)?;
        let gc = unit_vector(get(g, "center")?)?;
        if dot(ga, gc).abs() > 1e-8 {
            return Err(fail("group tangent axis"));
        }
        let id = integer(get(g, "id")?, 0, 4095)?;
        if !group_ids.insert(id) {
            return Err(fail("duplicate group"));
        }
        let rid = integer(get(g, "region_id")?, 0, 4095)?;
        if id / 2 != rid {
            return Err(fail("group region identity"));
        }
        let center = unit_vector(get(g, "center")?)?;
        let members = array(get(g, "strand_ids")?)?;
        if !(3..=5).contains(&members.len()) {
            return Err(fail("bundle membership count"));
        }
        let mut seen = BTreeSet::new();
        let mut sum = [0.0; 3];
        let mut individuals = 0;
        for member in members {
            let sid = integer(member, 0, 4095)?;
            if !seen.insert(sid) {
                return Err(fail("duplicate group member"));
            }
            let strand = strands
                .iter()
                .find(|s| number(s, "id").ok() == Some(sid as f64))
                .ok_or_else(|| fail("group missing strand"))?;
            if number(strand, "region_id")? != rid as f64
                || number(strand, "family_id")? != rid as f64
                || text(strand, "role")? == "long_arc"
            {
                return Err(fail("group strand family binding"));
            }
            if text(strand, "role")? == "individual" && [0, 2].contains(&(sid % 8)) {
                sum = add(sum, strand_endpoint(strand, (id % 2) as usize)?);
                individuals += 1;
            }
        }
        if individuals != 2
            || norm(sum) < 1e-10
            || norm(add(center, scale(sum, -1.0 / norm(sum)))) > 1e-7
        {
            return Err(fail("group endpoint centroid"));
        }
    }
    let mut core_ids = BTreeSet::new();
    for r in regions {
        keys(
            r,
            &["id", "center", "axis_u", "axis_v", "extent_rad", "cores"],
        )?;
        let id = integer(get(r, "id")?, 0, 4095)? as u32;
        if !source_ids.contains(&id) || !ids.insert(id) {
            return Err(fail("emission region source ID"));
        }
        let center = unit_vector(get(r, "center")?)?;
        let u = unit_vector(get(r, "axis_u")?)?;
        let w = unit_vector(get(r, "axis_v")?)?;
        if dot(center, u).abs() > 1e-8
            || dot(center, w).abs() > 1e-8
            || dot(u, w).abs() > 1e-8
            || norm(add(cross(center, u), scale(w, -1.0))) > 1e-8
        {
            return Err(fail("emission basis handedness"));
        }
        let ga = groups
            .iter()
            .find(|g| number(g, "id").ok() == Some(f64::from(id) * 2.0))
            .ok_or_else(|| fail("missing first attachment"))?;
        let gb = groups
            .iter()
            .find(|g| number(g, "id").ok() == Some(f64::from(id) * 2.0 + 1.0))
            .ok_or_else(|| fail("missing second attachment"))?;
        let ca = unit_vector(get(ga, "center")?)?;
        let cb = unit_vector(get(gb, "center")?)?;
        let c = add(ca, cb);
        if norm(c) < 1e-10 || norm(add(center, scale(c, -1.0 / norm(c)))) > 1e-8 {
            return Err(fail("emission center attachment binding"));
        }
        let axis = add(cb, scale(center, -dot(cb, center)));
        if norm(axis) < 1e-10 || norm(add(u, scale(axis, -1.0 / norm(axis)))) > 1e-8 {
            return Err(fail("emission axis attachment binding"));
        }
        let bipolar = add(cb, scale(ca, -1.0));
        for (g, c) in [(ga, ca), (gb, cb)] {
            let axis = add(bipolar, scale(c, -dot(bipolar, c)));
            if norm(axis) < 1e-10
                || norm(add(
                    unit_vector(get(g, "axis_u")?)?,
                    scale(axis, -1.0 / norm(axis)),
                )) > 1e-8
            {
                return Err(fail("group axis bipolar binding"));
            }
        }
        let a = (0.6 * norm(add(ca, scale(cb, -1.0)))).clamp(0.075, 0.2);
        let ext = array(get(r, "extent_rad")?)?;
        if ext.len() != 2
            || (num(&ext[0])? - a).abs() > 1e-10
            || (num(&ext[1])? - (a * 0.6).max(0.045)).abs() > 1e-10
        {
            return Err(fail("emission extent attachment binding"));
        }
        let cores = array(get(r, "cores")?)?;
        if cores.len() != 4 {
            return Err(fail("four compact cores required"));
        }
        for core in cores {
            keys(
                core,
                &[
                    "id",
                    "center",
                    "radius_R",
                    "emission_relative",
                    "structure_relative",
                    "axis_u",
                    "attachment_group_id",
                    "strand_id",
                    "endpoint",
                ],
            )?;
            let cid = integer(get(core, "id")?, 0, 16383)?;
            if cid / 4 != u64::from(id) || !core_ids.insert(cid) {
                return Err(fail("core identity"));
            }
            exact_number(core, "radius_R", 0.0035)?;
            exact_number(core, "emission_relative", 0.7)?;
            exact_number(core, "structure_relative", 0.11)?;
            let core_axis = unit_vector(get(core, "axis_u")?)?;
            let gid = integer(get(core, "attachment_group_id")?, 0, 4095)?;
            let end = integer(get(core, "endpoint")?, 0, 1)? as usize;
            if gid / 2 != u64::from(id) || gid % 2 != end as u64 || cid % 4 / 2 != end as u64 {
                return Err(fail("core group side"));
            }
            let group = groups
                .iter()
                .find(|g| number(g, "id").ok() == Some(gid as f64))
                .ok_or_else(|| fail("core missing group"))?;
            if norm(add(
                core_axis,
                scale(unit_vector(get(group, "axis_u")?)?, -1.0),
            )) > 1e-8
            {
                return Err(fail("core group axis binding"));
            }
            let sid = integer(get(core, "strand_id")?, 0, 4095)?;
            if sid != u64::from(id) * 8 + (cid % 2) * 2 {
                return Err(fail("core stable anchor identity"));
            }
            if !array(get(group, "strand_ids")?)?
                .iter()
                .any(|v| num(v).ok() == Some(sid as f64))
            {
                return Err(fail("core strand not in group"));
            }
            let strand = strands
                .iter()
                .find(|s| number(s, "id").ok() == Some(sid as f64))
                .ok_or_else(|| fail("core missing strand"))?;
            if text(strand, "role")? != "individual" {
                return Err(fail("core requires actual individual strand"));
            }
            let p = unit_vector(get(core, "center")?)?;
            if norm(add(p, scale(strand_endpoint(strand, end)?, -1.0))) > 1e-6 {
                return Err(fail("core actual endpoint correspondence"));
            }
        }
    }
    for strand in strands {
        let rid = number(strand, "region_id")? as u32;
        if !ids.contains(&rid) {
            return Err(fail("strand missing emission region"));
        }
        if text(strand, "role")? != "long_arc" {
            for side in 0..2 {
                let group = groups
                    .iter()
                    .find(|g| number(g, "id").ok() == Some(f64::from(rid) * 2.0 + side as f64))
                    .ok_or_else(|| fail("strand missing attachment side"))?;
                if !array(get(group, "strand_ids")?)?
                    .iter()
                    .any(|id| num(id).ok() == number(strand, "id").ok())
                {
                    return Err(fail("unbound family strand"));
                }
            }
        }
    }
    Ok(())
}
