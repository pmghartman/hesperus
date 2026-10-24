//! What core needs from a language's syntax. Implementations live in separate crates.
use crate::ir::Range;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CallSite {
    /// Name token of the callee when there is one, else the whole callee expression.
    pub callee: Range,
    pub callee_text: String,
    pub args: Vec<Range>,
    /// Result feeds an assignment, argument, return, or operand.
    pub result_used: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParamDecl {
    pub name: String,
    /// Name token. Unnamed parameters have no declaration and are not listed.
    pub range: Range,
    /// Position among the function's parameters, receiver excluded.
    pub index: usize,
    /// Full range of the declaring function.
    pub decl: Range,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Facts {
    pub calls: Vec<CallSite>,
    pub params: Vec<ParamDecl>,
    /// Full ranges of named function/method declarations.
    pub decls: Vec<Range>,
}

pub trait Syntax {
    fn facts(&self, source: &str) -> Facts;
}
