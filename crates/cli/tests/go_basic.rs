//! Fixture: fixtures/go-basic. The SCIP index is built here from source positions so the
//! test needs no external indexer; a real scip-go index has the same shape.
use hesperus_core::build::{build, Inputs};
use hesperus_core::ir::*;
use hesperus_core::scip::{self, *};
use hesperus_core::syntax::Syntax;
use hesperus_lang_go::Go;
use prost::Message;
use std::path::PathBuf;

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/go-basic")
}

const P: &str = "scip-go gomod example.com/basic . `example.com/basic`/";

fn sym(rest: &str) -> String {
    format!("{P}{rest}")
}

/// Range of the nth (1-based) occurrence of `needle`.
fn find(src: &str, needle: &str, nth: usize) -> Vec<i32> {
    let mut from = 0;
    let mut pos = 0;
    for _ in 0..nth {
        pos = from + src[from..].find(needle).unwrap_or_else(|| panic!("{needle} #{nth}"));
        from = pos + needle.len();
    }
    let line = src[..pos].matches('\n').count();
    let col = pos - src[..pos].rfind('\n').map(|i| i + 1).unwrap_or(0);
    vec![line as i32, col as i32, (col + needle.len()) as i32]
}

fn occ(range: Vec<i32>, symbol: &str, def: bool) -> Occurrence {
    Occurrence { range, symbol: symbol.into(), symbol_roles: if def { 1 } else { 0 }, ..Default::default() }
}

fn index(src: &str) -> Index {
    let f = |n, k| find(src, n, k);
    let (shape, shape_area, circle, circle_r, circle_area) =
        (sym("Shape#"), sym("Shape#Area()."), sym("Circle#"), sym("Circle#r."), sym("Circle#Area()."));
    let (double, apply, total, main) = (sym("double()."), sym("apply()."), sym("total()."), sym("main()."));
    let to_upper = "scip-go gomod std . strings/ToUpper().".to_string();
    let occurrences = vec![
        occ(f("Shape", 2), &shape, true),
        occ(f("Area", 1), &shape_area, true),
        occ(f("scale", 1), "local 1", true),
        occ(f("Circle", 1), &circle, true),
        occ(f("r int", 1)[..2].iter().cloned().chain([f("r int", 1)[1] + 1]).collect(), &circle_r, true),
        occ(f("Area", 2), &circle_area, true),
        occ(f("scale", 2), "local 2", true),
        occ(f("double", 1), &double, true),
        occ(f("x int", 1)[..2].iter().cloned().chain([f("x int", 1)[1] + 1]).collect(), "local 3", true),
        occ(f("apply", 1), &apply, true),
        occ(f("f func", 1)[..2].iter().cloned().chain([f("f func", 1)[1] + 1]).collect(), "local 4", true),
        occ(f("v int", 1)[..2].iter().cloned().chain([f("v int", 1)[1] + 1]).collect(), "local 5", true),
        occ(f("f(v)", 1)[..2].iter().cloned().chain([f("f(v)", 1)[1] + 1]).collect(), "local 4", false),
        occ(f("total", 1), &total, true),
        occ(f("s Shape", 1)[..2].iter().cloned().chain([f("s Shape", 1)[1] + 1]).collect(), "local 6", true),
        occ(f("n int", 1)[..2].iter().cloned().chain([f("n int", 1)[1] + 1]).collect(), "local 7", true),
        occ(f("double", 2), &double, false),
        occ(f("apply", 2), &apply, false),
        occ(f("double", 3), &double, false),
        occ(f("Area", 3), &shape_area, false),
        occ(f("main", 2), &main, true),
        occ(f("ToUpper", 1), &to_upper, false),
        occ(f("total", 2), &total, false),
    ];
    let rel = |s: &str| Relationship { symbol: s.into(), is_reference: false, is_implementation: true, is_type_definition: false, is_definition: false };
    let si = |s: &str, name: &str, rels| SymbolInformation {
        symbol: s.into(), documentation: vec![], relationships: rels, kind: 0, display_name: name.into(), signature_documentation: None, enclosing_symbol: String::new(),
    };
    let doc = Document {
        relative_path: "main.go".into(),
        occurrences,
        symbols: vec![
            SymbolInformation { documentation: vec!["Shape is implemented by Circle.".into()], ..si(&shape, "Shape", vec![]) },
            si(&circle_area, "Area", vec![rel(&shape_area)]),
        ],
        language: "go".into(),
        text: String::new(),
        position_encoding: 0,
    };
    Index {
        metadata: Some(Metadata { version: 0, tool_info: Some(ToolInfo { name: "scip-go".into(), version: "test".into(), arguments: vec![] }), project_root: String::new(), text_document_encoding: 0 }),
        documents: vec![doc],
        external_symbols: vec![],
    }
}

fn make() -> Graph {
    let src = std::fs::read_to_string(fixture().join("main.go")).unwrap();
    // Round-trip through the wire format.
    let bytes = index(&src).encode_to_vec();
    let idx = scip::decode(&bytes).unwrap();
    let read = |p: &str| std::fs::read_to_string(fixture().join(p)).ok();
    let go = Go;
    let syn = |lang: &str, _p: &str| -> Option<&dyn Syntax> { (lang == "go").then_some(&go as &dyn Syntax) };
    build(&Inputs { index: &idx, read_source: &read, syntax_for: &syn })
}

fn has(g: &Graph, kind: EdgeKind, from: &str, to: &str, prov: Provenance, label: Option<&str>) -> bool {
    g.edges.iter().any(|e| {
        e.kind == kind && e.from == from && e.to == to && e.provenance == prov && e.label.as_deref() == label
    })
}

#[test]
fn hand_checked_edges() {
    let g = make();
    let (double, apply, total, main) = (sym("double()."), sym("apply()."), sym("total()."), sym("main()."));
    let (shape_area, circle_area) = (sym("Shape#Area()."), sym("Circle#Area()."));
    let to_upper = "scip-go gomod std . strings/ToUpper().";
    use EdgeKind::*;
    use Provenance::*;

    // Calls.
    assert!(has(&g, Call, &total, &double, Resolved, None));
    assert!(has(&g, Call, &total, &apply, Resolved, None));
    assert!(has(&g, Call, &total, &shape_area, Resolved, None));
    assert!(has(&g, Call, &total, &circle_area, May, Some("dispatch")));
    assert!(has(&g, Call, &main, &total, Resolved, None));
    assert!(has(&g, Call, &main, to_upper, Resolved, None));
    // Call through a parameter: stub stays, and the function value that reaches it is `may`.
    let stub = format!("unresolved:{apply}:f");
    assert!(has(&g, Call, &apply, &stub, Unresolved, None));
    assert!(has(&g, Call, &apply, &double, May, Some("via f")));
    // Override.
    assert!(has(&g, Override, &circle_area, &shape_area, Resolved, None));
    // Flow: arguments to parameters, returns to assignments, function values.
    assert!(has(&g, Flow, &total, &double, Resolved, Some("arg0:x")));
    assert!(has(&g, Flow, &total, &apply, Resolved, Some("arg0:f")));
    assert!(has(&g, Flow, &total, &apply, Resolved, Some("arg1:v")));
    assert!(has(&g, Flow, &double, &apply, Resolved, Some("fn:arg0:f")));
    assert!(has(&g, Flow, &total, &shape_area, Resolved, Some("arg0")));
    assert!(has(&g, Flow, &double, &total, Resolved, Some("return")));
    assert!(has(&g, Flow, &apply, &total, Resolved, Some("return")));
    assert!(has(&g, Flow, to_upper, &main, Resolved, Some("return")));
    assert!(has(&g, Flow, &main, to_upper, Resolved, Some("arg0")));
    // `total(...)` in `_ = total(..)` feeds an assignment.
    assert!(has(&g, Flow, &total, &main, Resolved, Some("return")));
    // External is labeled by package.
    assert!(has(&g, Contains, "ext:std", to_upper, Resolved, None));
    // Containment: file > type > method, package > file.
    assert!(has(&g, Contains, &sym("Circle#"), &circle_area, Resolved, None));
    assert!(has(&g, Contains, "file:main.go", &sym("Circle#"), Resolved, None));
    assert!(has(&g, Contains, "pkg:example.com/basic:example.com/basic", "file:main.go", Resolved, None));
    // Doc comment comes from the index, base layer.
    let shape = g.nodes.iter().find(|n| n.id == sym("Shape#")).unwrap();
    assert_eq!(shape.doc.as_deref(), Some("Shape is implemented by Circle."));
}

#[test]
fn golden_and_determinism() {
    let a = make().to_json();
    let b = make().to_json();
    assert_eq!(a, b, "two runs differ");
    let golden = fixture().join("expected.graph.json");
    if std::env::var("UPDATE_GOLDEN").is_ok() {
        std::fs::write(&golden, &a).unwrap();
    }
    let want = std::fs::read_to_string(&golden).expect("golden missing; run with UPDATE_GOLDEN=1");
    assert_eq!(a, want, "graph differs from golden");
    assert!(!a.contains("/Users/"), "absolute path leaked");
}

fn tmp_repo(tag: &str, scip: &[u8]) -> (PathBuf, PathBuf) {
    let root = std::env::temp_dir().join(format!("hesperus-test-{}-{tag}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let repo = root.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    for f in ["go.mod", "main.go"] {
        std::fs::copy(fixture().join(f), repo.join(f)).unwrap();
    }
    let idx = root.join("index.scip");
    std::fs::write(&idx, scip).unwrap();
    (repo, idx)
}

fn tree(dir: &std::path::Path) -> Vec<(String, Vec<u8>)> {
    fn go(base: &std::path::Path, d: &std::path::Path, out: &mut Vec<(String, Vec<u8>)>) {
        for e in std::fs::read_dir(d).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                go(base, &p, out);
            } else {
                out.push((p.strip_prefix(base).unwrap().to_string_lossy().into(), std::fs::read(&p).unwrap()));
            }
        }
    }
    let mut out = vec![];
    go(dir, dir, &mut out);
    out.sort();
    out
}

fn cli(args: &[&str]) -> std::process::Output {
    std::process::Command::new(env!("CARGO_BIN_EXE_hesperus")).args(args).output().unwrap()
}

#[test]
fn cli_cache_is_deterministic_and_fails_loudly_when_stale() {
    let src = std::fs::read_to_string(fixture().join("main.go")).unwrap();
    let bytes = index(&src).encode_to_vec();
    let (r1, i1) = tmp_repo("a", &bytes);
    let (r2, i2) = tmp_repo("b", &bytes);
    for (r, i) in [(&r1, &i1), (&r2, &i2)] {
        let o = cli(&["index", r.to_str().unwrap(), "--scip", i.to_str().unwrap()]);
        assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    }
    // Fresh checkout in another directory: identical bytes.
    assert_eq!(tree(&r1.join(".hesperus")), tree(&r2.join(".hesperus")));
    // Read-only toward the repo: only the cache was added.
    let mut names: Vec<_> = std::fs::read_dir(&r1).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    assert_eq!(names, vec![".hesperus", "go.mod", "main.go"]);
    // Cached graph equals the in-memory build.
    let o = cli(&["graph", r1.to_str().unwrap()]);
    assert!(o.status.success());
    assert_eq!(String::from_utf8(o.stdout).unwrap(), make().to_json());
    // A lockfile change invalidates the cache loudly.
    std::fs::write(r1.join("go.sum"), "x\n").unwrap();
    let o = cli(&["graph", r1.to_str().unwrap()]);
    assert!(!o.status.success());
    assert!(String::from_utf8_lossy(&o.stderr).contains("lockfile_hash"));
}

fn status(repo: &std::path::Path) -> String {
    let o = cli(&["status", repo.to_str().unwrap()]);
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let v: serde_json::Value = serde_json::from_slice(&o.stdout).unwrap();
    v["state"].as_str().unwrap().to_string()
}

/// Without --scip, index runs the indexer in the repo and writes only the cache.
#[cfg(unix)]
#[test]
fn index_runs_indexer_and_status_tracks_cache() {
    use std::os::unix::fs::PermissionsExt;
    let src = std::fs::read_to_string(fixture().join("main.go")).unwrap();
    let (repo, idx) = tmp_repo("indexer", &index(&src).encode_to_vec());
    // A stand-in scip-go at the pinned install location; same flags: `--output <path>`.
    let tools = repo.parent().unwrap().join("tools");
    let fake = tools.join("scip-go-0.2.9").join("bin").join("scip-go");
    std::fs::create_dir_all(fake.parent().unwrap()).unwrap();
    std::fs::write(&fake, format!("#!/bin/sh\ncp '{}' \"$2\"\n", idx.display())).unwrap();
    std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
    let t: serde_json::Value = serde_json::from_slice(&cli(&["tools", repo.to_str().unwrap(), "--tools-dir", tools.to_str().unwrap()]).stdout).unwrap();
    assert_eq!(t["languages"][0]["id"], "go");
    assert_eq!(t["tools"][0]["bin"], fake.to_str().unwrap());
    assert_eq!(t["tools"][0]["install"]["kind"], "go");
    assert_eq!(status(&repo), "missing");
    let o = cli(&["index", repo.to_str().unwrap(), "--tools-dir", tools.to_str().unwrap()]);
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    assert_eq!(status(&repo), "ready");
    let mut names: Vec<_> = std::fs::read_dir(&repo).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    assert_eq!(names, vec![".hesperus", "go.mod", "main.go"]);
    let o = cli(&["graph", repo.to_str().unwrap()]);
    assert_eq!(String::from_utf8(o.stdout).unwrap(), make().to_json());
    std::fs::write(repo.join("go.sum"), "x\n").unwrap();
    assert_eq!(status(&repo), "stale");
    // No supported files at all: a clear error instead of an empty graph.
    std::fs::remove_file(repo.join("main.go")).unwrap();
    let o = cli(&["index", repo.to_str().unwrap(), "--tools-dir", tools.to_str().unwrap()]);
    assert!(!o.status.success());
    assert!(String::from_utf8_lossy(&o.stderr).contains("no supported language"));
}

/// Index produced by a real scip-go 0.2.9 run over this fixture (typed ranges,
/// interface methods as `MethodSpecification` terms).
#[test]
fn real_scip_go_index() {
    let idx = scip::decode(&std::fs::read(fixture().join("scip-go.index.scip")).unwrap()).unwrap();
    let read = |p: &str| std::fs::read_to_string(fixture().join(p)).ok();
    let go = Go;
    let syn = |lang: &str, _p: &str| -> Option<&dyn Syntax> { (lang == "go").then_some(&go as &dyn Syntax) };
    let g = build(&Inputs { index: &idx, read_source: &read, syntax_for: &syn });
    let s = |r: &str| format!("scip-go gomod example.com/basic 2389aa4271eb `example.com/basic`/{r}");
    let (double, apply, total, main) = (s("double()."), s("apply()."), s("total()."), s("main()."));
    let (shape_area, circle_area) = (s("Shape#Area."), s("Circle#Area()."));
    let to_upper = "scip-go gomod github.com/golang/go/src go1.22 strings/ToUpper().";
    use EdgeKind::*;
    use Provenance::*;
    assert!(has(&g, Call, &total, &double, Resolved, None));
    assert!(has(&g, Call, &total, &apply, Resolved, None));
    assert!(has(&g, Call, &total, &shape_area, Resolved, None));
    assert!(has(&g, Call, &total, &circle_area, May, Some("dispatch")));
    assert!(has(&g, Call, &main, &total, Resolved, None));
    assert!(has(&g, Call, &main, to_upper, Resolved, None));
    assert!(has(&g, Call, &apply, &format!("unresolved:{apply}:f"), Unresolved, None));
    assert!(has(&g, Call, &apply, &double, May, Some("via f")));
    assert!(has(&g, Override, &circle_area, &shape_area, Resolved, None));
    assert!(has(&g, Flow, &total, &double, Resolved, Some("arg0:x")));
    assert!(has(&g, Flow, &total, &apply, Resolved, Some("arg1:v")));
    assert!(has(&g, Flow, &double, &apply, Resolved, Some("fn:arg0:f")));
    assert!(has(&g, Flow, &double, &total, Resolved, Some("return")));
    assert!(has(&g, Flow, &main, &total, Resolved, Some("arg1:n")));
    assert_eq!(g.to_json(), build(&Inputs { index: &idx, read_source: &read, syntax_for: &syn }).to_json());
}
