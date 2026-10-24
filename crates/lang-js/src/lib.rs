use hesperus_core::frontend::{extension, Frontend, Install, Tool};
use hesperus_core::ir::Range;
use hesperus_core::syntax::{CallSite, Facts, ParamDecl, Syntax};
use std::path::{Path, PathBuf};
use std::process::Command;
use tree_sitter::{Language, Node, Parser};

pub const LANGUAGE_ID: &str = "javascript";

/// JavaScript and TypeScript, resolved by scip-typescript.
pub struct Js;

/// One grammar each: the TypeScript grammar does not parse JSX, and TSX rejects `<T>x` casts.
pub struct Grammar(fn() -> Language);

static JS: Grammar = Grammar(|| tree_sitter_javascript::LANGUAGE.into());
static TS: Grammar = Grammar(|| tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into());
static TSX: Grammar = Grammar(|| tree_sitter_typescript::LANGUAGE_TSX.into());

const CONFIGS: [&str; 2] = ["tsconfig.json", "jsconfig.json"];

impl Frontend for Js {
    fn id(&self) -> &'static str {
        LANGUAGE_ID
    }
    fn extensions(&self) -> &'static [&'static str] {
        &["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"]
    }
    fn tool(&self) -> Tool {
        Tool {
            name: "scip-typescript",
            version: "0.5.2",
            install: Install::Npm {
                package_json: include_str!("tool/package.json"),
                package_lock: include_str!("tool/package-lock.json"),
            },
        }
    }
    fn bin_in(&self, dir: &Path) -> PathBuf {
        dir.join("node_modules").join(".bin").join("scip-typescript")
    }
    /// scip-typescript needs a tsconfig and writes one into the project when inferring it.
    /// Index a scratch overlay instead: symlinks to the repo's entries plus our config.
    /// `preserveSymlinks` keeps paths, and so symbols, relative to the overlay root.
    fn command(&self, repo: &Path, bin: &Path, out: &Path, scratch: &Path) -> Result<Command, String> {
        let overlay = scratch.join("js-overlay");
        std::fs::create_dir_all(&overlay).map_err(|e| format!("{}: {e}", overlay.display()))?;
        let has_config = CONFIGS.iter().any(|c| repo.join(c).is_file());
        let mut entries: Vec<PathBuf> =
            std::fs::read_dir(repo).map_err(|e| format!("{}: {e}", repo.display()))?.filter_map(|e| e.ok().map(|e| e.path())).collect();
        entries.sort();
        for e in entries {
            let Some(name) = e.file_name() else { continue };
            if name == ".git" || name == hesperus_core::cache::CACHE_DIR {
                continue;
            }
            link(&e, &overlay.join(name))?;
        }
        if !has_config {
            let cfg = r#"{"compilerOptions":{"allowJs":true,"noEmit":true,"preserveSymlinks":true}}"#;
            std::fs::write(overlay.join("tsconfig.json"), cfg).map_err(|e| format!("{}: {e}", overlay.display()))?;
        }
        let mut c = Command::new(bin);
        c.args(["index", "--no-progress-bar", "--cwd"]).arg(&overlay).arg("--output").arg(out).arg(&overlay).current_dir(&overlay);
        Ok(c)
    }
    fn syntax(&self, path: &str) -> Option<&dyn Syntax> {
        match extension(path)?.as_str() {
            "js" | "mjs" | "cjs" | "jsx" => Some(&JS),
            "ts" | "mts" | "cts" => Some(&TS),
            "tsx" => Some(&TSX),
            _ => None,
        }
    }
}

#[cfg(unix)]
fn link(src: &Path, dst: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(src, dst).map_err(|e| format!("{}: {e}", dst.display()))
}

#[cfg(windows)]
fn link(src: &Path, dst: &Path) -> Result<(), String> {
    let r = if src.is_dir() { std::os::windows::fs::symlink_dir(src, dst) } else { std::os::windows::fs::symlink_file(src, dst) };
    r.map_err(|e| format!("{}: {e}", dst.display()))
}

fn rng(n: Node) -> Range {
    let (s, e) = (n.start_position(), n.end_position());
    Range { start_line: s.row as u32, start_col: s.column as u32, end_line: e.row as u32, end_col: e.column as u32 }
}

fn text(n: Node, src: &str) -> String {
    src[n.byte_range()].to_string()
}

impl Syntax for Grammar {
    fn facts(&self, source: &str) -> Facts {
        let mut p = Parser::new();
        p.set_language(&(self.0)()).expect("grammar loads");
        let mut f = Facts::default();
        if let Some(tree) = p.parse(source, None) {
            walk(tree.root_node(), source, &mut f);
        }
        f
    }
}

const FUNCTIONS: [&str; 7] = [
    "function_declaration",
    "generator_function_declaration",
    "function_expression",
    "function",
    "generator_function",
    "arrow_function",
    "method_definition",
];

/// The node that names a function: itself when declared, else the binding that holds it
/// (`const f = () => …`, `{ f: function () {} }`, `this.f = …`, class fields).
fn naming_decl(f: Node) -> Option<Node> {
    if matches!(f.kind(), "function_declaration" | "generator_function_declaration" | "method_definition") {
        return Some(f);
    }
    let p = f.parent()?;
    let holds = |field: &str| p.child_by_field_name(field).is_some_and(|v| v.id() == f.id());
    match p.kind() {
        "variable_declarator" | "public_field_definition" | "field_definition" if holds("value") => Some(p),
        "pair" if holds("value") => Some(p),
        "assignment_expression" if holds("right") => Some(p),
        _ => None,
    }
}

/// Binding name of one formal parameter; None for destructuring patterns.
fn param_name(n: Node) -> Option<Node> {
    match n.kind() {
        "identifier" => Some(n),
        "assignment_pattern" => n.child_by_field_name("left").filter(|l| l.kind() == "identifier"),
        "rest_pattern" => n.named_child(0).filter(|c| c.kind() == "identifier"),
        "required_parameter" | "optional_parameter" => n.child_by_field_name("pattern").and_then(param_name),
        _ => None,
    }
}

fn walk(n: Node, src: &str, f: &mut Facts) {
    if FUNCTIONS.contains(&n.kind()) {
        if let Some(d) = naming_decl(n) {
            let decl = rng(d);
            f.decls.push(decl);
            if let Some(params) = n.child_by_field_name("parameters") {
                let mut c = params.walk();
                let list: Vec<Node> = params.named_children(&mut c).filter(|x| x.kind() != "comment").collect();
                for (index, p) in list.into_iter().enumerate() {
                    if let Some(name) = param_name(p) {
                        f.params.push(ParamDecl { name: text(name, src), range: rng(name), index, decl });
                    }
                }
            } else if let Some(p) = n.child_by_field_name("parameter") {
                // `x => …` has a bare identifier parameter.
                f.params.push(ParamDecl { name: text(p, src), range: rng(p), index: 0, decl });
            }
        }
    }
    let callee = match n.kind() {
        "call_expression" => n.child_by_field_name("function"),
        "new_expression" => n.child_by_field_name("constructor"),
        _ => None,
    };
    if let Some(func) = callee {
        let name = match func.kind() {
            "member_expression" => func.child_by_field_name("property").unwrap_or(func),
            _ => func,
        };
        let mut args = Vec::new();
        if let Some(a) = n.child_by_field_name("arguments") {
            let mut c = a.walk();
            for x in a.named_children(&mut c) {
                if x.kind() != "comment" {
                    args.push(rng(x));
                }
            }
        }
        let used = n.parent().is_some_and(|p| p.kind() != "expression_statement");
        f.calls.push(CallSite { callee: rng(name), callee_text: text(func, src), args, result_used: used });
    }
    let mut c = n.walk();
    for ch in n.children(&mut c) {
        walk(ch, src, f);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(f: &Facts) -> Vec<(&str, usize)> {
        f.params.iter().map(|p| (p.name.as_str(), p.index)).collect()
    }

    #[test]
    fn javascript_functions_params_and_calls() {
        let src = "function f(a, {b}, c = 1, ...rest) {\n  g(a);\n  const x = this.h.m(c);\n  return new K(x);\n}\nconst k = y => y;\nconst o = { p: function (z) { return z; } };\nitems.map((i) => i);\n";
        let f = JS.facts(src);
        // f, k, o.p are named; the callback passed to map is not.
        assert_eq!(f.decls.len(), 3);
        assert_eq!(names(&f), vec![("a", 0), ("c", 2), ("rest", 3), ("y", 0), ("z", 0)]);
        let calls: Vec<(&str, bool)> = f.calls.iter().map(|c| (c.callee_text.as_str(), c.result_used)).collect();
        assert_eq!(calls, vec![("g", false), ("this.h.m", true), ("K", true), ("items.map", false)]);
        assert_eq!(f.calls[1].callee.start_col, 19); // `m` in "  const x = this.h.m(c);"
    }

    #[test]
    fn typescript_and_tsx_parameters() {
        let ts = TS.facts("class C {\n  run(a: number, b?: string): void { this.go(a); }\n}\n");
        assert_eq!(names(&ts), vec![("a", 0), ("b", 1)]);
        assert_eq!(ts.calls.len(), 1);
        let tsx = TSX.facts("export const View = (p: Props) => <div onClick={() => go(p)} />;\n");
        assert_eq!(names(&tsx), vec![("p", 0)]);
        assert_eq!(tsx.calls[0].callee_text, "go");
    }

    /// The indexer sees the repo through an overlay; the repo itself gains nothing.
    #[cfg(unix)]
    #[test]
    fn command_writes_only_scratch() {
        let root = std::env::temp_dir().join(format!("hesperus-js-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let (repo, scratch) = (root.join("repo"), root.join("scratch"));
        std::fs::create_dir_all(repo.join("src")).unwrap();
        std::fs::create_dir_all(repo.join(".git")).unwrap();
        std::fs::write(repo.join("src/a.js"), "f()\n").unwrap();
        let c = Js.command(&repo, Path::new("/bin/scip-typescript"), &scratch.join("o.scip"), &scratch).unwrap();
        let overlay = scratch.join("js-overlay");
        assert_eq!(c.get_current_dir(), Some(overlay.as_path()));
        assert!(std::fs::symlink_metadata(overlay.join("src")).unwrap().file_type().is_symlink());
        assert!(!overlay.join(".git").exists());
        assert!(std::fs::read_to_string(overlay.join("tsconfig.json")).unwrap().contains("preserveSymlinks"));
        let mut names: Vec<_> = std::fs::read_dir(&repo).unwrap().map(|e| e.unwrap().file_name()).collect();
        names.sort();
        assert_eq!(names, vec![".git", "src"]);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn grammar_by_extension() {
        assert!(Js.syntax("web/a.mjs").is_some());
        assert!(Js.syntax("web/a.TSX").is_some());
        assert!(Js.syntax("web/a.css").is_none());
    }
}
