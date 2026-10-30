import { readFileSync } from "node:fs";
import * as fsp from "fs/promises";
export const a = () => readFileSync("x");
export const b = () => fsp.writeFile("y", "z");
