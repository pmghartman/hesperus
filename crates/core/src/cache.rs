//! On-disk cache: untracked dot dir in the analyzed repo, sharded per package.
//! A header mismatch fails loudly; nothing is reused silently.
use crate::hash::sha256_hex;
use crate::ir::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub const CACHE_DIR: &str = ".hesperus";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Header {
    pub tool: String,
    pub tool_version: String,
    pub schema_version: u32,
    /// "name version" of the SCIP indexer, or the LSP server.
    pub indexer: String,
    pub lockfile_hash: String,
    pub commit: String,
}

impl Header {
    pub fn check(&self, expected: &Header) -> Result<(), String> {
        let fields: [(&str, String, String); 6] = [
            ("tool", self.tool.clone(), expected.tool.clone()),
            ("tool_version", self.tool_version.clone(), expected.tool_version.clone()),
            ("schema_version", self.schema_version.to_string(), expected.schema_version.to_string()),
            ("indexer", self.indexer.clone(), expected.indexer.clone()),
            ("lockfile_hash", self.lockfile_hash.clone(), expected.lockfile_hash.clone()),
            ("commit", self.commit.clone(), expected.commit.clone()),
        ];
        let bad: Vec<String> = fields
            .iter()
            .filter(|(_, a, b)| a != b)
            .map(|(k, a, b)| format!("  {k}: cache has {a:?}, current is {b:?}"))
            .collect();
        if bad.is_empty() {
            Ok(())
        } else {
            Err(format!(
                "cache is stale; refusing to reuse it. Delete {CACHE_DIR}/ or re-run index.\n{}",
                bad.join("\n")
            ))
        }
    }
}

/// Shard key: the package an element belongs to, or "_repo" for repo-level nodes.
fn shard_of(g: &Graph) -> BTreeMap<String, String> {
    let par = crate::aggregate::parents(g);
    let kinds: BTreeMap<&str, NodeKind> = g.nodes.iter().map(|n| (n.id.as_str(), n.kind)).collect();
    let mut out = BTreeMap::new();
    for n in &g.nodes {
        let mut cur = n.id.as_str();
        let mut key = "_repo".to_string();
        for _ in 0..=par.len() {
            if matches!(kinds.get(cur), Some(NodeKind::Package | NodeKind::ExternalPackage)) {
                key = cur.to_string();
                break;
            }
            match par.get(cur) {
                Some(p) => cur = p,
                None => break,
            }
        }
        out.insert(n.id.clone(), key);
    }
    out
}

fn shard_file(key: &str) -> String {
    // Hash keeps file names portable and bounded; the key itself is stored inside.
    format!("shards/{}.json", &sha256_hex(key.as_bytes())[..16])
}

#[derive(Serialize, Deserialize)]
struct Shard {
    key: String,
    nodes: Vec<Node>,
    /// Edges whose `from` lives in this shard.
    edges: Vec<Edge>,
}

#[derive(Serialize, Deserialize)]
struct ShardIndex {
    shards: BTreeMap<String, String>, // key -> file
}

fn write(path: &Path, s: &str) -> Result<(), String> {
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| format!("{}: {e}", p.display()))?;
    }
    fs::write(path, s).map_err(|e| format!("{}: {e}", path.display()))
}

fn json<T: Serialize>(v: &T) -> String {
    let mut s = serde_json::to_string_pretty(v).expect("serializes");
    s.push('\n');
    s
}

/// Writes only under `<repo>/.hesperus`. Removes the old cache first.
pub fn write_cache(repo: &Path, header: &Header, g: &Graph) -> Result<(), String> {
    let dir = repo.join(CACHE_DIR);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let shard_key = shard_of(g);
    let mut shards: BTreeMap<String, Shard> = BTreeMap::new();
    for n in &g.nodes {
        let k = &shard_key[&n.id];
        shards.entry(k.clone()).or_insert_with(|| Shard { key: k.clone(), nodes: vec![], edges: vec![] }).nodes.push(n.clone());
    }
    for e in &g.edges {
        let k = shard_key.get(&e.from).cloned().unwrap_or_else(|| "_repo".into());
        shards.entry(k.clone()).or_insert_with(|| Shard { key: k, nodes: vec![], edges: vec![] }).edges.push(e.clone());
    }
    let mut index = ShardIndex { shards: BTreeMap::new() };
    for (k, s) in &shards {
        let f = shard_file(k);
        write(&dir.join(&f), &json(s))?;
        index.shards.insert(k.clone(), f);
    }
    write(&dir.join("index.json"), &json(&index))?;
    // Keeps the cache untracked without touching the repo's own ignore files.
    write(&dir.join(".gitignore"), "*\n")?;
    // Header last: its presence means the cache is complete.
    write(&dir.join("header.json"), &json(header))
}

pub fn read_header(repo: &Path) -> Result<Header, String> {
    let p = repo.join(CACHE_DIR).join("header.json");
    let s = fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))?;
    serde_json::from_str(&s).map_err(|e| format!("{}: {e}", p.display()))
}

/// Loads every shard after checking the header against `expected`.
pub fn read_cache(repo: &Path, expected: &Header) -> Result<Graph, String> {
    read_header(repo)?.check(expected)?;
    read_shards(repo, None)
}

/// Loads the named shards only (lazy subtree loading), or all when `only` is None.
pub fn read_shards(repo: &Path, only: Option<&[String]>) -> Result<Graph, String> {
    let dir = repo.join(CACHE_DIR);
    let ip = dir.join("index.json");
    let idx: ShardIndex =
        serde_json::from_str(&fs::read_to_string(&ip).map_err(|e| format!("{}: {e}", ip.display()))?)
            .map_err(|e| format!("{}: {e}", ip.display()))?;
    let mut g = Graph::new();
    for (k, f) in &idx.shards {
        if only.is_some_and(|o| !o.contains(k)) {
            continue;
        }
        let p = dir.join(f);
        let s: Shard = serde_json::from_str(&fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))?)
            .map_err(|e| format!("{}: {e}", p.display()))?;
        g.nodes.extend(s.nodes);
        g.edges.extend(s.edges);
    }
    g.canonicalize();
    Ok(g)
}
