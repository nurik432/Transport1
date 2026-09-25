import { describe, expect, it } from "vitest";
import { freeSeats, leaveHint, walkMinutes } from "../src/walk";

describe("walkMinutes", () => {
  it("adds a street detour and rounds up", () => {
    // 350 m * 1.3 = 455 m / 75 m/min = 6.07 → 7
    expect(walkMinutes(350)).toBe(7);
  });

  it("is at least one minute", () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(10)).toBe(1);
    expect(walkMinutes(Number.NaN)).toBe(1);
  });
});

describe("leaveHint", () => {
  it("tells how long to wait when there is slack", () => {
    expect(leaveHint(10, 5)).toEqual({ kind: "wait", leaveInMin: 4, walkMin: 5 });
  });

  it("says leave now when the slack is gone but the passenger can still make it", () => {
    expect(leaveHint(6, 5)).toEqual({ kind: "now", walkMin: 5 });
    expect(leaveHint(5, 5)).toEqual({ kind: "now", walkMin: 5 });
  });

  it("reports being late when the vehicle arrives first", () => {
    expect(leaveHint(3, 5)).toEqual({ kind: "late", walkMin: 5, shortByMin: 2 });
  });

  it("gives no leave time while the vehicle is beyond the horizon", () => {
    expect(leaveHint(367, 12)).toEqual({ kind: "far", walkMin: 12 });
    // right at the horizon it is still a countdown
    expect(leaveHint(73, 12)).toEqual({ kind: "wait", leaveInMin: 60, walkMin: 12 });
  });
});

describe("freeSeats", () => {
  it("subtracts bookings from capacity", () => {
    expect(freeSeats(20, 12)).toBe(8);
  });

  it("never goes negative on overbooking", () => {
    expect(freeSeats(20, 25)).toBe(0);
  });

  it("is null without a vehicle", () => {
    expect(freeSeats(null, 3)).toBeNull();
  });
});
