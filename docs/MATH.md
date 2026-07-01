# Mathematical Model

## Differential rotation

```text
Ω(λ) = A + B sin²(λ) + C sin⁴(λ)
```

v0.1 constants:

```text
A = 14.713 deg/day
B = -2.396 deg/day
C = -1.787 deg/day
```

## Bipolar magnetic region

```text
S_i(λ,φ) = Φ_i [G(λ-λ⁺,φ-φ⁺) - G(λ-λ⁻,φ-φ⁻)]
G(x,y) = exp(-(x²+y²)/(2σ²))
```

## Surface flux transport

```text
∂B_r/∂t =
  -Ω(θ)∂B_r/∂φ
  -1/(R⊙ sinθ) ∂[v(θ) B_r sinθ]/∂θ
  +η_h∇²_s B_r
  +S
  -B_r/τ
```

> **v0.1 implements a reduced form of this equation** (matching `docs/SPEC.md` §"v0.1 implements"):
> the differential-rotation shear (−Ω ∂B_r/∂φ), diffusion, source injection, and decay. The
> **meridional-circulation term** (−1/(R⊙ sinθ)·∂[v B_r sinθ]/∂θ) is **not yet built**, and the
> implemented rotation/diffusion use a flat lat–lon stencil — the sinθ / spherical-metric factors are
> absorbed into the tuned coefficients rather than applied explicitly, so `∇²_s` here is that reduced
> operator, not the exact surface Laplacian. See `crates/solar-core/src/flux_transport.rs`.

## Continuum proxy

```text
spot = smoothstep(B_spot, B_max, |B_r|)
facula = smoothstep(B_facula_min, B_facula_max, |B_r|)
I = clamp(1 - 0.72 spot + 0.08 facula, 0.05, 1.25)
```

## Assimilation

```text
K = P_f / (P_f + R)
x_a = x_f + K(y - x_f)
P_a = (1-K)P_f
```

Use source freshness to attenuate K.
