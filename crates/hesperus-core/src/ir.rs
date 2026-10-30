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
            n.at.sort();
            n.at.dedup();
        }
        self.edges.sort_by(|a, b| a.key().cmp(&b.key()));
        for e in &mut self.edges {
            e.at.sort();
            e.at.dedup();
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
        Ok(ir)
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
