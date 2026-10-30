export function connect(url: string) {
  const a = new WebSocket("wss://stream.example.com/feed");
  const b = new WebSocket(url);
  const c = new WebSocket("ws://localhost:8080");
  return [a, b, c];
}
