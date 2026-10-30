import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export const list = () => prisma.user.findMany();
export const make = () => prisma.user.create({ data: {} });
