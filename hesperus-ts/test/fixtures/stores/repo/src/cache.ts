import Redis from "ioredis";
const r = new Redis();
export const get = (k: string) => r.get(k);
export const put = (k: string, v: string) => r.set(k, v);
