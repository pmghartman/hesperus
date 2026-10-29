import * as fs from "node:fs";
import * as path from "node:path";

/** The directory holding package.json, grammars/ and schema/: the package from out/, or the bundle's
 *  own folder (dist/) when the grammars sit beside the code. */
export const PKG_ROOT = fs.existsSync(path.join(__dirname, "grammars")) ? __dirname : path.resolve(__dirname, "..");
