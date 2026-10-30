// Per-file detection = the TypeScript frontend (facts.ts) run through the rule table
// (rules.ts) by the engine (engine.ts). Kept as the module name the rest of the
// extractor imports.

import { Project } from "ts-morph";
import { applyRules, Finding } from "./engine.js";
import { factsOf } from "./facts.js";

export { classifyUrl, sqlAccess } from "./engine.js";
export { newProject } from "./facts.js";
export type { Finding } from "./engine.js";

export function analyze(project: Project, relPath: string, text: string): Finding[] {
  return applyRules(factsOf(project, relPath, text));
}
