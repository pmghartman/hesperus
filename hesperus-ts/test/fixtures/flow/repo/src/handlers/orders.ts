import { saveOrder } from "../db/orders";
import { charge } from "../pay/stripe";
import { audit } from "./audit";
export const createOrder = async (req: { body: { amount: number } }, res: { json(v: unknown): void }) => {
  const receipt = await charge(req.body.amount);
  const id = await saveOrder(receipt);
  audit("order", id);
  res.json({ id });
};
