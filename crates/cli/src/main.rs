use hesperus_core::aggregate;
use hesperus_core::build::{build, Inputs};
use hesperus_core::cache::{self, Header};
use hesperus_core::hash::sha256_hex;
use hesperus_core::ir::*;
use hesperus_core::scip;
use hesperus_core::frontend::{extension, Frontend};
use hesperus_core::syntax::Syntax;
use hesperus_lang_go::Go;
use hesperus_lang_js::Js;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, ExitCode};

const SCHEMA: &str = include_str!("../../../schema/graph.schema.json");
const LOCKFILES: &[&str] = &["Cargo.lock", "go.sum", "package-lock.json", "pnpm-lock.yaml", "poetry.lock", "uv.lock", "yarn.lock"];
/// Every language frontend. Order is irrelevant to output: indexes merge canonically.
const FRONTENDS: &[&dyn Frontend] = &[&Go, &Js];
const USAGE: &str = "usage:
  hesperus index <repo> [--scip <index.scip>]... [--tools-dir <dir>] [--lockfile <rel-path>]...
                                                     without --scip, runs each detected language's indexer
  hesperus tools <repo> [--tools-dir <dir>]          languages found and the indexers they need, as JSON
  hesperus status <repo> [--lockfile <rel-path>]...  cache state as JSON: ready, stale, or missing
  hesperus graph <repo> [--lockfile <rel-path>]...   print the cached graph
  hesperus view  <repo> [--expand <node-id>]...      rollups for an expansion state
  hesperus schema                                    print the graph JSON schema";

fn main() -> ExitCode {
    match run(std::env::args().skip(1).collect()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}

struct Opts {
    positional: Vec<String>,
    scip: Vec<String>,
    tools_dir: Option<PathBuf>,
    lockfiles: Vec<String>,
    expand: BTreeSet<String>,
}

fn parse(args: &[String]) -> Result<Opts, String> {
    let mut o = Opts { positional: vec![], scip: vec![], tools_dir: None, lockfiles: vec![], expand: BTreeSet::new() };
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let mut val = |f: &str| it.next().cloned().ok_or(format!("{f} needs a value"));
        match a.as_str() {
            "--scip" => o.scip.push(val("--scip")?),
            "--tools-dir" => o.tools_dir = Some(PathBuf::from(val("--tools-dir")?)),
            "--lockfile" => o.lockfiles.push(val("--lockfile")?),
            "--expand" => {
                o.expand.insert(val("--expand")?);
            }
            s if s.starts_with("--") => return Err(format!("unknown flag {s}\n{USAGE}")),
            _ => o.positional.push(a.clone()),
        }
    }
    Ok(o)
}

fn run(args: Vec<String>) -> Result<(), String> {
    let Some(cmd) = args.first() else { return Err(USAGE.into()) };
    let o = parse(&args[1..])?;
    match cmd.as_str() {
        "schema" => {
            print!("{SCHEMA}");
            Ok(())
        }
        "index" => {
            let repo = repo_arg(&o)?;
            let indexes = if o.scip.is_empty() {
                run_indexers(&repo, o.tools_dir.as_deref())?
            } else {
                let mut v = Vec::new();
                for p in &o.scip {
                    v.push(scip::decode(&std::fs::read(p).map_err(|e| format!("{p}: {e}"))?)?);
                }
                v
            };
            let tools: BTreeSet<String> = indexes.iter().map(scip::tool_of).collect();
            let indexer = tools.into_iter().collect::<Vec<_>>().join(", ");
            let g = make_graph(&repo, &scip::merge(indexes));
            cache::write_cache(&repo, &header(&repo, &o, indexer), &g)?;
            println!("indexed {} nodes, {} edges into {}/", g.nodes.len(), g.edges.len(), cache::CACHE_DIR);
            Ok(())
        }
        "status" => {
            let repo = repo_arg(&o)?;
            let (state, detail) = match cache::read_header(&repo) {
                Err(e) => ("missing", e),
                Ok(h) => match h.check(&header(&repo, &o, h.indexer.clone())) {
                    Ok(()) => ("ready", String::new()),
                    Err(e) => ("stale", e),
                },
            };
            println!("{}", serde_json::json!({ "state": state, "detail": detail }));
            Ok(())
        }
        "tools" => {
            let repo = repo_arg(&o)?;
            let (counts, other) = file_counts(&repo);
            let mut languages = Vec::new();
            let mut tools = Vec::new();
            for f in FRONTENDS {
                let n = counts.get(f.id()).copied().unwrap_or(0);
                if n == 0 {
                    continue;
                }
                let t = f.tool();
                languages.push(serde_json::json!({ "id": f.id(), "files": n, "tool": t.name }));
                tools.push(serde_json::json!({
                    "name": t.name,
                    "version": t.version,
                    "dir": o.tools_dir.as_ref().map(|d| d.join(t.dir_name())),
                    "bin": find_tool(*f, o.tools_dir.as_deref()),
                    "install": t.install,
                }));
            }
            let out = serde_json::json!({ "languages": languages, "tools": tools, "other_files": other });
            println!("{}", serde_json::to_string_pretty(&out).expect("tools serialize"));
            Ok(())
        }
        "graph" => {
            let repo = repo_arg(&o)?;
            print!("{}", load(&repo, &o)?.to_json());
            Ok(())
        }
        "view" => {
            let repo = repo_arg(&o)?;
            let g = load(&repo, &o)?;
            let v = aggregate::view(&g, &o.expand);
            println!("{}", serde_json::to_string_pretty(&v).expect("view serializes"));
            Ok(())
        }
        _ => Err(USAGE.into()),
    }
}

fn repo_arg(o: &Opts) -> Result<PathBuf, String> {
    let p = o.positional.first().ok_or(USAGE)?;
    let p = PathBuf::from(p);
    if !p.is_dir() {
        return Err(format!("{}: not a directory", p.display()));
    }
    Ok(p)
}

fn load(repo: &Path, o: &Opts) -> Result<Graph, String> {
    let cached = cache::read_header(repo)?;
    let expected = header(repo, o, cached.indexer.clone());
    cache::read_cache(repo, &expected)
}

fn header(repo: &Path, o: &Opts, indexer: String) -> Header {
    Header {
        tool: TOOL_NAME.into(),
        tool_version: env!("CARGO_PKG_VERSION").into(),
        schema_version: SCHEMA_VERSION,
        indexer,
        lockfile_hash: lockfile_hash(repo, &o.lockfiles),
        commit: commit(repo),
    }
}

fn commit(repo: &Path) -> String {
    Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".into())
}

fn lockfile_hash(repo: &Path, explicit: &[String]) -> String {
    let mut names: Vec<String> = if explicit.is_empty() {
        LOCKFILES.iter().filter(|n| repo.join(n).is_file()).map(|s| s.to_string()).collect()
    } else {
        explicit.to_vec()
    };
    names.sort();
    let mut buf = Vec::new();
    for n in names {
        buf.extend_from_slice(n.as_bytes());
        buf.push(0);
        buf.extend_from_slice(&std::fs::read(repo.join(&n)).unwrap_or_default());
        buf.push(0);
    }
    sha256_hex(&buf)
}

/// Rejects absolute and parent-escaping paths so only repo files are read.
fn safe_rel(p: &str) -> bool {
    Path::new(p).components().all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

/// Repo files per frontend id, plus files no frontend owns. Uses git's view of the tree
/// (tracked and untracked, minus ignored) so vendored and build output stay out.
fn file_counts(repo: &Path) -> (BTreeMap<&'static str, usize>, usize) {
    let mut counts = BTreeMap::new();
    let mut other = 0;
    for path in list_files(repo) {
        let owner = extension(&path).and_then(|e| FRONTENDS.iter().find(|f| f.extensions().contains(&e.as_str())));
        match owner {
            Some(f) => *counts.entry(f.id()).or_insert(0) += 1,
            None => other += 1,
        }
    }
    (counts, other)
}

fn list_files(repo: &Path) -> Vec<String> {
    let git = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        .output();
    if let Some(o) = git.ok().filter(|o| o.status.success()) {
        return o.stdout.split(|b| *b == 0).filter(|p| !p.is_empty()).map(|p| String::from_utf8_lossy(p).into_owned()).collect();
    }
    fn walk(base: &Path, d: &Path, out: &mut Vec<String>) {
        let Ok(rd) = std::fs::read_dir(d) else { return };
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            if p.is_dir() {
                walk(base, &p, out);
            } else if let Ok(r) = p.strip_prefix(base) {
                out.push(r.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let mut out = Vec::new();
    walk(repo, repo, &mut out);
    out
}

/// The pinned install under `tools_dir` first, then PATH, then the frontend's usual places.
fn find_tool(f: &dyn Frontend, tools_dir: Option<&Path>) -> Option<PathBuf> {
    let name = f.tool().name;
    let pinned = tools_dir.map(|d| f.bin_in(&d.join(f.tool().dir_name())));
    let path = std::env::var_os("PATH").unwrap_or_default();
    let found = std::env::split_paths(&path).chain(f.search_dirs()).map(|d| d.join(name));
    pinned.into_iter().chain(found).find(|p| p.is_file())
}

/// Runs the indexer of every frontend with files in the repo. Indexer output and any
/// scratch files go to a temp dir, so the repo itself is never written.
fn run_indexers(repo: &Path, tools_dir: Option<&Path>) -> Result<Vec<scip::Index>, String> {
    let (counts, _) = file_counts(repo);
    let active: Vec<&dyn Frontend> = FRONTENDS.iter().copied().filter(|f| counts.contains_key(f.id())).collect();
    if active.is_empty() {
        let ids: Vec<&str> = FRONTENDS.iter().map(|f| f.id()).collect();
        return Err(format!("no supported language in {} (supported: {})", repo.display(), ids.join(", ")));
    }
    let missing: Vec<String> = active
        .iter()
        .filter(|f| find_tool(**f, tools_dir).is_none())
        .map(|f| format!("{} {} (for {})", f.tool().name, f.tool().version, f.id()))
        .collect();
    if !missing.is_empty() {
        return Err(format!("indexer not installed: {}. `hesperus tools <repo>` lists how to install each.", missing.join(", ")));
    }
    let scratch = std::env::temp_dir().join(format!("hesperus-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(&scratch).map_err(|e| format!("{}: {e}", scratch.display()))?;
    let res = active.iter().map(|f| run_one(*f, repo, tools_dir, &scratch)).collect();
    // Does not follow symlinks, so overlays pointing into the repo are safe to remove.
    let _ = std::fs::remove_dir_all(&scratch);
    res
}

fn run_one(f: &dyn Frontend, repo: &Path, tools_dir: Option<&Path>, scratch: &Path) -> Result<scip::Index, String> {
    let bin = find_tool(f, tools_dir).expect("checked by caller");
    let out = scratch.join(format!("{}.scip", f.id()));
    let r = f.command(repo, &bin, &out, scratch)?.output().map_err(|e| format!("{}: {e}", bin.display()))?;
    if !r.status.success() {
        let err = String::from_utf8_lossy(&r.stderr);
        let tail: Vec<&str> = err.lines().rev().take(20).collect();
        let tail: Vec<&str> = tail.into_iter().rev().collect();
        return Err(format!("{} failed ({}):\n{}", bin.display(), r.status, tail.join("\n")));
    }
    scip::decode(&std::fs::read(&out).map_err(|e| format!("{}: {e}", out.display()))?)
}

fn make_graph(repo: &Path, index: &scip::Index) -> Graph {
    let read = |p: &str| if safe_rel(p) { std::fs::read_to_string(repo.join(p)).ok() } else { None };
    let syn = |_lang: &str, path: &str| -> Option<&dyn Syntax> {
        let ext = extension(path)?;
        FRONTENDS.iter().find(|f| f.extensions().contains(&ext.as_str()))?.syntax(path)
    };
    build(&Inputs { index, read_source: &read, syntax_for: &syn })
}
