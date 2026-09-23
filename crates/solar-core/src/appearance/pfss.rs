use super::*;
use std::f64::consts::PI;
#[derive(Clone, Debug)]
pub struct Harmonic {
    pub l: usize,
    pub m: usize,
    pub cosine: f64,
    pub sine: f64,
}
#[derive(Clone, Debug)]
pub struct FieldSolution {
    pub source_surface: f64,
    pub coefficients: Vec<Harmonic>,
    pub monopole_removed: f64,
}
/// Real orthonormal harmonics, Condon-Shortley phase, west-positive longitude.
pub fn harmonic(l: usize, m: usize, p: Vec3) -> (f64, f64) {
    let r = norm(p);
    let z = (p[2] / r).clamp(-1.0, 1.0);
    let phi = p[1].atan2(p[0]);
    let mut v = 1.0;
    for k in 1..=m {
        v *= -((2 * k - 1) as f64) * (1.0 - z * z).sqrt();
    }
    if l > m {
        let mut prev = v;
        v *= z * (2 * m + 1) as f64;
        for n in m + 2..=l {
            let next = ((2 * n - 1) as f64 * z * v - (n + m - 1) as f64 * prev) / (n - m) as f64;
            prev = v;
            v = next;
        }
    }
    let mut ratio = 1.0;
    for k in l - m + 1..=l + m {
        ratio /= k as f64;
    }
    let n = ((2 * l + 1) as f64 / (4.0 * PI) * ratio * if m == 0 { 1.0 } else { 2.0 }).sqrt();
    (
        n * v * (m as f64 * phi).cos(),
        n * v * (m as f64 * phi).sin(),
    )
}
/// Triangular normalized associated Legendre table; O(L^2), including sqrt(2) for m>0.
fn legendre_table(lmax: usize, z: f64) -> Vec<f64> {
    let mut raw = vec![0.0; (lmax + 1) * (lmax + 2) / 2];
    raw[0] = 1.0;
    let st = (1.0 - z * z).max(0.0).sqrt();
    for m in 0..=lmax {
        let idx = m * (m + 1) / 2 + m;
        if m > 0 {
            raw[idx] = -((2 * m - 1) as f64) * st * raw[(m - 1) * m / 2 + m - 1];
        }
        if m < lmax {
            raw[(m + 1) * (m + 2) / 2 + m] = z * (2 * m + 1) as f64 * raw[idx];
        }
        for l in m + 2..=lmax {
            raw[l * (l + 1) / 2 + m] = ((2 * l - 1) as f64 * z * raw[(l - 1) * l / 2 + m]
                - (l + m - 1) as f64 * raw[(l - 2) * (l - 1) / 2 + m])
                / (l - m) as f64;
        }
    }
    for l in 0..=lmax {
        let mut normalization = ((2 * l + 1) as f64 / (4.0 * PI)).sqrt();
        for m in 0..=l {
            if m > 0 {
                normalization /= (((l - m + 1) * (l + m)) as f64).sqrt();
            }
            raw[l * (l + 1) / 2 + m] *= normalization * if m == 0 { 1.0 } else { 2.0_f64.sqrt() };
        }
    }
    raw
}
impl FieldSolution {
    pub fn new(source_surface: f64, coefficients: Vec<Harmonic>) -> Result<Self, &'static str> {
        if !source_surface.is_finite()
            || !(1.1..=5.0).contains(&source_surface)
            || coefficients.len() > 2144
            || coefficients.iter().any(|c| {
                c.l == 0 || c.l > 64 || c.m > c.l || !c.cosine.is_finite() || !c.sine.is_finite()
            })
        {
            return Err("PFSS bounds");
        }
        Ok(Self {
            source_surface,
            coefficients,
            monopole_removed: 0.0,
        })
    }
    pub fn potential(&self, p: Vec3) -> f64 {
        let r = norm(p);
        self.coefficients
            .iter()
            .map(|c| {
                let l = c.l as i32;
                let q = self.source_surface.powi(-(2 * l + 1));
                let radial = -(q * r.powi(l) - r.powi(-l - 1)) / (l as f64 * q + (l + 1) as f64);
                let (yc, ys) = harmonic(c.l, c.m, p);
                radial * (c.cosine * yc + c.sine * ys)
            })
            .sum()
    }
    /// Analytic spherical derivatives away from the poles; Cartesian potential
    /// differences at the polar axis avoid division by sin(theta).
    pub fn field(&self, p: Vec3) -> Vec3 {
        let r = norm(p);
        let z = p[2] / r;
        let st = (1.0 - z * z).max(0.0).sqrt();
        if st < 1e-6 {
            let h = 2e-5;
            return [0, 1, 2].map(|i| {
                let mut a = p;
                let mut b = p;
                a[i] += h;
                b[i] -= h;
                -(self.potential(a) - self.potential(b)) / (2.0 * h)
            });
        }
        let phi = p[1].atan2(p[0]);
        let lmax = self.coefficients.iter().map(|c| c.l).max().unwrap_or(0);
        let table = legendre_table(lmax, z);
        let (mut br, mut bt, mut bp) = (0.0, 0.0, 0.0);
        for c in &self.coefficients {
            let l = c.l;
            let m = c.m;
            let lf = l as f64;
            let q = self.source_surface.powi(-((2 * l + 1) as i32));
            let denominator = lf * q + lf + 1.0;
            let radial = (r.powi(-((l + 1) as i32)) - q * r.powi(l as i32)) / denominator;
            let derivative = (-(lf + 1.0) * r.powi(-((l + 2) as i32))
                - lf * q * r.powi(l as i32 - 1))
                / denominator;
            let (sn, cs) = (m as f64 * phi).sin_cos();
            let amplitude = c.cosine * cs + c.sine * sn;
            let n = table[l * (l + 1) / 2 + m];
            let prev = if l > m {
                table[(l - 1) * l / 2 + m]
                    * (((2 * l + 1) as f64 / (2 * l - 1) as f64)
                        * ((l - m) as f64 / (l + m) as f64))
                        .sqrt()
            } else {
                0.0
            };
            let dt = (lf * z * n - (l + m) as f64 * prev) / st;
            br -= derivative * n * amplitude;
            bt -= radial / r * dt * amplitude;
            bp -= radial / r * n * m as f64 * (-c.cosine * sn + c.sine * cs) / st;
        }
        let (sn, cs) = phi.sin_cos();
        [
            br * st * cs + bt * z * cs - bp * sn,
            br * st * sn + bt * z * sn + bp * cs,
            br * z - bt * st,
        ]
    }
}
/// Gauss-Legendre x longitude quadrature; weights integrate exact surface area.
pub fn solve_pfss(
    boundary: impl Fn(Vec3) -> f64,
    lmax: usize,
    rss: f64,
) -> Result<FieldSolution, &'static str> {
    if !(1..=64).contains(&lmax) {
        return Err("lmax");
    }
    let n = 2 * lmax + 4;
    let nphi = 4 * lmax + 8;
    let mut samples = Vec::new();
    let mut mean = 0.0;
    for i in 0..n {
        let mut z = (PI * (i as f64 + 0.75) / (n as f64 + 0.5)).cos();
        let mut derivative = 0.0;
        for _ in 0..20 {
            let (mut p0, mut p1) = (1.0, z);
            for k in 2..=n {
                let p = ((2 * k - 1) as f64 * z * p1 - (k - 1) as f64 * p0) / k as f64;
                p0 = p1;
                p1 = p;
            }
            derivative = n as f64 * (z * p1 - p0) / (z * z - 1.0);
            let dz = p1 / derivative;
            z -= dz;
            if dz.abs() < 1e-14 {
                break;
            }
        }
        let w = 2.0 / ((1.0 - z * z) * derivative * derivative) * 2.0 * PI / nphi as f64;
        for j in 0..nphi {
            let p = direction(z.asin(), 2.0 * PI * j as f64 / nphi as f64);
            let b = boundary(p);
            if !b.is_finite() {
                return Err("boundary nonfinite");
            }
            mean += w * b;
            samples.push((p, b, w));
        }
    }
    mean /= 4.0 * PI;
    let mut coeff = Vec::new();
    for l in 1..=lmax {
        for m in 0..=l {
            let (mut cosine, mut sine) = (0.0, 0.0);
            for (p, b, w) in &samples {
                let (yc, ys) = harmonic(l, m, *p);
                cosine += w * (b - mean) * yc;
                sine += w * (b - mean) * ys;
            }
            coeff.push(Harmonic { l, m, cosine, sine });
        }
    }
    let mut result = FieldSolution::new(rss, coeff)?;
    result.monopole_removed = mean;
    Ok(result)
}
