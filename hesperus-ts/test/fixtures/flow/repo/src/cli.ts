#!/usr/bin/env node
import { findUsers } from "./db/users";
async function main() {
  const users = await findUsers(process.argv[2]);
  console.log(users.length);
}
main();
