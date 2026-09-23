use super::*;
#[derive(Clone, Copy, Debug)]
pub struct TransferRay {
    pub origin: Vec3,
    pub direction: Vec3,
}
fn intersections(ray: TransferRay, radius: f64) -> Option<(f64, f64)> {
    let b = dot(ray.origin, ray.direction);
    let c = dot(ray.origin, ray.origin) - radius * radius;
    let discriminant = b * b - c;
    if discriminant < 0.0 {
        None
    } else {
        Some((-b - discriminant.sqrt(), -b + discriminant.sqrt()))
    }
}
/// CPU reference for a bounded shell, opaque unit photosphere, positive extinction.
/// Midpoint field samples; integrates from far boundary toward observer. Background
/// is the emitted intensity at the terminating boundary (photosphere or far shell).
pub fn integrate_transfer(
    ray: TransferRay,
    outer_radius: f64,
    background: f64,
    max_step: f64,
    max_steps: usize,
    field: impl Fn(Vec3) -> (f64, f64),
) -> Result<f64, &'static str> {
    if ray
        .origin
        .iter()
        .chain(ray.direction.iter())
        .any(|v| !v.is_finite())
        || (norm(ray.direction) - 1.0).abs() > 1e-8
        || norm(ray.origin) < 1.0
        || !outer_radius.is_finite()
        || !(1.01..=5.0).contains(&outer_radius)
        || !background.is_finite()
        || background < 0.0
        || !max_step.is_finite()
        || !(1e-6..=0.1).contains(&max_step)
        || !(1..=65536).contains(&max_steps)
    {
        return Err("transfer ray bounds");
    }
    let Some((entry, exit)) = intersections(ray, outer_radius) else {
        return Ok(background);
    };
    let begin = entry.max(0.0);
    let mut end = exit;
    if let Some((surface, _)) = intersections(ray, 1.0) {
        if surface >= begin {
            end = end.min(surface);
        }
    }
    if end <= begin {
        return Ok(background);
    }
    let count = ((end - begin) / max_step).ceil() as usize;
    if count > max_steps {
        return Err("transfer capacity");
    }
    let ds = (end - begin) / count as f64;
    let mut intensity = background;
    for i in (0..count).rev() {
        let point = add(
            ray.origin,
            scale(ray.direction, begin + (i as f64 + 0.5) * ds),
        );
        let (j, alpha) = field(point);
        intensity = transfer_segment(intensity, j, alpha, ds)?;
    }
    Ok(intensity)
}
