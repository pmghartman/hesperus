//! Scaffolding: turn an extractor's no-intent output into an intent that matches it, so
//! a repository already under way starts with intent and actual in agreement.

use crate::ir::*;
use std::collections::{BTreeMap, BTreeSet};

/// The container an extractor puts code no intent node binds into.
pub const UNBOUND: &str = "unbound";

/// A valid identifier from arbitrary text: other characters become `_`, and a reserved
/// word or a leading digit gets an `_` added.
pub fn identifier(text: &str) -> String {
    let mut s: String = text.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' }).collect();
    s = s.trim_matches('_').to_string();
    if s.is_empty() || s.starts_with(|c: char| c.is_ascii_digit()) {
        s.insert(0, '_');
    }
    while !crate::lexer::is_valid_ident(&s) {
        s.push('_');
    }
    s
}

/// The intent for an actual IR emitted without one: the `unbound` components move up to
/// the root (renamed when a boundary already holds the name), evidence and the
/// `generated` marker go. Their `src` globs then bind the same files to the same ids.
pub fn intent_from_actual(actual: &Ir) -> Ir {
    let root = actual.root.as_str();
    let bucket = format!("{root}.{UNBOUND}");
    let mut taken: BTreeSet<String> = actual.nodes.iter().filter(|n| !Ir::is_within(&n.id, &bucket)).map(|n| n.id.clone()).collect();
    let mut moved: BTreeMap<String, String> = BTreeMap::new();
    for n in actual.nodes.iter().filter(|n| n.parent.as_deref() == Some(bucket.as_str())) {
        let mut name = identifier(&n.name);
        // a child may not share the root's name (E033), nor an id a boundary already holds
        while name == root || taken.contains(&format!("{root}.{name}")) {
            name.push_str("_src");
        }
        let id = format!("{root}.{name}");
        taken.insert(id.clone());
        moved.insert(n.id.clone(), id);
    }
    let map = |id: &str| -> Option<String> {
        if id == bucket {
            return None;
        }
        if !Ir::is_within(id, &bucket) {
            return Some(id.to_string());
        }
        let rest = &id[bucket.len() + 1..];
        let (head, tail) = rest.split_once('.').map(|(h, t)| (h, Some(t))).unwrap_or((rest, None));
        let top = moved.get(&format!("{bucket}.{head}"))?;
        Some(match tail {
            Some(t) => format!("{top}.{t}"),
            None => top.clone(),
        })
    };
    let mut ir = Ir::new(root);
    ir.files = actual.files.clone();
    for n in &actual.nodes {
        let Some(id) = map(&n.id) else { continue };
        let mut m = n.clone();
        m.name = id.rsplit('.').next().unwrap().to_string();
        m.parent = id.rfind('.').map(|i| id[..i].to_string());
        m.id = id;
        m.at.clear();
        ir.nodes.push(m);
    }
    for e in &actual.edges {
        let (Some(from), Some(to)) = (map(&e.from), map(&e.to)) else { continue };
        let mut f = e.clone();
        f.from = from;
        f.to = to;
        f.at.clear();
        ir.edges.push(f);
    }
    ir.canonicalize();
    ir
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, kind: NodeKind, src: &[&str]) -> Node {
        let mut n = Node::new(id, kind);
        n.src = src.iter().map(|s| s.to_string()).collect();
        n.at = vec!["x.ts:1".into()];
        n
    }

    #[test]
    fn identifiers_are_valid() {
        assert_eq!(identifier("my-app"), "my_app");
        assert_eq!(identifier("hesperus"), "hesperus_");
        assert_eq!(identifier("9lives"), "_9lives");
        assert_eq!(identifier("..."), "_");
    }

    #[test]
    fn unbound_components_move_to_the_root() {
        let mut a = Ir::new("app");
        a.generated = Some("hesperus-ts".into());
        a.nodes = vec![
            node("app", NodeKind::System, &[]),
            node("app.http", NodeKind::Ingress, &[]),
            node("app.unbound", NodeKind::Subsystem, &[]),
            node("app.unbound.http", NodeKind::Component, &["http/**"]),
            node("app.unbound.lib", NodeKind::Component, &["lib/**"]),
        ];
        let mut e = Edge::new("app.unbound.http", "app.unbound.lib", EdgeKind::Calls);
        e.at = vec!["http/a.ts:3".into()];
        a.edges = vec![e, Edge::new("app.http", "app.unbound.http", EdgeKind::Http)];
        let i = intent_from_actual(&a);
        assert_eq!(i.generated, None);
        let ids: Vec<&str> = i.nodes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, ["app", "app.http", "app.http_src", "app.lib"]);
        assert_eq!(i.node("app.http_src").unwrap().src, ["http/**"]);
        assert_eq!(i.node("app.lib").unwrap().parent.as_deref(), Some("app"));
        assert!(i.nodes.iter().all(|n| n.at.is_empty()) && i.edges.iter().all(|e| e.at.is_empty()));
        let edges: Vec<(&str, &str)> = i.edges.iter().map(|e| (e.from.as_str(), e.to.as_str())).collect();
        assert_eq!(edges, [("app.http", "app.http_src"), ("app.http_src", "app.lib")]);
        i.validate().unwrap();
    }
}
