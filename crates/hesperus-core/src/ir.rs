//! The canonical intermediate representation. See docs/ir.schema.json.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const VERSION: &str = "0.1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    System,
    Subsystem,
    Component,
    Ingress,
    Egress,
    Store,
    External,
    Network,
    Hardware,
}

impl NodeKind {
    pub fn parse(s: &str) -> Option<NodeKind> {
        Some(match s {
            "system" => NodeKind::System,
            "subsystem" => NodeKind::Subsystem,
            "component" => NodeKind::Component,
            "ingress" => NodeKind::Ingress,
            "egress" => NodeKind::Egress,
            "store" => NodeKind::Store,
            "external" => NodeKind::External,
            "network" => NodeKind::Network,
            "hardware" => NodeKind::Hardware,
            _ => return None,
        })
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            NodeKind::System => "system",
            NodeKind::Subsystem => "subsystem",
            NodeKind::Component => "component",
            NodeKind::Ingress => "ingress",
            NodeKind::Egress => "egress",
            NodeKind::Store => "store",
            NodeKind::External => "external",
            NodeKind::Network => "network",
            NodeKind::Hardware => "hardware",
        }
    }
    pub fn is_container(&self) -> bool {
        matches!(self, NodeKind::System | NodeKind::Subsystem | NodeKind::Component)
    }
    /// Sort rank for canonical printing.
    pub fn rank(&self) -> usize {
        *self as usize
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeKind {
    Calls,
    Reads,
    Writes,
    Http,
    Ws,
    Io,
}

impl EdgeKind {
    pub fn parse(s: &str) -> Option<EdgeKind> {
        Some(match s {
            "calls" => EdgeKind::Calls,
            "reads" => EdgeKind::Reads,
            "writes" => EdgeKind::Writes,
            "http" => EdgeKind::Http,
            "ws" => EdgeKind::Ws,
            "io" => EdgeKind::Io,
            _ => return None,
        })
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            EdgeKind::Calls => "calls",
            EdgeKind::Reads => "reads",
            EdgeKind::Writes => "writes",
            EdgeKind::Http => "http",
            EdgeKind::Ws => "ws",
            EdgeKind::Io => "io",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Http,
    Ws,
    Grpc,
    Tcp,
    Udp,
    Ssh,
    Other,
}

impl Protocol {
    pub fn parse(s: &str) -> Option<Protocol> {
        Some(match s {
            "http" => Protocol::Http,
            "ws" => Protocol::Ws,
            "grpc" => Protocol::Grpc,
            "tcp" => Protocol::Tcp,
            "udp" => Protocol::Udp,
            "ssh" => Protocol::Ssh,
            "other" => Protocol::Other,
            _ => return None,
        })
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Protocol::Http => "http",
            Protocol::Ws => "ws",
            Protocol::Grpc => "grpc",
            Protocol::Tcp => "tcp",
            Protocol::Udp => "udp",
            Protocol::Ssh => "ssh",
            Protocol::Other => "other",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Rule {
    Forbid,
    Require,
}

impl Rule {
    pub fn as_str(&self) -> &'static str {
        match self {
            Rule::Forbid => "forbid",
            Rule::Require => "require",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub parent: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub src: Vec<String>,
    #[serde(default)]
    pub protocol: Option<Protocol>,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub at: Vec<String>,
}

impl Node {
    pub fn new(id: &str, kind: NodeKind) -> Node {
        let name = id.rsplit('.').next().unwrap_or(id).to_string();
        let parent = id.rfind('.').map(|i| id[..i].to_string());
        Node { id: id.to_string(), kind, name, parent, label: None, desc: None, src: vec![], protocol: None, host: None, engine: None, at: vec![] }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default = "default_true")]
    pub resolved: bool,
    #[serde(default)]
    pub at: Vec<String>,
}

impl Edge {
    pub fn new(from: &str, to: &str, kind: EdgeKind) -> Edge {
        Edge { from: from.into(), to: to.into(), kind, label: None, desc: None, resolved: true, at: vec![] }
    }
    pub fn key(&self) -> (String, String, EdgeKind) {
        (self.from.clone(), self.to.clone(), self.kind)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Constraint {
    pub rule: Rule,
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub kind: Option<EdgeKind>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub root: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ir {
    pub hesperus: String,
    #[serde(default)]
    pub generated: Option<String>,
    pub root: String,
    #[serde(default)]
    pub files: Vec<FileEntry>,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    #[serde(default)]
    pub constraints: Vec<Constraint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locations: Option<BTreeMap<String, String>>,
}

impl Ir {
    pub fn new(root: &str) -> Ir {
        Ir { hesperus: VERSION.into(), generated: None, root: root.into(), files: vec![], nodes: vec![], edges: vec![], constraints: vec![], locations: None }
    }

    /// Sort everything into canonical order.
    pub fn canonicalize(&mut self) {
        self.nodes.sort_by(|a, b| a.id.cmp(&b.id));
        for n in &mut self.nodes {
            n.src.sort();
            n.src.dedup();
            sort_evidence(&mut n.at);
        }
        self.edges.sort_by(|a, b| a.key().cmp(&b.key()));
        for e in &mut self.edges {
            sort_evidence(&mut e.at);
        }
        self.constraints.sort_by(|a, b| (a.rule, &a.from, &a.to, a.kind).cmp(&(b.rule, &b.from, &b.to, b.kind)));
        // files: master first, then by path
        if self.files.len() > 1 {
            let master = self.files.remove(0);
            self.files.sort_by(|a, b| a.path.cmp(&b.path));
            self.files.insert(0, master);
        }
    }

    pub fn to_json(&self) -> String {
        let mut s = serde_json::to_string_pretty(self).expect("IR serializes");
        s.push('\n');
        s
    }

    pub fn from_json(text: &str) -> Result<Ir, String> {
        let mut ir: Ir = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if ir.hesperus != VERSION {
            return Err(format!("IR version {} is not {}", ir.hesperus, VERSION));
        }
        ir.canonicalize();
        ir.validate()?;
        Ok(ir)
    }

    /// Structural checks an IR must pass before it is printed: valid ids, a root node,
    /// consistent parents, known endpoints, no children under boundaries, file roots that exist.
    pub fn validate(&self) -> Result<(), String> {
        use std::collections::HashMap;
        let clip = |s: &str| crate::diag::clip(s);
        let valid_ident = |s: &str| crate::lexer::is_valid_ident(s);
        let mut by_id: HashMap<&str, &Node> = HashMap::new();
        for n in &self.nodes {
            if n.id.split('.').any(|seg| !valid_ident(seg)) {
                return Err(format!("node id `{}` is not a dotted path of identifiers", clip(&n.id)));
            }
            if by_id.insert(&n.id, n).is_some() {
                return Err(format!("duplicate node id `{}`", clip(&n.id)));
            }
            let expected_parent = n.id.rfind('.').map(|i| &n.id[..i]);
            if n.parent.as_deref() != expected_parent {
                return Err(format!("node `{}` has parent {:?}, expected {:?}", clip(&n.id), n.parent, expected_parent));
            }
            if n.name != n.id.rsplit('.').next().unwrap_or("") {
                return Err(format!("node `{}` has name `{}`", clip(&n.id), clip(&n.name)));
            }
        }
        if self.nodes.is_empty() || !by_id.contains_key(self.root.as_str()) {
            return Err(format!("root `{}` is not among the nodes", clip(&self.root)));
        }
        for n in &self.nodes {
            if n.id != self.root && !Ir::is_within(&n.id, &self.root) {
                return Err(format!("node `{}` is outside the root `{}`", clip(&n.id), clip(&self.root)));
            }
            if let Some(p) = &n.parent {
                match by_id.get(p.as_str()) {
                    None => return Err(format!("node `{}` has a parent `{}` that does not exist", clip(&n.id), clip(p))),
                    Some(parent) if !parent.kind.is_container() => return Err(format!("`{}` is a {} and cannot contain `{}`", clip(p), parent.kind.as_str(), clip(&n.id))),
                    _ => {}
                }
            }
            if n.kind == NodeKind::System && n.id != self.root {
                return Err(format!("`{}` is a system below the root", clip(&n.id)));
            }
        }
        let no_control = |s: &str| !s.chars().any(|c| (c.is_control() && c != '\t') || c == '\u{E000}');
        let evidence_ok = |e: &str| e.rfind(':').map(|i| i > 0 && !e[i + 1..].is_empty() && e[i + 1..].bytes().all(|b| b.is_ascii_digit())).unwrap_or(false);
        for n in &self.nodes {
            for text in [n.label.as_deref(), n.desc.as_deref(), n.host.as_deref(), n.engine.as_deref()].into_iter().flatten().chain(n.src.iter().map(|s| s.as_str())).chain(n.at.iter().map(|s| s.as_str())) {
                if !no_control(text) {
                    return Err(format!("node `{}` has a control character in a string", clip(&n.id)));
                }
            }
            for a in &n.at {
                if !evidence_ok(a) {
                    return Err(format!("node `{}` has evidence `{}` that is not path:line", clip(&n.id), clip(a)));
                }
            }
            let k = n.kind;
            if !n.src.is_empty() && !k.is_container() {
                return Err(format!("`src` on `{}`, a {}", clip(&n.id), k.as_str()));
            }
            if n.protocol.is_some() && !matches!(k, NodeKind::Ingress | NodeKind::Egress | NodeKind::External | NodeKind::Network) {
                return Err(format!("`protocol` on `{}`, a {}", clip(&n.id), k.as_str()));
            }
            if n.host.is_some() && !matches!(k, NodeKind::External | NodeKind::Network) {
                return Err(format!("`host` on `{}`, a {}", clip(&n.id), k.as_str()));
            }
            if n.engine.is_some() && k != NodeKind::Store {
                return Err(format!("`engine` on `{}`, a {}", clip(&n.id), k.as_str()));
            }
            if let Some(p) = &n.parent {
                if p == &self.root && n.name == self.root && by_id[self.root.as_str()].kind == NodeKind::System {
                    return Err(format!("`{}` shares the root's name", clip(&n.id)));
                }
            }
        }
        let mut seen_edges = std::collections::HashSet::new();
        for e in &self.edges {
            for end in [&e.from, &e.to] {
                if !by_id.contains_key(end.as_str()) {
                    return Err(format!("edge `{} -> {}` names a node that does not exist", clip(&e.from), clip(&e.to)));
                }
            }
            if e.from == e.to {
                return Err(format!("edge `{} -> {}` connects a node to itself", clip(&e.from), clip(&e.to)));
            }
            if !seen_edges.insert((e.from.as_str(), e.to.as_str(), e.kind)) {
                return Err(format!("duplicate edge `{} -> {}: {}`", clip(&e.from), clip(&e.to), e.kind.as_str()));
            }
            for text in [e.label.as_deref(), e.desc.as_deref()].into_iter().flatten().chain(e.at.iter().map(|s| s.as_str())) {
                if !no_control(text) {
                    return Err(format!("edge `{} -> {}` has a control character in a string", clip(&e.from), clip(&e.to)));
                }
            }
            for a in &e.at {
                if !evidence_ok(a) {
                    return Err(format!("edge `{} -> {}` has evidence `{}` that is not path:line", clip(&e.from), clip(&e.to), clip(a)));
                }
            }
        }
        for c in &self.constraints {
            for end in [&c.from, &c.to] {
                if !by_id.contains_key(end.as_str()) {
                    return Err(format!("constraint `{} -> {}` names a node that does not exist", clip(&c.from), clip(&c.to)));
                }
            }
        }
        let mut seen_paths = std::collections::HashSet::new();
        let mut seen_roots = std::collections::HashSet::new();
        for (i, f) in self.files.iter().enumerate() {
            let Some(root) = by_id.get(f.root.as_str()) else {
                return Err(format!("file `{}` has a root `{}` that does not exist", clip(&f.path), clip(&f.root)));
            };
            if !f.path.ends_with(".hesp") || !no_control(&f.path) {
                return Err(format!("file `{}` is not a .hesp path", clip(&f.path)));
            }
            if !seen_paths.insert(f.path.as_str()) {
                return Err(format!("file `{}` is listed twice", clip(&f.path)));
            }
            if !seen_roots.insert(f.root.as_str()) {
                return Err(format!("node `{}` is the root of two files", clip(&f.root)));
            }
            if i > 0 && root.kind != NodeKind::Subsystem {
                return Err(format!("file `{}` has root `{}`, a {}; an imported file's root is a subsystem", clip(&f.path), clip(&f.root), root.kind.as_str()));
            }
        }
        if let Some(first) = self.files.first() {
            if first.root != self.root {
                return Err(format!("the first file `{}` must be the master (root `{}`)", clip(&first.path), clip(&self.root)));
            }
        }
        Ok(())
    }

    pub fn node(&self, id: &str) -> Option<&Node> {
        self.nodes.iter().find(|n| n.id == id)
    }

    pub fn children(&self, id: &str) -> Vec<&Node> {
        self.nodes.iter().filter(|n| n.parent.as_deref() == Some(id)).collect()
    }

    /// Whether `desc` is `anc` or a descendant of it.
    pub fn is_within(id: &str, anc: &str) -> bool {
        id == anc || (id.len() > anc.len() && id.starts_with(anc) && id.as_bytes()[anc.len()] == b'.')
    }

    pub fn depth(id: &str) -> usize {
        id.matches('.').count()
    }

    /// The ancestor of `id` at `depth` (0 = root), or `id` itself when shallower.
    pub fn ancestor_at(id: &str, depth: usize) -> String {
        id.split('.').take(depth + 1).collect::<Vec<_>>().join(".")
    }

    pub fn lca(a: &str, b: &str) -> String {
        let pa: Vec<&str> = a.split('.').collect();
        let pb: Vec<&str> = b.split('.').collect();
        let mut common = Vec::new();
        for (x, y) in pa.iter().zip(pb.iter()) {
            if x == y {
                common.push(*x);
            } else {
                break;
            }
        }
        common.join(".")
    }
}

/// `path:line` entries sort by path, then by numeric line.
pub fn sort_evidence(at: &mut Vec<String>) {
    fn split(s: &str) -> (&str, u64, &str) {
        match s.rfind(':') {
            Some(i) => match s[i + 1..].parse::<u64>() {
                Ok(n) => (&s[..i], n, s),
                Err(_) => (s, 0, s),
            },
            None => (s, 0, s),
        }
    }
    at.sort_by(|a, b| split(a).cmp(&split(b)));
    at.dedup();
}
