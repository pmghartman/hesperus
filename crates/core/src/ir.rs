//! Versioned IR. Change deliberately and bump SCHEMA_VERSION.
use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;
pub const TOOL_NAME: &str = "hesperus";
pub const REPO_ID: &str = "repo";

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Repo,
    Package,
    File,
    Type,
    Function,
    Method,
    Field,
    Variable,
    ExternalPackage,
    External,
    Unresolved,
}

impl NodeKind {
    /// Terminal nodes are definitions in source (or stand-ins for unknowns).
    pub fn is_callable(self) -> bool {
        matches!(self, NodeKind::Function | NodeKind::Method)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    Contains,
    Call,
    Override,
    Flow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provenance {
    Resolved,
    May,
    Unresolved,
}

/// 0-based, half-open on columns, as in SCIP.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Range {
    pub start_line: u32,
    pub start_col: u32,
    pub end_line: u32,
    pub end_col: u32,
}

impl Range {
    pub fn contains(&self, o: &Range) -> bool {
        (self.start_line, self.start_col) <= (o.start_line, o.start_col)
            && (o.end_line, o.end_col) <= (self.end_line, self.end_col)
    }
    pub fn size(&self) -> (u32, u32) {
        (self.end_line - self.start_line, self.end_col.wrapping_sub(self.start_col))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Site {
    pub path: String,
    pub range: Range,
}

/// Base labels (name, signature, doc) are deterministic. Agent labels live elsewhere.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<Range>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub doc: Option<String>,
    /// Content hash of the defining file; marks staleness only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    pub provenance: Provenance,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub site: Option<Site>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Graph {
    pub schema_version: u32,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

impl Graph {
    pub fn new() -> Self {
        Graph { schema_version: SCHEMA_VERSION, nodes: vec![], edges: vec![] }
    }

    /// Canonical order; dedupes identical records.
    pub fn canonicalize(&mut self) {
        self.nodes.sort();
        self.nodes.dedup();
        self.edges.sort_by(|a, b| {
            (&a.from, &a.to, a.kind, &a.site, &a.label, a.provenance)
                .cmp(&(&b.from, &b.to, b.kind, &b.site, &b.label, b.provenance))
        });
        self.edges.dedup();
    }

    pub fn to_json(&self) -> String {
        let mut s = serde_json::to_string_pretty(self).expect("graph serializes");
        s.push('\n');
        s
    }

    pub fn from_json(s: &str) -> Result<Graph, String> {
        let g: Graph = serde_json::from_str(s).map_err(|e| format!("invalid graph: {e}"))?;
        if g.schema_version != SCHEMA_VERSION {
            return Err(format!(
                "graph schema version {} != supported {}",
                g.schema_version, SCHEMA_VERSION
            ));
        }
        Ok(g)
    }
}
