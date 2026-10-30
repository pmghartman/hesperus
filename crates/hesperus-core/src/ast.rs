//! The syntax tree, as written: templates unexpanded, comments kept.

use crate::diag::Span;

/// Words that cannot be node, template or variable names. Kind names are not reserved:
/// `store`, `network` or `host` are ordinary names for nodes.
pub const RESERVED: &[&str] = &["hesperus", "generated", "import", "require", "forbid", "let", "template", "each", "in", "true", "false"];

pub const NODE_KINDS: &[&str] =
    &["system", "subsystem", "component", "ingress", "egress", "store", "external", "network", "hardware"];
pub const EDGE_KINDS: &[&str] = &["calls", "reads", "writes", "http", "ws", "io"];
pub const PROTOCOLS: &[&str] = &["http", "ws", "grpc", "tcp", "udp", "ssh", "other"];
/// Property keys in canonical print order.
pub const PROPERTY_KEYS: &[&str] = &["desc", "src", "protocol", "host", "engine", "resolved", "at"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ident {
    pub text: String,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Str {
    pub text: String,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Path {
    pub segments: Vec<Ident>,
    pub span: Span,
}

impl Path {
    pub fn dotted(&self) -> String {
        self.segments.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(".")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    Str(Str),
    Ident(Ident),
    Bool(bool, Span),
    Number(String, Span),
    List(Vec<Value>, Span),
}

impl Value {
    pub fn span(&self) -> &Span {
        match self {
            Value::Str(s) => &s.span,
            Value::Ident(i) => &i.span,
            Value::Bool(_, s) | Value::Number(_, s) | Value::List(_, s) => s,
        }
    }
    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Str(_) => "string",
            Value::Ident(_) => "identifier",
            Value::Bool(..) => "boolean",
            Value::Number(..) => "number",
            Value::List(..) => "list",
        }
    }
}

/// Comments and blank lines before a statement, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Trivia {
    Comment(String),
    Blank,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Block {
    pub items: Vec<Stmt>,
    /// A comment on the `{` line.
    pub open_comment: Option<String>,
    /// Trivia before the closing brace.
    pub trailing: Vec<Trivia>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stmt {
    pub leading: Vec<Trivia>,
    pub trailing_comment: Option<String>,
    pub kind: StmtKind,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StmtKind {
    Node(NodeStmt),
    Edge(EdgeStmt),
    Constraint(ConstraintStmt),
    Property(PropertyStmt),
    Import(Str),
    Let(LetStmt),
    Template(TemplateStmt),
    Each(EachStmt),
    Call(CallStmt),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeStmt {
    /// One of NODE_KINDS; the parser only builds nodes with known kinds.
    pub kind: Ident,
    pub name: Ident,
    pub label: Option<Str>,
    pub block: Option<Block>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EdgeStmt {
    pub from: Path,
    pub to: Path,
    pub kind: Option<Ident>,
    pub label: Option<Str>,
    pub block: Option<Block>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstraintStmt {
    pub rule: Ident,
    pub from: Path,
    pub to: Path,
    pub kind: Option<Ident>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PropertyStmt {
    pub key: Ident,
    pub value: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LetStmt {
    pub name: Ident,
    pub list: Vec<Value>,
    pub list_span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemplateStmt {
    pub name: Ident,
    pub params: Vec<Ident>,
    pub body: Block,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EachSource {
    Name(Ident),
    List(Vec<Value>, Span),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EachStmt {
    pub var: Ident,
    pub source: EachSource,
    pub body: Block,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallStmt {
    pub name: Ident,
    pub args: Vec<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct File {
    pub path: String,
    /// Comments before the version line.
    pub leading: Vec<Trivia>,
    pub version: Option<Str>,
    pub generated: Option<Str>,
    /// Top-level statements: definitions and the root node(s).
    pub items: Vec<Stmt>,
    /// Trivia after the last statement.
    pub trailing: Vec<Trivia>,
}

impl File {
    pub fn root(&self) -> Option<&NodeStmt> {
        self.items.iter().find_map(|s| match &s.kind {
            StmtKind::Node(n) => Some(n),
            _ => None,
        })
    }
}
