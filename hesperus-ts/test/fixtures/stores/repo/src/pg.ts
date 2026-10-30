import { Pool } from "pg";
const pool = new Pool();
export async function users(dyn: string) {
  await pool.query("SELECT * FROM users");
  await pool.query("INSERT INTO users VALUES ($1)", [1]);
  await pool.query(dyn);
}
