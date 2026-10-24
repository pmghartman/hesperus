use hesperus_core::ir::Range;
use hesperus_core::syntax::{CallSite, Facts, ParamDecl, Syntax};
use tree_sitter::{Node, Parser};

pub const LANGUAGE_ID: &str = "go";

pub struct Go;

fn rng(n: Node) -> Range {
    let (s, e) = (n.start_position(), n.end_position());
    Range { start_line: s.row as u32, start_col: s.column as u32, end_line: e.row as u32, end_col: e.column as u32 }
}

fn text(n: Node, src: &str) -> String {
    src[n.byte_range()].to_string()
}

impl Syntax for Go {
    fn facts(&self, source: &str) -> Facts {
        let mut p = Parser::new();
        p.set_language(&tree_sitter_go::LANGUAGE.into()).expect("go grammar loads");
        let mut f = Facts::default();
        if let Some(tree) = p.parse(source, None) {
            walk(tree.root_node(), source, &mut f);
        }
        f
    }
}

fn walk(n: Node, src: &str, f: &mut Facts) {
    match n.kind() {
        "function_declaration" | "method_declaration" => {
            let decl = rng(n);
            f.decls.push(decl);
            if let Some(params) = n.child_by_field_name("parameters") {
                let mut idx = 0;
                let mut c = params.walk();
                for d in params.named_children(&mut c) {
                    if !matches!(d.kind(), "parameter_declaration" | "variadic_parameter_declaration") {
                        continue;
                    }
                    let mut named = 0;
                    let mut c2 = d.walk();
                    for name in d.children_by_field_name("name", &mut c2) {
                        f.params.push(ParamDecl { name: text(name, src), range: rng(name), index: idx, decl });
                        idx += 1;
                        named += 1;
                    }
                    if named == 0 {
                        idx += 1;
                    }
                }
            }
        }
        "call_expression" => {
            if let Some(func) = n.child_by_field_name("function") {
                let callee = match func.kind() {
                    "selector_expression" => func.child_by_field_name("field").unwrap_or(func),
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
                let used = !matches!(
                    n.parent().map(|p| p.kind()),
                    Some("expression_statement" | "go_statement" | "defer_statement")
                );
                f.calls.push(CallSite { callee: rng(callee), callee_text: text(func, src), args, result_used: used });
            }
        }
        _ => {}
    }
    let mut c = n.walk();
    for ch in n.children(&mut c) {
        walk(ch, src, f);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_calls_and_params() {
        let src = "package p\nfunc f(a, b int, _ string) int {\n\tg(a)\n\tx := h.m(b)\n\treturn x\n}\n";
        let f = Go.facts(src);
        assert_eq!(f.decls.len(), 1);
        let names: Vec<_> = f.params.iter().map(|p| (p.name.as_str(), p.index)).collect();
        assert_eq!(names, vec![("a", 0), ("b", 1), ("_", 2)]);
        assert_eq!(f.calls.len(), 2);
        assert!(!f.calls[0].result_used);
        assert!(f.calls[1].result_used);
        assert_eq!(f.calls[1].callee_text, "h.m");
        assert_eq!(f.calls[1].callee.start_col, 8); // `m` in "\tx := h.m(b)"
    }
}
