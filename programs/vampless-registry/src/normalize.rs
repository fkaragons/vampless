//! Normalization profile `ascii-v1` — byte-for-byte mirror of
//! `packages/core/src/normalize.ts`.
//!
//! The SDK performs Unicode NFKC before calling the program. Because the
//! profile only accepts ASCII, any input that survives NFKC and validation is
//! pure ASCII, so the program can re-validate without a Unicode table. The
//! program rejects non-ASCII bytes outright rather than folding them.

pub const NAME_MAX_LEN: usize = 32;
pub const TICKER_MAX_LEN: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Normalized {
    /// Canonical display form (uppercase, single spaces).
    pub display: String,
    /// Claim key: display with separators removed.
    pub key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NormalizeError {
    Empty,
    TooLong,
    UnsupportedChars,
    BadStart,
    NoAlnum,
}

fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut pending_space = false;
    for ch in s.chars() {
        if ch.is_whitespace() {
            pending_space = !out.is_empty();
        } else {
            if pending_space {
                out.push(' ');
                pending_space = false;
            }
            out.push(ch);
        }
    }
    out
}

fn ascii_upper(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii_lowercase() { c.to_ascii_uppercase() } else { c })
        .collect()
}

fn is_name_body_char(c: char) -> bool {
    c.is_ascii_uppercase() || c.is_ascii_digit() || c == ' ' || c == '.' || c == '_' || c == '-'
}

pub fn normalize_name(input: &str) -> Result<Normalized, NormalizeError> {
    let collapsed = collapse_whitespace(input);
    if collapsed.is_empty() {
        return Err(NormalizeError::Empty);
    }
    if collapsed.chars().count() > NAME_MAX_LEN {
        return Err(NormalizeError::TooLong);
    }
    let display = ascii_upper(&collapsed);
    let first = display.chars().next().unwrap();
    if !(first.is_ascii_uppercase() || first.is_ascii_digit()) {
        return Err(NormalizeError::BadStart);
    }
    if !display.chars().all(is_name_body_char) {
        return Err(NormalizeError::UnsupportedChars);
    }
    let key: String = display
        .chars()
        .filter(|c| !matches!(c, ' ' | '.' | '_' | '-'))
        .collect();
    if key.is_empty() {
        return Err(NormalizeError::NoAlnum);
    }
    Ok(Normalized { display, key })
}

pub fn normalize_ticker(input: &str) -> Result<Normalized, NormalizeError> {
    let mut s = collapse_whitespace(input);
    if let Some(rest) = s.strip_prefix('$') {
        s = rest.to_string();
    }
    if s.is_empty() {
        return Err(NormalizeError::Empty);
    }
    if s.chars().count() > TICKER_MAX_LEN {
        return Err(NormalizeError::TooLong);
    }
    let display = ascii_upper(&s);
    if !display.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) {
        return Err(NormalizeError::UnsupportedChars);
    }
    Ok(Normalized { key: display.clone(), display })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_matches_ts_vectors() {
        let n = normalize_name("  sol   cat ").unwrap();
        assert_eq!(n.display, "SOL CAT");
        assert_eq!(n.key, "SOLCAT");
        for v in ["Sol Cat", "sol-cat", "SOL.CAT", "SolCat", "sol_cat"] {
            assert_eq!(normalize_name(v).unwrap().key, "SOLCAT", "{v}");
        }
        assert_eq!(normalize_name("VАMPLESS"), Err(NormalizeError::UnsupportedChars)); // Cyrillic А
        assert_eq!(normalize_name("   "), Err(NormalizeError::Empty));
        assert_eq!(normalize_name(&"a".repeat(33)), Err(NormalizeError::TooLong));
        assert_eq!(normalize_name("-dash"), Err(NormalizeError::BadStart));
        assert!(normalize_name(&"a".repeat(32)).is_ok());
    }

    #[test]
    fn ticker_matches_ts_vectors() {
        assert_eq!(normalize_ticker("$vamp").unwrap().key, "VAMP");
        assert_eq!(normalize_ticker("VA-MP"), Err(NormalizeError::UnsupportedChars));
        assert_eq!(normalize_ticker(&"A".repeat(11)), Err(NormalizeError::TooLong));
        assert!(normalize_ticker(&"A".repeat(10)).is_ok());
    }
}
