import { describe, expect, it } from "vitest";
import { MAX_PAUSE_DAYS, isPausedOn, pauseLabel, pauseState, validatePause } from "../src/subscription";
import { addDays } from "../src/time";

const TODAY = "2026-10-07";
const NONE = { from: null, to: null };

describe("isPausedOn", () => {
  it("is never paused without a pause", () => {
    expect(isPausedOn(NONE, TODAY)).toBe(false);
  });

  it("treats a half-filled pause as no pause", () => {
    expect(isPausedOn({ from: TODAY, to: null }, TODAY)).toBe(false);
    expect(isPausedOn({ from: null, to: TODAY }, TODAY)).toBe(false);
  });

  it("covers both ends of the range", () => {
    const pause = { from: "2026-10-10", to: "2026-10-14" };
    expect(isPausedOn(pause, "2026-10-09")).toBe(false);
    expect(isPausedOn(pause, "2026-10-10")).toBe(true);
    expect(isPausedOn(pause, "2026-10-12")).toBe(true);
    expect(isPausedOn(pause, "2026-10-14")).toBe(true);
    expect(isPausedOn(pause, "2026-10-15")).toBe(false);
  });
});

describe("pauseState", () => {
  it("reports no pause", () => {
    expect(pauseState(NONE, TODAY)).toBe("none");
  });

  it("is scheduled before the first day", () => {
    expect(pauseState({ from: "2026-10-08", to: "2026-10-09" }, TODAY)).toBe("scheduled");
  });

  it("is active on the first and the last day", () => {
    expect(pauseState({ from: TODAY, to: "2026-10-09" }, TODAY)).toBe("active");
    expect(pauseState({ from: "2026-10-01", to: TODAY }, TODAY)).toBe("active");
  });

  it("is expired the day after it ends", () => {
    expect(pauseState({ from: "2026-10-01", to: "2026-10-06" }, TODAY)).toBe("expired");
  });
});

describe("validatePause", () => {
  it("accepts a range starting today", () => {
    expect(validatePause(TODAY, "2026-10-14", TODAY)).toBeNull();
  });

  it("accepts a single day", () => {
    expect(validatePause("2026-10-09", "2026-10-09", TODAY)).toBeNull();
  });

  it("requires both dates in YYYY-MM-DD", () => {
    expect(validatePause("", "2026-10-14", TODAY)).not.toBeNull();
    expect(validatePause(TODAY, "", TODAY)).not.toBeNull();
    expect(validatePause("07.10.2026", "2026-10-14", TODAY)).not.toBeNull();
    expect(validatePause("2026-13-40", "2026-10-14", TODAY)).not.toBeNull();
  });

  it("rejects an end before the start", () => {
    expect(validatePause("2026-10-14", "2026-10-10", TODAY)).not.toBeNull();
  });

  it("rejects a pause that is already over", () => {
    expect(validatePause("2026-10-01", "2026-10-06", TODAY)).not.toBeNull();
  });

  it("allows the longest pause and rejects one day more", () => {
    expect(validatePause(TODAY, addDays(TODAY, MAX_PAUSE_DAYS - 1), TODAY)).toBeNull();
    expect(validatePause(TODAY, addDays(TODAY, MAX_PAUSE_DAYS), TODAY)).not.toBeNull();
  });
});

describe("pauseLabel", () => {
  it("is empty without a pause or after it ended", () => {
    expect(pauseLabel(NONE, TODAY)).toBeNull();
    expect(pauseLabel({ from: "2026-10-01", to: "2026-10-06" }, TODAY)).toBeNull();
  });

  it("names the last day of a running pause", () => {
    expect(pauseLabel({ from: "2026-10-05", to: "2026-10-14" }, TODAY)).toBe("Пауза до 14 октября");
  });

  it("names both ends of a pause that has not started", () => {
    expect(pauseLabel({ from: "2026-10-20", to: "2026-10-31" }, TODAY)).toBe("Пауза с 20 по 31 октября");
    expect(pauseLabel({ from: "2026-10-28", to: "2026-11-03" }, TODAY)).toBe("Пауза с 28 октября по 3 ноября");
  });

  it("names a single future day", () => {
    expect(pauseLabel({ from: "2026-10-20", to: "2026-10-20" }, TODAY)).toBe("Пауза 20 октября");
  });
});
