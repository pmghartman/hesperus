//! Tokens with byte spans. Newlines are tokens; comments are tokens too so the
//! formatter can keep them.

use crate::diag::{Diagnostic, Span};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Tok {
    /// Identifier, possibly holding `$x` / `${x}` interpolation.
    Ident(String),
    /// A string literal: the unescaped text.
    Str(String),
    Number(String),
    Newline,
    Comment(String),
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    LParen,
    RParen,
    Colon,
    Comma,
    Dot,
    Eq,
    Arrow,
    Eof,
}

#[derive(Debug, Clone)]
pub struct Token {
    pub tok: Tok,
    pub start: usize,
    pub end: usize,
}

pub fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}
pub fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

pub fn is_valid_ident(s: &str) -> bool {
    let mut chars = s.chars().peekable();
    match chars.next() {
        Some(c) if is_ident_start(c) => {}
        _ => return false,
    }
    let mut prev = ' ';
    for c in s.chars() {
        if !is_ident_char(c) {
            return false;
        }
        if prev == '-' && !(c.is_ascii_alphanumeric() || c == '_') {
            return false;
        }
        prev = c;
    }
    prev != '-' && !crate::ast::RESERVED.contains(&s)
}

/// Stands in for `\$` inside string values between the lexer and the expander, so an
/// escaped dollar is distinguishable from a backslash followed by a dollar.
pub const ESCAPED_DOLLAR: char = '\u{E000}';

pub fn lex(file: &str, text: &str) -> (Vec<Token>, Vec<Diagnostic>) {
    let bytes = text.as_bytes();
    let mut toks = Vec::new();
    let mut diags = Vec::new();
    // a UTF-8 byte order mark is accepted and ignored
    let mut i = if text.starts_with('\u{FEFF}') { 3 } else { 0 };
    let n = bytes.len();
    let push = |toks: &mut Vec<Token>, tok, s, e| toks.push(Token { tok, start: s, end: e });
    while i < n {
        let c = bytes[i] as char;
        match c {
            ' ' | '\t' | '\r' => i += 1,
            '\n' => {
                push(&mut toks, Tok::Newline, i, i + 1);
                i += 1;
            }
            '#' => {
                let s = i;
                while i < n && bytes[i] != b'\n' {
                    i += 1;
                }
                push(&mut toks, Tok::Comment(text[s..i].trim_end().to_string()), s, i);
            }
            '{' => { push(&mut toks, Tok::LBrace, i, i + 1); i += 1; }
            '}' => { push(&mut toks, Tok::RBrace, i, i + 1); i += 1; }
            '[' => { push(&mut toks, Tok::LBracket, i, i + 1); i += 1; }
            ']' => { push(&mut toks, Tok::RBracket, i, i + 1); i += 1; }
            '(' => { push(&mut toks, Tok::LParen, i, i + 1); i += 1; }
            ')' => { push(&mut toks, Tok::RParen, i, i + 1); i += 1; }
            ':' => { push(&mut toks, Tok::Colon, i, i + 1); i += 1; }
            ',' => { push(&mut toks, Tok::Comma, i, i + 1); i += 1; }
            '.' => { push(&mut toks, Tok::Dot, i, i + 1); i += 1; }
            '=' => { push(&mut toks, Tok::Eq, i, i + 1); i += 1; }
            '-' if i + 1 < n && bytes[i + 1] == b'>' => {
                push(&mut toks, Tok::Arrow, i, i + 2);
                i += 2;
            }
            '"' => {
                let s = i;
                i += 1;
                let mut val = String::new();
                let mut closed = false;
                while i < n {
                    let ch = bytes[i] as char;
                    if ch == '\n' {
                        break;
                    }
                    if ch == '"' {
                        closed = true;
                        i += 1;
                        break;
                    }
                    if ch == '\\' {
                        if let Some(e) = text[i + 1..].chars().next() {
                            if e == '\n' {
                                break;
                            }
                            match e {
                                '"' => val.push('"'),
                                '\\' => val.push('\\'),
                                'n' => val.push('\n'),
                                't' => val.push('\t'),
                                '$' => val.push(ESCAPED_DOLLAR),
                                _ => {
                                    diags.push(Diagnostic::error(
                                        "E029",
                                        Span::new(file, i, i + 1 + e.len_utf8()),
                                        format!("bad string escape `\\{}`; valid escapes are \\\" \\\\ \\n \\t \\$", e),
                                    ).with_fix(e.to_string()));
                                    val.push(e);
                                }
                            }
                            i += 1 + e.len_utf8();
                            continue;
                        }
                        i += 1;
                        continue;
                    }
                    // copy one UTF-8 character
                    let ch_len = text[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
                    val.push_str(&text[i..i + ch_len]);
                    i += ch_len;
                }
                if !closed {
                    diags.push(Diagnostic::error("E004", Span::new(file, s, i), "unterminated string").with_fix(format!("{}\"", &text[s..i])));
                }
                push(&mut toks, Tok::Str(val), s, i);
            }
            c if c.is_ascii_digit() => {
                let s = i;
                while i < n && ((bytes[i] as char).is_ascii_digit() || bytes[i] == b'.') {
                    i += 1;
                }
                push(&mut toks, Tok::Number(text[s..i].to_string()), s, i);
            }
            c if is_ident_start(c) || c == '$' => {
                let s = i;
                loop {
                    if i >= n {
                        break;
                    }
                    let ch = bytes[i] as char;
                    if ch == '$' {
                        i += 1;
                        if i < n && bytes[i] == b'{' {
                            while i < n && bytes[i] != b'}' && bytes[i] != b'\n' {
                                i += 1;
                            }
                            if i < n && bytes[i] == b'}' {
                                i += 1;
                            }
                        } else {
                            while i < n && is_ident_char(bytes[i] as char) && bytes[i] != b'-' {
                                i += 1;
                            }
                        }
                        continue;
                    }
                    if ch == '-' {
                        // a hyphen belongs to the identifier only when followed by an identifier character
                        if i + 1 < n && (bytes[i + 1] as char).is_ascii_alphanumeric() || (i + 1 < n && (bytes[i + 1] == b'_' || bytes[i + 1] == b'$')) {
                            i += 1;
                            continue;
                        }
                        break;
                    }
                    if is_ident_char(ch) {
                        i += 1;
                        continue;
                    }
                    break;
                }
                push(&mut toks, Tok::Ident(text[s..i].to_string()), s, i);
            }
            _ => {
                let ch_len = text[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
                diags.push(Diagnostic::error("E003", Span::new(file, i, i + ch_len), format!("unexpected character `{}`", &text[i..i + ch_len])).with_fix(""));
                i += ch_len;
            }
        }
    }
    push(&mut toks, Tok::Eof, n, n);
    (toks, diags)
}
