# Visible ring occultation candidate: HST proposal 5824

**Admission remains held.** The bounded 2026-09-14 follow-up identified accessible,
visible-sensitive observations with exact archive identities. It did not produce
an admitted radial optical-depth profile or independently determine unresolved
coverage and within-material optical depth. No runtime material or binary asset
was added. This follows the [advanced-material admission assessment](ADVANCED_MATERIALS_EVIDENCE.md#bounded-source-admission-assessment);
the [acquisition record](MATERIAL_SOURCE_ACQUISITION.json) preserves both the earlier
failed requests and the separate follow-up.

## Candidate and scientific scope

[MAST proposal 5824](https://archive.stsci.edu/proposal_search.php?id=5824&mission=hst)
contains FOS/RD observations of GSC5249-01240 during the November 1995 Saturn
occultation, including G650L exposures Y2ZY0306R, Y2ZY0307T, Y2ZY0308R and Y2ZY0309T
on November 21 and separate November 16 stellar observations. This assessment
inspected Y2ZY0308R only; it does not assign that exposure to a particular ring.

The [exposure preview](https://archive.stsci.edu/cgi-bin/mastpreview?mission=hst&dataid=Y2ZY0308R)
and actual science-file header identify rapid readout, the AMBER detector and L65
grating, 512 channels by 8,617 samples, a start at 1995-11-21 07:19:44 UTC, and
2,153.576660156 seconds of recorded exposure. The actual C1 header is `FILETYPE=FLX`
but **`BUNIT=COUNTS/S` and `FLX_CORR=SKIPPED`**. Count-rate conversion, scattered-light
correction, wavelength-scale generation and propagated-error computation are
marked complete. The complete PDQ product reports quality OK and no apparent
problems; this is observation-level quality, not a per-channel scientific mask.

The [FOS Instrument Handbook v6](https://stecf-poa.stsci.edu/poa/pdf/FOS_IHv60.pdf),
Table 1-3, documents visible-sensitive G650L operation with the WG375 filter.
Its red-detector tabulation lists 3540–7075 Å at specified diode limits. These
nominal values do not replace the exposure's wavelength array, response function,
channel selection or quality flags. The wider numerical wavelength extent in
the preview header is not an admitted passband or RGB integration domain.

## Exact acquisition and integrity boundary

The [public product directory](https://archive.stsci.edu/missions/hst/public/y2zy/y2zy0308r/)
lists science, wavelength, error, quality, raw and support products. At
2026-09-14T04:07:01 UTC, a bounded Range request for the C1 science product returned
HTTP **206**, `Content-Range: bytes 0-65535/20715840`. Only that 65,536-byte prefix was
retained. Its SHA-256 is **not a checksum of the complete 20,715,840-byte file**.

| Acquired object | Scope | SHA-256 |
| --- | --- | --- |
| `y2zy0308r_c1f.fits.prefix` | First 65,536 bytes only, including inspected primary header | `a6070df96914c0c319dab5306ac6375c9bfcad831fcc4356fe95184790e1a984` |
| `y2zy0308r_pdq.fits` | Complete 17,280-byte quality product, HTTP 200 | `bb39815658b7b2ee87fb8cb49514aeed4e3c8afec14bbbeca468181c1c505a24` |
| `manifest.json` | Local receipt-set manifest | `86ce09016534e4acd0987de7859ed3b36a13f7480b94a936aa0932027761bf6c` |

The local ignored receipt directory is
`build/ring-visible-source-assessment-20260914` in the isolated qualification
checkout. It contains 15 bounded responses totaling 1,193,617 retained bytes,
including the handbook and a failed NASA ADS HTTP 405 response. Original response
sizes and checksums, the FITS header assertions and the prior assessment's input
documentation hashes were verified locally. No complete science-array integrity
or scientific profile reduction is claimed. The assessed main source was
`59ecf497065f426faa42bc4dd5e28bada6ce899a`.

## Historical access failure and current observations

The original EBROCC archive request at 2026-09-14T02:39:58 UTC returned HTTP 403.
That historical receipt is retained unchanged in substance. A later **directory**
GET at 04:03:14 UTC returned HTTP 200; it was a different endpoint and does not
prove that the archive download succeeds. The browsing tool separately continued
to report 403 for the directory. Tool observations and direct downloaded bytes
are recorded separately, without inventing raw response bytes for tool failures.

The current NASA catalog reads resolve part of the earlier band uncertainty:
[ESO 1 m](https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=ESO1M-SR-APPH-4-OCC-V1.0)
and [ESO 2.2 m](https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=ESO22M-SR-APPH-4-OCC-V1.0)
were observed at 3.4 µm. [Lick](https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=LICK1M-SR-CCDC-4-OCC-V1.0)
used RG-9 centered at 0.9 µm with FWHM 0.25 µm. These entries do not admit visible
RGB calibration. Other EBROCC instruments were not individually qualified here.

## Required work before any source admission

The HST count-rate observations could support a separately scoped reduction:
complete exposure/wavelength/error/quality arrays, appropriate stellar and ring
background references, calibration versions, and published normalization must
be acquired and checked. Skipped absolute flux calibration does not alone rule
out normalized transmission, but the necessary reference cancellation and residual
uncertainties have not been demonstrated here.

Time-to-ring-radius, longitude, opening angle and reference-frame geometry must
be reproduced, with radial coverage, time gaps, spatial resolution and saturated
samples preserved. A star's J2000 coordinates are not ring-intercept geometry.
The resulting band-specific profile then needs an independent scientific comparison.

Even a valid effective normal-optical-depth profile would not independently
identify unresolved coverage and depth within occupied subregions. No such
identifiability is claimed, and no depth is derived from average display opacity.
Separate constraints and uncertainty are required for that decomposition and for
reflected-light scattering. The current ring color, opacity and shadow remain
explicit display recipes; the candidate does not qualify global RGB transport.
