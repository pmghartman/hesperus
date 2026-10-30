import { Database } from "bun:sqlite";
const db = new Database("x.db");
export const rows = () => db.query("select * from t").all();
export const add = () => db.run("insert into t values (1)");
