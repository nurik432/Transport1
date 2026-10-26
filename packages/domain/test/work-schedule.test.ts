import { describe, expect, it } from "vitest";
import {
  buildWorkCalendar,
  daysBetween,
  isPatternWorkDay,
  monthDates,
  normDays,
  patternLabel,
  validatePattern,
  versionAt,
  type ScheduleVersion,
  type WorkPattern,
} from "../src";

const FIVE_TWO: WorkPattern = { kind: "weekly", weekdays: [1, 2, 3, 4, 5] };
const TWO_TWO: WorkPattern = { kind: "cycle", workDays: 2, restDays: 2 };
const v = (effectiveFrom: string, pattern: WorkPattern, holidaysOff = true): ScheduleVersion => ({ effectiveFrom, pattern, holidaysOff });

describe("validatePattern", () => {
  it("accepts ordinary patterns", () => {
    expect(validatePattern(FIVE_TWO)).toBeNull();
    expect(validatePattern(TWO_TWO)).toBeNull();
    expect(validatePattern({ kind: "cycle", workDays: 1, restDays: 0 })).toBeNull();
  });
  it("rejects a week without working days and bad weekdays", () => {
    expect(validatePattern({ kind: "weekly", weekdays: [] })).toMatch(/хотя бы один/);
    expect(validatePattern({ kind: "weekly", weekdays: [0, 8] })).toMatch(/от 1 до 7/);
  });
  it("rejects broken cycles", () => {
    expect(validatePattern({ kind: "cycle", workDays: 0, restDays: 2 })).toMatch(/не меньше одного/);
    expect(validatePattern({ kind: "cycle", workDays: 2, restDays: -1 })).toMatch(/меньше нуля/);
    expect(validatePattern({ kind: "cycle", workDays: 20, restDays: 20 })).toMatch(/длиннее/);
    expect(validatePattern({ kind: "cycle", workDays: 1.5, restDays: 2 })).not.toBeNull();
  });
});

describe("patternLabel", () => {
  it("names ranges, lists and cycles", () => {
    expect(patternLabel(FIVE_TWO)).toBe("пн–пт");
    expect(patternLabel({ kind: "weekly", weekdays: [5, 1, 3] })).toBe("пн, ср, пт");
    expect(patternLabel({ kind: "weekly", weekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe("ежедневно");
    expect(patternLabel(TWO_TWO)).toBe("2/2");
  });
});

describe("isPatternWorkDay", () => {
  it("weekly follows the weekday", () => {
    expect(isPatternWorkDay("2026-10-19", FIVE_TWO, "2000-01-01")).toBe(true); // Mon
    expect(isPatternWorkDay("2026-10-24", FIVE_TWO, "2000-01-01")).toBe(false); // Sat
  });
  it("2/2 counts from the cycle start, both ways", () => {
    const start = "2026-10-10";
    const got = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"].map((d) =>
      isPatternWorkDay(d, TWO_TWO, start),
    );
    expect(got).toEqual([true, true, false, false, true, true, false, false, true]);
  });
  it("1/3 works one day in four", () => {
    const one: WorkPattern = { kind: "cycle", workDays: 1, restDays: 3 };
    expect(monthDates("2026-10").filter((d) => isPatternWorkDay(d, one, "2026-10-01"))).toEqual([
      "2026-10-01",
      "2026-10-05",
      "2026-10-09",
      "2026-10-13",
      "2026-10-17",
      "2026-10-21",
      "2026-10-25",
      "2026-10-29",
    ]);
  });
  it("counts days across months", () => {
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(daysBetween("2026-03-02", "2026-02-27")).toBe(-3);
  });
});

describe("versionAt", () => {
  const versions = [v("2026-10-15", TWO_TWO), v("2026-01-01", FIVE_TWO)];
  it("picks the latest version in force", () => {
    expect(versionAt(versions, "2026-10-14")?.pattern).toEqual(FIVE_TWO);
    expect(versionAt(versions, "2026-10-15")?.pattern).toEqual(TWO_TWO);
  });
  it("uses the first version before it starts", () => {
    expect(versionAt(versions, "2025-05-05")?.pattern).toEqual(FIVE_TWO);
    expect(versionAt([], "2025-05-05")).toBeNull();
  });
});

describe("buildWorkCalendar", () => {
  const versions = new Map<string, ScheduleVersion[]>([
    ["d52", [v("2026-01-01", FIVE_TWO)]],
    ["s22", [v("2026-01-01", TWO_TWO, false)]],
  ]);
  const HOLIDAY = "2026-10-20"; // Tuesday

  it("falls back to the default schedule without an assignment", () => {
    const cal = buildWorkCalendar({ assignments: [], versions, defaultScheduleId: "d52", holidays: [HOLIDAY] });
    expect(cal.isWorkDay("2026-10-19")).toBe(true);
    expect(cal.isWorkDay(HOLIDAY)).toBe(false);
    expect(cal.isWorkDay("2026-10-24")).toBe(false);
    expect(cal.scheduleIdAt("2026-10-19")).toBe("d52");
  });
  it("uses a built-in 5/2 when there is no default schedule", () => {
    const cal = buildWorkCalendar({ assignments: [], versions: new Map(), defaultScheduleId: null, holidays: [] });
    expect(cal.isWorkDay("2026-10-19")).toBe(true);
    expect(cal.isWorkDay("2026-10-25")).toBe(false);
  });
  it("switches schedule on the assignment date and keeps the earlier days", () => {
    const cal = buildWorkCalendar({
      assignments: [{ scheduleId: "s22", effectiveFrom: "2026-10-15", cycleStart: null }],
      versions,
      defaultScheduleId: "d52",
      holidays: [HOLIDAY],
    });
    expect(cal.isWorkDay("2026-10-11")).toBe(false); // Sunday, still 5/2
    expect(cal.isWorkDay("2026-10-15")).toBe(true); // cycle starts on the assignment date
    expect(cal.isWorkDay("2026-10-17")).toBe(false);
    expect(cal.isWorkDay("2026-10-19")).toBe(true);
    expect(cal.isWorkDay(HOLIDAY)).toBe(true); // shifts ignore holidays here
    expect(cal.scheduleIdAt("2026-10-14")).toBe("d52");
    expect(cal.scheduleIdAt("2026-10-15")).toBe("s22");
  });
  it("lets two drivers share 2/2 with shifted cycle starts", () => {
    const a = buildWorkCalendar({ assignments: [{ scheduleId: "s22", effectiveFrom: "2026-10-01", cycleStart: "2026-10-01" }], versions, defaultScheduleId: "d52", holidays: [] });
    const b = buildWorkCalendar({ assignments: [{ scheduleId: "s22", effectiveFrom: "2026-10-01", cycleStart: "2026-10-03" }], versions, defaultScheduleId: "d52", holidays: [] });
    for (const d of monthDates("2026-10")) expect(a.isWorkDay(d)).toBe(!b.isWorkDay(d));
  });
  it("applies a new schedule version from its date to everyone on it", () => {
    const changed = new Map(versions).set("d52", [v("2026-01-01", FIVE_TWO), v("2026-10-24", { kind: "weekly", weekdays: [1, 2, 3, 4, 5, 6] })]);
    const cal = buildWorkCalendar({ assignments: [], versions: changed, defaultScheduleId: "d52", holidays: [] });
    expect(cal.isWorkDay("2026-10-17")).toBe(false); // Saturday before
    expect(cal.isWorkDay("2026-10-24")).toBe(true); // Saturday after
  });
  it("counts the norm of a month", () => {
    const cal = buildWorkCalendar({ assignments: [], versions, defaultScheduleId: "d52", holidays: [HOLIDAY] });
    expect(normDays(monthDates("2026-10"), cal.isWorkDay)).toBe(21);
  });
});
