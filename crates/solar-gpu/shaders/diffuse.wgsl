// Placeholder WGSL kernel for spherical-grid diffusion.
@group(0) @binding(0) var<storage, read> br_current: array<f32>;
@group(0) @binding(1) var<storage, read_write> br_next: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // Implement laplacian stencil with polar boundary handling in v0.2.
}
