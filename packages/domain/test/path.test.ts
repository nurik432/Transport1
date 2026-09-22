import { describe, expect, it } from "vitest";
import {
  cumulativeAlong,
  distanceToSegment,
  etaOnPath,
  pathFromStops,
  plannedSpeedOnPath,
  preparePath,
  projectOnPath,
  type LatLng,
  type PathStopInput,
} from "../src";

/*
 * Two stops 1.7 km apart in a straight line, but the road makes a detour
 * north and back: the driving distance is roughly twice the straight line.
 * One degree of longitude here is about 849 m, one degree of latitude 111 km.
 */
const stopA: LatLng = { lat: 40.28, lng: 69.6 };
const stopB: LatLng = { lat: 40.28, lng: 69.62 };

const roadPoints: LatLng[] = [
  { lat: 40.28, lng: 69.6 },
  { lat: 40.288, lng: 69.6 },
  { lat: 40.288, lng: 69.62 },
  { lat: 40.28, lng: 69.62 },
];

const pathStops: PathStopInput[] = [
  { stopId: "a", seq: 1, offsetMin: 0, ...stopA },
  { stopId: "b", seq: 2, offsetMin: 10, ...stopB },
];

const now = new Date("2026-09-22T03:00:00.000Z");

describe("cumulativeAlong", () => {
  it("measures the polyline, not the straight line", () => {
    const cum = cumulativeAlong(roadPoints);
    expect(cum).toHaveLength(4);
    expect(cum[0]).toBe(0);
    const straight = cumulativeAlong([stopA, stopB]).at(-1)!;
    expect(straight).toBeGreaterThan(1600);
    expect(straight).toBeLessThan(1800);
    // The detour adds two 890 m legs north and south.
    expect(cum.at(-1)!).toBeGreaterThan(straight * 1.9);
  });

  it("handles empty and single-point input", () => {
    expect(cumulativeAlong([])).toEqual([]);
    expect(cumulativeAlong([stopA])).toEqual([0]);
  });
});

describe("preparePath", () => {
  it("locates each stop on the polyline and measures road distance", () => {
    const path = preparePath(roadPoints, pathStops)!;
    expect(path.stops.map((s) => s.stopId)).toEqual(["a", "b"]);
    expect(path.stops[0]?.pointIndex).toBe(0);
    expect(path.stops[1]?.pointIndex).toBe(3);
    expect(path.stops[1]?.distanceM).toBeGreaterThan(3400);
  });

  it("keeps a road distance supplied by the routing provider", () => {
    const path = preparePath(roadPoints, [
      pathStops[0]!,
      { ...pathStops[1]!, distanceM: 4200 },
    ])!;
    expect(path.stops[1]?.distanceM).toBe(4200);
  });

  it("refuses input that cannot describe a route", () => {
    expect(preparePath([stopA], pathStops)).toBeNull();
    expect(preparePath(roadPoints, [pathStops[0]!])).toBeNull();
  });
});

describe("projectOnPath", () => {
  it("treats a vehicle on the detour as on the route", () => {
    const onDetour: LatLng = { lat: 40.288, lng: 69.61 };
    const path = preparePath(roadPoints, pathStops)!;
    const projection = projectOnPath(onDetour, path)!;
    expect(projection.offRouteM).toBeLessThan(50);

    // The same vehicle is far from the straight line between the stops.
    expect(distanceToSegment(onDetour, stopA, stopB)).toBeGreaterThan(800);
  });

  it("reports how far along the road the vehicle has travelled", () => {
    const path = preparePath(roadPoints, pathStops)!;
    const atCorner = projectOnPath({ lat: 40.288, lng: 69.6 }, path)!;
    expect(atCorner.alongM).toBeGreaterThan(850);
    expect(atCorner.alongM).toBeLessThan(950);
  });
});

describe("etaOnPath", () => {
  it("counts the remaining distance along the road", () => {
    const path = preparePath(roadPoints, pathStops)!;
    const eta = etaOnPath({
      position: { ...stopA, recordedAt: now, speedKph: 30 },
      path,
      targetStopId: "b",
      now,
    })!;
    expect(eta.distanceM).toBeGreaterThan(3400);
    // Straight-line geometry would have promised roughly half the time.
    expect(eta.minutesFromNow).toBeGreaterThan(6);
  });

  it("is shorter on the straight-line fallback", () => {
    const straightPath = pathFromStops([
      { stopId: "a", seq: 1, offsetMin: 0, ...stopA },
      { stopId: "b", seq: 2, offsetMin: 10, ...stopB },
    ])!;
    const eta = etaOnPath({
      position: { ...stopA, recordedAt: now, speedKph: 30 },
      path: straightPath,
      targetStopId: "b",
      now,
    })!;
    expect(eta.distanceM).toBeLessThan(1800);
  });

  it("reuses a projection across stops", () => {
    const path = preparePath(roadPoints, pathStops)!;
    const position = { lat: 40.288, lng: 69.61, recordedAt: now, speedKph: 30 };
    const projection = projectOnPath(position, path);
    const withReuse = etaOnPath({ position, path, targetStopId: "b", now, projection });
    const without = etaOnPath({ position, path, targetStopId: "b", now });
    expect(withReuse?.distanceM).toBe(without?.distanceM);
  });

  it("marks a stop already behind the vehicle as passed", () => {
    const path = preparePath(roadPoints, pathStops)!;
    const eta = etaOnPath({
      position: { lat: 40.28, lng: 69.6199, recordedAt: now, speedKph: 30 },
      path,
      targetStopId: "a",
      now,
    })!;
    expect(eta.passed).toBe(true);
  });

  it("returns null for an unknown stop", () => {
    const path = preparePath(roadPoints, pathStops)!;
    expect(etaOnPath({ position: { ...stopA, recordedAt: now }, path, targetStopId: "zzz", now })).toBeNull();
  });
});

describe("plannedSpeedOnPath", () => {
  it("derives a higher speed from road distance than from the straight line", () => {
    const road = plannedSpeedOnPath(preparePath(roadPoints, pathStops))!;
    const straight = plannedSpeedOnPath(
      pathFromStops([
        { stopId: "a", seq: 1, offsetMin: 0, ...stopA },
        { stopId: "b", seq: 2, offsetMin: 10, ...stopB },
      ]),
    )!;
    expect(road).toBeGreaterThan(straight * 1.8);
  });

  it("returns null when it cannot be derived", () => {
    expect(plannedSpeedOnPath(null)).toBeNull();
    const zeroTime = preparePath(roadPoints, [
      { stopId: "a", seq: 1, offsetMin: 5, ...stopA },
      { stopId: "b", seq: 2, offsetMin: 5, ...stopB },
    ]);
    expect(plannedSpeedOnPath(zeroTime)).toBeNull();
  });
});
