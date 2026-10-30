import axios from "axios";
import got from "got";
const base = "https://api.stripe.com/v1";
export async function go(id: string, dyn: string) {
  await fetch("https://api.github.com/repos");
  await fetch(`https://api.github.com/repos/${id}`);
  await fetch(`${base}/charges`);
  await axios.get("https://hooks.slack.com/services/x");
  await got("https://example.org/");
  await fetch("/api/local");
  await fetch("http://localhost:3000/health");
  await fetch(dyn);
  await fetch(new URL("https://api.openai.com/v1/models"));
}
