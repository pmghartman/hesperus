//! Container edges are weighted rollups of leaf edges. Single definition; consumers share it.
use crate::ir::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rollup {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    pub weight: usize,
    pub resolved: usize,
    pub may: usize,
    pub unresolved: usize,
    /// Indices into `Graph::edges`: the edges beneath this rollup.
    pub edges: Vec<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct View {
    pub nodes: Vec<String>,
    pub rollups: Vec<Rollup>,
}

pub fn parents(g: &Graph) -> BTreeMap<&str, &str> {
    g.edges
        .iter()
        .filter(|e| e.kind == EdgeKind::Contains)
        .map(|e| (e.to.as_str(), e.from.as_str()))
        .collect()
}

/// Visible nodes and rollups when `expanded` containers show their children.
/// The repo root is always expanded.
pub fn view(g: &Graph, expanded: &BTreeSet<String>) -> View {
    let par = parents(g);
    let rep = |id: &str| -> String {
        let mut chain = vec![id];
        while let Some(p) = par.get(chain.last().copied().unwrap()) {
            chain.push(p);
            if chain.len() > par.len() + 1 {
                break; // containment cycle guard
            }
        }
        chain.reverse(); // root first
        let mut cur = chain[0];
        for x in &chain[1..] {
            if cur == REPO_ID || expanded.contains(cur) {
                cur = x;
            } else {
                break;
            }
        }
        cur.to_string()
    };
    let nodes: Vec<String> = g
        .nodes
        .iter()
        .filter(|n| n.id != REPO_ID && rep(&n.id) == n.id)
        .map(|n| n.id.clone())
        .collect();
    let mut acc: BTreeMap<(String, String, EdgeKind), Rollup> = BTreeMap::new();
    for (i, e) in g.edges.iter().enumerate() {
        if e.kind == EdgeKind::Contains {
            continue;
        }
        let (a, b) = (rep(&e.from), rep(&e.to));
        if a == b {
            continue;
        }
        let r = acc.entry((a.clone(), b.clone(), e.kind)).or_insert(Rollup {
            from: a, to: b, kind: e.kind, weight: 0, resolved: 0, may: 0, unresolved: 0, edges: vec![],
        });
        r.weight += 1;
        match e.provenance {
            Provenance::Resolved => r.resolved += 1,
            Provenance::May => r.may += 1,
            Provenance::Unresolved => r.unresolved += 1,
        }
        r.edges.push(i);
    }
    View { nodes, rollups: acc.into_values().collect() }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(id: &str) -> Node {
        Node { id: id.into(), kind: NodeKind::Function, name: id.into(), path: None, range: None, signature: None, doc: None, hash: None }
    }
    fn e(f: &str, t: &str, k: EdgeKind) -> Edge {
        Edge { from: f.into(), to: t.into(), kind: k, provenance: Provenance::Resolved, label: None, site: None }
    }

    #[test]
    fn rolls_up_and_splits_on_expand() {
        let mut g = Graph::new();
        g.nodes = ["repo", "A", "B", "a1", "a2", "b1"].iter().map(|s| n(s)).collect();
        g.edges = vec![
            e("repo", "A", EdgeKind::Contains),
            e("repo", "B", EdgeKind::Contains),
            e("A", "a1", EdgeKind::Contains),
            e("A", "a2", EdgeKind::Contains),
            e("B", "b1", EdgeKind::Contains),
            e("a1", "b1", EdgeKind::Call),
            e("a2", "b1", EdgeKind::Call),
            e("a1", "a2", EdgeKind::Call),
        ];
        g.canonicalize();
        let v = view(&g, &BTreeSet::new());
        assert_eq!(v.nodes, vec!["A", "B"]);
        assert_eq!(v.rollups.len(), 1);
        assert_eq!(v.rollups[0].weight, 2);
        let v = view(&g, &["A".to_string()].into());
        assert_eq!(v.nodes, vec!["A", "B", "a1", "a2"]); // expanded A stays as a container
        assert_eq!(v.rollups.iter().map(|r| r.weight).sum::<usize>(), 3);
    }
}
