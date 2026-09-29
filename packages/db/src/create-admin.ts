import "dotenv/config";
import bcrypt from "bcryptjs";
import { createDb } from "./client";
import * as s from "./schema";

/*
 * Creates the first real administrator on an empty database — the alternative
 * to `seed`, which fills the database with fictional Khujand data instead.
 * Refuses if any user already exists, so it can't create a second admin by
 * accident; use the admin panel for that once the first one can log in.
 */
async function main() {
  const db = createDb();

  const name = process.env.ADMIN_NAME;
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !phone || !password) {
    console.error("usage: ADMIN_NAME=... ADMIN_PHONE=... ADMIN_PASSWORD=... pnpm db:create-admin");
    process.exit(1);
  }

  const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (existing.length) {
    console.log("database already has users; create-admin only runs on an empty database");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(s.users).values({ name, phone, role: "admin", passwordHash });

  console.log(`admin created: ${phone}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
