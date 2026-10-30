// Optional: activation smoke test inside a real VS Code (downloads VS Code; run with npm run test:vscode).
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "vscodeSuite.js");
  const workspace = path.resolve(extensionDevelopmentPath, "..", "examples", "phosphorus");
  await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [workspace, "--disable-extensions"] });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
