//! SCIP index (+ optional syntax facts) to IR.
//!
//! Calls: a non-definition occurrence at a call site's callee token. Caller is the
//! innermost callable whose body range holds the site. Body range is the occurrence's
//! enclosing_range, else the smallest syntax declaration around the identifier.
use crate::hash::sha256_hex;
use crate::ir::*;
use crate::scip::{self, parse_symbol, DescKind, Document, Symbol, SymbolInformation};
use crate::syntax::{Facts, Syntax};
use std::collections::{BTreeMap, BTreeSet};

pub struct Inputs<'a> {
    pub index: &'a scip::Index,
    /// Repo-relative path to file text, when the file is readable.
    pub read_source: &'a dyn Fn(&str) -> Option<String>,
    /// (document language, repo-relative path) to a syntax provider.
    pub syntax_for: &'a dyn Fn(&str, &str) -> Option<&'a dyn Syntax>,
}

struct Def {
    path: String,
    ident: Range,
}

struct Callable {
    symbol: String,
    ident: Range,
    body: Range,
}

struct Doc<'a> {
    doc: &'a Document,
    facts: Facts,
    /// Non-definition occurrences by range.
    refs: BTreeMap<Range, &'a str>,
    /// Same occurrences keyed by end position, for argument lookup.
    refs_by_end: BTreeMap<(u32, u32), Vec<Range>>,
    callables: Vec<Callable>,
}

fn file_id(path: &str) -> String {
    format!("file:{path}")
}

fn pkg_id(sym: &Symbol) -> String {
    let ns: Vec<&str> = sym
        .descriptors
        .iter()
        .take_while(|d| d.kind == DescKind::Namespace)
        .map(|d| d.name.as_str())
        .collect();
    if ns.is_empty() {
        format!("pkg:{}", sym.package)
    } else {
        format!("pkg:{}:{}", sym.package, ns.join("/"))
    }
}

fn classify(sym: &Symbol, info: Option<&&SymbolInformation>) -> Option<NodeKind> {
    let n = sym.descriptors.len();
    let last = sym.descriptors.last()?;
    let parent_is_type = n >= 2 && sym.descriptors[n - 2].kind == DescKind::Type;
    let callable = last.kind == DescKind::Method
        || (last.kind == DescKind::Term && info.is_some_and(|i| scip::CALLABLE_KINDS.contains(&i.kind)));
    if callable {
        return Some(if parent_is_type { NodeKind::Method } else { NodeKind::Function });
    }
    match last.kind {
        DescKind::Type => Some(NodeKind::Type),
        DescKind::Term => {
            let k = info.map(|i| i.kind).unwrap_or(0);
            Some(if parent_is_type || k == scip::KIND_FIELD { NodeKind::Field } else { NodeKind::Variable })
        }
        _ => None,
    }
}

/// Method descriptor, or a term the indexer marks callable (e.g. interface methods).
fn is_callable(sym: &Symbol, info: Option<&&SymbolInformation>) -> bool {
    last_kind(sym) == Some(DescKind::Method) || info.is_some_and(|i| scip::CALLABLE_KINDS.contains(&i.kind))
}

fn last_kind(sym: &Symbol) -> Option<DescKind> {
    sym.descriptors.last().map(|d| d.kind)
}

fn base_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

pub fn build(inp: &Inputs) -> Graph {
    let mut docs: Vec<&Document> = inp.index.documents.iter().collect();
    docs.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    let mut info: BTreeMap<&str, &SymbolInformation> = BTreeMap::new();
    for d in &docs {
        for s in &d.symbols {
            info.entry(s.symbol.as_str()).or_insert(s);
        }
    }
    for s in &inp.index.external_symbols {
        info.entry(s.symbol.as_str()).or_insert(s);
    }

    // Pass 1: definitions, per-document context.
    let mut defs: BTreeMap<String, Def> = BTreeMap::new();
    let mut ctxs: Vec<Doc> = Vec::new();
    let mut texts: BTreeMap<String, Option<String>> = BTreeMap::new();
    for d in &docs {
        let path = d.relative_path.clone();
        let text = if d.text.is_empty() { (inp.read_source)(&path) } else { Some(d.text.clone()) };
        let facts = match (&text, (inp.syntax_for)(&d.language, &path)) {
            (Some(t), Some(s)) => s.facts(t),
            _ => Facts::default(),
        };
        let mut refs = BTreeMap::new();
        let mut refs_by_end: BTreeMap<(u32, u32), Vec<Range>> = BTreeMap::new();
        let mut local_defs = Vec::new();
        for o in &d.occurrences {
            let Some(r) = o.range() else { continue };
            if o.symbol.is_empty() {
                continue;
            }
            if o.symbol_roles & scip::ROLE_DEFINITION != 0 {
                let body = o.enclosing().or_else(|| {
                    facts.decls.iter().filter(|x| x.contains(&r)).min_by_key(|x| x.size()).copied()
                });
                local_defs.push((o.symbol.as_str(), r, body));
            } else {
                refs.entry(r).or_insert(o.symbol.as_str());
                refs_by_end.entry((r.end_line, r.end_col)).or_default().push(r);
            }
        }
        let mut callables = Vec::new();
        for (sym, r, body) in local_defs {
            let Some(ps) = parse_symbol(sym) else { continue };
            let kind = classify(&ps, info.get(sym));
            if kind.is_none() {
                continue;
            }
            let cand = Def { path: path.clone(), ident: r };
            match defs.get(sym) {
                Some(old) if (&old.path, old.ident) <= (&cand.path, cand.ident) => {}
                _ => {
                    defs.insert(sym.to_string(), cand);
                }
            }
            if kind.is_some_and(|k| k.is_callable()) {
                if let Some(b) = body {
                    callables.push(Callable { symbol: sym.to_string(), ident: r, body: b });
                }
            }
        }
        texts.insert(path, text);
        ctxs.push(Doc { doc: d, facts, refs, refs_by_end, callables });
    }

    let mut nodes: BTreeMap<String, Node> = BTreeMap::new();
    let mut parent: BTreeMap<String, String> = BTreeMap::new();
    let mut edges: Vec<Edge> = Vec::new();
    nodes.insert(
        REPO_ID.into(),
        Node { id: REPO_ID.into(), kind: NodeKind::Repo, name: "repo".into(), path: None, range: None, signature: None, doc: None, hash: None },
    );

    // Nodes for definitions.
    let mut file_pkgs: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (sym, def) in &defs {
        let ps = parse_symbol(sym).expect("def symbols parse");
        let kind = classify(&ps, info.get(sym.as_str())).expect("classified");
        let inf = info.get(sym.as_str());
        let name = match inf {
            Some(i) if !i.display_name.is_empty() => i.display_name.clone(),
            _ => ps.descriptors.last().map(|d| d.name.clone()).unwrap_or_default(),
        };
        let signature = inf
            .and_then(|i| i.signature_documentation.as_ref())
            .map(|d| d.text.clone())
            .filter(|t| !t.is_empty());
        let doc = inf.map(|i| i.documentation.join("\n")).filter(|t| !t.is_empty());
        let hash = texts.get(&def.path).and_then(|t| t.as_ref()).map(|t| sha256_hex(t.as_bytes()));
        nodes.insert(
            sym.clone(),
            Node { id: sym.clone(), kind, name, path: Some(def.path.clone()), range: Some(def.ident), signature, doc, hash },
        );
        file_pkgs.entry(def.path.clone()).or_default().insert(pkg_id(&ps));
        let n = ps.descriptors.len();
        let owner = if n >= 2 && ps.descriptors[n - 2].kind == DescKind::Type {
            let p = ps.prefix(sym, n - 1);
            defs.contains_key(&p).then_some(p)
        } else {
            None
        };
        parent.insert(sym.clone(), owner.unwrap_or_else(|| file_id(&def.path)));
    }

    // Package and file nodes.
    for ctx in &ctxs {
        let path = &ctx.doc.relative_path;
        let hash = texts.get(path).and_then(|t| t.as_ref()).map(|t| sha256_hex(t.as_bytes()));
        let fid = file_id(path);
        nodes.insert(
            fid.clone(),
            Node { id: fid.clone(), kind: NodeKind::File, name: base_name(path).into(), path: Some(path.clone()), range: None, signature: None, doc: None, hash },
        );
        match file_pkgs.get(path).and_then(|s| s.iter().next()) {
            Some(p) => {
                parent.insert(fid, p.clone());
            }
            None => {
                parent.insert(fid, REPO_ID.into());
            }
        }
    }
    for pid in file_pkgs.values().flatten() {
        let name = pid.strip_prefix("pkg:").unwrap_or(pid);
        let name = name.split_once(':').map(|(_, ns)| ns).unwrap_or(name);
        nodes.entry(pid.clone()).or_insert(Node {
            id: pid.clone(), kind: NodeKind::Package, name: name.into(), path: None, range: None, signature: None, doc: None, hash: None,
        });
        parent.insert(pid.clone(), REPO_ID.into());
    }

    // Implementations: interface member -> in-repo implementers.
    let mut impls: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (sym, def) in &defs {
        let Some(i) = info.get(sym.as_str()) else { continue };
        for r in &i.relationships {
            if r.is_implementation {
                impls.entry(r.symbol.clone()).or_default().insert(sym.clone());
                let site = Some(Site { path: def.path.clone(), range: def.ident });
                ensure_external(&r.symbol, &defs, &mut nodes, &mut parent);
                edges.push(Edge {
                    from: sym.clone(), to: r.symbol.clone(), kind: EdgeKind::Override, provenance: Provenance::Resolved, label: None, site,
                });
            }
        }
    }

    // Parameters: callable symbol -> [(index, name)], and (path, param symbol) -> (callable, index).
    let mut params_of: BTreeMap<String, Vec<(usize, String)>> = BTreeMap::new();
    let mut param_sym: BTreeMap<(String, String), (String, usize)> = BTreeMap::new();
    for ctx in &ctxs {
        let defs_at: BTreeMap<Range, &str> = ctx
            .doc
            .occurrences
            .iter()
            .filter(|o| o.symbol_roles & scip::ROLE_DEFINITION != 0)
            .filter_map(|o| o.range().map(|r| (r, o.symbol.as_str())))
            .collect();
        for p in &ctx.facts.params {
            let Some(c) = ctx.callables.iter().find(|c| p.decl.contains(&c.ident)) else { continue };
            params_of.entry(c.symbol.clone()).or_default().push((p.index, p.name.clone()));
            if let Some(s) = defs_at.get(&p.range) {
                param_sym.insert((ctx.doc.relative_path.clone(), s.to_string()), (c.symbol.clone(), p.index));
            }
        }
    }

    // Pass 2: calls and flow.
    struct ParamCall {
        func: String,
        idx: usize,
        caller: String,
        site: Site,
        name: String,
    }
    let mut param_calls: Vec<ParamCall> = Vec::new();
    let mut fn_flows: Vec<(String, usize, String)> = Vec::new(); // (callee, param idx, function value)
    for ctx in &ctxs {
        let path = &ctx.doc.relative_path;
        for call in &ctx.facts.calls {
            let caller = ctx
                .callables
                .iter()
                .filter(|c| c.body.contains(&call.callee))
                .min_by_key(|c| c.body.size())
                .map(|c| c.symbol.clone())
                .unwrap_or_else(|| file_id(path));
            let site = Site { path: path.clone(), range: call.callee };
            let mut targets: Vec<(String, Provenance)> = Vec::new();
            let mut stub = false;
            match ctx.refs.get(&call.callee) {
                Some(s) if !s.starts_with("local ") => match parse_symbol(s) {
                    Some(ps) if is_callable(&ps, info.get(*s)) => {
                        ensure_external(s, &defs, &mut nodes, &mut parent);
                        edges.push(call_edge(&caller, s, Provenance::Resolved, None, &site));
                        targets.push((s.to_string(), Provenance::Resolved));
                        for imp in impls.get(*s).into_iter().flatten() {
                            edges.push(call_edge(&caller, imp, Provenance::May, Some("dispatch"), &site));
                            targets.push((imp.clone(), Provenance::May));
                        }
                    }
                    Some(ps) if last_kind(&ps) == Some(DescKind::Type) => continue, // conversion
                    _ => stub = true,
                },
                Some(local) => {
                    if let Some((func, idx)) = param_sym.get(&(path.clone(), local.to_string())) {
                        param_calls.push(ParamCall {
                            func: func.clone(), idx: *idx, caller: caller.clone(), site: site.clone(), name: call.callee_text.clone(),
                        });
                    }
                    stub = true;
                }
                None => stub = true,
            }
            if stub {
                let id = format!("unresolved:{caller}:{}", call.callee_text);
                nodes.entry(id.clone()).or_insert(Node {
                    id: id.clone(), kind: NodeKind::Unresolved, name: call.callee_text.clone(), path: None, range: None, signature: None, doc: None, hash: None,
                });
                parent.insert(id.clone(), caller.clone());
                edges.push(call_edge(&caller, &id, Provenance::Unresolved, None, &site));
                targets.push((id, Provenance::Unresolved));
            }
            for (t, prov) in &targets {
                let names = params_of.get(t);
                for (i, arg) in call.args.iter().enumerate() {
                    let name = names.and_then(|n| n.iter().find(|(k, _)| *k == i)).map(|(_, n)| n.as_str());
                    let label = match name {
                        Some(n) => format!("arg{i}:{n}"),
                        None => format!("arg{i}"),
                    };
                    edges.push(Edge {
                        from: caller.clone(), to: t.clone(), kind: EdgeKind::Flow, provenance: *prov, label: Some(label.clone()), site: Some(site.clone()),
                    });
                    if *prov != Provenance::Resolved {
                        continue;
                    }
                    // Function value passed as argument.
                    let fv = ctx.refs_by_end.get(&(arg.end_line, arg.end_col)).into_iter().flatten().find_map(|r| {
                        let sym = ctx.refs.get(r)?;
                        let ps = parse_symbol(sym)?;
                        (arg.contains(r) && is_callable(&ps, info.get(*sym)) && defs.contains_key(*sym)).then(|| sym.to_string())
                    });
                    if let Some(f) = fv {
                        edges.push(Edge {
                            from: f.clone(), to: t.clone(), kind: EdgeKind::Flow, provenance: Provenance::Resolved,
                            label: Some(format!("fn:{label}")), site: Some(site.clone()),
                        });
                        fn_flows.push((t.clone(), i, f));
                    }
                }
                if call.result_used {
                    edges.push(Edge {
                        from: t.clone(), to: caller.clone(), kind: EdgeKind::Flow, provenance: *prov, label: Some("return".into()), site: Some(site.clone()),
                    });
                }
            }
        }
    }
    // Calls through a parameter reach the function values passed into it.
    for pc in &param_calls {
        for (callee, idx, f) in &fn_flows {
            if *callee == pc.func && *idx == pc.idx {
                edges.push(call_edge(&pc.caller, f, Provenance::May, Some(&format!("via {}", pc.name)), &pc.site));
            }
        }
    }

    for (child, p) in &parent {
        edges.push(Edge { from: p.clone(), to: child.clone(), kind: EdgeKind::Contains, provenance: Provenance::Resolved, label: None, site: None });
    }
    let mut g = Graph::new();
    g.nodes = nodes.into_values().collect();
    g.edges = edges;
    g.canonicalize();
    g
}

fn call_edge(from: &str, to: &str, prov: Provenance, label: Option<&str>, site: &Site) -> Edge {
    Edge {
        from: from.into(), to: to.into(), kind: EdgeKind::Call, provenance: prov, label: label.map(Into::into), site: Some(site.clone()),
    }
}

/// Symbols with no in-repo definition resolve outside the repo, labeled by package.
fn ensure_external(sym: &str, defs: &BTreeMap<String, Def>, nodes: &mut BTreeMap<String, Node>, parent: &mut BTreeMap<String, String>) {
    if defs.contains_key(sym) || nodes.contains_key(sym) {
        return;
    }
    let Some(ps) = parse_symbol(sym) else { return };
    let pid = format!("ext:{}", ps.package);
    nodes.entry(pid.clone()).or_insert(Node {
        id: pid.clone(), kind: NodeKind::ExternalPackage, name: ps.package.clone(), path: None, range: None, signature: None, doc: None, hash: None,
    });
    parent.insert(pid.clone(), REPO_ID.into());
    let name = ps.descriptors.last().map(|d| d.name.clone()).unwrap_or_default();
    nodes.insert(
        sym.to_string(),
        Node { id: sym.to_string(), kind: NodeKind::External, name, path: None, range: None, signature: None, doc: None, hash: None },
    );
    parent.insert(sym.to_string(), pid);
}
