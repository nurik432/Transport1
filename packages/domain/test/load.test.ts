import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  loadByDepartureTime,
  loadByStop,
  loadByWeekday,
  routeLoadStatus,
  routeSignals,
  tripLoad,
  type TripLoadRecord,
} from "../src";

describe("tripLoad", () => {
  it("computes max onboard from headcounts and takes max with demand", () => {
    const l = tripLoad({
      capacity: 30,
      demand: 20,
      events: [
        { seq: 1, boarded: 10, alighted: 0 },
        { seq: 3, boarded: 5, alighted: 20 },
        { seq: 2, boarded: 16, alighted: 0 },
      ],
    });
    expect(l.maxOnboard).toBe(26);
    expect(l.effective).toBe(26);
    expect(l.loadPct).toBe(87);
  });
  it("demand above capacity gives >100%", () => {
    expect(tripLoad({ capacity: 30, demand: 34, events: [] }).loadPct).toBe(113);
  });
  it("no capacity -> null pct; no data -> zeros", () => {
    expect(tripLoad({ capacity: null, demand: 5, events: [] }).loadPct).toBeNull();
    expect(tripLoad({ capacity: 0, demand: 5, events: [] }).loadPct).toBeNull();
    expect(tripLoad({ capacity: 30, demand: 0, events: [] })).toMatchObject({ effective: 0, loadPct: 0 });
  });
});

const mk = (pct: number, cap = 30) => tripLoad({ capacity: cap, demand: Math.round((pct / 100) * cap), events: [] });

describe("routeLoadStatus", () => {
  it("no_data below minTrips", () => {
    expect(routeLoadStatus([mk(120), mk(120)]).status).toBe("no_data");
    expect(routeLoadStatus([]).status).toBe("no_data");
  });
  it("overloaded by share of trips", () => {
    const s = routeLoadStatus([mk(100), mk(60), mk(60), mk(110), mk(60), mk(60), mk(60), mk(60), mk(60), mk(60)]);
    expect(s.overloadedTrips).toBe(2);
    expect(s.status).toBe("normal"); // 20% < 30%
    const s2 = routeLoadStatus([mk(100), mk(100), mk(100), mk(60), mk(60), mk(60), mk(60), mk(60), mk(60), mk(60)]);
    expect(s2.status).toBe("overloaded");
  });
  it("overloaded by average", () => {
    expect(routeLoadStatus([mk(97), mk(95), mk(96)]).status).toBe("overloaded");
  });
  it("low and normal", () => {
    expect(routeLoadStatus([mk(20), mk(30), mk(35)]).status).toBe("low");
    expect(routeLoadStatus([mk(80), mk(87), mk(90)]).status).toBe("normal");
  });
  it("custom thresholds", () => {
    expect(routeLoadStatus([mk(50), mk(50), mk(50)], { ...DEFAULT_THRESHOLDS, lowAvgPct: 60 }).status).toBe("low");
  });
});

describe("analytics breakdowns", () => {
  const rec = (t: string, wd: number, pct: number): TripLoadRecord => ({
    ...mk(pct),
    tripId: t + wd,
    routeId: "r",
    date: "2026-09-21",
    startTime: t,
    weekday: wd,
  });
  const records = [rec("07:00", 1, 60), rec("07:30", 1, 110), rec("07:00", 2, 70), rec("07:30", 2, 120)];
  it("by departure time", () => {
    const b = loadByDepartureTime(records);
    expect(b.map((x) => [x.label, x.avgPct])).toEqual([
      ["07:00", 65],
      ["07:30", 115],
    ]);
  });
  it("by weekday", () => {
    const b = loadByWeekday(records);
    expect(b.map((x) => [x.label, x.trips])).toEqual([
      ["Пн", 2],
      ["Вт", 2],
    ]);
  });
  it("by stop", () => {
    const b = loadByStop([
      { tripId: "1", stopId: "a", stopName: "A", seq: 1, demand: 10, boarded: 8 },
      { tripId: "2", stopId: "a", stopName: "A", seq: 1, demand: 12, boarded: 14 },
      { tripId: "1", stopId: "b", stopName: "B", seq: 2, demand: 2, boarded: 3 },
    ]);
    expect(b[0]).toMatchObject({ stopId: "a", trips: 2, avgDemand: 11, avgBoarded: 11, avgEffective: 12 });
    expect(b[1]).toMatchObject({ stopId: "b", trips: 1, avgEffective: 3 });
  });
});

describe("routeSignals", () => {
  it("produces an overload signal with peak and hot stops", () => {
    const loads = [mk(110), mk(120), mk(105), mk(90)];
    const stats = routeLoadStatus(loads);
    const sig = routeSignals({
      routeId: "r",
      routeName: "№5",
      capacity: 30,
      stats,
      byTime: [{ key: "07:30", label: "07:30", trips: 4, avgPct: 106, maxPct: 120, avgPassengers: 32, overloadedTrips: 3 }],
      byStop: [
        { stopId: "a", stopName: "Центр", seq: 1, demand: 0, boarded: 0, trips: 4, avgDemand: 12, avgBoarded: 12, avgEffective: 12 },
      ],
    });
    expect(sig).toHaveLength(1);
    expect(sig[0]?.kind).toBe("overload");
    expect(sig[0]?.details).toContain("07:30");
    expect(sig[0]?.details).toContain("Центр");
    expect(sig[0]?.suggestions.length).toBeGreaterThan(0);
  });
  it("is silent for normal routes and no data", () => {
    const base = { routeId: "r", routeName: "1", capacity: 30, byTime: [], byStop: [] };
    expect(routeSignals({ ...base, stats: routeLoadStatus([mk(80), mk(80), mk(80)]) })).toEqual([]);
    expect(routeSignals({ ...base, stats: routeLoadStatus([]) })).toEqual([]);
  });
});
