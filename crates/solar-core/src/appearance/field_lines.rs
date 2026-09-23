use super::*;
#[derive(Debug)]
pub struct Trace {
    pub points: Vec<Vec3>,
    pub termination: &'static str,
}
fn velocity(f: &FieldSolution, p: Vec3, sign: f64) -> Option<Vec3> {
    let b = f.field(p);
    let n = norm(b);
    if !n.is_finite() || n < 1e-10 {
        None
    } else {
        Some(scale(b, sign / n))
    }
}
fn rk4(f: &FieldSolution, p: Vec3, h: f64, sign: f64) -> Option<Vec3> {
    let a = velocity(f, p, sign)?;
    let b = velocity(f, add(p, scale(a, h / 2.0)), sign)?;
    let c = velocity(f, add(p, scale(b, h / 2.0)), sign)?;
    let d = velocity(f, add(p, scale(c, h)), sign)?;
    Some(add(
        p,
        scale(add(add(a, scale(b, 2.0)), add(scale(c, 2.0), d)), h / 6.0),
    ))
}
pub fn trace(
    f: &FieldSolution,
    start: Vec3,
    sign: f64,
    budget: usize,
) -> Result<Trace, &'static str> {
    if start.iter().any(|x| !x.is_finite())
        || norm(start) <= 1.0
        || norm(start) >= f.source_surface
        || !(sign == 1.0 || sign == -1.0)
        || !(1..=4096).contains(&budget)
    {
        return Err("trace bounds");
    }
    let mut points = vec![start];
    let mut h = 0.01;
    let mut p = start;
    let mut termination = "budget";
    for _ in 0..budget {
        let mut accepted = None;
        for _ in 0..12 {
            let Some(full) = rk4(f, p, h, sign) else {
                termination = "weak_field";
                break;
            };
            let Some(half) = rk4(f, p, h / 2.0, sign).and_then(|x| rk4(f, x, h / 2.0, sign)) else {
                termination = "weak_field";
                break;
            };
            let error = norm(add(full, scale(half, -1.0))) / 15.0;
            if error <= 1e-5 {
                accepted = Some(half);
                if error < 1e-6 {
                    h = (h * 1.5_f64).min(0.02);
                }
                break;
            }
            if h <= 1e-4 {
                termination = "tolerance";
                break;
            }
            h = (h / 2.0).max(1e-4);
        }
        let Some(next) = accepted else {
            break;
        };
        let radius = norm(next);
        if radius <= 1.0 || radius >= f.source_surface {
            let target = if radius <= 1.0 { 1.0 } else { f.source_surface };
            let d = add(next, scale(p, -1.0));
            let a = dot(d, d);
            let b = 2.0 * dot(p, d);
            let c = dot(p, p) - target * target;
            let disc = (b * b - 4.0 * a * c).max(0.0).sqrt();
            let roots = [(-b - disc) / (2.0 * a), (-b + disc) / (2.0 * a)];
            let t = roots
                .into_iter()
                .find(|t| (0.0..=1.0).contains(t))
                .unwrap_or(1.0);
            points.push(add(p, scale(d, t)));
            termination = if target == 1.0 {
                "surface"
            } else {
                "source_surface"
            };
            break;
        }
        p = next;
        points.push(p);
    }
    Ok(Trace {
        points,
        termination,
    })
}
