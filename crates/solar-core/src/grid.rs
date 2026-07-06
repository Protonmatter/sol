use crate::SolarCoordinates;

#[derive(Clone, Debug)]
pub struct SolarGrid {
    pub lon_count: usize,
    pub lat_count: usize,
    pub dlon_deg: f32,
    pub dlat_deg: f32,
    pub coordinates: SolarCoordinates,
}

impl SolarGrid {
    pub fn new(lon_count: usize, lat_count: usize) -> Self {
        Self::with_coordinates(lon_count, lat_count, SolarCoordinates::default())
    }

    pub fn with_coordinates(
        lon_count: usize,
        lat_count: usize,
        coordinates: SolarCoordinates,
    ) -> Self {
        assert!(lon_count >= 8);
        assert!(lat_count >= 4);
        assert!(coordinates.reference_epoch_jd_tt.is_finite());
        assert!(coordinates.central_meridian_longitude_deg.is_finite());
        assert!(coordinates.rotation_reference_deg_per_day.is_finite());
        assert!(coordinates.rotation_reference_deg_per_day > 0.0);
        Self {
            lon_count,
            lat_count,
            dlon_deg: 360.0 / lon_count as f32,
            dlat_deg: 180.0 / lat_count as f32,
            coordinates,
        }
    }

    pub fn len(&self) -> usize {
        self.lon_count * self.lat_count
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Row-major ordering: latitude is the outer row and longitude is contiguous.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{LongitudeDirection, SolarCoordinateFrame};

    #[test]
    fn default_grid_declares_carrington_frame() {
        let grid = SolarGrid::new(72, 36);
        assert_eq!(
            grid.coordinates.frame,
            SolarCoordinateFrame::HeliographicCarrington
        );
        assert_eq!(grid.coordinates.longitude_positive, LongitudeDirection::West);
        assert_eq!(grid.idx(1, 2), 74);
    }
}
