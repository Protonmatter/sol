#[derive(Clone, Debug)]
pub struct Field2D {
    pub values: Vec<f32>,
}

impl Field2D {
    pub fn filled(len: usize, value: f32) -> Self {
        Self {
            values: vec![value; len],
        }
    }

    pub fn max_abs(&self) -> f32 {
        self.values.iter().fold(0.0_f32, |acc, v| acc.max(v.abs()))
    }

    pub fn sum(&self) -> f32 {
        self.values.iter().copied().sum()
    }

    pub fn scale(&mut self, s: f32) {
        for v in &mut self.values {
            *v *= s;
        }
    }
}
