import { MongoClient } from "mongodb";
const c = new MongoClient("mongodb://db");
export async function go() {
  const col = c.db("x").collection("y");
  await col.find({}).toArray();
  await col.insertOne({});
}
