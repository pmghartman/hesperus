//! The formatter: AST → text. Keeps order, comments, blank lines and templates.
//! The printer builds a canonical AST and formats it with the same writer.

use crate::ast::*;

pub fn format_file(file: &File) -> String {
    let mut w = Writer { out: String::new(), indent: 0 };
    for t in &file.leading {
        if let Trivia::Comment(c) = t {
            w.line(c);
        }
    }
    let vc = file.version_comment.as_ref().map(|c| format!(" {c}")).unwrap_or_default();
    w.line(&format!("hesperus {}{vc}", file.version.as_ref().map(|v| v.text.as_str()).unwrap_or("0.1")));
    if let Some(g) = &file.generated {
        let gc = file.generated_comment.as_ref().map(|c| format!(" {c}")).unwrap_or_default();
        w.line(&format!("generated {}{gc}", quote(&g.text)));
    }
    // one blank line after the header; top-level statements separated by one blank
    // line, except consecutive `let`s, which stay together unless the source spaced them
    let mut prev: Option<&Stmt> = None;
    for stmt in &file.items {
        let lead: Vec<&Trivia> = match prev {
            None => {
                w.blank();
                stmt.leading.iter().skip_while(|t| matches!(t, Trivia::Blank)).collect()
            }
            Some(p) => {
                let both_lets = matches!(p.kind, StmtKind::Let(_)) && matches!(stmt.kind, StmtKind::Let(_));
                if !both_lets && !stmt.leading.iter().any(|t| matches!(t, Trivia::Blank)) {
                    w.blank();
                }
                stmt.leading.iter().collect()
            }
        };
        w.trivia_refs(&lead);
        w.stmt(stmt);
        prev = Some(stmt);
    }
    w.trivia_comments_only(&file.trailing);
    w.out
}

pub fn quote(s: &str) -> String {
    let mut out = String::from("\"");
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '"' => out.push_str("\\\""),
            crate::lexer::ESCAPED_DOLLAR => out.push_str("\\$"),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            c => out.push(c),
        }
        i += 1;
    }
    out.push('"');
    out
}

struct Writer {
    out: String,
    indent: usize,
}

impl Writer {
    fn pad(&mut self) {
        for _ in 0..self.indent {
            self.out.push_str("  ");
        }
    }
    fn line(&mut self, s: &str) {
        self.pad();
        self.out.push_str(s);
        self.out.push('\n');
    }
    fn blank(&mut self) {
        if !self.out.ends_with("\n\n") && !self.out.is_empty() {
            self.out.push('\n');
        }
    }
    fn trivia_refs(&mut self, t: &[&Trivia]) {
        for tr in t {
            match tr {
                Trivia::Blank => self.blank(),
                Trivia::Comment(c) => self.line(c),
            }
        }
    }
    /// Trailing trivia of a block or file: comments kept, blank lines dropped
    /// except one before the first comment.
    fn trivia_comments_only(&mut self, t: &[Trivia]) {
        let mut seen_comment = false;
        for tr in t {
            match tr {
                Trivia::Blank => {
                    if !seen_comment && t.iter().any(|x| matches!(x, Trivia::Comment(_))) {
                        self.blank();
                    }
                }
                Trivia::Comment(c) => {
                    seen_comment = true;
                    self.line(c);
                }
            }
        }
    }
    fn stmt(&mut self, s: &Stmt) {
        let text = self.stmt_head(&s.kind);
        let trailing = s.trailing_comment.as_ref().map(|c| format!(" {c}")).unwrap_or_default();
        let open = block_of(&s.kind).and_then(|b| b.open_comment.as_ref()).map(|c| format!(" {c}")).unwrap_or_default();
        match block_of(&s.kind) {
            Some(b) if !b.items.is_empty() || b.trailing.iter().any(|t| matches!(t, Trivia::Comment(_))) || b.open_comment.is_some() => {
                self.line(&format!("{text} {{{open}"));
                self.indent += 1;
                self.block_items(b);
                self.indent -= 1;
                self.line(&format!("}}{trailing}"));
            }
            Some(_) if matches!(s.kind, StmtKind::Template(_) | StmtKind::Each(_)) => {
                self.line(&format!("{text} {{{open}"));
                self.line(&format!("}}{trailing}"));
            }
            _ => self.line(&format!("{text}{trailing}")),
        }
    }
    fn block_items(&mut self, b: &Block) {
        let mut first = true;
        for s in &b.items {
            let lead: Vec<&Trivia> = if first { s.leading.iter().skip_while(|t| matches!(t, Trivia::Blank)).collect() } else { s.leading.iter().collect() };
            self.trivia_refs(&lead);
            self.stmt(s);
            first = false;
        }
        self.trivia_comments_only(&b.trailing);
    }
    fn stmt_head(&self, k: &StmtKind) -> String {
        match k {
            StmtKind::Node(n) => {
                let mut s = format!("{} {}", n.kind.text, n.name.text);
                if let Some(l) = &n.label {
                    s.push(' ');
                    s.push_str(&quote(&l.text));
                }
                s
            }
            StmtKind::Edge(e) => {
                let mut s = format!("{} -> {}", e.from.dotted(), e.to.dotted());
                if let Some(k) = &e.kind {
                    s.push_str(&format!(": {}", k.text));
                }
                if let Some(l) = &e.label {
                    s.push(' ');
                    s.push_str(&quote(&l.text));
                }
                s
            }
            StmtKind::Constraint(c) => {
                let mut s = format!("{} {} -> {}", c.rule.text, c.from.dotted(), c.to.dotted());
                if let Some(k) = &c.kind {
                    s.push_str(&format!(": {}", k.text));
                }
                s
            }
            StmtKind::Property(p) => format!("{}: {}", p.key.text, value(&p.value)),
            StmtKind::Import(i) => format!("import {}", quote(&i.text)),
            StmtKind::Let(l) => format!("let {} = {}", l.name.text, list(&l.list)),
            StmtKind::Template(t) => {
                format!("template {}({})", t.name.text, t.params.iter().map(|p| p.text.as_str()).collect::<Vec<_>>().join(", "))
            }
            StmtKind::Each(e) => {
                let src = match &e.source {
                    EachSource::Name(n) => n.text.clone(),
                    EachSource::List(items, _) => list(items),
                };
                format!("each {} in {}", e.var.text, src)
            }
            StmtKind::Call(c) => format!("{}({})", c.name.text, c.args.iter().map(value).collect::<Vec<_>>().join(", ")),
        }
    }
}

fn block_of(k: &StmtKind) -> Option<&Block> {
    match k {
        StmtKind::Node(n) => n.block.as_ref(),
        StmtKind::Edge(e) => e.block.as_ref(),
        StmtKind::Template(t) => Some(&t.body),
        StmtKind::Each(e) => Some(&e.body),
        _ => None,
    }
}

pub fn value(v: &Value) -> String {
    match v {
        Value::Str(s) => quote(&s.text),
        Value::Ident(i) => i.text.clone(),
        Value::Bool(b, _) => b.to_string(),
        Value::Number(n, _) => n.clone(),
        Value::List(items, _) => list(items),
    }
}

fn list(items: &[Value]) -> String {
    format!("[{}]", items.iter().map(value).collect::<Vec<_>>().join(", "))
}
