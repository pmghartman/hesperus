// What a language frontend supplies: which files it owns, the editor extension whose language server
// resolves them, and syntax facts. Core stays language-free; implementations live in src/lang.
import { Syntax } from "./syntax";

export interface Frontend {
  id: string;
  /** Lowercase file extensions without the dot. */
  extensions: readonly string[];
  /** The editor extension that answers symbol and reference queries for these files. */
  editor: { id: string; name: string };
  /** Loads grammars; `syntax` needs it first. */
  init(): Promise<void>;
  /** Syntax provider for a repo-relative path this frontend owns. */
  syntax(path: string): Syntax | undefined;
}

export function extension(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  // ASCII-only lowercasing, so non-ASCII extensions never match by accident.
  return dot > 0 ? name.slice(dot + 1).replace(/[A-Z]/g, (c) => c.toLowerCase()) : undefined;
}
