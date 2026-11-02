import express from "express";
import { listUsers } from "./handlers/users";
import { createOrder } from "./handlers/orders";
const app = express();
app.get("/users", listUsers);
app.post("/orders", createOrder);
app.get("/health", (_req, res) => {
  res.json(health());
});
function health() {
  return { ok: true };
}
app.listen(3000);
