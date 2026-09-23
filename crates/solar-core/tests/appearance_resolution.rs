//! Independent spherical area quadrature for compact attachment kernels.
use solar_core::appearance::{add, direction, dot, scale};
use std::f64::consts::{FRAC_PI_2, PI};
fn integral(width: usize, height: usize, core: [f64; 3], sigma: f64) -> f64 {
    let dlat = PI / height as f64;
    let dlon = 2.0 * PI / width as f64;
    let longitude = (0..width)
        .map(|x| ((x as f64 + 0.5) * dlon).sin_cos())
        .collect::<Vec<_>>();
    let mut total = 0.0;
    for y in 0..height {
        let lo = -FRAC_PI_2 + y as f64 * dlat;
        let hi = lo + dlat;
        let mid = (lo + hi) / 2.0;
        let (sn, cs) = mid.sin_cos();
        let area = dlon * (hi.sin() - lo.sin());
        for (s, c) in &longitude {
            let p = [cs * c, cs * s, sn];
            let delta = add(p, scale(core, -1.0));
            let d2 = dot(delta, delta);
            if d2 > 144.0 * sigma * sigma {
                continue;
            }
            let value = (-0.5 * d2 / (sigma * sigma)).exp() as f32;
            total += f64::from(value) * area;
        }
    }
    total
}
#[test]
#[ignore = "offline finite-grid resolution qualification; run release explicitly"]
fn compact_core_spherical_integrals_across_phase_and_latitude() {
    let sigma = 0.0035;
    let exact = 2.0 * PI * sigma * sigma * (-(-2.0 / (sigma * sigma)).exp_m1());
    let mut coarse_error: f64 = 0.0;
    let mut fine_nonpolar_error: f64 = 0.0;
    for (width, height) in [(512, 256), (2048, 1024)] {
        for nominal in [0.0_f64, 45.0, 75.0, 89.5, 90.0] {
            for phase in [0.0, 0.5] {
                let dlat = PI / height as f64;
                let row = ((nominal.to_radians() + FRAC_PI_2) / dlat)
                    .floor()
                    .min(height as f64 - 1.0);
                let latitude = (-FRAC_PI_2 + (row + 0.5 + phase) * dlat).min(FRAC_PI_2);
                let longitude = (0.5 + phase) * 2.0 * PI / width as f64;
                let measured = integral(width, height, direction(latitude, longitude), sigma);
                let ratio = measured / exact;
                let error = (ratio - 1.0).abs();
                println!("CORE_RESOLUTION width={width} height={height} nominal_lat={nominal} actual_lat={} phase={phase} integral={measured:.12e} exact={exact:.12e} ratio={ratio:.12}",latitude.to_degrees());
                if width == 512 {
                    coarse_error = coarse_error.max(error);
                }
                if width == 2048 && nominal <= 75.0 {
                    fine_nonpolar_error = fine_nonpolar_error.max(error);
                    assert!(error < 1e-4, "nonpolar 2048 integral {ratio}");
                }
            }
        }
    }
    assert!(coarse_error > 0.1, "coarse phase test must expose aliasing");
    println!("CORE_RESOLUTION max512error={coarse_error} max2048nonpolarerror={fine_nonpolar_error}; polar rows remain separately quantified, not blanket-qualified");
}
