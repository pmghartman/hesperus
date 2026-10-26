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

export interface Facts {
  calls: CallSite[];
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
}

export const noFacts = (): Facts => ({ calls: [], params: [], decls: [], assigns: [], guards: [], consts: [], lambdas: [] });

export interface Syntax {
  facts(source: string): Facts;
}
