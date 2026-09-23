use solar_core::appearance::*;
#[test]
fn radiometry_and_transfer() {
    assert!((planck_ratio(5772.0).unwrap() - 1.0).abs() < 1e-12);
    assert!((limb(0.0, 0.6).unwrap() - 0.4).abs() < 1e-12);
    assert!(planck_ratio(f64::NAN).is_err());
    assert!((transfer_segment(2.0, 3.0, 0.0, 4.0).unwrap() - 14.0).abs() < 1e-12);
}
#[test]
fn dipole_boundary_and_source_surface() {
    let f = FieldSolution::new(
        2.5,
        vec![Harmonic {
            l: 1,
            m: 0,
            cosine: 1.0,
            sine: 0.0,
        }],
    )
    .unwrap();
    let p = [0.6, 0.0, 0.8];
    let b = f.field(p);
    let br = dot(b, p);
    assert!((br - (3.0 / (4.0 * std::f64::consts::PI)).sqrt() * 0.8).abs() < 1e-7);
    let q = scale(p, 2.5);
    let b = f.field(q);
    assert!(norm(cross(b, p)) < 1e-7);
    assert!(f.field([0.0, 0.0, 1.0]).iter().all(|v| v.is_finite()));
}
#[test]
fn trace_budget_is_not_open() {
    let f = FieldSolution::new(
        2.5,
        vec![Harmonic {
            l: 1,
            m: 0,
            cosine: 1.0,
            sine: 0.0,
        }],
    )
    .unwrap();
    let t = trace(&f, [1.01, 0.0, 0.0], 1.0, 1).unwrap();
    assert_eq!(t.termination, "budget");
}
#[test]
fn deterministic_bounded_sampling() {
    assert_eq!(
        sample_packet(42, 123.0, 0, 0, false).unwrap(),
        sample_packet(42, 123.0, 0, 0, false).unwrap()
    );
    assert!(sample_packet(42, f64::NAN, 0, 0, false).is_err());
    assert!(sample_packet(42, 0.0, 2, 0, false).is_err());
    assert_eq!(granulation_visibility(300.0), 0.0);
}

#[test]
fn harmonic_projection_and_flux_balance() {
    let f = solve_pfss(|p| 2.0 + 3.0 * p[2], 4, 2.5).unwrap();
    assert!((f.monopole_removed - 2.0).abs() < 1e-12);
    let expected = 3.0 * (4.0 * std::f64::consts::PI / 3.0).sqrt();
    assert!((f.coefficients[0].cosine - expected).abs() < 1e-11);
    for c in f.coefficients.iter().skip(1) {
        assert!(c.cosine.abs() < 1e-11 && c.sine.abs() < 1e-11);
    }
}
#[test]
fn harmonic_sign_and_divergence() {
    let h = harmonic(1, 1, [1.0, 0.0, 0.0]);
    assert!((h.0 + (3.0 / (4.0 * std::f64::consts::PI)).sqrt()).abs() < 1e-12);
    let f = FieldSolution::new(
        2.5,
        vec![Harmonic {
            l: 3,
            m: 2,
            cosine: 1.0,
            sine: 0.5,
        }],
    )
    .unwrap();
    let p = [1.1, 0.7, 0.6];
    let h = 1e-3;
    let mut divergence = 0.0;
    for i in 0..3 {
        let mut a = p;
        let mut b = p;
        a[i] += h;
        b[i] -= h;
        divergence += (f.field(a)[i] - f.field(b)[i]) / (2.0 * h);
    }
    assert!(divergence.abs() < 1e-5);
}
#[test]
fn granulation_support_continuity_and_evolution() {
    for i in 0..50 {
        let p = direction((i as f64 * 0.123).sin(), i as f64 * 0.717);
        let time = i as f64 * 101.0;
        let a = granulation(42, p, time, 1).unwrap();
        let b = granulation(42, p, time, 2).unwrap();
        assert!((a - b).abs() < 1e-12);
        let c = granulation(42, p, time + 1e-4, 1).unwrap();
        assert!((a - c).abs() < 1e-4);
    }
    let p = direction(0.24, 0.51);
    assert!(
        (granulation(42, p, 0.0, 1).unwrap() - granulation(42, p, 400.0, 1).unwrap()).abs() > 1e-4
    );
}
#[test]
fn disk_integral_and_transfer_slab() {
    let n = 10000;
    let flux = (0..n)
        .map(|i| {
            let mu = (i as f64 + 0.5) / n as f64;
            2.0 * mu * limb(mu, 0.6).unwrap() / n as f64
        })
        .sum::<f64>();
    assert!((flux - 0.8).abs() < 1e-8);
    let analytic = 2.0 * (-1.5_f64).exp() + 3.0 / 0.5 * (1.0 - (-1.5_f64).exp());
    assert!((transfer_segment(2.0, 3.0, 0.5, 3.0).unwrap() - analytic).abs() < 1e-12);
}
#[test]
fn traces_reach_surface_and_source_boundary() {
    let f = FieldSolution::new(
        2.5,
        vec![Harmonic {
            l: 1,
            m: 0,
            cosine: 1.0,
            sine: 0.0,
        }],
    )
    .unwrap();
    let north = trace(&f, [0.0, 0.0, 1.01], 1.0, 4096).unwrap();
    assert_eq!(north.termination, "source_surface");
    assert!((norm(*north.points.last().unwrap()) - 2.5).abs() < 1e-12);
    let equator = trace(&f, [1.01, 0.0, 0.0], 1.0, 4096).unwrap();
    assert_eq!(equator.termination, "surface");
    assert!((norm(*equator.points.last().unwrap()) - 1.0).abs() < 1e-12);
}

#[test]
#[ignore = "offline L16/32/64 quadrature qualification; run release explicitly"]
fn appearance_pfss_resolution_convergence() {
    let r = regions(42, 0.0, 1);
    let a = scenario_field(&r, 16).unwrap();
    let b = scenario_field(&r, 32).unwrap();
    let c = scenario_field(&r, 64).unwrap();
    let mut d16 = 0.0;
    let mut d32 = 0.0;
    let mut energy = 0.0;
    for i in 0..100 {
        let p = scale(
            direction(
                (1.0 - 2.0 * (i as f64 + 0.5) / 100.0).asin(),
                i as f64 * 2.399963,
            ),
            1.03,
        );
        let av = a.field(p);
        let bv = b.field(p);
        let cv = c.field(p);
        d16 += norm(add(av, scale(cv, -1.0))).powi(2);
        d32 += norm(add(bv, scale(cv, -1.0))).powi(2);
        energy += norm(cv).powi(2);
    }
    let e16 = (d16 / energy).sqrt();
    let e32 = (d32 / energy).sqrt();
    println!("PFSS relative vector RMS L16 vs64={e16:.9}, L32 vs64={e32:.9}");
    assert!(e32 < e16);
    assert!(e32 < 1e-4);
}

#[test]
fn euv_texture_and_pulse_are_explicit_and_bounded() {
    let p = direction(0.2, 0.5);
    let a = cellular_field(42, p, 123.0, 10000.0, 1200.0, 1).unwrap();
    assert!((-1.0..=1.0).contains(&a));
    assert_eq!(
        pulse(0.1, 0.0, 0.0, 1800.0, 0.0002, 0.04, 0.3).unwrap(),
        0.0
    );
    assert_eq!(
        pulse(0.1, 1800.0, 0.0, 1800.0, 0.0002, 0.04, 0.3).unwrap(),
        0.0
    );
    assert!((pulse(0.18, 900.0, 0.0, 1800.0, 0.0002, 0.04, 0.3).unwrap() - 0.3).abs() < 1e-12);
    assert!(transfer_segment(f64::MAX, f64::MAX, 0.0, 2.0).is_err());
}

#[test]
fn transfer_ray_occults_rear_corona_and_keeps_off_limb_path() {
    let ray = TransferRay {
        origin: [0.0, 0.0, 4.0],
        direction: [0.0, 0.0, -1.0],
    };
    let result = integrate_transfer(ray, 2.5, 0.0, 0.01, 2048, |_| (2.0, 0.0)).unwrap();
    assert!((result - 3.0).abs() < 1e-10);
    let ray = TransferRay {
        origin: [1.5, 0.0, 4.0],
        direction: [0.0, 0.0, -1.0],
    };
    let result = integrate_transfer(ray, 2.5, 0.0, 0.01, 2048, |_| (2.0, 0.0)).unwrap();
    assert!((result - 8.0).abs() < 1e-10);
    assert!(integrate_transfer(ray, 2.5, 0.0, 0.0001, 2, |_| (2.0, 0.0)).is_err());
}

#[test]
fn raster_is_finite_deterministic_and_time_dependent() {
    let a = euv_reference_raster(42, 0.0, 1, 64, 32).unwrap();
    let b = euv_reference_raster(42, 900.0, 1, 64, 32).unwrap();
    assert_eq!(a.len(), 2048);
    assert!(a.iter().all(|v| v.is_finite() && *v > 0.0));
    assert_eq!(a, euv_reference_raster(42, 0.0, 1, 64, 32).unwrap());
    assert!(a.iter().zip(b).any(|(x, y)| (*x - y).abs() > 0.01));
    assert!(euv_reference_raster(42, 0.0, 1, 2049, 1024).is_err());
}
#[test]
fn analytic_field_matches_cartesian_potential_gradient() {
    let f = FieldSolution::new(
        2.5,
        vec![
            Harmonic {
                l: 16,
                m: 9,
                cosine: 0.7,
                sine: 0.3,
            },
            Harmonic {
                l: 3,
                m: 2,
                cosine: 0.2,
                sine: -0.4,
            },
        ],
    )
    .unwrap();
    for i in 0..20 {
        let p = scale(direction((i as f64 * 0.13).sin(), i as f64 * 0.41), 1.15);
        let actual = f.field(p);
        for axis in 0..3 {
            let mut a = p;
            let mut b = p;
            let h = 1e-5;
            a[axis] += h;
            b[axis] -= h;
            let independent = -(f.potential(a) - f.potential(b)) / (2.0 * h);
            assert!((actual[axis] - independent).abs() < 1e-7);
        }
    }
}

#[test]
fn warped_neighbor_support_covers_full_sphere_multiple_seeds() {
    for seed in [0, 42, u32::MAX] {
        for i in 0..256 {
            let p = direction(
                (1.0 - 2.0 * (i as f64 + 0.5) / 256.0).asin(),
                i as f64 * 2.399963,
            );
            let time = (i * 71) as f64;
            let a = cellular_field(seed, p, time, 10000.0, 1200.0, 1).unwrap();
            let b = cellular_field(seed, p, time, 10000.0, 1200.0, 2).unwrap();
            assert!((a - b).abs() < 1e-12);
        }
    }
}

#[test]
fn optically_thin_underflow_keeps_emission_limit() {
    let value = transfer_segment(0.0, 1e308, 1e-308, 1e-308).unwrap();
    assert!((value - 1.0).abs() < 1e-12);
}

#[test]
fn euv_r3_reference_vectors_and_absolute_time() {
    for p in [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] {
        for time in [0.0, 600.0] {
            let v = euv_structure(p, time, 42).unwrap();
            println!("EUV_R3 p={p:?} t={time} value={v:.17}");
            assert!((-1.0..=1.0).contains(&v));
            assert_eq!(v, euv_structure(p, time, 42).unwrap());
        }
    }
    let p = direction(0.34, 1.17);
    let a = euv_structure(p, 1199.999, 42).unwrap();
    let b = euv_structure(p, 1200.001, 42).unwrap();
    assert!((a - b).abs() < 1e-9);
    assert!(euv_structure([f64::NAN, 0.0, 0.0], 0.0, 42).is_err());
}

#[test]
fn logical_attachment_packets_do_not_change_with_render_lod() {
    let low = sample_packet_at_order(42, 0.0, 0, 0, true, 4).unwrap();
    let high = sample_packet_at_order(42, 0.0, 0, 1, true, 4).unwrap();
    assert_eq!(low, high);
}

#[test]
fn real_packet_geometry_refinement_keeps_disk_field_exact() {
    use solar_core::{parse_json, JsonValue};
    fn replace(v: &mut JsonValue, key: &str, new: JsonValue) {
        let JsonValue::Object(fields) = v else {
            panic!("fixture object")
        };
        fields.iter_mut().find(|(k, _)| k == key).unwrap().1 = new;
    }
    let raw = sample_packet_at_order(42, 0.0, 0, 1, true, 4).unwrap();
    let original = parse_json(&raw).unwrap();
    let mut refined = original.clone();
    let mut strands = original
        .get("strands")
        .unwrap()
        .as_array()
        .unwrap()
        .to_vec();
    let original_count = strands
        .iter()
        .map(|s| s.get("points").unwrap().as_array().unwrap().len())
        .sum::<usize>();
    for strand in &mut strands {
        let mut points = strand.get("points").unwrap().as_array().unwrap().to_vec();
        let mut gain = strand
            .get("emissivity_gain")
            .unwrap()
            .as_array()
            .unwrap()
            .to_vec();
        let i = points.len() / 2;
        let a = points[i].as_array().unwrap();
        let b = points[i + 1].as_array().unwrap();
        let mid = JsonValue::Array(
            (0..4)
                .map(|k| JsonValue::Number((a[k].as_f64().unwrap() + b[k].as_f64().unwrap()) / 2.0))
                .collect(),
        );
        points.insert(i + 1, mid);
        let gm = (gain[i].as_f64().unwrap() + gain[i + 1].as_f64().unwrap()) / 2.0;
        gain.insert(i + 1, JsonValue::Number(gm));
        replace(strand, "points", JsonValue::Array(points));
        replace(strand, "emissivity_gain", JsonValue::Array(gain));
    }
    let refined_count = strands
        .iter()
        .map(|s| s.get("points").unwrap().as_array().unwrap().len())
        .sum::<usize>();
    assert!(refined_count > original_count);
    replace(&mut refined, "strands", JsonValue::Array(strands));
    let mut encoded = String::new();
    refined.write_compact(&mut encoded);
    validate_packet_json(&encoded).unwrap();
    assert_eq!(
        original.get("emission_regions"),
        refined.get("emission_regions")
    );
    assert_eq!(
        original.get("attachment_groups"),
        refined.get("attachment_groups")
    );
    let a = read_emission_regions(&original).unwrap();
    let b = read_emission_regions(&refined).unwrap();
    for time in [0.0, 600.0] {
        for region in &a {
            for core in &region.cores {
                assert_eq!(
                    surface_emission(core.center, time, 42, &a).unwrap(),
                    surface_emission(core.center, time, 42, &b).unwrap()
                );
            }
        }
    }
}

#[test]
fn attachment_identity_and_budget_mutations_are_rejected() {
    use solar_core::{parse_json, JsonValue};
    fn member<'a>(v: &'a mut JsonValue, key: &str) -> &'a mut JsonValue {
        let JsonValue::Object(fields) = v else {
            panic!("object")
        };
        &mut fields.iter_mut().find(|(k, _)| k == key).unwrap().1
    }
    fn first(v: &mut JsonValue) -> &mut JsonValue {
        let JsonValue::Array(a) = v else {
            panic!("array")
        };
        &mut a[0]
    }
    let raw = sample_packet_at_order(42, 0.0, 0, 1, true, 4).unwrap();
    for mutation in 0..5 {
        let mut packet = parse_json(&raw).unwrap();
        if mutation == 0 {
            *member(
                first(member(&mut packet, "attachment_groups")),
                "core_emission_budget",
            ) = JsonValue::Number(1.5);
        } else {
            let core = first(member(
                first(member(&mut packet, "emission_regions")),
                "cores",
            ));
            match mutation {
                1 => *member(core, "structure_relative") = JsonValue::Number(0.22),
                2 => {
                    *member(core, "strand_id") =
                        JsonValue::Number(member(core, "strand_id").as_f64().unwrap() + 1.0)
                }
                3 => {
                    *member(core, "attachment_group_id") = JsonValue::Number(
                        member(core, "attachment_group_id").as_f64().unwrap() + 1.0,
                    )
                }
                _ => *member(core, "endpoint") = JsonValue::Number(1.0),
            }
        }
        let mut text = String::new();
        packet.write_compact(&mut text);
        assert!(validate_packet_json(&text).is_err(), "mutation {mutation}");
    }
}

#[test]
fn quiet_meso_reuses_r3_field_without_changing_attachment_ridge() {
    for p in [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] {
        for time in [0.0, 600.0, 1200.0, 21600.0] {
            let c = euv_components(p, time, 42).unwrap();
            let f = euv_structure(p, time, 42).unwrap().clamp(-1.0, 1.0);
            assert!((c.quiet_meso - (0.5 + 0.5 * f).powi(2)).abs() < 1e-14);
            assert!((0.0..=1.0).contains(&c.quiet_meso));
            let emission = surface_emission(p, time, 42, &[]).unwrap();
            assert_eq!(
                emission,
                (1.0 - 0.92 * c.hole) * (0.012 + 0.11 * c.quiet_meso) * (0.9 + 0.2 * c.fine)
            );
        }
    }
}
