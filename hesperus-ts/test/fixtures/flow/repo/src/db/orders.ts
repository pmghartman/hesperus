import { Pool } from "pg";
const pool = new Pool();
export async function saveOrder(receipt: { id: string }) {
  const r = await pool.query("INSERT INTO orders (receipt) VALUES ($1) RETURNING id", [receipt.id]);
  return r.rows[0].id as number;
}
