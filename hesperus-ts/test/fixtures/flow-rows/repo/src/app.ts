import express, { Router } from "express";
import { EventEmitter } from "node:events";
import { auth } from "./auth";
import { list, create } from "./items";
import { bus, onCreated } from "./events";
const app = express();
const api = Router();
api.get("/items", list);
api.post("/items", auth, create);
app.use("/api", api);
app.get("/health", (_req, res) => res.json({ ok: true }));
setInterval(sweep, 60000);
function sweep() {
  bus.emit("created", 0);
}
const local = new EventEmitter();
local.on("tick", sweep);
bus.on("created", onCreated);
app.listen(Number(process.env.PORT ?? 3000));
