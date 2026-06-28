// Placeholder WGSL kernel for latitude-dependent differential rotation.
// v0.2 task: implement semi-Lagrangian advection over br_current -> br_next.
@group(0) @binding(0) var<storage, read> br_current: array<f32>;
@group(0) @binding(1) var<storage, read_write> br_next: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // Implement in v0.2 using grid uniforms and interpolation.
}
