# Instructions — running & developing Sol

Practical commands for the web app and its data. Paths are relative to the repo root
(`C:\Users\mkang\Documents\Sol` on the current machine — note the session working dir
`C:\Users\mkang\.claude\Sol` is **not** the project).

## Prerequisites

- **Python 3** — required for the data generators and validators (standard library only).
- **A browser** — to run the app.
- **Rust/cargo** — optional, only for the engine crates. *Not installed on this machine*, so
  the Python generators are the supported path here.
- **Node** — *not installed*; only needed if/when the migration adds a typecheck/build step.

## Run the web app

```bash
# Recommended: serve so the browser can fetch data/*.json
python -m http.server 8000 --directory apps/web
# open http://localhost:8000
```

You can also open `apps/web/index.html` directly from disk; it falls back to a built-in
state if it can't fetch `data/`.

Notes:
- `index.html` cache-busts CSS/JS with `?v=NN`. **Bump that number** when you change
  `styles.css` or `app.js` so browsers reload them.
- The app needs **no build step** — edit `apps/web/{index.html,app.js,styles.css}` and reload.

## Regenerate the data the app reads

```bash
# 1) Live "today" snapshot (deterministic; stdlib only)
python tools/generate_fixture_snapshot.py \
  --out apps/web/data/latest-state.json \
  --observations-out tests/fixtures/live-swpc-normalized.json --seed 42

# 2) Solar-cycle series (drives the timeline scrubber + butterfly diagram)
python tools/generate_series.py            # writes apps/web/data/series/frame-*.json + manifest.json
#   useful flags: --frames N --seed S --lon-count 36 --lat-count 18

# 3) Optional: pull bounded public data into a local cache first, then regenerate
python tools/fetch_public_data.py --cache .cache/solar-data
python tools/generate_fixture_snapshot.py --cache .cache/solar-data \
  --out apps/web/data/latest-state.json \
  --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
```

## Validate (run these before committing)

```bash
python tools/validate_snapshot.py apps/web/data/latest-state.json
python tools/validate_operational_readiness.py apps/web/data/latest-state.json
python tools/validate_web_static.py --root apps/web
# every series frame should also validate:
for f in apps/web/data/series/frame-*.json; do python tools/validate_snapshot.py "$f"; done
```

`validate_web_static.py` checks required element IDs, that referenced assets exist, that the
responsive breakpoint is present, and that the research panel is closed by default. **If you
add/rename a required DOM id, update `REQUIRED_IDS` in that file.**

## Rust engine (only with a local toolchain)

```bash
cargo test --workspace
cargo run -p solar-cli -- simulate --steps 48 --dt-hours 1 --seed 42 \
  --out apps/web/data/latest-state.json
cargo run -p solar-cli -- replay --snapshot apps/web/data/latest-state.json --out apps/web/data
```

## Verifying changes in the browser (what "done" looks like)

- **Today** shows the real Sun above the fold, the stage rail, one plain sentence; dense
  panels hidden.
- **Explore** reveals layer toggles, metric grid (with `?` glossary), the region inspector;
  clicking a marker selects it.
- **Space Weather** shows the SWPC signal chips (with glossary).
- **Research** opens the equations/provenance/readiness panel and the adapter-node overlay.
- **Timeline** (scroll to the butterfly): Play animates the cycle; the disk goes synthetic
  and is labelled; **Now** restores the live SDO image; the butterfly wings migrate to the
  equator.
- Tour: clears via Skip/Done/Esc; replay with the CTA. (Reset with
  `localStorage.removeItem('sol-tour-seen')` in the console.)

## Conventions

- No frameworks, no bundler, no runtime dependencies in `apps/web`.
- Render via `textContent` / DOM APIs — never `innerHTML` with data.
- The JSON snapshot contract is the boundary between engine and UI; the UI only consumes it
  and must not compute physical values. Keep `operational_use`/`space_weather_operational`
  `false` and preserve layer-kind labels.
- Commit messages end with the `Co-Authored-By` trailer used across this branch.
