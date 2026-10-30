//! Integration tests: drive the real `hesperus-lsp` binary over stdio with JSON-RPC.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{Duration, Instant};

struct Lsp {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: i64,
    notifications: Vec<Value>,
}

impl Lsp {
    fn start() -> Lsp {
        let mut child = Command::new(env!("CARGO_BIN_EXE_hesperus-lsp")).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn().expect("spawn hesperus-lsp");
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Lsp { child, stdin, stdout, next_id: 1, notifications: Vec::new() }
    }
    fn send(&mut self, msg: Value) {
        let body = msg.to_string();
        if std::env::var("LSP_TEST_DEBUG").is_ok() {
            eprintln!("-> {}", &body[..body.len().min(200)]);
        }
        write!(self.stdin, "Content-Length: {}\r\n\r\n{}", body.len(), body).unwrap();
        self.stdin.flush().unwrap();
    }
    fn notify(&mut self, method: &str, params: Value) {
        self.send(json!({"jsonrpc": "2.0", "method": method, "params": params}));
    }
    fn read_message(&mut self) -> Value {
        let mut len = 0usize;
        loop {
            let mut line = String::new();
            self.stdout.read_line(&mut line).unwrap();
            if line == "\r\n" || line == "\n" {
                break;
            }
            if let Some(v) = line.strip_prefix("Content-Length:") {
                len = v.trim().parse().unwrap();
            }
        }
        let mut buf = vec![0u8; len];
        self.stdout.read_exact(&mut buf).unwrap();
        let v: Value = serde_json::from_slice(&buf).unwrap();
        if std::env::var("LSP_TEST_DEBUG").is_ok() {
            eprintln!("<- {}", &v.to_string()[..v.to_string().len().min(300)]);
        }
        v
    }
    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}));
        loop {
            let msg = self.read_message();
            if msg.get("id") == Some(&json!(id)) {
                if let Some(err) = msg.get("error") {
                    panic!("{method} failed: {err}");
                }
                return msg["result"].clone();
            }
            if msg.get("method").is_some() && msg.get("id").is_none() {
                self.notifications.push(msg);
            }
        }
    }
    /// Wait for the publishDiagnostics notification for `uri` at document `version`.
    fn diagnostics_for(&mut self, uri: &str, version: i64) -> Vec<Value> {
        let start = Instant::now();
        loop {
            if let Some(pos) = self.notifications.iter().position(|n| n["method"] == "textDocument/publishDiagnostics" && n["params"]["uri"] == uri && n["params"]["version"] == json!(version)) {
                let n = self.notifications.remove(pos);
                return n["params"]["diagnostics"].as_array().unwrap().clone();
            }
            assert!(start.elapsed() < Duration::from_secs(10), "no diagnostics for {uri}");
            let msg = self.read_message();
            if msg.get("method").is_some() && msg.get("id").is_none() {
                self.notifications.push(msg);
            }
        }
    }
    fn shutdown(mut self) {
        self.send(json!({"jsonrpc": "2.0", "id": 999, "method": "shutdown"}));
        loop {
            let msg = self.read_message();
            if msg.get("id") == Some(&json!(999)) {
                break;
            }
        }
        self.send(json!({"jsonrpc": "2.0", "method": "exit"}));
        drop(self.stdin);
        std::thread::sleep(Duration::from_millis(100));
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/shop").canonicalize().unwrap()
}

fn uri(p: &Path) -> String {
    tower_lsp::lsp_types::Url::from_file_path(p).unwrap().to_string()
}

fn open(lsp: &mut Lsp, path: &Path, text: &str) {
    lsp.notify("textDocument/didOpen", json!({"textDocument": {"uri": uri(path), "languageId": "hesperus", "version": 1, "text": text}}));
}

fn pos(line: u32, character: u32) -> Value {
    json!({"line": line, "character": character})
}

#[test]
fn lsp_end_to_end() {
    let dir = fixture_dir();
    let master = dir.join("shop.hesp");
    let catalog = dir.join("catalog.hesp");
    let master_text = std::fs::read_to_string(&master).unwrap();
    let catalog_text = std::fs::read_to_string(&catalog).unwrap();

    let mut lsp = Lsp::start();
    let init = lsp.request("initialize", json!({"processId": null, "rootUri": uri(&dir), "capabilities": {}, "workspaceFolders": [{"uri": uri(&dir), "name": "shop"}]}));
    assert_eq!(init["capabilities"]["hoverProvider"], json!(true));
    assert!(init["capabilities"]["renameProvider"].is_object());
    assert_eq!(init["capabilities"]["documentFormattingProvider"], json!(true));
    lsp.notify("initialized", json!({}));

    // diagnostics: a clean project publishes none; a typo publishes an E011 with a fix
    open(&mut lsp, &master, &master_text);
    let d = lsp.diagnostics_for(&uri(&master), 1);
    assert!(d.is_empty(), "clean master has diagnostics: {d:?}");
    let broken = master_text.replace("web -> catalog.api: http", "web -> catalog.apu: http");
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&master), "version": 2}, "contentChanges": [{"text": broken}]}));
    let d = lsp.diagnostics_for(&uri(&master), 2);
    assert_eq!(d.len(), 1, "{d:?}");
    assert_eq!(d[0]["code"], json!("E011"));
    assert_eq!(d[0]["range"]["start"]["line"], json!(9));
    assert!(d[0]["message"].as_str().unwrap().contains("shop.catalog.api"), "{}", d[0]["message"]);
    assert_eq!(d[0]["data"]["fix"], json!("shop.catalog.api"));
    // an error in the imported file shows up on that file when the master is open
    let bad_catalog = catalog_text.replace("engine: \"postgres\"", "engine: postgres");
    open(&mut lsp, &catalog, &bad_catalog);
    let d = lsp.diagnostics_for(&uri(&catalog), 1);
    assert_eq!(d.len(), 1, "{d:?}");
    assert_eq!(d[0]["code"], json!("E009"));
    // restore both
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&catalog), "version": 2}, "contentChanges": [{"text": catalog_text}]}));
    let d = lsp.diagnostics_for(&uri(&catalog), 2);
    assert!(d.is_empty(), "{d:?}");
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&master), "version": 3}, "contentChanges": [{"text": master_text}]}));
    let d = lsp.diagnostics_for(&uri(&master), 3);
    assert!(d.is_empty(), "{d:?}");

    // completion: edge kinds after `->` + `:`, node ids after `->`, kinds and properties at a statement start
    let c = lsp.request("textDocument/completion", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 21)}));
    let labels: Vec<&str> = c.as_array().unwrap().iter().map(|i| i["label"].as_str().unwrap()).collect();
    assert!(labels.contains(&"http") && labels.contains(&"calls") && labels.contains(&"reads"), "{labels:?}");
    assert!(!labels.contains(&"component"), "{labels:?}");
    let with_arrow = master_text.replace("web -> catalog.api: http", "web -> ");
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&master), "version": 4}, "contentChanges": [{"text": with_arrow}]}));
    let _ = lsp.diagnostics_for(&uri(&master), 4);
    let c = lsp.request("textDocument/completion", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 9)}));
    let labels: Vec<&str> = c.as_array().unwrap().iter().map(|i| i["label"].as_str().unwrap()).collect();
    assert!(labels.contains(&"shop.catalog.api") && labels.contains(&"shop.web"), "{labels:?}");
    let with_dot = master_text.replace("web -> catalog.api: http", "web -> catalog.");
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&master), "version": 5}, "contentChanges": [{"text": with_dot}]}));
    let _ = lsp.diagnostics_for(&uri(&master), 5);
    let c = lsp.request("textDocument/completion", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 17)}));
    let labels: Vec<&str> = c.as_array().unwrap().iter().map(|i| i["label"].as_str().unwrap()).collect();
    assert_eq!(labels, vec!["api", "products", "search"], "{labels:?}");
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&master), "version": 6}, "contentChanges": [{"text": master_text}]}));
    let _ = lsp.diagnostics_for(&uri(&master), 6);
    let c = lsp.request("textDocument/completion", json!({"textDocument": {"uri": uri(&master)}, "position": pos(4, 2)}));
    let labels: Vec<&str> = c.as_array().unwrap().iter().map(|i| i["label"].as_str().unwrap()).collect();
    assert!(labels.contains(&"component") && labels.contains(&"src") && labels.contains(&"import") && labels.contains(&"web"), "{labels:?}");
    assert!(!labels.contains(&"system"));
    let c = lsp.request("textDocument/completion", json!({"textDocument": {"uri": uri(&catalog)}, "position": pos(8, 12)}));
    let labels: Vec<&str> = c.as_array().unwrap().iter().map(|i| i["label"].as_str().unwrap()).collect();
    // `engine:` is a string property, so no enum; `protocol:` offers protocols
    let with_proto = catalog_text.replace("engine: \"postgres\"", "engine: \"postgres\"\n  }\n  egress mail {\n    protocol:");
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&catalog), "version": 3}, "contentChanges": [{"text": with_proto}]}));
    let _ = lsp.diagnostics_for(&uri(&catalog), 3);
    let c = lsp.request("textDocument/completion", json!({"textDocument": {"uri": uri(&catalog)}, "position": pos(11, 13)}));
    let labels2: Vec<&str> = c.as_array().unwrap().iter().map(|i| i["label"].as_str().unwrap()).collect();
    assert_eq!(labels2, vec!["http", "ws", "grpc", "tcp", "udp", "ssh", "other"], "{labels2:?} (engine completion was {labels:?})");
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&catalog), "version": 4}, "contentChanges": [{"text": catalog_text}]}));
    let _ = lsp.diagnostics_for(&uri(&catalog), 4);

    // hover on `catalog.api` in the master shows the component from the other file
    let h = lsp.request("textDocument/hover", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 18)}));
    let md = h["contents"]["value"].as_str().unwrap();
    assert!(md.contains("**component** `shop.catalog.api`"), "{md}");
    assert!(md.contains("declared in catalog.hesp:6"), "{md}");
    let h = lsp.request("textDocument/hover", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 10)}));
    let md = h["contents"]["value"].as_str().unwrap();
    assert!(md.contains("**subsystem** `shop.catalog`") && md.contains("src: `src/catalog/**`"), "{md}");

    // go to definition across the import: `catalog` in the master → catalog.hesp line 2
    let d = lsp.request("textDocument/definition", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 10)}));
    assert_eq!(d["uri"], json!(uri(&catalog)));
    assert_eq!(d["range"]["start"], pos(2, 10));
    let d = lsp.request("textDocument/definition", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 18)}));
    assert_eq!(d["uri"], json!(uri(&catalog)));
    assert_eq!(d["range"]["start"], pos(5, 12));
    // and from the imported file back into itself, and the import string to the file
    let d = lsp.request("textDocument/definition", json!({"textDocument": {"uri": uri(&catalog)}, "position": pos(11, 9)}));
    assert_eq!(d["uri"], json!(uri(&catalog)));
    assert_eq!(d["range"]["start"], pos(7, 8));
    let d = lsp.request("textDocument/definition", json!({"textDocument": {"uri": uri(&master)}, "position": pos(3, 12)}));
    assert_eq!(d["uri"], json!(uri(&catalog)));

    // rename `api` from its use in the master: edits land in both files
    let p = lsp.request("textDocument/prepareRename", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 18)}));
    assert_eq!(p["placeholder"], json!("api"));
    let r = lsp.request("textDocument/rename", json!({"textDocument": {"uri": uri(&master)}, "position": pos(9, 18), "newName": "gateway"}));
    let changes = r["changes"].as_object().unwrap();
    assert_eq!(changes.len(), 2, "{r}");
    let m = changes[&uri(&master)].as_array().unwrap();
    assert_eq!(m.len(), 1);
    assert_eq!(m[0]["range"]["start"], pos(9, 17));
    assert_eq!(m[0]["newText"], json!("gateway"));
    let c = changes[&uri(&catalog)].as_array().unwrap();
    assert_eq!(c.len(), 3, "{c:?}"); // declaration + two edges
    // renaming a subsystem touches the master's path segment too
    let r = lsp.request("textDocument/rename", json!({"textDocument": {"uri": uri(&catalog)}, "position": pos(2, 12), "newName": "products_catalog"}));
    let changes = r["changes"].as_object().unwrap();
    assert_eq!(changes[&uri(&master)].as_array().unwrap().len(), 1);
    assert_eq!(changes[&uri(&catalog)].as_array().unwrap().len(), 1);

    // formatting: a messy buffer gets one whole-document edit; a tidy one none
    let messy = "hesperus 0.1\nsystem   shop  {\n    import \"./catalog.hesp\"\n  ingress web \"Storefront\" { protocol: http }\n  web->catalog.api : http\n}\n";
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&master), "version": 7}, "contentChanges": [{"text": messy}]}));
    let _ = lsp.diagnostics_for(&uri(&master), 7);
    let f = lsp.request("textDocument/formatting", json!({"textDocument": {"uri": uri(&master)}, "options": {"tabSize": 2, "insertSpaces": true}}));
    let edits = f.as_array().unwrap();
    assert_eq!(edits.len(), 1);
    let formatted = edits[0]["newText"].as_str().unwrap();
    assert_eq!(formatted, "hesperus 0.1\n\nsystem shop {\n  import \"./catalog.hesp\"\n  ingress web \"Storefront\" {\n    protocol: http\n  }\n  web -> catalog.api: http\n}\n");
    lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": uri(&master), "version": 8}, "contentChanges": [{"text": formatted}]}));
    let _ = lsp.diagnostics_for(&uri(&master), 8);
    let f = lsp.request("textDocument/formatting", json!({"textDocument": {"uri": uri(&master)}, "options": {"tabSize": 2, "insertSpaces": true}}));
    assert!(f.is_null(), "{f}");

    lsp.shutdown();
}

#[test]
fn generated_files_are_read_only() {
    let dir = std::env::temp_dir().join(format!("hesp-lsp-gen-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("demo.hesp");
    let text = "hesperus 0.1\ngenerated \"hesperus-ts\"\n\nsystem demo {\n  component api\n  hardware filesystem\n\n  api -> filesystem: io\n}\n";
    std::fs::write(&path, text).unwrap();
    let mut lsp = Lsp::start();
    lsp.request("initialize", json!({"processId": null, "rootUri": uri(&dir), "capabilities": {}}));
    lsp.notify("initialized", json!({}));
    open(&mut lsp, &path, text);
    let d = lsp.diagnostics_for(&uri(&path), 1);
    assert_eq!(d.len(), 1);
    assert_eq!(d[0]["severity"], json!(3));
    assert!(d[0]["message"].as_str().unwrap().contains("generated file"));
    let p = lsp.request("textDocument/prepareRename", json!({"textDocument": {"uri": uri(&path)}, "position": pos(4, 13)}));
    assert!(p.is_null());
    let f = lsp.request("textDocument/formatting", json!({"textDocument": {"uri": uri(&path)}, "options": {"tabSize": 2, "insertSpaces": true}}));
    assert!(f.is_null());
    lsp.shutdown();
    let _ = std::fs::remove_dir_all(&dir);
}
