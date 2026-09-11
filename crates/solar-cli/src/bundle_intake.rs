//! Read-only immutable bundle intake. Capture the pointer once, then validate every
//! declared byte before returning any component to a caller. No cache/alias fallback.
use crate::snapshot_validation::{validate, validate_document};
use solar_core::{parse_json, JsonValue};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const LIMIT: u64 = 16 * 1024 * 1024;
const POINTER: &str = include_str!("../../../docs/bundle-pointer-v1.schema.json");
const DERIVED: &str = include_str!("../../../docs/research-data-bundle-v1.schema.json");
const SOURCE: &str = include_str!("../../../docs/public-data-cache-manifest-v2.schema.json");
const STATUS: &str = include_str!("../../../docs/daily-ingest-status-v2.schema.json");

pub(crate) struct Bundle {
    pub id: String,
    pub manifest: JsonValue,
    pub components: BTreeMap<String, String>,
}
fn get<'a>(v: &'a JsonValue, key: &str) -> Result<&'a JsonValue, String> {
    v.get(key).ok_or_else(|| format!("bundle missing {key}"))
}
fn string<'a>(v: &'a JsonValue, key: &str) -> Result<&'a str, String> {
    get(v, key)?
        .as_str()
        .ok_or_else(|| format!("bundle {key} must be string"))
}
fn array<'a>(v: &'a JsonValue, key: &str) -> Result<&'a [JsonValue], String> {
    get(v, key)?
        .as_array()
        .ok_or_else(|| format!("bundle {key} must be array"))
}
fn id(v: &str) -> Result<(), String> {
    if v.is_empty()
        || v.len() > 120
        || !v.as_bytes()[0].is_ascii_alphanumeric()
        || !v
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return Err("invalid bundle identity".into());
    }
    Ok(())
}
fn hash(v: &str) -> Result<(), String> {
    if v.len() != 64
        || !v
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("invalid SHA-256 identity".into());
    }
    Ok(())
}
fn relative(root: &Path, v: &str) -> Result<PathBuf, String> {
    if v.is_empty()
        || !v
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._/-".contains(&b))
        || v.split('/').any(|p| p.is_empty() || p == "." || p == "..")
    {
        return Err("unsafe bundle path".into());
    }
    let mut result = root.to_path_buf();
    for part in v.split('/') {
        result.push(part);
        if fs::symlink_metadata(&result).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("bundle symlinks are forbidden".into());
        }
    }
    Ok(result)
}
fn read(path: &Path) -> Result<String, String> {
    if fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("bundle symlink forbidden".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| format!("read bundle: {e}"))?
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("bundle component exceeds byte limit".into());
    }
    String::from_utf8(bytes).map_err(|_| "bundle component is not UTF-8".into())
}
fn time(value: &JsonValue, nullable: bool) -> Result<(), String> {
    if nullable && matches!(value, JsonValue::Null) {
        return Ok(());
    }
    let value = value.as_str().ok_or("timestamp must be UTC string")?;
    let text = value
        .strip_suffix('Z')
        .or_else(|| value.strip_suffix("+00:00"))
        .ok_or("timestamp must be UTC")?;
    let (base, fraction) = text.split_once('.').unwrap_or((text, ""));
    if base.len() != 19
        || base.as_bytes()[4] != b'-'
        || base.as_bytes()[7] != b'-'
        || base.as_bytes()[10] != b'T'
        || base.as_bytes()[13] != b':'
        || base.as_bytes()[16] != b':'
        || (!fraction.is_empty() && !fraction.bytes().all(|b| b.is_ascii_digit()))
        || text.ends_with('.')
    {
        return Err("invalid UTC timestamp".into());
    }
    let number = |a: usize, b: usize| {
        base.get(a..b)
            .ok_or("invalid timestamp")?
            .parse::<u32>()
            .map_err(|_| "invalid timestamp")
    };
    let year = number(0, 4)?;
    let month = number(5, 7)?;
    let day = number(8, 10)?;
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    if year == 0
        || day == 0
        || day > days
        || number(11, 13)? > 23
        || number(14, 16)? > 59
        || number(17, 19)? > 59
    {
        return Err("invalid UTC calendar timestamp".into());
    }
    Ok(())
}
fn source_semantics(source: &JsonValue) -> Result<(), String> {
    id(string(source, "bundle_id")?)?;
    time(get(source, "acquired_at_utc")?, false)?;
    let mut seen = std::collections::BTreeSet::new();
    for p in array(source, "products")? {
        let name = string(p, "product_id")?;
        id(name)?;
        if !seen.insert(name.to_ascii_lowercase()) {
            return Err("duplicate source product".into());
        }
        relative(Path::new(""), string(p, "path")?)?;
        hash(string(p, "sha256")?)?;
        let provenance = string(p, "source")?.trim();
        if provenance.is_empty() || provenance.eq_ignore_ascii_case("unknown") {
            return Err("source provenance unavailable".into());
        }
        time(get(p, "observation_time_utc")?, true)?;
        time(get(p, "retrieved_at_utc")?, true)?;
    }
    Ok(())
}
pub(crate) fn resolve(pointer: &Path, source: bool) -> Result<Bundle, String> {
    resolve_with_hook(pointer, source, |_| {})
}
fn resolve_with_hook(
    pointer: &Path,
    source: bool,
    mut hook: impl FnMut(&str),
) -> Result<Bundle, String> {
    let p = validate_document(&read(pointer)?, POINTER)?;
    let bundle_id = string(&p, "bundle_id")?;
    id(bundle_id)?;
    let expected = string(&p, "manifest_sha256")?;
    hash(expected)?;
    let path = relative(
        pointer.parent().ok_or("pointer parent missing")?,
        string(&p, "manifest_path")?,
    )?;
    if path
        .parent()
        .and_then(Path::file_name)
        .and_then(|p| p.to_str())
        != Some(bundle_id)
    {
        return Err("bundle manifest path identity mismatch".into());
    }
    let raw = read(&path)?;
    if sha256(raw.as_bytes()) != expected {
        return Err("bundle manifest hash mismatch".into());
    }
    let manifest = validate_document(&raw, if source { SOURCE } else { DERIVED })?;
    if string(&manifest, "bundle_id")? != bundle_id {
        return Err("bundle identity mismatch".into());
    }
    if source {
        source_semantics(&manifest)?;
    } else {
        id(string(&manifest, "source_bundle_id")?)?;
        hash(string(&manifest, "source_manifest_sha256")?)?;
        time(get(&manifest, "generated_at_utc")?, false)?;
    }
    let mut components = BTreeMap::new();
    let mut paths = std::collections::BTreeSet::new();
    for c in array(&manifest, if source { "products" } else { "components" })? {
        let role = string(c, if source { "product_id" } else { "role" })?;
        let relative_path = string(c, "path")?;
        if components.contains_key(role) || !paths.insert(relative_path.to_ascii_lowercase()) {
            return Err("duplicate bundle component".into());
        }
        if !source
            && ![
                "snapshot",
                "observations",
                "feed_status",
                "series_manifest",
                "source_manifest",
            ]
            .contains(&role)
            && !role
                .strip_prefix("series_frame:")
                .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
        {
            return Err("unknown bundle component role".into());
        }
        let bytes = read(&relative(
            path.parent().ok_or("manifest parent missing")?,
            relative_path,
        )?)?;
        let expected = string(c, "sha256")?;
        hash(expected)?;
        if get(c, "size_bytes")?.as_f64() != Some(bytes.len() as f64)
            || sha256(bytes.as_bytes()) != expected
        {
            return Err(format!("bundle component size/hash mismatch: {role}"));
        }
        let value = parse_json(&bytes).map_err(|e| e.to_string())?;
        if source {
            if !matches!(&value,JsonValue::Object(v) if !v.is_empty())
                && !matches!(&value,JsonValue::Array(v) if !v.is_empty())
            {
                return Err("empty/invalid source payload".into());
            }
        } else if string(&value, "schema_version")? != string(c, "schema_version")? {
            return Err("component schema identity mismatch".into());
        }
        components.insert(role.to_owned(), bytes);
        hook(role);
    }
    if !source {
        let component = |role: &str| {
            components
                .get(role)
                .ok_or_else(|| format!("missing component {role}"))
        };
        validate(component("snapshot")?)?;
        let src = validate_document(component("source_manifest")?, SOURCE)?;
        source_semantics(&src)?;
        if string(&src, "bundle_id")? != string(&manifest, "source_bundle_id")?
            || sha256(component("source_manifest")?.as_bytes())
                != string(&manifest, "source_manifest_sha256")?
        {
            return Err("source bundle identity mismatch".into());
        }
        let status = validate_document(component("feed_status")?, STATUS)?;
        time(get(&status, "generated_at_utc")?, false)?;
        time(get(&status, "observation_time_utc")?, true)?;
        if string(&status, "bundle_id")? != bundle_id
            || string(&status, "source_bundle_id")? != string(&manifest, "source_bundle_id")?
            || string(&status, "generated_at_utc")? != string(&manifest, "generated_at_utc")?
        {
            return Err("feed status identity mismatch".into());
        }
        let degraded = !array(&src, "failures")?.is_empty()
            || array(&src, "products")?.iter().any(|p| {
                p.get("origin").and_then(JsonValue::as_str) != Some("current-fetch")
                    || !matches!(p.get("failure"), Some(JsonValue::Null))
            });
        if string(&status, "status")? != if degraded { "degraded" } else { "ok" } {
            return Err("feed status must preserve source degradation".into());
        }
        let observations = parse_json(component("observations")?).map_err(|e| e.to_string())?;
        if string(&observations, "schema_version")? != "observation-frame.v1" {
            return Err("observations schema mismatch".into());
        }
        array(&observations, "frames")?;
        let series = parse_json(component("series_manifest")?).map_err(|e| e.to_string())?;
        if string(&series, "schema_version")? != "series-manifest.v1" {
            return Err("series schema mismatch".into());
        }
        let mut previous = f64::NEG_INFINITY;
        let mut names = std::collections::BTreeSet::new();
        let mut selected = std::collections::BTreeSet::new();
        for (index, frame) in array(&series, "frames")?.iter().enumerate() {
            let months = get(frame, "months")?
                .as_f64()
                .ok_or("series months must be numeric")?;
            if !months.is_finite() || months < 0.0 || months <= previous {
                return Err("series months not strictly ordered".into());
            }
            previous = months;
            let filename = string(frame, "file")?;
            if !filename.strip_suffix(".json").is_some_and(|name| {
                !name.is_empty()
                    && name
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            }) || !names.insert(filename)
            {
                return Err("series frame must be filename".into());
            }
            relative(Path::new(""), filename)?;
            let role = format!("series_frame:{index}");
            if frame.get("availability").and_then(JsonValue::as_str) == Some("unavailable") {
                if string(frame, "reason")?.trim().is_empty() || components.contains_key(&role) {
                    return Err("invalid declared series gap".into());
                }
            } else {
                validate(component(&role)?)?;
                selected.insert(role.clone());
                let entry = array(&manifest, "components")?
                    .iter()
                    .find(|c| c.get("role").and_then(JsonValue::as_str) == Some(role.as_str()))
                    .ok_or("series entry missing")?;
                if string(entry, "path")? != format!("series/{filename}") {
                    return Err("series frame path mismatch".into());
                }
            }
        }
        if components
            .keys()
            .any(|r| r.starts_with("series_frame:") && !selected.contains(r))
        {
            return Err("orphan series component".into());
        }
    }
    Ok(Bundle {
        id: bundle_id.to_owned(),
        manifest,
        components,
    })
}

// FIPS 180-4 SHA-256 compression, bounded local data only; no new crypto dependency.
fn sha256(bytes: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut data = bytes.to_vec();
    data.push(0x80);
    while data.len() % 64 != 56 {
        data.push(0);
    }
    data.extend_from_slice(&((bytes.len() as u64) * 8).to_be_bytes());
    let mut state: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    for chunk in data.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (i, part) in chunk.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes([part[0], part[1], part[2], part[3]]);
        }
        for i in 16..64 {
            let a = w[i - 15];
            let b = w[i - 2];
            w[i] = w[i - 16]
                .wrapping_add(a.rotate_right(7) ^ a.rotate_right(18) ^ (a >> 3))
                .wrapping_add(w[i - 7])
                .wrapping_add(b.rotate_right(17) ^ b.rotate_right(19) ^ (b >> 10));
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = state;
        for i in 0..64 {
            let t1 = h
                .wrapping_add(e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25))
                .wrapping_add((e & f) ^ (!e & g))
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let t2 = (a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22))
                .wrapping_add((a & b) ^ (a & c) ^ (b & c));
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (v, n) in state.iter_mut().zip([a, b, c, d, e, f, g, h]) {
            *v = v.wrapping_add(n);
        }
    }
    state.iter().map(|n| format!("{n:08x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_reader_captures_once_and_rejects_corrupt_products() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("sol-source-bundle-{}-{nonce}", std::process::id()));
        let folder = root.join("bundles/source");
        fs::create_dir_all(&folder).unwrap();
        let raw = "[{\"source\":\"fixture\",\"active\":true}]";
        let product = |name: &str| {
            format!("{{\"product_id\":\"{name}\",\"source\":\"fixture\",\"origin\":\"fixture\",\"observation_time_utc\":null,\"retrieved_at_utc\":null,\"quality\":[\"fixture\"],\"failure\":null,\"license\":\"fixture\",\"critical\":true,\"path\":\"{name}\",\"size_bytes\":{},\"sha256\":\"{}\"}}",raw.len(),sha256(raw.as_bytes()))
        };
        let manifest=format!("{{\"schema_version\":\"public-data-cache-manifest.v2\",\"bundle_id\":\"source\",\"acquired_at_utc\":\"2026-09-11T00:00:00Z\",\"failures\":[],\"products\":[{},{}]}}",product("a.json"),product("b.json"));
        fs::write(folder.join("manifest.json"), &manifest).unwrap();
        for name in ["a.json", "b.json"] {
            fs::write(folder.join(name), raw).unwrap();
        }
        let pointer=format!("{{\"schema_version\":\"bundle-pointer.v1\",\"bundle_id\":\"source\",\"manifest_path\":\"bundles/source/manifest.json\",\"manifest_sha256\":\"{}\"}}",sha256(manifest.as_bytes()));
        fs::write(root.join("current.json"), &pointer).unwrap();
        let bundle = resolve_with_hook(&root.join("current.json"), true, |_| {
            fs::write(root.join("current.json"), "{}").unwrap();
        })
        .unwrap();
        assert_eq!(bundle.id, "source");
        assert_eq!(bundle.components.len(), 2);
        assert!(resolve(&root.join("current.json"), true).is_err());
        fs::write(root.join("current.json"), &pointer).unwrap();
        fs::write(folder.join("b.json"), "[]").unwrap();
        assert!(resolve(&root.join("current.json"), true)
            .err()
            .unwrap()
            .contains("hash"));
    }
    #[test]
    fn sha256_vectors() {
        assert_eq!(
            sha256(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }
    #[test]
    fn calendar_rejects_normalized_invalid_dates() {
        assert!(time(&JsonValue::String("2026-02-30T00:00:00Z".into()), false).is_err());
        assert!(time(
            &JsonValue::String("2024-02-29T00:00:00.123+00:00".into()),
            false
        )
        .is_ok());
    }
}
