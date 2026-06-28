# SWPC SCN 26-21 Integration Notes

Source: NWS Service Change Notice 26-21, `scn26-21_Data_Format_Changes_Impacting_SWPC_Products.pdf`.

## Why this matters

The assimilation layer consumes SWPC JSON products for activity indices, solar-wind context, and flare/space-weather validation. SCN 26-21 changes several JSON products and removes older Real-Time Solar Wind (RTSW) endpoints. Without schema-tolerant adapters, ingestion can fail silently or misparse numbers as strings.

## Effective date: on/about 2026-03-31

The following SWPC products are restructured:

| Product | Required ingest behavior |
|---|---|
| `/products/kyoto-dst.json` | Accept standard JSON object records with explicit key-value pairs. |
| `/products/summary/10cm-flux.json` | Expect standard JSON array wrapping. Values other than `time_tag` are numeric. |
| `/products/10cm-flux-30-day.json` | Accept standard JSON object records. Values other than `time_tag` are numeric. |
| `/products/noaa-planetary-k-index.json` | Accept standard JSON object records. Values other than `time_tag` are numeric. |
| `/products/summary/solar-wind-mag-field.json` | Expect standard JSON array wrapping. Values other than `time_tag` are numeric. |
| `/products/summary/solar-wind-speed.json` | Expect standard JSON array wrapping. Values other than `time_tag` are numeric. |
| `/products/noaa-planetary-k-index-forecast.json` | Accept standard JSON object records. Values other than `time_tag` are numeric. |

Adapter rule:

```text
Do not assume the first array element is a header row.
Do not assume numeric fields are quoted strings.
Do accept both legacy quoted strings and new numeric floats during migration tests.
```

## Effective date: on/about 2026-04-30

The following deprecated RTSW endpoints are removed:

```text
/products/solar-wind/mag-1-day.json
/products/solar-wind/mag-2-hour.json
/products/solar-wind/mag-3-day.json
/products/solar-wind/mag-5-minute.json
/products/solar-wind/mag-6-hour.json
/products/solar-wind/mag-7-day.json
/products/solar-wind/plasma-1-day.json
/products/solar-wind/plasma-2-hour.json
/products/solar-wind/plasma-3-day.json
/products/solar-wind/plasma-5-minute.json
/products/solar-wind/plasma-6-hour.json
/products/solar-wind/plasma-7-day.json
/products/solar-wind/ephemerides.json
```

Use the replacement products:

```text
/json/rtsw/rtsw_ephemerides_1h.json
/json/rtsw/rtsw_mag_1m.json
/json/rtsw/rtsw_wind_1m.json
```

## Replacement RTSW metadata

The replacement RTSW products include:

| Field | Meaning |
|---|---|
| `source` | Satellite that produced the data. |
| `active` | Whether SWPC forecasters considered that satellite active at that time. |

Assimilation rule:

```text
Preserve source and active in ObservationFrame.provenance.
Prefer active=true when generating the operational solar-wind context.
Keep inactive source rows for diagnostics and cross-source comparison.
```

## Field mapping

### RTSW plasma/wind

| Deprecated field | Replacement field |
|---|---|
| `time_tag` | `time_tag` |
| `density` | `proton_density` |
| `speed` | `proton_speed` |
| `temperature` | `proton_temperature` |

### RTSW magnetometer

| Deprecated field | Replacement field |
|---|---|
| `time_tag` | `time_tag` |
| `bx_gsm` | `bx_gsm` |
| `by_gsm` | `by_gsm` |
| `bz_gsm` | `bz_gsm` |
| `bt` | `bt` |
| `lon_gsm` | `phi_gsm` |
| `lat_gsm` | `theta_bsm` |

Implementation note: the notice uses `theta_bsm`. If live data exposes `theta_gsm` as a corrected/alternate field, normalize both to an internal `theta` concept but retain the raw field in provenance.

## 3-day and 7-day retention

The replacement magnetometer and solar-wind products contain the old 1-day, 2-hour, 5-minute, and 6-hour timeframes. For 3-day and 7-day history, retrieve and retain the 1-day file locally.

Recommended retention strategy:

```text
poll rtsw_mag_1m.json and rtsw_wind_1m.json
append active=true records to local parquet/sqlite history
retain at least 8 days if 7-day UI windows are required
materialize 2-hour, 6-hour, 1-day, 3-day, 7-day windows from local storage
```

## Adapter acceptance tests

The ingest layer must pass these cases:

1. Numeric value as quoted string parses to float.
2. Numeric value as JSON number parses to float.
3. Old header-row array shape is either normalized or rejected with a clear schema error.
4. New object-array shape is normalized.
5. Deprecated `plasma-*` endpoints map to `rtsw_wind_1m.json`.
6. Deprecated `mag-*` endpoints map to `rtsw_mag_1m.json`.
7. Deprecated `ephemerides.json` maps to `rtsw_ephemerides_1h.json`.
8. `source` and `active` are preserved in observation provenance.
9. 3-day and 7-day requests use local retention, not removed endpoints.
