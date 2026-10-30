//! Disk access and the conveniences the CLI and language server share.

use crate::diag::Diagnostic;
use crate::lower::{load, Project, Source};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub struct FsSource;

impl Source for FsSource {
    fn read(&self, path: &str) -> Option<String> {
        std::fs::read_to_string(path).ok()
    }
}

/// Files from memory first (open editors), disk second.
pub struct OverlaySource {
    pub overlay: HashMap<String, String>,
}

impl Source for OverlaySource {
    fn read(&self, path: &str) -> Option<String> {
        if let Some(t) = self.overlay.get(path) {
            return Some(t.clone());
        }
        std::fs::read_to_string(path).ok()
    }
}

pub fn load_from_disk(master: &str) -> Project {
    load(master, &FsSource)
}

/// Format one file's text. Returns the formatted text and the parse diagnostics;
/// text with parse errors is returned unchanged.
pub fn format_text(path: &str, text: &str) -> (String, Vec<Diagnostic>) {
    let parsed = crate::parser::parse(path, text);
    if parsed.diags.iter().any(|d| d.severity == crate::diag::Severity::Error) {
        return (text.to_string(), parsed.diags);
    }
    (crate::format::format_file(&parsed.file), parsed.diags)
}

/// Every `.hesp` under `dir` (or `dir` itself when it is a file), sorted.
pub fn find_hesp_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if dir.is_file() {
        out.push(dir.to_path_buf());
        return out;
    }
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for entry in rd.flatten() {
            let p = entry.path();
            let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if p.is_dir() {
                if name == "node_modules" || name == "target" || name == ".git" {
                    continue;
                }
                stack.push(p);
            } else if name.ends_with(".hesp") {
                out.push(p);
            }
        }
    }
    out.sort();
    out
}
