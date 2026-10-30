import { websocket } from "./ws";
Bun.serve({
  port: 80,
  websocket,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/api/health") return new Response("ok");
    if (url.pathname.startsWith("/api/files/")) return new Response("f");
    switch (url.pathname) {
      case "/api/users":
        return new Response("u");
      case "/api/login":
        return new Response("l");
    }
    if (server.upgrade(req)) return;
    return new Response("404", { status: 404 });
  },
});
