use hesperus_core::aggregate;
use hesperus_core::build::{build, Inputs};
use hesperus_core::cache::{self, Header};
use hesperus_core::hash::sha256_hex;
use hesperus_core::ir::*;
use hesperus_core::scip;
use hesperus_core::syntax::Syntax;
use hesperus_lang_go::Go;
use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, ExitCode};

const SCHEMA: &str = include_str!("../../../schema/graph.schema.json");
const LOCKFILES: &[&str] = &["Cargo.lock", "go.sum", "package-lock.json", "pnpm-lock.yaml", "poetry.lock", "uv.lock", "yarn.lock"];
const USAGE: &str = "usage:
  hesperus index <repo> --scip <index.scip> [--lockfile <rel-path>]...
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
    scip: Option<String>,
    lockfiles: Vec<String>,
    expand: BTreeSet<String>,
}

fn parse(args: &[String]) -> Result<Opts, String> {
    let mut o = Opts { positional: vec![], scip: None, lockfiles: vec![], expand: BTreeSet::new() };
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let mut val = |f: &str| it.next().cloned().ok_or(format!("{f} needs a value"));
        match a.as_str() {
            "--scip" => o.scip = Some(val("--scip")?),
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
            let scip_path = o.scip.clone().ok_or("index needs --scip <file>")?;
            let bytes = std::fs::read(&scip_path).map_err(|e| format!("{scip_path}: {e}"))?;
            let index = scip::decode(&bytes)?;
            let indexer = index
                .metadata
                .as_ref()
                .and_then(|m| m.tool_info.as_ref())
                .map(|t| format!("{} {}", t.name, t.version))
                .unwrap_or_else(|| "unknown".into());
            let g = make_graph(&repo, &index);
            cache::write_cache(&repo, &header(&repo, &o, indexer), &g)?;
            println!("indexed {} nodes, {} edges into {}/", g.nodes.len(), g.edges.len(), cache::CACHE_DIR);
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

fn make_graph(repo: &Path, index: &scip::Index) -> Graph {
    let read = |p: &str| if safe_rel(p) { std::fs::read_to_string(repo.join(p)).ok() } else { None };
    let go = Go;
    let syn = |lang: &str, path: &str| -> Option<&dyn Syntax> {
        (lang == hesperus_lang_go::LANGUAGE_ID || path.ends_with(".go")).then_some(&go as &dyn Syntax)
    };
    build(&Inputs { index, read_source: &read, syntax_for: &syn })
}
