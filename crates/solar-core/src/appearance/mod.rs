//! Illustrative appearance only; normalized magnetic field and relative emission.
mod derived;
mod evolution;
mod field_lines;
mod hierarchy;
mod packet;
mod pfss;
mod raster;
mod surface;
mod transfer;
mod validation;
pub use derived::*;
pub use evolution::*;
pub use field_lines::*;
pub use hierarchy::*;
pub use packet::*;
pub use pfss::*;
pub use raster::*;
pub use surface::*;
pub use transfer::*;
pub use validation::*;
pub type Vec3 = [f64; 3];
pub fn dot(a: Vec3, b: Vec3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
pub fn norm(a: Vec3) -> f64 {
    dot(a, a).sqrt()
}
pub fn scale(a: Vec3, s: f64) -> Vec3 {
    [a[0] * s, a[1] * s, a[2] * s]
}
pub fn add(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
pub fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
pub fn direction(lat: f64, lon: f64) -> Vec3 {
    [lat.cos() * lon.cos(), lat.cos() * lon.sin(), lat.sin()]
}
