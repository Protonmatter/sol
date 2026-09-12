//! Shared admission of source attribution for standalone and bundled observations.

pub fn attributable_source(source: &str) -> bool {
    // The cross-runtime set includes U+001C..U+001F, which Rust trim omits.
    // U+FEFF is deliberately not whitespace; source evidence is never rewritten.
    let source = source.trim_matches(|ch| {
        matches!(ch,
            '\u{0009}'..='\u{000d}' | '\u{001c}'..='\u{0020}' |
            '\u{0085}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' |
            '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}'
        )
    });
    !source.is_empty() && source.to_lowercase() != "unknown"
}
