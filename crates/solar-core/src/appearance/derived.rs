use super::*;
use crate::{parse_json, JsonValue};
fn number(x: f64) -> JsonValue {
    JsonValue::Number(x)
}
fn string(x: &str) -> JsonValue {
    JsonValue::String(x.into())
}
fn object(items: Vec<(&str, JsonValue)>) -> JsonValue {
    JsonValue::Object(items.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn set(doc: &mut JsonValue, key: &str, value: JsonValue) {
    if let JsonValue::Object(items) = doc {
        if let Some((_, old)) = items.iter_mut().find(|(k, _)| k == key) {
            *old = value;
        } else {
            items.push((key.into(), value));
        }
    }
}
pub struct DerivedPacketRequest<'a> {
    pub seed: u32,
    pub time_s: f64,
    pub duration_s: f64,
    pub recipe_id: &'a str,
    pub source_snapshot_sha256: Option<&'a str>,
    pub poses: &'a [RegionPose],
    pub lifecycles: &'a [LifecycleRegion],
    pub field: &'a FieldSolution,
    pub seeds: &'a [TraceSeed],
}
/// Separate native/offline schema: source-derived or six-day lifecycle products
/// cannot be mistaken for the pinned six-hour browser ABI recipes.
pub fn derived_packet(request: DerivedPacketRequest<'_>) -> Result<String, &'static str> {
    let r = request;
    if !r.time_s.is_finite()
        || !r.duration_s.is_finite()
        || !(0.0..=ROTATION_DURATION_S).contains(&r.duration_s)
        || !(0.0..=r.duration_s).contains(&r.time_s)
        || !matches!(r.recipe_id, "rotation-v1" | "snapshot-boundary-v1")
        || r.poses.len() > 128
        || r.lifecycles.len() > 128
        || r.seeds.len() > 64
    {
        return Err("derived packet bounds");
    }
    if let Some(hash) = r.source_snapshot_sha256 {
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|v| v.is_ascii_hexdigit() && !v.is_ascii_uppercase())
        {
            return Err("source hash");
        }
    }
    let mut doc =
        parse_json(&sample_packet(r.seed, 0.0, 1, 0, false)?).map_err(|_| "internal packet")?;
    if let JsonValue::Object(fields) = &mut doc {
        fields.retain(|(k, _)| {
            !["emission_model", "emission_regions", "attachment_groups"].contains(&k.as_str())
        });
    }
    set(
        &mut doc,
        "schema_version",
        string("solar-derived-render-packet.v1"),
    );
    set(&mut doc, "recipe_id", string(r.recipe_id));
    set(&mut doc, "recipe_hash", JsonValue::Null);
    set(&mut doc, "time_s", number(r.time_s));
    set(
        &mut doc,
        "valid_time_range_seconds",
        JsonValue::Array(vec![number(0.0), number(r.duration_s)]),
    );
    set(
        &mut doc,
        "topology_id",
        string(&format!("{}-seed{}-t{}", r.recipe_id, r.seed, r.time_s)),
    );
    set(
        &mut doc,
        "source_mode",
        string(if r.source_snapshot_sha256.is_some() {
            "simulation_derived_pfss"
        } else {
            "synthetic_lifecycle_pfss"
        }),
    );
    set(
        &mut doc,
        "source_snapshot_sha256",
        r.source_snapshot_sha256.map_or(JsonValue::Null, string),
    );
    set(
        &mut doc,
        "seed_distribution",
        string(
            "equal-area-candidate-exponential-race-abs-Br; fixed reference IDs; differential poses",
        ),
    );
    set(
        &mut doc,
        "field_provenance",
        string(if r.source_snapshot_sha256.is_some() {
            "validated solar-state-snapshot.v3 normalized br cell averages; area-weighted monopole removal; not observed magnetogram"
        } else {
            "synthetic bipolar lifecycle model; normalized field; not observed"
        }),
    );
    let poses = r
        .poses
        .iter()
        .map(|p| {
            object(vec![
                ("id", number(f64::from(p.id))),
                (
                    "center",
                    JsonValue::Array(p.center.iter().map(|v| number(*v)).collect()),
                ),
                ("radius_rad", number(p.radius_rad)),
                ("temperature_k", number(p.temperature_k)),
                ("strength", number(p.strength)),
            ])
        })
        .collect();
    set(&mut doc, "regions", JsonValue::Array(poses));
    let lifecycle = r
        .lifecycles
        .iter()
        .map(|l| {
            object(vec![
                ("id", number(f64::from(l.id))),
                ("birth_s", number(l.birth_s)),
                ("lifetime_s", number(l.lifetime_s)),
                ("rise_s", number(l.rise_s)),
                ("decay_s", number(l.decay_s)),
                (
                    "envelope",
                    string("C1 smoothstep growth times decay; zero outside finite lifetime"),
                ),
            ])
        })
        .collect();
    set(&mut doc, "region_lifecycles", JsonValue::Array(lifecycle));
    let mut strands = Vec::new();
    for seed in r.seeds {
        let a = trace(r.field, seed.position, -1.0, 4096)?;
        let b = trace(r.field, seed.position, 1.0, 4096)?;
        let closed = a.termination == "surface" && b.termination == "surface";
        let open = [a.termination, b.termination]
            .iter()
            .all(|v| *v == "surface" || *v == "source_surface");
        let class = if closed {
            "closed"
        } else if open {
            "open"
        } else {
            "incomplete"
        };
        let points = a
            .points
            .iter()
            .rev()
            .chain(b.points.iter().skip(1))
            .map(|p| {
                JsonValue::Array(vec![
                    number(p[0]),
                    number(p[1]),
                    number(p[2]),
                    number(0.008),
                ])
            })
            .collect();
        strands.push(object(vec![
            ("id", number(f64::from(seed.id))),
            ("classification", string(class)),
            (
                "termination",
                JsonValue::Array(vec![string(a.termination), string(b.termination)]),
            ),
            ("emission_relative", number(if closed { 1.0 } else { 0.25 })),
            ("points", JsonValue::Array(points)),
        ]));
    }
    set(&mut doc, "strands", JsonValue::Array(strands));
    let coefficients = r
        .field
        .coefficients
        .iter()
        .map(|c| {
            object(vec![
                ("l", number(c.l as f64)),
                ("m", number(c.m as f64)),
                ("cosine", number(c.cosine)),
                ("sine", number(c.sine)),
            ])
        })
        .collect();
    set(
        &mut doc,
        "field",
        object(vec![
            ("source_surface_R", number(r.field.source_surface)),
            (
                "lmax",
                number(r.field.coefficients.iter().map(|c| c.l).max().unwrap_or(0) as f64),
            ),
            ("monopole_removed", number(r.field.monopole_removed)),
            ("coefficients", JsonValue::Array(coefficients)),
        ]),
    );
    let mut out = String::new();
    doc.write_compact(&mut out);
    if out.len() > 4 * 1024 * 1024 {
        return Err("derived packet capacity");
    }
    validate_packet_json(&out).map_err(|_| "derived_packet_validation")?;
    Ok(out)
}
