//! hesperus-lsp: diagnostics, completion, hover, go-to-definition across imports,
//! rename and formatting for `.hesp` files, over stdio.

use hesperus_core::ast::{EDGE_KINDS, NODE_KINDS, PROPERTY_KEYS, PROTOCOLS};
use hesperus_core::diag::{LineIndex, Severity};
use hesperus_core::lower::{join, dirname, normalize};
use hesperus_core::project::{find_hesp_files, format_text, is_generated, OverlaySource};
use hesperus_core::{Project, Source};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

struct State {
    open: HashMap<String, String>,
    versions: HashMap<String, i32>,
    roots: Vec<PathBuf>,
    /// Files we last published diagnostics for, so stale ones can be cleared.
    published: HashSet<String>,
}

struct Backend {
    client: Client,
    state: Mutex<State>,
}

fn uri_to_path(uri: &Url) -> Option<String> {
    uri.to_file_path().ok().map(|p| normalize(&p.to_string_lossy().replace('\\', "/")))
}

fn path_to_uri(path: &str) -> Option<Url> {
    Url::from_file_path(Path::new(path)).ok()
}

fn to_range(index: &LineIndex, start: usize, end: usize) -> Range {
    let (l1, c1) = index.position_utf16(start);
    let (l2, c2) = index.position_utf16(end);
    Range { start: Position::new(l1, c1), end: Position::new(l2, c2) }
}

impl Backend {
    fn source(&self) -> OverlaySource {
        let st = self.state.lock().unwrap();
        OverlaySource { overlay: st.open.clone() }
    }

    /// The master file of the project that holds `path`: the file that (transitively)
    /// imports it, or `path` itself.
    fn master_for(&self, path: &str) -> String {
        let source = self.source();
        let mut candidates: Vec<String> = Vec::new();
        {
            let st = self.state.lock().unwrap();
            let mut dirs: Vec<PathBuf> = st.roots.clone();
            if dirs.is_empty() {
                dirs.push(PathBuf::from(dirname(path)));
            }
            for d in dirs {
                for f in find_hesp_files(&d) {
                    let s = normalize(&f.to_string_lossy().replace('\\', "/"));
                    if s.contains("/.hesperus/") {
                        continue;
                    }
                    candidates.push(s);
                }
            }
            for k in st.open.keys() {
                if !candidates.contains(k) {
                    candidates.push(k.clone());
                }
            }
        }
        candidates.sort();
        candidates.dedup();
        // importer map
        let mut importers: HashMap<String, Vec<String>> = HashMap::new();
        for c in &candidates {
            let Ok(text) = source.read(c) else { continue };
            let parsed = hesperus_core::parser::parse(c, &text);
            for imp in imports_of(&parsed.file) {
                let target = join(dirname(c), &imp);
                importers.entry(target).or_default().push(c.clone());
            }
        }
        let mut cur = path.to_string();
        let mut seen = HashSet::new();
        while let Some(list) = importers.get(&cur) {
            if list.is_empty() || !seen.insert(cur.clone()) {
                break;
            }
            cur = list[0].clone();
        }
        cur
    }

    fn project_for(&self, path: &str) -> Project {
        let master = self.master_for(path);
        let source = self.source();
        hesperus_core::load(&master, &source)
    }

    async fn publish(&self, path: &str) {
        let project = self.project_for(path);
        let mut by_file: HashMap<String, Vec<Diagnostic>> = HashMap::new();
        for f in &project.files {
            by_file.entry(f.path.clone()).or_default();
            if f.ast.generated.is_some() {
                let index = LineIndex::new(&f.text);
                let (s, e) = f.ast.generated.as_ref().map(|g| (g.span.start, g.span.end)).unwrap();
                by_file.get_mut(&f.path).unwrap().push(Diagnostic {
                    range: to_range(&index, s, e),
                    severity: Some(DiagnosticSeverity::INFORMATION),
                    code: Some(NumberOrString::String("generated".into())),
                    source: Some("hesperus".into()),
                    message: "generated file: edits are overwritten by the next `hesp emit`; change the intent instead".into(),
                    ..Default::default()
                });
            }
        }
        for d in &project.diags {
            let Some(text) = project.text_of(&d.span.file) else { continue };
            let index = LineIndex::new(text);
            let severity = match d.severity {
                Severity::Error => DiagnosticSeverity::ERROR,
                Severity::Warning => DiagnosticSeverity::WARNING,
                Severity::Info => DiagnosticSeverity::INFORMATION,
            };
            let mut message = d.message.clone();
            if let Some(fix) = &d.fix {
                if !fix.is_empty() {
                    message.push_str(&format!(" (fix: `{}`)", fix.trim_end()));
                }
            }
            let end = if d.span.end > d.span.start { d.span.end } else { d.span.start + 1 };
            by_file.entry(d.span.file.clone()).or_default().push(Diagnostic {
                range: to_range(&index, d.span.start, end.min(text.len().max(d.span.start))),
                severity: Some(severity),
                code: Some(NumberOrString::String(d.code.to_string())),
                source: Some("hesperus".into()),
                message,
                data: d.fix.as_ref().map(|f| serde_json::json!({ "fix": f })),
                ..Default::default()
            });
        }
        let mut stale: Vec<String> = Vec::new();
        {
            let mut st = self.state.lock().unwrap();
            for p in st.published.iter() {
                if !by_file.contains_key(p) && p.starts_with(dirname(&project.master)) {
                    stale.push(p.clone());
                }
            }
            for p in by_file.keys() {
                st.published.insert(p.clone());
            }
        }
        let versions: HashMap<String, i32> = self.state.lock().unwrap().versions.clone();
        let mut files: Vec<(String, Vec<Diagnostic>)> = by_file.into_iter().collect();
        files.sort_by(|a, b| a.0.cmp(&b.0));
        for (file, diags) in files {
            if let Some(uri) = path_to_uri(&file) {
                self.client.publish_diagnostics(uri, diags, versions.get(&file).copied()).await;
            }
        }
        for p in stale {
            if let Some(uri) = path_to_uri(&p) {
                self.client.publish_diagnostics(uri, vec![], None).await;
            }
        }
    }

    fn text_and_offset(&self, uri: &Url, pos: Position) -> Option<(String, String, usize)> {
        let path = uri_to_path(uri)?;
        let text = self.source().read(&path).ok()?;
        let index = LineIndex::new(&text);
        let offset = index.offset_utf16(pos.line, pos.character);
        Some((path, text, offset))
    }

    /// The node id referenced or declared at an offset.
    fn node_at(&self, project: &Project, path: &str, offset: usize) -> Option<(String, bool)> {
        for (id, span) in &project.defs {
            if span.file == path && span.start <= offset && offset <= span.end {
                return Some((id.clone(), true));
            }
        }
        for r in &project.refs {
            if r.span.file == path && r.span.start <= offset && offset <= r.span.end {
                return Some((r.id.clone(), false));
            }
        }
        None
    }
}

fn imports_of(file: &hesperus_core::ast::File) -> Vec<String> {
    use hesperus_core::ast::{Block, StmtKind};
    fn walk(b: &Block, out: &mut Vec<String>) {
        for s in &b.items {
            match &s.kind {
                StmtKind::Import(i) => out.push(i.text.clone()),
                StmtKind::Node(n) => {
                    if let Some(b) = &n.block {
                        walk(b, out);
                    }
                }
                _ => {}
            }
        }
    }
    let mut out = Vec::new();
    for s in &file.items {
        if let StmtKind::Node(n) = &s.kind {
            if let Some(b) = &n.block {
                walk(b, &mut out);
            }
        }
    }
    out
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        let mut roots = Vec::new();
        if let Some(folders) = &params.workspace_folders {
            for f in folders {
                if let Ok(p) = f.uri.to_file_path() {
                    roots.push(p);
                }
            }
        }
        #[allow(deprecated)]
        if roots.is_empty() {
            if let Some(r) = &params.root_uri {
                if let Ok(p) = r.to_file_path() {
                    roots.push(p);
                }
            }
        }
        self.state.lock().unwrap().roots = roots;
        Ok(InitializeResult {
            server_info: Some(ServerInfo { name: "hesperus-lsp".into(), version: Some(env!("CARGO_PKG_VERSION").into()) }),
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(TextDocumentSyncKind::FULL)),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(vec![":".into(), ".".into(), " ".into(), ">".into()]),
                    ..Default::default()
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                definition_provider: Some(OneOf::Left(true)),
                rename_provider: Some(OneOf::Right(RenameOptions { prepare_provider: Some(true), work_done_progress_options: Default::default() })),
                document_formatting_provider: Some(OneOf::Left(true)),
                ..Default::default()
            },
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client.log_message(MessageType::INFO, "hesperus-lsp ready").await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let Some(path) = uri_to_path(&params.text_document.uri) else { return };
        {
            let mut st = self.state.lock().unwrap();
            st.open.insert(path.clone(), params.text_document.text);
            st.versions.insert(path.clone(), params.text_document.version);
        }
        self.publish(&path).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let Some(path) = uri_to_path(&params.text_document.uri) else { return };
        if let Some(change) = params.content_changes.into_iter().last() {
            let mut st = self.state.lock().unwrap();
            st.open.insert(path.clone(), change.text);
            st.versions.insert(path.clone(), params.text_document.version);
        }
        self.publish(&path).await;
    }

    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        if let Some(path) = uri_to_path(&params.text_document.uri) {
            self.publish(&path).await;
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        let Some(path) = uri_to_path(&params.text_document.uri) else { return };
        let mut st = self.state.lock().unwrap();
        st.open.remove(&path);
        st.versions.remove(&path);
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let pos = params.text_document_position.position;
        let Some((path, text, offset)) = self.text_and_offset(&params.text_document_position.text_document.uri, pos) else { return Ok(None) };
        let line_start = text[..offset].rfind('\n').map(|i| i + 1).unwrap_or(0);
        let before = &text[line_start..offset];
        let trimmed = before.trim_start();
        let mut items: Vec<CompletionItem> = Vec::new();
        let kw = |label: &str, detail: &str, kind: CompletionItemKind| CompletionItem {
            label: label.to_string(),
            kind: Some(kind),
            detail: Some(detail.to_string()),
            ..Default::default()
        };
        let project = self.project_for(&path);
        // what kind of position are we at?
        if let Some(key) = trimmed.strip_suffix(':').map(|s| s.trim()).filter(|s| !s.contains("->")) {
            if key == "protocol" {
                for p in PROTOCOLS {
                    items.push(kw(p, "protocol", CompletionItemKind::ENUM_MEMBER));
                }
                return Ok(Some(CompletionResponse::Array(items)));
            }
        }
        if trimmed.contains("->") && (trimmed.ends_with(':') || trimmed.ends_with(": ")) {
            for k in EDGE_KINDS {
                items.push(kw(k, "edge kind", CompletionItemKind::ENUM_MEMBER));
            }
            return Ok(Some(CompletionResponse::Array(items)));
        }
        if trimmed.contains("->") || trimmed.starts_with("require ") || trimmed.starts_with("forbid ") || trimmed.ends_with('.') {
            // a node path: offer ids
            let prefix_dot = trimmed.rsplit([' ', '>']).next().unwrap_or("");
            if let Some(prefix) = prefix_dot.strip_suffix('.') {
                let scope = scope_at(&project, &path, offset);
                let resolved = resolve_path(&project, prefix, &scope);
                for n in &project.ir.nodes {
                    if let (Some(r), Some(p)) = (&resolved, &n.parent) {
                        if p == r {
                            items.push(CompletionItem { label: n.name.clone(), kind: Some(CompletionItemKind::FIELD), detail: Some(format!("{} {}", n.kind.as_str(), n.id)), ..Default::default() });
                        }
                    }
                }
                return Ok(Some(CompletionResponse::Array(items)));
            }
            for n in &project.ir.nodes {
                items.push(CompletionItem { label: n.id.clone(), kind: Some(CompletionItemKind::REFERENCE), detail: Some(format!("{} {}", n.kind.as_str(), n.label.clone().unwrap_or_default())), ..Default::default() });
            }
            return Ok(Some(CompletionResponse::Array(items)));
        }
        // statement start
        let in_block = text[..line_start].matches('{').count() > text[..line_start].matches('}').count();
        for k in NODE_KINDS {
            if *k == "system" && in_block {
                continue;
            }
            items.push(CompletionItem { label: k.to_string(), kind: Some(CompletionItemKind::CLASS), detail: Some("node kind".into()), insert_text: Some(format!("{k} ")), ..Default::default() });
        }
        if in_block {
            for p in PROPERTY_KEYS {
                if *p == "resolved" {
                    continue;
                }
                items.push(CompletionItem { label: p.to_string(), kind: Some(CompletionItemKind::PROPERTY), detail: Some("property".into()), insert_text: Some(format!("{p}: ")), ..Default::default() });
            }
            for k in ["import", "require", "forbid", "each"] {
                items.push(kw(k, "keyword", CompletionItemKind::KEYWORD));
            }
            let scope = scope_at(&project, &path, offset);
            for n in &project.ir.nodes {
                if n.parent.as_deref() == Some(scope.as_str()) {
                    items.push(CompletionItem { label: n.name.clone(), kind: Some(CompletionItemKind::REFERENCE), detail: Some(format!("{} {}", n.kind.as_str(), n.id)), ..Default::default() });
                }
            }
        } else {
            for k in ["let", "template"] {
                items.push(kw(k, "keyword", CompletionItemKind::KEYWORD));
            }
        }
        Ok(Some(CompletionResponse::Array(items)))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let pos = params.text_document_position_params.position;
        let Some((path, text, offset)) = self.text_and_offset(&params.text_document_position_params.text_document.uri, pos) else { return Ok(None) };
        let project = self.project_for(&path);
        let Some((id, _)) = self.node_at(&project, &path, offset) else { return Ok(None) };
        let Some(node) = project.ir.node(&id) else { return Ok(None) };
        let mut md = format!("**{}** `{}`", node.kind.as_str(), node.id);
        if let Some(l) = &node.label {
            md.push_str(&format!("\n\n{l}"));
        }
        if let Some(d) = &node.desc {
            md.push_str(&format!("\n\n{d}"));
        }
        if !node.src.is_empty() {
            md.push_str(&format!("\n\nsrc: `{}`", node.src.join("`, `")));
        }
        if let Some(p) = &node.protocol {
            md.push_str(&format!("\n\nprotocol: {}", p.as_str()));
        }
        if let Some(h) = &node.host {
            md.push_str(&format!("\n\nhost: {h}"));
        }
        if let Some(e) = &node.engine {
            md.push_str(&format!("\n\nengine: {e}"));
        }
        let outgoing = project.ir.edges.iter().filter(|e| e.from == id).count();
        let incoming = project.ir.edges.iter().filter(|e| e.to == id).count();
        md.push_str(&format!("\n\n{outgoing} outgoing, {incoming} incoming edge(s)"));
        if let Some(def) = project.defs.get(&id) {
            if let Some(t) = project.text_of(&def.file) {
                let (line, _) = LineIndex::new(t).position(def.start);
                md.push_str(&format!("\n\ndeclared in {}:{}", def.file.rsplit('/').next().unwrap_or(&def.file), line));
            }
        }
        let index = LineIndex::new(&text);
        let range = project.refs.iter().find(|r| r.span.file == path && r.span.start <= offset && offset <= r.span.end).map(|r| to_range(&index, r.span.start, r.span.end));
        Ok(Some(Hover { contents: HoverContents::Markup(MarkupContent { kind: MarkupKind::Markdown, value: md }), range }))
    }

    async fn goto_definition(&self, params: GotoDefinitionParams) -> Result<Option<GotoDefinitionResponse>> {
        let pos = params.text_document_position_params.position;
        let Some((path, _text, offset)) = self.text_and_offset(&params.text_document_position_params.text_document.uri, pos) else { return Ok(None) };
        let project = self.project_for(&path);
        // an import string → the file
        for (span, target) in &project.imports {
            if span.file == path && span.start <= offset && offset <= span.end {
                if let Some(uri) = path_to_uri(target) {
                    return Ok(Some(GotoDefinitionResponse::Scalar(Location { uri, range: Range::default() })));
                }
            }
        }
        let Some((id, _)) = self.node_at(&project, &path, offset) else { return Ok(None) };
        let Some(def) = project.defs.get(&id) else { return Ok(None) };
        let Some(text) = project.text_of(&def.file) else { return Ok(None) };
        let Some(uri) = path_to_uri(&def.file) else { return Ok(None) };
        let index = LineIndex::new(text);
        Ok(Some(GotoDefinitionResponse::Scalar(Location { uri, range: to_range(&index, def.start, def.end) })))
    }

    async fn prepare_rename(&self, params: TextDocumentPositionParams) -> Result<Option<PrepareRenameResponse>> {
        let Some((path, text, offset)) = self.text_and_offset(&params.text_document.uri, params.position) else { return Ok(None) };
        let project = self.project_for(&path);
        if project.ir.generated.is_some() {
            return Ok(None);
        }
        let Some((id, _)) = self.node_at(&project, &path, offset) else { return Ok(None) };
        let index = LineIndex::new(&text);
        let span = project
            .defs
            .get(&id)
            .filter(|s| s.file == path && s.start <= offset && offset <= s.end)
            .cloned()
            .or_else(|| project.refs.iter().find(|r| r.id == id && r.span.file == path && r.span.start <= offset && offset <= r.span.end).map(|r| r.span.clone()));
        let Some(span) = span else { return Ok(None) };
        Ok(Some(PrepareRenameResponse::RangeWithPlaceholder { range: to_range(&index, span.start, span.end), placeholder: id.rsplit('.').next().unwrap().to_string() }))
    }

    async fn rename(&self, params: RenameParams) -> Result<Option<WorkspaceEdit>> {
        let pos = params.text_document_position.position;
        let Some((path, _text, offset)) = self.text_and_offset(&params.text_document_position.text_document.uri, pos) else { return Ok(None) };
        let project = self.project_for(&path);
        if project.ir.generated.is_some() {
            return Err(tower_lsp::jsonrpc::Error::invalid_params("generated files cannot be edited; change the intent instead"));
        }
        if !hesperus_core::lexer::is_valid_ident(&params.new_name) {
            return Err(tower_lsp::jsonrpc::Error::invalid_params(format!("`{}` is not a valid identifier", params.new_name)));
        }
        let Some((id, _)) = self.node_at(&project, &path, offset) else { return Ok(None) };
        let parent = id.rfind('.').map(|i| &id[..i]);
        let sibling = match parent {
            Some(p) => format!("{p}.{}", params.new_name),
            None => params.new_name.clone(),
        };
        if project.ir.node(&sibling).is_some() {
            return Err(tower_lsp::jsonrpc::Error::invalid_params(format!("`{sibling}` already exists")));
        }
        let mut changes: HashMap<Url, Vec<TextEdit>> = HashMap::new();
        let mut spans: Vec<hesperus_core::Span> = Vec::new();
        if let Some(def) = project.defs.get(&id) {
            spans.push(def.clone());
        }
        for r in &project.refs {
            if r.id == id {
                spans.push(r.span.clone());
            }
        }
        for span in spans {
            let Some(text) = project.text_of(&span.file) else { continue };
            let Some(uri) = path_to_uri(&span.file) else { continue };
            let index = LineIndex::new(text);
            changes.entry(uri).or_default().push(TextEdit { range: to_range(&index, span.start, span.end), new_text: params.new_name.clone() });
        }
        for edits in changes.values_mut() {
            edits.sort_by_key(|e| (e.range.start.line, e.range.start.character));
            edits.dedup_by(|a, b| a.range == b.range);
        }
        Ok(Some(WorkspaceEdit { changes: Some(changes), ..Default::default() }))
    }

    async fn formatting(&self, params: DocumentFormattingParams) -> Result<Option<Vec<TextEdit>>> {
        let Some(path) = uri_to_path(&params.text_document.uri) else { return Ok(None) };
        let Ok(text) = self.source().read(&path) else { return Ok(None) };
        let (formatted, diags) = format_text(&path, &text);
        if diags.iter().any(|d| d.severity == Severity::Error) || formatted == text {
            return Ok(None);
        }
        if is_generated(&path, &text) {
            return Ok(None);
        }
        let index = LineIndex::new(&text);
        let end = index.position_utf16(text.len());
        Ok(Some(vec![TextEdit { range: Range { start: Position::new(0, 0), end: Position::new(end.0, end.1) }, new_text: formatted }]))
    }
}

/// The id of the innermost node whose block contains `offset` in `path`.
fn scope_at(project: &Project, path: &str, offset: usize) -> String {
    use hesperus_core::ast::{NodeStmt, StmtKind};
    fn walk(n: &NodeStmt, prefix: &str, offset: usize, best: &mut String) {
        let id = if prefix.is_empty() { n.name.text.clone() } else { format!("{prefix}.{}", n.name.text) };
        if let Some(b) = &n.block {
            if b.span.start <= offset && offset <= b.span.end {
                *best = id.clone();
                for s in &b.items {
                    if let StmtKind::Node(c) = &s.kind {
                        walk(c, &id, offset, best);
                    }
                }
            }
        }
    }
    let mut best = project.ir.root.clone();
    // the file's root id: the IR files entry
    let Some(file) = project.files.iter().find(|f| f.path == path) else { return best };
    let rel_root = project.ir.files.iter().find(|f| {
        let abs = join(dirname(&project.master), &f.path);
        abs == path || f.path == path
    });
    let prefix = match rel_root {
        Some(f) => f.root.rfind('.').map(|i| f.root[..i].to_string()).unwrap_or_default(),
        None => String::new(),
    };
    for n in &file.expanded {
        walk(n, &prefix, offset, &mut best);
    }
    best
}

fn resolve_path(project: &Project, dotted: &str, scope: &str) -> Option<String> {
    let ids: HashSet<String> = project.ir.nodes.iter().map(|n| n.id.clone()).collect();
    let path = hesperus_core::ast::Path { segments: dotted.split('.').map(|s| hesperus_core::ast::Ident { text: s.to_string(), span: Default::default() }).collect(), span: Default::default() };
    hesperus_core::lower::resolve_in(&ids, &project.ir.root, &path, scope)
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    let (service, socket) = LspService::new(|client| Backend { client, state: Mutex::new(State { open: HashMap::new(), versions: HashMap::new(), roots: Vec::new(), published: HashSet::new() }) });
    Server::new(stdin, stdout, socket).serve(service).await;
}
