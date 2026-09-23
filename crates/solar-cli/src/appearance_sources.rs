//! Strict offline boundary-sequence and long-lifecycle preparation.
use crate::appearance::{argument, processing, read_bounded, write_once, Failure};
use crate::bundle_intake::sha256;
use solar_core::appearance::*;
use solar_core::{parse_json, JsonValue};
use std::{
    collections::BTreeMap,
    path::{Component, Path},
};
fn member<'a>(v: &'a JsonValue, k: &str) -> Result<&'a JsonValue, Failure> {
    v.get(k).ok_or_else(|| processing(format!("missing {k}")))
}
fn num(v: &JsonValue, k: &str) -> Result<f64, Failure> {
    member(v, k)?
        .as_f64()
        .ok_or_else(|| processing(format!("numeric {k}")))
}
fn text<'a>(v: &'a JsonValue, k: &str) -> Result<&'a str, Failure> {
    member(v, k)?
        .as_str()
        .ok_or_else(|| processing(format!("string {k}")))
}
fn strict(v: &JsonValue, keys: &[&str]) -> Result<(), Failure> {
    let JsonValue::Object(fields) = v else {
        return Err(processing("expected object"));
    };
    if fields.len() != keys.len() || fields.iter().any(|(k, _)| !keys.contains(&k.as_str())) {
        return Err(processing("unexpected/missing object keys"));
    }
    Ok(())
}
struct Source {
    raw: String,
    time: f64,
    seed: f64,
    epoch: f64,
    hash: String,
    grid: BoundaryGrid,
    regions: Vec<LifecycleRegion>,
}
fn admit_snapshot(raw: &str, hash: String) -> Result<Source, Failure> {
    crate::snapshot_validation::validate(raw).map_err(processing)?;
    let doc = parse_json(raw).map_err(|e| processing(e.to_string()))?;
    let run = member(&doc, "run")?;
    let time = num(run, "time_seconds")?;
    let coords = member(&doc, "coordinates")?;
    if text(coords, "longitude_positive")? != "west" {
        return Err(processing("west-positive Carrington required"));
    }
    let grid = member(&doc, "grid")?;
    if text(grid, "storage_order")? != "lat_major_lon_contiguous" {
        return Err(processing("source grid layout"));
    }
    let br = member(member(&doc, "fields")?, "br_normalized")?;
    if text(br, "units")? != "normalized magnetic field" {
        return Err(processing("normalized model field units required"));
    }
    let lon = num(grid, "lon_count")? as usize;
    let lat = num(grid, "lat_count")? as usize;
    let values = member(br, "values")?
        .as_array()
        .ok_or_else(|| processing("field values"))?
        .iter()
        .map(|v| v.as_f64().ok_or_else(|| processing("field number")))
        .collect::<Result<Vec<_>, _>>()?;
    let grid = BoundaryGrid::new(lon, lat, values).map_err(processing)?;
    let mut regions = Vec::new();
    for r in member(&doc, "active_regions")?
        .as_array()
        .ok_or_else(|| processing("regions"))?
    {
        if regions.len() >= 128 {
            return Err(processing("source region capacity128"));
        }
        let id = num(r, "id")?;
        if id.fract() != 0.0 || !(0.0..=f64::from(u32::MAX)).contains(&id) {
            return Err(processing("source region id must fit u32 exactly"));
        }
        let birth = member(r, "birth")?;
        let area = num(r, "area_msh")?;
        let radius = (1.0 - area * 1e-6).acos();
        let region = LifecycleRegion {
            id: id as u32,
            birth_s: num(birth, "time_seconds")?,
            lifetime_s: 14.0 * 86400.0,
            rise_s: 21600.0,
            decay_s: 3.0 * 86400.0,
            latitude_rad: num(birth, "lat_deg")?.to_radians(),
            birth_longitude_rad: num(birth, "lon_deg")?.to_radians(),
            peak_radius_rad: radius,
            temperature_k: 4300.0,
            peak_strength: num(r, "flux_norm")?,
        };
        region.pose(time).map_err(processing)?;
        regions.push(region);
    }
    Ok(Source {
        raw: raw.to_owned(),
        time,
        seed: num(run, "seed")?,
        epoch: num(coords, "reference_epoch_jd_tt")?,
        hash,
        grid,
        regions,
    })
}
fn admit_sequence(path: &Path) -> Result<(Vec<Source>, String, String), Failure> {
    let raw = read_bounded(path, 65536)?;
    let doc = parse_json(&raw).map_err(|e| processing(e.to_string()))?;
    strict(&doc, &["schema_version", "field_authority", "snapshots"])?;
    if text(&doc, "schema_version")? != "solar-appearance-source-sequence.v1"
        || text(&doc, "field_authority")? != "normalized_model"
    {
        return Err(processing("source sequence schema/authority"));
    }
    let entries = member(&doc, "snapshots")?
        .as_array()
        .ok_or_else(|| processing("snapshot list"))?;
    if entries.is_empty() || entries.len() > 25 {
        return Err(processing("source sequence count1..25"));
    }
    let base = path
        .parent()
        .unwrap_or(Path::new("."))
        .canonicalize()
        .map_err(|e| processing(e.to_string()))?;
    let mut sources: Vec<Source> = Vec::new();
    let mut total = 0;
    let mut births = BTreeMap::new();
    for entry in entries {
        strict(entry, &["path", "sha256"])?;
        let relative = Path::new(text(entry, "path")?);
        if relative
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err(processing(
                "snapshot path must be confined relative components",
            ));
        }
        let target = base
            .join(relative)
            .canonicalize()
            .map_err(|e| processing(e.to_string()))?;
        if !target.starts_with(&base) {
            return Err(processing("snapshot path escape"));
        }
        let raw = read_bounded(&target, 16 * 1024 * 1024)?;
        total += raw.len();
        if total > 64 * 1024 * 1024 {
            return Err(processing("source sequence byte capacity"));
        }
        let hash = sha256(raw.as_bytes());
        if hash != text(entry, "sha256")? {
            return Err(processing("source snapshot digest mismatch"));
        }
        let mut source = admit_snapshot(&raw, hash)?;
        if let Some(first) = sources.first() {
            if source.time <= sources.last().unwrap().time
                || source.time - first.time > ROTATION_DURATION_S
                || source.seed != first.seed
                || source.epoch != first.epoch
                || source.grid.lon_count != first.grid.lon_count
                || source.grid.lat_count != first.grid.lat_count
            {
                return Err(processing("sequence time/seed/frame/grid mismatch"));
            }
        }
        let epoch = sources.first().map_or(source.time, |s| s.time);
        for r in &mut source.regions {
            r.birth_s -= epoch;
            let birth = (r.birth_s, r.latitude_rad, r.birth_longitude_rad);
            if let Some(prior) = births.insert(r.id, birth) {
                if prior != birth {
                    return Err(processing("source region immutable birth changed"));
                }
            }
        }
        sources.push(source);
    }
    Ok((sources, sha256(raw.as_bytes()), raw))
}
fn record_packet(
    out: &Path,
    index: usize,
    time: f64,
    packet: String,
    source_hash: Option<&str>,
) -> Result<String, Failure> {
    let relative = format!("frame-{index:03}.json");
    write_once(&out.join(&relative), &packet)?;
    Ok(format!(
        r#"{{"time_s":{time},"packet":{{"path":"{relative}","bytes":{},"sha256":"{}"}},"source_snapshot_sha256":{}}}"#,
        packet.len(),
        sha256(packet.as_bytes()),
        source_hash.map_or("null".into(), |h| format!("\"{h}\""))
    ))
}
pub(crate) fn run(args: &[String]) -> Result<(), Failure> {
    let mut opts = BTreeMap::new();
    let mut it = args[1..].iter();
    while let Some(flag) = it.next() {
        if !["--sequence", "--out", "--seed", "--lmax", "--count"].contains(&flag.as_str()) {
            return Err(argument("unknown derived option"));
        }
        let value = it.next().ok_or_else(|| argument("missing option value"))?;
        if opts.insert(flag.as_str(), value.as_str()).is_some() {
            return Err(argument("duplicate option"));
        }
    }
    let out = Path::new(*opts.get("--out").ok_or_else(|| argument("missing --out"))?);
    let seed = opts
        .get("--seed")
        .unwrap_or(&"42")
        .parse::<u32>()
        .map_err(|_| argument("seed"))?;
    let lmax = opts
        .get("--lmax")
        .unwrap_or(&"32")
        .parse::<usize>()
        .map_err(|_| argument("lmax"))?;
    let count = opts
        .get("--count")
        .unwrap_or(&"64")
        .parse::<usize>()
        .map_err(|_| argument("count"))?;
    if !(1..=64).contains(&lmax) || !(1..=64).contains(&count) {
        return Err(argument("lmax/count bounds"));
    }
    let mut records = Vec::new();
    let mut source_records = Vec::new();
    let source_receipt;
    let (id, duration, source_identity, epoch, seed_reference_time);
    if args[0] == "prepare-sequence" {
        let sequence = Path::new(
            *opts
                .get("--sequence")
                .ok_or_else(|| argument("missing --sequence"))?,
        );
        let (sources, identity, sequence_raw) = admit_sequence(sequence)?;
        write_once(&out.join("source-sequence.json"), &sequence_raw)?;
        source_receipt = format!(
            r#"{{"path":"source-sequence.json","bytes":{},"sha256":"{}"}}"#,
            sequence_raw.len(),
            sha256(sequence_raw.as_bytes())
        );
        epoch = sources[0].time;
        duration = sources.last().unwrap().time - epoch;
        id = "snapshot-boundary-v1";
        source_identity = Some(identity);
        let fields = sources
            .iter()
            .map(|s| s.grid.solve(lmax, 2.5))
            .collect::<Result<Vec<_>, _>>()
            .map_err(processing)?;
        let reference_index = fields
            .iter()
            .position(|f| {
                f.coefficients
                    .iter()
                    .any(|c| c.cosine.abs() + c.sine.abs() > 1e-12)
            })
            .unwrap_or(0);
        let reference_time = sources[reference_index].time - epoch;
        seed_reference_time = sources[reference_index].time;
        let seeds =
            weighted_seeds(&fields[reference_index], seed, count, 1024).map_err(processing)?;
        for (index, source) in sources.iter().enumerate() {
            let source_path = format!("source-{index:03}.json");
            write_once(&out.join(&source_path), &source.raw)?;
            source_records.push(format!(r#"{{"time_seconds":{},"resource":{{"path":"{source_path}","bytes":{},"sha256":"{}"}}}}"#,source.time,source.raw.len(),source.hash));
            let time = source.time - epoch;
            let field = &fields[index];
            let posed_seeds = pose_seeds(&seeds, time - reference_time).map_err(processing)?;
            let poses = source
                .regions
                .iter()
                .map(|r| r.pose(time))
                .collect::<Result<Vec<_>, _>>()
                .map_err(processing)?;
            let packet = derived_packet(DerivedPacketRequest {
                seed,
                time_s: time,
                duration_s: duration,
                recipe_id: id,
                source_snapshot_sha256: Some(&source.hash),
                poses: &poses,
                lifecycles: &source.regions,
                field,
                seeds: &posed_seeds,
            })
            .map_err(processing)?;
            records.push(record_packet(out, index, time, packet, Some(&source.hash))?);
        }
    } else {
        if opts.contains_key("--sequence") {
            return Err(argument("--sequence is only valid for prepare-sequence"));
        }
        id = "rotation-v1";
        duration = ROTATION_DURATION_S;
        source_identity = None;
        source_receipt = "null".to_string();
        epoch = 0.0;
        seed_reference_time = 0.0;
        let regions = rotation_regions(seed);
        let (_, reference) = lifecycle_field(&regions, 0.0, lmax).map_err(processing)?;
        let seeds = weighted_seeds(&reference, seed, count, 1024).map_err(processing)?;
        for index in 0..25 {
            let time = index as f64 * 21600.0;
            let (poses, field) = lifecycle_field(&regions, time, lmax).map_err(processing)?;
            let posed_seeds = pose_seeds(&seeds, time).map_err(processing)?;
            let packet = derived_packet(DerivedPacketRequest {
                seed,
                time_s: time,
                duration_s: duration,
                recipe_id: id,
                source_snapshot_sha256: None,
                poses: &poses,
                lifecycles: &regions,
                field: &field,
                seeds: &posed_seeds,
            })
            .map_err(processing)?;
            records.push(record_packet(out, index, time, packet, None)?);
        }
    }
    let schema_literal = if id == "snapshot-boundary-v1" {
        "\"solar-state-snapshot.v3\""
    } else {
        "null"
    };
    let source_records_json = source_records.join(",");
    let manifest = format!(
        r#"{{"schema_version":"solar-appearance-derived-sequence.v1","id":"{id}","seed":{seed},"duration_seconds":{duration},"source_epoch_seconds":{epoch},"source_sequence_sha256":{},"source_snapshot_schema":{schema_literal},"seed_reference_source_time_seconds":{seed_reference_time},"source_receipt":{source_receipt},"source_snapshots":[{source_records_json}],"field_units":"normalized","plasma_authority":"illustrative","frame":"carrington_z_north_west_positive","radius_km":695700,"seed_policy":"field-weighted reference candidates; stable IDs and differential advection","keyframes":[{}],"limits":["PFSS topology only, not plasma dynamics","Cell averages are projected with exact spherical area weights and midpoint harmonics","Snapshot magnetic fields remain normalized model fields, not measured magnetograms","Lifecycle modifies appearance masks; admitted snapshot field is not reweighted a second time","No automatic browser ABI admission; native optional product"]}}"#,
        source_identity.map_or("null".into(), |h| format!("\"{h}\"")),
        records.join(",")
    );
    validate_derived_manifest_json(&manifest).map_err(processing)?;
    write_once(&out.join("manifest.json"), &manifest)?;
    println!("{}", out.join("manifest.json").display());
    Ok(())
}
pub(crate) fn validate_source(raw: &str) -> Result<(), Failure> {
    admit_snapshot(raw, sha256(raw.as_bytes())).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_sequence_rejects_digest_traversal_and_duplicate_time_before_output() {
        let root =
            std::env::temp_dir().join(format!("sol-source-admission-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let raw = include_str!("../../../apps/web/data/latest-state.json");
        std::fs::write(root.join("source.json"), raw).unwrap();
        let hash = sha256(raw.as_bytes());
        let manifest = root.join("sequence.json");
        let valid = format!(
            r#"{{"schema_version":"solar-appearance-source-sequence.v1","field_authority":"normalized_model","snapshots":[{{"path":"source.json","sha256":"{hash}"}}]}}"#
        );
        std::fs::write(&manifest, &valid).unwrap();
        assert!(admit_sequence(&manifest).is_ok());
        for bad in [
            valid.replace(&hash, &"0".repeat(64)),
            valid.replace("source.json", "../source.json"),
            valid.replace("normalized_model", "observed"),
            valid.replace(
                "}]}",
                &format!(r#"}},{{"path":"source.json","sha256":"{hash}"}}]}}"#),
            ),
        ] {
            std::fs::write(&manifest, bad).unwrap();
            assert!(admit_sequence(&manifest).is_err());
        }
        std::fs::remove_file(manifest).unwrap();
        std::fs::remove_file(root.join("source.json")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn existing_snapshot_intake_retains_normalized_grid() {
        let raw = include_str!("../../../apps/web/data/latest-state.json");
        let source = admit_snapshot(raw, sha256(raw.as_bytes())).unwrap();
        assert!(source.grid.lon_count >= 8);
        assert!(source.time >= 0.0);
        let bad = raw.replace("normalized magnetic field", "tesla");
        assert!(admit_snapshot(&bad, sha256(bad.as_bytes())).is_err());
    }
}
