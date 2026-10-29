// What core needs from a language's syntax. Implementations live in src/lang.
import { Range } from "./ir";

export interface CallSite {
  /** Name token of the callee when there is one, else the whole callee expression. */
  callee: Range;
  callee_text: string;
  args: Range[];
  /** The same arguments as operands, for constants passed into a parameter. */
  values: Operand[];
  /** Result feeds an assignment, argument, return, or operand. */
  result_used: boolean;
}

export interface ParamDecl {
  name: string;
  /** Name token. Unnamed parameters have no declaration and are not listed. */
  range: Range;
  /** Position among the function's parameters, receiver excluded. */
  index: number;
  /** Full range of the declaring function. */
  decl: Range;
}

/** One side of an assignment or equality test. */
export interface Operand {
  /** Token core resolves: the name in `x`, `c.state`, `State.Idle`; a literal itself. */
  name: Range;
  text: string;
  /** `name` resolves through the index; `literal` is a constant written inline; `other` is any
   *  other expression and never a state. */
  form: "name" | "literal" | "other";
  /** Source text of the object a member is read on (`c` in `c.state`); empty for bare names. */
  receiver: string;
  /** For `!x`: the name token of `x`, so writing `x = !x` flips a flag. */
  negates?: Range;
}

/** A write to a named location. Increments and compound assignments have an `other` value. */
export interface Assign {
  target: Operand;
  value: Operand;
  /** Declaration initializer or keyed literal element, not a statement: the first value. */
  init: boolean;
}

/** `left == right` (or `!=`), or a switch value against one case value. */
export interface Guard {
  left: Operand;
  right: Operand;
  /** False for `!=`: the body runs only when they differ. */
  equal: boolean;
  /** Code that runs only when the test holds. */
  body: Range;
  /** False under `||` or `!`, where the body can run without the test holding. */
  certain: boolean;
  /** A bare truth test (`if (x)`): `right` is `true` or `false`, and holds only for a boolean location. */
  truth?: boolean;
}

/** A name this file binds to something imported: `fs` in `import * as fs from "node:fs"`, `rfs` in
 *  `import { readFileSync as rfs } from "fs"`, `http` in `import "net/http"`. */
export interface ImportDecl {
  /** The binding as this file uses it. */
  local: string;
  /** The module as the import writes it, quotes stripped. */
  module: string;
  /** The exported name bound (`readFileSync`); unset when `local` stands for the whole module. */
  member?: string;
}

/** Files that may hold an imported module, and the names left to look up inside them. A file ending in
 *  `/` is a directory: every indexed file directly in it. */
export interface LocalModule { files: string[]; names: string[] }

/** How a language names what an import reaches. `build` resolves a call the index left unresolved
 *  through the import that binds the head of its callee path. */
export interface Imports {
  /** The dotted or scoped path of a callee, head first: `fs.promises.readFile` is [fs, promises, readFile].
   *  Empty when the callee is no plain path. */
  path(callee: string): string[];
  /** Where `module`, imported by `from`, may live in the repo, with `names` to look up there. Empty when
   *  the module cannot be repo code. */
  local(module: string, from: string, names: string[]): LocalModule[];
  /** Package and names of a definition outside the repo reached through `module`; undefined when the
   *  module can only be repo code. */
  external(module: string, names: string[]): { package: string; names: string[] } | undefined;
  /** A callee path that names its own module (`std::env::var`), when no import binds its head. */
  qualified?(path: string[]): { module: string; names: string[] } | undefined;
}

/** A definition the file's syntax outlines, as an editor's document symbols would: what the headless
 *  indexer uses in place of a language server. Flat; the indexer nests them by range. */
export interface SymbolDecl {
  name: string;
  /** `namespace` and `type` hold other definitions; `method` is any callable; `term` a value. */
  shape: "namespace" | "type" | "method" | "term";
  /** SCIP symbol kind: Class 7, Constant 8, Constructor 9, Enum 11, EnumMember 12, Field 15, Function 17,
   *  Interface 21, Method 26, Namespace 29, Struct 49, Variable 61. */
  kind: number;
  /** The whole declaration. */
  range: Range;
  /** The name token. */
  selection: Range;
  /** The comment above the declaration, or its docstring: first paragraph, comment marks stripped. */
  doc?: string;
}

/** A place the code branches: `if`/`else`, a loop, a `switch` and each of its cases, a `catch`. `range` is
 *  the whole construct (an `if` with its `else`), `body` the code that runs when it is taken. For `if`,
 *  what lies in `range` outside `body` is the else side (another `if` when chained). `text` is the
 *  condition, loop header, switched value or case value as written, whitespace collapsed. */
export interface Branch {
  kind: "if" | "else" | "loop" | "switch" | "case" | "catch";
  text: string;
  range: Range;
  body: Range;
}

export interface Facts {
  calls: CallSite[];
  /** Definitions by syntax alone, for indexing without a language server. */
  symbols: SymbolDecl[];
  /** Bindings this file imports, in source order. */
  imports: ImportDecl[];
  params: ParamDecl[];
  /** Full ranges of named function/method declarations. */
  decls: Range[];
  assigns: Assign[];
  guards: Guard[];
  /** Name tokens of constant declarations (`const`, enum members), so a constant can be a state when the
   *  index does not mark its kind, and so can a local one. */
  consts: Range[];
  /** Function literals (`() => …`, `lambda`, closures). One passed to a call runs when the callee calls it. */
  lambdas: Range[];
  /** Where control branches, in source order; found for every grammar by its node and field names. */
  branches: Branch[];
}

export const noFacts = (): Facts => ({ calls: [], symbols: [], imports: [], params: [], decls: [], assigns: [], guards: [], consts: [], lambdas: [], branches: [] });

export interface Syntax {
  facts(source: string): Facts;
}
