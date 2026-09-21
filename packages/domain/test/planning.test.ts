import { describe, expect, it } from "vitest";
import {
  clusterHomes,
  proposeRoute,
  proposeRoutes,
  suggestStopsOnRoutes,
  underservedClusters,
  withNearestStops,
  type HomePoint,
  type StopPoint,
} from "../src";

/** Two tight groups of homes plus one person living on their own. */
const homes: HomePoint[] = [
  { passengerId: "a1", name: "А1", lat: 40.3, lng: 69.61 },
  { passengerId: "a2", name: "А2", lat: 40.301, lng: 69.6115 },
  { passengerId: "a3", name: "А3", lat: 40.2995, lng: 69.609 },
  { passengerId: "b1", name: "Б1", lat: 40.24, lng: 69.7 },
  { passengerId: "b2", name: "Б2", lat: 40.241, lng: 69.7015 },
  { passengerId: "b3", name: "Б3", lat: 40.2395, lng: 69.699 },
  { passengerId: "b4", name: "Б4", lat: 40.2405, lng: 69.7008 },
  { passengerId: "z1", name: "Одиночка", lat: 40.35, lng: 69.75 },
];

const office: StopPoint = { id: "office", name: "Головной офис", lat: 40.269, lng: 69.665 };
const nearB: StopPoint = { id: "s-b", name: "Бустон", lat: 40.2405, lng: 69.7005 };
const stops: StopPoint[] = [office, nearB];

describe("clusterHomes", () => {
  it("finds the two groups and drops the single address", () => {
    const clusters = clusterHomes(homes);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.size)).toEqual([4, 3]);
    expect(clusters[0]?.names).toContain("Б1");
    expect(clusters.flatMap((c) => c.members)).not.toContain("z1");
  });

  it("keeps small groups when asked", () => {
    const clusters = clusterHomes(homes, { minSize: 1 });
    expect(clusters).toHaveLength(3);
    expect(clusters.at(-1)?.size).toBe(1);
  });

  it("reports how spread out a group is", () => {
    const [biggest] = clusterHomes(homes);
    expect(biggest!.spreadM).toBeGreaterThan(0);
    expect(biggest!.spreadM).toBeLessThan(700);
  });

  it("is deterministic and handles empty input", () => {
    expect(clusterHomes([])).toEqual([]);
    const first = clusterHomes(homes).map((c) => c.id);
    const second = clusterHomes([...homes].reverse()).map((c) => c.id);
    expect(second).toEqual(first);
  });

  it("splits groups that are farther apart than the radius", () => {
    expect(clusterHomes(homes, { radiusM: 100, minSize: 1 }).length).toBeGreaterThan(3);
  });
});

describe("nearest stops and coverage", () => {
  it("attaches the closest stop to each group", () => {
    const clusters = withNearestStops(clusterHomes(homes), stops);
    const groupB = clusters.find((c) => c.size === 4)!;
    expect(groupB.nearestStop?.id).toBe("s-b");
    expect(groupB.nearestStop?.distanceM).toBeLessThan(200);
  });

  it("reports only the groups that cannot walk to a stop", () => {
    const clusters = withNearestStops(clusterHomes(homes), stops);
    const uncovered = underservedClusters(clusters, 600);
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0]?.size).toBe(3);
  });

  it("treats everything as uncovered when there are no stops", () => {
    const clusters = withNearestStops(clusterHomes(homes), []);
    expect(underservedClusters(clusters, 600)).toHaveLength(2);
  });
});

describe("proposeRoute", () => {
  const clusters = withNearestStops(clusterHomes(homes), stops);

  it("collects the farthest group first and ends at the office", () => {
    const proposal = proposeRoute(clusters, office, stops)!;
    expect(proposal.stops).toHaveLength(3);
    expect(proposal.stops.at(-1)?.stopId).toBe("office");
    // Group A is farther from the office than group B, so it is picked up first.
    expect(proposal.stops[0]?.expectedPassengers).toBe(3);
    expect(proposal.stops[1]?.expectedPassengers).toBe(4);
  });

  it("reuses an existing stop next to a group and marks the other as new", () => {
    const proposal = proposeRoute(clusters, office, stops)!;
    expect(proposal.stops[0]?.isNew).toBe(true);
    expect(proposal.stops[0]?.stopId).toBeNull();
    expect(proposal.stops[1]?.isNew).toBe(false);
    expect(proposal.stops[1]?.stopId).toBe("s-b");
  });

  it("produces increasing arrival offsets and a sane duration", () => {
    const proposal = proposeRoute(clusters, office, stops)!;
    const offsets = proposal.stops.map((s) => s.offsetMin);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeGreaterThan(offsets[0]!);
    expect(offsets[2]).toBeGreaterThan(offsets[1]!);
    expect(proposal.durationMin).toBeGreaterThan(10);
    expect(proposal.durationMin).toBeLessThan(120);
    expect(proposal.expectedPassengers).toBe(7);
  });

  it("returns nothing without groups", () => {
    expect(proposeRoute([], office, stops)).toBeNull();
  });
});

describe("suggestStopsOnRoutes", () => {
  it("offers to add a stop when a group sits close to an existing line", () => {
    const clusters = withNearestStops(clusterHomes(homes), stops);
    const suggestions = suggestStopsOnRoutes(clusters, [
      { id: "r1", name: "№1", points: [{ lat: 40.295, lng: 69.6 }, { lat: 40.305, lng: 69.62 }] },
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.routeName).toBe("№1");
    expect(suggestions[0]?.detourM).toBeLessThan(800);
  });

  it("stays silent when the line is far away or the group is already served", () => {
    const clusters = withNearestStops(clusterHomes(homes), stops);
    const far = suggestStopsOnRoutes(clusters, [
      { id: "r2", name: "№2", points: [{ lat: 40.1, lng: 69.9 }, { lat: 40.12, lng: 69.92 }] },
    ]);
    expect(far).toEqual([]);
  });
});

describe("proposeRoutes", () => {
  it("keeps nearby groups on one route", () => {
    const clusters = withNearestStops(clusterHomes(homes), stops);
    const proposals = proposeRoutes(clusters, office, stops, { maxLegM: 20_000 });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.expectedPassengers).toBe(7);
  });

  it("splits groups that are too far apart into separate routes", () => {
    const clusters = withNearestStops(clusterHomes(homes), stops);
    const proposals = proposeRoutes(clusters, office, stops, { maxLegM: 3000 });
    expect(proposals).toHaveLength(2);
    // The bigger group is offered first.
    expect(proposals[0]?.expectedPassengers).toBe(4);
    expect(proposals[1]?.expectedPassengers).toBe(3);
    for (const p of proposals) {
      expect(p.stops.at(-1)?.stopId).toBe("office");
      expect(p.durationMin).toBeLessThan(60);
    }
  });

  it("returns nothing without groups", () => {
    expect(proposeRoutes([], office, stops)).toEqual([]);
  });
});
