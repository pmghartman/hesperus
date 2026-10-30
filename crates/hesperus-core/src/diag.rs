//! Diagnostics: a code, a message, a span and an optional fix.

use serde::Serialize;

/// A byte range in one file.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Default)]
pub struct Span {
    pub file: String,
    pub start: usize,
    pub end: usize,
}

impl Span {
    pub fn new(file: &str, start: usize, end: usize) -> Span {
        Span { file: file.to_string(), start, end }
    }
    pub fn join(&self, other: &Span) -> Span {
        Span { file: self.file.clone(), start: self.start.min(other.start), end: self.end.max(other.end) }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    pub code: &'static str,
    pub severity: Severity,
    pub message: String,
    pub span: Span,
    /// Replacement text for `span` that would fix the problem.
    pub fix: Option<String>,
}

impl Diagnostic {
    pub fn error(code: &'static str, span: Span, message: impl Into<String>) -> Diagnostic {
        Diagnostic { code, severity: Severity::Error, message: message.into(), span, fix: None }
    }
    pub fn info(code: &'static str, span: Span, message: impl Into<String>) -> Diagnostic {
        Diagnostic { code, severity: Severity::Info, message: message.into(), span, fix: None }
    }
    pub fn with_fix(mut self, fix: impl Into<String>) -> Diagnostic {
        self.fix = Some(fix.into());
        self
    }
}

/// Maps byte offsets to 1-based lines and columns (in characters).
pub struct LineIndex {
    line_starts: Vec<usize>,
    text: String,
}

impl LineIndex {
    pub fn new(text: &str) -> LineIndex {
        let mut line_starts = vec![0];
        for (i, b) in text.bytes().enumerate() {
            if b == b'\n' {
                line_starts.push(i + 1);
            }
        }
        LineIndex { line_starts, text: text.to_string() }
    }
    /// (line, column), both 1-based; column counts characters.
    pub fn position(&self, offset: usize) -> (usize, usize) {
        let offset = offset.min(self.text.len());
        let line = match self.line_starts.binary_search(&offset) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        let col = self.text[self.line_starts[line]..offset].chars().count() + 1;
        (line + 1, col)
    }
    /// (line, column), both 0-based; column counts UTF-16 code units, as LSP wants.
    pub fn position_utf16(&self, offset: usize) -> (u32, u32) {
        let offset = offset.min(self.text.len());
        let line = match self.line_starts.binary_search(&offset) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        let col: usize = self.text[self.line_starts[line]..offset].encode_utf16().count();
        (line as u32, col as u32)
    }
    /// Byte offset of a 0-based line and UTF-16 column.
    pub fn offset_utf16(&self, line: u32, col: u32) -> usize {
        let line = line as usize;
        if line >= self.line_starts.len() {
            return self.text.len();
        }
        let start = self.line_starts[line];
        let end = self.line_starts.get(line + 1).map(|e| e - 1).unwrap_or(self.text.len());
        let mut units = 0u32;
        for (i, ch) in self.text[start..end].char_indices() {
            if units >= col {
                return start + i;
            }
            units += ch.len_utf16() as u32;
        }
        end
    }
    pub fn line_count(&self) -> usize {
        self.line_starts.len()
    }
}

/// Edit distance, for "did you mean" suggestions.
pub fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i; b.len() + 1];
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        prev = cur;
    }
    prev[b.len()]
}

/// The closest candidate within a small distance, if any. A candidate must share more
/// than it differs: the distance has to be below its own length, so one-letter names
/// are never offered for an unrelated word.
pub fn nearest<'a>(word: &str, candidates: impl IntoIterator<Item = &'a str>) -> Option<&'a str> {
    let mut best: Option<(usize, &str)> = None;
    for c in candidates {
        let d = edit_distance(word, c);
        if d <= 3 && d < c.chars().count() && d < word.chars().count().max(1) && best.map(|(bd, _)| d < bd).unwrap_or(true) {
            best = Some((d, c));
        }
    }
    best.map(|(_, c)| c)
}

/// Keep quoted source text in messages short.
pub fn clip(s: &str) -> String {
    const MAX: usize = 80;
    if s.chars().count() <= MAX {
        s.to_string()
    } else {
        let head: String = s.chars().take(MAX - 1).collect();
        format!("{head}…")
    }
}

/// Render diagnostics as `path:line:col: error[E001]: message` lines.
pub fn render(diags: &[Diagnostic], sources: &dyn Fn(&str) -> Option<String>) -> String {
    let mut out = String::new();
    for d in diags {
        let (line, col) = match sources(&d.span.file) {
            Some(text) => LineIndex::new(&text).position(d.span.start),
            None => (0, 0),
        };
        let sev = match d.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::Info => "info",
        };
        out.push_str(&format!("{}:{}:{}: {}[{}]: {}\n", d.span.file, line, col, sev, d.code, d.message));
        if let Some(fix) = &d.fix {
            if fix.is_empty() {
                out.push_str("  help: remove it\n");
            } else {
                out.push_str(&format!("  help: replace with `{}`\n", fix.replace('\n', "\\n")));
            }
        }
    }
    out
}
