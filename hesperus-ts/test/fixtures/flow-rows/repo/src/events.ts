import { EventEmitter } from "node:events";
export const bus = new EventEmitter();
export function onCreated(n: number) {
  console.log("created", n, process.env.PORT);
}
