import { Pool } from "pg";
const p = new Pool();
export const log = () => p.query("INSERT INTO log VALUES (1)");
