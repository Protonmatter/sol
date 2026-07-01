// Notable Milky-Way objects for the galactic-scale view, placed by their real galactic coordinates:
// l (galactic longitude, °, 0 = toward the centre), b (galactic latitude, °), d (distance from the Sun
// in kpc). The orrery converts (l, b, d) into the galaxy view's world frame so each sits at its true
// position relative to us. Types span the request: stellar nurseries (gas), supernova remnants and
// pulsars (neutron stars), planetary nebulae (dying stars → white dwarfs), stellar black holes, red
// supergiants, white dwarfs, and the nearest star systems.
//
// ACCURACY: positions are real to within their catalogue distance uncertainties (distances to nebulae
// can be ±10–20%). This is a reference/landmark layer, not an ephemeris. Objects within a few light-
// years of the Sun (Alpha Centauri, Sirius…) sit essentially ON the Sun's marker at galaxy scale —
// resolving them needs a light-year-scale "solar neighbourhood" view.

// type → { color [r,g,b], label tag, base marker size }
export const GAL_TYPES = {
  nebula:   { col: [1.0, 0.45, 0.6],  tag: "stellar nursery (gas)", size: 9 },
  snr:      { col: [0.78, 0.5, 1.0],  tag: "supernova remnant",     size: 8 },
  pulsar:   { col: [0.45, 0.95, 1.0], tag: "neutron star / pulsar", size: 7 },
  pn:       { col: [0.45, 0.95, 0.8], tag: "planetary nebula → white dwarf", size: 7 },
  bh:       { col: [1.0, 0.4, 0.25],  tag: "black hole",            size: 8 },
  rsg:      { col: [1.0, 0.55, 0.35], tag: "red supergiant",        size: 8 },
  giant:    { col: [1.0, 0.65, 0.4],  tag: "red giant",             size: 6 },
  wd:       { col: [0.8, 0.86, 1.0],  tag: "white dwarf",           size: 5 },
  star:     { col: [1.0, 0.95, 0.82], tag: "nearby star system",    size: 6 },
  cluster:  { col: [0.95, 0.92, 0.7], tag: "star cluster",          size: 7 },
  globular: { col: [0.95, 0.85, 0.5], tag: "globular cluster",      size: 7 },
};

// { n: name, l, b, d (kpc), type, note }
export const GAL_OBJECTS = [
  // Stellar nurseries — clouds of gas lit by newborn stars (HII regions).
  { n: "Orion Nebula (M42)", l: 209.0, b: -19.4, d: 0.41, type: "nebula", note: "the nearest big stellar nursery, 1,340 ly" },
  { n: "Eagle Nebula (M16)", l: 17.0, b: 0.8, d: 2.0, type: "nebula", note: "the “Pillars of Creation”" },
  { n: "Lagoon Nebula (M8)", l: 6.0, b: -1.2, d: 1.25, type: "nebula", note: "bright Sagittarius star-forming region" },
  { n: "Carina Nebula", l: 287.5, b: -0.6, d: 2.3, type: "nebula", note: "home of the unstable star Eta Carinae" },
  { n: "Rosette Nebula", l: 206.3, b: -2.1, d: 1.6, type: "nebula", note: "gas shell around a young cluster" },
  // Supernova remnants + neutron stars / pulsars.
  { n: "Crab Nebula (M1)", l: 184.6, b: -5.8, d: 2.0, type: "snr", note: "SN 1054 remnant — contains the Crab pulsar (a neutron star)" },
  { n: "Vela Pulsar", l: 263.9, b: -3.3, d: 0.29, type: "pulsar", note: "neutron star spinning ~11×/s, in a supernova remnant" },
  { n: "Geminga", l: 195.1, b: 4.3, d: 0.25, type: "pulsar", note: "nearby radio-quiet γ-ray neutron star" },
  // Planetary nebulae — Sun-like stars dying and shedding their envelopes, leaving white dwarfs.
  { n: "Ring Nebula (M57)", l: 63.2, b: 13.0, d: 0.79, type: "pn", note: "a dying star becoming a white dwarf" },
  { n: "Helix Nebula", l: 36.2, b: -57.1, d: 0.20, type: "pn", note: "the nearest planetary nebula" },
  { n: "Dumbbell Nebula (M27)", l: 60.8, b: -3.7, d: 0.42, type: "pn", note: "bright planetary nebula in Vulpecula" },
  // Stellar black holes.
  { n: "Cygnus X-1", l: 71.3, b: 3.1, d: 2.22, type: "bh", note: "first confirmed black hole — ~21 M☉, devouring a blue supergiant" },
  { n: "V404 Cygni", l: 73.1, b: -2.1, d: 2.39, type: "bh", note: "black-hole X-ray binary, ~9 M☉" },
  // Red supergiants and red giants — late-life massive/evolved stars.
  { n: "Betelgeuse", l: 199.8, b: -9.0, d: 0.168, type: "rsg", note: "red supergiant in Orion; a future supernova, ~548 ly" },
  { n: "Antares", l: 351.9, b: 15.1, d: 0.17, type: "rsg", note: "red supergiant, the heart of Scorpius" },
  { n: "Aldebaran", l: 181.0, b: -20.2, d: 0.020, type: "giant", note: "orange giant, the eye of Taurus, 65 ly" },
  { n: "Arcturus", l: 15.0, b: 69.0, d: 0.011, type: "giant", note: "red giant, 37 ly" },
  // White dwarfs (nearby).
  { n: "Sirius B", l: 227.2, b: -8.9, d: 0.0026, type: "wd", note: "nearest white dwarf, orbiting Sirius A — 8.6 ly" },
  { n: "Van Maanen's Star", l: 122.8, b: -58.0, d: 0.0043, type: "wd", note: "nearest solitary white dwarf, 14 ly" },
  // Nearest star systems — essentially at the Sun on this map (need a light-year-scale view to separate).
  { n: "Alpha Centauri", l: 315.7, b: -0.7, d: 0.00134, type: "star", note: "nearest star system — 4.37 ly (Proxima 4.24 ly)" },
  { n: "Barnard's Star", l: 31.0, b: 14.1, d: 0.00182, type: "star", note: "fastest proper motion; red dwarf, 5.96 ly" },
  { n: "Sirius", l: 227.2, b: -8.9, d: 0.0026, type: "star", note: "brightest night-sky star, 8.6 ly" },
  { n: "Vega", l: 67.4, b: 19.2, d: 0.00767, type: "star", note: "25 ly; a former pole star" },
  // Clusters.
  { n: "Pleiades (M45)", l: 166.6, b: -23.5, d: 0.136, type: "cluster", note: "young open cluster, 444 ly" },
  { n: "Omega Centauri", l: 309.1, b: 15.0, d: 5.2, type: "globular", note: "the Milky Way's largest globular cluster" },
];
