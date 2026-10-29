// One question to a model the machine already has, answered as text. Tried in order: the editor's own
// language-model API (Copilot Chat and any extension that registers a model; the editor asks the user
// for consent the first time), then the Claude Code CLI in print mode. Nothing is called over the
// network by Hesperus itself: the editor or the CLI makes the request under its own account and
// policy. No model, no answer: the caller says so and falls back to handing the prompt to a chat.
import * as vscode from "vscode";
import { spawn } from "node:child_process";

export interface Answer { text: string; via: string }

/** Which way to ask: `auto` tries each in turn. */
export type Route = "auto" | "editor" | "claude-cli" | "chat";

export const route = (): Route => (vscode.workspace.getConfiguration("hesperus").get<string>("explainWith", "auto") as Route) || "auto";

const CLI_MS = 240000;

/** The editor's language models: the first that answers. Prefers a Claude model when one is offered. */
async function viaEditor(prompt: string, token: vscode.CancellationToken, log: (s: string) => void): Promise<Answer | undefined> {
  const lm = (vscode as unknown as { lm?: { selectChatModels?: (sel?: object) => Thenable<vscode.LanguageModelChat[]> } }).lm;
  if (!lm?.selectChatModels) return undefined;
  let models: vscode.LanguageModelChat[] = [];
  try {
    models = await lm.selectChatModels({});
  } catch (e) {
    log(`editor models: ${(e as Error).message}`);
    return undefined;
  }
  if (!models.length) return undefined;
  const rank = (m: vscode.LanguageModelChat) => (/claude/i.test(m.family + m.name + m.id) ? 0 : /gpt-4|o[0-9]|gemini/i.test(m.family) ? 1 : 2);
  models.sort((a, b) => rank(a) - rank(b));
  for (const m of models.slice(0, 2)) {
    try {
      const res = await m.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
      let text = "";
      for await (const part of res.text) text += part;
      if (text.trim()) return { text, via: `${m.vendor}/${m.name}` };
    } catch (e) {
      // NoPermissions (the user declined), Blocked, or a quota: the next model, or the CLI.
      log(`editor model ${m.name}: ${(e as Error).message}`);
    }
  }
  return undefined;
}

/** `claude -p`, the prompt on stdin, the answer as JSON on stdout. Needs the Claude Code CLI on PATH. */
function viaClaudeCli(prompt: string, cwd: string | undefined, token: vscode.CancellationToken, log: (s: string) => void): Promise<Answer | undefined> {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const finish = (a: Answer | undefined) => { if (!done) (done = true), resolve(a); };
    let p: ReturnType<typeof spawn>;
    try {
      // No tools: the answer is read from the prompt alone, and the CLI must not touch the repo.
      p = spawn("claude", ["-p", "--output-format", "json", "--tools", ""], { cwd, shell: process.platform === "win32", windowsHide: true, env: { ...process.env, CLAUDECODE: "" } });
    } catch (e) {
      log(`claude cli: ${(e as Error).message}`);
      return finish(undefined);
    }
    const timer = setTimeout(() => (p.kill(), finish(undefined)), CLI_MS);
    token.onCancellationRequested(() => (p.kill(), finish(undefined)));
    p.on("error", (e) => (log(`claude cli: ${e.message}`), clearTimeout(timer), finish(undefined)));
    p.stdout?.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => (err += d));
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        log(`claude cli exited ${code}: ${err.trim().slice(0, 400)}`);
        return finish(undefined);
      }
      try {
        const j = JSON.parse(out) as { result?: unknown; is_error?: boolean };
        if (!j.is_error && typeof j.result === "string" && j.result.trim()) return finish({ text: j.result, via: "claude-cli" });
      } catch {}
      // Not JSON: an older CLI prints the text itself.
      finish(out.trim() ? { text: out, via: "claude-cli" } : undefined);
    });
    p.stdin?.end(prompt);
  });
}

/** The answer, or undefined when no model could be reached; `log` says why. */
export async function infer(prompt: string, cwd: string | undefined, token: vscode.CancellationToken, log: (s: string) => void): Promise<Answer | undefined> {
  const r = route();
  if (r === "chat") return undefined;
  if (r === "auto" || r === "editor") {
    const a = await viaEditor(prompt, token, log);
    if (a || r === "editor" || token.isCancellationRequested) return a;
  }
  return viaClaudeCli(prompt, cwd, token, log);
}
