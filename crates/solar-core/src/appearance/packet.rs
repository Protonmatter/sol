use super::*;
use crate::differential_rotation::carrington_advection_deg_per_day;
use std::fmt::Write;
pub const RECIPE_HASHES: [&str; 2] = [
    "8bd0922001b6a98a2ad5f5ca4b777b6a139b94cb7d05e3d2269832fa8d42a6c1",
    "28d73c04ee871367dda18edbc03095efaf8075ac4026e5f962430585aad08787",
];
pub const MAX_TIME: f64 = 21600.0;
pub const RECIPE_IDS: [&str; 2] = ["quiet-v1", "active-v1"];
#[derive(Clone, Debug)]
pub struct Region {
    pub id: u32,
    pub center: Vec3,
    pub radius: f64,
    pub temperature: f64,
}
pub fn regions(seed: u32, time: f64, recipe: u32) -> Vec<Region> {
    let count = if recipe == 0 { 3 } else { 10 };
    (0..count)
        .map(|i| {
            let h = mix(seed ^ i);
            let lat = ((f64::from(h >> 8) / 16777216.0) * 50.0 - 25.0).to_radians();
            let lon = f64::from(mix(h) >> 8) / 16777216.0 * std::f64::consts::TAU
                + carrington_advection_deg_per_day(lat.to_degrees()).to_radians() * time / 86400.0;
            Region {
                id: i,
                center: direction(lat, lon),
                radius: if recipe == 0 { 0.045 } else { 0.075 },
                temperature: 4300.0,
            }
        })
        .collect()
}
/// The boundary is an explicitly synthetic global dipole plus paired finite-width polarities.
pub fn scenario_field(regions: &[Region], lmax: usize) -> Result<FieldSolution, &'static str> {
    solve_pfss(
        |p| {
            let mut br = 0.35 * p[2];
            for r in regions {
                let lon = r.center[1].atan2(r.center[0]);
                let lat = r.center[2].asin();
                let positive = direction(lat, lon - 0.075);
                let negative = direction(lat + 0.025, lon + 0.075);
                br += 2.5 * ((dot(p, positive) - 1.0) / 0.025).exp()
                    - 2.5 * ((dot(p, negative) - 1.0) / 0.025).exp();
            }
            br
        },
        lmax,
        2.5,
    )
}
pub fn sample_packet(
    seed: u32,
    time: f64,
    recipe: u32,
    lod: u32,
    geometry: bool,
) -> Result<String, &'static str> {
    sample_packet_at_order(seed, time, recipe, lod, geometry, 32)
}
/// Offline higher-order preparation. Browser sampling never solves a global field.
pub fn sample_packet_at_order(
    seed: u32,
    time: f64,
    recipe: u32,
    lod: u32,
    geometry: bool,
    lmax: usize,
) -> Result<String, &'static str> {
    if !(1..=64).contains(&lmax) {
        return Err("invalid_lmax");
    }
    if !time.is_finite() || !(0.0..=MAX_TIME).contains(&time) || recipe > 1 || lod > 2 {
        return Err("invalid_request");
    }
    let regions = regions(seed, time, recipe);
    let mut out = format!(
        r#"{{"schema_version":"solar-render-packet.v1","abi":1,"recipe_id":"{}","recipe_hash":"{}","seed":{},"time_s":{},"valid_time_range_seconds":[0,21600],"frame":"carrington_z_north_west_positive","radius_km":695700,"rotation_law":{{"id":"engine-magnetic-tracer-v1","coefficients_deg_per_day":[14.713,-2.396,-1.787],"frame_rate_deg_per_day":14.1844}},"topology_id":"{}-seed{}-t{}","source_mode":"synthetic_statistical_pfss","field_units":"normalized","field_provenance":"synthetic global dipole and paired Gaussian polarities; not observed or calibrated","relative_emission":true,"surface":{{"wavelength_nm":550,"quiet_temperature_k":5772,"limb_u":0.6,"granule_km":1000,"lifetime_s":1200,"amplitude_k":150,"euv_texture":{{"kind":"correlated_value_noise_v1","spatial_scale_factor":0.35,"octave_weights":[0.55,0.3,0.15],"epoch_law":"quintic_crossfade_of_hashed_fields","cell_km":10000,"lifetime_s":1200,"amplitude":0.65,"domain_warp":{{"kind":"quintic_hashed_vector_v1","frequency_per_cell":0.18,"amplitude_cells":1.25}}}}}},"regions": ["#,
        RECIPE_IDS[recipe as usize],
        RECIPE_HASHES[recipe as usize],
        seed,
        time,
        RECIPE_IDS[recipe as usize],
        seed,
        time
    );
    for (i, r) in regions.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        write!(
            out,
            r#"{{"id":{},"center":[{},{},{}],"radius_rad":{},"temperature_k":{}}}"#,
            r.id, r.center[0], r.center[1], r.center[2], r.radius, r.temperature
        )
        .unwrap();
    }
    out.push_str("],\"strands\":[");
    let mut field = None;
    if geometry {
        let f = scenario_field(&regions, lmax)?;
        let count = 64; // Logical attachment anchors never depend on render LOD.
        for i in 0..count {
            let p = if i < regions.len() * 4 {
                let r = &regions[i / 4];
                let lon = r.center[1].atan2(r.center[0]) + if i % 2 == 0 { -0.09 } else { 0.09 };
                direction(r.center[2].asin() + 0.03 * ((i % 4) as f64 - 1.5), lon)
            } else {
                let z = 1.0 - 2.0 * (i as f64 + 0.5) / count as f64;
                direction(z.asin(), i as f64 * 2.399963229728653)
            };
            let seed_point = scale(p, 1.005);
            let a = trace(&f, seed_point, -1.0, 4096)?;
            let b = trace(&f, seed_point, 1.0, 4096)?;
            let closed = a.termination == "surface" && b.termination == "surface";
            let open = (a.termination == "source_surface" || b.termination == "source_surface")
                && [a.termination, b.termination]
                    .iter()
                    .all(|t| *t == "surface" || *t == "source_surface");
            let class = if closed {
                "closed"
            } else if open {
                "open"
            } else {
                "incomplete"
            };
            if i > 0 {
                out.push(',');
            }
            write!(out,r#"{{"id":{},"classification":"{}","termination":["{}","{}"],"emission_relative":{},"pulse":{{"onset_s":{},"duration_s":1800,"speed_R_per_s":0.0002,"amplitude":0.3,"width_R":0.04,"path_origin":"first_point","window":"sin_squared_nonrepeating"}},"points":["#,i,class,a.termination,b.termination,if closed{1.0}else{0.25},i*233).unwrap();
            for (j, v) in a
                .points
                .iter()
                .rev()
                .chain(b.points.iter().skip(1))
                .enumerate()
            {
                if j > 0 {
                    out.push(',');
                }
                write!(out, "[{:.8},{:.8},{:.8},0.008]", v[0], v[1], v[2]).unwrap();
            }
            out.push_str("]}");
        }
        field = Some(f);
    }
    out.push_str("],\"field\":");
    if let Some(ref f) = field {
        write!(
            out,
            r#"{{"source_surface_R":2.5,"lmax":{},"monopole_removed":{},"coefficients":["#,
            lmax, f.monopole_removed
        )
        .unwrap();
        for (i, c) in f.coefficients.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            write!(
                out,
                r#"{{"l":{},"m":{},"cosine":{},"sine":{}}}"#,
                c.l, c.m, c.cosine, c.sine
            )
            .unwrap();
        }
        out.push_str("]}");
    } else {
        out.push_str("null");
    }
    out.push_str(",\"limitations\":[\"Illustrative statistical photosphere; no convection solver\",\"PFSS is potential topology, not plasma dynamics or reconnection\",\"Finite harmonic truncation; no observational topology qualification\",\"Dimensionless emission and assumed atmosphere, no instrument calibration\"]}");
    if out.len() > 1024 * 1024 {
        return Err("capacity");
    }
    let out = enrich_hierarchy(&out, field.as_ref(), &regions, seed)?;
    validate_packet_json(&out).map_err(|_| "internal_packet_validation")?;
    Ok(out)
}
