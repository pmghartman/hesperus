import { appendFileSync } from "node:fs";
export function audit(what: string, n: number) {
  appendFileSync("audit.log", `${what} ${n}\n`);
}
