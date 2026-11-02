export const routes = {
  "/api/status": () => Response.json({ ok: true }),
  "/api/users": { GET: listUsers, POST: addUser },
};
function listUsers() {
  return Response.json(["a"]);
}
async function addUser(req: Request) {
  await fetch("https://hooks.example.com/notify", { method: "POST", body: await req.text() });
  return Response.json({ ok: true });
}
