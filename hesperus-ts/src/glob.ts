// A small glob matcher for binding globs: `**`, `*`, `?` and `{a,b}` over `/`-separated
// paths. Written here so one function owns binding semantics (see DECISIONS.md).

export interface Glob {
  source: string;
  regex: RegExp;
  /** Characters before the first wildcard: the binding's specificity. */
  literalPrefix: string;
}

export function compileGlob(source: string): Glob {
  let pattern = source.replace(/\\/g, "/").replace(/^\.\//, "");
  const wild = pattern.search(/[*?{\[]/);
  const literalPrefix = wild < 0 ? pattern : pattern.slice(0, wild);
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // `**/` matches zero or more directories; a trailing `**` matches everything
        if (pattern[i + 2] === "/") {
          re += "(?:[^/]+/)*";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else if (c === "{") {
      const close = pattern.indexOf("}", i);
      if (close < 0) {
        re += "\\{";
        i += 1;
      } else {
        const alts = pattern.slice(i + 1, close).split(",").map(escape);
        re += "(?:" + alts.join("|") + ")";
        i = close + 1;
      }
    } else {
      re += escape(c);
      i += 1;
    }
  }
  return { source, regex: new RegExp("^" + re + "$"), literalPrefix };
}

function escape(s: string): string {
  return s.replace(/[.+^$()|[\]\\]/g, "\\$&");
}

export function globMatch(glob: Glob, path: string): boolean {
  return glob.regex.test(path.replace(/\\/g, "/").replace(/^\.\//, ""));
}
