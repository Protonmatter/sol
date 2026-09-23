//! R4 illustrative emissivity hierarchy and actual neighboring PFSS strand bundles.
use super::*;
use crate::{parse_json, JsonValue};
use std::f64::consts::PI;
fn n(v: f64) -> JsonValue {
    JsonValue::Number(v)
}
fn s(v: &str) -> JsonValue {
    JsonValue::String(v.into())
}
fn arr(v: Vec<JsonValue>) -> JsonValue {
    JsonValue::Array(v)
}
fn obj(v: Vec<(&str, JsonValue)>) -> JsonValue {
    JsonValue::Object(v.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn vector(p: Vec3) -> JsonValue {
    arr(p.into_iter().map(n).collect())
}
fn set(v: &mut JsonValue, key: &str, value: JsonValue) {
    if let JsonValue::Object(fields) = v {
        if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == key) {
            *old = value
        } else {
            fields.push((key.into(), value));
        }
    }
}
fn unit(v: Vec3) -> Vec3 {
    scale(v, 1.0 / norm(v))
}
fn random(seed: u32) -> f64 {
    f64::from(mix(seed) >> 8) / 16777216.0
}
fn rounded(v: f64) -> f64 {
    (v * 1e8).round() / 1e8
}
pub const EMISSION_MODEL_JSON: &str = r#"{"kind":"hierarchical_euv_v1","hole_scale":0.14,"hole_epoch_s":21600,"hole_thresholds":[0.08,0.38],"hole_suppression":0.92,"medium_mix":[0.7,0.3],"ridge_scale":1.8,"ridge_power":3,"quiet_floor":0.012,"quiet_meso_kind":"r3_fbm_squared","quiet_meso_weights":[0.55,0.3,0.15],"network_gain":0.11,"fine_modulation":[0.9,0.2],"lane_warp":0.2,"lane_width":0.1,"lane_suppression":0.9,"core_radius_R":0.0035,"background_peak":0.002,"background_scale_height_R":0.045,"group_core_budget":1.4,"group_structure_budget":0.22,"cores_per_group":2,"attachment_support_radius_R":0.015,"sparse_ridge_threshold":0.65,"structured_fine_modulation":[0.4,0.6]}"#;
#[derive(Clone, Debug)]
pub struct EmissionCore {
    pub id: u32,
    pub center: Vec3,
    pub radius: f64,
    pub emission: f64,
    pub structure_emission: f64,
    pub axis_u: Vec3,
    pub group_id: u32,
    pub strand_id: u32,
    pub endpoint: usize,
}
#[derive(Clone, Debug)]
pub struct EmissionRegion {
    pub id: u32,
    pub center: Vec3,
    pub axis_u: Vec3,
    pub axis_v: Vec3,
    pub extent: [f64; 2],
    pub cores: Vec<EmissionCore>,
}
pub const EMISSION_COMPONENT_KEYS: [&str; 8] = [
    "macro",
    "macro_meso",
    "macro_meso_micro",
    "complete",
    "ar_mask",
    "ar_internal",
    "cores_dark_lanes",
    "ar_final",
];
pub fn surface_components(
    p: Vec3,
    time: f64,
    seed: u32,
    regions: &[EmissionRegion],
) -> Result<[f64; 8], &'static str> {
    let f = euv_components(p, time, seed)?;
    components_from_fields(p, &f, regions)
}
fn components_from_fields(
    p: Vec3,
    f: &EuvComponents,
    regions: &[EmissionRegion],
) -> Result<[f64; 8], &'static str> {
    let dark = 1.0 - 0.92 * f.hole;
    let macro_only = dark * 0.012;
    let macro_meso = dark * (0.012 + 0.11 * f.quiet_meso);
    let quiet = macro_meso * (0.9 + 0.2 * f.fine);
    let sparse = ((f.medium - 0.65).max(0.0) / 0.35).powi(2);
    let (mut mask, mut internal_sum, mut core_lane, mut active) = (0.0, 0.0, 0.0, 0.0);
    for r in regions {
        // Placement envelope is diagnostic ONLY; it never contributes to emitted light.
        let c = dot(p, r.center);
        let t = (c / 0.25).clamp(0.0, 1.0);
        let front = t * t * (3.0 - 2.0 * t);
        mask += front
            * (-0.5
                * ((dot(p, r.axis_u) / r.extent[0]).powi(2)
                    + (dot(p, r.axis_v) / r.extent[1]).powi(2)))
            .exp();
        for core in &r.cores {
            let delta = add(p, scale(core.center, -1.0));
            let d2 = dot(delta, delta);
            let support = (-0.5 * d2 / (0.015 * 0.015)).exp();
            let lane = (-0.5
                * ((dot(delta, core.axis_u) / 0.015 + 0.2 * f.first_octave) / 0.10).powi(2))
            .exp();
            let internal = core.structure_emission * support * sparse * (0.4 + 0.6 * f.fine);
            let peak = core.emission * (-0.5 * d2 / (core.radius * core.radius)).exp();
            internal_sum += internal;
            core_lane += peak + core.structure_emission * support * (1.0 - 0.9 * lane);
            active += internal * (1.0 - 0.9 * lane) + peak;
        }
    }
    let out = [
        macro_only,
        macro_meso,
        quiet,
        quiet + active,
        mask,
        internal_sum,
        core_lane,
        active,
    ];
    if out.iter().all(|v| v.is_finite() && *v >= 0.0) {
        Ok(out)
    } else {
        Err("surface component overflow")
    }
}
pub fn surface_emission(
    p: Vec3,
    time: f64,
    seed: u32,
    regions: &[EmissionRegion],
) -> Result<f64, &'static str> {
    Ok(surface_components(p, time, seed, regions)?[3])
}
pub fn background_emission(p: Vec3, seed: u32) -> Result<f64, &'static str> {
    let r = norm(p);
    if !r.is_finite() {
        return Err("background position");
    }
    if !(1.0..=2.5).contains(&r) {
        return Ok(0.0);
    }
    let f = euv_components(scale(p, 1.0 / r), 0.0, seed)?;
    Ok(
        0.002
            * (-(r - 1.0) / 0.045).exp()
            * (0.15 + 0.85 * (1.0 - f.hole))
            * (0.3 + 0.7 * f.medium),
    )
}
fn vec3(v: &JsonValue) -> Result<Vec3, &'static str> {
    let a = v.as_array().ok_or("vector")?;
    if a.len() != 3 {
        return Err("vector width");
    }
    Ok([
        a[0].as_f64().ok_or("number")?,
        a[1].as_f64().ok_or("number")?,
        a[2].as_f64().ok_or("number")?,
    ])
}
pub fn read_emission_regions(packet: &JsonValue) -> Result<Vec<EmissionRegion>, &'static str> {
    let mut raw = String::new();
    packet.write_compact(&mut raw);
    validate_packet_json(&raw).map_err(|_| "packet admission")?;
    let mut out = Vec::new();
    for r in packet
        .get("emission_regions")
        .and_then(JsonValue::as_array)
        .ok_or("emission regions")?
    {
        let ext = r
            .get("extent_rad")
            .and_then(JsonValue::as_array)
            .ok_or("extent")?;
        if ext.len() != 2 {
            return Err("extent width");
        }
        let mut cores = Vec::new();
        for c in r
            .get("cores")
            .and_then(JsonValue::as_array)
            .ok_or("cores")?
        {
            cores.push(EmissionCore {
                id: c.get("id").and_then(JsonValue::as_f64).ok_or("core id")? as u32,
                center: vec3(c.get("center").ok_or("core center")?)?,
                radius: c
                    .get("radius_R")
                    .and_then(JsonValue::as_f64)
                    .ok_or("core radius")?,
                emission: c
                    .get("emission_relative")
                    .and_then(JsonValue::as_f64)
                    .ok_or("core emission")?,
                structure_emission: c
                    .get("structure_relative")
                    .and_then(JsonValue::as_f64)
                    .ok_or("core structure")?,
                axis_u: vec3(c.get("axis_u").ok_or("core axis")?)?,
                group_id: c
                    .get("attachment_group_id")
                    .and_then(JsonValue::as_f64)
                    .ok_or("core group")? as u32,
                strand_id: c
                    .get("strand_id")
                    .and_then(JsonValue::as_f64)
                    .ok_or("core strand")? as u32,
                endpoint: c
                    .get("endpoint")
                    .and_then(JsonValue::as_f64)
                    .ok_or("core endpoint")? as usize,
            });
        }
        out.push(EmissionRegion {
            id: r.get("id").and_then(JsonValue::as_f64).ok_or("region id")? as u32,
            center: vec3(r.get("center").ok_or("center")?)?,
            axis_u: vec3(r.get("axis_u").ok_or("axis")?)?,
            axis_v: vec3(r.get("axis_v").ok_or("axis")?)?,
            extent: [
                ext[0].as_f64().ok_or("extent")?,
                ext[1].as_f64().ok_or("extent")?,
            ],
            cores,
        });
    }
    Ok(out)
}
#[derive(Clone)]
struct Curve {
    points: Vec<Vec3>,
    ends: [&'static str; 2],
}
fn traced(field: &FieldSolution, p: Vec3) -> Result<Curve, &'static str> {
    let a = trace(field, p, -1.0, 4096)?;
    let b = trace(field, p, 1.0, 4096)?;
    Ok(Curve {
        points: a
            .points
            .into_iter()
            .rev()
            .chain(b.points.into_iter().skip(1))
            .collect(),
        ends: [a.termination, b.termination],
    })
}
fn length(points: &[Vec3]) -> Vec<f64> {
    let mut arc = vec![0.0];
    for pair in points.windows(2) {
        arc.push(arc.last().unwrap() + norm(add(pair[1], scale(pair[0], -1.0))));
    }
    arc
}
fn resample(curve: &Curve) -> Result<Vec<Vec3>, &'static str> {
    let arc = length(&curve.points);
    let total = *arc.last().ok_or("empty curve")?;
    if total <= 0.0 {
        return Err("zero curve");
    }
    let segments = ((total / 0.01).ceil() as usize).clamp(32, 256);
    let step = total / segments as f64;
    let mut out = Vec::with_capacity(segments + 1);
    let mut index = 0;
    for i in 0..=segments {
        let at = i as f64 * step;
        while index + 1 < arc.len() - 1 && arc[index + 1] < at {
            index += 1;
        }
        let t = ((at - arc[index]) / (arc[index + 1] - arc[index])).clamp(0.0, 1.0);
        let mut p = add(
            scale(curve.points[index], 1.0 - t),
            scale(curve.points[index + 1], t),
        );
        if norm(p) < 1.0 {
            p = unit(p);
        }
        out.push(p);
    }
    out[0] = curve.points[0];
    *out.last_mut().unwrap() = *curve.points.last().unwrap();
    let mut error: f64 = 0.0;
    for (p, at) in curve.points.iter().zip(arc) {
        let i = ((at / step).floor() as usize).min(segments - 1);
        let t = (at / step - i as f64).clamp(0.0, 1.0);
        let q = add(scale(out[i], 1.0 - t), scale(out[i + 1], t));
        error = error.max(norm(add(*p, scale(q, -1.0))));
    }
    if error > 0.001 {
        return Err("curve resampling tolerance");
    }
    Ok(out)
}
fn strand_json(
    curve: &Curve,
    id: u32,
    family: u32,
    region: u32,
    role: &str,
    seed: u32,
    coefficient: f64,
) -> Result<JsonValue, &'static str> {
    let p = resample(curve)?;
    let width = match role {
        "bundle_envelope" => 0.009,
        "long_arc" => 0.003,
        _ => 0.002 + 0.0015 * random(seed ^ id ^ 0x243f6a88),
    };
    let mu = 0.3 + 0.4 * random(seed ^ family ^ 0xb7e15162);
    let sigma = 0.12 + 0.10 * random(seed ^ family ^ 0x8aed2a6b);
    let shift = if role == "individual" {
        (random(seed ^ id) - 0.5) * 0.04
    } else {
        0.0
    };
    let mut points = Vec::new();
    let mut gain = Vec::new();
    for (i, p) in p.iter().enumerate() {
        let u = i as f64 / (p.len() - 1) as f64;
        let radius = width * (1.0 + 0.4 * (PI * u).sin().powi(2));
        points.push(arr(vec![
            n(rounded(p[0])),
            n(rounded(p[1])),
            n(rounded(p[2])),
            n(rounded(radius)),
        ]));
        gain.push(n(((0.02
            + 0.7 * (-0.5 * ((u - mu - shift) / sigma).powi(2)).exp()
            + 0.18 * ((-u / 0.04).exp() + (-(1.0 - u) / 0.04).exp()))
        .min(1.0)
            * 1e6)
            .round()
            / 1e6));
    }
    let closed = curve.ends == ["surface", "surface"];
    let open = curve
        .ends
        .iter()
        .all(|s| *s == "surface" || *s == "source_surface");
    Ok(obj(vec![
        ("id", n(f64::from(id))),
        ("family_id", n(f64::from(family))),
        ("region_id", n(f64::from(region))),
        ("role", s(role)),
        (
            "classification",
            s(if closed {
                "closed"
            } else if open {
                "open"
            } else {
                "incomplete"
            }),
        ),
        (
            "termination",
            arr(curve.ends.iter().map(|x| s(x)).collect()),
        ),
        ("emission_relative", n(coefficient)),
        ("points", arr(points)),
        ("emissivity_gain", arr(gain)),
        (
            "pulse",
            obj(vec![
                (
                    "onset_s",
                    n(f64::from(region) * 1700.0 + f64::from(id % 8) * 73.0),
                ),
                ("duration_s", n(1800.0)),
                ("speed_R_per_s", n(0.0002)),
                ("amplitude", n(0.3)),
                ("width_R", n(0.04)),
                ("path_origin", s("first_point")),
                ("window", s("sin_squared_nonrepeating")),
            ]),
        ),
    ]))
}
fn exported_core(
    id: u32,
    group: u32,
    strand_id: u32,
    endpoint: usize,
    center: Vec3,
    axis_u: Vec3,
) -> JsonValue {
    obj(vec![
        ("id", n(f64::from(id))),
        ("center", vector(unit(center))),
        ("radius_R", n(0.0035)),
        ("emission_relative", n(0.7)),
        ("structure_relative", n(0.11)),
        ("axis_u", vector(axis_u)),
        ("attachment_group_id", n(f64::from(group))),
        ("strand_id", n(f64::from(strand_id))),
        ("endpoint", n(endpoint as f64)),
    ])
}
/// Replace illumination-only geometry while retaining the full original PFSS coefficients.
pub(crate) fn enrich_hierarchy(
    raw: &str,
    field: Option<&FieldSolution>,
    source_regions: &[Region],
    seed: u32,
) -> Result<String, &'static str> {
    let mut packet = parse_json(raw).map_err(|_| "packet JSON")?;
    set(
        &mut packet,
        "emission_model",
        parse_json(EMISSION_MODEL_JSON).map_err(|_| "model JSON")?,
    );
    let mut emission_regions = Vec::new();
    let mut groups = Vec::new();
    let mut output = Vec::new();
    if let Some(field) = field {
        let scaffold = packet
            .get("strands")
            .and_then(JsonValue::as_array)
            .ok_or("scaffold")?
            .to_vec();
        for region in source_regions {
            let mut central = None;
            for record in scaffold.iter().skip(region.id as usize * 4).take(4) {
                if record.get("classification").and_then(JsonValue::as_str) != Some("closed") {
                    continue;
                }
                let points = record
                    .get("points")
                    .and_then(JsonValue::as_array)
                    .ok_or("points")?
                    .iter()
                    .map(|p| {
                        let a = p.as_array().ok_or("point")?;
                        Ok([
                            a[0].as_f64().ok_or("x")?,
                            a[1].as_f64().ok_or("y")?,
                            a[2].as_f64().ok_or("z")?,
                        ])
                    })
                    .collect::<Result<Vec<_>, &'static str>>()?;
                let separation = norm(add(points[0], scale(*points.last().unwrap(), -1.0)));
                if (0.025..=0.6).contains(&separation) {
                    central = Some(Curve {
                        points,
                        ends: ["surface", "surface"],
                    });
                    break;
                }
            }
            let Some(central) = central else {
                continue;
            };
            let root = unit(central.points[0]);
            let other = unit(*central.points.last().unwrap());
            let basis = if root[2].abs() < 0.9 {
                [0.0, 0.0, 1.0]
            } else {
                [1.0, 0.0, 0.0]
            };
            let tu = unit(cross(basis, root));
            let tv = cross(root, tu);
            let mut family = vec![central.clone()];
            for j in 0..3 {
                let angle = j as f64 * 2.0 * PI / 3.0 + random(seed ^ region.id) * 2.0 * PI;
                for attempt in 0..3 {
                    let radius = 0.003 / (attempt as f64 + 1.0);
                    let start = scale(
                        unit(add(
                            root,
                            add(
                                scale(tu, radius * angle.cos()),
                                scale(tv, radius * angle.sin()),
                            ),
                        )),
                        1.005,
                    );
                    let mut c = traced(field, start)?;
                    if c.ends != ["surface", "surface"] {
                        continue;
                    }
                    if norm(add(c.points[0], scale(root, -1.0)))
                        > norm(add(*c.points.last().unwrap(), scale(root, -1.0)))
                    {
                        c.points.reverse();
                    }
                    if norm(add(*c.points.last().unwrap(), scale(other, -1.0))) <= 0.06 {
                        family.push(c);
                        break;
                    }
                }
            }
            if family.len() != 4 {
                continue;
            }
            let family_id = region.id;
            let coefficient = 1.5 + 2.5 * random(seed ^ family_id ^ 0x3c6ef372);
            let mut strand_ids = Vec::new();
            let mut endpoints = Vec::new();
            for (j, c) in family.iter().enumerate() {
                let id = region.id * 8 + j as u32;
                let exported = strand_json(
                    c,
                    id,
                    family_id,
                    region.id,
                    "individual",
                    seed,
                    coefficient * (0.85 + 0.15 * random(seed ^ id)),
                )?;
                let points = exported
                    .get("points")
                    .and_then(JsonValue::as_array)
                    .unwrap();
                let first = points[0].as_array().unwrap();
                let last = points.last().unwrap().as_array().unwrap();
                endpoints.push((
                    [
                        first[0].as_f64().unwrap(),
                        first[1].as_f64().unwrap(),
                        first[2].as_f64().unwrap(),
                    ],
                    [
                        last[0].as_f64().unwrap(),
                        last[1].as_f64().unwrap(),
                        last[2].as_f64().unwrap(),
                    ],
                ));
                strand_ids.push(id);
                output.push(exported);
            }
            let envelope_id = region.id * 8 + 4;
            output.push(strand_json(
                &central,
                envelope_id,
                family_id,
                region.id,
                "bundle_envelope",
                seed,
                coefficient * 0.08,
            )?);
            strand_ids.push(envelope_id);
            let group_a = region.id * 2;
            let group_b = group_a + 1;
            // Logical attachments use fixed anchor traces 0 and 2, independent of rendering members.
            let ca = unit(add(endpoints[0].0, endpoints[2].0));
            let cb = unit(add(endpoints[0].1, endpoints[2].1));
            let delta = add(cb, scale(ca, -1.0));
            let axis_a = unit(add(delta, scale(ca, -dot(delta, ca))));
            let axis_b = unit(add(delta, scale(cb, -dot(delta, cb))));
            for (id, c) in [(group_a, ca), (group_b, cb)] {
                groups.push(obj(vec![
                    ("id", n(f64::from(id))),
                    ("region_id", n(f64::from(region.id))),
                    ("center", vector(c)),
                    (
                        "axis_u",
                        vector(if id == group_a { axis_a } else { axis_b }),
                    ),
                    ("core_emission_budget", n(1.4)),
                    ("structure_emission_budget", n(0.22)),
                    (
                        "strand_ids",
                        arr(strand_ids.iter().map(|i| n(f64::from(*i))).collect()),
                    ),
                ]));
            }
            let center = unit(add(ca, cb));
            let axis_u = unit(add(cb, scale(center, -dot(cb, center))));
            let axis_v = cross(center, axis_u);
            let a = (0.6 * norm(add(ca, scale(cb, -1.0)))).clamp(0.075, 0.2);
            let b = (a * 0.6).max(0.045);
            let second = 2;
            let cores = vec![
                exported_core(
                    region.id * 4,
                    group_a,
                    region.id * 8,
                    0,
                    endpoints[0].0,
                    axis_a,
                ),
                exported_core(
                    region.id * 4 + 1,
                    group_a,
                    region.id * 8 + second as u32,
                    0,
                    endpoints[second].0,
                    axis_a,
                ),
                exported_core(
                    region.id * 4 + 2,
                    group_b,
                    region.id * 8,
                    1,
                    endpoints[0].1,
                    axis_b,
                ),
                exported_core(
                    region.id * 4 + 3,
                    group_b,
                    region.id * 8 + second as u32,
                    1,
                    endpoints[second].1,
                    axis_b,
                ),
            ];
            emission_regions.push(obj(vec![
                ("id", n(f64::from(region.id))),
                ("center", vector(center)),
                ("axis_u", vector(axis_u)),
                ("axis_v", vector(axis_v)),
                ("extent_rad", arr(vec![n(a), n(b)])),
                ("cores", arr(cores)),
            ]));
        }
        if emission_regions.is_empty() {
            return Err("no coherent closed PFSS families");
        }
        let mut long_count = 0;
        for record in scaffold.iter().skip(source_regions.len() * 4) {
            if long_count >= 4 {
                break;
            }
            let class = record
                .get("classification")
                .and_then(JsonValue::as_str)
                .unwrap_or("incomplete");
            if class == "incomplete" {
                continue;
            }
            let points = record
                .get("points")
                .and_then(JsonValue::as_array)
                .unwrap()
                .iter()
                .map(|p| {
                    let a = p.as_array().unwrap();
                    [
                        a[0].as_f64().unwrap(),
                        a[1].as_f64().unwrap(),
                        a[2].as_f64().unwrap(),
                    ]
                })
                .collect::<Vec<_>>();
            if points.iter().map(|p| norm(*p)).fold(0.0, f64::max) < 1.18 {
                continue;
            }
            let ends = if class == "closed" {
                ["surface", "surface"]
            } else {
                let e = record
                    .get("termination")
                    .and_then(JsonValue::as_array)
                    .unwrap();
                [
                    if e[0].as_str() == Some("surface") {
                        "surface"
                    } else {
                        "source_surface"
                    },
                    if e[1].as_str() == Some("surface") {
                        "surface"
                    } else {
                        "source_surface"
                    },
                ]
            };
            let region = emission_regions
                .iter()
                .max_by(|a, b| {
                    let va = vec3(a.get("center").unwrap()).unwrap();
                    let vb = vec3(b.get("center").unwrap()).unwrap();
                    dot(va, points[0]).total_cmp(&dot(vb, points[0]))
                })
                .unwrap()
                .get("id")
                .and_then(JsonValue::as_f64)
                .unwrap() as u32;
            let id = 1000 + long_count;
            output.push(strand_json(
                &Curve { points, ends },
                id,
                id,
                region,
                "long_arc",
                seed,
                0.15 + 0.20 * random(seed ^ id),
            )?);
            long_count += 1;
        }
        let segments = output
            .iter()
            .map(|s| s.get("points").and_then(JsonValue::as_array).unwrap().len() - 1)
            .sum::<usize>();
        if output.len() > 64 || segments > 16384 {
            return Err("bundle geometry capacity");
        }
    }
    set(&mut packet, "strands", arr(output));
    set(&mut packet, "emission_regions", arr(emission_regions));
    set(&mut packet, "attachment_groups", arr(groups));
    let mut out = String::new();
    packet.write_compact(&mut out);
    if out.len() > 1024 * 1024 {
        return Err("hierarchy packet bytes");
    }
    Ok(out)
}

#[cfg(test)]
mod invariants {
    use super::*;
    fn region(p: Vec3) -> EmissionRegion {
        let u = unit(cross([0.0, 0.0, 1.0], p));
        EmissionRegion {
            id: 0,
            center: p,
            axis_u: u,
            axis_v: cross(p, u),
            extent: [0.075, 0.045],
            cores: vec![],
        }
    }
    #[test]
    fn masks_without_attachments_emit_exactly_quiet() {
        for i in 0..32 {
            let p = direction(0.3 * (i as f64).sin(), i as f64 * 0.4);
            let quiet = surface_emission(p, 0.0, 42, &[]).unwrap();
            assert_eq!(
                surface_emission(p, 0.0, 42, &[region(p)]).unwrap(),
                quiet,
                "mask-only active emission leaked"
            );
        }
    }
}

#[cfg(test)]
mod attachment_invariants {
    use super::*;
    fn unit_at(p: Vec3) -> Vec3 {
        scale(p, 1.0 / norm(p))
    }
    fn fixture() -> EmissionRegion {
        let a = [1.0, 0.0, 0.0];
        let b = unit_at([1.0, 0.006, 0.0]);
        EmissionRegion {
            id: 0,
            center: unit_at(add(a, b)),
            axis_u: [0.0, 1.0, 0.0],
            axis_v: [0.0, 0.0, 1.0],
            extent: [0.075, 0.045],
            cores: vec![
                EmissionCore {
                    id: 0,
                    center: a,
                    radius: 0.0035,
                    emission: 0.7,
                    structure_emission: 0.11,
                    axis_u: [0.0, 1.0, 0.0],
                    group_id: 0,
                    strand_id: 0,
                    endpoint: 0,
                },
                EmissionCore {
                    id: 1,
                    center: b,
                    radius: 0.0035,
                    emission: 0.7,
                    structure_emission: 0.11,
                    axis_u: [0.0, 1.0, 0.0],
                    group_id: 0,
                    strand_id: 2,
                    endpoint: 0,
                },
            ],
        }
    }
    fn constant() -> EuvComponents {
        EuvComponents {
            hole: 0.0,
            medium: 1.0,
            quiet_meso: 1.0,
            fine: 1.0,
            first_octave: 0.0,
        }
    }
    #[test]
    fn constant_texture_has_compact_attachment_peaks_without_region_pedestal() {
        let r = fixture();
        let field = constant();
        let peak =
            components_from_fields(r.cores[0].center, &field, std::slice::from_ref(&r)).unwrap()[7];
        let far = components_from_fields(direction(0.0, 0.15), &field, &[r]).unwrap()[7];
        assert!(peak > 0.7);
        assert!(far < 1e-15);
    }
    #[test]
    fn envelope_extent_has_no_effect_on_any_emitted_channel() {
        let r = fixture();
        let mut wider = r.clone();
        wider.extent = [0.25, 0.2];
        for i in 0..31 {
            let p = direction(0.002, i as f64 * 0.003 - 0.04);
            let a = components_from_fields(p, &constant(), std::slice::from_ref(&r)).unwrap();
            let b = components_from_fields(p, &constant(), std::slice::from_ref(&wider)).unwrap();
            for k in [0, 1, 2, 3, 5, 6, 7] {
                assert_eq!(a[k], b[k]);
            }
        }
    }
    #[test]
    fn moving_attachment_group_moves_cores_and_endpoints_without_old_peak() {
        let original = fixture();
        let mut moved = original.clone();
        let rotate = |p: Vec3| {
            let (c, s) = (0.3_f64.cos(), 0.3_f64.sin());
            [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]
        };
        let endpoints = original.cores.iter().map(|c| c.center).collect::<Vec<_>>();
        let moved_endpoints = endpoints.iter().map(|p| rotate(*p)).collect::<Vec<_>>();
        for (core, endpoint) in moved.cores.iter_mut().zip(&moved_endpoints) {
            core.center = *endpoint;
            core.axis_u = rotate(core.axis_u);
        }
        let old = components_from_fields(
            original.cores[0].center,
            &constant(),
            std::slice::from_ref(&moved),
        )
        .unwrap()[7];
        let new = components_from_fields(
            moved.cores[0].center,
            &constant(),
            std::slice::from_ref(&moved),
        )
        .unwrap()[7];
        assert!(old < 1e-40);
        assert!(new > 0.7);
        assert_eq!(moved.cores[0].center, moved_endpoints[0]);
    }
    #[test]
    fn malformed_public_emission_reader_returns_error() {
        let v = parse_json(r#"{"emission_regions":[{"extent_rad":[]}]}"#).unwrap();
        assert!(read_emission_regions(&v).is_err());
    }
}
