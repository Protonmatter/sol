//! Offline deterministic appearance preparation; no network or engine mutation.
use solar_core::{parse_json, JsonValue};
use std::{fs, path::Path};
pub(crate) type Failure = (i32, String);
pub(crate) fn argument(s: impl Into<String>) -> Failure {
    (2, s.into())
}
pub(crate) fn processing(s: impl Into<String>) -> Failure {
    (1, s.into())
}
pub(crate) fn write_once(path: &Path, text: &str) -> Result<(), Failure> {
    write_bytes_once(path, text.as_bytes())
}
pub(crate) fn write_bytes_once(path: &Path, bytes: &[u8]) -> Result<(), Failure> {
    if path.exists() {
        if fs::metadata(path)
            .map_err(|e| processing(e.to_string()))?
            .len()
            != bytes.len() as u64
        {
            return Err(processing("destination exists with different content"));
        }
        let old = fs::read(path).map_err(|e| processing(e.to_string()))?;
        if old == bytes {
            return Ok(());
        }
        return Err(processing("destination exists with different content"));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| processing(e.to_string()))?;
    }
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| processing(e.to_string()))?;
    let result = f.write_all(bytes).and_then(|()| f.sync_all());
    drop(f);
    if result.is_err() {
        let _ = fs::remove_file(path);
    }
    result.map_err(|e| processing(e.to_string()))
}
pub(crate) fn read_bounded(path: &Path, cap: u64) -> Result<String, Failure> {
    use std::io::Read;
    let f = fs::File::open(path).map_err(|e| processing(e.to_string()))?;
    let mut text = String::new();
    f.take(cap + 1)
        .read_to_string(&mut text)
        .map_err(|e| processing(e.to_string()))?;
    if text.len() as u64 > cap {
        return Err(processing("input byte capacity"));
    }
    Ok(text)
}
pub fn run(args: &[String]) -> Result<(), Failure> {
    let command = args
        .first()
        .ok_or_else(|| argument("appearance prepare|sample|validate"))?;
    if command == "validate-json" {
        use std::io::Read;
        if args.len() != 3
            || args[1] != "--kind"
            || !["packet", "manifest", "source"].contains(&args[2].as_str())
        {
            return Err(argument("validate-json --kind packet|manifest|source"));
        }
        let cap = if args[2] == "source" {
            16 * 1024 * 1024
        } else {
            4 * 1024 * 1024
        };
        let mut raw = String::new();
        std::io::stdin()
            .take(cap + 1)
            .read_to_string(&mut raw)
            .map_err(|e| processing(e.to_string()))?;
        if raw.len() as u64 > cap {
            return Err(processing("stdin byte capacity"));
        }
        match args[2].as_str() {
            "packet" => solar_core::appearance::validate_packet_json(&raw).map_err(processing)?,
            "manifest" => {
                solar_core::appearance::validate_derived_manifest_json(&raw).map_err(processing)?
            }
            _ => crate::appearance_sources::validate_source(&raw)?,
        };
        println!("appearance input valid");
        return Ok(());
    }
    if command == "validate-source" || command == "validate-manifest" {
        let flag = if command == "validate-source" {
            "--snapshot"
        } else {
            "--manifest"
        };
        if args.len() != 3 || args[1] != flag {
            return Err(argument(format!("{command} requires {flag} <path>")));
        }
        let raw = read_bounded(
            Path::new(&args[2]),
            if command == "validate-source" {
                16 * 1024 * 1024
            } else {
                1024 * 1024
            },
        )?;
        if command == "validate-source" {
            crate::appearance_sources::validate_source(&raw)?;
        } else {
            solar_core::appearance::validate_derived_manifest_json(&raw).map_err(processing)?;
        }
        println!("appearance input valid");
        return Ok(());
    }
    if ["prepare-sequence", "prepare-rotation"].contains(&command.as_str()) {
        return crate::appearance_sources::run(args);
    }
    if ![
        "prepare",
        "sample",
        "validate",
        "background",
        "raster",
        "components",
        "references",
    ]
    .contains(&command.as_str())
    {
        return Err(argument("unknown appearance command"));
    }
    let mut options = std::collections::BTreeMap::new();
    let mut it = args[1..].iter();
    while let Some(flag) = it.next() {
        if ![
            "--recipe", "--out", "--time", "--seed", "--lod", "--packet", "--lmax", "--width",
            "--height",
        ]
        .contains(&flag.as_str())
        {
            return Err(argument(format!("unknown option {flag}")));
        }
        let value = it.next().ok_or_else(|| argument("missing flag value"))?;
        if options.insert(flag.as_str(), value.as_str()).is_some() {
            return Err(argument("duplicate option"));
        }
    }
    if (command == "validate" && options.keys().any(|k| *k != "--packet"))
        || (![
            "validate",
            "background",
            "raster",
            "components",
            "references",
        ]
        .contains(&command.as_str())
            && options.contains_key("--packet"))
    {
        return Err(argument("option is not valid for this command"));
    }
    if command == "validate" {
        let path = options
            .get("--packet")
            .ok_or_else(|| argument("missing --packet"))?;
        let text = read_bounded(Path::new(path), 4 * 1048576)?;
        validate_packet(&text).map_err(processing)?;
        println!("appearance packet valid");
        return Ok(());
    }
    let recipe_path = options
        .get("--recipe")
        .ok_or_else(|| argument("missing --recipe"))?;
    let text = read_bounded(Path::new(recipe_path), 65536)?;
    let doc = parse_json(&text).map_err(|e| processing(e.to_string()))?;
    let JsonValue::Object(fields) = &doc else {
        return Err(processing("recipe must be object"));
    };
    let allowed = ["schema_version", "recipe_id", "seed", "authority"];
    if fields.len() != 4 || fields.iter().any(|(k, _)| !allowed.contains(&k.as_str())) {
        return Err(processing("unexpected or missing recipe keys"));
    }
    if doc.get("schema_version").and_then(JsonValue::as_str) != Some("solar-appearance-recipe.v1")
        || doc.get("authority").and_then(JsonValue::as_str) != Some("illustrative")
    {
        return Err(processing("recipe schema/authority"));
    }
    let id = match doc.get("recipe_id").and_then(JsonValue::as_str) {
        Some("quiet-v1") => 0,
        Some("active-v1") => 1,
        _ => return Err(processing("unsupported recipe")),
    };
    let seed_number = doc
        .get("seed")
        .and_then(JsonValue::as_f64)
        .ok_or_else(|| processing("seed"))?;
    if seed_number.fract() != 0.0 || !(0.0..=f64::from(u32::MAX)).contains(&seed_number) {
        return Err(processing("seed bounds"));
    }
    let seed = options
        .get("--seed")
        .map(|v| v.parse::<u32>())
        .transpose()
        .map_err(|_| argument("seed"))?
        .unwrap_or(seed_number as u32);
    let time = options
        .get("--time")
        .unwrap_or(&"0")
        .parse::<f64>()
        .map_err(|_| argument("time"))?;
    let lod = options
        .get("--lod")
        .unwrap_or(&"0")
        .parse::<u32>()
        .map_err(|_| argument("lod"))?;
    if !time.is_finite() || !(0.0..=21600.0).contains(&time) || lod > 2 {
        return Err(argument("time/lod outside finite bounds"));
    }
    let out = options
        .get("--out")
        .ok_or_else(|| argument("missing --out"))?;
    if ["background", "raster", "components", "references"].contains(&command.as_str()) {
        return crate::appearance_raster::run(command, &options, seed, time, id, out);
    }
    let lmax = options
        .get("--lmax")
        .unwrap_or(&"32")
        .parse::<usize>()
        .map_err(|_| argument("lmax"))?;
    if !(1..=64).contains(&lmax) {
        return Err(argument("lmax outside 1..64"));
    }
    let packet = solar_core::appearance::sample_packet_at_order(
        seed,
        time,
        id,
        lod,
        command == "prepare",
        lmax,
    )
    .map_err(processing)?;
    validate_packet(&packet).map_err(processing)?;
    let path = if command == "prepare" {
        Path::new(out).join("packet.json")
    } else {
        Path::new(out).to_path_buf()
    };
    write_once(&path, &packet)?;
    println!("{}", path.display());
    Ok(())
}
fn validate_packet(text: &str) -> Result<(), String> {
    solar_core::appearance::validate_packet_json(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn schema_mutations_fail() {
        let good = solar_core::appearance::sample_packet(42, 0.0, 1, 0, false).unwrap();
        assert!(validate_packet(&good).is_ok());
        for (a, b) in [
            ("carrington_z_north_west_positive", "unknown"),
            ("695700", "695699"),
            ("normalized", "tesla"),
            ("active-v1", "unknown"),
            ("\"seed\":42", "\"seed\":-1"),
        ] {
            assert!(validate_packet(&good.replace(a, b)).is_err(), "{a}");
        }
    }
    #[test]
    fn every_nested_semantic_mutation_is_rejected() {
        let good = solar_core::appearance::sample_packet(42, 123.0, 1, 0, false).unwrap();
        for(a,b)in [("\"radius_rad\":0.075","\"radius_rad\":-10"),("\"temperature_k\":4300","\"temperature_k\":-1"),("\"limb_u\":0.6","\"limb_u\":100"),("[0,21600]","[10,1]"),("\"frame_rate_deg_per_day\":14.1844","\"frame_rate_deg_per_day\":999"),("\"field\":null","\"field\":{\"source_surface_R\":-10,\"lmax\":999,\"monopole_removed\":0,\"coefficients\":[]}"),("\"wavelength_nm\":550","\"extra\":1,\"wavelength_nm\":550")]{let bad=good.replace(a,b);assert_ne!(bad,good,"mutation applied {a}");assert!(validate_packet(&bad).is_err(),"admitted {a}");}
    }
    #[test]
    fn argument_errors_are_two() {
        assert_eq!(run(&["bad".into()]).unwrap_err().0, 2);
        assert_eq!(run(&["sample".into(), "--time".into()]).unwrap_err().0, 2);
    }
    #[test]
    fn immutable_write_is_idempotent() {
        let p =
            std::env::temp_dir().join(format!("sol-appearance-write-{}.json", std::process::id()));
        let _ = fs::remove_file(&p);
        write_once(&p, "first").unwrap();
        write_once(&p, "first").unwrap();
        assert_eq!(write_once(&p, "different").unwrap_err().0, 1);
        assert_eq!(fs::read_to_string(&p).unwrap(), "first");
        fs::remove_file(p).unwrap();
    }
}
