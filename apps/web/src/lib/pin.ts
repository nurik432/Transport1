import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { LOCK_AFTER_MS, isValidPin, registerPinFailure } from "@transport/domain";
import { db, schema } from "./db";
import { SESSION_COOKIE, currentSessionToken, verifyOwnPassword } from "./auth";

export type PinResult = { ok: true } | { ok: false; error: string; loggedOut?: boolean };

const BAD_PIN = "PIN — ровно 4 цифры";

async function sessionRow() {
  const token = await currentSessionToken();
  if (!token) return null;
  const rows = await db
    .select({ id: schema.sessions.id, remember: schema.sessions.remember, pinHash: schema.sessions.pinHash, attempts: schema.sessions.pinAttempts })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, token))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Set or change the PIN of this device. Only "remember me" sessions may have one
 * (a short session has nothing to lock). Changing an existing PIN asks for the
 * account password, so someone holding an unlocked phone can't swap it.
 */
export async function setPin(pin: string, currentPassword?: string): Promise<PinResult> {
  const row = await sessionRow();
  if (!row) return { ok: false, error: "Сессия не найдена" };
  if (!row.remember) return { ok: false, error: "PIN доступен только при входе с «Запомнить меня»" };
  if (!isValidPin(pin)) return { ok: false, error: BAD_PIN };
  if (row.pinHash && !(await verifyOwnPassword(currentPassword ?? ""))) return { ok: false, error: "Неверный пароль" };

  await db
    .update(schema.sessions)
    .set({ pinHash: await bcrypt.hash(pin, 10), pinAttempts: 0, unlockedAt: new Date() })
    .where(eq(schema.sessions.id, row.id));
  return { ok: true };
}

/** Remove the PIN of this device; needs the account password. */
export async function removePin(currentPassword: string): Promise<PinResult> {
  const row = await sessionRow();
  if (!row) return { ok: false, error: "Сессия не найдена" };
  if (!(await verifyOwnPassword(currentPassword))) return { ok: false, error: "Неверный пароль" };
  await db.update(schema.sessions).set({ pinHash: null, pinAttempts: 0 }).where(eq(schema.sessions.id, row.id));
  return { ok: true };
}

/** Check the PIN and unlock. Too many wrong tries end the session: the password is required again. */
export async function unlockWithPin(pin: string): Promise<PinResult> {
  const row = await sessionRow();
  if (!row) return { ok: false, error: "Сессия истекла", loggedOut: true };
  if (!row.pinHash) return { ok: true };
  if (!isValidPin(pin)) return { ok: false, error: BAD_PIN };

  if (await bcrypt.compare(pin, row.pinHash)) {
    await db.update(schema.sessions).set({ pinAttempts: 0, unlockedAt: new Date() }).where(eq(schema.sessions.id, row.id));
    return { ok: true };
  }

  const failure = registerPinFailure(row.attempts);
  if (failure.exhausted) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, row.id));
    (await cookies()).delete(SESSION_COOKIE);
    return { ok: false, error: "Слишком много попыток. Войдите по паролю", loggedOut: true };
  }
  await db.update(schema.sessions).set({ pinAttempts: failure.attempts }).where(eq(schema.sessions.id, row.id));
  return { ok: false, error: `Неверный PIN. Осталось попыток: ${failure.attemptsLeft}` };
}

/** Lock this device now (idle timeout on the client). No-op without a PIN. */
export async function lockSession(): Promise<void> {
  const token = await currentSessionToken();
  if (!token) return;
  await db.update(schema.sessions).set({ unlockedAt: null }).where(and(eq(schema.sessions.id, token), isNotNull(schema.sessions.pinHash)));
}

/**
 * Record activity so the idle timer restarts. Only extends a session that is
 * still unlocked — a locked one can be opened with the PIN alone.
 */
export async function touchSession(): Promise<void> {
  const token = await currentSessionToken();
  if (!token) return;
  await db
    .update(schema.sessions)
    .set({ unlockedAt: new Date() })
    .where(
      and(
        eq(schema.sessions.id, token),
        isNotNull(schema.sessions.pinHash),
        gt(schema.sessions.unlockedAt, new Date(Date.now() - LOCK_AFTER_MS)),
      ),
    );
}
