// The lint as the editor shows it: Problems entries at call sites, quick fixes to accept a reviewed
// change or open the policy, and a status bar count that is there while the agent works.
import * as vscode from "vscode";
import { Finding, POLICY_FILE, Report, Severity } from "./core/lint";

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

const rangeOf = (f: Finding) => (f.range ? new vscode.Range(f.range.start_line, f.range.start_col, f.range.end_line, f.range.end_col) : new vscode.Range(0, 0, 0, 0));

export class LintSurface implements vscode.CodeActionProvider {
  private diagnostics = vscode.languages.createDiagnosticCollection("hesperus");
  private status = vscode.window.createStatusBarItem("hesperus.status", vscode.StatusBarAlignment.Left, 50);
  private report?: Report;
  private folder?: vscode.Uri;

  constructor(ctx: vscode.ExtensionContext) {
    this.status.name = "Hesperus";
    this.status.command = "hesperus.openGraph";
    ctx.subscriptions.push(this.diagnostics, this.status, vscode.languages.registerCodeActionsProvider({ scheme: "file" }, this, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));
  }

  publish(folder: vscode.Uri, report: Report | undefined, policyError?: string) {
    this.folder = folder;
    this.report = report;
    this.diagnostics.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const f of report?.findings ?? []) {
      if (!f.path) continue;
      const d = new vscode.Diagnostic(rangeOf(f), f.message, SEVERITY[f.severity]);
      d.source = "hesperus";
      d.code = f.rule;
      (byFile.get(f.path) ?? byFile.set(f.path, []).get(f.path)!).push(d);
    }
    if (policyError) {
      const d = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), policyError, vscode.DiagnosticSeverity.Error);
      d.source = "hesperus";
      byFile.set(POLICY_FILE, [d]);
    }
    for (const [p, ds] of byFile) this.diagnostics.set(vscode.Uri.joinPath(folder, p), ds);
    this.show();
  }

  /** Spinner text while indexing; the counts otherwise. */
  busy(label?: string) {
    if (label) {
      this.status.text = `$(sync~spin) Hesperus`;
      this.status.tooltip = label;
      this.status.show();
    } else this.show();
  }

  private show() {
    const fs = this.report?.findings ?? [];
    if (!this.report) return this.status.hide();
    const n = (s: Severity) => fs.filter((f) => f.severity === s).length;
    const [e, w, i] = [n("error"), n("warning"), n("info")];
    const crossings = this.report.crossings.length;
    this.status.text = e || w || i ? `$(type-hierarchy) ${e ? `$(error) ${e} ` : ""}${w ? `$(warning) ${w} ` : ""}${i ? `$(info) ${i}` : ""}`.trimEnd() : `$(type-hierarchy) ${crossings}`;
    this.status.tooltip = e || w || i
      ? `Hesperus: ${e} denied, ${w + i} to review since the last accept. Click to open the graph.`
      : `Hesperus: ${crossings} boundary crossings, all reviewed. Click to open the graph.`;
    this.status.backgroundColor = e ? new vscode.ThemeColor("statusBarItem.errorBackground") : w ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    this.status.show();
  }

  /** The finding behind a diagnostic, by file, start and rule. */
  findingFor(uri: vscode.Uri, d: vscode.Diagnostic): Finding | undefined {
    if (!this.folder || d.source !== "hesperus") return undefined;
    const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
    return this.report?.findings.find((f) => f.path === rel && f.rule === d.code && rangeOf(f).start.isEqual(d.range.start));
  }

  provideCodeActions(doc: vscode.TextDocument, _r: vscode.Range, ctx: vscode.CodeActionContext): vscode.CodeAction[] {
    const out: vscode.CodeAction[] = [];
    for (const d of ctx.diagnostics) {
      const f = this.findingFor(doc.uri, d);
      if (!f) continue;
      if (f.rule === "boundary-denied") {
        const a = new vscode.CodeAction(`Open ${POLICY_FILE}`, vscode.CodeActionKind.QuickFix);
        a.command = { command: "hesperus.policy", title: `Open ${POLICY_FILE}` };
        a.diagnostics = [d];
        out.push(a);
        continue;
      }
      const a = new vscode.CodeAction(f.rule === "new-dependency" ? `Accept ${f.key.split(":").slice(1).join(":")} as a reviewed dependency` : "Accept this crossing as reviewed", vscode.CodeActionKind.QuickFix);
      a.command = { command: "hesperus.acceptKeys", title: "Accept", arguments: [[f.key]] };
      a.diagnostics = [d];
      out.push(a);
    }
    if (out.length) {
      const all = new vscode.CodeAction("Show in the Hesperus graph", vscode.CodeActionKind.QuickFix);
      all.command = { command: "hesperus.showFinding", title: "Show", arguments: [this.findingFor(doc.uri, ctx.diagnostics.find((d) => this.findingFor(doc.uri, d))!)] };
      out.push(all);
    }
    return out;
  }
}
