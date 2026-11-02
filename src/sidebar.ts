// The Hesperus sidebar: the intent, the actual, and how they differ. Empty (so VS Code shows
// the welcome with the Create Intent From Code button) while the workspace has no intent.

import * as path from "node:path";
import * as vscode from "vscode";

export interface StatusData {
  error?: string;
  intentPath?: string;
  actualDir?: string;
  actual: unknown;
  unified: { summary: { match: number; intent_only: number; actual_only: number; conflict: number; violations: number } } | null;
}

const ROWS: { key: keyof NonNullable<StatusData["unified"]>["summary"]; label: string; icon: string; color: string; tip: string }[] = [
  { key: "match", label: "Match", icon: "pass", color: "charts.green", tip: "Declared and built" },
  { key: "intent_only", label: "Intent only", icon: "circle-large-outline", color: "charts.blue", tip: "Declared, not built yet: work to do" },
  { key: "actual_only", label: "Actual only", icon: "diff-added", color: "charts.yellow", tip: "Built, not declared: drift" },
  { key: "conflict", label: "Conflict", icon: "warning", color: "charts.orange", tip: "Declared and built differently" },
  { key: "violations", label: "Violations", icon: "error", color: "charts.red", tip: "require / forbid lines the code breaks" },
];

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
    if (d.actual && d.actualDir) {
      const actual = path.join(d.actualDir, path.basename(d.intentPath));
      items.push(row("Actual", rel(actual), "file-code", undefined, "Generated from the code; never edited", { command: "vscode.open", title: "Open", arguments: [vscode.Uri.file(actual)] }));
    } else {
      items.push(row("Actual", "not emitted: click to emit", "circle-slash", undefined, "Hesperus: Emit Actual From Code", { command: "hesperus.emit", title: "Emit" }));
    }
    if (d.error) items.push(row(d.error.split("\n")[0], "", "error", "errorForeground", d.error));
    if (d.unified) {
      const viewer = { command: "hesperus.openViewer", title: "Open Viewer" };
      for (const r of ROWS) items.push(row(r.label, String(d.unified.summary[r.key]), r.icon, r.color, r.tip, viewer));
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
