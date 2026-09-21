import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEVIATION,
  averageSpeedKph,
  cumulativeDistances,
  distanceToSegment,
  etaFromPosition,
  formatRemaining,
  isDeviating,
  isTrackingMissing,
  plannedSpeedKph,
  projectOnRoute,
  shouldAlertApproaching,
  trackingState,
  type RoutePoint,
} from "../src";

/**
 * A straight west-to-east route near Khujand. One degree of longitude here is
 * about 84.9 km, so 0.01 deg is roughly 849 m.
 */
const route: RoutePoint[] = [
  { stopId: "a", seq: 1, offsetMin: 0, lat: 40.28, lng: 69.6 },
  { stopId: "b", seq: 2, offsetMin: 5, lat: 40.28, lng: 69.62 },
  { stopId: "c", seq: 3, offsetMin: 10, lat: 40.28, lng: 69.64 },
  { stopId: "d", seq: 4, offsetMin: 15, lat: 40.28, lng: 69.66 },
];

const now = new Date("2026-09-21T03:00:00.000Z");

describe("distanceToSegment", () => {
  it("is zero on the line and equals the offset beside it", () => {
    expect(distanceToSegment({ lat: 40.28, lng: 69.61 }, route[0]!, route[1]!)).toBeLessThan(1);
    const off = distanceToSegment({ lat: 40.285, lng: 69.61 }, route[0]!, route[1]!);
    expect(off).toBeGreaterThan(500);
    expect(off).toBeLessThan(600);
  });
  it("clamps to the segment ends", () => {
    const before = distanceToSegment({ lat: 40.28, lng: 69.58 }, route[0]!, route[1]!);
    expect(before).toBeGreaterThan(1600);
    expect(before).toBeLessThan(1800);
  });
  it("handles a zero-length segment", () => {
    expect(distanceToSegment({ lat: 40.28, lng: 69.6 }, route[0]!, route[0]!)).toBeLessThan(1);
  });
});

describe("projectOnRoute", () => {
  it("finds the segment and the distance travelled", () => {
    const p = projectOnRoute({ lat: 40.2805, lng: 69.63 }, route)!;
    expect(p.segmentIndex).toBe(1);
    expect(p.offRouteM).toBeLessThan(100);
    const cum = cumulativeDistances(route);
    expect(p.alongM).toBeGreaterThan(cum[1]!);
    expect(p.alongM).toBeLessThan(cum[2]!);
  });
  it("reports how far the vehicle strayed", () => {
    const p = projectOnRoute({ lat: 40.29, lng: 69.63 }, route)!;
    expect(p.offRouteM).toBeGreaterThan(1000);
  });
  it("returns null for a route with one stop", () => {
    expect(projectOnRoute({ lat: 40.28, lng: 69.6 }, [route[0]!])).toBeNull();
  });
});

describe("etaFromPosition", () => {
  it("estimates arrival from the remaining distance along the route", () => {
    // Halfway between b and c, moving at 30 kph; c is about 850 m away.
    const eta = etaFromPosition({
      position: { lat: 40.28, lng: 69.63, recordedAt: now, speedKph: 30 },
      routeStops: route,
      targetStopId: "c",
      now,
    })!;
    expect(eta.source).toBe("position");
    expect(eta.passed).toBe(false);
    expect(eta.distanceM).toBeGreaterThan(700);
    expect(eta.distanceM).toBeLessThan(950);
    expect(eta.minutesFromNow).toBe(2);
  });

  it("marks stops already behind the vehicle as passed", () => {
    const eta = etaFromPosition({
      position: { lat: 40.28, lng: 69.65, recordedAt: now, speedKph: 30 },
      routeStops: route,
      targetStopId: "b",
      now,
    })!;
    expect(eta.passed).toBe(true);
    expect(eta.minutesFromNow).toBe(0);
  });

  it("ignores an implausible reported speed and uses the fallback", () => {
    const eta = etaFromPosition({
      position: { lat: 40.28, lng: 69.6, recordedAt: now, speedKph: 0 },
      routeStops: route,
      targetStopId: "d",
      now,
      fallbackSpeedKph: 20,
    })!;
    expect(eta.speedKph).toBe(20);
    expect(eta.minutesFromNow).toBeGreaterThan(10);
  });

  it("falls back to a default speed when nothing is known", () => {
    const eta = etaFromPosition({
      position: { lat: 40.28, lng: 69.6, recordedAt: now, speedKph: null },
      routeStops: route,
      targetStopId: "b",
      now,
    })!;
    expect(eta.speedKph).toBe(20);
  });

  it("returns null for an unknown stop", () => {
    expect(
      etaFromPosition({
        position: { lat: 40.28, lng: 69.6, recordedAt: now },
        routeStops: route,
        targetStopId: "zzz",
        now,
      }),
    ).toBeNull();
  });
});

describe("speed helpers", () => {
  it("averages speed across a trail", () => {
    const positions = [
      { lat: 40.28, lng: 69.6, recordedAt: new Date(now.getTime()) },
      { lat: 40.28, lng: 69.605, recordedAt: new Date(now.getTime() + 30_000) },
      { lat: 40.28, lng: 69.61, recordedAt: new Date(now.getTime() + 60_000) },
    ];
    const kph = averageSpeedKph(positions)!;
    expect(kph).toBeGreaterThan(40);
    expect(kph).toBeLessThan(60);
  });
  it("returns null when the trail is too short", () => {
    expect(averageSpeedKph([])).toBeNull();
    expect(averageSpeedKph([{ lat: 40.28, lng: 69.6, recordedAt: now }])).toBeNull();
  });
  it("derives the planned speed from offsets", () => {
    const kph = plannedSpeedKph(route)!;
    expect(kph).toBeGreaterThan(15);
    expect(kph).toBeLessThan(30);
  });
});

describe("tracking state", () => {
  it("classifies by age of the last position", () => {
    expect(trackingState(null, now)).toBe("none");
    expect(trackingState(new Date(now.getTime() - 30_000), now)).toBe("live");
    expect(trackingState(new Date(now.getTime() - 120_000), now)).toBe("stale");
    expect(trackingState(new Date(now.getTime() - 600_000), now)).toBe("lost");
  });
});

describe("deviation and missing transport", () => {
  it("needs several consecutive off-route readings", () => {
    expect(isDeviating([50, 400, 500])).toBe(false);
    expect(isDeviating([400, 500, 600])).toBe(true);
    expect(isDeviating([400, 500])).toBe(false);
    expect(isDeviating([400, null, 600])).toBe(false);
  });
  it("flags a started trip that stopped reporting", () => {
    const startedAt = new Date(now.getTime() - 30 * 60_000);
    expect(isTrackingMissing(startedAt, new Date(now.getTime() - 60_000), now)).toBe(false);
    expect(isTrackingMissing(startedAt, new Date(now.getTime() - 20 * 60_000), now)).toBe(true);
    expect(isTrackingMissing(null, null, now)).toBe(false);
    expect(isTrackingMissing(startedAt, null, now)).toBe(true);
  });
});

describe("approaching alert", () => {
  it("fires inside the window only", () => {
    expect(shouldAlertApproaching({ minutesFromNow: 4, passed: false })).toBe(true);
    expect(shouldAlertApproaching({ minutesFromNow: 0, passed: false })).toBe(true);
    expect(shouldAlertApproaching({ minutesFromNow: 9, passed: false })).toBe(false);
    expect(shouldAlertApproaching({ minutesFromNow: 2, passed: true })).toBe(false);
  });
  it("respects a custom window", () => {
    expect(shouldAlertApproaching({ minutesFromNow: 9, passed: false }, { ...DEFAULT_DEVIATION, approachMin: 10 })).toBe(true);
  });
});

describe("formatRemaining", () => {
  it("rounds metres and switches to kilometres", () => {
    expect(formatRemaining(340)).toBe("350 м");
    expect(formatRemaining(1450)).toBe("1,5 км");
  });
});
