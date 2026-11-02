import { Pool } from "pg";
const pool = new Pool();
export async function findUsers(q: string | undefined) {
  const r = await pool.query("SELECT id, name FROM users WHERE name LIKE $1", [q ?? "%"]);
  return r.rows as { id: number; name: string }[];
}
