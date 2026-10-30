//! hesperus-core: the Hesperus descriptor language.
//!
//! Pipeline: `lexer` → `parser` (AST) → `expand` (templates, each) → `lower`
//! (imports, ids, resolution, validation) → `ir`. `format` prints the AST,
//! `print` prints the IR, `diff` merges two IRs.

pub mod ast;
pub mod diag;
pub mod diff;
pub mod expand;
pub mod format;
pub mod ir;
pub mod lexer;
pub mod lower;
pub mod parser;
pub mod print;
pub mod project;

pub use diag::{Diagnostic, Severity, Span};
pub use ir::Ir;
pub use lower::{load, Project, Source};
