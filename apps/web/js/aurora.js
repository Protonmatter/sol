// "Will I see the aurora tonight?" — the one question that needs BOTH halves of this app:
// the space-weather signals (Kp) and the observer's location (My Sky). Pure module, no DOM.
//
// ACCURACY — this is an honest approximation, labelled as such in the UI:
//   • Geomagnetic latitude uses the IGRF centred-dipole pole (epoch 2025: 80.7°N, 72.7°W),
//     not corrected-geomagnetic coordinates — good to a couple of degrees at mid-latitudes.
//   • The oval's equatorward edge uses the standard midnight-sector fit λ ≈ 66.5° − 2.04°·Kp
//     (the same family of approximation behind the familiar "Kp visibility line" maps).
//   • "Low on the horizon" extends ~5° equatorward of the overhead band: aurora at the oval's
//     edge stands hundreds of km high and is visible well south of where it is overhead.
//   • Kp is a 3-hour GLOBAL index from the snapshot's observed context — it says whether the
//     oval reaches you, not whether tonight's sky is clear or dark. The darkness caveat uses
//     a low-precision solar altitude (±0.5°, plenty for "is it dark").

const D2R = Math.PI / 180;

// IGRF-13 centred-dipole north pole, epoch 2025. The dipole drifts ~0.1°/yr; revisit ~2030.
export const DIPOLE_POLE = { latDeg: 80.7, lonEastDeg: -72.7 };

// Centred-dipole geomagnetic latitude of a geographic location, in degrees.
export function geomagneticLatitude(latDeg, lonEastDeg) {
  const lat = latDeg * D2R, lon = lonEastDeg * D2R;
  const pLat = DIPOLE_POLE.latDeg * D2R, pLon = DIPOLE_POLE.lonEastDeg * D2R;
  const s = Math.sin(lat) * Math.sin(pLat) + Math.cos(lat) * Math.cos(pLat) * Math.cos(lon - pLon);
  return Math.asin(Math.max(-1, Math.min(1, s))) / D2R;
}

// Equatorward edge of the midnight auroral oval (|geomagnetic latitude|, deg) for a Kp.
export function auroraBoundaryLat(kp) {
  const k = Number.isFinite(kp) ? Math.max(0, Math.min(9, kp)) : NaN;
  return 66.5 - 2.04 * k;
}

// Low-precision solar altitude (deg) — Meeus-style short formulae, ±0.5°: mean longitude
// and anomaly → ecliptic longitude → RA/dec → GMST → hour angle → altitude. Enough to
// answer "is the sky dark there right now", which is all the aurora verdict needs.
export function sunAltitudeDeg(unixSeconds, latDeg, lonEastDeg) {
  const d = unixSeconds / 86400 - 10957.5; // days from J2000.0
  const g = (357.529 + 0.98560028 * d) * D2R;          // mean anomaly
  const q = 280.459 + 0.98564736 * d;                  // mean longitude (deg)
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * D2R;           // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmstDeg = (280.46061837 + 360.98564736629 * d) % 360;
  const H = ((gmstDeg + lonEastDeg) * D2R) - ra;       // local hour angle
  const lat = latDeg * D2R;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / D2R;
}

// The verdict. Returns { status, headline, detail, geomagLatDeg, boundaryLat } where
// status ∈ "overhead" | "horizon" | "unlikely" | "unknown". Every sentence states which
// location and which Kp it used — the app never asserts more than the data supports.
export function auroraAssessment({ latDeg, lonEastDeg, kp, unixSeconds = null, locationLabel = "" }) {
  const where = locationLabel || `${latDeg.toFixed(1)}°, ${lonEastDeg.toFixed(1)}°`;
  const geomagLatDeg = geomagneticLatitude(latDeg, lonEastDeg);
  const absMag = Math.abs(geomagLatDeg);
  const polewardHorizon = latDeg >= 0 ? "northern" : "southern";

  if (!Number.isFinite(kp)) {
    return {
      status: "unknown",
      headline: "Aurora outlook unavailable",
      detail: `No current Kp reading in this snapshot, so the oval's reach can't be judged for ${where}.`,
      geomagLatDeg,
      boundaryLat: NaN,
    };
  }

  const boundaryLat = auroraBoundaryLat(kp);
  const kpText = `Kp ${Number(kp).toFixed(1)}`;
  const magText = `${where} sits at ${absMag.toFixed(1)}° geomagnetic`;

  let status, headline, detail;
  if (absMag >= boundaryLat) {
    status = "overhead";
    headline = "Aurora possible overhead tonight";
    detail = `At ${kpText} the oval's edge reaches ~${boundaryLat.toFixed(0)}° geomagnetic latitude; ${magText} — inside it.`;
  } else if (absMag >= boundaryLat - 5) {
    status = "horizon";
    headline = `Aurora possible low on the ${polewardHorizon} horizon`;
    detail = `At ${kpText} the oval's edge sits near ${boundaryLat.toFixed(0)}° geomagnetic; ${magText} — close enough that high aurora can show above the ${polewardHorizon} horizon.`;
  } else {
    status = "unlikely";
    // Smallest Kp that would bring the horizon band (edge − 5°) down to this observer.
    const kpNeeded = Math.ceil((66.5 - (absMag + 5)) / 2.04);
    const reach = kpNeeded > 9
      ? "even a Kp 9 superstorm would not reach this far equatorward"
      : `a storm reaching Kp ${kpNeeded} would be needed`;
    headline = "Aurora unlikely at this location tonight";
    detail = `At ${kpText} the oval's edge sits near ${boundaryLat.toFixed(0)}° geomagnetic; ${magText} — ${reach}.`;
  }

  // Darkness: aurora is invisible against a bright sky. −10° solar altitude ≈ the end of
  // the twilight that still drowns faint aurora.
  if (unixSeconds != null) {
    const sunAlt = sunAltitudeDeg(unixSeconds, latDeg, lonEastDeg);
    if (status !== "unlikely" && sunAlt > -10) {
      detail += sunAlt > 0
        ? " The Sun is up there right now — wait for full darkness."
        : " It is still twilight there — wait for full darkness.";
    }
  }
  detail += " Approximate midnight-oval model; clear, dark skies decide the rest.";

  return { status, headline, detail, geomagLatDeg, boundaryLat };
}
