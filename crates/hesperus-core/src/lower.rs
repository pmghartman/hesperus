//! Linking and validation: parse the master, expand, follow imports, assign ids,
//! resolve paths, check properties, and build the IR.

use crate::ast::*;
use crate::diag::{clip, nearest, Diagnostic, Span};
use crate::expand::expand;
use crate::ir::*;
use crate::parser::parse;
use std::collections::{BTreeMap, HashSet};

/// Why a file could not be read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadError {
    Missing(String),
    /// Byte offset of the first invalid sequence.
    NotUtf8(usize),
}

/// Where files come from: disk, or an in-memory map (the language server).
pub trait Source {
    fn read(&self, path: &str) -> Result<String, ReadError>;
}

/// Decode bytes, reporting where UTF-8 breaks instead of failing silently.
pub fn decode(bytes: Vec<u8>) -> Result<String, ReadError> {
    String::from_utf8(bytes).map_err(|e| ReadError::NotUtf8(e.utf8_error().valid_up_to()))
}

pub struct Loaded {
    pub path: String,
    pub text: String,
    pub ast: File,
    pub expanded: Vec<NodeStmt>,
}

/// A reference to a node id from a path segment in the source.
#[derive(Debug, Clone)]
pub struct Reference {
    pub id: String,
    pub span: Span,
}

pub struct Project {
    pub master: String,
    pub files: Vec<Loaded>,
    pub ir: Ir,
    pub diags: Vec<Diagnostic>,
    /// Where each node id is declared (its name token).
    pub defs: BTreeMap<String, Span>,
    /// Every path segment that resolved, with the id it names.
    pub refs: Vec<Reference>,
    /// Each import statement's string span, and the file it loads.
    pub imports: Vec<(Span, String)>,
}

impl Project {
    pub fn has_errors(&self) -> bool {
        self.diags.iter().any(|d| d.severity == crate::diag::Severity::Error)
    }
    pub fn text_of(&self, path: &str) -> Option<&str> {
        self.files.iter().find(|f| f.path == path).map(|f| f.text.as_str())
    }
}

/// Normalize `a/./b/../c` to `a/c`, keeping leading `../` segments.
pub fn normalize(path: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    let absolute = path.starts_with('/');
    for seg in path.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if matches!(out.last(), Some(&s) if s != "..") {
                    out.pop();
                } else if !absolute {
                    out.push("..");
                }
            }
            s => out.push(s),
        }
    }
    let joined = out.join("/");
    if absolute {
        format!("/{joined}")
    } else if joined.is_empty() {
        ".".into()
    } else {
        joined
    }
}

pub fn dirname(path: &str) -> &str {
    match path.rfind('/') {
        Some(i) => &path[..i],
        None => "",
    }
}

pub fn join(dir: &str, rel: &str) -> String {
    if rel.starts_with('/') {
        return normalize(rel);
    }
    if dir.is_empty() {
        normalize(rel)
    } else {
        normalize(&format!("{dir}/{rel}"))
    }
}

/// Path of `target` relative to directory `from_dir`.
pub fn relative(from_dir: &str, target: &str) -> String {
    let na = normalize(from_dir);
    let nb = normalize(target);
    let a: Vec<&str> = na.split('/').filter(|s| !s.is_empty() && *s != ".").collect();
    let b: Vec<&str> = nb.split('/').filter(|s| !s.is_empty() && *s != ".").collect();
    let mut i = 0;
    while i < a.len() && i < b.len() && a[i] == b[i] {
        i += 1;
    }
    let mut out: Vec<String> = Vec::new();
    for _ in i..a.len() {
        out.push("..".into());
    }
    for seg in &b[i..] {
        out.push(seg.to_string());
    }
    if out.first().map(|s| s != "..").unwrap_or(true) {
        out.insert(0, ".".into());
    }
    out.join("/")
}

struct PendingEdge {
    scope: String,
    stmt: EdgeStmt,
    span: Span,
}
struct PendingConstraint {
    scope: String,
    stmt: ConstraintStmt,
}

struct Linker<'a> {
    source: &'a dyn Source,
    master_dir: String,
    files: Vec<Loaded>,
    loaded_paths: HashSet<String>,
    ir: Ir,
    diags: Vec<Diagnostic>,
    defs: BTreeMap<String, Span>,
    refs: Vec<Reference>,
    imports: Vec<(Span, String)>,
    edges: Vec<PendingEdge>,
    constraints: Vec<PendingConstraint>,
    ids: HashSet<String>,
    root_is_system: bool,
}

pub fn load(master: &str, source: &dyn Source) -> Project {
    let master = normalize(master);
    let mut lk = Linker {
        source,
        master_dir: dirname(&master).to_string(),
        files: Vec::new(),
        loaded_paths: HashSet::new(),
        ir: Ir::new(""),
        diags: Vec::new(),
        defs: BTreeMap::new(),
        refs: Vec::new(),
        imports: Vec::new(),
        edges: Vec::new(),
        constraints: Vec::new(),
        ids: HashSet::new(),
        root_is_system: false,
    };
    let text = match source.read(&master) {
        Ok(t) => t,
        Err(ReadError::Missing(why)) => {
            lk.diags.push(Diagnostic::error("E012", Span::new(&master, 0, 0), format!("cannot read `{master}`: {why}")));
            return lk.finish(master);
        }
        Err(ReadError::NotUtf8(at)) => {
            lk.diags.push(Diagnostic::error("E034", Span::new(&master, at, at + 1), format!("file is not valid UTF-8 at byte {at}")));
            lk.remember_lossy(&master);
            return lk.finish(master);
        }
    };
    let roots = lk.load_file(&master, text);
    if let Some(root) = roots.first() {
        let root = root.clone();
        let generated = lk.files[0].ast.generated.as_ref().map(|g| g.text.clone());
        lk.ir.generated = generated;
        lk.ir.root = root.name.text.clone();
        lk.root_is_system = root.kind.text == "system";
        let fidx = 0;
        lk.ir.files.push(FileEntry { path: lk.file_entry_path(&master), root: root.name.text.clone() });
        lk.build(&root, None, fidx, true);
        lk.resolve_all();
    }
    lk.finish(master)
}

impl<'a> Linker<'a> {
    fn finish(mut self, master: String) -> Project {
        self.ir.canonicalize();
        // deterministic diagnostics order: by file (master first), then offset
        let order: Vec<String> = self.files.iter().map(|f| f.path.clone()).collect();
        self.diags.sort_by_key(|d| (order.iter().position(|p| *p == d.span.file).unwrap_or(usize::MAX), d.span.start, d.code));
        self.diags.dedup();
        Project { master, files: self.files, ir: self.ir, diags: self.diags, defs: self.defs, refs: self.refs, imports: self.imports }
    }

    /// Keep a lossy decoding of an undecodable file so diagnostics can be positioned in it.
    fn remember_lossy(&mut self, path: &str) {
        let text = std::fs::read(path).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        let parsed = parse(path, "");
        self.files.push(Loaded { path: path.to_string(), text, ast: parsed.file, expanded: Vec::new() });
    }

    fn file_entry_path(&self, path: &str) -> String {
        let rel = relative(&self.master_dir, path);
        rel.strip_prefix("./").unwrap_or(&rel).to_string()
    }

    /// Parse and expand one file; returns its expanded roots.
    fn load_file(&mut self, path: &str, text: String) -> Vec<NodeStmt> {
        let parsed = parse(path, &text);
        self.diags.extend(parsed.diags);
        let ex = expand(&parsed.file);
        self.diags.extend(ex.diags);
        self.loaded_paths.insert(path.to_string());
        self.files.push(Loaded { path: path.to_string(), text, ast: parsed.file, expanded: ex.roots.clone() });
        ex.roots
    }

    fn build(&mut self, n: &NodeStmt, parent: Option<&str>, fidx: usize, is_root: bool) {
        let kind = match NodeKind::parse(&n.kind.text) {
            Some(k) => k,
            None => return,
        };
        let id = match parent {
            Some(p) => format!("{p}.{}", n.name.text),
            None => n.name.text.clone(),
        };
        if kind == NodeKind::System && parent.is_some() {
            self.diags.push(Diagnostic::error("E031", n.kind.span.clone(), "`system` may only be the root of the master file; use `subsystem` here").with_fix("subsystem"));
        }
        if let Some(p) = parent {
            if self.root_is_system && p == self.ir.root && n.name.text == self.ir.root {
                self.diags.push(Diagnostic::error("E033", n.name.span.clone(), format!("a child of the root cannot share the root's name `{}`", clip(&n.name.text))));
            }
        }
        if !self.ids.insert(id.clone()) {
            let first = self.defs.get(&id).cloned();
            let mut d = Diagnostic::error("E010", n.name.span.clone(), format!("duplicate node `{}`", clip(&id)));
            if let Some(f) = first {
                let (line, _) = self.position(&f);
                d.message.push_str(&format!("; first declared at {}:{}", f.file, line));
            }
            self.diags.push(d);
            return;
        }
        self.defs.insert(id.clone(), n.name.span.clone());
        let mut node = Node::new(&id, kind);
        node.label = n.label.as_ref().map(|l| l.text.clone());
        let _ = is_root;
        if let Some(block) = &n.block {
            let mut seen_keys: HashSet<String> = HashSet::new();
            for item in &block.items {
                match &item.kind {
                    StmtKind::Property(p) => {
                        if !seen_keys.insert(p.key.text.clone()) {
                            self.diags.push(Diagnostic::error("E037", p.key.span.clone(), format!("property `{}` set twice", clip(&p.key.text))));
                            continue;
                        }
                        self.node_property(&mut node, p);
                    }
                    StmtKind::Node(child) => {
                        if !kind.is_container() {
                            self.diags.push(Diagnostic::error("E030", child.name.span.clone(), format!("{} cannot contain nodes", article(kind.as_str()))));
                            continue;
                        }
                        self.build(child, Some(&id), fidx, false);
                    }
                    StmtKind::Import(imp) => {
                        if !kind.is_container() {
                            self.diags.push(Diagnostic::error("E030", imp.span.clone(), format!("{} cannot contain nodes", article(kind.as_str()))));
                            continue;
                        }
                        self.import(imp, &id, fidx);
                    }
                    StmtKind::Edge(e) => {
                        self.edges.push(PendingEdge { scope: id.clone(), stmt: e.clone(), span: item.span.clone() });
                    }
                    StmtKind::Constraint(c) => {
                        self.constraints.push(PendingConstraint { scope: id.clone(), stmt: c.clone() });
                    }
                    StmtKind::Let(_) | StmtKind::Template(_) | StmtKind::Each(_) | StmtKind::Call(_) => {}
                }
            }
        }
        self.ir.nodes.push(node);
    }

    fn position(&self, span: &Span) -> (usize, usize) {
        match self.files.iter().find(|f| f.path == span.file) {
            Some(f) => crate::diag::LineIndex::new(&f.text).position(span.start),
            None => (0, 0),
        }
    }

    fn import(&mut self, imp: &Str, parent_id: &str, fidx: usize) {
        let from_dir = dirname(&self.files[fidx].path).to_string();
        let path = join(&from_dir, &imp.text);
        if self.loaded_paths.contains(&path) {
            self.diags.push(Diagnostic::error("E013", imp.span.clone(), format!("`{}` is already imported (a file is imported once, and never in a cycle)", clip(&imp.text))));
            return;
        }
        let text = match self.source.read(&path) {
            Ok(t) => t,
            Err(ReadError::Missing(_)) => {
                self.diags.push(Diagnostic::error("E012", imp.span.clone(), format!("import not found: `{}` (looked for {})", clip(&imp.text), crate::diag::clip_to(&path, 200))));
                return;
            }
            Err(ReadError::NotUtf8(at)) => {
                self.diags.push(Diagnostic::error("E034", Span::new(&path, at, at + 1), format!("`{}` is not valid UTF-8 at byte {at}", clip(&imp.text))));
                self.remember_lossy(&path);
                return;
            }
        };
        self.imports.push((imp.span.clone(), path.clone()));
        let roots = self.load_file(&path, text);
        let new_idx = self.files.len() - 1;
        let Some(root) = roots.first() else { return };
        if root.kind.text != "subsystem" {
            self.diags.push(Diagnostic::error("E014", root.kind.span.clone(), format!("an imported file's root must be a subsystem, not a {}", clip(&root.kind.text))).with_fix("subsystem"));
            return;
        }
        if let Some(g) = &self.files[new_idx].ast.generated {
            if self.ir.generated.is_none() {
                let g = g.clone();
                self.diags.push(Diagnostic::error("E038", g.span, "a generated file cannot be imported by a hand-written one"));
            }
        }
        let entry = self.file_entry_path(&path);
        self.ir.files.push(FileEntry { path: entry, root: format!("{parent_id}.{}", root.name.text) });
        let root = root.clone();
        self.build(&root, Some(parent_id), new_idx, false);
    }

    fn node_property(&mut self, node: &mut Node, p: &PropertyStmt) {
        let key = p.key.text.as_str();
        let kind = node.kind;
        let allowed: &[NodeKind] = match key {
            "desc" | "at" => &[NodeKind::System, NodeKind::Subsystem, NodeKind::Component, NodeKind::Ingress, NodeKind::Egress, NodeKind::Store, NodeKind::External, NodeKind::Network, NodeKind::Hardware],
            "src" => &[NodeKind::System, NodeKind::Subsystem, NodeKind::Component],
            "protocol" => &[NodeKind::Ingress, NodeKind::Egress, NodeKind::External, NodeKind::Network],
            "host" => &[NodeKind::External, NodeKind::Network],
            "engine" => &[NodeKind::Store],
            "resolved" => {
                self.diags.push(Diagnostic::error("E008", p.key.span.clone(), "`resolved` is an edge property"));
                return;
            }
            _ => {
                let fix = nearest(key, PROPERTY_KEYS.iter().copied());
                let msg = match fix {
                    Some(f) => format!("unknown property `{}`; did you mean `{f}`?", clip(key)),
                    None => format!("unknown property `{}`; properties are desc, src, protocol, host, engine, at", clip(key)),
                };
                let mut d = Diagnostic::error("E007", p.key.span.clone(), msg);
                d.fix = fix.map(|f| f.to_string());
                self.diags.push(d);
                return;
            }
        };
        if !allowed.contains(&kind) {
            self.diags.push(Diagnostic::error("E008", p.key.span.clone(), format!("`{key}` is not allowed on {}", article(kind.as_str()))));
            return;
        }
        match key {
            "desc" => match &p.value {
                Value::Str(s) => node.desc = Some(s.text.clone()),
                v => self.type_error(v, "a string"),
            },
            "src" => match string_list(&p.value) {
                Some(l) => node.src = l,
                None => self.type_error(&p.value, "a string or a list of strings"),
            },
            "at" => match string_list(&p.value) {
                Some(l) => {
                    self.check_evidence(&l, &p.value);
                    node.at = l;
                }
                None => self.type_error(&p.value, "a list of \"path:line\" strings"),
            },
            "host" => match &p.value {
                Value::Str(s) => node.host = Some(s.text.clone()),
                v => self.type_error(v, "a string"),
            },
            "engine" => match &p.value {
                Value::Str(s) => node.engine = Some(s.text.clone()),
                v => self.type_error(v, "a string"),
            },
            "protocol" => match &p.value {
                Value::Ident(i) => match Protocol::parse(&i.text) {
                    Some(pr) => node.protocol = Some(pr),
                    None => {
                        let fix = nearest(&i.text, PROTOCOLS.iter().copied());
                        let mut d = Diagnostic::error("E023", i.span.clone(), format!("unknown protocol `{}`; one of {}", clip(&i.text), PROTOCOLS.join(", ")));
                        d.fix = fix.map(|f| f.to_string());
                        self.diags.push(d);
                    }
                },
                v => self.type_error(v, "a protocol name such as http"),
            },
            _ => {}
        }
    }

    /// Evidence entries are `path:line`, as the schema requires.
    fn check_evidence(&mut self, entries: &[String], v: &Value) {
        for e in entries {
            let ok = e.rfind(':').map(|i| i > 0 && !e[i + 1..].is_empty() && e[i + 1..].bytes().all(|b| b.is_ascii_digit())).unwrap_or(false);
            if !ok {
                self.diags.push(Diagnostic::error("E009", v.span().clone(), format!("`at` entries are \"path:line\"; `{}` is not", clip(e))));
            }
        }
    }

    fn type_error(&mut self, v: &Value, expected: &str) {
        let mut d = Diagnostic::error("E009", v.span().clone(), format!("expected {expected}, found {}", v.type_name()));
        if let (Value::Ident(i), true) = (v, expected.starts_with("a string")) {
            d.fix = Some(crate::format::quote(&i.text));
        }
        self.diags.push(d);
    }

    fn resolve_all(&mut self) {
        let edges = std::mem::take(&mut self.edges);
        let mut seen: HashSet<(String, String, EdgeKind)> = HashSet::new();
        for pe in edges {
            let from = self.resolve(&pe.stmt.from, &pe.scope);
            let to = self.resolve(&pe.stmt.to, &pe.scope);
            let (Some(from), Some(to)) = (from, to) else { continue };
            let kind = match &pe.stmt.kind {
                Some(k) => match EdgeKind::parse(&k.text) {
                    Some(k) => k,
                    None => continue,
                },
                None => EdgeKind::Calls,
            };
            if from == to {
                self.diags.push(Diagnostic::error("E036", pe.span.clone(), format!("an edge cannot connect `{}` to itself", clip(&from))));
                continue;
            }
            if !seen.insert((from.clone(), to.clone(), kind)) {
                self.diags.push(Diagnostic::error("E032", pe.span.clone(), format!("duplicate edge `{} -> {}: {}`", clip(&from), clip(&to), kind.as_str())));
                continue;
            }
            let mut edge = Edge::new(&from, &to, kind);
            edge.label = pe.stmt.label.as_ref().map(|l| l.text.clone());
            if let Some(block) = &pe.stmt.block {
                let mut seen_keys: HashSet<String> = HashSet::new();
                for item in &block.items {
                    match &item.kind {
                        StmtKind::Property(p) => {
                            if !seen_keys.insert(p.key.text.clone()) {
                                self.diags.push(Diagnostic::error("E037", p.key.span.clone(), format!("property `{}` set twice", clip(&p.key.text))));
                                continue;
                            }
                            match p.key.text.as_str() {
                                "desc" => match &p.value {
                                    Value::Str(s) => edge.desc = Some(s.text.clone()),
                                    v => self.type_error(v, "a string"),
                                },
                                "at" => match string_list(&p.value) {
                                    Some(l) => {
                                        self.check_evidence(&l, &p.value);
                                        edge.at = l;
                                    }
                                    None => self.type_error(&p.value, "a list of \"path:line\" strings"),
                                },
                                "resolved" => match &p.value {
                                    Value::Bool(b, _) => edge.resolved = *b,
                                    v => self.type_error(v, "true or false"),
                                },
                                other => {
                                    let code = if PROPERTY_KEYS.contains(&other) { "E008" } else { "E007" };
                                    let msg = if code == "E008" { format!("`{}` is not allowed on an edge; edge properties are desc, at, resolved", clip(other)) } else { format!("unknown property `{}`", clip(other)) };
                                    let mut d = Diagnostic::error(code, p.key.span.clone(), msg);
                                    if code == "E007" {
                                        d.fix = nearest(other, ["desc", "at", "resolved"].into_iter()).map(|s| s.to_string());
                                    }
                                    self.diags.push(d);
                                }
                            }
                        }
                        _ => {
                            self.diags.push(Diagnostic::error("E003", item.span.clone(), "an edge block holds only properties (desc, at, resolved)"));
                        }
                    }
                }
            }
            self.ir.edges.push(edge);
        }
        let constraints = std::mem::take(&mut self.constraints);
        for pc in constraints {
            let from = self.resolve(&pc.stmt.from, &pc.scope);
            let to = self.resolve(&pc.stmt.to, &pc.scope);
            let (Some(from), Some(to)) = (from, to) else { continue };
            let kind = match &pc.stmt.kind {
                Some(k) => match EdgeKind::parse(&k.text) {
                    Some(k) => Some(k),
                    None => continue,
                },
                None => None,
            };
            let rule = if pc.stmt.rule.text == "forbid" { Rule::Forbid } else { Rule::Require };
            self.ir.constraints.push(Constraint { rule, from, to, kind });
        }
    }

    /// Lexical resolution: at the scope and each ancestor, then the root's name as an absolute prefix.
    fn resolve(&mut self, path: &Path, scope: &str) -> Option<String> {
        match resolve_in(&self.ids, &self.ir.root, path, scope) {
            Some(id) => {
                // record a reference for every segment
                let segs: Vec<&str> = id.split('.').collect();
                let n = path.segments.len();
                for (i, seg) in path.segments.iter().enumerate() {
                    let prefix_len = segs.len() - (n - 1 - i);
                    let prefix = segs[..prefix_len].join(".");
                    self.refs.push(Reference { id: prefix, span: seg.span.clone() });
                }
                Some(id)
            }
            None => {
                let dotted = path.dotted();
                let mut ids: Vec<&str> = self.ids.iter().map(|s| s.as_str()).collect();
                ids.sort();
                let suggestion = if dotted.len() <= 200 { nearest_id(&dotted, &ids, scope) } else { None };
                let shown = clip(&dotted);
                let msg = match &suggestion {
                    Some(s) => format!("cannot resolve `{shown}` from `{}`; did you mean `{}`?", clip(scope), clip(s)),
                    None => format!("cannot resolve `{shown}` from `{}`", clip(scope)),
                };
                let mut d = Diagnostic::error("E011", path.span.clone(), msg);
                d.fix = suggestion;
                self.diags.push(d);
                None
            }
        }
    }
}

/// Resolve `path` written inside `scope`'s block against the set of ids.
pub fn resolve_in(ids: &HashSet<String>, root: &str, path: &Path, scope: &str) -> Option<String> {
    let dotted = path.dotted();
    let mut anc: Option<&str> = Some(scope);
    while let Some(a) = anc {
        let cand = format!("{a}.{dotted}");
        if ids.contains(&cand) {
            return Some(cand);
        }
        anc = a.rfind('.').map(|i| &a[..i]);
    }
    if path.segments[0].text == root && ids.contains(&dotted) {
        return Some(dotted);
    }
    None
}

/// Suggest the nearest id: compare the written path against each id's tail of the same length,
/// preferring ids near the scope.
fn nearest_id(dotted: &str, ids: &[&str], scope: &str) -> Option<String> {
    let n = dotted.matches('.').count() + 1;
    let mut best: Option<(usize, usize, String)> = None;
    for id in ids {
        let segs: Vec<&str> = id.split('.').collect();
        if segs.len() < n {
            continue;
        }
        let tail = segs[segs.len() - n..].join(".");
        let d = crate::diag::edit_distance(dotted, &tail);
        // close, and sharing more than it differs (never a one-letter id for an unrelated word)
        if d > 3 || d >= tail.chars().count() || d >= dotted.chars().count().max(1) {
            continue;
        }
        let far = if Ir::is_within(id, scope) { 0 } else { 1 };
        if best.as_ref().map(|(bd, bf, _)| (d, far) < (*bd, *bf)).unwrap_or(true) {
            best = Some((d, far, id.to_string()));
        }
    }
    best.map(|(_, _, id)| id)
}

fn article(kind: &str) -> String {
    if kind.starts_with(['a', 'e', 'i', 'o', 'u']) {
        format!("an {kind}")
    } else {
        format!("a {kind}")
    }
}

fn string_list(v: &Value) -> Option<Vec<String>> {
    match v {
        Value::Str(s) => Some(vec![s.text.clone()]),
        Value::List(items, _) => {
            let mut out = Vec::new();
            for it in items {
                match it {
                    Value::Str(s) => out.push(s.text.clone()),
                    _ => return None,
                }
            }
            Some(out)
        }
        _ => None,
    }
}
