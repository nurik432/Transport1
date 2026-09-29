/**
 * Session length and the device PIN lock. The PIN is a screen lock for the
 * app on a device that stays signed in ("remember me"), not a second factor.
 */

export const REMEMBER_SESSION_DAYS = 30;
/** Without "remember me" the session is short and its cookie dies with the browser. */
export const SHORT_SESSION_HOURS = 12;
/** The app locks after this long without interaction. */
export const LOCK_AFTER_MS = 5 * 60 * 1000;
/** How often activity is written to the session while the user is working. */
export const TOUCH_INTERVAL_MS = 30 * 1000;
export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;

export function sessionExpiresAt(remember: boolean, now: Date): Date {
  const ms = remember ? REMEMBER_SESSION_DAYS * 24 * 3_600_000 : SHORT_SESSION_HOURS * 3_600_000;
  return new Date(now.getTime() + ms);
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export interface LockInput {
  pinHash: string | null;
  unlockedAt: Date | null;
  now: Date;
  lockAfterMs?: number;
}

/** Locked when a PIN is set and the app was never unlocked or has been idle too long. */
export function isLocked({ pinHash, unlockedAt, now, lockAfterMs = LOCK_AFTER_MS }: LockInput): boolean {
  if (!pinHash) return false;
  if (!unlockedAt) return true;
  return now.getTime() - unlockedAt.getTime() > lockAfterMs;
}

/** Activity is written at most once per interval, so browsing doesn't hammer the database. */
export function shouldTouch(unlockedAt: Date | null, now: Date, intervalMs = TOUCH_INTERVAL_MS): boolean {
  return !unlockedAt || now.getTime() - unlockedAt.getTime() >= intervalMs;
}

export interface PinFailure {
  attempts: number;
  attemptsLeft: number;
  /** Too many wrong tries: the session must end and the password is required. */
  exhausted: boolean;
}

/** State after one more wrong PIN, given the number of wrong tries so far. */
export function registerPinFailure(attempts: number, max = MAX_PIN_ATTEMPTS): PinFailure {
  const next = attempts + 1;
  return { attempts: next, attemptsLeft: Math.max(0, max - next), exhausted: next >= max };
}
