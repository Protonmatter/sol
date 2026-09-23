use solar_core::appearance::*;
#[test]
fn lifecycle_is_c1_bounded_and_nonrepeating() {
    let r = LifecycleRegion {
        id: 1,
        birth_s: 100.0,
        lifetime_s: 1000.0,
        rise_s: 100.0,
        decay_s: 200.0,
        latitude_rad: 0.2,
        birth_longitude_rad: 0.3,
        peak_radius_rad: 0.1,
        temperature_k: 4300.0,
        peak_strength: 2.0,
    };
    assert_eq!(r.pose(99.0).unwrap().strength, 0.0);
    assert_eq!(r.pose(1100.0).unwrap().strength, 0.0);
    assert!((r.pose(500.0).unwrap().strength - 2.0).abs() < 1e-12);
    assert!(r.pose(100.001).unwrap().strength < 1e-8);
}
#[test]
fn area_resampling_preserves_flux() {
    let g = BoundaryGrid::new(16, 8, (0..128).map(|i| i as f64 * 0.01 - 0.4).collect()).unwrap();
    let r = g.resample(24, 12).unwrap();
    assert!((g.flux_integral() - r.flux_integral()).abs() < 1e-12);
    let f = g.solve(4, 2.5).unwrap();
    assert!((f.monopole_removed - g.flux_integral() / (4.0 * std::f64::consts::PI)).abs() < 1e-12);
}
#[test]
fn weighted_seed_ids_are_unique_deterministic_and_nonzero_field() {
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
    let a = weighted_seeds(&f, 42, 32, 256).unwrap();
    let b = weighted_seeds(&f, 42, 32, 256).unwrap();
    assert_eq!(a, b);
    let mut ids: Vec<_> = a.iter().map(|s| s.id).collect();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), 32);
    assert!(a.iter().map(|s| s.position[2].abs()).sum::<f64>() / 32.0 > 0.55);
}

#[test]
fn constant_boundary_removes_only_monopole_and_projection_reconstructs_dipole() {
    let constant = BoundaryGrid::new(32, 16, vec![2.0; 512]).unwrap();
    let field = constant.solve(8, 2.5).unwrap();
    assert!((field.monopole_removed - 2.0).abs() < 1e-12);
    assert!(field
        .coefficients
        .iter()
        .all(|c| c.cosine.abs() < 1e-12 && c.sine.abs() < 1e-12));
    let values = (0..128)
        .flat_map(|y| {
            let lo = -std::f64::consts::FRAC_PI_2 + y as f64 * std::f64::consts::PI / 128.0;
            let hi = lo + std::f64::consts::PI / 128.0;
            std::iter::repeat_n((lo.sin() + hi.sin()) / 2.0, 256)
        })
        .collect();
    let grid = BoundaryGrid::new(256, 128, values).unwrap();
    let f = grid.solve(4, 2.5).unwrap();
    let expected = (4.0 * std::f64::consts::PI / 3.0).sqrt();
    assert!((f.coefficients[0].cosine / expected - 1.0).abs() < 0.0002);
}
#[test]
fn stable_seed_pose_is_reversible() {
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
    let a = weighted_seeds(&f, 42, 16, 256).unwrap();
    let b = pose_seeds(&a, 86400.0).unwrap();
    let c = pose_seeds(&b, -86400.0).unwrap();
    for (a, c) in a.iter().zip(c) {
        assert_eq!(a.id, c.id);
        assert!(norm(add(a.position, scale(c.position, -1.0))) < 1e-12);
    }
}
