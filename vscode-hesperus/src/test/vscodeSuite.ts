// Runs inside VS Code: the extension activates for .hesp files and registers its commands.
import * as assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";

export async function run(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "workspace open");
  const doc = await vscode.workspace.openTextDocument(path.join(folder.uri.fsPath, "phosphorus.hesp"));
  assert.equal(doc.languageId, "hesperus");
  await vscode.window.showTextDocument(doc);
  const ext = vscode.extensions.getExtension("pmghartman.vscode-hesperus");
  assert.ok(ext, "extension found");
  await ext.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const c of ["hesperus.openViewer", "hesperus.emit", "hesperus.restartServer"]) assert.ok(commands.includes(c), c);
  await vscode.commands.executeCommand("hesperus.openViewer");
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.label === "Hesperus")), "viewer panel opened");
}
