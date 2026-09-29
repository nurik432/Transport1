import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { createDb } from "./client";
import * as s from "./schema";

/*
 * Creates an administrator from the command line — for the first real launch,
 * the alternative to `seed`, which fills the database with fictional Khujand data.
 *
 * Default mode: an ordinary admin on an EMPTY database only, so it can't create
 * one by accident; use the admin panel for further admins.
 *
 * ADMIN_SUPER=1: the superadmin, the only account that creates, blocks and resets
 * other admins in the panel. Works on any database (so it also fixes one that was
 * seeded): an existing user with this phone is promoted and gets the new password,
 * otherwise the account is created. There is exactly one superadmin — the script
 * refuses if a different phone already holds it. Running it again with the same
 * phone resets that password, which is the way back in if it is forgotten.
 */
async function main() {
  const db = createDb();

  const name = process.env.ADMIN_NAME;
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  const isSuper = process.env.ADMIN_SUPER === "1";
  if (!name || !phone || !password) {
    console.error("usage: ADMIN_NAME=... ADMIN_PHONE=... ADMIN_PASSWORD=... [ADMIN_SUPER=1] pnpm db:create-admin");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (!isSuper) {
    const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
    if (existing.length) {
      console.log("database already has users; create-admin only runs on an empty database (use ADMIN_SUPER=1 for the superadmin)");
      process.exit(1);
    }
    await db.insert(s.users).values({ name, phone, role: "admin", passwordHash });
    console.log(`admin created: ${phone}`);
    process.exit(0);
  }

  const otherSuper = await db
    .select({ phone: s.users.phone })
    .from(s.users)
    .where(and(eq(s.users.isSuper, true), ne(s.users.phone, phone)))
    .limit(1);
  if (otherSuper.length) {
    console.log(`superadmin already exists (${otherSuper[0]!.phone}); refusing to create a second one`);
    process.exit(1);
  }

  const [user] = await db.select({ id: s.users.id, role: s.users.role }).from(s.users).where(eq(s.users.phone, phone)).limit(1);
  if (user) {
    // A superadmin is an admin; drivers and passengers keep their own rows, so
    // refuse to silently turn one of them into an admin.
    if (user.role !== "admin") {
      console.log(`${phone} is a ${user.role}; pick another phone or remove that account first`);
      process.exit(1);
    }
    await db.update(s.users).set({ name, passwordHash, isSuper: true, status: "active" }).where(eq(s.users.id, user.id));
    await db.delete(s.sessions).where(eq(s.sessions.userId, user.id));
    console.log(`superadmin updated: ${phone}`);
  } else {
    await db.insert(s.users).values({ name, phone, role: "admin", passwordHash, isSuper: true });
    console.log(`superadmin created: ${phone}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
