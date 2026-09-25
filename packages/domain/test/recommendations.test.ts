import { describe, expect, it } from "vitest";
import { RELIEF_GAP_MIN, reliefDeparture, routeSignals, type BucketStats, type StopLoadStats } from "../src";

describe("reliefDeparture", () => {
  it("places the extra departure a fixed gap before the peak one", () => {
    expect(reliefDeparture("07:30")).toBe("07:15");
    expect(RELIEF_GAP_MIN).toBe(15);
  });

  it("accepts a custom gap and never crosses midnight backwards", () => {
    expect(reliefDeparture("07:30", 40)).toBe("06:50");
    expect(reliefDeparture("00:05")).toBe("00:00");
  });
});

const bucket = (label: string, avgPct: number, avgPassengers: number): BucketStats => ({
  key: label,
  label,
  trips: 5,
  avgPct,
  maxPct: avgPct + 10,
  avgPassengers,
  overloadedTrips: 4,
});

const stop = (stopName: string, avgEffective: number): StopLoadStats => ({
  stopId: stopName,
  stopName,
  seq: 1,
  demand: 0,
  boarded: 0,
  trips: 5,
  avgDemand: avgEffective,
  avgBoarded: avgEffective,
  avgEffective,
});

describe("routeSignals", () => {
  it("names the peak departure and the relief one on an overload signal", () => {
    const signals = routeSignals({
      routeId: "r1",
      routeName: "1",
      capacity: 20,
      stats: {
        status: "overloaded",
        trips: 10,
        avgPct: 110,
        maxPct: 122,
        avgPassengers: 22,
        maxPassengers: 24,
        overloadedTrips: 8,
        overloadedShare: 0.8,
      },
      byTime: [bucket("07:00", 62, 12), bucket("07:30", 110, 22)],
      byStop: [stop("18-й мкр", 9), stop("Школа №12", 7)],
    });

    const signal = signals[0]!;
    expect(signal.kind).toBe("overload");
    expect(signal.peakTime).toBe("07:30");
    expect(signal.reliefTime).toBe("07:15");
    expect(signal.peakPassengers).toBe(22);
  });

  it("leaves the peak fields empty for an under-used route", () => {
    const signals = routeSignals({
      routeId: "r2",
      routeName: "6",
      capacity: 20,
      stats: {
        status: "low",
        trips: 10,
        avgPct: 35,
        maxPct: 45,
        avgPassengers: 7,
        maxPassengers: 9,
        overloadedTrips: 0,
        overloadedShare: 0,
      },
      byTime: [bucket("07:00", 35, 7)],
      byStop: [stop("Гулистон", 4)],
    });

    const signal = signals[0]!;
    expect(signal.kind).toBe("low_load");
    expect(signal.peakTime).toBeNull();
    expect(signal.reliefTime).toBeNull();
  });
});
