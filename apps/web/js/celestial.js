// The celestial backdrop: real-sky reference objects placed on a sphere around the solar system,
// so the orrery is oriented correctly with respect to the actual sky.
//
// Every direction here is given in ICRS / J2000 equatorial (RA°, Dec°) and converted to the
// renderer's ecliptic-J2000 world frame via bodyData.equToEcl. Pulsars and galaxies carry their
// true catalogue positions — pulsars in particular are the reference points the request asks for:
// because they are point sources with precisely measured positions (and, for the millisecond ones,
// clock-grade timing), they pin the celestial frame. The galactic-centre and -anticentre markers
// plus the Milky Way band show where the Sun sits in the Galaxy (~26,000 ly out, toward Sagittarius).

import { equToEcl } from "./bodyData.js?v=cc9af050a1";

// ---- bright stars (J2000), enough to draw the headline constellations + name the brightest ----
// name, RA°, Dec°, V-mag, optional constellation tag for grouping.
export const STARS = [
  // Orion
  { n: "Betelgeuse", ra: 88.793, dec: 7.407, m: 0.50 },
  { n: "Rigel", ra: 78.634, dec: -8.202, m: 0.13 },
  { n: "Bellatrix", ra: 81.283, dec: 6.350, m: 1.64 },
  { n: "Saiph", ra: 86.939, dec: -9.670, m: 2.07 },
  { n: "Alnitak", ra: 85.190, dec: -1.943, m: 1.77 },
  { n: "Alnilam", ra: 84.053, dec: -1.202, m: 1.69 },
  { n: "Mintaka", ra: 83.002, dec: -0.299, m: 2.23 },
  // Canis Major / Minor
  { n: "Sirius", ra: 101.287, dec: -16.716, m: -1.46 },
  { n: "Adhara", ra: 104.656, dec: -28.972, m: 1.50 },
  { n: "Procyon", ra: 114.825, dec: 5.225, m: 0.34 },
  // Taurus / Auriga
  { n: "Aldebaran", ra: 68.980, dec: 16.509, m: 0.85 },
  { n: "Capella", ra: 79.172, dec: 45.998, m: 0.08 },
  // Gemini
  { n: "Pollux", ra: 116.329, dec: 28.026, m: 1.14 },
  { n: "Castor", ra: 113.650, dec: 31.888, m: 1.58 },
  // Ursa Major (the Big Dipper)
  { n: "Dubhe", ra: 165.932, dec: 61.751, m: 1.79 },
  { n: "Merak", ra: 165.460, dec: 56.383, m: 2.37 },
  { n: "Phecda", ra: 178.458, dec: 53.695, m: 2.44 },
  { n: "Megrez", ra: 183.857, dec: 57.033, m: 3.31 },
  { n: "Alioth", ra: 193.507, dec: 55.960, m: 1.77 },
  { n: "Mizar", ra: 200.981, dec: 54.926, m: 2.27 },
  { n: "Alkaid", ra: 206.885, dec: 49.313, m: 1.86 },
  // Cassiopeia (the W)
  { n: "Schedar", ra: 10.127, dec: 56.537, m: 2.24 },
  { n: "Caph", ra: 2.295, dec: 59.150, m: 2.28 },
  { n: "Gamma Cas", ra: 14.177, dec: 60.717, m: 2.47 },
  { n: "Ruchbah", ra: 21.454, dec: 60.235, m: 2.68 },
  { n: "Segin", ra: 28.599, dec: 63.670, m: 3.38 },
  // Crux (Southern Cross)
  { n: "Acrux", ra: 186.650, dec: -63.099, m: 0.77 },
  { n: "Mimosa", ra: 191.930, dec: -59.689, m: 1.25 },
  { n: "Gacrux", ra: 187.791, dec: -57.113, m: 1.63 },
  { n: "Imai", ra: 183.786, dec: -58.749, m: 2.79 },
  // Cygnus (the Northern Cross)
  { n: "Deneb", ra: 310.358, dec: 45.280, m: 1.25 },
  { n: "Sadr", ra: 305.557, dec: 40.257, m: 2.23 },
  { n: "Gienah Cyg", ra: 305.253, dec: 33.970, m: 2.46 },
  { n: "Delta Cyg", ra: 296.243, dec: 45.131, m: 2.87 },
  { n: "Albireo", ra: 292.680, dec: 27.960, m: 3.05 },
  // Scorpius
  { n: "Antares", ra: 247.352, dec: -26.432, m: 1.09 },
  { n: "Shaula", ra: 263.402, dec: -37.104, m: 1.62 },
  { n: "Sargas", ra: 264.330, dec: -42.998, m: 1.86 },
  { n: "Dschubba", ra: 240.083, dec: -22.622, m: 2.29 },
  // Leo
  { n: "Regulus", ra: 152.093, dec: 11.967, m: 1.35 },
  { n: "Denebola", ra: 177.265, dec: 14.572, m: 2.11 },
  { n: "Algieba", ra: 154.993, dec: 19.842, m: 2.08 },
  // Lyra / Aquila — Summer Triangle anchors
  { n: "Vega", ra: 279.234, dec: 38.784, m: 0.03 },
  { n: "Altair", ra: 297.696, dec: 8.868, m: 0.76 },
  // Other first-magnitude landmarks
  { n: "Arcturus", ra: 213.915, dec: 19.182, m: -0.05 },
  { n: "Spica", ra: 201.298, dec: -11.161, m: 1.04 },
  { n: "Canopus", ra: 95.988, dec: -52.696, m: -0.74 },
  { n: "Rigil Kent.", ra: 219.902, dec: -60.834, m: -0.27 },
  { n: "Hadar", ra: 210.956, dec: -60.373, m: 0.61 },
  { n: "Achernar", ra: 24.429, dec: -57.237, m: 0.46 },
  { n: "Fomalhaut", ra: 344.413, dec: -29.622, m: 1.16 },
  { n: "Polaris", ra: 37.954, dec: 89.264, m: 1.98 },
];

const SI = (() => { const m = {}; STARS.forEach((s, i) => (m[s.n] = i)); return m; })();

// Constellation stick figures — index pairs into STARS.
export const CONSTELLATIONS = [
  { name: "Orion", lines: [["Betelgeuse", "Bellatrix"], ["Bellatrix", "Mintaka"], ["Betelgeuse", "Alnitak"], ["Mintaka", "Alnilam"], ["Alnilam", "Alnitak"], ["Mintaka", "Rigel"], ["Alnitak", "Saiph"], ["Rigel", "Saiph"]] },
  { name: "Ursa Major", lines: [["Dubhe", "Merak"], ["Merak", "Phecda"], ["Phecda", "Megrez"], ["Megrez", "Dubhe"], ["Megrez", "Alioth"], ["Alioth", "Mizar"], ["Mizar", "Alkaid"]] },
  { name: "Cassiopeia", lines: [["Caph", "Schedar"], ["Schedar", "Gamma Cas"], ["Gamma Cas", "Ruchbah"], ["Ruchbah", "Segin"]] },
  { name: "Crux", lines: [["Acrux", "Gacrux"], ["Mimosa", "Imai"]] },
  { name: "Cygnus", lines: [["Deneb", "Sadr"], ["Sadr", "Gienah Cyg"], ["Sadr", "Delta Cyg"], ["Sadr", "Albireo"]] },
  { name: "Scorpius", lines: [["Dschubba", "Antares"], ["Antares", "Sargas"], ["Sargas", "Shaula"]] },
  { name: "Leo", lines: [["Regulus", "Algieba"], ["Algieba", "Denebola"]] },
];

// Pulsars (J2000) — the reference markers the brief asks for. RA/Dec from the ATNF catalogue.
export const PULSARS = [
  { n: "Crab (B0531+21)", ra: 83.6332, dec: 22.0145, note: "SN 1054 remnant, 33 ms" },
  { n: "Vela (B0833−45)", ra: 128.836, dec: -45.176, note: "89 ms, γ-ray bright" },
  { n: "B1919+21", ra: 290.434, dec: 21.884, note: "first pulsar found, 1967" },
  { n: "B1937+21", ra: 294.911, dec: 21.583, note: "first millisecond pulsar, 1.56 ms" },
  { n: "B1257+12", ra: 195.015, dec: 12.6825, note: "first exoplanets, 1992" },
  { n: "J0437−4715", ra: 69.316, dec: -47.2525, note: "nearest millisecond pulsar" },
  { n: "Geminga (J0633)", ra: 98.476, dec: 17.770, note: "radio-quiet γ-ray pulsar" },
];

// Galaxies, the galactic centre/anticentre, and the galactic poles — where we sit in the Milky Way.
export const DEEPSKY = [
  { n: "Galactic Centre (Sgr A*)", ra: 266.417, dec: -29.008, kind: "gc", note: "Milky Way core, ~26,000 ly toward Sagittarius" },
  { n: "Galactic Anticentre", ra: 86.405, dec: 28.936, kind: "gc", note: "away from the core, toward Auriga" },
  { n: "Andromeda (M31)", ra: 10.685, dec: 41.269, kind: "galaxy", note: "nearest large spiral, 2.5 Mly" },
  { n: "Triangulum (M33)", ra: 23.462, dec: 30.660, kind: "galaxy", note: "3rd-largest Local Group galaxy" },
  { n: "LMC", ra: 80.894, dec: -69.756, kind: "galaxy", note: "Large Magellanic Cloud, 160,000 ly" },
  { n: "SMC", ra: 13.187, dec: -72.829, kind: "galaxy", note: "Small Magellanic Cloud" },
  { n: "Whirlpool (M51)", ra: 202.470, dec: 47.195, kind: "galaxy", note: "face-on spiral" },
  { n: "Virgo A (M87)", ra: 187.706, dec: 12.391, kind: "galaxy", note: "giant elliptical, M87* black hole" },
];

// ---- Milky Way band: the galactic plane (b = 0) is a great circle on the sky. ----
// Galactic → equatorial (J2000) rotation constants (north galactic pole + ascending node).
const NGP_RA = 192.85948 * Math.PI / 180;
const NGP_DEC = 27.12825 * Math.PI / 180;
const L_NCP = 122.93192 * Math.PI / 180; // galactic longitude of the north celestial pole
function galToEqu(lDeg, bDeg) {
  const l = lDeg * Math.PI / 180, b = bDeg * Math.PI / 180;
  const sinDec = Math.sin(NGP_DEC) * Math.sin(b) + Math.cos(NGP_DEC) * Math.cos(b) * Math.cos(L_NCP - l);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const y = Math.cos(b) * Math.sin(L_NCP - l);
  const x = Math.cos(NGP_DEC) * Math.sin(b) - Math.sin(NGP_DEC) * Math.cos(b) * Math.cos(L_NCP - l);
  const ra = NGP_RA + Math.atan2(y, x);
  return [ra * 180 / Math.PI, dec * 180 / Math.PI];
}

// Deterministic hash → [0,1) for the procedural background starfield.
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

// Build all backdrop geometry as flat Float32Arrays on a unit sphere (world ecliptic-J2000).
// Returns { bgStars:{pos,size,bright}, brightStars:[{name,pos,m}], constLines:Float32(x,y,z..),
//           pulsars:[{name,pos,note}], deepsky:[{name,pos,kind,note}], milkyWay:Float32 (band points) }
export function buildCelestial() {
  const dir = (ra, dec) => equToEcl(ra, dec);

  // Background stars: ~1700, denser toward the galactic plane so the Milky Way reads as a band.
  const N = 1700;
  const pos = [], size = [], bright = [];
  for (let i = 0; i < N; i++) {
    // Sample roughly uniformly on the sphere via galactic coords, then concentrate near b≈0.
    const l = hash(i + 1) * 360;
    const u = hash(i + 7) * 2 - 1;
    let b = Math.asin(u) * 180 / Math.PI;          // uniform in sin(b)
    const band = hash(i + 13);
    if (band > 0.45) b *= 0.18 + 0.82 * hash(i + 19) * hash(i + 23); // pull a fraction toward the plane
    const [ra, dec] = galToEqu(l, b);
    const d = dir(ra, dec);
    pos.push(d[0], d[1], d[2]);
    const mag = 2.5 + hash(i + 29) * 4.0;
    size.push(Math.max(0.6, 2.4 - 0.28 * mag));
    const tw = 0.45 + 0.55 * hash(i + 31);
    bright.push(tw);
  }

  const brightStars = STARS.map((s) => ({ name: s.n, pos: dir(s.ra, s.dec), m: s.m }));

  const constLines = [];
  for (const c of CONSTELLATIONS) {
    for (const [a, b] of c.lines) {
      const A = STARS[SI[a]], B = STARS[SI[b]];
      if (!A || !B) continue;
      const pa = dir(A.ra, A.dec), pb = dir(B.ra, B.dec);
      constLines.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2]);
    }
  }

  // Milky Way band: a filled belt |b| < ~7° rendered as many faint points.
  const milkyWay = [];
  for (let k = 0; k < 2200; k++) {
    const l = hash(k + 101) * 360;
    const b = (hash(k + 211) - 0.5) * 14; // ±7°
    const [ra, dec] = galToEqu(l, b);
    const d = dir(ra, dec);
    // Brighten toward the galactic centre region (l ≈ 0) for a realistic bulge.
    const dl = Math.min(Math.abs(l), 360 - Math.abs(l));
    const w = 0.25 + 0.75 * Math.exp(-(dl * dl) / (60 * 60)) + 0.2 * (1 - Math.abs(b) / 7);
    milkyWay.push(d[0], d[1], d[2], Math.min(1, w));
  }

  const pulsars = PULSARS.map((p) => ({ name: p.n, pos: dir(p.ra, p.dec), note: p.note }));
  const deepsky = DEEPSKY.map((g) => ({ name: g.n, pos: dir(g.ra, g.dec), kind: g.kind, note: g.note }));

  return {
    bgStars: { pos: new Float32Array(pos), size: new Float32Array(size), bright: new Float32Array(bright), count: N },
    brightStars,
    constLines: new Float32Array(constLines),
    milkyWay: new Float32Array(milkyWay),
    pulsars,
    deepsky,
  };
}
