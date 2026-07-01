#[derive(Clone, Debug)]
pub struct SolarGrid {
    pub lon_count: usize,
    pub lat_count: usize,
    pub dlon_deg: f32,
    pub dlat_deg: f32,
}

impl SolarGrid {
    pub fn new(lon_count: usize, lat_count: usize) -> Self {
        assert!(lon_count >= 8);
        assert!(lat_count >= 4);
        Self {
            lon_count,
            lat_count,
            dlon_deg: 360.0 / lon_count as f32,
            dlat_deg: 180.0 / lat_count as f32,
        }
    }

    pub fn len(&self) -> usize {
        self.lon_count * self.lat_count
    }

    /// Always false in practice — the constructor asserts a minimum grid size — but present for
    /// `len`/`is_empty` API symmetry (and to satisfy clippy::len_without_is_empty).
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn idx(&self, lat_i: usize, lon_i: usize) -> usize {
        let lat = lat_i.min(self.lat_count - 1);
        let lon = lon_i % self.lon_count;
        lat * self.lon_count + lon
    }

    pub fn lat_deg(&self, lat_i: usize) -> f32 {
        -90.0 + (lat_i as f32 + 0.5) * self.dlat_deg
    }

    pub fn lon_deg(&self, lon_i: usize) -> f32 {
        (lon_i as f32 + 0.5) * self.dlon_deg
    }
}
