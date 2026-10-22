import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTENDANCE_SETTINGS as S,
  checkScanGeo,
  classifyScanTime,
  computeDay,
  dayCode,
  isWorkingDay,
  monthDates,
  reminderDue,
  scanGeoRejection,
  summarizeMonth,
  validateAttendanceWindows,
  windowsLabel,
  type OverrideStatus,
  type ScanKind,
} from "../src";

const min = (h: number, m = 0) => h * 60 + m;

describe("classifyScanTime", () => {
  it("puts the window edges inside the window", () => {
    expect(classifyScanTime(min(6), S)).toBe("morning");
    expect(classifyScanTime(min(11), S)).toBe("morning");
    expect(classifyScanTime(min(15), S)).toBe("evening");
    expect(classifyScanTime(min(21), S)).toBe("evening");
  });
  it("is off_window between and outside the windows", () => {
    expect(classifyScanTime(min(5, 59), S)).toBe("off_window");
    expect(classifyScanTime(min(13), S)).toBe("off_window");
    expect(classifyScanTime(min(21, 1), S)).toBe("off_window");
  });
});

describe("validateAttendanceWindows", () => {
  it("accepts the defaults", () => {
    expect(validateAttendanceWindows(S)).toBeNull();
  });
  it("rejects a window that ends before it starts", () => {
    expect(validateAttendanceWindows({ morning: { from: "11:00", to: "06:00" }, evening: S.evening })).toMatch(/Утреннее/);
  });
  it("rejects overlapping windows", () => {
    expect(validateAttendanceWindows({ morning: { from: "06:00", to: "16:00" }, evening: S.evening })).toMatch(/до начала вечернего/);
  });
  it("rejects garbage", () => {
    expect(validateAttendanceWindows({ morning: { from: "6", to: "x" }, evening: S.evening })).toMatch(/ЧЧ:ММ/);
  });
  it("labels windows", () => {
    expect(windowsLabel(S)).toBe("утро 06:00–11:00, вечер 15:00–21:00");
  });
});

describe("checkScanGeo", () => {
  const point = { lat: 40.269, lng: 69.665, radiusM: null };
  it("is unverified without a position", () => {
    expect(checkScanGeo(point, null, S)).toEqual({ geo: "unverified", distanceM: null, radiusM: 300 });
  });
  it("verifies a close, precise fix", () => {
    const r = checkScanGeo(point, { lat: 40.2695, lng: 69.665, accuracyM: 20 }, S);
    expect(r.geo).toBe("verified");
    expect(r.distanceM).toBeLessThan(100);
  });
  it("is unverified when the fix is coarser than the radius", () => {
    expect(checkScanGeo(point, { lat: 40.2695, lng: 69.665, accuracyM: 800 }, S).geo).toBe("unverified");
  });
  it("is out_of_range for a precise fix far away", () => {
    expect(checkScanGeo(point, { lat: 40.3, lng: 69.665, accuracyM: 10 }, S).geo).toBe("out_of_range");
  });
  it("uses the point's own radius when set", () => {
    const wide = { ...point, radiusM: 5000 };
    expect(checkScanGeo(wide, { lat: 40.3, lng: 69.665, accuracyM: 10 }, S).geo).toBe("verified");
  });
});

describe("scanGeoRejection", () => {
  const point = { lat: 40.269, lng: 69.665, radiusM: null };
  const reject = (pos: Parameters<typeof checkScanGeo>[1]) => scanGeoRejection(checkScanGeo(point, pos, S), pos);

  it("accepts a precise fix inside the zone", () => {
    expect(reject({ lat: 40.2695, lng: 69.665, accuracyM: 20 })).toBeNull();
  });
  it("rejects a scan without a position", () => {
    expect(reject(null)).toMatch(/геолокац/);
  });
  it("rejects a fix too coarse to place the phone", () => {
    expect(reject({ lat: 40.2695, lng: 69.665, accuracyM: 800 })).toMatch(/неточно/);
  });
  it("rejects a precise fix outside the zone and says how far", () => {
    expect(reject({ lat: 40.3, lng: 69.665, accuracyM: 10 })).toMatch(/3,4 км.*300 м/);
  });
});

describe("isWorkingDay", () => {
  it("is Mon–Fri minus holidays", () => {
    expect(isWorkingDay("2026-10-19", S)).toBe(true); // Monday
    expect(isWorkingDay("2026-10-17", S)).toBe(false); // Saturday
    expect(isWorkingDay("2026-10-19", { holidays: ["2026-10-19"] })).toBe(false);
  });
});

describe("computeDay", () => {
  const scan = (kind: ScanKind, extra: Partial<{ duplicate: boolean; deletedAt: Date | null }> = {}) => ({
    kind,
    duplicate: false,
    deletedAt: null,
    ...extra,
  });
  const day = (scans: ReturnType<typeof scan>[], date = "2026-10-19", override: { status: OverrideStatus } | null = null) =>
    computeDay({ date, scans, override, settings: S });

  it("two windows make a full day", () => {
    const v = day([scan("morning"), scan("evening")]);
    expect(v.status).toBe("full");
    expect(v.offSchedule).toBe(false);
    expect(dayCode(v)).toBe("Я");
  });
  it("one window is partial", () => {
    expect(day([scan("morning")]).status).toBe("partial");
    expect(dayCode(day([scan("evening")]))).toBe("Н");
  });
  it("no scans is none, not absent", () => {
    const v = day([]);
    expect(v.status).toBe("none");
    expect(dayCode(v)).toBe("");
  });
  it("ignores duplicates, deleted and off-window scans", () => {
    const v = day([scan("morning"), scan("evening", { duplicate: true }), scan("evening", { deletedAt: new Date() }), scan("off_window")]);
    expect(v.status).toBe("partial");
  });
  it("marks a full day on a weekend as off schedule", () => {
    const v = day([scan("morning"), scan("evening")], "2026-10-17");
    expect(v.status).toBe("full");
    expect(v.offSchedule).toBe(true);
    expect(dayCode(v)).toBe("Яв");
  });
  it("lets the override win over the scans", () => {
    const v = day([scan("morning"), scan("evening")], "2026-10-19", { status: "sick" });
    expect(v.status).toBe("sick");
    expect(v.overridden).toBe(true);
    expect(dayCode(v)).toBe("Б");
    expect(dayCode(day([], "2026-10-19", { status: "worked" }))).toBe("Я");
    expect(dayCode(day([], "2026-10-19", { status: "not_worked" }))).toBe("НН");
  });
});

describe("month helpers", () => {
  const plain = (kind: ScanKind) => ({ kind, duplicate: false, deletedAt: null });

  it("lists the dates of a month", () => {
    const d = monthDates("2026-02");
    expect(d).toHaveLength(28);
    expect(d[0]).toBe("2026-02-01");
    expect(d.at(-1)).toBe("2026-02-28");
    expect(monthDates("2026-10")).toHaveLength(31);
  });
  it("totals a month, counting missing only on working days", () => {
    const full = computeDay({ date: "2026-10-19", scans: [plain("morning"), plain("evening")], override: null, settings: S });
    const none = computeDay({ date: "2026-10-20", scans: [], override: null, settings: S });
    const sat = computeDay({ date: "2026-10-17", scans: [], override: null, settings: S });
    const sick = computeDay({ date: "2026-10-21", scans: [], override: { status: "sick" }, settings: S });
    const t = summarizeMonth(
      [
        { date: "2026-10-19", verdict: full },
        { date: "2026-10-20", verdict: none },
        { date: "2026-10-17", verdict: sat },
        { date: "2026-10-21", verdict: sick },
      ],
      S,
    );
    expect(t).toEqual({ full: 1, partial: 0, missing: 1, vacation: 0, sick: 1, dayOff: 0, notWorked: 0 });
  });
});

describe("reminderDue", () => {
  const MON = "2026-10-19";
  const SAT = "2026-10-24";

  it("is due in the last 30 minutes of a window, edges included", () => {
    expect(reminderDue(MON, min(10, 30), S)).toBe("morning");
    expect(reminderDue(MON, min(11), S)).toBe("morning");
    expect(reminderDue(MON, min(20, 30), S)).toBe("evening");
    expect(reminderDue(MON, min(21), S)).toBe("evening");
  });
  it("is not due earlier in the window or after it closes", () => {
    expect(reminderDue(MON, min(10, 29), S)).toBeNull();
    expect(reminderDue(MON, min(11, 1), S)).toBeNull();
    expect(reminderDue(MON, min(13), S)).toBeNull();
    expect(reminderDue(MON, min(21, 1), S)).toBeNull();
  });
  it("is never due on a weekend or a holiday", () => {
    expect(reminderDue(SAT, min(10, 45), S)).toBeNull();
    expect(reminderDue(MON, min(10, 45), { ...S, holidays: [MON] })).toBeNull();
  });
  it("covers the whole window when it is shorter than the lead time", () => {
    const short = { ...S, morning: { from: "08:00", to: "08:20" } };
    expect(reminderDue(MON, min(8), short)).toBe("morning");
    expect(reminderDue(MON, min(7, 59), short)).toBeNull();
  });
});
