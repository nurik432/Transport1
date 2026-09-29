import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { isLocked, sessionExpiresAt } from "@transport/domain";
import { db, schema } from "./db";

export const SESSION_COOKIE = "transport_session";

export type Role = "passenger" | "driver" | "admin";

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  status: "active" | "blocked";
  /** Superadmin: manages other admins. Always false for non-admins. */
  isSuper: boolean;
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
      isSuper: schema.users.isSuper,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, token), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0];
  if (!user || user.status === "blocked") return null;
  return user as SessionUser;
});

/** Token of the current session cookie, or undefined. */
export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export interface LockState {
  /** This session has a device PIN. */
  pinSet: boolean;
  /** The app must be unlocked with the PIN before use. */
  locked: boolean;
  /** Session was started with "remember me"; only those may set a PIN. */
  remember: boolean;
}

/** PIN and lock state of the current session. Cached per request. */
export const getLockState = cache(async (): Promise<LockState> => {
  const token = await currentSessionToken();
  if (!token) return { pinSet: false, locked: false, remember: false };
  const rows = await db
    .select({ remember: schema.sessions.remember, pinHash: schema.sessions.pinHash, unlockedAt: schema.sessions.unlockedAt })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, token))
    .limit(1);
  const row = rows[0];
  if (!row) return { pinSet: false, locked: false, remember: false };
  return {
    pinSet: Boolean(row.pinHash),
    locked: isLocked({ pinHash: row.pinHash, unlockedAt: row.unlockedAt, now: new Date() }),
    remember: row.remember,
  };
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

/** Require the superadmin; other admins go back to the dashboard. */
export async function requireSuper(): Promise<SessionUser & { role: "admin" }> {
  const user = await requireRole("admin");
  if (!user.isSuper) redirect(HOME_BY_ROLE.admin);
  return user;
}

export type LoginResult = { ok: true; role: Role } | { ok: false; error: string };

/**
 * Verify credentials and start a session. Phone is matched loosely (digits only).
 * With `remember` the session lasts 30 days and its cookie survives the browser;
 * without it the session is short and the cookie is dropped when the browser closes.
 */
export async function login(phoneInput: string, password: string, remember = false): Promise<LoginResult> {
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
  const now = new Date();
  const expiresAt = sessionExpiresAt(remember, now);
  await db.insert(schema.sessions).values({ id: token, userId: user.id, expiresAt, remember, unlockedAt: now });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No `expires` = session cookie, gone when the browser is closed.
    ...(remember ? { expires: expiresAt } : {}),
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

/** Whether `password` is the signed-in user's current password. */
export async function verifyOwnPassword(password: string): Promise<boolean> {
  const user = await requireUser();
  const rows = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  return Boolean(rows[0] && password && (await bcrypt.compare(password, rows[0].passwordHash)));
}

/** Change the signed-in user's own password after checking the current one. */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (newPassword.length < 6) return { ok: false, error: "Новый пароль не короче 6 символов" };

  const rows = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  const valid = rows[0] && (await bcrypt.compare(currentPassword, rows[0].passwordHash));
  if (!valid) return { ok: false, error: "Неверный текущий пароль" };

  await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(schema.users.id, user.id));
  return { ok: true };
}
