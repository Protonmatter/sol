use crate::constants::CARRINGTON_SIDEREAL_DEG_PER_DAY;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SolarCoordinateFrame {
    HeliographicCarrington,
}

impl SolarCoordinateFrame {
    pub fn name(self) -> &'static str {
        "heliographic_carrington"
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LongitudeDirection {
    West,
}

impl LongitudeDirection {
    pub fn name(self) -> &'static str {
        "west"
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SolarLatitudeType {
    Heliographic,
}

impl SolarLatitudeType {
    pub fn name(self) -> &'static str {
        "heliographic"
    }
}

#[derive(Clone, Debug)]
pub struct SolarCoordinates {
    pub frame: SolarCoordinateFrame,
    pub longitude_positive: LongitudeDirection,
    pub latitude_type: SolarLatitudeType,
    pub reference_epoch_jd_tt: f64,
    pub central_meridian_longitude_deg: f64,
    pub rotation_reference_deg_per_day: f64,
    pub observer: &'static str,
}

impl Default for SolarCoordinates {
    fn default() -> Self {
        Self {
            frame: SolarCoordinateFrame::HeliographicCarrington,
            longitude_positive: LongitudeDirection::West,
            latitude_type: SolarLatitudeType::Heliographic,
            reference_epoch_jd_tt: 2_451_545.0,
            central_meridian_longitude_deg: 0.0,
            rotation_reference_deg_per_day: CARRINGTON_SIDEREAL_DEG_PER_DAY,
            observer: "sun_center",
        }
    }
}
