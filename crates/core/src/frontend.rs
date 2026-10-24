//! What a language frontend supplies: which files it owns, the pinned SCIP indexer that
//! resolves them, and syntax facts. Core stays language-free; implementations live in lang crates.
use crate::syntax::Syntax;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// How a consumer with network access installs the indexer into an empty directory.
/// Core and the CLI never download.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Install {
    /// `GOBIN=<dir>/bin go install <package>`; the package carries its `@version`.
    Go { package: &'static str },
    /// Write these files into the directory, then `npm ci --ignore-scripts`.
    Npm { package_json: &'static str, package_lock: &'static str },
}

#[derive(Clone, Debug, Serialize)]
pub struct Tool {
    pub name: &'static str,
    /// Pinned: recorded in the cache header through the index's tool info.
    pub version: &'static str,
    pub install: Install,
}

impl Tool {
    /// Install directory name, unique per version so upgrades never mix.
    pub fn dir_name(&self) -> String {
        format!("{}-{}", self.name, self.version)
    }
}

pub trait Frontend {
    fn id(&self) -> &'static str;
    /// Lowercase file extensions without the dot.
    fn extensions(&self) -> &'static [&'static str];
    fn tool(&self) -> Tool;
    /// The indexer binary inside an install directory made from `tool().install`.
    fn bin_in(&self, install_dir: &Path) -> PathBuf;
    /// Extra places a user install may live (e.g. the Go bin dir).
    fn search_dirs(&self) -> Vec<PathBuf> {
        Vec::new()
    }
    /// Indexer invocation writing SCIP to `out`. May write only under `scratch`, never the repo.
    fn command(&self, repo: &Path, bin: &Path, out: &Path, scratch: &Path) -> Result<Command, String>;
    /// Syntax provider for a repo-relative path this frontend owns.
    fn syntax(&self, path: &str) -> Option<&dyn Syntax>;
}

pub fn extension(path: &str) -> Option<String> {
    let name = path.rsplit('/').next()?;
    let (stem, ext) = name.rsplit_once('.')?;
    (!stem.is_empty()).then(|| ext.to_ascii_lowercase())
}
