import { findUsers } from "../db/users";
import { audit } from "./audit";
export async function listUsers(req: { query: { q?: string } }, res: { json(v: unknown): void }) {
  const users = await findUsers(req.query.q);
  audit("list", users.length);
  res.json(users);
}
