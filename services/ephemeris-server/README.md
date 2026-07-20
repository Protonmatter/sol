# Ephemeris server — high-precision tier (P7)

The optional **server tier** of the hybrid provider model
([SOLAR_SYSTEM_SPEC.md](../../docs/SOLAR_SYSTEM_SPEC.md) §2.1). It serves the **same
`ephemeris-snapshot.v2` contract** as the in-browser WASM engine, but sourced from **JPL
Horizons (DE441)** — the definitive numerically-integrated ephemeris. The on-device WASM
engine (VSOP2013 + ELP-MPP02) stays the offline default; the web app escalates here only when
you ask for definitive precision (the **"High-precision (DE441)"** toggle in *My Sky*).

## Why Horizons instead of bundled DE440/DE441 kernels

The DE kernels are 0.1–3 GB and need a SPICE reader. Horizons runs DE441 and is the source
this project already validates against, so it is the lightest way to expose a definitive tier.
`definitive_positions()` is the **provider seam** — a local SPICE / DE440 kernel reader can
replace it without changing the HTTP contract.

## Run (stdlib Python only — no pip)

```bash
python services/ephemeris-server/server.py --host 127.0.0.1 --port 8787
```

`--host` / `--port` also read the `EPHEM_HOST` / `EPHEM_PORT` environment variables
(defaults `127.0.0.1` and `8787`). The only external requirement is **outbound HTTPS to
`ssd.jpl.nasa.gov`** (JPL Horizons); there are no Python dependencies and no kernel files
to download.

- `GET /health` → `{ "status": "ok", "provider": "horizons-de441", ... }`
- `GET /v2/sky?unix=<sec>&lat=<deg>&lon=<deg east+>&elev=<m>` → `ephemeris-snapshot.v2`
- `GET /v1/sky?...` → compatibility alias; the response is still schema **v2**

Responses are cached on disk under `cache/` (keyed by minute + observer), so the first call
for an instant takes ~3 s (throttled Horizons queries) and repeats are instant. CORS is open
(`Access-Control-Allow-Origin: *`) so the static web app on another port can call it. Override
the URL the frontend uses with `window.SOL_EPHEMERIS_SERVER` (default `http://localhost:8787`).

## Contract notes

- Bodies and field names match the WASM engine's snapshot; `provider`/`accuracy` blocks mark
  the tier and source.
- Earth-orientation metadata is **explicitly degraded** — the server sources body coordinates
  from Horizons but does not independently ingest IERS EOP, so DUT1 and polar motion are
  marked degraded rather than presented as precision values.
- **Rise/transit/set are `null`** — the server returns instantaneous apparent positions only;
  the frontend keeps using the on-device engine for rise/set, and the UI degrades gracefully
  if the server is unreachable.
- Verified: server (DE441) and the on-device engine agree to **≤ 11.3″** (the WASM engine's
  own validated residual vs Horizons).
