import { Pool } from "pg";
const pool = new Pool();
export async function list(_req: unknown, res: { json(v: unknown): void }) {
  res.json((await pool.query("SELECT * FROM items")).rows);
}
export async function create(req: { body: { name: string } }, res: { json(v: unknown): void }) {
  await pool.query("INSERT INTO items (name) VALUES ($1)", [req.body.name]);
  res.json({ ok: true });
}
