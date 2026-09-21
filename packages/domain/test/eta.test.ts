import { describe, expect, it } from "vitest";
import { etaForStop, formatEta } from "../src";

const start = new Date("2026-09-21T02:30:00.000Z"); // 07:30 local (UTC+5)
const rs = [
  { stopId: "a", seq: 1, offsetMin: 0 },
  { stopId: "b", seq: 2, offsetMin: 6 },
  { stopId: "c", seq: 3, offsetMin: 13 },
  { stopId: "d", seq: 4, offsetMin: 20 },
];
const min = (n: number) => new Date(start.getTime() + n * 60_000);

describe("etaForStop", () => {
  it("uses schedule before the trip starts", () => {
    const r = etaForStop({ tripStartAt: start, routeStops: rs, events: [], targetStopId: "c", now: min(-7) });
    expect(r?.source).toBe("schedule");
    expect(r?.minutesFromNow).toBe(20);
    expect(r?.passed).toBe(false);
  });
  it("re-bases on the last driver mark", () => {
    // driver reached b 4 minutes late
    const events = [{ stopId: "b", arrivedAt: min(10) }];
    const r = etaForStop({ tripStartAt: start, routeStops: rs, events, targetStopId: "d", now: min(11) });
    expect(r?.source).toBe("driver");
    // planned gap b -> d is 14 min from arrival at b (min 10) -> min 24; now is 11 -> 13
    expect(r?.minutesFromNow).toBe(13);
    expect(r?.passed).toBe(false);
  });
  it("uses departedAt when present", () => {
    const events = [{ stopId: "b", arrivedAt: min(10), departedAt: min(12) }];
    const r = etaForStop({ tripStartAt: start, routeStops: rs, events, targetStopId: "c", now: min(12) });
    expect(r?.minutesFromNow).toBe(7);
  });
  it("marks passed when target or later stop was marked", () => {
    const events = [{ stopId: "c", arrivedAt: min(14) }];
    expect(etaForStop({ tripStartAt: start, routeStops: rs, events, targetStopId: "c", now: min(15) })?.passed).toBe(true);
    expect(etaForStop({ tripStartAt: start, routeStops: rs, events, targetStopId: "b", now: min(15) })?.passed).toBe(true);
    expect(etaForStop({ tripStartAt: start, routeStops: rs, events, targetStopId: "d", now: min(15) })?.passed).toBe(false);
  });
  it("returns null for unknown stop", () => {
    expect(etaForStop({ tripStartAt: start, routeStops: rs, events: [], targetStopId: "zzz", now: start })).toBeNull();
  });
  it("formats", () => {
    expect(formatEta({ minutesFromNow: 7, passed: false })).toBe("через 7 мин");
    expect(formatEta({ minutesFromNow: 0, passed: false })).toBe("сейчас");
    expect(formatEta({ minutesFromNow: 75, passed: false })).toBe("через 1 ч 15 мин");
    expect(formatEta({ minutesFromNow: -3, passed: true })).toBe("уже прошёл");
  });
});
