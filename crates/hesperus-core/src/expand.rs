//! Expansion of `let`, `template`, `each` and calls into a plain tree of statements.
//! Every construct is total: expansion always terminates and is bounded.

use crate::ast::*;
use crate::diag::{Diagnostic, Span};
use std::collections::HashMap;

pub const MAX_LIST: usize = 256;
pub const MAX_DEPTH: usize = 4;
pub const MAX_STATEMENTS: usize = 10_000;

#[derive(Clone, Debug)]
enum Bound {
    Text(String),
    List(Vec<Value>),
}

struct Expander<'a> {

    lets: HashMap<String, (Vec<Value>, Span)>,
    templates: HashMap<String, (usize, &'a TemplateStmt)>,
    diags: Vec<Diagnostic>,
    count: usize,
    exhausted: bool,
}

pub struct Expanded {
    /// The root node(s) with every repetition construct expanded.
    pub roots: Vec<NodeStmt>,
    pub diags: Vec<Diagnostic>,
}

pub fn expand(file: &File) -> Expanded {
    let mut ex = Expander { lets: HashMap::new(), templates: HashMap::new(), diags: Vec::new(), count: 0, exhausted: false };
    let mut roots = Vec::new();
    let mut root_spans = Vec::new();
    for (i, item) in file.items.iter().enumerate() {
        match &item.kind {
            StmtKind::Let(l) => {
                if ex.lets.contains_key(&l.name.text) || ex.templates.contains_key(&l.name.text) {
                    ex.diags.push(Diagnostic::error("E027", l.name.span.clone(), format!("`{}` is defined twice", l.name.text)));
                    continue;
                }
                if l.list.len() > MAX_LIST {
                    ex.diags.push(Diagnostic::error("E021", l.list_span.clone(), format!("a list holds at most {MAX_LIST} items")));
                }
                for v in &l.list {
                    if !matches!(v, Value::Str(_) | Value::Ident(_)) {
                        ex.diags.push(Diagnostic::error("E009", v.span().clone(), format!("list items are identifiers or strings, not {}", v.type_name())));
                    }
                }
                ex.lets.insert(l.name.text.clone(), (l.list.clone(), l.list_span.clone()));
            }
            StmtKind::Template(t) => {
                if ex.templates.contains_key(&t.name.text) || ex.lets.contains_key(&t.name.text) {
                    ex.diags.push(Diagnostic::error("E027", t.name.span.clone(), format!("`{}` is defined twice", t.name.text)));
                    continue;
                }
                ex.templates.insert(t.name.text.clone(), (i, t));
            }
            StmtKind::Node(n) => {
                let empty = HashMap::new();
                if let Some(n) = ex.node(n, &empty, 0, usize::MAX) {
                    roots.push(n);
                }
                root_spans.push(item.span.clone());
            }
            StmtKind::Import(s) => {
                ex.diags.push(Diagnostic::error("E003", s.span.clone(), "`import` belongs inside a container's block"));
            }
            StmtKind::Property(p) => {
                ex.diags.push(Diagnostic::error("E003", p.key.span.clone(), "a property belongs inside a node's block"));
            }
            StmtKind::Edge(e) => {
                ex.diags.push(Diagnostic::error("E003", e.from.span.clone(), "an edge belongs inside a container's block"));
            }
            StmtKind::Constraint(c) => {
                ex.diags.push(Diagnostic::error("E003", c.rule.span.clone(), "a constraint belongs inside a container's block"));
            }
            StmtKind::Each(e) => {
                ex.diags.push(Diagnostic::error("E003", e.var.span.clone(), "`each` belongs inside a container's block"));
            }
            StmtKind::Call(c) => {
                ex.diags.push(Diagnostic::error("E003", c.name.span.clone(), "a template call belongs inside a container's block"));
            }
        }
    }
    if roots.is_empty() && file.items.iter().any(|s| !matches!(s.kind, StmtKind::Let(_) | StmtKind::Template(_))) || roots.is_empty() {
        let span = Span::new(&file.path, 0, 0);
        if !file.items.iter().any(|s| matches!(s.kind, StmtKind::Node(_))) {
            ex.diags.push(Diagnostic::error("E015", span, "a file must hold exactly one root node (a system or subsystem)"));
        }
    } else if roots.len() > 1 {
        for s in root_spans.iter().skip(1) {
            ex.diags.push(Diagnostic::error("E015", s.clone(), "a file must hold exactly one root node; move this into its own file and import it"));
        }
    }
    Expanded { roots, diags: ex.diags }
}

impl<'a> Expander<'a> {
    fn tick(&mut self, span: &Span) -> bool {
        self.count += 1;
        if self.count > MAX_STATEMENTS {
            if !self.exhausted {
                self.exhausted = true;
                self.diags.push(Diagnostic::error("E021", span.clone(), format!("expansion exceeds {MAX_STATEMENTS} statements")));
            }
            return false;
        }
        true
    }

    fn node(&mut self, n: &NodeStmt, env: &HashMap<String, Bound>, depth: usize, before: usize) -> Option<NodeStmt> {
        if !self.tick(&n.name.span) {
            return None;
        }
        let name = self.ident(&n.name, env)?;
        let label = match &n.label {
            Some(l) => Some(self.string(l, env)),
            None => None,
        };
        let block = n.block.as_ref().map(|b| self.block(b, env, depth, before));
        Some(NodeStmt { kind: n.kind.clone(), name, label, block })
    }

    fn block(&mut self, b: &Block, env: &HashMap<String, Bound>, depth: usize, before: usize) -> Block {
        let mut items = Vec::new();
        for s in &b.items {
            self.stmt(s, env, depth, before, &mut items);
        }
        Block { items, open_comment: None, trailing: Vec::new(), span: b.span.clone() }
    }

    fn stmt(&mut self, s: &Stmt, env: &HashMap<String, Bound>, depth: usize, before: usize, out: &mut Vec<Stmt>) {
        let mk = |kind: StmtKind, span: &Span| Stmt { leading: Vec::new(), trailing_comment: None, kind, span: span.clone() };
        match &s.kind {
            StmtKind::Node(n) => {
                if let Some(n) = self.node(n, env, depth, before) {
                    out.push(mk(StmtKind::Node(n), &s.span));
                }
            }
            StmtKind::Edge(e) => {
                if !self.tick(&s.span) {
                    return;
                }
                let from = self.path(&e.from, env);
                let to = self.path(&e.to, env);
                let (Some(from), Some(to)) = (from, to) else { return };
                let label = e.label.as_ref().map(|l| self.string(l, env));
                let block = e.block.as_ref().map(|b| self.block(b, env, depth, before));
                out.push(mk(StmtKind::Edge(EdgeStmt { from, to, kind: e.kind.clone(), label, block }), &s.span));
            }
            StmtKind::Constraint(c) => {
                if !self.tick(&s.span) {
                    return;
                }
                let from = self.path(&c.from, env);
                let to = self.path(&c.to, env);
                let (Some(from), Some(to)) = (from, to) else { return };
                out.push(mk(StmtKind::Constraint(ConstraintStmt { rule: c.rule.clone(), from, to, kind: c.kind.clone() }), &s.span));
            }
            StmtKind::Property(p) => {
                let value = match self.value(&p.value, env) {
                    Some(v) => v,
                    None => return,
                };
                out.push(mk(StmtKind::Property(PropertyStmt { key: p.key.clone(), value }), &s.span));
            }
            StmtKind::Import(i) => {
                if depth > 0 {
                    self.diags.push(Diagnostic::error("E003", i.span.clone(), "`import` cannot appear inside a template or `each` body"));
                    return;
                }
                out.push(mk(StmtKind::Import(i.clone()), &s.span));
            }
            StmtKind::Let(l) => {
                self.diags.push(Diagnostic::error("E003", l.name.span.clone(), "`let` belongs at the top of the file, before the root node"));
            }
            StmtKind::Template(t) => {
                self.diags.push(Diagnostic::error("E003", t.name.span.clone(), "`template` belongs at the top of the file, before the root node"));
            }
            StmtKind::Each(e) => {
                if depth + 1 > MAX_DEPTH {
                    self.diags.push(Diagnostic::error("E021", e.var.span.clone(), format!("bodies nest at most {MAX_DEPTH} levels deep")));
                    return;
                }
                let items: Vec<Value> = match &e.source {
                    EachSource::List(items, span) => {
                        if items.len() > MAX_LIST {
                            self.diags.push(Diagnostic::error("E021", span.clone(), format!("a list holds at most {MAX_LIST} items")));
                            return;
                        }
                        items.clone()
                    }
                    EachSource::Name(name) => match env.get(&name.text) {
                        Some(Bound::List(items)) => items.clone(),
                        Some(Bound::Text(_)) => {
                            self.diags.push(Diagnostic::error("E009", name.span.clone(), format!("`{}` is a value, not a list", name.text)));
                            return;
                        }
                        None => match self.lets.get(&name.text) {
                            Some((items, _)) => items.clone(),
                            None => {
                                let mut d = Diagnostic::error("E020", name.span.clone(), format!("undefined list `{}`", name.text));
                                let mut names: Vec<&str> = self.lets.keys().map(|s| s.as_str()).collect();
                                names.sort();
                                d.fix = crate::diag::nearest(&name.text, names.into_iter()).map(|s| s.to_string());
                                self.diags.push(d);
                                return;
                            }
                        },
                    },
                };
                let literal = matches!(e.source, EachSource::List(..));
                for item in items {
                    let text = match self.value(&item, env) {
                        Some(Value::Str(s)) => s.text,
                        Some(Value::Ident(i)) => i.text,
                        Some(other) => {
                            if literal {
                                self.diags.push(Diagnostic::error("E009", other.span().clone(), format!("`each` iterates identifiers or strings, not {}", other.type_name())));
                            }
                            continue;
                        }
                        None => return,
                    };
                    let mut env2 = env.clone();
                    env2.insert(e.var.text.clone(), Bound::Text(text));
                    for inner in &e.body.items {
                        self.stmt(inner, &env2, depth + 1, before, out);
                    }
                }
            }
            StmtKind::Call(c) => {
                let (idx, t) = match self.templates.get(&c.name.text) {
                    Some(t) => (t.0, t.1),
                    None => {
                        let mut d = Diagnostic::error("E017", c.name.span.clone(), format!("undefined template `{}`", c.name.text));
                        let mut names: Vec<&str> = self.templates.keys().map(|s| s.as_str()).collect();
                        names.sort();
                        d.fix = crate::diag::nearest(&c.name.text, names.into_iter()).map(|s| s.to_string());
                        self.diags.push(d);
                        return;
                    }
                };
                if idx >= before {
                    self.diags.push(Diagnostic::error("E019", c.name.span.clone(), format!("`{}` may only call templates defined earlier in the file", c.name.text)));
                    return;
                }
                if c.args.len() != t.params.len() {
                    self.diags.push(Diagnostic::error("E018", c.name.span.clone(), format!("`{}` takes {} argument(s), {} given", c.name.text, t.params.len(), c.args.len())));
                    return;
                }
                if depth + 1 > MAX_DEPTH {
                    self.diags.push(Diagnostic::error("E021", c.name.span.clone(), format!("bodies nest at most {MAX_DEPTH} levels deep")));
                    return;
                }
                let mut env2 = HashMap::new();
                for (p, a) in t.params.iter().zip(c.args.iter()) {
                    let v = match self.value(a, env) {
                        Some(v) => v,
                        None => return,
                    };
                    let bound = match v {
                        Value::Str(s) => Bound::Text(s.text),
                        Value::Ident(i) => Bound::Text(i.text),
                        Value::List(items, _) => Bound::List(items),
                        other => {
                            self.diags.push(Diagnostic::error("E009", other.span().clone(), format!("template arguments are identifiers, strings or lists, not {}", other.type_name())));
                            return;
                        }
                    };
                    env2.insert(p.text.clone(), bound);
                }
                for inner in &t.body.items {
                    self.stmt(inner, &env2, depth + 1, idx, out);
                }
            }
        }
    }

    fn value(&mut self, v: &Value, env: &HashMap<String, Bound>) -> Option<Value> {
        match v {
            Value::Str(s) => Some(Value::Str(self.string(s, env))),
            Value::Ident(i) => {
                // a bare `$p` may stand for a whole value, including a list
                if let Some(name) = i.text.strip_prefix('$') {
                    let name = name.trim_start_matches('{').trim_end_matches('}');
                    if let Some(Bound::List(items)) = env.get(name) {
                        return Some(Value::List(items.clone(), i.span.clone()));
                    }
                }
                let text = self.interpolate(&i.text, &i.span, env)?;
                Some(Value::Ident(Ident { text, span: i.span.clone() }))
            }
            Value::List(items, span) => {
                let mut out = Vec::new();
                for it in items {
                    out.push(self.value(it, env)?);
                }
                Some(Value::List(out, span.clone()))
            }
            other => Some(other.clone()),
        }
    }

    fn string(&mut self, s: &Str, env: &HashMap<String, Bound>) -> Str {
        let text = self.interpolate(&s.text, &s.span, env).unwrap_or_else(|| s.text.clone());
        Str { text: text.replace("\\$", "$"), span: s.span.clone() }
    }

    fn ident(&mut self, i: &Ident, env: &HashMap<String, Bound>) -> Option<Ident> {
        if !i.text.contains('$') {
            return Some(i.clone());
        }
        let text = self.interpolate(&i.text, &i.span, env)?;
        if !crate::lexer::is_valid_ident(&text) {
            self.diags.push(Diagnostic::error("E022", i.span.clone(), format!("`{}` expands to `{}`, which is not a valid identifier", i.text, text)));
            return None;
        }
        Some(Ident { text, span: i.span.clone() })
    }

    fn path(&mut self, p: &Path, env: &HashMap<String, Bound>) -> Option<Path> {
        let mut segments = Vec::new();
        for s in &p.segments {
            segments.push(self.ident(s, env)?);
        }
        Some(Path { segments, span: p.span.clone() })
    }

    /// Replace `$x` and `${x}`; `\$` stays as an escaped dollar for strings.
    fn interpolate(&mut self, text: &str, span: &Span, env: &HashMap<String, Bound>) -> Option<String> {
        if !text.contains('$') {
            return Some(text.to_string());
        }
        let mut out = String::new();
        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;
        while i < chars.len() {
            let c = chars[i];
            if c == '\\' && i + 1 < chars.len() && chars[i + 1] == '$' {
                out.push('\\');
                out.push('$');
                i += 2;
                continue;
            }
            if c != '$' {
                out.push(c);
                i += 1;
                continue;
            }
            i += 1;
            let name: String = if i < chars.len() && chars[i] == '{' {
                let start = i + 1;
                let mut j = start;
                while j < chars.len() && chars[j] != '}' {
                    j += 1;
                }
                let n: String = chars[start..j].iter().collect();
                i = (j + 1).min(chars.len());
                n
            } else {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                chars[start..i].iter().collect()
            };
            if env.is_empty() && self.templates.is_empty() && self.lets.is_empty() {
                self.diags.push(Diagnostic::error("E028", span.clone(), format!("`${name}` outside a template or `each` body")));
                return None;
            }
            match env.get(&name) {
                Some(Bound::Text(t)) => out.push_str(t),
                Some(Bound::List(_)) => {
                    self.diags.push(Diagnostic::error("E009", span.clone(), format!("`${name}` is a list and cannot be spliced into text")));
                    return None;
                }
                None => {
                    let code = if env.is_empty() { "E028" } else { "E020" };
                    let msg = if env.is_empty() { format!("`${name}` outside a template or `each` body") } else { format!("undefined variable `${name}`") };
                    let mut d = Diagnostic::error(code, span.clone(), msg);
                    let mut names: Vec<&str> = env.keys().map(|s| s.as_str()).collect();
                    names.sort();
                    d.fix = crate::diag::nearest(&name, names.into_iter()).map(|s| format!("${s}"));
                    self.diags.push(d);
                    return None;
                }
            }
        }
        Some(out)
    }
}
