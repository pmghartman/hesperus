// The TypeScript frontend: one source file → a neutral stream of facts. Nothing here
// knows any framework. A frontend for another language emits the same facts.

import { Node, Project, SourceFile, SyntaxKind, ts } from "ts-morph";

/** Where a value came from: an import binding, a global, or a local of unknown provenance. */
export interface Origin {
  /** Module specifier, `<global>` for an undeclared identifier, `<local>` for a local. */
  module: string;
  /** The imported name (`default`, `*`, or the export name), or the identifier for globals and locals. */
  symbol: string;
}

export interface Arg {
  /** Static text: a literal, a template's static head, a const's literal, `new URL("...")`. */
  text: string | null;
  isObject: boolean;
  keys: string[];
}

export type Fact =
  /** `spec` is null for a dynamic import whose specifier is not static. */
  | { kind: "import"; spec: string | null; typeOnly: boolean; line: number }
  | {
      kind: "call" | "new" | "tagged";
      /** Function or method name at the site (`query` in `pool.query`, `fetch` in `fetch(`). */
      name: string;
      /** The receiver's text (`pool`, `url.pathname`), null for a bare call. */
      receiver: string | null;
      /** Origin of the leftmost identifier. */
      origin: Origin;
      args: Arg[];
      /** For tagged templates: the static head of the template. */
      head: string | null;
      line: number;
    }
  | { kind: "compare"; subject: string; literal: string; line: number }
  | { kind: "property"; name: string; inCall: string | null; line: number };

export interface FileFacts {
  facts: Fact[];
  /** Every module specifier the file imports, for fallback rules. */
  modules: Map<string, number>;
}

export function newProject(): Project {
  return new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true, compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022 } });
}

export function factsOf(project: Project, relPath: string, text: string): FileFacts {
  const sf = project.createSourceFile(relPath, text, { overwrite: true });
  try {
    return collect(sf);
  } finally {
    project.removeSourceFile(sf);
  }
}

function collect(sf: SourceFile): FileFacts {
  const facts: Fact[] = [];
  const modules = new Map<string, number>();
  const origins = new Map<string, Origin>();
  const declared = new Set<string>();
  const line = (n: Node) => n.getStartLineNumber();

  // declared names: anything a local binding could shadow
  sf.forEachDescendant((n) => {
    if (Node.isVariableDeclaration(n) || Node.isFunctionDeclaration(n) || Node.isClassDeclaration(n) || Node.isParameterDeclaration(n)) {
      const name = n.getNameNode();
      if (name && Node.isIdentifier(name)) declared.add(name.getText());
      else if (name) for (const id of name.getDescendantsOfKind(SyntaxKind.Identifier)) declared.add(id.getText());
    }
  });

  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (!modules.has(spec)) modules.set(spec, line(imp));
    const named = imp.getNamedImports();
    const typeOnly = imp.isTypeOnly() || (named.length > 0 && named.every((n) => n.isTypeOnly()) && !imp.getDefaultImport() && !imp.getNamespaceImport());
    facts.push({ kind: "import", spec, typeOnly, line: line(imp) });
    const def = imp.getDefaultImport();
    if (def) origins.set(def.getText(), { module: spec, symbol: "default" });
    const ns = imp.getNamespaceImport();
    if (ns) origins.set(ns.getText(), { module: spec, symbol: "*" });
    for (const n of named) origins.set((n.getAliasNode() ?? n.getNameNode()).getText(), { module: spec, symbol: n.getNameNode().getText() });
  }
  for (const exp of sf.getExportDeclarations()) {
    const spec = exp.getModuleSpecifierValue();
    if (spec && !exp.isTypeOnly()) {
      if (!modules.has(spec)) modules.set(spec, line(exp));
      facts.push({ kind: "import", spec, typeOnly: false, line: line(exp) });
    }
  }

  const originOf = (expr: Node | undefined): Origin => {
    const root = leftmost(expr);
    if (!root) return { module: "<local>", symbol: "" };
    const name = root.getText();
    const known = origins.get(name);
    if (known) return known;
    if (!declared.has(name)) return { module: "<global>", symbol: name };
    return { module: "<local>", symbol: name };
  };

  // variable origins flow through calls, constructions and member access: const pool = new Pool()
  const bindOrigins = (n: Node) => {
    if (!Node.isVariableDeclaration(n)) return;
    const init = n.getInitializer();
    const name = n.getNameNode();
    if (!init || !Node.isIdentifier(name)) return;
    const o = originOf(init);
    if (o.module !== "<local>" || o.symbol !== "") origins.set(name.getText(), o);
  };
  // two passes so a use before its declaration (hoisted functions) still resolves
  sf.forEachDescendant(bindOrigins);
  sf.forEachDescendant(bindOrigins);

  const arg = (a: Node | undefined): Arg => ({
    text: staticText(a, origins, sf),
    isObject: !!a && Node.isObjectLiteralExpression(a),
    keys: a && Node.isObjectLiteralExpression(a) ? a.getProperties().map((p) => (Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p) || Node.isMethodDeclaration(p) ? p.getName() : "")).filter(Boolean) : [],
  });

  sf.forEachDescendant((n) => {
    if (Node.isCallExpression(n)) {
      const callee = n.getExpression();
      const args = n.getArguments();
      if (callee.getKind() === SyntaxKind.ImportKeyword || (Node.isIdentifier(callee) && callee.getText() === "require")) {
        const spec = staticText(args[0], origins, sf);
        if (spec && !modules.has(spec)) modules.set(spec, line(n));
        facts.push({ kind: "import", spec, typeOnly: false, line: line(n) });
        return;
      }
      const { name, receiver } = split(callee);
      facts.push({ kind: "call", name, receiver, origin: originOf(callee), args: args.map(arg), head: null, line: line(n) });
      return;
    }
    if (Node.isNewExpression(n)) {
      const callee = n.getExpression();
      const { name, receiver } = split(callee);
      facts.push({ kind: "new", name, receiver, origin: originOf(callee), args: n.getArguments().map(arg), head: null, line: line(n) });
      return;
    }
    if (Node.isTaggedTemplateExpression(n)) {
      const tag = n.getTag();
      const { name, receiver } = split(tag);
      const t = n.getTemplate();
      const head = Node.isNoSubstitutionTemplateLiteral(t) ? t.getLiteralText() : Node.isTemplateExpression(t) ? t.getHead().getLiteralText() : "";
      facts.push({ kind: "tagged", name, receiver, origin: originOf(tag), args: [], head, line: line(n) });
      return;
    }
    if (Node.isBinaryExpression(n)) {
      const op = n.getOperatorToken().getKind();
      if (op === SyntaxKind.EqualsEqualsEqualsToken || op === SyntaxKind.EqualsEqualsToken) {
        const l = n.getLeft();
        const r = n.getRight();
        if (Node.isStringLiteral(r)) facts.push({ kind: "compare", subject: l.getText(), literal: r.getLiteralText(), line: line(n) });
        else if (Node.isStringLiteral(l)) facts.push({ kind: "compare", subject: r.getText(), literal: l.getLiteralText(), line: line(n) });
      }
      return;
    }
    if (Node.isCaseClause(n)) {
      const sw = n.getParentOrThrow().getParentOrThrow();
      const e = n.getExpression();
      if (Node.isSwitchStatement(sw) && Node.isStringLiteral(e)) facts.push({ kind: "compare", subject: sw.getExpression().getText(), literal: e.getLiteralText(), line: line(n) });
      return;
    }
    if (Node.isPropertyAssignment(n) || Node.isShorthandPropertyAssignment(n)) {
      const obj = n.getParent();
      const call = obj?.getParent();
      const inCall = call && (Node.isCallExpression(call) || Node.isNewExpression(call)) ? split(call.getExpression()).name : null;
      facts.push({ kind: "property", name: n.getName(), inCall, line: line(n) });
    }
  });
  return { facts, modules };
}

/** `a.b.c(` → name `c`, receiver `a.b`; `f(` → name `f`, receiver null. */
function split(callee: Node): { name: string; receiver: string | null } {
  if (Node.isPropertyAccessExpression(callee)) return { name: callee.getName(), receiver: callee.getExpression().getText() };
  if (Node.isElementAccessExpression(callee)) return { name: "[]", receiver: callee.getExpression().getText() };
  return { name: callee.getText(), receiver: null };
}

function leftmost(n: Node | undefined): Node | undefined {
  let cur = n;
  for (let i = 0; i < 64 && cur; i++) {
    if (Node.isIdentifier(cur)) return cur;
    if (Node.isPropertyAccessExpression(cur) || Node.isElementAccessExpression(cur)) cur = cur.getExpression();
    else if (Node.isCallExpression(cur) || Node.isNewExpression(cur)) cur = cur.getExpression();
    else if (Node.isAwaitExpression(cur) || Node.isParenthesizedExpression(cur) || Node.isAsExpression(cur) || Node.isNonNullExpression(cur) || Node.isTypeAssertion(cur) || Node.isSatisfiesExpression(cur)) cur = cur.getExpression();
    else if (Node.isExpressionWithTypeArguments(cur)) cur = cur.getExpression();
    else return undefined;
  }
  return undefined;
}

/** The static text of an argument, or null when it is dynamic. */
export function staticText(n: Node | undefined, origins: Map<string, Origin>, sf: SourceFile, depth = 0): string | null {
  if (!n || depth > 8) return null;
  if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) return n.getLiteralText();
  if (Node.isTemplateExpression(n)) {
    const head = n.getHead().getLiteralText();
    if (head.length > 0) return head;
    const span = n.getTemplateSpans()[0];
    const t = staticText(span?.getExpression(), origins, sf, depth + 1);
    return t ? t + (span?.getLiteral().getLiteralText() ?? "") : null;
  }
  if (Node.isNewExpression(n) && n.getExpression().getText() === "URL") return staticText(n.getArguments()[0], origins, sf, depth + 1);
  if (Node.isBinaryExpression(n) && n.getOperatorToken().getKind() === SyntaxKind.PlusToken) return staticText(n.getLeft(), origins, sf, depth + 1);
  if (Node.isParenthesizedExpression(n) || Node.isAsExpression(n) || Node.isAwaitExpression(n) || Node.isNonNullExpression(n)) return staticText(n.getExpression(), origins, sf, depth + 1);
  if (Node.isIdentifier(n)) {
    // a const initialized with a literal in this file
    const name = n.getText();
    for (const d of sf.getVariableDeclarations()) {
      if (d.getName() === name) return staticText(d.getInitializer(), origins, sf, depth + 1);
    }
    for (const d of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      if (d.getName() === name) return staticText(d.getInitializer(), origins, sf, depth + 1);
    }
  }
  return null;
}
