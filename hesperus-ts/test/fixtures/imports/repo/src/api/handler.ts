import { id } from "@app/util";
import { fmt } from "@lib/format";
import type { Shape } from "../web/shapes";
import { helper } from "./helper.js";
import * as web from "../web";
export { fmt as f } from "@lib/format";
export async function run() {
  const m = await import("../web/lazy");
  return id(fmt(helper(), web.x, m.y as Shape));
}
export async function plugin(name: string) {
  return import(name);
}
