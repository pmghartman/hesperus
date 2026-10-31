// Optional: activation smoke test inside a real VS Code (downloads VS Code; run with npm run test:vscode).
import * as path from "node:path";
import * as fs from "node:fs";
import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron";

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "vscodeSuite.js");
  const workspace = path.resolve(extensionDevelopmentPath, "crates/hesperus-core/tests/fixtures/phosphorus");
  // newer macOS builds ship `Contents/MacOS/Code`, which @vscode/test-electron 2.5 still calls `Electron`
  let vscodeExecutablePath = await downloadAndUnzipVSCode();
  if (!fs.existsSync(vscodeExecutablePath)) {
    const alt = vscodeExecutablePath.replace(/\/Electron$/, "/Code");
    if (fs.existsSync(alt)) vscodeExecutablePath = alt;
  }
  await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath, launchArgs: [workspace, "--disable-extensions"] });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
