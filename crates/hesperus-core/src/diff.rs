//! The differ: intent vs actual → unified graph with statuses, constraint results,
//! aggregation by depth, and the text rendering.

use crate::ir::*;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub enum Status {
    #[serde(rename = "match")]
    Match,
    #[serde(rename = "intent-only")]
    IntentOnly,
    #[serde(rename = "actual-only")]
    ActualOnly,
    #[serde(rename = "conflict")]
    Conflict,
}

impl Status {
    pub fn as_str(&self) -> &'static str {
        match self {
            Status::Match => "match",
            Status::IntentOnly => "intent-only",
            Status::ActualOnly => "actual-only",
            Status::Conflict => "conflict",
        }
    }
    pub fn mark(&self) -> &'static str {
        match self {
            Status::Match => "=",
            Status::IntentOnly => "-",
            Status::ActualOnly => "+",
            Status::Conflict => "!",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Conflict {
    pub property: String,
    pub intent: String,
    pub actual: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UNode {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub parent: Option<String>,
    pub status: Status,
    pub intent: Option<Node>,
    pub actual: Option<Node>,
    pub conflicts: Vec<Conflict>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UEdge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    pub status: Status,
    pub intent: Option<Edge>,
    pub actual: Option<Edge>,
    /// Underlying edges (1 unless aggregated).
    pub count: usize,
    pub statuses: BTreeMap<Status, usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UConstraint {
    pub rule: Rule,
    pub from: String,
    pub to: String,
    pub kind: Option<EdgeKind>,
    pub satisfied: bool,
    /// Actual edges that witness the result: violators of a `forbid`, satisfiers of a `require`.
    pub witnesses: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Summary {
    #[serde(rename = "match")]
    pub matched: usize,
    pub intent_only: usize,
    pub actual_only: usize,
    pub conflict: usize,
    pub violations: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct Unified {
    pub hesperus: String,
    pub root: String,
    pub depth: Option<usize>,
    pub summary: Summary,
    pub nodes: Vec<UNode>,
    pub edges: Vec<UEdge>,
    pub constraints: Vec<UConstraint>,
}

impl Unified {
    pub fn to_json(&self) -> String {
        let mut s = serde_json::to_string_pretty(self).expect("unified serializes");
        s.push('\n');
        s
    }
}


pub fn diff(intent: &Ir, actual: &Ir) -> Unified {
    let mut nodes: BTreeMap<String, UNode> = BTreeMap::new();
    for n in &intent.nodes {
        nodes.insert(n.id.clone(), UNode { id: n.id.clone(), kind: n.kind, name: n.name.clone(), parent: n.parent.clone(), status: Status::IntentOnly, intent: Some(n.clone()), actual: None, conflicts: vec![] });
    }
    for a in &actual.nodes {
        match nodes.get_mut(&a.id) {
            Some(u) => {
                let i = u.intent.as_ref().unwrap();
                let mut conflicts = Vec::new();
                if i.kind != a.kind {
                    conflicts.push(Conflict { property: "kind".into(), intent: i.kind.as_str().into(), actual: a.kind.as_str().into() });
                }
                if let (Some(x), Some(y)) = (&i.protocol, &a.protocol) {
                    if x != y {
                        conflicts.push(Conflict { property: "protocol".into(), intent: x.as_str().into(), actual: y.as_str().into() });
                    }
                }
                if let (Some(x), Some(y)) = (&i.host, &a.host) {
                    if x != y {
                        conflicts.push(Conflict { property: "host".into(), intent: x.clone(), actual: y.clone() });
                    }
                }
                if let (Some(x), Some(y)) = (&i.engine, &a.engine) {
                    if x != y {
                        conflicts.push(Conflict { property: "engine".into(), intent: x.clone(), actual: y.clone() });
                    }
                }
                u.status = if conflicts.is_empty() { Status::Match } else { Status::Conflict };
                u.conflicts = conflicts;
                u.actual = Some(a.clone());
            }
            None => {
                nodes.insert(a.id.clone(), UNode { id: a.id.clone(), kind: a.kind, name: a.name.clone(), parent: a.parent.clone(), status: Status::ActualOnly, intent: None, actual: Some(a.clone()), conflicts: vec![] });
            }
        }
    }
    let mut edges: BTreeMap<(String, String, EdgeKind), UEdge> = BTreeMap::new();
    for e in &intent.edges {
        edges.insert(e.key(), UEdge { from: e.from.clone(), to: e.to.clone(), kind: e.kind, status: Status::IntentOnly, intent: Some(e.clone()), actual: None, count: 1, statuses: BTreeMap::new() });
    }
    for a in &actual.edges {
        match edges.get_mut(&a.key()) {
            Some(u) => {
                u.status = Status::Match;
                u.actual = Some(a.clone());
            }
            None => {
                edges.insert(a.key(), UEdge { from: a.from.clone(), to: a.to.clone(), kind: a.kind, status: Status::ActualOnly, intent: None, actual: Some(a.clone()), count: 1, statuses: BTreeMap::new() });
            }
        }
    }
    let mut uedges: Vec<UEdge> = edges.into_values().collect();
    for e in &mut uedges {
        e.statuses.insert(e.status, 1);
    }
    let mut constraints = Vec::new();
    for c in &intent.constraints {
        let witnesses: Vec<String> = actual
            .edges
            .iter()
            .filter(|e| Ir::is_within(&e.from, &c.from) && Ir::is_within(&e.to, &c.to) && c.kind.map(|k| k == e.kind).unwrap_or(true))
            .map(|e| format!("{} -> {}: {}", e.from, e.to, e.kind.as_str()))
            .collect();
        let satisfied = match c.rule {
            Rule::Forbid => witnesses.is_empty(),
            Rule::Require => !witnesses.is_empty(),
        };
        constraints.push(UConstraint { rule: c.rule, from: c.from.clone(), to: c.to.clone(), kind: c.kind, satisfied, witnesses });
    }
    let mut u = Unified { hesperus: VERSION.into(), root: intent.root.clone(), depth: None, summary: Summary::default(), nodes: nodes.into_values().collect(), edges: uedges, constraints };
    u.summary = summarize(&u);
    u
}

fn summarize(u: &Unified) -> Summary {
    let mut s = Summary::default();
    for st in u.nodes.iter().map(|n| n.status).chain(u.edges.iter().map(|e| e.status)) {
        match st {
            Status::Match => s.matched += 1,
            Status::IntentOnly => s.intent_only += 1,
            Status::ActualOnly => s.actual_only += 1,
            Status::Conflict => s.conflict += 1,
        }
    }
    s.violations = u.constraints.iter().filter(|c| !c.satisfied).count();
    s
}

/// Keep nodes at most `depth` deep (root = 0) and fold edges onto those nodes.
pub fn aggregate(u: &Unified, depth: usize) -> Unified {
    let nodes: Vec<UNode> = u.nodes.iter().filter(|n| Ir::depth(&n.id) <= depth).cloned().collect();
    let mut folded: BTreeMap<(String, String, EdgeKind), UEdge> = BTreeMap::new();
    for e in &u.edges {
        let from = Ir::ancestor_at(&e.from, depth);
        let to = Ir::ancestor_at(&e.to, depth);
        if from == to {
            continue;
        }
        let key = (from.clone(), to.clone(), e.kind);
        let entry = folded.entry(key).or_insert_with(|| UEdge { from, to, kind: e.kind, status: e.status, intent: None, actual: None, count: 0, statuses: BTreeMap::new() });
        entry.count += e.count;
        for (st, n) in &e.statuses {
            *entry.statuses.entry(*st).or_insert(0) += n;
        }
        entry.status = entry.status.max(e.status);
        if e.count == 1 && entry.count == 1 {
            entry.intent = e.intent.clone();
            entry.actual = e.actual.clone();
        } else {
            entry.intent = None;
            entry.actual = None;
        }
    }
    let mut out = Unified { hesperus: u.hesperus.clone(), root: u.root.clone(), depth: Some(depth), summary: Summary::default(), nodes, edges: folded.into_values().collect(), constraints: u.constraints.clone() };
    out.summary = summarize(&out);
    out
}

/// Text rendering, `diff intent actual` style.
pub fn render(u: &Unified, all: bool) -> String {
    let mut out = String::new();
    let s = &u.summary;
    out.push_str(&format!(
        "{}: {} match, {} intent-only, {} actual-only, {} conflict, {} violation{}\n",
        u.root,
        s.matched,
        s.intent_only,
        s.actual_only,
        s.conflict,
        s.violations,
        if s.violations == 1 { "" } else { "s" }
    ));
    let width = u.nodes.iter().map(|n| n.id.len()).chain(u.edges.iter().map(|e| e.from.len() + e.to.len() + e.kind.as_str().len() + 6)).max().unwrap_or(0).min(72);
    let shown: Vec<&UNode> = u.nodes.iter().filter(|n| all || n.status != Status::Match).collect();
    if !shown.is_empty() {
        out.push_str("nodes\n");
        for n in shown {
            let mut line = format!(" {} {:<w$} {}", n.status.mark(), n.id, n.status.as_str(), w = width);
            for c in &n.conflicts {
                line.push_str(&format!(" {} intent={} actual={}", c.property, c.intent, c.actual));
            }
            out.push_str(line.trim_end());
            out.push('\n');
        }
    }
    let shown: Vec<&UEdge> = u.edges.iter().filter(|e| all || e.status != Status::Match).collect();
    if !shown.is_empty() {
        out.push_str("edges\n");
        for e in shown {
            let desc = format!("{} -> {}: {}", e.from, e.to, e.kind.as_str());
            let mut line = format!(" {} {:<w$} {}", e.status.mark(), desc, e.status.as_str(), w = width);
            if e.count > 1 {
                line.push_str(&format!(" ({} edges", e.count));
                for (st, n) in &e.statuses {
                    line.push_str(&format!(", {} {}", n, st.as_str()));
                }
                line.push(')');
            }
            if let Some(a) = &e.actual {
                if !a.resolved {
                    line.push_str(" unresolved");
                }
            }
            out.push_str(line.trim_end());
            out.push('\n');
        }
    }
    if !u.constraints.is_empty() {
        out.push_str("constraints\n");
        for c in &u.constraints {
            let kind = c.kind.map(|k| format!(": {}", k.as_str())).unwrap_or_default();
            let mark = if c.satisfied { "ok" } else { "x" };
            let mut line = format!(" {:<2} {} {} -> {}{}", mark, c.rule.as_str(), c.from, c.to, kind);
            match (c.rule, c.satisfied) {
                (Rule::Forbid, false) => {
                    line.push_str(&format!(" violated by {}", c.witnesses.join(", ")));
                }
                (Rule::Require, false) => line.push_str(" not found in actual"),
                (Rule::Require, true) => line.push_str(&format!(" by {}", c.witnesses.join(", "))),
                _ => {}
            }
            out.push_str(&line);
            out.push('\n');
        }
    }
    out
}
