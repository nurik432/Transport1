import { describe, expect, it } from "vitest";
import {
  applySuggestedOffsets,
  canLeaveStep,
  firstIncompleteStep,
  normalizeRouteForm,
  normalizeRouteShape,
  pendingReadiness,
  routeReadiness,
  routeStepBlockers,
  stopArrivalMinutes,
  validateRouteForm,
  type RouteFormInput,
  type RouteFormPoint,
  type RouteReadinessInput,
} from "../src";

function point(over: Partial<RouteFormPoint> = {}): RouteFormPoint {
  return { stopId: "s1", name: "Панчшанбе", lat: 40.287, lng: 69.6265, offsetMin: 0, ...over };
}

function form(over: Partial<RouteFormInput> = {}): RouteFormInput {
  return {
    name: "№5",
    direction: "to_work",
    status: "active",
    color: "#2563eb",
    plannedCapacity: 30,
    stops: [point(), point({ stopId: "s2", name: "Офис", offsetMin: 18 })],
    departures: ["07:00"],
    daysOfWeek: [1, 2, 3, 4, 5],
    ...over,
  };
}

describe("validateRouteForm", () => {
  it("accepts a complete form", () => {
    const { errors, warnings } = validateRouteForm(form());
    expect(errors).toEqual({});
    expect(warnings).toEqual({});
  });

  it("requires a route number", () => {
    expect(validateRouteForm(form({ name: "   " })).errors.name).toBe("Укажите номер маршрута");
  });

  it("rejects a colour that is not #RRGGBB", () => {
    expect(validateRouteForm(form({ color: "blue" })).errors.color).toBeDefined();
  });

  it("checks planned capacity range, but allows it to be unset", () => {
    expect(validateRouteForm(form({ plannedCapacity: null })).errors.plannedCapacity).toBeUndefined();
    expect(validateRouteForm(form({ plannedCapacity: 201 })).errors.plannedCapacity).toBeDefined();
    expect(validateRouteForm(form({ plannedCapacity: -1 })).errors.plannedCapacity).toBeDefined();
  });

  it("needs at least two stops", () => {
    expect(validateRouteForm(form({ stops: [point()] })).errors.stops).toBe(
      "В маршруте должно быть минимум две остановки",
    );
  });

  it("refuses more points than the router accepts", () => {
    const stops = Array.from({ length: 26 }, (_, i) => point({ stopId: `s${i}`, offsetMin: i }));
    expect(validateRouteForm(form({ stops })).errors.stops).toContain("25");
  });

  it("names the duplicated stop and where it already is", () => {
    const stops = [point(), point({ stopId: "s2", name: "Офис", offsetMin: 9 }), point({ offsetMin: 18 })];
    expect(validateRouteForm(form({ stops })).errors["stops.2.stopId"]).toBe(
      "Остановка «Панчшанбе» уже стоит в маршруте под номером 1",
    );
  });

  it("points at the exact new stop that has no name", () => {
    const stops = [point(), point({ stopId: null, name: "  ", offsetMin: 7 })];
    expect(validateRouteForm(form({ stops })).errors["stops.1.name"]).toBe("Укажите название остановки");
  });

  it("keeps offsets whole and inside the day", () => {
    const stops = [point(), point({ stopId: "s2", offsetMin: 601 })];
    expect(validateRouteForm(form({ stops })).errors["stops.1.offsetMin"]).toBeDefined();
    const fractional = [point(), point({ stopId: "s2", offsetMin: 4.5 })];
    expect(validateRouteForm(form({ stops: fractional })).errors["stops.1.offsetMin"]).toBeDefined();
  });

  it("warns about offsets going backwards instead of blocking the save", () => {
    const stops = [point({ offsetMin: 10 }), point({ stopId: "s2", name: "Офис", offsetMin: 4 })];
    const { errors, warnings } = validateRouteForm(form({ stops }));
    expect(errors["stops.1.offsetMin"]).toBeUndefined();
    expect(warnings["stops.1.offsetMin"]).toBe("Время меньше, чем на предыдущей остановке");
  });

  it("treats a route without departures as valid", () => {
    expect(validateRouteForm(form({ departures: [] })).errors).toEqual({});
  });

  it("rejects departures with no weekday, because they never make a trip", () => {
    expect(validateRouteForm(form({ daysOfWeek: [] })).errors.daysOfWeek).toContain("день недели");
  });

  it("ignores empty weekdays when there are no departures either", () => {
    expect(validateRouteForm(form({ departures: [], daysOfWeek: [] })).errors.daysOfWeek).toBeUndefined();
  });

  it("checks the departure format and catches duplicates", () => {
    expect(validateRouteForm(form({ departures: ["7:00"] })).errors["departures.0"]).toBe("Время в формате ЧЧ:ММ");
    expect(validateRouteForm(form({ departures: ["25:00"] })).errors["departures.0"]).toBe("Время в формате ЧЧ:ММ");
    expect(validateRouteForm(form({ departures: ["07:00", "07:00"] })).errors["departures.1"]).toContain("уже добавлено");
  });
});

describe("routeStepBlockers", () => {
  it("blocks the first step only on its own fields", () => {
    const reasons = routeStepBlockers(0, form({ name: "", stops: [point()] }));
    expect(reasons).toEqual(["Укажите номер маршрута"]);
  });

  it("blocks the points step when there is one stop", () => {
    expect(routeStepBlockers(1, form({ stops: [point()] }))).toEqual([
      "В маршруте должно быть минимум две остановки",
    ]);
  });

  it("blocks the schedule step when weekdays are missing", () => {
    expect(routeStepBlockers(2, form({ daysOfWeek: [] }))[0]).toContain("день недели");
  });

  it("lets a complete form through every step", () => {
    for (const step of [0, 1, 2, 3] as const) expect(canLeaveStep(step, form())).toBe(true);
  });

  it("reports each message once even when several fields share it", () => {
    const stops = [point({ stopId: null, name: "" }), point({ stopId: null, name: "" })];
    expect(routeStepBlockers(1, form({ stops }))).toEqual(["Укажите название остановки"]);
  });
});

describe("firstIncompleteStep", () => {
  it("finds the earliest step that still has a problem", () => {
    expect(firstIncompleteStep(form({ name: "", stops: [point()] }))).toBe(0);
    expect(firstIncompleteStep(form({ stops: [point()] }))).toBe(1);
    expect(firstIncompleteStep(form({ daysOfWeek: [] }))).toBe(2);
    expect(firstIncompleteStep(form())).toBe(3);
  });
});

describe("normalizeRouteForm", () => {
  it("ignores the order departures were typed in", () => {
    expect(normalizeRouteForm(form({ departures: ["08:30", "07:00"] }))).toBe(
      normalizeRouteForm(form({ departures: ["07:00", "08:30"] })),
    );
  });

  it("ignores the order weekdays were toggled in", () => {
    expect(normalizeRouteForm(form({ daysOfWeek: [5, 1, 3] }))).toBe(
      normalizeRouteForm(form({ daysOfWeek: [1, 3, 5] })),
    );
  });

  it("changes when the stop order changes", () => {
    const a = form();
    const b = form({ stops: [...a.stops].reverse() });
    expect(normalizeRouteForm(b)).not.toBe(normalizeRouteForm(a));
  });

  it("changes when an offset changes", () => {
    const stops = [point(), point({ stopId: "s2", name: "Офис", offsetMin: 19 })];
    expect(normalizeRouteForm(form({ stops }))).not.toBe(normalizeRouteForm(form()));
  });

  it("tells two unsaved points apart by their coordinates", () => {
    const one = [point(), point({ stopId: null, name: "Новая", lat: 40.3, lng: 69.7, offsetMin: 5 })];
    const two = [point(), point({ stopId: null, name: "Новая", lat: 40.31, lng: 69.7, offsetMin: 5 })];
    expect(normalizeRouteShape(one)).not.toBe(normalizeRouteShape(two));
  });

  it("does not react to a renamed stop, which is not part of the shape", () => {
    const renamed = [point({ name: "Площадь" }), point({ stopId: "s2", name: "Офис", offsetMin: 18 })];
    expect(normalizeRouteShape(renamed)).toBe(normalizeRouteShape(form().stops));
  });
});

describe("routeReadiness", () => {
  function facts(over: Partial<RouteReadinessInput> = {}): RouteReadinessInput {
    return {
      status: "active",
      stopCount: 4,
      departureCount: 2,
      daysOfWeek: [1, 2, 3, 4, 5],
      plannedTripCount: 10,
      unassignedTripCount: 0,
      hasVehicles: true,
      dirty: false,
      ...over,
    };
  }

  it("closes everything for a route that is really running", () => {
    expect(pendingReadiness(routeReadiness(facts()))).toEqual([]);
  });

  it("leaves only the status open for a fully prepared draft", () => {
    const pending = pendingReadiness(routeReadiness(facts({ status: "draft" })));
    expect(pending.map((s) => s.key)).toEqual(["status"]);
  });

  it("explains that a draft is invisible to passengers", () => {
    const step = routeReadiness(facts({ status: "draft" })).find((s) => s.key === "status");
    expect(step?.hint).toContain("Черновик");
  });

  it("blocks on unsaved changes", () => {
    const keys = pendingReadiness(routeReadiness(facts({ dirty: true }))).map((s) => s.key);
    expect(keys).toContain("saved");
  });

  it("opens the crew item while some trips have nobody assigned", () => {
    const step = routeReadiness(facts({ unassignedTripCount: 3 })).find((s) => s.key === "crew");
    expect(step?.done).toBe(false);
    expect(step?.hint).toContain("3 рейса");
  });

  it("says the fleet is empty rather than counting trips", () => {
    const step = routeReadiness(facts({ hasVehicles: false, unassignedTripCount: 3 })).find((s) => s.key === "crew");
    expect(step?.hint).toContain("нет активного транспорта");
  });

  it("does not claim the crew is assigned when there are no trips at all", () => {
    const steps = routeReadiness(facts({ plannedTripCount: 0, unassignedTripCount: 0 }));
    expect(steps.find((s) => s.key === "trips")?.done).toBe(false);
    expect(steps.find((s) => s.key === "crew")?.done).toBe(false);
  });

  it("asks for weekdays once a departure exists", () => {
    const step = routeReadiness(facts({ daysOfWeek: [] })).find((s) => s.key === "departures");
    expect(step?.done).toBe(false);
    expect(step?.hint).toContain("дни недели");
  });
});

describe("applySuggestedOffsets", () => {
  const points = [
    { offsetMin: 0, offsetManual: false },
    { offsetMin: 5, offsetManual: true },
    { offsetMin: 10, offsetManual: false },
  ];

  it("fills the automatic offsets and leaves the manual one alone", () => {
    const next = applySuggestedOffsets(points, [0, 7, 14]);
    expect(next.map((p) => p.offsetMin)).toEqual([0, 5, 14]);
  });

  it("keeps values the suggestion does not cover", () => {
    expect(applySuggestedOffsets(points, [0]).map((p) => p.offsetMin)).toEqual([0, 5, 10]);
  });

  it("returns the same object when nothing changes, so React can skip work", () => {
    const next = applySuggestedOffsets(points, [0, 99, 10]);
    expect(next[0]).toBe(points[0]);
    expect(next[1]).toBe(points[1]);
    expect(next[2]).toBe(points[2]);
  });

  it("carries the manual flag with the point when the order changes", () => {
    const reordered = [points[2]!, points[1]!, points[0]!];
    const next = applySuggestedOffsets(reordered, [0, 6, 12]);
    expect(next.map((p) => p.offsetManual)).toEqual([false, true, false]);
    expect(next.map((p) => p.offsetMin)).toEqual([0, 5, 12]);
  });
});

describe("stopArrivalMinutes", () => {
  it("adds each offset to the departure", () => {
    const stops = [point(), point({ stopId: "s2", offsetMin: 4 }), point({ stopId: "s3", offsetMin: 18 })];
    expect(stopArrivalMinutes(7 * 60, stops)).toEqual([420, 424, 438]);
  });
});
