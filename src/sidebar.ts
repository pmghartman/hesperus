// The Hesperus sidebar: the intent, the flow and what it found. Empty (so VS Code shows
// the welcome with the Create Intent From Code button) while the workspace has no intent.

import * as path from "node:path";
import * as vscode from "vscode";

export interface StatusData {
  error?: string;
  intentPath?: string;
  flowPath?: string;
  flow: { entries: { kind: string }[]; constraints: { satisfied: boolean }[] } | null;
}

export class StatusView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly load: () => Promise<StatusData | null>) {}

  /** Coalesce bursts (an emit writes many files) into one reload. */
  refresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.changed.fire(), 300);
  }

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    return item;
  }

  async getChildren(parent?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (parent) return [];
    const d = await this.load();
    if (!d?.intentPath) return [];
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const rel = (f: string) => path.relative(root, f) || f;
    const items: vscode.TreeItem[] = [];
    items.push(row("Intent", rel(d.intentPath), "file", undefined, d.intentPath, { command: "vscode.open", title: "Open", arguments: [vscode.Uri.file(d.intentPath)] }));
    if (d.flow && d.flowPath) {
      items.push(row("Flow", rel(d.flowPath), "file-code", undefined, "Generated from the code; never edited", { command: "vscode.open", title: "Open", arguments: [vscode.Uri.file(d.flowPath)] }));
    } else {
      items.push(row("Flow", "not emitted: click to emit", "circle-slash", undefined, "Hesperus: Emit From Code", { command: "hesperus.emit", title: "Emit" }));
    }
    if (d.error) items.push(row(d.error.split("\n")[0], "", "error", "errorForeground", d.error));
    if (d.flow) {
      const viewer = { command: "hesperus.openViewer", title: "Open Viewer" };
      const kinds = new Map<string, number>();
      for (const e of d.flow.entries) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
      const byKind = [...kinds].map(([k, n]) => `${n} ${k}`).join(", ");
      items.push(row("Entry points", String(d.flow.entries.length), "debug-start", "charts.blue", byKind || "none found", viewer));
      const violations = d.flow.constraints.filter((c) => !c.satisfied).length;
      if (d.flow.constraints.length) items.push(row("Violations", `${violations} of ${d.flow.constraints.length}`, violations ? "error" : "pass", violations ? "charts.red" : "charts.green", "require / forbid lines checked against every function", viewer));
    }
    return items;
  }
}

function row(label: string, description: string, icon: string, color: string | undefined, tooltip: string, command?: vscode.Command): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.iconPath = new vscode.ThemeIcon(icon, color ? new vscode.ThemeColor(color) : undefined);
  item.tooltip = tooltip;
  item.command = command;
  return item;
}
