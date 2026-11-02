import { routes } from "./routes";
Bun.serve({
  port: 8080,
  routes,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/legacy") return new Response("old");
    return new Response("404", { status: 404 });
  },
});
