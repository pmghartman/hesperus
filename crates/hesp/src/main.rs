//! `hesp`: check, fmt, ir, print, emit, diff.

use clap::{Parser, Subcommand};
use hesperus_core::diag::{render, Severity};
use hesperus_core::ir::Ir;
use hesperus_core::project::{find_hesp_files, format_text, is_generated, load_from_disk};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Parser)]
#[command(name = "hesp", version, about = "Hesperus: a descriptor language for software systems")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Parse and validate a master file and everything it imports
    Check {
        /// The master `.hesp` file (or any file to check alone)
        file: PathBuf,
        /// Print diagnostics as JSON
        #[arg(long)]
        json: bool,
    },
    /// Format `.hesp` files in place (generated files are left alone)
    Fmt {
        /// Files or directories
        paths: Vec<PathBuf>,
        /// Exit 1 if any file would change, without writing
        #[arg(long)]
        check: bool,
    },
    /// Print the canonical IR of a project as JSON
    Ir {
        file: PathBuf,
        /// Add a `locations` map of where each node is declared
        #[arg(long)]
        locations: bool,
    },
    /// Print IR JSON (a file, or stdin with `-`) as canonical `.hesp` files
    Print {
        ir: PathBuf,
        /// Directory to write into; prints to stdout when omitted
        #[arg(long)]
        out: Option<PathBuf>,
    },
    /// Run an extractor on a repository and write the actual description
    Emit {
        /// The language extractor to use
        #[arg(long)]
        lang: String,
        /// The repository to describe
        repo: PathBuf,
        /// The intent master file, whose bindings tell the extractor how to group code;
        /// without it every file lands in the `unbound` bucket
        #[arg(long)]
        intent: Option<PathBuf>,
        /// Where to write actual files (default `.hesperus/actual`)
        #[arg(long)]
        out: Option<PathBuf>,
        /// Extractor command; default `$HESPERUS_TS`, else `hesperus-ts` on PATH
        #[arg(long)]
        extractor: Option<String>,
    },
    /// Compare intent and actual
    Diff {
        intent: PathBuf,
        actual: PathBuf,
        #[arg(long)]
        json: bool,
        /// Also list matches
        #[arg(long)]
        all: bool,
        /// Aggregate edges to the nodes at this depth (root = 0)
        #[arg(long)]
        depth: Option<usize>,
    },
}

fn main() {
    let cli = Cli::parse();
    let code = match cli.cmd {
        Cmd::Check { file, json } => check(&file, json),
        Cmd::Fmt { paths, check } => fmt(&paths, check),
        Cmd::Ir { file, locations } => ir(&file, locations),
        Cmd::Print { ir, out } => print_ir(&ir, out.as_deref()),
        Cmd::Emit { lang, repo, intent, out, extractor } => emit(&lang, &repo, intent.as_deref(), out.as_deref(), extractor.as_deref()),
        Cmd::Diff { intent, actual, json, all, depth } => diff(&intent, &actual, json, all, depth),
    };
    std::process::exit(code);
}

fn path_str(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

fn check(file: &Path, json: bool) -> i32 {
    let project = load_from_disk(&path_str(file));
    if json {
        println!("{}", serde_json::to_string_pretty(&project.diags).unwrap());
    } else {
        let src = |p: &str| project.text_of(p).map(|s| s.to_string());
        eprint!("{}", render(&project.diags, &src));
    }
    if project.has_errors() {
        let n = project.diags.iter().filter(|d| d.severity == Severity::Error).count();
        if !json {
            eprintln!("{}: {} error{}", path_str(file), n, if n == 1 { "" } else { "s" });
        }
        1
    } else {
        if !json {
            println!("{}: ok ({} nodes, {} edges, {} files)", path_str(file), project.ir.nodes.len(), project.ir.edges.len(), project.files.len());
        }
        0
    }
}

fn fmt(paths: &[PathBuf], check: bool) -> i32 {
    let mut files = Vec::new();
    for p in paths {
        files.extend(find_hesp_files(p));
    }
    if files.is_empty() {
        eprintln!("hesp fmt: no .hesp files found");
        return 2;
    }
    let mut changed = 0;
    let mut errors = 0;
    for f in files {
        let path = path_str(&f);
        let text = match std::fs::read(&f).map_err(|e| format!(": {e}")).and_then(|b| {
            let lossy = String::from_utf8_lossy(&b).into_owned();
            hesperus_core::lower::decode(b).map_err(|e| match e {
                hesperus_core::lower::ReadError::NotUtf8(at) => {
                    let (line, col) = hesperus_core::diag::LineIndex::new(&lossy).position(at);
                    format!(":{line}:{col}: error[E034]: file is not valid UTF-8 at byte {at}")
                }
                hesperus_core::lower::ReadError::Missing(m) => format!(": {m}"),
            })
        }) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("{path}{e}");
                errors += 1;
                continue;
            }
        };
        let (formatted, diags) = format_text(&path, &text);
        if diags.iter().any(|d| d.severity == Severity::Error) {
            eprint!("{}", render(&diags, &|_| Some(text.clone())));
            errors += 1;
            continue;
        }
        if formatted != text {
            if is_generated(&path, &text) {
                eprintln!("{path}: generated file is not canonical; re-run the extractor instead of editing it");
                errors += 1;
                continue;
            }
            changed += 1;
            if check {
                println!("{path}: would reformat");
            } else {
                if let Err(e) = std::fs::write(&f, formatted) {
                    eprintln!("{path}: {e}");
                    errors += 1;
                } else {
                    println!("{path}: formatted");
                }
            }
        }
    }
    if errors > 0 {
        return 1;
    }
    if check {
        if changed > 0 {
            1
        } else {
            println!("hesp fmt --check: all files formatted");
            0
        }
    } else {
        0
    }
}

fn ir(file: &Path, locations: bool) -> i32 {
    let project = load_from_disk(&path_str(file));
    if project.has_errors() {
        let src = |p: &str| project.text_of(p).map(|s| s.to_string());
        eprint!("{}", render(&project.diags, &src));
        return 1;
    }
    let mut ir = project.ir.clone();
    if locations {
        let mut map = std::collections::BTreeMap::new();
        for (id, span) in &project.defs {
            let line = project.text_of(&span.file).map(|t| hesperus_core::diag::LineIndex::new(t).position(span.start).0).unwrap_or(0);
            map.insert(id.clone(), format!("{}:{}", span.file, line));
        }
        ir.locations = Some(map);
    }
    print!("{}", ir.to_json());
    0
}

fn read_ir(path: &Path) -> Result<Ir, String> {
    let text = if path.as_os_str() == "-" {
        let mut s = String::new();
        std::io::stdin().read_to_string(&mut s).map_err(|e| e.to_string())?;
        s
    } else {
        std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path_str(path)))?
    };
    Ir::from_json(&text)
}

/// Print an IR to files, refusing anything that would escape `out` or fail `hesp check`,
/// before a single file is written.
fn print_checked(ir: &Ir, out: &Path) -> Result<Vec<(String, String)>, String> {
    let files = hesperus_core::print::print(ir);
    let Some((master_rel, _)) = files.first() else { return Err("the IR has no files to print".into()) };
    for (rel, _) in &files {
        let norm = hesperus_core::lower::normalize(rel);
        if norm.starts_with("..") || norm.starts_with('/') {
            return Err(format!("`{rel}` lies outside the master's directory; actual files mirror the intent's layout and are only written under {}; nothing was written", path_str(out)));
        }
    }
    struct Mem(Vec<(String, String)>, PathBuf);
    impl hesperus_core::Source for Mem {
        fn read(&self, path: &str) -> Result<String, hesperus_core::lower::ReadError> {
            let rel = Path::new(path).strip_prefix(&self.1).ok().map(|p| path_str(p));
            self.0.iter().find(|(r, _)| Some(hesperus_core::lower::normalize(r)) == rel).map(|(_, t)| t.clone()).ok_or_else(|| hesperus_core::lower::ReadError::Missing("not emitted".into()))
        }
    }
    let base = PathBuf::from("/__hesp_print__");
    let check = hesperus_core::load(&path_str(&base.join(master_rel)), &Mem(files.clone(), base.clone()));
    if check.has_errors() {
        let src = |p: &str| check.text_of(p).map(|s| s.to_string());
        let rendered = render(&check.diags, &src).replace("/__hesp_print__/", "");
        return Err(format!("the printed files would not check clean; nothing was written:\n{rendered}"));
    }
    Ok(files)
}

fn write_files(files: &[(String, String)], out: &Path) -> Result<(), String> {
    for (rel, text) in files {
        let p = out.join(hesperus_core::lower::normalize(rel));
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&p, text).map_err(|e| format!("{}: {e}", path_str(&p)))?;
        println!("{}", path_str(&p));
    }
    Ok(())
}

fn print_ir(ir_path: &Path, out: Option<&Path>) -> i32 {
    let ir = match read_ir(ir_path) {
        Ok(ir) => ir,
        Err(e) => {
            eprintln!("hesp print: {e}");
            return 2;
        }
    };
    let files = match print_checked(&ir, out.unwrap_or(Path::new("."))) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("hesp print: {e}");
            return 1;
        }
    };
    match out {
        Some(dir) => {
            if let Err(e) = write_files(&files, dir) {
                eprintln!("hesp print: {e}");
                return 1;
            }
        }
        None => {
            for (i, (path, text)) in files.iter().enumerate() {
                if files.len() > 1 {
                    if i > 0 {
                        println!();
                    }
                    println!("# ---- {path}");
                }
                print!("{text}");
            }
        }
    }
    0
}

fn emit(lang: &str, repo: &Path, intent: Option<&Path>, out: Option<&Path>, extractor: Option<&str>) -> i32 {
    if lang != "ts" {
        eprintln!("hesp emit: unknown language `{lang}`; v1 ships the `ts` extractor");
        return 2;
    }
    let intent_json = match intent {
        Some(intent) => {
            let project = load_from_disk(&path_str(intent));
            if project.has_errors() {
                let src = |p: &str| project.text_of(p).map(|s| s.to_string());
                eprint!("{}", render(&project.diags, &src));
                eprintln!("hesp emit: the intent has errors; fix them first");
                return 1;
            }
            project.ir.to_json()
        }
        None => {
            eprintln!("hesp emit: no --intent given; every file will land in the `unbound` bucket");
            String::new()
        }
    };
    let command: Vec<String> = match extractor.map(|s| s.to_string()).or_else(|| std::env::var("HESPERUS_TS").ok()) {
        Some(cmd) => {
            // a bare script path runs under node; anything else is a command line
            let words: Vec<String> = cmd.split_whitespace().map(|s| s.to_string()).collect();
            if words.len() == 1 && (cmd.ends_with(".js") || cmd.ends_with(".mjs") || cmd.ends_with(".cjs")) {
                vec!["node".into(), cmd]
            } else {
                words
            }
        }
        None => vec!["hesperus-ts".into()],
    };
    let repo_abs = std::fs::canonicalize(repo).unwrap_or_else(|_| repo.to_path_buf());
    let mut child = match Command::new(&command[0]).args(&command[1..]).arg("extract").arg(&repo_abs).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("hesp emit: cannot run extractor `{}`: {e}\n  set --extractor, $HESPERUS_TS, or put hesperus-ts on PATH", command.join(" "));
            return 2;
        }
    };
    {
        let mut stdin = child.stdin.take().unwrap();
        if stdin.write_all(intent_json.as_bytes()).is_err() {
            eprintln!("hesp emit: extractor closed its input");
            return 1;
        }
    }
    let output = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => {
            eprintln!("hesp emit: {e}");
            return 1;
        }
    };
    if !output.status.success() {
        eprintln!("hesp emit: extractor failed with {}", output.status);
        return 1;
    }
    let actual = match Ir::from_json(&String::from_utf8_lossy(&output.stdout)) {
        Ok(ir) => ir,
        Err(e) => {
            eprintln!("hesp emit: extractor output is not valid IR: {e}");
            return 1;
        }
    };
    if actual.generated.is_none() {
        eprintln!("hesp emit: extractor output lacks a `generated` marker");
        return 1;
    }
    let out_dir = out.map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from(".hesperus/actual"));
    let files = match print_checked(&actual, &out_dir) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("hesp emit: {e}");
            return 1;
        }
    };
    if let Err(e) = write_files(&files, &out_dir) {
        eprintln!("hesp emit: {e}");
        return 1;
    }
    0
}

fn diff(intent: &Path, actual: &Path, json: bool, all: bool, depth: Option<usize>) -> i32 {
    let a = load_from_disk(&path_str(intent));
    let b = load_from_disk(&path_str(actual));
    let mut bad = false;
    for p in [&a, &b] {
        if p.has_errors() {
            let src = |path: &str| p.text_of(path).map(|s| s.to_string());
            eprint!("{}", render(&p.diags, &src));
            bad = true;
        }
    }
    if bad {
        return 2;
    }
    let mut u = hesperus_core::diff::diff(&a.ir, &b.ir);
    if let Some(d) = depth {
        u = hesperus_core::diff::aggregate(&u, d);
    }
    if json {
        print!("{}", u.to_json());
    } else {
        print!("{}", hesperus_core::diff::render(&u, all));
    }
    if u.summary.violations > 0 {
        1
    } else {
        0
    }
}
