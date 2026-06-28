# GPU and NPU Backend Plan

## GPU path

Use `wgpu` first.

Target compute kernels:

- differential rotation advection
- meridional advection
- spherical diffusion
- bipolar source injection
- diagonal assimilation blend
- confidence decay
- continuum/EUV derivation
- observation reprojection

Backend targets:

- macOS: Metal through wgpu
- Windows: D3D12 through wgpu
- Linux: Vulkan through wgpu
- Browser: WebGPU

## NPU path

Do not run PDE kernels on the NPU. Use NPU/ML backends only for inference:

- active-region segmentation
- flare/CME surrogate scoring
- denoising/super-resolution as visualization-only enhancement

Abstraction:

```rust
enum MlBackend {
  CpuOnnx,
  CoreMl,
  DirectMl,
  WindowsMl,
  OpenVino,
  CudaTensorRt,
}
```

## Correctness rule

CPU reference is authoritative. GPU/NPU outputs must pass parity or confidence-gated promotion rules.
