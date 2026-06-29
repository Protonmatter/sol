//! A small catalogue of the brightest, most recognisable stars (J2000 ICRS positions, V mag).
//!
//! These flow through the same topocentric reduction as the Sun/Moon/planets (J2000 equatorial →
//! J2000 ecliptic → precess to date → nutation → equatorial of date → alt/az), so they appear in
//! both the My Sky dome and the "Up now" list. Stars are at effectively infinite distance, so
//! light-time and parallax are nil; annual aberration (~20″) is omitted (negligible at dome scale).
//! Positions are arcminute-accurate, which is well below a horizon-dome's resolution.

pub struct Star {
    pub name: &'static str,
    pub ra_deg: f64,
    pub dec_deg: f64,
    pub mag: f64,
}

pub static STARS: &[Star] = &[
    Star { name: "Sirius", ra_deg: 101.287, dec_deg: -16.716, mag: -1.46 },
    Star { name: "Canopus", ra_deg: 95.988, dec_deg: -52.696, mag: -0.74 },
    Star { name: "Rigil Kentaurus", ra_deg: 219.902, dec_deg: -60.834, mag: -0.27 },
    Star { name: "Arcturus", ra_deg: 213.915, dec_deg: 19.182, mag: -0.05 },
    Star { name: "Vega", ra_deg: 279.234, dec_deg: 38.784, mag: 0.03 },
    Star { name: "Capella", ra_deg: 79.172, dec_deg: 45.998, mag: 0.08 },
    Star { name: "Rigel", ra_deg: 78.634, dec_deg: -8.202, mag: 0.13 },
    Star { name: "Procyon", ra_deg: 114.825, dec_deg: 5.225, mag: 0.34 },
    Star { name: "Achernar", ra_deg: 24.429, dec_deg: -57.237, mag: 0.46 },
    Star { name: "Betelgeuse", ra_deg: 88.793, dec_deg: 7.407, mag: 0.50 },
    Star { name: "Hadar", ra_deg: 210.956, dec_deg: -60.373, mag: 0.61 },
    Star { name: "Altair", ra_deg: 297.696, dec_deg: 8.868, mag: 0.76 },
    Star { name: "Acrux", ra_deg: 186.650, dec_deg: -63.099, mag: 0.77 },
    Star { name: "Aldebaran", ra_deg: 68.980, dec_deg: 16.509, mag: 0.85 },
    Star { name: "Spica", ra_deg: 201.298, dec_deg: -11.161, mag: 1.04 },
    Star { name: "Antares", ra_deg: 247.352, dec_deg: -26.432, mag: 1.09 },
    Star { name: "Pollux", ra_deg: 116.329, dec_deg: 28.026, mag: 1.14 },
    Star { name: "Fomalhaut", ra_deg: 344.413, dec_deg: -29.622, mag: 1.16 },
    Star { name: "Deneb", ra_deg: 310.358, dec_deg: 45.280, mag: 1.25 },
    Star { name: "Mimosa", ra_deg: 191.930, dec_deg: -59.689, mag: 1.25 },
    Star { name: "Regulus", ra_deg: 152.093, dec_deg: 11.967, mag: 1.35 },
    Star { name: "Adhara", ra_deg: 104.656, dec_deg: -28.972, mag: 1.50 },
    Star { name: "Castor", ra_deg: 113.650, dec_deg: 31.888, mag: 1.58 },
    Star { name: "Shaula", ra_deg: 263.402, dec_deg: -37.104, mag: 1.62 },
    Star { name: "Bellatrix", ra_deg: 81.283, dec_deg: 6.350, mag: 1.64 },
    Star { name: "Polaris", ra_deg: 37.954, dec_deg: 89.264, mag: 1.98 },
];
