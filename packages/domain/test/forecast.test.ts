import { describe, expect, it } from "vitest";
import { forecastDemand, forecastTrip, peakDepartures, tripLoad, weekdayOfDate, type TripLoadRecord } from "../src";

/** A completed trip with a known number of riders. */
function rec(date: string, startTime: string, riders: number, capacity = 30): TripLoadRecord {
  return {
    ...tripLoad({ capacity, demand: riders, events: [] }),
    tripId: `${date}-${startTime}`,
    routeId: "r1",
    date,
    startTime,
    weekday: weekdayOfDate(date),
  };
}

// 2026-09-07 is a Monday, so these are three Mondays and three Tuesdays.
const history: TripLoadRecord[] = [
  rec("2026-09-07", "07:30", 28),
  rec("2026-09-14", "07:30", 30),
  rec("2026-09-21", "07:30", 32),
  rec("2026-09-08", "07:30", 20),
  rec("2026-09-15", "07:30", 22),
  rec("2026-09-22", "07:30", 21),
  rec("2026-09-07", "08:00", 9),
  rec("2026-09-14", "08:00", 8),
  rec("2026-09-21", "08:00", 10),
];

describe("forecastDemand", () => {
  it("uses the same departure on the same weekday when there is enough history", () => {
    const f = forecastDemand(history, { date: "2026-09-28", startTime: "07:30" }); // a Monday
    expect(f.basis).toBe("same_time_weekday");
    expect(f.samples).toBe(3);
    expect(f.low).toBe(28);
    expect(f.high).toBe(32);
    // Recent Mondays weigh more, so the estimate sits above the plain mean of 30.
    expect(f.expected).toBeGreaterThanOrEqual(30);
    expect(f.expected).toBeLessThanOrEqual(32);
  });

  it("separates weekdays: Tuesday is much quieter here", () => {
    const monday = forecastDemand(history, { date: "2026-09-28", startTime: "07:30" });
    const tuesday = forecastDemand(history, { date: "2026-09-29", startTime: "07:30" });
    expect(tuesday.basis).toBe("same_time_weekday");
    expect(tuesday.expected).toBeLessThan(monday.expected - 5);
  });

  it("widens to the same departure on other days when the weekday is new", () => {
    const f = forecastDemand(history, { date: "2026-09-26", startTime: "07:30" }); // a Saturday
    expect(f.basis).toBe("same_time");
    expect(f.samples).toBe(6);
  });

  it("widens to the whole route for an unknown departure time", () => {
    const f = forecastDemand(history, { date: "2026-09-28", startTime: "06:45" });
    expect(f.basis).toBe("same_weekday");
    expect(f.samples).toBeGreaterThan(0);
  });

  it("reports no data for empty history", () => {
    const f = forecastDemand([], { date: "2026-09-28", startTime: "07:30" });
    expect(f).toMatchObject({ basis: "none", confidence: "none", expected: 0, samples: 0 });
  });

  it("weighs recent trips more than old ones", () => {
    const rising = [rec("2026-08-01", "07:30", 10), rec("2026-09-19", "07:30", 30), rec("2026-09-20", "07:30", 30)];
    const f = forecastDemand(rising, { date: "2026-09-21", startTime: "07:30" }, { halfLifeDays: 7 });
    expect(f.expected).toBeGreaterThan(25);
  });

  it("marks a small sample as low confidence", () => {
    const thin = [rec("2026-09-21", "07:30", 12)];
    expect(forecastDemand(thin, { date: "2026-09-28", startTime: "07:30" }).confidence).toBe("low");
  });
});

describe("forecastTrip", () => {
  const trip = (capacity: number | null) => ({ tripId: "t1", date: "2026-09-28", startTime: "07:30", capacity });

  it("flags a departure that will not fit everyone", () => {
    const f = forecastTrip(trip(25), history);
    expect(f.risk).toBe("overflow");
    expect(f.shortfall).toBeGreaterThan(0);
    expect(f.loadPct).toBeGreaterThan(100);
  });

  it("warns when only the busiest days overflow", () => {
    const f = forecastTrip(trip(31), history);
    expect(f.risk).toBe("tight");
    expect(f.shortfall).toBe(0);
  });

  it("reports normal and low load", () => {
    expect(forecastTrip(trip(40), history).risk).toBe("normal");
    expect(forecastTrip({ ...trip(90), startTime: "08:00" }, history).risk).toBe("low");
  });

  it("cannot judge without a vehicle or without history", () => {
    expect(forecastTrip(trip(null), history).risk).toBe("unknown");
    expect(forecastTrip(trip(30), []).risk).toBe("unknown");
  });
});

describe("peakDepartures", () => {
  it("ranks departures by how many people are left behind", () => {
    const forecasts = [
      forecastTrip({ tripId: "a", date: "2026-09-28", startTime: "07:30", capacity: 25 }, history),
      forecastTrip({ tripId: "b", date: "2026-09-28", startTime: "08:00", capacity: 30 }, history),
    ];
    const peaks = peakDepartures(forecasts);
    expect(peaks).toHaveLength(1);
    expect(peaks[0]?.startTime).toBe("07:30");
    expect(peaks[0]?.shortfall).toBeGreaterThan(0);
  });

  it("is empty when everything fits", () => {
    const fine = [forecastTrip({ tripId: "a", date: "2026-09-28", startTime: "08:00", capacity: 30 }, history)];
    expect(peakDepartures(fine)).toEqual([]);
  });
});
