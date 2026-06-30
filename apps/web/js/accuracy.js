// The engine's honest validity envelope, by epoch. Used to label the time controls so the app shows
// "how far back and forward it stays accurate" rather than implying uniform precision everywhere.
//
// Two regimes, because the views differ:
//  • "helio" — the 3-D and top-down Solar-System views show HELIOCENTRIC positions (ecliptic J2000).
//    These are NOT limited by ΔT; their accuracy is set by the planetary theory. Inner planets use
//    VSOP2013 (sub-arcsecond for millennia); the four giants use TOP2013, which stays sub-arcsecond
//    across the whole ±5000-yr span — where VSOP2013 alone would drift to hundreds of arcsec by ±6000 yr.
//  • "sky" — the My Sky horizon dome is TOPOCENTRIC (altitude/azimuth), so it also depends on Earth's
//    rotation. Deep in time that is dominated by ΔT (the drift of the Earth-rotation clock), which
//    reaches hours at ±6000 yr and swings the whole local sky by degrees — the binding error there.

export const ENGINE_RANGE = {
  helioYears: 5000,   // heliocentric views: arcsecond-class across the whole span (TOP2013 giants)
  skyYears: 5000,     // sky view: positions of-date; rise/set & whole-sky orientation ΔT-limited deep-time
};

/** @returns {{level:"good"|"ok"|"rough", text:string}} */
export function epochAccuracy(yearsFromNow, kind) {
  const ay = Math.abs(yearsFromNow);
  if (kind === "helio") {
    // Inner planets: VSOP2013. Outer planets (Jupiter–Neptune): TOP2013 — sub-arcsecond across the
    // whole ±5000-yr span (validated to the source), so no deep-time degradation here.
    if (ay <= 5000) return { level: "good", text: "Arcsecond-class — inner planets via VSOP2013, the four giants via TOP2013 (sub-arcsec across ±5000 yr)." };
    return { level: "ok", text: "Past the tabulated ±5000-yr span; positions extrapolate and slowly soften." };
  }
  // sky (topocentric) — positions are of-date, but Earth's rotation (ΔT) is the deep-time limiter.
  if (ay <= 300) return { level: "good", text: "Arcsecond-class, validated vs JPL Horizons." };
  if (ay <= 2000) return { level: "ok", text: "Star/planet directions good; rise–set times drift with ΔT (minutes-scale)." };
  return { level: "rough", text: "ΔT-limited: Earth's unpredictable rotation can swing the whole sky by up to ~degrees at ±6000 yr. Relative star patterns stay correct." };
}

// A compact human label for a year offset from the present (~2026).
export function epochLabel(yearsFromNow) {
  const yr = Math.round(2026 + yearsFromNow);
  if (yr <= 0) return `${Math.abs(yr - 1)} BCE`;   // no year 0
  return `${yr} CE`;
}
