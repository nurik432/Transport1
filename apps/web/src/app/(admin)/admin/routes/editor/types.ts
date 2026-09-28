/** Shapes the route editor passes around. No logic lives here. */

export interface StopOption {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** One point of the route as it arrives from the server. */
export interface EditorPointInit {
  /** null for a point placed on the map; the stop is created on save */
  stopId: string | null;
  name: string;
  /** filled in by the place search, carried into the stop that gets created */
  address: string;
  lat: number;
  lng: number;
  offsetMin: number;
}

export interface EditorPoint extends EditorPointInit {
  /**
   * Stable local id. React keys, the drag handles and the map markers all use
   * it, so reordering keeps the focus and the map does not re-fit. It never
   * reaches the database.
   */
  uid: string;
  /**
   * The administrator typed this time. An automatic recalculation must leave it
   * alone, or it would silently undo their correction.
   */
  offsetManual: boolean;
}

export interface RouteEditorInit {
  id?: string;
  name: string;
  description: string;
  direction: "to_work" | "from_work";
  status: "draft" | "active" | "inactive";
  color: string;
  /** empty string means "not set" */
  plannedCapacity: string;
  stops: EditorPointInit[];
  departures: string[];
  daysOfWeek: number[];
}

export interface RouteEditorValue extends Omit<RouteEditorInit, "stops"> {
  stops: EditorPoint[];
}

export interface VersionSummary {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  isCurrent: boolean;
  stopCount: number;
  tripCount: number;
  completedTripCount: number;
  pathSource: "road" | "straight" | null;
  pathDistanceM: number | null;
  stopNames: string[];
}

/** Server-side facts the readiness checklist cannot work out in the browser. */
export interface ReadinessFacts {
  plannedTripCount: number;
  unassignedTripCount: number;
  hasVehicles: boolean;
  /** today in the company time zone, from the server: the client must not
   * compute it, or a render either side of midnight would not match */
  today: string;
}

export const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ea580c", "#7c3aed", "#0891b2"];

export const WEEKDAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1).replace(".", ",")} км`;
}
