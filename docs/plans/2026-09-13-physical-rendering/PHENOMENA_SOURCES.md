# Giant-planet observation gallery: source and qualification record

Implemented as a selected-body observation gallery under RFC 0005 / SOL-VIS-007.
It shows five historical mission image products in their published source view.
They are **not** admitted as global sphere textures, current weather, calibrated
reflectance, height maps, wind fields, or magnetic emission geometry.

The browser loads one selected image at a time from the release's own origin,
checks its bounded byte length and SHA-256, and exposes source epoch, instrument,
spectral interpretation and coverage. A native selector supports keyboard use.
There is no automatic animation, source refresh, external request or engine mutation.
Source-page links open only when the user chooses them.

## Admitted observations

| Product | Observation epoch | Band / coverage | Official source |
|---|---|---|---|
| Jupiter northern aurora | 25 December 2023 | Webb NIRCam 3.36 µm F335M, assigned orange; three north-polar close-ups | [NASA Webb release, 12 May 2025](https://science.nasa.gov/missions/webb/nasas-webb-reveals-new-details-mysteries-in-jupiters-aurora/) |
| Jupiter cloud storm | 27 March 2017 | JunoCam visible image; published crop and color/contrast enhancement by Jason Major | [JPL PIA21387](https://www.jpl.nasa.gov/images/pia21387-jupiters-swirling-pearl-storm/) |
| Saturn north hexagon | 10 December 2012 sequence | Cassini ISS polar projection to approximately 70° N; assigned UV/visible/IR color | [JPL PIA17652](https://www.jpl.nasa.gov/images/pia17652-in-full-view-saturns-streaming-hexagon/) |
| Saturn south decagon | 29 August 2025 | Hubble F763M grayscale south-polar projection; central X explicitly preserves missing data | [NASA Hubble release, 2 September 2026](https://science.nasa.gov/missions/hubble/nasas-hubble-tracks-new-decagon-encircling-saturns-south-pole/) |
| Neptune mid-latitude aurora | June 2023 Webb observations; month precision | Hubble enhanced visible context + Webb NIRSpec infrared emission in cyan; published composite | [NASA Webb release, 26 March 2025](https://science.nasa.gov/missions/webb/nasas-webb-captures-neptunes-auroras-for-first-time/) |

The **north hexagon and south decagon are distinct features**. The new report does
not place a decagon at the north pole. The Cassini page includes an observed
cloud-flow movie assembled from eight frames across ten hours; SOL currently shows
the publisher's static JPG and links to that source sequence. It does not invent
motion from the still. Neptune's detected aurora is at geographic mid-latitudes;
the gallery does not relocate it into a terrestrial-style polar ring.

These records preserve source-date precision. Release dates are separate fields.
The Neptune reference names the Webb observation month only, rather than assigning
a fabricated exact timestamp or treating the context composite as simultaneous.
Single-view and polar-projection products need independently qualified camera,
body/magnetic coordinates, coverage and time registration before globe placement.

## Exact published bytes

All five images were acquired on 13 September 2026. The complete source URL,
retrieval timestamp, SHA-256, original credits and display dimensions are in
`apps/web/planet-phenomena.v1.json`. The JPL image CDN is admitted only for the
exact official page-linked `original_images/jpegPIA…jpg` endpoints. NASA's
`dynamicimage` service delivered its published display derivatives at the
dimensions recorded below. **SOL made no image transformations.**

| Local source image | Dimensions | Bytes | SHA-256 |
|---|---:|---:|---|
| jupiter-aurora.png | 960 × 323 | 270,228 | `80655afbc9ba71014239a654557c3b85a0dd86a5278412a8ea70d6f31f4c66be` |
| jupiter-storm.jpg | 1200 × 936 | 95,806 | `e370fb506da20f7b837f3a6791a235af0036a13d45be61abdd3d35d0ceb57fcf` |
| saturn-hexagon.jpg | 1024 × 1024 | 109,646 | `29b65d1370390fda5ff32ad0e73bfc774cd0c4755a237005031663a46facb452` |
| saturn-decagon.jpg | 640 × 640 | 18,597 | `8ffd2db3fc57418e02e08856c0f3c94988cb5026014f230a165e579f94295e0f` |
| neptune-aurora.png | 840 × 420 | 225,281 | `35f9142843b84daf7e45391e90e52ff8c8e3681e083c72d0e52eb014a27aa12b` |

Total: **719,558 bytes**, below the 1.5 MB gallery cap. Every individual source
is below 400,000 bytes. No SVG, GIF, automatic video, upscaling, interpolation,
recoloring, recropping, seam repair, image synthesis or 3-D wrapping is introduced.
Annotations, comparison panels and the south-pole missing-data mark remain intact.

## Reproduction and gates

Save the five exact source responses under their filenames in a local acquisition
directory. The preparation tool reads the committed qualification manifest, verifies
each input, copies the unchanged bytes and regenerates the browser manifest. It
performs no network access and requires no third-party Python dependency.

```powershell
python tools/prepare_planet_phenomena.py --source-root build/phenomena-sources-20260913 --out build/phenomena-replay-20260913
python tools/validate_planet_phenomena.py
python -m unittest discover -s tests/python -p test_planet_phenomena.py
node --test tests/web/planetPhenomena.test.mjs
node tools/planet_phenomena_validation.mjs
```

Preparation output must be a new directory below `build/`; an existing output is
rejected. Exit 0 means source preparation / gate passed, exit 1 means a rejected
source or output. Sources and operational artifacts stay in ignored `build/`;
only admitted display products and their provenance are included in the app.
Rollback consists of removing the gallery integration and optional assets; it does
not change physical simulation or stored scientific state.

The standard web build validates before staging and again against the staged copy.
Validation checks inventory, byte caps, hashes, image header dimensions, observation
versus publication dates, official source origin, required credits/coverage, generated
module parity, and fixed unqualified globe status. Historical trees without the
gallery runtime retain compatibility; a gallery runtime without its manifest fails.

The browser harness supports `--web-root=<staged-build>` and checks release hashes
before exercising the actual component. Current source-tree evidence:
**8 Python tests, 6 Node tests, 8 browser checks**. It decodes all five exact images,
checks source links/dimensions, verifies only local image requests, checks the 390 px
layout and 44 px native selection target, and verifies an unsupported body clears
the gallery. Evidence and isolated component screenshots are in
`coverage/planet-phenomena/`. These are component checks, not whole-app or deployed
product qualification; the parent implementation ledger records staged integration.

## Integration and lifetime

Import `renderPlanetPhenomena` from `js/planetPhenomena.js` and load
`planet-phenomena.css`. The host is an ordinary element. Call
`renderPlanetPhenomena(host, bodyName)` on selected-body change; call its returned
disposer before rendering another body or removing the host. Unsupported bodies
hide and clear the host. No module-level mutable state or window/document listeners
are installed. Each instance owns its selector, cancellation controller and object
URL; stale results are ignored and object URLs are revoked on selection or disposal.

A loading or failed image keeps the source explanation and source link usable.
Source-request timeout is 20 seconds and byte overflow cancels the stream. Image
decode dimensions must match the pinned source before the image becomes visible.
The default UI is static and therefore respects reduced-motion preferences.
