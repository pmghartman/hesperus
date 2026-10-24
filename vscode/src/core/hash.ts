import { createHash } from "node:crypto";

export const sha256Hex = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
