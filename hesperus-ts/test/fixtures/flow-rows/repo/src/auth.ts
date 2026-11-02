export function auth(req: { headers: Record<string, string> }, _res: unknown, next: () => void) {
  if (req.headers.authorization === process.env.API_TOKEN) next();
}
