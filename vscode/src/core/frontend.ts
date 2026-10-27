// What a language frontend supplies: which files it owns, the editor extension whose language server
// resolves them, and syntax facts. Core stays language-free; implementations live in src/lang.
import { Imports, Syntax } from "./syntax";

export interface Frontend {
  id: string;
  /** Lowercase file extensions without the dot. */
  extensions: readonly string[];
  /** The editor extension that answers symbol and reference queries for these files. */
  editor: { id: string; name: string };
  /** A declaration and its definition live in different files (C/C++ headers) and are one symbol. */
  declarationsAcrossFiles?: boolean;
  /** Loads grammars; `syntax` needs it first. */
  init(): Promise<void>;
  /** Syntax provider for a repo-relative path this frontend owns. */
  syntax(path: string): Syntax | undefined;
  /** How this language's imports name what they reach; without it, unresolved calls stay unresolved. */
  imports?: Imports;
}

export function extension(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  // ASCII-only lowercasing, so non-ASCII extensions never match by accident.
  return dot > 0 ? name.slice(dot + 1).replace(/[A-Z]/g, (c) => c.toLowerCase()) : undefined;
}
