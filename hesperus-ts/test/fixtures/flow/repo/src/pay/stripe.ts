export async function charge(amount: number) {
  const res = await fetch("https://api.stripe.com/v1/charges", { method: "POST", body: String(amount) });
  return (await res.json()) as { id: string };
}
