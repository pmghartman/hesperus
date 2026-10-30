//! Recursive-descent parser that recovers at the next newline or `}` and reports
//! every error it finds.

use crate::ast::*;
use crate::diag::{clip, nearest, Diagnostic, Span};
use crate::lexer::{lex, Tok, Token};

pub struct Parsed {
    pub file: File,
    pub diags: Vec<Diagnostic>,
}

/// Deepest block (and list) nesting the parser accepts; deeper files get E035 instead of a stack overflow.
pub const MAX_NESTING: usize = 64;

pub fn parse(path: &str, text: &str) -> Parsed {
    let (toks, mut diags) = lex(path, text);
    let mut p = Parser { file: path.to_string(), toks, pos: 0, diags: Vec::new(), depth: 0, list_depth: 0 };
    let file = p.file();
    diags.extend(p.diags);
    Parsed { file, diags }
}

struct Parser {
    file: String,
    toks: Vec<Token>,
    pos: usize,
    diags: Vec<Diagnostic>,
    depth: usize,
    list_depth: usize,
}

impl Parser {
    fn peek(&self) -> &Tok {
        &self.toks[self.pos].tok
    }
    fn peek_at(&self, k: usize) -> &Tok {
        let i = (self.pos + k).min(self.toks.len() - 1);
        &self.toks[i].tok
    }
    fn cur(&self) -> &Token {
        &self.toks[self.pos]
    }
    fn span_of(&self, t: &Token) -> Span {
        Span::new(&self.file, t.start, t.end)
    }
    fn cur_span(&self) -> Span {
        self.span_of(self.cur())
    }
    fn bump(&mut self) -> Token {
        let t = self.toks[self.pos].clone();
        if self.pos < self.toks.len() - 1 {
            self.pos += 1;
        }
        t
    }
    fn at(&self, t: &Tok) -> bool {
        self.peek() == t
    }
    fn error(&mut self, code: &'static str, span: Span, msg: impl Into<String>) {
        self.diags.push(Diagnostic::error(code, span, msg));
    }
    fn expect(&mut self, t: Tok, what: &str) -> Option<Token> {
        if self.at(&t) {
            Some(self.bump())
        } else {
            let span = self.cur_span();
            let found = describe(self.peek());
            self.error("E003", span, format!("expected {what}, found {found}"));
            None
        }
    }
    /// Skip to the end of the current statement (just before the newline, `}` or EOF).
    fn recover(&mut self) {
        loop {
            match self.peek() {
                Tok::Newline | Tok::RBrace | Tok::Eof => return,
                Tok::LBrace => {
                    // skip a whole block so a bad statement's braces stay balanced
                    self.skip_block();
                }
                _ => {
                    self.bump();
                }
            }
        }
    }
    fn skip_block(&mut self) {
        let mut depth = 0i32;
        loop {
            match self.peek() {
                Tok::LBrace => depth += 1,
                Tok::RBrace => {
                    depth -= 1;
                    if depth <= 0 {
                        self.bump();
                        return;
                    }
                }
                Tok::Eof => return,
                _ => {}
            }
            self.bump();
        }
    }
    /// Collect comments and blank lines; returns them as trivia.
    fn trivia(&mut self) -> Vec<Trivia> {
        let mut out = Vec::new();
        let mut newlines = 0;
        loop {
            match self.peek() {
                Tok::Newline => {
                    // the statement before us consumed its own terminator, so every
                    // newline here is a blank line; a run of them is one blank
                    newlines += 1;
                    if newlines == 1 {
                        out.push(Trivia::Blank);
                    }
                    self.bump();
                }
                Tok::Comment(c) => {
                    let c = c.clone();
                    out.push(Trivia::Comment(c));
                    newlines = 0;
                    self.bump();
                    // the comment's own line terminator is not a blank line
                    if self.at(&Tok::Newline) {
                        self.bump();
                    }
                }
                _ => return out,
            }
        }
    }
    /// After a statement: optional trailing comment, then a newline, `}` or EOF.
    fn end_statement(&mut self) -> Option<String> {
        let mut trailing = None;
        if let Tok::Comment(c) = self.peek() {
            trailing = Some(c.clone());
            self.bump();
        }
        match self.peek() {
            Tok::Newline => {
                self.bump();
            }
            Tok::RBrace | Tok::Eof => {}
            _ => {
                let span = self.cur_span();
                let found = describe(self.peek());
                self.error("E003", span, format!("expected end of line, found {found}"));
                self.recover();
                if self.at(&Tok::Newline) {
                    self.bump();
                }
            }
        }
        trailing
    }

    fn file(&mut self) -> File {
        let mut file = File { path: self.file.clone(), leading: Vec::new(), version: None, version_comment: None, generated: None, generated_comment: None, items: Vec::new(), trailing: Vec::new() };
        // version line, possibly after comments
        let lead = self.trivia();
        let mut first_trivia = lead;
        if matches!(self.peek(), Tok::Ident(s) if s == "hesperus") {
            file.leading = first_trivia.iter().filter(|t| matches!(t, Trivia::Comment(_))).cloned().collect();
            let t = self.bump();
            match self.peek().clone() {
                Tok::Number(n) => {
                    let nt = self.bump();
                    if n != "0.1" {
                        self.error("E002", self.span_of(&nt), format!("unsupported version {n}; this tool speaks 0.1"));
                        self.diags.last_mut().unwrap().fix = Some("0.1".into());
                    }
                    file.version = Some(Str { text: n, span: self.span_of(&nt) });
                }
                _ => {
                    self.error("E002", self.span_of(&t), "version line must read `hesperus 0.1`");
                    self.diags.last_mut().unwrap().fix = Some("hesperus 0.1".into());
                }
            }
            file.version_comment = self.end_statement();
            first_trivia = Vec::new();
        } else {
            let span = Span::new(&self.file, 0, 0);
            self.diags.push(Diagnostic::error("E001", span, "missing version line; every file starts with `hesperus 0.1`").with_fix("hesperus 0.1\n"));
        }
        let mut lead = self.trivia();
        first_trivia.append(&mut lead);
        if matches!(self.peek(), Tok::Ident(s) if s == "generated") {
            let t = self.bump();
            match self.peek().clone() {
                Tok::Str(s) => {
                    let st = self.bump();
                    file.generated = Some(Str { text: s, span: self.span_of(&st) });
                }
                _ => {
                    self.error("E003", self.span_of(&t), "`generated` needs the extractor's name as a string");
                    self.recover();
                }
            }
            file.generated_comment = self.end_statement();
            let mut lead = self.trivia();
            first_trivia.append(&mut lead);
        }
        // drop the blank between header and body: canonical and always re-inserted
        let mut pending = first_trivia;
        loop {
            if self.at(&Tok::Eof) {
                break;
            }
            if self.at(&Tok::RBrace) {
                let span = self.cur_span();
                self.error("E003", span, "unexpected `}`");
                self.bump();
                continue;
            }
            match self.statement(true) {
                Some(mut s) => {
                    let mut lead = std::mem::take(&mut pending);
                    lead.append(&mut s.leading);
                    s.leading = lead;
                    file.items.push(s);
                }
                None => {}
            }
            pending.append(&mut self.trivia());
        }
        file.trailing = pending;
        file
    }

    fn block(&mut self) -> Block {
        let open = self.bump(); // `{`
        self.depth += 1;
        let start = open.start;
        if self.depth > MAX_NESTING {
            self.error("E035", Span::new(&self.file, start, open.end), format!("blocks nest deeper than {MAX_NESTING} levels"));
            self.depth -= 1;
            // consume the rest of this block without building it
            self.pos -= 1;
            self.skip_block();
            return Block { items: Vec::new(), open_comment: None, trailing: Vec::new(), span: Span::new(&self.file, start, self.cur().end) };
        }
        let mut items = Vec::new();
        let mut open_comment = None;
        if let Tok::Comment(c) = self.peek().clone() {
            self.bump();
            open_comment = Some(c);
        }
        if self.at(&Tok::Newline) {
            self.bump();
        }
        let mut pending = self.trivia();
        loop {
            match self.peek() {
                Tok::RBrace => {
                    let t = self.bump();
                    self.depth -= 1;
                    return Block { items, open_comment, trailing: pending, span: Span::new(&self.file, start, t.end) };
                }
                Tok::Eof => {
                    let span = Span::new(&self.file, start, start + 1);
                    self.error("E003", span, "unclosed `{`");
                    self.depth -= 1;
                    return Block { items, open_comment, trailing: pending, span: Span::new(&self.file, start, self.cur().end) };
                }
                _ => {}
            }
            if let Some(mut s) = self.statement(false) {
                let mut lead = std::mem::take(&mut pending);
                lead.append(&mut s.leading);
                s.leading = lead;
                items.push(s);
            }
            pending.append(&mut self.trivia());
        }
    }

    fn statement(&mut self, top: bool) -> Option<Stmt> {
        let start_tok = self.cur().clone();
        let start = start_tok.start;
        let kind = match self.peek().clone() {
            Tok::Ident(word) => {
                let w = word.as_str();
                match w {
                    "import" => self.import(),
                    "let" => self.let_stmt(),
                    "template" => self.template(),
                    "each" => self.each(),
                    "require" | "forbid" => self.constraint(),
                    _ if NODE_KINDS.contains(&w) && matches!(self.peek_at(1), Tok::Ident(_)) => self.node(),
                    _ if NODE_KINDS.contains(&w) && matches!(self.peek_at(1), Tok::Newline | Tok::Eof | Tok::RBrace | Tok::LBrace | Tok::Str(_)) => {
                        let span = self.cur_span();
                        self.error("E003", span, format!("`{w}` needs a node name: `{w} name`"));
                        self.recover();
                        None
                    }
                    _ => {
                        // call, property, edge, or a misspelled kind
                        match self.peek_at(1) {
                            Tok::LParen => self.call(),
                            Tok::Colon if !top => self.property(),
                            Tok::Arrow | Tok::Dot => self.edge(),
                            Tok::Ident(_) => {
                                let span = self.cur_span();
                                let fix = nearest(w, NODE_KINDS.iter().copied());
                                let msg = match fix {
                                    Some(f) => format!("unknown node kind `{}`; did you mean `{f}`?", clip(w)),
                                    None => format!("unknown node kind `{}`", clip(w)),
                                };
                                let mut d = Diagnostic::error("E005", span, msg);
                                d.fix = fix.map(|f| f.to_string());
                                self.diags.push(d);
                                self.recover();
                                None
                            }
                            _ => {
                                let span = self.cur_span();
                                self.error("E003", span, format!("unexpected `{}`; expected a node, edge, property or import", clip(w)));
                                self.recover();
                                None
                            }
                        }
                    }
                }
            }
            Tok::Str(_) | Tok::Number(_) | Tok::LBracket | Tok::Colon | Tok::Comma | Tok::Dot | Tok::Eq | Tok::Arrow | Tok::LParen | Tok::RParen | Tok::RBracket => {
                let span = self.cur_span();
                let found = describe(self.peek());
                self.error("E003", span, format!("unexpected {found} at the start of a statement"));
                self.recover();
                None
            }
            Tok::LBrace => {
                let span = self.cur_span();
                self.error("E003", span, "unexpected `{`; a block needs a node or edge before it");
                self.skip_block();
                None
            }
            Tok::Newline | Tok::Comment(_) | Tok::RBrace | Tok::Eof => None,
        };
        let kind = kind?;
        let trailing_comment = self.end_statement();
        let end = self.toks[self.pos.saturating_sub(1)].end.max(start);
        Some(Stmt { leading: Vec::new(), trailing_comment, kind, span: Span::new(&self.file, start, end) })
    }

    fn ident(&mut self, what: &str) -> Option<Ident> {
        match self.peek().clone() {
            Tok::Ident(s) => {
                let t = self.bump();
                if RESERVED.contains(&s.as_str()) {
                    self.error("E003", self.span_of(&t), format!("`{s}` is a reserved word and cannot be {what}"));
                }
                Some(Ident { text: s, span: self.span_of(&t) })
            }
            _ => {
                let span = self.cur_span();
                let found = describe(self.peek());
                self.error("E003", span, format!("expected {what}, found {found}"));
                None
            }
        }
    }

    fn string(&mut self) -> Option<Str> {
        match self.peek().clone() {
            Tok::Str(s) => {
                let t = self.bump();
                Some(Str { text: s, span: self.span_of(&t) })
            }
            _ => None,
        }
    }

    fn path(&mut self) -> Option<Path> {
        let first = self.ident("a node name")?;
        let mut span = first.span.clone();
        let mut segments = vec![first];
        while self.at(&Tok::Dot) {
            self.bump();
            let seg = self.ident("a node name after `.`")?;
            span = span.join(&seg.span);
            segments.push(seg);
        }
        Some(Path { segments, span })
    }

    fn node(&mut self) -> Option<StmtKind> {
        let kt = self.bump();
        let kind = Ident { text: tok_text(&kt.tok), span: self.span_of(&kt) };
        let name = match self.ident("a node name") {
            Some(n) => n,
            None => {
                self.recover();
                return None;
            }
        };
        let label = self.string();
        let block = if self.at(&Tok::LBrace) { Some(self.block()) } else { None };
        Some(StmtKind::Node(NodeStmt { kind, name, label, block }))
    }

    fn edge(&mut self) -> Option<StmtKind> {
        let from = match self.path() {
            Some(p) => p,
            None => {
                self.recover();
                return None;
            }
        };
        if self.expect(Tok::Arrow, "`->`").is_none() {
            self.recover();
            return None;
        }
        let to = match self.path() {
            Some(p) => p,
            None => {
                self.recover();
                return None;
            }
        };
        let mut kind = None;
        if self.at(&Tok::Colon) {
            self.bump();
            match self.peek().clone() {
                Tok::Ident(k) => {
                    let t = self.bump();
                    if !EDGE_KINDS.contains(&k.as_str()) {
                        let fix = nearest(&k, EDGE_KINDS.iter().copied());
                        let msg = match fix {
                            Some(f) => format!("unknown edge kind `{k}`; did you mean `{f}`?"),
                            None => format!("unknown edge kind `{k}`; one of calls, reads, writes, http, ws, io"),
                        };
                        let mut d = Diagnostic::error("E006", self.span_of(&t), msg);
                        d.fix = fix.map(|f| f.to_string());
                        self.diags.push(d);
                    }
                    kind = Some(Ident { text: k, span: self.span_of(&t) });
                }
                _ => {
                    let span = self.cur_span();
                    self.error("E006", span, "expected an edge kind after `:`");
                    self.recover();
                    return None;
                }
            }
        }
        let label = self.string();
        let block = if self.at(&Tok::LBrace) { Some(self.block()) } else { None };
        Some(StmtKind::Edge(EdgeStmt { from, to, kind, label, block }))
    }

    fn constraint(&mut self) -> Option<StmtKind> {
        let rt = self.bump();
        let rule = Ident { text: tok_text(&rt.tok), span: self.span_of(&rt) };
        let from = self.path().or_else(|| {
            self.recover();
            None
        })?;
        if self.expect(Tok::Arrow, "`->`").is_none() {
            self.recover();
            return None;
        }
        let to = self.path().or_else(|| {
            self.recover();
            None
        })?;
        let mut kind = None;
        if self.at(&Tok::Colon) {
            self.bump();
            match self.peek().clone() {
                Tok::Ident(k) => {
                    let t = self.bump();
                    if !EDGE_KINDS.contains(&k.as_str()) {
                        let fix = nearest(&k, EDGE_KINDS.iter().copied());
                        let mut d = Diagnostic::error("E006", self.span_of(&t), format!("unknown edge kind `{k}`"));
                        d.fix = fix.map(|f| f.to_string());
                        self.diags.push(d);
                    }
                    kind = Some(Ident { text: k, span: self.span_of(&t) });
                }
                _ => {
                    let span = self.cur_span();
                    self.error("E006", span, "expected an edge kind after `:`");
                    self.recover();
                    return None;
                }
            }
        }
        Some(StmtKind::Constraint(ConstraintStmt { rule, from, to, kind }))
    }

    fn property(&mut self) -> Option<StmtKind> {
        let kt = self.bump();
        let key = Ident { text: tok_text(&kt.tok), span: self.span_of(&kt) };
        self.bump(); // `:`
        let value = match self.value() {
            Some(v) => v,
            None => {
                self.recover();
                return None;
            }
        };
        Some(StmtKind::Property(PropertyStmt { key, value }))
    }

    fn value(&mut self) -> Option<Value> {
        match self.peek().clone() {
            Tok::Str(s) => {
                let t = self.bump();
                Some(Value::Str(Str { text: s, span: self.span_of(&t) }))
            }
            Tok::Ident(s) => {
                let t = self.bump();
                let span = self.span_of(&t);
                match s.as_str() {
                    "true" => Some(Value::Bool(true, span)),
                    "false" => Some(Value::Bool(false, span)),
                    _ => Some(Value::Ident(Ident { text: s, span })),
                }
            }
            Tok::Number(n) => {
                let t = self.bump();
                Some(Value::Number(n, self.span_of(&t)))
            }
            Tok::LBracket => {
                let (items, span) = self.list()?;
                Some(Value::List(items, span))
            }
            _ => {
                let span = self.cur_span();
                let found = describe(self.peek());
                self.error("E003", span, format!("expected a value, found {found}"));
                None
            }
        }
    }

    fn list(&mut self) -> Option<(Vec<Value>, Span)> {
        let open = self.bump();
        if self.depth + self.list_depth >= MAX_NESTING {
            self.error("E035", self.span_of(&open), format!("lists nest deeper than {MAX_NESTING} levels"));
            // skip to the matching bracket
            let mut d = 1;
            while d > 0 && !self.at(&Tok::Eof) {
                match self.peek() {
                    Tok::LBracket => d += 1,
                    Tok::RBracket => d -= 1,
                    _ => {}
                }
                self.bump();
            }
            return None;
        }
        self.list_depth += 1;
        let r = self.list_inner(open);
        self.list_depth -= 1;
        r
    }

    fn list_inner(&mut self, open: Token) -> Option<(Vec<Value>, Span)> {
        let mut items = Vec::new();
        loop {
            // comments inside a list are dropped (the formatter cannot place them)
            while matches!(self.peek(), Tok::Newline | Tok::Comment(_)) {
                self.bump();
            }
            if self.at(&Tok::RBracket) {
                let t = self.bump();
                return Some((items, Span::new(&self.file, open.start, t.end)));
            }
            if self.at(&Tok::Eof) {
                self.error("E003", self.span_of(&open), "unclosed `[`");
                return None;
            }
            let v = self.value()?;
            items.push(v);
            while matches!(self.peek(), Tok::Newline | Tok::Comment(_)) {
                self.bump();
            }
            match self.peek() {
                Tok::Comma => {
                    self.bump();
                }
                Tok::RBracket => {}
                _ => {
                    let span = self.cur_span();
                    let found = describe(self.peek());
                    self.error("E003", span, format!("expected `,` or `]` in list, found {found}"));
                    return None;
                }
            }
        }
    }

    fn import(&mut self) -> Option<StmtKind> {
        self.bump();
        match self.string() {
            Some(s) => Some(StmtKind::Import(s)),
            None => {
                let span = self.cur_span();
                self.error("E003", span, "`import` needs a quoted file path");
                self.recover();
                None
            }
        }
    }

    fn let_stmt(&mut self) -> Option<StmtKind> {
        self.bump();
        let name = self.ident("a list name")?;
        if self.expect(Tok::Eq, "`=`").is_none() {
            self.recover();
            return None;
        }
        if !self.at(&Tok::LBracket) {
            let span = self.cur_span();
            self.error("E009", span, "`let` binds a list: `let name = [a, b]`");
            self.recover();
            return None;
        }
        let (list, list_span) = self.list()?;
        Some(StmtKind::Let(LetStmt { name, list, list_span }))
    }

    fn template(&mut self) -> Option<StmtKind> {
        self.bump();
        let name = self.ident("a template name")?;
        if self.expect(Tok::LParen, "`(`").is_none() {
            self.recover();
            return None;
        }
        let mut params = Vec::new();
        loop {
            if self.at(&Tok::RParen) {
                self.bump();
                break;
            }
            let p = match self.ident("a parameter name") {
                Some(p) => p,
                None => {
                    self.recover();
                    return None;
                }
            };
            params.push(p);
            if self.at(&Tok::Comma) {
                self.bump();
            } else if !self.at(&Tok::RParen) {
                let span = self.cur_span();
                self.error("E003", span, "expected `,` or `)` in parameter list");
                self.recover();
                return None;
            }
        }
        if !self.at(&Tok::LBrace) {
            let span = self.cur_span();
            self.error("E003", span, "a template needs a `{` body");
            self.recover();
            return None;
        }
        let body = self.block();
        Some(StmtKind::Template(TemplateStmt { name, params, body }))
    }

    fn each(&mut self) -> Option<StmtKind> {
        self.bump();
        let var = self.ident("a variable name")?;
        match self.peek() {
            Tok::Ident(s) if s == "in" => {
                self.bump();
            }
            _ => {
                let span = self.cur_span();
                self.error("E003", span, "expected `in`");
                self.recover();
                return None;
            }
        }
        let source = match self.peek().clone() {
            Tok::Ident(s) => {
                let t = self.bump();
                EachSource::Name(Ident { text: s, span: self.span_of(&t) })
            }
            Tok::LBracket => {
                let (items, span) = self.list()?;
                EachSource::List(items, span)
            }
            _ => {
                let span = self.cur_span();
                self.error("E003", span, "expected a list or list name after `in`");
                self.recover();
                return None;
            }
        };
        if !self.at(&Tok::LBrace) {
            let span = self.cur_span();
            self.error("E003", span, "`each` needs a `{` body");
            self.recover();
            return None;
        }
        let body = self.block();
        Some(StmtKind::Each(EachStmt { var, source, body }))
    }

    fn call(&mut self) -> Option<StmtKind> {
        let name = self.ident("a template name")?;
        self.bump(); // (
        let mut args = Vec::new();
        loop {
            if self.at(&Tok::RParen) {
                self.bump();
                break;
            }
            let v = match self.value() {
                Some(v) => v,
                None => {
                    self.recover();
                    return None;
                }
            };
            args.push(v);
            if self.at(&Tok::Comma) {
                self.bump();
            } else if !self.at(&Tok::RParen) {
                let span = self.cur_span();
                self.error("E003", span, "expected `,` or `)` in argument list");
                self.recover();
                return None;
            }
        }
        Some(StmtKind::Call(CallStmt { name, args }))
    }
}

fn tok_text(t: &Tok) -> String {
    match t {
        Tok::Ident(s) | Tok::Str(s) | Tok::Number(s) | Tok::Comment(s) => s.clone(),
        _ => String::new(),
    }
}

pub fn describe(t: &Tok) -> String {
    match t {
        Tok::Ident(s) => format!("`{}`", clip(s)),
        Tok::Str(s) => format!("string \"{}\"", clip(s)),
        Tok::Number(n) => format!("number {n}"),
        Tok::Newline => "end of line".into(),
        Tok::Comment(_) => "a comment".into(),
        Tok::LBrace => "`{`".into(),
        Tok::RBrace => "`}`".into(),
        Tok::LBracket => "`[`".into(),
        Tok::RBracket => "`]`".into(),
        Tok::LParen => "`(`".into(),
        Tok::RParen => "`)`".into(),
        Tok::Colon => "`:`".into(),
        Tok::Comma => "`,`".into(),
        Tok::Dot => "`.`".into(),
        Tok::Eq => "`=`".into(),
        Tok::Arrow => "`->`".into(),
        Tok::Eof => "end of file".into(),
    }
}
