// What core needs from a language's syntax. Implementations live in src/lang.
import { Range } from "./ir";

export interface CallSite {
  /** Name token of the callee when there is one, else the whole callee expression. */
  callee: Range;
  callee_text: string;
  args: Range[];
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

export interface Facts {
  calls: CallSite[];
  params: ParamDecl[];
  /** Full ranges of named function/method declarations. */
  decls: Range[];
}

export const noFacts = (): Facts => ({ calls: [], params: [], decls: [] });

export interface Syntax {
  facts(source: string): Facts;
}
