# Ephemeris server — high-precision tier (P7)

The optional **server tier** of the hybrid provider model
([SOLAR_SYSTEM_SPEC.md](../../docs/SOLAR_SYSTEM_SPEC.md) §2.1). It serves the **same
`ephemeris-snapshot.v3` contract** as the in-browser WASM engine, but sourced from **JPL
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
- `GET /v3/sky?unix=<sec>&lat=<deg>&lon=<deg east+>&elev=<m>` → `ephemeris-snapshot.v3`
- `GET /v1/sky?...` and `/v2/sky?...` → HTTP 409 with an explicit v3 upgrade explanation

Responses are cached on disk under `cache/` (keyed by exact floating-point epoch and observer), so the first call
for an instant is subject to the 20-second overall deadline; no current live latency is qualified. CORS is open
(`Access-Control-Allow-Origin: *`) so the static web app on another port can call it. Override
the URL the frontend uses with `window.SOL_EPHEMERIS_SERVER`. There is no default remote
endpoint; the user explicitly consents to sending the selected location/time to the displayed recipient.

## Contract notes

- Bodies and field names match the WASM engine's snapshot; `provider`/`accuracy` blocks mark
  the tier and source.
- Earth-orientation metadata is **explicitly degraded** — the server sources body coordinates
  from Horizons but does not independently ingest IERS EOP, so DUT1 and polar motion are
  marked degraded rather than presented as precision values.
- **Rise/transit/set times are `null` with not_calculated/unknown status and server source metadata** — the server returns instantaneous apparent positions only;
  the frontend may augment with a same-request on-device worker result. If the server is unreachable,
  the last validated snapshot remains visible and the user explicitly chooses local recovery.
- V3 ranges, event windows, calendar limits, evidence limitations and verification commands
  are specified in [EPHEMERIS_V3.md](../../docs/EPHEMERIS_V3.md). Source attribution is not
  independent accuracy qualification of every body/observer/epoch.

## Resource and privacy controls

The shared coordinator admits four active upstream jobs and eight queued exact request identities.
Each job issues its body queries serially, so at most four HTTP calls are active process-wide.
Duplicate identities (exact hexadecimal floats, not rounded location/time) share in-flight work.
One subscriber cancelling does not affect another. The final cancellation marks work abandoned;
queued abandoned entries keep their admission slot until drained to prevent an unbounded cancelled queue.

Queue residence counts toward the 20-second overall deadline. Individual calls have a cumulative
5-second deadline, a 1 MiB response cap, and one retry only for transient idempotent failures.
Subscriber waits are bounded even if an OS-level transport operation cannot be interrupted;
such a blocked operation retains a slot, never creates replacement threads. The HTTP listener
also caps concurrent connections at 32 with 10-second socket inactivity. Overload returns
HTTP 503 / `code: overload`; overall deadline returns HTTP 504 / `code: deadline`. Other upstream
failures return a redacted HTTP 502 / `code: upstream_failed`; no exception URL or location is echoed.
Disconnect detection and last-subscriber cancellation are cooperative between bounded reads.

This is not a public-service abuse-control or production TLS/authentication deployment guide.
Default bind remains loopback; broad remote deployment remains outside this local task.
The browser requires inline consent for the exact configured recipient (including health checks),
invalidates it on endpoint changes, supports revoke, and never silently falls back to local on failure.

Offline verification (no network required):

```text
python -m unittest discover -s services/ephemeris-server -p "test*.py"
```
