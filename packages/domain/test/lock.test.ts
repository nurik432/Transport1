import { describe, expect, it } from "vitest";
import {
  LOCK_AFTER_MS,
  MAX_PIN_ATTEMPTS,
  TOUCH_INTERVAL_MS,
  isLocked,
  isValidPin,
  registerPinFailure,
  sessionExpiresAt,
  shouldTouch,
} from "../src/lock";

const NOW = new Date("2026-09-29T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("sessionExpiresAt", () => {
  it("keeps a remembered session for 30 days", () => {
    expect(sessionExpiresAt(true, NOW).getTime() - NOW.getTime()).toBe(30 * 24 * 3_600_000);
  });

  it("keeps a session without remember-me for 12 hours", () => {
    expect(sessionExpiresAt(false, NOW).getTime() - NOW.getTime()).toBe(12 * 3_600_000);
  });
});

describe("isValidPin", () => {
  it("accepts exactly four digits", () => {
    expect(isValidPin("0000")).toBe(true);
    expect(isValidPin("9449")).toBe(true);
  });

  it("rejects wrong length, letters and spaces", () => {
    for (const pin of ["", "123", "12345", "12a4", " 123", "12 4"]) expect(isValidPin(pin)).toBe(false);
  });
});

describe("isLocked", () => {
  it("is never locked without a PIN", () => {
    expect(isLocked({ pinHash: null, unlockedAt: null, now: NOW })).toBe(false);
    expect(isLocked({ pinHash: null, unlockedAt: ago(LOCK_AFTER_MS * 10), now: NOW })).toBe(false);
  });

  it("is locked when a PIN is set but the app was never unlocked", () => {
    expect(isLocked({ pinHash: "h", unlockedAt: null, now: NOW })).toBe(true);
  });

  it("stays unlocked while activity is fresh", () => {
    expect(isLocked({ pinHash: "h", unlockedAt: ago(LOCK_AFTER_MS - 1000), now: NOW })).toBe(false);
    expect(isLocked({ pinHash: "h", unlockedAt: ago(LOCK_AFTER_MS), now: NOW })).toBe(false);
  });

  it("locks after the idle limit", () => {
    expect(isLocked({ pinHash: "h", unlockedAt: ago(LOCK_AFTER_MS + 1), now: NOW })).toBe(true);
  });

  it("honours a custom idle limit", () => {
    expect(isLocked({ pinHash: "h", unlockedAt: ago(61_000), now: NOW, lockAfterMs: 60_000 })).toBe(true);
  });
});

describe("shouldTouch", () => {
  it("writes when there is no activity yet", () => {
    expect(shouldTouch(null, NOW)).toBe(true);
  });

  it("skips writes inside the interval and writes after it", () => {
    expect(shouldTouch(ago(TOUCH_INTERVAL_MS - 1), NOW)).toBe(false);
    expect(shouldTouch(ago(TOUCH_INTERVAL_MS), NOW)).toBe(true);
  });
});

describe("registerPinFailure", () => {
  it("counts down the remaining tries", () => {
    expect(registerPinFailure(0)).toEqual({ attempts: 1, attemptsLeft: MAX_PIN_ATTEMPTS - 1, exhausted: false });
  });

  it("is exhausted on the last allowed try", () => {
    expect(registerPinFailure(MAX_PIN_ATTEMPTS - 1)).toEqual({ attempts: MAX_PIN_ATTEMPTS, attemptsLeft: 0, exhausted: true });
  });

  it("never reports negative tries left", () => {
    expect(registerPinFailure(MAX_PIN_ATTEMPTS + 3).attemptsLeft).toBe(0);
  });
});
