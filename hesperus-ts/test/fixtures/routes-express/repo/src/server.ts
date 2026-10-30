import express, { Router } from "express";
import { users } from "./users";
const app = express();
const r = Router();
r.get("/users", users);
r.post("/users", users);
app.use("/api", r);
app.delete("/api/users/:id", users);
app.listen(3000);
