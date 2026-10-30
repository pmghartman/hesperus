//! Golden tests: SPEC examples round-trip, broken fixtures produce the expected
//! diagnostics, the formatter is idempotent, and the differ covers every status.
//! Set UPDATE_GOLDEN=1 to rewrite the expected files.

use hesperus_core::diag::{render, Diagnostic, Severity};
use hesperus_core::format::format_file;
use hesperus_core::lower::{load, Source};
use hesperus_core::parser::parse;
use hesperus_core::print::print;
use hesperus_core::project::{format_text, load_from_disk};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap()
}

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

struct MemSource(HashMap<String, String>);
impl Source for MemSource {
    fn read(&self, path: &str) -> Result<String, hesperus_core::lower::ReadError> {
        self.0.get(path).cloned().ok_or_else(|| hesperus_core::lower::ReadError::Missing("not in map".into()))
    }
}

fn check_golden(path: &Path, actual: &str) {
    if std::env::var("UPDATE_GOLDEN").is_ok() {
        std::fs::write(path, actual).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(path).unwrap_or_else(|_| panic!("missing golden {}; run with UPDATE_GOLDEN=1", path.display()));
    if expected != actual {
        panic!("golden mismatch for {}\n--- expected\n{}\n--- actual\n{}", path.display(), expected, actual);
    }
}

fn codes(diags: &[Diagnostic]) -> Vec<&str> {
    let mut v: Vec<&str> = diags.iter().filter(|d| d.severity == Severity::Error).map(|d| d.code).collect();
    v.sort();
    v.dedup();
    v
}

/// A fenced block from SPEC.md.
struct Fence {
    info: String,
    body: String,
}

fn spec_fences() -> Vec<Fence> {
    let text = std::fs::read_to_string(root().join("docs/SPEC.md")).unwrap();
    let mut out = Vec::new();
    let mut cur: Option<Fence> = None;
    for line in text.lines() {
        if let Some(f) = &mut cur {
            if line.starts_with("```") {
                out.push(cur.take().unwrap());
            } else {
                f.body.push_str(line);
                f.body.push('\n');
            }
        } else if let Some(info) = line.strip_prefix("```") {
            if info.starts_with("hesp") {
                cur = Some(Fence { info: info.to_string(), body: String::new() });
            } else {
                cur = Some(Fence { info: String::from("skip"), body: String::new() });
            }
        }
    }
    out.into_iter().filter(|f| f.info != "skip").collect()
}

/// Every SPEC example parses, lowers, and prints to its canonical form; errors match.
#[test]
fn spec_examples_round_trip() {
    let fences = spec_fences();
    assert!(fences.len() >= 10, "SPEC.md should hold examples");
    let mut i = 0;
    let mut checked = 0;
    while i < fences.len() {
        let f = &fences[i];
        let attrs: Vec<&str> = f.info.split_whitespace().collect();
        if attrs.contains(&"fragment") {
            i += 1;
            continue;
        }
        if let Some(err) = attrs.iter().find_map(|a| a.strip_prefix("error=")) {
            let mut expected: Vec<&str> = err.split(',').collect();
            expected.sort();
            let project = load("example.hesp", &MemSource(HashMap::from([("example.hesp".to_string(), f.body.clone())])));
            assert_eq!(codes(&project.diags), expected, "error codes for example:\n{}\n{}", f.body, render(&project.diags, &|_| Some(f.body.clone())));
            i += 1;
            checked += 1;
            continue;
        }
        if let Some(first) = attrs.iter().find_map(|a| a.strip_prefix("file=")) {
            // multi-file example: consecutive file= fences
            let mut files = HashMap::new();
            files.insert(first.to_string(), f.body.clone());
            let master = first.to_string();
            let mut j = i + 1;
            while j < fences.len() {
                let a: Vec<&str> = fences[j].info.split_whitespace().collect();
                match a.iter().find_map(|a| a.strip_prefix("file=")) {
                    Some(name) => {
                        files.insert(name.to_string(), fences[j].body.clone());
                        j += 1;
                    }
                    None => break,
                }
            }
            let project = load(&master, &MemSource(files.clone()));
            assert!(!project.has_errors(), "multi-file example has errors:\n{}", render(&project.diags, &|p| files.get(p).cloned()));
            let printed = print(&project.ir);
            assert_eq!(printed.len(), files.len());
            for (path, text) in &printed {
                assert_eq!(files.get(path).unwrap(), text, "canonical print of {path} differs");
            }
            // IR fixed point
            let again = load(&master, &MemSource(printed.into_iter().collect()));
            assert_eq!(again.ir, project.ir);
            i = j;
            checked += 1;
            continue;
        }
        // single file, optionally followed by a canonical form
        let canonical = fences.get(i + 1).filter(|n| n.info.split_whitespace().any(|a| a == "canonical")).map(|n| n.body.clone()).unwrap_or_else(|| f.body.clone());
        let project = load("example.hesp", &MemSource(HashMap::from([("example.hesp".to_string(), f.body.clone())])));
        assert!(!project.has_errors(), "example has errors:\n{}\n{}", f.body, render(&project.diags, &|_| Some(f.body.clone())));
        let printed = print(&project.ir);
        assert_eq!(printed.len(), 1);
        assert_eq!(printed[0].1, canonical, "canonical print differs for example:\n{}", f.body);
        // the canonical text is a fixed point of the printer and lowers to the same IR
        let again = load("example.hesp", &MemSource(HashMap::from([("example.hesp".to_string(), canonical.clone())])));
        assert!(!again.has_errors());
        assert_eq!(again.ir, project.ir, "canonical form lowers to a different IR");
        assert_eq!(print(&again.ir)[0].1, canonical);
        // and the IR itself survives JSON
        let json = project.ir.to_json();
        let back = hesperus_core::Ir::from_json(&json).unwrap();
        assert_eq!(back, project.ir);
        assert_eq!(back.to_json(), json);
        i += if canonical != f.body { 2 } else { 1 };
        checked += 1;
    }
    assert!(checked >= 9, "checked {checked} examples");
}

/// fmt(fmt(x)) == fmt(x) for every example, fixture and the Phosphorus intent;
/// and formatting never changes the IR.
#[test]
fn formatter_is_idempotent_and_meaning_preserving() {
    let mut inputs: Vec<(String, String)> = Vec::new();
    for f in spec_fences() {
        if !f.info.contains("error") && !f.info.contains("fragment") {
            inputs.push(("spec".into(), f.body));
        }
    }
    for p in hesperus_core::project::find_hesp_files(&root().join("examples")) {
        inputs.push((p.display().to_string(), std::fs::read_to_string(&p).unwrap()));
    }
    inputs.push(("messy".into(), MESSY.to_string()));
    assert!(inputs.len() > 10);
    for (name, text) in inputs {
        let (once, diags) = format_text("x.hesp", &text);
        assert!(!diags.iter().any(|d| d.severity == Severity::Error), "{name}: {diags:?}");
        let (twice, _) = format_text("x.hesp", &once);
        assert_eq!(once, twice, "formatter not idempotent on {name}");
        if !text.contains("import") {
            let a = load("x.hesp", &MemSource(HashMap::from([("x.hesp".to_string(), text.clone())])));
            let b = load("x.hesp", &MemSource(HashMap::from([("x.hesp".to_string(), once.clone())])));
            assert_eq!(a.ir, b.ir, "formatting changed the IR of {name}");
        }
    }
    let (formatted, _) = format_text("x.hesp", MESSY);
    check_golden(&fixtures().join("messy.formatted.hesp"), &formatted);
}

const MESSY: &str = "hesperus 0.1\n\n\n# leading comment\n\nlet   xs=[a,b,\n  \"c\"]\ntemplate t(p){\n\n  component   $p \"L $p\"  {\n    desc  :\"d\"\n\n\n  }\n}\nsystem   s  \"The   system\"   { # trailing on brace\n    src:   [\"a/**\",\"b\"]\n  t(q)   # call\n  each x in xs { component $x }\n\n\n\n  component a   # trailing\n  # between\n  component   b{\n  }\n  a   ->   b   : calls   \"lbl\"   {\n    at: [\"f.ts:1\"]\n  }\n  forbid   a->b\n  # last\n}\n# eof comment\n";

/// Broken fixtures: every error, with span and fix, matches the golden `.diag` file.
#[test]
fn broken_fixtures_report_all_errors() {
    let dir = fixtures().join("broken");
    for name in ["many", "unterminated", "templates", "noroot", "tworoots", "imports", "garbage"] {
        let path = dir.join(format!("{name}.hesp"));
        let project = load_from_disk(&path.display().to_string());
        assert!(project.has_errors(), "{name} should have errors");
        let src = |p: &str| project.text_of(p).map(|s| s.to_string());
        let mut text = render(&project.diags, &src);
        // keep paths relative in the golden
        text = text.replace(&dir.display().to_string(), "fixtures/broken");
        check_golden(&dir.join(format!("{name}.diag")), &text);
    }
}

/// The parser and expander never panic on malformed input.
#[test]
fn malformed_input_never_panics() {
    let seeds: Vec<String> = spec_fences().into_iter().map(|f| f.body).chain([MESSY.to_string()]).collect();
    let tokens = ["{", "}", "[", "]", "(", ")", ":", ",", ".", "->", "\"", "$", "#", "\n", "import", "each", "template", "let", "=", "system", "x", "\\", "\u{e9}", "\t"];
    let mut rng = 0x9e3779b97f4a7c15u64;
    let mut next = || {
        rng ^= rng << 13;
        rng ^= rng >> 7;
        rng ^= rng << 17;
        rng
    };
    let mut runs = 0;
    for seed in &seeds {
        for _ in 0..40 {
            let mut text = seed.clone();
            for _ in 0..(1 + next() % 4) {
                let bytes = text.len().max(1);
                let mut pos = (next() as usize) % bytes;
                while !text.is_char_boundary(pos) {
                    pos -= 1;
                }
                match next() % 3 {
                    0 => text.insert_str(pos, tokens[(next() as usize) % tokens.len()]),
                    1 => {
                        let mut end = (pos + 1 + (next() as usize) % 8).min(text.len());
                        while !text.is_char_boundary(end) {
                            end += 1;
                        }
                        text.replace_range(pos..end, "");
                    }
                    _ => {
                        let t = tokens[(next() as usize) % tokens.len()];
                        let mut end = (pos + 1).min(text.len());
                        while !text.is_char_boundary(end) {
                            end += 1;
                        }
                        text.replace_range(pos..end, t);
                    }
                }
            }
            let project = load("fuzz.hesp", &MemSource(HashMap::from([("fuzz.hesp".to_string(), text.clone())])));
            let _ = format_text("fuzz.hesp", &text);
            if !project.has_errors() {
                let _ = print(&project.ir);
            }
            runs += 1;
        }
    }
    assert!(runs > 300);
}

/// Differ goldens: all four statuses, forbidden and required edges, nested containers, aggregation.
#[test]
fn differ_goldens() {
    for name in ["statuses", "nested", "aggregate"] {
        let dir = fixtures().join("diff").join(name);
        let intent = load_from_disk(&dir.join("intent.hesp").display().to_string());
        let actual = load_from_disk(&dir.join("actual.hesp").display().to_string());
        assert!(!intent.has_errors(), "{name} intent: {}", render(&intent.diags, &|p| intent.text_of(p).map(|s| s.to_string())));
        assert!(!actual.has_errors(), "{name} actual: {}", render(&actual.diags, &|p| actual.text_of(p).map(|s| s.to_string())));
        let u = hesperus_core::diff::diff(&intent.ir, &actual.ir);
        check_golden(&dir.join("unified.json"), &u.to_json());
        check_golden(&dir.join("diff.txt"), &hesperus_core::diff::render(&u, true));
        if name == "aggregate" {
            let d1 = hesperus_core::diff::aggregate(&u, 1);
            check_golden(&dir.join("depth1.txt"), &hesperus_core::diff::render(&d1, true));
            check_golden(&dir.join("depth1.json"), &d1.to_json());
            let d2 = hesperus_core::diff::aggregate(&u, 2);
            check_golden(&dir.join("depth2.txt"), &hesperus_core::diff::render(&d2, true));
        }
        if name == "statuses" {
            use hesperus_core::diff::Status;
            let st = |id: &str| u.nodes.iter().find(|n| n.id == id).map(|n| n.status).unwrap();
            assert_eq!(st("shop.api"), Status::Match);
            assert_eq!(st("shop.recommendations"), Status::IntentOnly);
            assert_eq!(st("shop.filesystem"), Status::ActualOnly);
            assert_eq!(st("shop.db"), Status::Conflict);
            assert_eq!(st("shop.edge"), Status::Conflict);
            assert_eq!(u.summary.violations, 3);
        }
    }
}

/// The printer places every edge in the lowest common ancestor and the result re-parses.
#[test]
fn printer_places_edges_at_lca() {
    let text = "hesperus 0.1\n\nsystem s {\n  subsystem a {\n    component x\n    component y\n  }\n  subsystem b {\n    component z\n  }\n\n  a.x -> a.y: calls\n  a.x -> b.z: calls\n  s -> b: calls\n  a -> a.x: calls\n}\n";
    let project = load("s.hesp", &MemSource(HashMap::from([("s.hesp".to_string(), text.to_string())])));
    assert!(!project.has_errors(), "{}", render(&project.diags, &|_| Some(text.to_string())));
    let printed = print(&project.ir);
    let expected = "hesperus 0.1\n\nsystem s {\n  subsystem a {\n    component x\n    component y\n\n    x -> y: calls\n  }\n  subsystem b {\n    component z\n  }\n\n  s -> b: calls\n  a -> a.x: calls\n  a.x -> b.z: calls\n}\n";
    assert_eq!(printed[0].1, expected);
    let again = load("s.hesp", &MemSource(HashMap::from([("s.hesp".to_string(), expected.to_string())])));
    assert_eq!(again.ir, project.ir);
}

/// Shadowed names: `server.server` style ids still print paths that resolve correctly.
#[test]
fn printer_avoids_shadowed_paths() {
    let text = "hesperus 0.1\n\nsystem p {\n  subsystem server {\n    component server\n    component other\n  }\n  subsystem mesh {\n    component peers\n  }\n\n  server -> mesh: calls\n  server -> server.server: calls\n  server.server -> mesh.peers: calls\n  server.other -> server.server: calls\n}\n";
    let project = load("p.hesp", &MemSource(HashMap::from([("p.hesp".to_string(), text.to_string())])));
    assert!(!project.has_errors(), "{}", render(&project.diags, &|_| Some(text.to_string())));
    let printed = print(&project.ir);
    let again = load("p.hesp", &MemSource(HashMap::from([("p.hesp".to_string(), printed[0].1.clone())])));
    assert!(!again.has_errors(), "{}\n{}", printed[0].1, render(&again.diags, &|_| Some(printed[0].1.clone())));
    assert_eq!(again.ir, project.ir, "{}", printed[0].1);
}

#[test]
fn ast_formatter_keeps_templates_and_comments() {
    let parsed = parse("x.hesp", MESSY);
    assert!(parsed.diags.is_empty(), "{:?}", parsed.diags);
    let out = format_file(&parsed.file);
    assert!(out.contains("template t(p) {"));
    assert!(out.contains("# leading comment"));
    assert!(out.contains("component a # trailing"));
    assert!(out.contains("# eof comment"));
}

#[test]
fn path_helpers() {
    use hesperus_core::lower::{join, normalize, relative};
    assert_eq!(normalize("a/./b/../c"), "a/c");
    assert_eq!(normalize("../x/./y"), "../x/y");
    assert_eq!(join("examples/p", "./mesh.hesp"), "examples/p/mesh.hesp");
    assert_eq!(join("examples/p", "../q/x.hesp"), "examples/q/x.hesp");
    assert_eq!(relative("examples/p", "examples/p/mesh.hesp"), "./mesh.hesp");
    assert_eq!(relative("examples/p", "examples/q/x.hesp"), "../q/x.hesp");
    assert_eq!(relative("", "sub/a.hesp"), "./sub/a.hesp");
}

/// Regressions from the independent review: no panics, every error positioned, comments kept.
#[test]
fn review_regressions() {
    let check = |text: &str| load("r.hesp", &MemSource(HashMap::from([("r.hesp".to_string(), text.to_string())])));
    // a backslash before a multibyte character must not panic
    let p = check("hesperus 0.1\n\nsystem s {\n  component a {\n    desc: \"\\é\"\n  }\n}\n");
    assert_eq!(codes(&p.diags), vec!["E029"]);
    // deep nesting is an error, not a stack overflow
    let mut deep = String::from("hesperus 0.1\n\nsystem s {\n");
    for i in 0..3000 {
        deep.push_str(&format!("component n{i} {{\n"));
    }
    for _ in 0..3001 {
        deep.push_str("}\n");
    }
    let p = check(&deep);
    assert!(p.diags.iter().any(|d| d.code == "E035"), "{:?}", codes(&p.diags));
    let _ = format_text("r.hesp", &deep);
    // invalid UTF-8 is E034 with a position
    struct Bad;
    impl Source for Bad {
        fn read(&self, _: &str) -> Result<String, hesperus_core::lower::ReadError> {
            hesperus_core::lower::decode(b"hesperus 0.1\n\nsystem s {\n  component a \"\xff\"\n}\n".to_vec())
        }
    }
    let p = load("bad.hesp", &Bad);
    assert_eq!(codes(&p.diags), vec!["E034"]);
    assert_eq!(p.diags[0].span.start, 40);
    // comments after `}` and before the version line survive formatting
    let src = "# first\nhesperus 0.1\n\nsystem s {\n  component a { # open\n    desc: \"d\"\n  } # close\n} # end\n";
    let (out, diags) = format_text("r.hesp", src);
    assert!(diags.is_empty(), "{diags:?}");
    assert_eq!(out, src);
    // `\\$` is a backslash and a dollar; `\$` is an escaped dollar
    let p = check("hesperus 0.1\n\nsystem s {\n  component a \"x\\$y\"\n}\n");
    assert!(!p.has_errors());
    assert_eq!(p.ir.node("s.a").unwrap().label.as_deref(), Some("x$y"));
    assert_eq!(print(&p.ir)[0].1, "hesperus 0.1\n\nsystem s {\n  component a \"x\\$y\"\n}\n");
    let p = check("hesperus 0.1\n\nsystem s {\n  component a \"x\\\\$y\"\n}\n");
    assert_eq!(codes(&p.diags), vec!["E028"]);
    // a BOM is accepted
    let p = check("\u{FEFF}hesperus 0.1\n\nsystem s {\n  component a\n}\n");
    assert!(!p.has_errors(), "{:?}", p.diags);
    // `each` over a list parameter written with `$`
    let p = check("hesperus 0.1\n\ntemplate t(parts) {\n  each p in $parts {\n    component $p\n  }\n}\n\nsystem s {\n  t([a, b])\n}\n");
    assert!(!p.has_errors(), "{:?}", p.diags);
    assert!(p.ir.node("s.b").is_some());
    // a node whose name fails to expand still has its block checked
    let p = check("hesperus 0.1\n\nsystem s {\n  component $nope {\n    sources: \"x\"\n    inner -> nowhere: calls\n  }\n}\n");
    assert_eq!(codes(&p.diags), vec!["E007", "E011", "E028"]);
    // comments inside a multi-line list are allowed (and dropped)
    let p = check("hesperus 0.1\n\nsystem s {\n  src: [\n    \"a/**\", # first\n    # second\n    \"b/**\",\n  ]\n}\n");
    assert!(!p.has_errors(), "{:?}", p.diags);
    assert_eq!(p.ir.node("s").unwrap().src, vec!["a/**", "b/**"]);
    // long paths do not produce unbounded messages
    let long = format!("hesperus 0.1\n\nsystem s {{\n  component a\n\n  a -> {}: calls\n}}\n", vec!["x"; 20000].join("."));
    let p = check(&long);
    assert!(p.diags.iter().all(|d| d.message.len() < 400), "{}", p.diags[0].message.len());
}

/// Regressions from the second review.
#[test]
fn review_regressions_2() {
    let check = |text: &str| load("r.hesp", &MemSource(HashMap::from([("r.hesp".to_string(), text.to_string())])));
    // comments on the version and generated lines survive
    let src = "hesperus 0.1 # v\ngenerated \"x\" # g\n\nsystem s {\n  component a\n}\n";
    assert_eq!(format_text("r.hesp", src).0, src);
    // `at` entries must be path:line
    let p = check("hesperus 0.1\n\nsystem s {\n  component a {\n    at: [\"no-line\", \"weird:abc\", \"ok.ts:12\"]\n  }\n}\n");
    assert_eq!(p.diags.iter().filter(|d| d.code == "E009").count(), 2);
    // a one-letter id is not offered for an unrelated word, so no fix creates a self-edge
    let p = check("hesperus 0.1\n\nsystem s {\n  component b\n\n  b -> zz: calls\n}\n");
    assert_eq!(codes(&p.diags), vec!["E011"]);
    assert_eq!(p.diags[0].fix, None, "{:?}", p.diags[0]);
    // self-edge, duplicate property, misplaced definitions have their own codes
    let p = check("hesperus 0.1\n\nsystem s {\n  component a {\n    desc: \"x\"\n    desc: \"y\"\n    let q = [a]\n  }\n\n  a -> a: calls\n}\n");
    assert_eq!(codes(&p.diags), vec!["E036", "E037", "E039"]);
    // huge tokens are clipped in messages
    let p = check(&format!("hesperus 0.1\n\nsystem s {{\n  {} a\n}}\n", "x".repeat(100_000)));
    assert!(p.diags.iter().all(|d| d.message.len() < 400));
    let p = check(&format!("hesperus 0.1\n\nsystem s {{\n  \"{}\"\n}}\n", "x".repeat(100_000)));
    assert!(p.diags.iter().all(|d| d.message.len() < 400));
}

/// Regressions from the third review.
#[test]
fn review_regressions_3() {
    let check = |text: &str| load("r.hesp", &MemSource(HashMap::from([("r.hesp".to_string(), text.to_string())])));
    // deeply nested lists are E035, not a stack overflow
    let deep = format!("hesperus 0.1\n\nsystem s {{\n  src: {}\"x\"{}\n}}\n", "[".repeat(100_000), "]".repeat(100_000));
    let p = check(&deep);
    assert!(p.diags.iter().any(|d| d.code == "E035"), "{:?}", codes(&p.diags));
    let _ = format_text("r.hesp", &deep);
    // long duplicate ids are clipped in the message
    let long = "x".repeat(100_000);
    let p = check(&format!("hesperus 0.1\n\nsystem s {{\n  component {long}\n  component {long}\n}}\n"));
    assert!(p.diags.iter().all(|d| d.message.len() < 400));
    // generated detection does not depend on line position
    assert!(hesperus_core::project::is_generated("g.hesp", "# first\nhesperus 0.1\ngenerated \"hesperus-ts\"\n\nsystem s {\n  component a\n}\n"));
    assert!(!hesperus_core::project::is_generated("g.hesp", "hesperus 0.1\n\nsystem s {\n  component a\n}\n"));
    // a subsystem file checked alone may hold a child named like itself
    let p = load_from_disk(&root().join("examples/phosphorus/server.hesp").display().to_string());
    assert!(!p.has_errors(), "{}", render(&p.diags, &|q| p.text_of(q).map(|s| s.to_string())));
    // definitions after the root are misplaced
    let p = check("hesperus 0.1\n\nsystem s {\n  component a\n}\n\nlet l = [a]\n");
    assert_eq!(codes(&p.diags), vec!["E039"]);
    // a component cannot be a root
    let p = check("hesperus 0.1\n\ncomponent c {\n  component d\n}\n");
    assert_eq!(codes(&p.diags), vec!["E015"]);
    // a literal dollar gets the escape hint
    let p = check("hesperus 0.1\n\nsystem s {\n  desc: \"costs $5\"\n}\n");
    assert!(p.diags[0].message.contains("\\$"), "{}", p.diags[0].message);
    // E034 carries a position when the file comes from disk
    let dir = std::env::temp_dir().join(format!("hesp-utf8-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("bad.hesp");
    std::fs::write(&f, b"hesperus 0.1\n\nsystem s {\n  component a \"\xff\"\n}\n").unwrap();
    let p = load_from_disk(&f.display().to_string());
    let text = render(&p.diags, &|q| p.text_of(q).map(|s| s.to_string()));
    assert!(text.contains("bad.hesp:4:16: error[E034]"), "{text}");
    let _ = std::fs::remove_dir_all(&dir);
}

/// Regressions from the fourth review.
#[test]
fn review_regressions_4() {
    let check = |text: &str| load("r.hesp", &MemSource(HashMap::from([("r.hesp".to_string(), text.to_string())])));
    // a 300-item list argument is over the limit like any other list
    let items = (0..300).map(|i| format!("n{i}")).collect::<Vec<_>>().join(", ");
    let p = check(&format!("hesperus 0.1\n\ntemplate t(parts) {{\n  each p in $parts {{\n    component $p\n  }}\n}}\n\nsystem s {{\n  t([{items}])\n}}\n"));
    assert_eq!(codes(&p.diags), vec!["E021"]);
    // a one-item `at` prints bare and round-trips
    let src = "hesperus 0.1\ngenerated \"x\"\n\nsystem s {\n  component a {\n    at: \"src/x.ts:1\"\n  }\n  hardware fs\n\n  a -> fs: io {\n    at: \"src/x.ts:2\"\n  }\n}\n";
    let p = check(src);
    assert!(!p.has_errors(), "{:?}", p.diags);
    assert_eq!(print(&p.ir)[0].1, src);
    // a top-level property is a misplaced statement
    let p = check("hesperus 0.1\n\ndesc: \"x\"\nsystem s {\n  component a\n}\n");
    assert_eq!(codes(&p.diags), vec!["E039"]);
}
