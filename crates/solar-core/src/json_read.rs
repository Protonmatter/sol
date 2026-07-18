//! Minimal, correct JSON reader — the workspace's first (ADR 0005).
//!
//! Every other JSON surface in the Rust workspace is write-only (hand-built strings);
//! the only prior "reader" was a substring scanner documented as unfit. Wiring
//! assimilation requires actually reading observation reports, so this implements the
//! full JSON grammar — objects, arrays, strings with all escapes incl. surrogate
//! pairs, numbers, booleans, null — in ~250 auditable lines with zero dependencies.
//! Recursion is depth-capped and every failure is a positioned `Err`, never a panic:
//! this parses on-disk inputs, not trusted build artifacts.

#[derive(Clone, Debug, PartialEq)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<JsonValue>),
    /// Insertion-ordered: re-serializing preserves the source's key order.
    Object(Vec<(String, JsonValue)>),
}

#[derive(Clone, Debug, PartialEq)]
pub struct JsonError {
    pub offset: usize,
    pub message: &'static str,
}

impl core::fmt::Display for JsonError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "JSON error at byte {}: {}", self.offset, self.message)
    }
}

const MAX_DEPTH: usize = 64;

impl JsonValue {
    pub fn get(&self, key: &str) -> Option<&JsonValue> {
        match self {
            JsonValue::Object(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            JsonValue::Number(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsonValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[JsonValue]> {
        match self {
            JsonValue::Array(items) => Some(items),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            JsonValue::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// Compact re-serialization (no added whitespace), preserving object key order.
    /// Non-finite numbers cannot occur (the parser only produces finite f64s).
    pub fn write_compact(&self, out: &mut String) {
        match self {
            JsonValue::Null => out.push_str("null"),
            JsonValue::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            JsonValue::Number(n) => {
                // f64 Display is shortest-round-trip; JSON has no Infinity/NaN, and the
                // parser never yields them, but guard anyway for hand-built values.
                if n.is_finite() {
                    out.push_str(&format!("{}", n));
                } else {
                    out.push_str("null");
                }
            }
            JsonValue::String(s) => write_escaped(out, s),
            JsonValue::Array(items) => {
                out.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    item.write_compact(out);
                }
                out.push(']');
            }
            JsonValue::Object(entries) => {
                out.push('{');
                for (i, (key, value)) in entries.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    write_escaped(out, key);
                    out.push(':');
                    value.write_compact(out);
                }
                out.push('}');
            }
        }
    }

    pub fn to_compact_string(&self) -> String {
        let mut out = String::new();
        self.write_compact(&mut out);
        out
    }
}

fn write_escaped(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

pub fn parse(text: &str) -> Result<JsonValue, JsonError> {
    let bytes = text.as_bytes();
    let mut pos = 0usize;
    let value = parse_value(bytes, &mut pos, 0)?;
    skip_ws(bytes, &mut pos);
    if pos != bytes.len() {
        return Err(err(pos, "trailing content after JSON value"));
    }
    Ok(value)
}

fn err(offset: usize, message: &'static str) -> JsonError {
    JsonError { offset, message }
}

fn skip_ws(bytes: &[u8], pos: &mut usize) {
    while *pos < bytes.len() && matches!(bytes[*pos], b' ' | b'\t' | b'\n' | b'\r') {
        *pos += 1;
    }
}

fn parse_value(bytes: &[u8], pos: &mut usize, depth: usize) -> Result<JsonValue, JsonError> {
    if depth > MAX_DEPTH {
        return Err(err(*pos, "nesting deeper than the supported maximum"));
    }
    skip_ws(bytes, pos);
    match bytes.get(*pos) {
        None => Err(err(*pos, "unexpected end of input")),
        Some(b'{') => parse_object(bytes, pos, depth),
        Some(b'[') => parse_array(bytes, pos, depth),
        Some(b'"') => Ok(JsonValue::String(parse_string(bytes, pos)?)),
        Some(b't') => parse_literal(bytes, pos, b"true", JsonValue::Bool(true)),
        Some(b'f') => parse_literal(bytes, pos, b"false", JsonValue::Bool(false)),
        Some(b'n') => parse_literal(bytes, pos, b"null", JsonValue::Null),
        Some(b'-') | Some(b'0'..=b'9') => parse_number(bytes, pos),
        Some(_) => Err(err(*pos, "unexpected character")),
    }
}

fn parse_literal(
    bytes: &[u8],
    pos: &mut usize,
    literal: &[u8],
    value: JsonValue,
) -> Result<JsonValue, JsonError> {
    if bytes.len() >= *pos + literal.len() && &bytes[*pos..*pos + literal.len()] == literal {
        *pos += literal.len();
        Ok(value)
    } else {
        Err(err(*pos, "invalid literal"))
    }
}

fn parse_number(bytes: &[u8], pos: &mut usize) -> Result<JsonValue, JsonError> {
    let start = *pos;
    if bytes.get(*pos) == Some(&b'-') {
        *pos += 1;
    }
    while *pos < bytes.len() && bytes[*pos].is_ascii_digit() {
        *pos += 1;
    }
    if bytes.get(*pos) == Some(&b'.') {
        *pos += 1;
        while *pos < bytes.len() && bytes[*pos].is_ascii_digit() {
            *pos += 1;
        }
    }
    if matches!(bytes.get(*pos), Some(b'e') | Some(b'E')) {
        *pos += 1;
        if matches!(bytes.get(*pos), Some(b'+') | Some(b'-')) {
            *pos += 1;
        }
        while *pos < bytes.len() && bytes[*pos].is_ascii_digit() {
            *pos += 1;
        }
    }
    let slice = core::str::from_utf8(&bytes[start..*pos]).map_err(|_| err(start, "bad number"))?;
    match slice.parse::<f64>() {
        Ok(n) if n.is_finite() => Ok(JsonValue::Number(n)),
        _ => Err(err(start, "invalid number")),
    }
}

fn parse_string(bytes: &[u8], pos: &mut usize) -> Result<String, JsonError> {
    debug_assert_eq!(bytes.get(*pos), Some(&b'"'));
    *pos += 1;
    let mut out = String::new();
    loop {
        match bytes.get(*pos) {
            None => return Err(err(*pos, "unterminated string")),
            Some(b'"') => {
                *pos += 1;
                return Ok(out);
            }
            Some(b'\\') => {
                *pos += 1;
                match bytes.get(*pos) {
                    Some(b'"') => out.push('"'),
                    Some(b'\\') => out.push('\\'),
                    Some(b'/') => out.push('/'),
                    Some(b'b') => out.push('\u{08}'),
                    Some(b'f') => out.push('\u{0c}'),
                    Some(b'n') => out.push('\n'),
                    Some(b'r') => out.push('\r'),
                    Some(b't') => out.push('\t'),
                    Some(b'u') => {
                        let hi = parse_hex4(bytes, pos)?;
                        let code = if (0xD800..0xDC00).contains(&hi) {
                            // Surrogate pair: require \uXXXX low half.
                            if bytes.get(*pos + 1) == Some(&b'\\')
                                && bytes.get(*pos + 2) == Some(&b'u')
                            {
                                *pos += 2;
                                let lo = parse_hex4(bytes, pos)?;
                                if !(0xDC00..0xE000).contains(&lo) {
                                    return Err(err(*pos, "invalid low surrogate"));
                                }
                                0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00)
                            } else {
                                return Err(err(*pos, "unpaired high surrogate"));
                            }
                        } else if (0xDC00..0xE000).contains(&hi) {
                            return Err(err(*pos, "unpaired low surrogate"));
                        } else {
                            hi
                        };
                        match char::from_u32(code) {
                            Some(c) => out.push(c),
                            None => return Err(err(*pos, "invalid unicode escape")),
                        }
                    }
                    _ => return Err(err(*pos, "invalid escape")),
                }
                *pos += 1;
            }
            Some(&b) if b < 0x20 => return Err(err(*pos, "raw control character in string")),
            Some(_) => {
                // Copy one UTF-8 encoded char (the input is a &str, so it is valid UTF-8).
                let s = core::str::from_utf8(&bytes[*pos..]).map_err(|_| err(*pos, "bad utf-8"))?;
                let c = s
                    .chars()
                    .next()
                    .ok_or_else(|| err(*pos, "unexpected end"))?;
                out.push(c);
                *pos += c.len_utf8();
            }
        }
    }
}

/// Reads the 4 hex digits following the `u` at `bytes[*pos]`; leaves `*pos` on the last digit.
fn parse_hex4(bytes: &[u8], pos: &mut usize) -> Result<u32, JsonError> {
    let start = *pos + 1;
    if start + 4 > bytes.len() {
        return Err(err(*pos, "truncated unicode escape"));
    }
    let mut code: u32 = 0;
    for &b in &bytes[start..start + 4] {
        let digit = match b {
            b'0'..=b'9' => (b - b'0') as u32,
            b'a'..=b'f' => (b - b'a') as u32 + 10,
            b'A'..=b'F' => (b - b'A') as u32 + 10,
            _ => return Err(err(*pos, "invalid unicode escape digit")),
        };
        code = code * 16 + digit;
    }
    *pos += 4;
    Ok(code)
}

fn parse_array(bytes: &[u8], pos: &mut usize, depth: usize) -> Result<JsonValue, JsonError> {
    *pos += 1; // consume '['
    let mut items = Vec::new();
    skip_ws(bytes, pos);
    if bytes.get(*pos) == Some(&b']') {
        *pos += 1;
        return Ok(JsonValue::Array(items));
    }
    loop {
        items.push(parse_value(bytes, pos, depth + 1)?);
        skip_ws(bytes, pos);
        match bytes.get(*pos) {
            Some(b',') => {
                *pos += 1;
            }
            Some(b']') => {
                *pos += 1;
                return Ok(JsonValue::Array(items));
            }
            _ => return Err(err(*pos, "expected ',' or ']' in array")),
        }
    }
}

fn parse_object(bytes: &[u8], pos: &mut usize, depth: usize) -> Result<JsonValue, JsonError> {
    *pos += 1; // consume '{'
    let mut entries = Vec::new();
    skip_ws(bytes, pos);
    if bytes.get(*pos) == Some(&b'}') {
        *pos += 1;
        return Ok(JsonValue::Object(entries));
    }
    loop {
        skip_ws(bytes, pos);
        if bytes.get(*pos) != Some(&b'"') {
            return Err(err(*pos, "expected string key"));
        }
        let key = parse_string(bytes, pos)?;
        skip_ws(bytes, pos);
        if bytes.get(*pos) != Some(&b':') {
            return Err(err(*pos, "expected ':' after key"));
        }
        *pos += 1;
        let value = parse_value(bytes, pos, depth + 1)?;
        entries.push((key, value));
        skip_ws(bytes, pos);
        match bytes.get(*pos) {
            Some(b',') => {
                *pos += 1;
            }
            Some(b'}') => {
                *pos += 1;
                return Ok(JsonValue::Object(entries));
            }
            _ => return Err(err(*pos, "expected ',' or '}' in object")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scalars_and_containers() {
        assert_eq!(parse("null").unwrap(), JsonValue::Null);
        assert_eq!(parse(" true ").unwrap(), JsonValue::Bool(true));
        assert_eq!(parse("-12.5e2").unwrap(), JsonValue::Number(-1250.0));
        assert_eq!(
            parse("\"a\\nb\"").unwrap(),
            JsonValue::String("a\nb".into())
        );
        let arr = parse("[1, [2, 3], {}]").unwrap();
        assert_eq!(arr.as_array().unwrap().len(), 3);
        let obj = parse("{\"a\": 1, \"b\": [true, null]}").unwrap();
        assert_eq!(obj.get("a").unwrap().as_f64(), Some(1.0));
        assert_eq!(obj.get("b").unwrap().as_array().unwrap().len(), 2);
    }

    #[test]
    fn preserves_key_order_and_round_trips_compactly() {
        let src = "{\"z\":1,\"a\":[true,\"x\\\"y\"],\"m\":{\"k\":null}}";
        let value = parse(src).unwrap();
        assert_eq!(value.to_compact_string(), src);
    }

    #[test]
    fn handles_unicode_escapes_including_surrogate_pairs() {
        assert_eq!(
            parse("\"\\u00e9\\uD83C\\uDF1E\"").unwrap(),
            JsonValue::String("é🌞".into())
        );
        assert!(parse("\"\\uD83C\"").is_err(), "unpaired high surrogate");
        assert!(parse("\"\\uDF1E\"").is_err(), "unpaired low surrogate");
    }

    #[test]
    fn rejects_malformed_inputs_with_positions_not_panics() {
        for bad in [
            "",
            "{",
            "[1,",
            "{\"a\"}",
            "{\"a\":}",
            "01x",
            "\"unterminated",
            "nul",
            "[1] trailing",
            "{\"a\":1,}",
            "\u{01}",
        ] {
            assert!(parse(bad).is_err(), "should reject {bad:?}");
        }
        // NaN/Infinity are not JSON.
        assert!(parse("NaN").is_err());
        assert!(parse("Infinity").is_err());
    }

    #[test]
    fn depth_cap_defends_against_pathological_nesting() {
        let deep_ok = format!("{}1{}", "[".repeat(60), "]".repeat(60));
        assert!(parse(&deep_ok).is_ok());
        let deep_bad = format!("{}1{}", "[".repeat(200), "]".repeat(200));
        assert!(parse(&deep_bad).is_err());
    }

    #[test]
    fn parses_the_real_observation_report_shape() {
        let src = r#"{
          "schema_version": "observation-frame.v1",
          "source_mode": "cached",
          "observed_context": {"activity_index": 0.972059, "stale_feeds": []},
          "frames": [{"id": "swpc-rtsw-mag-1m", "source_mode": "cached"}]
        }"#;
        let report = parse(src).unwrap();
        let activity = report
            .get("observed_context")
            .and_then(|c| c.get("activity_index"))
            .and_then(|v| v.as_f64());
        assert_eq!(activity, Some(0.972059));
        assert_eq!(report.get("frames").unwrap().as_array().unwrap().len(), 1);
    }
}
