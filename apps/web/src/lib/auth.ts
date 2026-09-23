import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "./db";

export const SESSION_COOKIE = "transport_session";
const SESSION_DAYS = 30;

export type Role = "passenger" | "driver" | "admin";

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  status: "active" | "blocked";
}

/** Home route for each role. */
export const HOME_BY_ROLE: Record<Role, string> = {
  passenger: "/app",
  driver: "/driver",
  admin: "/admin",
};

/** Current user, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      phone: schema.users.phone,
      role: schema.users.role,
      status: schema.users.status,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, token), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0];
  if (!user || user.status === "blocked") return null;
  return user as SessionUser;
});

/** Require any signed-in user. Redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  // proxy.ts only checks that the cookie exists, so a stale/invalid one still
  // gets this far. Route through /logout (a Route Handler) to clear it,
  // otherwise the cookie survives and proxy.ts bounces /login back to /.
  if (!user) redirect("/logout");
  return user;
}

/** Require one of the roles; sends other roles to their own home. */
export async function requireRole<R extends Role>(...roles: R[]): Promise<SessionUser & { role: R }> {
  const user = await requireUser();
  if (!roles.includes(user.role as R)) redirect(HOME_BY_ROLE[user.role]);
  return user as SessionUser & { role: R };
}

export type LoginResult = { ok: true; role: Role } | { ok: false; error: string };

/** Verify credentials and start a session. Phone is matched loosely (digits only). */
export async function login(phoneInput: string, password: string): Promise<LoginResult> {
  const digits = phoneInput.replace(/\D/g, "");
  if (!digits || !password) return { ok: false, error: "Введите телефон и пароль" };

  const candidates = await db
    .select({
      id: schema.users.id,
      phone: schema.users.phone,
      role: schema.users.role,
      status: schema.users.status,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users);
  const user = candidates.find((u) => u.phone.replace(/\D/g, "").endsWith(digits) && digits.length >= 6);
  if (!user) return { ok: false, error: "Пользователь не найден" };
  if (user.status === "blocked") return { ok: false, error: "Доступ заблокирован. Обратитесь к администратору" };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false, error: "Неверный пароль" };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ id: token, userId: user.id, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return { ok: true, role: user.role as Role };
}

/** End the current session. */
export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
  store.delete(SESSION_COOKIE);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
