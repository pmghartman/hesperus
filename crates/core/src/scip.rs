//! Minimal SCIP schema (field numbers from scip.proto) and symbol grammar.
use crate::ir::Range;
use prost::Message;

#[derive(Clone, PartialEq, Message)]
pub struct Index {
    #[prost(message, optional, tag = "1")]
    pub metadata: Option<Metadata>,
    #[prost(message, repeated, tag = "2")]
    pub documents: Vec<Document>,
    #[prost(message, repeated, tag = "3")]
    pub external_symbols: Vec<SymbolInformation>,
}

#[derive(Clone, PartialEq, Message)]
pub struct Metadata {
    #[prost(int32, tag = "1")]
    pub version: i32,
    #[prost(message, optional, tag = "2")]
    pub tool_info: Option<ToolInfo>,
    #[prost(string, tag = "3")]
    pub project_root: String,
    #[prost(int32, tag = "4")]
    pub text_document_encoding: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct ToolInfo {
    #[prost(string, tag = "1")]
    pub name: String,
    #[prost(string, tag = "2")]
    pub version: String,
    #[prost(string, repeated, tag = "3")]
    pub arguments: Vec<String>,
}

#[derive(Clone, PartialEq, Message)]
pub struct Document {
    #[prost(string, tag = "1")]
    pub relative_path: String,
    #[prost(message, repeated, tag = "2")]
    pub occurrences: Vec<Occurrence>,
    #[prost(message, repeated, tag = "3")]
    pub symbols: Vec<SymbolInformation>,
    #[prost(string, tag = "4")]
    pub language: String,
    #[prost(string, tag = "5")]
    pub text: String,
    #[prost(int32, tag = "6")]
    pub position_encoding: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct Occurrence {
    #[prost(int32, repeated, tag = "1")]
    pub range: Vec<i32>,
    #[prost(string, tag = "2")]
    pub symbol: String,
    #[prost(int32, tag = "3")]
    pub symbol_roles: i32,
    #[prost(int32, repeated, tag = "7")]
    pub enclosing_range: Vec<i32>,
    // Typed forms (oneof in scip.proto); preferred over the deprecated int arrays.
    #[prost(message, optional, tag = "8")]
    pub single_line_range: Option<SingleLineRange>,
    #[prost(message, optional, tag = "9")]
    pub multi_line_range: Option<MultiLineRange>,
    #[prost(message, optional, tag = "10")]
    pub single_line_enclosing_range: Option<SingleLineRange>,
    #[prost(message, optional, tag = "11")]
    pub multi_line_enclosing_range: Option<MultiLineRange>,
}

#[derive(Clone, PartialEq, Message)]
pub struct SingleLineRange {
    #[prost(int32, tag = "1")]
    pub line: i32,
    #[prost(int32, tag = "2")]
    pub start_character: i32,
    #[prost(int32, tag = "3")]
    pub end_character: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct MultiLineRange {
    #[prost(int32, tag = "1")]
    pub start_line: i32,
    #[prost(int32, tag = "2")]
    pub start_character: i32,
    #[prost(int32, tag = "3")]
    pub end_line: i32,
    #[prost(int32, tag = "4")]
    pub end_character: i32,
}

impl Occurrence {
    pub fn range(&self) -> Option<Range> {
        typed(&self.single_line_range, &self.multi_line_range).or_else(|| parse_range(&self.range))
    }
    pub fn enclosing(&self) -> Option<Range> {
        typed(&self.single_line_enclosing_range, &self.multi_line_enclosing_range)
            .or_else(|| parse_range(&self.enclosing_range))
    }
}

fn typed(s: &Option<SingleLineRange>, m: &Option<MultiLineRange>) -> Option<Range> {
    if let Some(r) = m {
        return Some(Range { start_line: r.start_line as u32, start_col: r.start_character as u32, end_line: r.end_line as u32, end_col: r.end_character as u32 });
    }
    s.as_ref().map(|r| Range { start_line: r.line as u32, start_col: r.start_character as u32, end_line: r.line as u32, end_col: r.end_character as u32 })
}

#[derive(Clone, PartialEq, Message)]
pub struct SymbolInformation {
    #[prost(string, tag = "1")]
    pub symbol: String,
    #[prost(string, repeated, tag = "3")]
    pub documentation: Vec<String>,
    #[prost(message, repeated, tag = "4")]
    pub relationships: Vec<Relationship>,
    #[prost(int32, tag = "5")]
    pub kind: i32,
    #[prost(string, tag = "6")]
    pub display_name: String,
    #[prost(message, optional, tag = "7")]
    pub signature_documentation: Option<Document>,
    #[prost(string, tag = "8")]
    pub enclosing_symbol: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct Relationship {
    #[prost(string, tag = "1")]
    pub symbol: String,
    #[prost(bool, tag = "2")]
    pub is_reference: bool,
    #[prost(bool, tag = "3")]
    pub is_implementation: bool,
    #[prost(bool, tag = "4")]
    pub is_type_definition: bool,
    #[prost(bool, tag = "5")]
    pub is_definition: bool,
}

pub const ROLE_DEFINITION: i32 = 0x1;
pub const KIND_FIELD: i32 = 15;
pub const KIND_VARIABLE: i32 = 61;
/// Constructor, Function, Method, AbstractMethod, MethodSpecification, StaticMethod.
pub const CALLABLE_KINDS: [i32; 6] = [9, 17, 26, 66, 67, 80];

pub fn decode(bytes: &[u8]) -> Result<Index, String> {
    Index::decode(bytes).map_err(|e| format!("invalid SCIP index: {e}"))
}

pub fn parse_range(r: &[i32]) -> Option<Range> {
    match r {
        [l, s, e] => Some(Range { start_line: *l as u32, start_col: *s as u32, end_line: *l as u32, end_col: *e as u32 }),
        [sl, sc, el, ec] => Some(Range { start_line: *sl as u32, start_col: *sc as u32, end_line: *el as u32, end_col: *ec as u32 }),
        _ => None,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DescKind {
    Namespace,
    Type,
    Term,
    Method,
    TypeParam,
    Parameter,
    Meta,
    Macro,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Descriptor {
    pub name: String,
    pub kind: DescKind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Symbol {
    pub package: String,
    pub descriptors: Vec<Descriptor>,
    /// Char offset in the source string where each descriptor ends.
    pub ends: Vec<usize>,
}

impl Symbol {
    /// Symbol string of the first `n` descriptors (n >= 1), cut from the original.
    pub fn prefix(&self, orig: &str, n: usize) -> String {
        orig.chars().take(self.ends[n - 1]).collect()
    }
}

/// None for `local N` symbols and anything malformed.
pub fn parse_symbol(s: &str) -> Option<Symbol> {
    if s.is_empty() || s.starts_with("local ") {
        return None;
    }
    // scheme manager name version, space-separated; "  " escapes a space.
    let mut parts: Vec<String> = Vec::new();
    let b: Vec<char> = s.chars().collect();
    let mut i = 0;
    while parts.len() < 4 {
        let mut cur = String::new();
        loop {
            if i >= b.len() {
                return None;
            }
            if b[i] == ' ' {
                if i + 1 < b.len() && b[i + 1] == ' ' {
                    cur.push(' ');
                    i += 2;
                    continue;
                }
                i += 1;
                break;
            }
            cur.push(b[i]);
            i += 1;
        }
        parts.push(cur);
    }
    let package = parts[2].clone();
    let rest = &b[i..];
    let base = i;
    let mut descriptors = Vec::new();
    let mut ends = Vec::new();
    let mut j = 0;
    while j < rest.len() {
        let mut name = String::new();
        if rest[j] == '[' || rest[j] == '(' {
            let close = if rest[j] == '[' { ']' } else { ')' };
            j += 1;
            while j < rest.len() && rest[j] != close {
                name.push(rest[j]);
                j += 1;
            }
            j += 1;
            descriptors.push(Descriptor {
                name,
                kind: if close == ']' { DescKind::TypeParam } else { DescKind::Parameter },
            });
            ends.push(base + j);
            continue;
        }
        if rest[j] == '`' {
            j += 1;
            while j < rest.len() {
                if rest[j] == '`' {
                    if j + 1 < rest.len() && rest[j + 1] == '`' {
                        name.push('`');
                        j += 2;
                        continue;
                    }
                    j += 1;
                    break;
                }
                name.push(rest[j]);
                j += 1;
            }
        } else {
            while j < rest.len() && !matches!(rest[j], '/' | '#' | '.' | ':' | '!' | '(') {
                name.push(rest[j]);
                j += 1;
            }
        }
        let kind = match rest.get(j) {
            Some('/') => DescKind::Namespace,
            Some('#') => DescKind::Type,
            Some('.') => DescKind::Term,
            Some(':') => DescKind::Meta,
            Some('!') => DescKind::Macro,
            Some('(') => {
                // method: name(disambiguator).
                while j < rest.len() && rest[j] != ')' {
                    j += 1;
                }
                j += 1; // ')'
                DescKind::Method
            }
            _ => return None,
        };
        j += 1; // suffix char ('.' of a method, or the single suffix)
        descriptors.push(Descriptor { name, kind });
        ends.push(base + j);
    }
    Some(Symbol { package, descriptors, ends })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_method_symbol() {
        let s = parse_symbol("scip-go gomod example.com/m v1 pkg/sub/Type#Method().").unwrap();
        assert_eq!(s.package, "example.com/m");
        let orig = "scip-go gomod example.com/m v1 pkg/sub/Type#Method().";
        assert_eq!(s.prefix(orig, 3), "scip-go gomod example.com/m v1 pkg/sub/Type#");
        let k: Vec<_> = s.descriptors.iter().map(|d| (d.name.as_str(), d.kind)).collect();
        assert_eq!(
            k,
            vec![
                ("pkg", DescKind::Namespace),
                ("sub", DescKind::Namespace),
                ("Type", DescKind::Type),
                ("Method", DescKind::Method)
            ]
        );
    }

    #[test]
    fn local_is_none() {
        assert!(parse_symbol("local 12").is_none());
    }
}
