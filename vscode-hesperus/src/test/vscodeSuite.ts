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
  // point the extension at the binaries this checkout built
  const repo = path.resolve(__dirname, "..", "..", "..");
  const cfg = vscode.workspace.getConfiguration("hesperus");
  await cfg.update("hespPath", path.join(repo, "target", "release", "hesp"), vscode.ConfigurationTarget.Global);
  await cfg.update("serverPath", path.join(repo, "target", "release", "hesperus-lsp"), vscode.ConfigurationTarget.Global);
  const ext = vscode.extensions.getExtension("pmghartman.vscode-hesperus");
  assert.ok(ext, "extension found");
  await ext.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const c of ["hesperus.openViewer", "hesperus.emit", "hesperus.restartServer"]) assert.ok(commands.includes(c), c);
  await vscode.commands.executeCommand("hesperus.openViewer");
  await new Promise((r) => setTimeout(r, 2500));
  assert.ok(vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.label === "Hesperus")), "viewer panel opened");
  // the language server answers: hover over the system name in the master (wait for it to come up)
  await vscode.commands.executeCommand("hesperus.restartServer");
  let hovers: vscode.Hover[] = [];
  for (let i = 0; i < 20 && hovers.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 500));
    hovers = (await vscode.commands.executeCommand("vscode.executeHoverProvider", doc.uri, new vscode.Position(2, 8))) as vscode.Hover[];
  }
  assert.ok(hovers.length > 0, "hover from hesperus-lsp");
  // and the formatter reports a tidy file as tidy
  const edits = (await vscode.commands.executeCommand("vscode.executeFormatDocumentProvider", doc.uri, { tabSize: 2, insertSpaces: true })) as vscode.TextEdit[] | undefined;
  assert.ok(!edits || edits.length === 0, "formatted file needs no edits");
}
