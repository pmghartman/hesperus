//! The printer: IR → canonical `.hesp` files.

use crate::ast::*;
use crate::diag::Span;
use crate::format::format_file;
use crate::ir::*;
use crate::lower::{dirname, relative, resolve_in};
use std::collections::{BTreeMap, HashSet};

/// Print an IR as its canonical files: `(relative path, text)`, master first.
pub fn print(ir: &Ir) -> Vec<(String, String)> {
    let mut ir = ir.clone();
    ir.canonicalize();
    let files: Vec<FileEntry> = if ir.files.is_empty() { vec![FileEntry { path: format!("{}.hesp", ir.root), root: ir.root.clone() }] } else { ir.files.clone() };
    let file_of_root: BTreeMap<String, String> = files.iter().map(|f| (f.root.clone(), f.path.clone())).collect();
    let ids: HashSet<String> = ir.nodes.iter().map(|n| n.id.clone()).collect();

    // which block each edge and constraint prints in
    let mut edges_in: BTreeMap<String, Vec<&Edge>> = BTreeMap::new();
    for e in &ir.edges {
        edges_in.entry(placement(&ir, &e.from, &e.to)).or_default().push(e);
    }
    let mut cons_in: BTreeMap<String, Vec<&Constraint>> = BTreeMap::new();
    for c in &ir.constraints {
        cons_in.entry(placement(&ir, &c.from, &c.to)).or_default().push(c);
    }
    let ctx = Ctx { ir: &ir, ids, file_of_root: &file_of_root, edges_in, cons_in };

    let mut out = Vec::new();
    for f in &files {
        let Some(root) = ir.node(&f.root) else { continue };
        let stmt = ctx.node_stmt(root, &f.path);
        let file = File {
            path: f.path.clone(),
            leading: vec![],
            version: Some(Str { text: VERSION.into(), span: Span::default() }),
            version_comment: None,
            generated: ir.generated.as_ref().map(|g| Str { text: g.clone(), span: Span::default() }),
            generated_comment: None,
            items: vec![stmt],
            trailing: vec![],
        };
        out.push((f.path.clone(), format_file(&file)));
    }
    out
}

/// The block an edge or constraint between `a` and `b` prints in: their lowest common
/// ancestor, or its parent when one endpoint is that ancestor itself.
fn placement(ir: &Ir, a: &str, b: &str) -> String {
    let lca = Ir::lca(a, b);
    if (lca == a || lca == b) && lca != ir.root {
        match lca.rfind('.') {
            Some(i) => lca[..i].to_string(),
            None => lca,
        }
    } else if lca.is_empty() {
        ir.root.clone()
    } else {
        lca
    }
}

struct Ctx<'a> {
    ir: &'a Ir,
    ids: HashSet<String>,
    file_of_root: &'a BTreeMap<String, String>,
    edges_in: BTreeMap<String, Vec<&'a Edge>>,
    cons_in: BTreeMap<String, Vec<&'a Constraint>>,
}

fn ident(s: &str) -> Ident {
    Ident { text: s.to_string(), span: Span::default() }
}
fn string(s: &str) -> Str {
    // a literal `$` must survive the lexer's interpolation: escape it
    Str { text: s.replace('$', &crate::lexer::ESCAPED_DOLLAR.to_string()), span: Span::default() }
}
fn stmt(kind: StmtKind, blank_before: bool) -> Stmt {
    Stmt { leading: if blank_before { vec![Trivia::Blank] } else { vec![] }, trailing_comment: None, kind, span: Span::default() }
}
fn prop(key: &str, value: Value) -> StmtKind {
    StmtKind::Property(PropertyStmt { key: ident(key), value })
}
fn str_or_list(items: &[String]) -> Value {
    if items.len() == 1 {
        Value::Str(string(&items[0]))
    } else {
        Value::List(items.iter().map(|s| Value::Str(string(s))).collect(), Span::default())
    }
}

impl<'a> Ctx<'a> {
    fn node_stmt(&self, n: &Node, file: &str) -> Stmt {
        let mut groups: Vec<Vec<StmtKind>> = Vec::new();
        // properties
        let mut props = Vec::new();
        if let Some(d) = &n.desc {
            props.push(prop("desc", Value::Str(string(d))));
        }
        if !n.src.is_empty() {
            props.push(prop("src", str_or_list(&n.src)));
        }
        if let Some(p) = &n.protocol {
            props.push(prop("protocol", Value::Ident(ident(p.as_str()))));
        }
        if let Some(h) = &n.host {
            props.push(prop("host", Value::Str(string(h))));
        }
        if let Some(e) = &n.engine {
            props.push(prop("engine", Value::Str(string(e))));
        }
        if !n.at.is_empty() {
            props.push(prop("at", str_or_list(&n.at)));
        }
        groups.push(props);
        // imports and children
        let mut children = self.ir.children(&n.id);
        children.sort_by(|a, b| (a.kind.rank(), &a.name).cmp(&(b.kind.rank(), &b.name)));
        let mut imports = Vec::new();
        let mut inline = Vec::new();
        for c in children {
            if let Some(path) = self.file_of_root.get(&c.id) {
                imports.push(StmtKind::Import(string(&relative(dirname(file), path))));
            } else {
                inline.push(self.node_stmt(c, file));
            }
        }
        imports.sort_by(|a, b| match (a, b) {
            (StmtKind::Import(x), StmtKind::Import(y)) => x.text.cmp(&y.text),
            _ => std::cmp::Ordering::Equal,
        });
        groups.push(imports);
        // edges
        let mut edges = Vec::new();
        if let Some(es) = self.edges_in.get(&n.id) {
            for e in es {
                let mut block_items = Vec::new();
                if let Some(d) = &e.desc {
                    block_items.push(stmt(prop("desc", Value::Str(string(d))), false));
                }
                if !e.resolved {
                    block_items.push(stmt(prop("resolved", Value::Bool(false, Span::default())), false));
                }
                if !e.at.is_empty() {
                    block_items.push(stmt(prop("at", str_or_list(&e.at)), false));
                }
                edges.push(StmtKind::Edge(EdgeStmt {
                    from: self.path_from(&n.id, &e.from),
                    to: self.path_from(&n.id, &e.to),
                    kind: Some(ident(e.kind.as_str())),
                    label: e.label.as_ref().map(|l| string(l)),
                    block: if block_items.is_empty() { None } else { Some(Block { items: block_items, open_comment: None, trailing: vec![], span: Span::default() }) },
                }));
            }
        }
        let mut cons = Vec::new();
        if let Some(cs) = self.cons_in.get(&n.id) {
            for c in cs {
                cons.push(StmtKind::Constraint(ConstraintStmt {
                    rule: ident(c.rule.as_str()),
                    from: self.path_from(&n.id, &c.from),
                    to: self.path_from(&n.id, &c.to),
                    kind: c.kind.map(|k| ident(k.as_str())),
                }));
            }
        }
        // assemble: properties | imports | children | edges | constraints
        let mut items: Vec<Stmt> = Vec::new();
        let mut first_group = true;
        let mut push_group = |g: Vec<Stmt>, items: &mut Vec<Stmt>| {
            if g.is_empty() {
                return;
            }
            let mut g = g;
            if !first_group {
                g[0].leading.insert(0, Trivia::Blank);
            }
            first_group = false;
            items.extend(g);
        };
        for g in groups {
            push_group(g.into_iter().map(|k| stmt(k, false)).collect(), &mut items);
        }
        push_group(inline, &mut items);
        push_group(edges.into_iter().map(|k| stmt(k, false)).collect(), &mut items);
        push_group(cons.into_iter().map(|k| stmt(k, false)).collect(), &mut items);
        let block = if items.is_empty() { None } else { Some(Block { items, open_comment: None, trailing: vec![], span: Span::default() }) };
        stmt(
            StmtKind::Node(NodeStmt { kind: ident(n.kind.as_str()), name: ident(&n.name), label: n.label.as_ref().map(|l| string(l)), block }),
            false,
        )
    }

    /// The shortest path to `target` that resolves correctly from inside `scope`'s block.
    fn path_from(&self, scope: &str, target: &str) -> Path {
        let candidates: Vec<String> = {
            let mut c = Vec::new();
            if target.len() > scope.len() && target.starts_with(scope) && target.as_bytes()[scope.len()] == b'.' {
                c.push(target[scope.len() + 1..].to_string());
            }
            if target == scope {
                c.push(target.rsplit('.').next().unwrap().to_string());
            }
            // relative to each ancestor
            let mut anc = scope.rfind('.').map(|i| &scope[..i]);
            while let Some(a) = anc {
                if target.len() > a.len() && target.starts_with(a) && target.as_bytes()[a.len()] == b'.' {
                    c.push(target[a.len() + 1..].to_string());
                }
                anc = a.rfind('.').map(|i| &a[..i]);
            }
            c.push(target.to_string());
            c
        };
        for cand in candidates {
            let path = make_path(&cand);
            if resolve_in(&self.ids, &self.ir.root, &path, scope).as_deref() == Some(target) {
                return path;
            }
        }
        make_path(target)
    }
}

fn make_path(dotted: &str) -> Path {
    Path { segments: dotted.split('.').map(ident).collect(), span: Span::default() }
}
