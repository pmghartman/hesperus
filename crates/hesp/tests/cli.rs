//! The `hesp` binary end to end: exit codes, output locations, containment of `--out`.

use std::path::{Path, PathBuf};
use std::process::Command;

fn hesp() -> Command {
    Command::new(env!("CARGO_BIN_EXE_hesp"))
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap()
}

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("hesp-cli-{}-{}", name, std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn check_fmt_ir_and_diff_exit_codes() {
    let master = root().join("examples/phosphorus/phosphorus.hesp");
    let out = hesp().args(["check"]).arg(&master).output().unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(String::from_utf8_lossy(&out.stdout).contains("ok (57 nodes"));
    let out = hesp().args(["fmt", "--check"]).arg(root().join("examples")).output().unwrap();
    assert!(out.status.success());
    let out = hesp().args(["ir"]).arg(&master).output().unwrap();
    assert!(out.status.success());
    let ir: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(ir["root"], "phosphorus");
    // locations are relative to the master's directory however the master was named
    let out = hesp().args(["ir", "--locations"]).arg(&master).output().unwrap();
    let ir: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(ir["locations"]["phosphorus.mesh"], "mesh.hesp:3");
    assert_eq!(ir["locations"]["phosphorus"], "phosphorus.hesp:3");
    // a broken file: exit 1, every error on stderr with code and position
    let broken = root().join("crates/hesperus-core/tests/fixtures/broken/many.hesp");
    let out = hesp().args(["check"]).arg(&broken).output().unwrap();
    assert_eq!(out.status.code(), Some(1));
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("many.hesp:4:3: error[E005]"), "{err}");
    assert!(err.matches("error[").count() >= 12, "{err}");
    // --json diagnostics
    let out = hesp().args(["check", "--json"]).arg(&broken).output().unwrap();
    let diags: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert!(diags.as_array().unwrap().len() >= 12);
    // diff: exit 1 on a violated constraint, 0 otherwise
    let fx = root().join("crates/hesperus-core/tests/fixtures/diff");
    let out = hesp().args(["diff"]).arg(fx.join("statuses/intent.hesp")).arg(fx.join("statuses/actual.hesp")).output().unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stdout).starts_with("shop: 9 match, 2 intent-only, 6 actual-only, 2 conflict, 3 violations"));
    let out = hesp().args(["diff"]).arg(fx.join("aggregate/intent.hesp")).arg(fx.join("aggregate/actual.hesp")).output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    // missing file: exit 1 with E012
    let out = hesp().args(["check", "/nonexistent/x.hesp"]).output().unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("E012"));
}

#[test]
fn print_writes_only_under_out() {
    let dir = scratch("print");
    // an IR whose file layout escapes the master's directory
    let ir = serde_json::json!({
        "hesperus": "0.1", "generated": "hesperus-ts", "root": "app",
        "files": [{"path": "app.hesp", "root": "app"}, {"path": "../shared/core.hesp", "root": "app.core"}],
        "nodes": [
            {"id": "app", "kind": "system", "name": "app", "parent": null},
            {"id": "app.core", "kind": "subsystem", "name": "core", "parent": "app"}
        ],
        "edges": [], "constraints": []
    });
    let ir_path = dir.join("ir.json");
    std::fs::write(&ir_path, ir.to_string()).unwrap();
    let out_dir = dir.join("out");
    let out = hesp().args(["print"]).arg(&ir_path).arg("--out").arg(&out_dir).output().unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("outside the master's directory"), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(!dir.join("shared/core.hesp").exists());
    assert!(!out_dir.exists() || std::fs::read_dir(&out_dir).unwrap().next().is_none(), "nothing is written before the refusal");
    // a well-formed layout prints into --out and checks clean
    let ok = serde_json::json!({
        "hesperus": "0.1", "generated": "hesperus-ts", "root": "app",
        "files": [{"path": "app.hesp", "root": "app"}, {"path": "parts/core.hesp", "root": "app.core"}],
        "nodes": [
            {"id": "app", "kind": "system", "name": "app", "parent": null},
            {"id": "app.core", "kind": "subsystem", "name": "core", "parent": "app"},
            {"id": "app.core.x", "kind": "component", "name": "x", "parent": "app.core"}
        ],
        "edges": [{"from": "app.core", "to": "app.core.x", "kind": "calls"}], "constraints": []
    });
    std::fs::write(&ir_path, ok.to_string()).unwrap();
    let out = hesp().args(["print"]).arg(&ir_path).arg("--out").arg(&out_dir).output().unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(out_dir.join("parts/core.hesp").exists());
    let out = hesp().args(["check"]).arg(out_dir.join("app.hesp")).output().unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let printed = std::fs::read_to_string(out_dir.join("app.hesp")).unwrap();
    assert!(printed.contains("core -> core.x: calls"), "{printed}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn fmt_never_rewrites_a_generated_file() {
    let dir = scratch("fmtgen");
    let f = dir.join("g.hesp");
    let text = "# a comment first\nhesperus 0.1\ngenerated \"hesperus-ts\"\n\nsystem s {\n      component a\n    component b\n  a->b\n}\n";
    std::fs::write(&f, text).unwrap();
    let out = hesp().args(["fmt"]).arg(&f).output().unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("generated file is not canonical"));
    assert_eq!(std::fs::read_to_string(&f).unwrap(), text, "file untouched");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn emit_refuses_bad_extractor_output_without_writing() {
    let dir = scratch("emitbad");
    let out_dir = dir.join("out");
    for bad in [
        r#"{"hesperus":"0.1","generated":"x","root":"a","files":[],"nodes":[],"edges":[],"constraints":[]}"#,
        r#"{"hesperus":"0.1","generated":"x","root":"a","nodes":[{"id":"a","kind":"system","name":"a","parent":null}],"edges":[{"from":"a","to":"a.nope","kind":"calls"}]}"#,
        r#"{"hesperus":"0.1","generated":"x","root":"a","nodes":[{"id":"a","kind":"system","name":"a","parent":null},{"id":"a.b c","kind":"component","name":"b c","parent":"a"}],"edges":[]}"#,
    ] {
        let script = dir.join("ext.js");
        std::fs::write(&script, format!("process.stdout.write({});", serde_json::to_string(bad).unwrap())).unwrap();
        let out = hesp().args(["emit", "--lang", "ts"]).arg(&dir).arg("--out").arg(&out_dir).arg("--extractor").arg(format!("node {}", script.display())).output().unwrap();
        assert_eq!(out.status.code(), Some(1), "{}", String::from_utf8_lossy(&out.stderr));
        let err = String::from_utf8_lossy(&out.stderr);
        assert!(err.contains("not valid IR") || err.contains("would not check clean"), "{err}");
        assert!(!out_dir.exists(), "nothing written for {bad}");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn emit_requires_a_known_language_and_an_extractor() {
    let out = hesp().args(["emit", "--lang", "go", "."]).output().unwrap();
    assert_eq!(out.status.code(), Some(2));
    let out = hesp().args(["emit", "--lang", "ts", ".", "--extractor", "/nonexistent/extractor"]).current_dir(root()).output().unwrap();
    assert_eq!(out.status.code(), Some(2), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(String::from_utf8_lossy(&out.stderr).contains("cannot run extractor"));
    // a command line with arguments is run as given (here: a command that exits 3)
    let out = hesp().args(["emit", "--lang", "ts", ".", "--extractor", "node -e process.exit(3)"]).current_dir(root()).output().unwrap();
    assert_eq!(out.status.code(), Some(1), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(String::from_utf8_lossy(&out.stderr).contains("extractor failed"));
}
