import { describe, expect, it } from "vitest";
import { addDays, durationLabel, formatLocalTime, localDateTime, localNow, weekdayOfDate } from "../src";

describe("time zone helpers", () => {
  it("localDateTime builds an instant in UTC+5", () => {
    expect(localDateTime("2026-09-21", 7 * 60 + 30).toISOString()).toBe("2026-09-21T02:30:00.000Z");
  });
  it("weekdayOfDate is host-timezone independent", () => {
    expect(weekdayOfDate("2026-09-21")).toBe(1);
    expect(weekdayOfDate("2026-09-20")).toBe(7);
  });
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
  it("localNow reports company-local date and minutes", () => {
    const n = localNow(new Date("2026-09-21T22:30:00.000Z")); // 03:30 next day local
    expect(n.date).toBe("2026-09-22");
    expect(n.minutes).toBe(3 * 60 + 30);
    expect(n.weekday).toBe(2);
  });
  it("formatLocalTime", () => {
    expect(formatLocalTime(new Date("2026-09-21T02:30:00.000Z"))).toBe("07:30");
  });
});

describe("durationLabel", () => {
  it("counts in minutes for under an hour", () => {
    expect(durationLabel(0)).toBe("0 минут");
    expect(durationLabel(1)).toBe("1 минута");
    expect(durationLabel(12)).toBe("12 минут");
    expect(durationLabel(23)).toBe("23 минуты");
  });

  it("switches to hours once it passes one", () => {
    expect(durationLabel(60)).toBe("1 ч");
    expect(durationLabel(75)).toBe("1 ч 15 мин");
    expect(durationLabel(461)).toBe("7 ч 41 мин");
  });

  it("never goes negative", () => {
    expect(durationLabel(-5)).toBe("0 минут");
  });
});
