import { describe, expect, it } from "vitest";
import { directionForMinutes, formatDistance, isoWeekday, nearestStops, plannedStopTimes, upcomingDepartures } from "../src";

const rs = [
  { stopId: "a", seq: 1, offsetMin: 0 },
  { stopId: "c", seq: 3, offsetMin: 13 },
  { stopId: "b", seq: 2, offsetMin: 6 },
];

describe("plannedStopTimes", () => {
  it("adds offsets to departure in seq order", () => {
    const t = plannedStopTimes(450, rs);
    expect(t.map((x) => x.stopId)).toEqual(["a", "b", "c"]);
    expect(t.map((x) => x.plannedMin)).toEqual([450, 456, 463]);
  });
  it("handles empty route", () => {
    expect(plannedStopTimes(450, [])).toEqual([]);
  });
});

describe("upcomingDepartures", () => {
  const schedules = [
    { id: "1", routeId: "r", departureTime: "07:00", daysOfWeek: [1, 2, 3, 4, 5], active: true },
    { id: "2", routeId: "r", departureTime: "07:30", daysOfWeek: [1, 2, 3, 4, 5], active: true },
    { id: "3", routeId: "r", departureTime: "08:00", daysOfWeek: [6], active: true },
    { id: "4", routeId: "r", departureTime: "06:30", daysOfWeek: [1, 2, 3, 4, 5], active: false },
  ];
  it("returns only future, active departures for the weekday", () => {
    const d = upcomingDepartures(schedules, 1, 7 * 60 + 10);
    expect(d.map((x) => x.schedule.id)).toEqual(["2"]);
  });
  it("includes a departure at exactly now", () => {
    expect(upcomingDepartures(schedules, 1, 420).map((x) => x.schedule.id)).toEqual(["1", "2"]);
  });
  it("respects weekday and limit", () => {
    expect(upcomingDepartures(schedules, 6, 0).map((x) => x.schedule.id)).toEqual(["3"]);
    expect(upcomingDepartures(schedules, 1, 0, 1).map((x) => x.schedule.id)).toEqual(["1"]);
  });
  it("returns empty when nothing left today", () => {
    expect(upcomingDepartures(schedules, 1, 23 * 60)).toEqual([]);
  });
});

describe("direction / weekday helpers", () => {
  it("morning is to_work, afternoon is from_work", () => {
    expect(directionForMinutes(0)).toBe("to_work");
    expect(directionForMinutes(11 * 60 + 59)).toBe("to_work");
    expect(directionForMinutes(12 * 60)).toBe("from_work");
  });
  it("isoWeekday maps Sunday to 7", () => {
    expect(isoWeekday(new Date(2026, 8, 20))).toBe(7); // 2026-09-20 is Sunday
    expect(isoWeekday(new Date(2026, 8, 21))).toBe(1);
  });
});

describe("nearestStops", () => {
  const origin = { lat: 40.2833, lng: 69.6333 };
  const stops = [
    { id: "far", lat: 40.3, lng: 69.7 },
    { id: "near", lat: 40.284, lng: 69.634 },
    { id: "mid", lat: 40.29, lng: 69.64 },
  ];
  it("sorts by distance and limits", () => {
    expect(nearestStops(origin, stops, { limit: 2 }).map((s) => s.stop.id)).toEqual(["near", "mid"]);
  });
  it("filters by max distance and handles empty input", () => {
    expect(nearestStops(origin, stops, { maxDistanceM: 200 }).map((s) => s.stop.id)).toEqual(["near"]);
    expect(nearestStops(origin, [])).toEqual([]);
  });
  it("formats distance", () => {
    expect(formatDistance(347)).toBe("350 м");
    expect(formatDistance(1234)).toBe("1,2 км");
  });
});
