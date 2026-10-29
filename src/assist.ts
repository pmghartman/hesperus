// The Ask button: hands what Hesperus knows about the repo to an AI assistant the editor already has
// (Copilot Chat, Claude Code, Cline, Roo Code, Continue, Kilo Code). Nothing is called directly: the
// prompt goes to the assistant's own chat through its commands, or onto the clipboard when it has no
// command that takes text. The one chosen is a user setting, so it holds across sessions.
import * as vscode from "vscode";

export interface Assistant {
  id: string;
  label: string;
  /** The editor extension that provides it. */
  extension: string;
  /** Ways in, tried in order: the first command the editor knows. `query` ones take the prompt. */
  open: { command: string; query?: boolean }[];
}

export const ASSISTANTS: readonly Assistant[] = [
  { id: "copilot", label: "GitHub Copilot", extension: "GitHub.copilot-chat", open: [{ command: "workbench.action.chat.open", query: true }] },
  { id: "claude-code", label: "Claude Code", extension: "anthropic.claude-code", open: [{ command: "claude-vscode.sidebar.open" }, { command: "claude-vscode.editor.openLast" }, { command: "claude-vscode.focus" }] },
  { id: "cline", label: "Cline", extension: "saoudrizwan.claude-dev", open: [{ command: "cline.focusChatInput" }, { command: "cline.plusButtonClicked" }] },
  { id: "roo", label: "Roo Code", extension: "RooVeterinaryInc.roo-cline", open: [{ command: "roo-cline.focusInput" }, { command: "roo-cline.plusButtonClicked" }] },
  { id: "continue", label: "Continue", extension: "Continue.continue", open: [{ command: "continue.sendMainUserInput", query: true }, { command: "continue.focusContinueInput" }] },
  { id: "kilo", label: "Kilo Code", extension: "kilocode.Kilo-Code", open: [{ command: "kilo-code.focusChatInput" }, { command: "kilo-code.plusButtonClicked" }] },
];

export const SETTING = "assistant";

/** The assistants whose extension is installed, in the table's order. */
export const detected = (): Assistant[] => ASSISTANTS.filter((a) => vscode.extensions.getExtension(a.extension) !== undefined);

/** The chosen assistant's id from user settings, or undefined for the first one installed. */
export const chosen = (): string | undefined => vscode.workspace.getConfiguration("hesperus").get<string>(SETTING) || undefined;

export async function choose(id: string): Promise<void> {
  await vscode.workspace.getConfiguration("hesperus").update(SETTING, id, vscode.ConfigurationTarget.Global);
}

/** Sends `prompt` to the chosen assistant (or the first installed), and says what happened. The prompt
 *  is always put on the clipboard too, so an assistant with no text command still gets it by paste. */
export async function ask(prompt: string): Promise<string> {
  const have = detected();
  const a = have.find((x) => x.id === chosen()) ?? have[0];
  await vscode.env.clipboard.writeText(prompt);
  if (!a) {
    const note = "No AI assistant extension found (Copilot Chat, Claude Code, Cline, Roo Code, Continue, Kilo Code). The prompt is on the clipboard.";
    void vscode.window.showInformationMessage(`Hesperus: ${note}`);
    return note;
  }
  const known = new Set(await vscode.commands.getCommands(true));
  for (const way of a.open) {
    if (!known.has(way.command)) continue;
    try {
      if (way.query) {
        await vscode.commands.executeCommand(way.command, way.command === "workbench.action.chat.open" ? { query: prompt } : prompt);
        return `Sent to ${a.label}.`;
      }
      await vscode.commands.executeCommand(way.command);
      void vscode.window.showInformationMessage(`Hesperus copied the prompt; paste it into ${a.label}.`);
      return `Prompt copied; paste it into ${a.label}.`;
    } catch {
      // The next way in, or the clipboard.
    }
  }
  void vscode.window.showInformationMessage(`Hesperus could not open ${a.label}; the prompt is on the clipboard.`);
  return `Could not open ${a.label}; the prompt is on the clipboard.`;
}
