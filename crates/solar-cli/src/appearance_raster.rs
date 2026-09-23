use crate::appearance::{
    argument, processing, read_bounded, write_bytes_once, write_once, Failure,
};
use crate::bundle_intake::sha256;
use solar_core::appearance::*;
use solar_core::{parse_json, JsonValue};
use std::{collections::BTreeMap, path::Path};
pub(crate) fn run(
    command: &str,
    options: &BTreeMap<&str, &str>,
    seed: u32,
    time: f64,
    recipe: u32,
    out: &str,
) -> Result<(), Failure> {
    let path = Path::new(*options.get("--packet").ok_or_else(|| {
        argument("R4 raster/components/references requires --packet <prepared t0 packet>")
    })?);
    let raw = read_bounded(path, 1024 * 1024)?;
    validate_packet_json(&raw).map_err(processing)?;
    let packet = parse_json(&raw).map_err(|e| processing(e.to_string()))?;
    if packet.get("recipe_id").and_then(JsonValue::as_str) != Some(RECIPE_IDS[recipe as usize])
        || packet.get("seed").and_then(JsonValue::as_f64) != Some(f64::from(seed))
        || packet.get("time_s").and_then(JsonValue::as_f64) != Some(0.0)
        || packet.get("field") == Some(&JsonValue::Null)
    {
        return Err(processing("raster packet recipe/seed/t0 geometry mismatch"));
    }
    let regions = read_emission_regions(&packet).map_err(processing)?;
    if command == "background" {
        if time != 0.0 {
            return Err(argument("background requires time zero"));
        }
        let n = options
            .get("--width")
            .unwrap_or(&"64")
            .parse::<usize>()
            .map_err(|_| argument("background width"))?;
        if ![32, 64, 96].contains(&n) {
            return Err(argument("background width must be 32,64,96"));
        }
        let mut bytes = Vec::with_capacity(n * n * n * 4);
        for z in 0..n {
            for y in 0..n {
                for x in 0..n {
                    let p = [x, y, z].map(|v| -2.5 + (v as f64 + 0.5) * 5.0 / n as f64);
                    bytes.extend_from_slice(
                        &(background_emission(p, seed).map_err(processing)? as f32).to_le_bytes(),
                    );
                }
            }
        }
        write_bytes_once(Path::new(out), &bytes)?;
        println!("{out}");
        return Ok(());
    }

    if command == "references" {
        let mut points = vec![[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
        if let Some(r) = regions.first() {
            points.push(r.cores[0].center);
            let p = add(r.cores[0].center, scale(r.axis_u, 0.006));
            points.push(scale(p, 1.0 / norm(p)));
            points.push(r.center);
        }
        let mut samples = Vec::new();
        for p in points {
            for t in [0.0, 600.0] {
                let c = euv_components(p, t, seed).map_err(processing)?;
                let intensity = surface_emission(p, t, seed, &regions).map_err(processing)?;
                samples.push(format!(r#"{{"point":[{},{},{}],"time_s":{t},"components":[{},{},{}],"quiet_meso":{},"intensity":{intensity}}}"#,p[0],p[1],p[2],c.hole,c.medium,c.fine,c.quiet_meso));
            }
        }
        let text = format!(
            r#"{{"recipe_hash":"{}","samples":[{}]}}"#,
            RECIPE_HASHES[recipe as usize],
            samples.join(",")
        );
        write_once(Path::new(out), &text)?;
        println!("{out}");
        return Ok(());
    }
    let width = options
        .get("--width")
        .unwrap_or(&"2048")
        .parse::<usize>()
        .map_err(|_| argument("width"))?;
    let height = options
        .get("--height")
        .unwrap_or(&"1024")
        .parse::<usize>()
        .map_err(|_| argument("height"))?;
    let rasters = hierarchical_rasters(seed, time, &regions, width, height).map_err(processing)?;
    if command == "raster" {
        let bytes = rasters[3]
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect::<Vec<_>>();
        write_bytes_once(Path::new(out), &bytes)?;
        println!("{out}");
        return Ok(());
    }
    let out = Path::new(out);
    let mut resources = Vec::new();
    let definitions = [
        "(1-.92H)*.012",
        "(1-.92H)*(.012+.11quiet_meso)",
        "macro_meso*(.9+.2F)",
        "quiet+final_AR",
        "sum(E)",
        "sum(.11*attachment_support*sparse_ridge*(.4+.6F))",
        "sum(cores+.11*attachment_support*(1-.9*lane)); sparse/fine held at one for geometry diagnostic",
        "sum(internal*(1-.9*lane)+cores)",
    ];
    for (i, (name, values)) in EMISSION_COMPONENT_KEYS.iter().zip(&rasters).enumerate() {
        let file = format!("{name}.f32");
        let bytes = values
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect::<Vec<_>>();
        write_bytes_once(&out.join(&file), &bytes)?;
        let min = values.iter().copied().fold(f32::INFINITY, f32::min);
        let max = values.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        resources.push(format!(r#"{{"key":"{name}","path":"{file}","bytes":{},"sha256":"{}","dimensions":[{width},{height}],"dtype":"float32-le","units":"{}","signed":false,"diagnostic_only":{},"definition":"{}","min":{min},"max":{max},"time_s":{time}}}"#,bytes.len(),sha256(&bytes),if i==4{"dimensionless mask"}else{"relative_emission"},i==4||i==6,definitions[i]));
    }
    write_once(&out.join("source-packet.json"), &raw)?;
    let manifest = format!(
        r#"{{"schema_version":"solar-emission-components.v1","recipe_id":"{}","recipe_hash":"{}","seed":{seed},"time_s":{time},"frame":"carrington_z_north_west_positive","longitude_positive":"west","latitude_row_zero":"south","texel_centers":true,"temporal_policy":"absolute-differential-unadvection-already-applied","display_transfer":"none; no exposure, tone map, palette, glare or blur baked","source_packet":{{"path":"source-packet.json","bytes":{},"sha256":"{}"}},"components":[{}]}}"#,
        RECIPE_IDS[recipe as usize],
        RECIPE_HASHES[recipe as usize],
        raw.len(),
        sha256(raw.as_bytes()),
        resources.join(",")
    );
    write_once(&out.join("manifest.json"), &manifest)?;
    println!("{}", out.join("manifest.json").display());
    Ok(())
}
