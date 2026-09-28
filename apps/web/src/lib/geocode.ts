import "server-only";

/**
 * Finding a place by name, so a stop can be placed without copying coordinates
 * by hand from another map.
 *
 * The provider is Nominatim-compatible and configurable: point `GEOCODER_URL` at
 * a self-hosted instance for production. The public server allows no more than
 * one request per second and requires a User-Agent that identifies the caller,
 * which is why the browser never talks to it directly — every search goes
 * through this module, which caches results and paces the outgoing calls.
 *
 * A provider that is down is not an error the administrator has to solve: the
 * search returns no places with an explanatory note, and placing the point on
 * the map still works. Same spirit as the straight-line fallback in routing.ts.
 */

const REQUEST_TIMEOUT_MS = 8_000;
/** The public provider's floor is one request per second; leave a margin. */
const MIN_CALL_GAP_MS = 1_100;
const CACHE_TTL_OK_MS = 10 * 60_000;
/** A failure must expire quickly, or one outage kills the search for ten minutes. */
const CACHE_TTL_FAIL_MS = 30_000;
const CACHE_MAX_ENTRIES = 300;

/** Frame around Khujand with room for the suburbs. Need routes further out? Widen it here. */
const KHUJAND_VIEWBOX = { west: 69.45, north: 40.4, east: 69.82, south: 40.16 };

function geocoderUrl(): string {
  return process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org";
}

/** Nominatim rejects the default user agent of an HTTP library. */
const HEADERS = {
  "user-agent": "transport1/0.1 (corporate shuttle admin panel)",
  accept: "application/json",
  "accept-language": "ru",
};

export interface GeocodedPlace {
  /** stable across searches, used as the React key */
  id: string;
  /** short name for the stop title */
  name: string;
  /** full address for stops.address */
  address: string;
  lat: number;
  lng: number;
  /** what kind of object it is, shown as a hint in the list */
  kind?: string;
}

export interface GeocodeResult {
  places: GeocodedPlace[];
  source: "geocoder" | "cache";
  /** why the list is empty, when the reason is not "nothing matched" */
  error?: string;
}

interface CacheEntry {
  at: number;
  ttl: number;
  result: GeocodeResult;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): GeocodeResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return { ...entry.result, source: "cache" };
}

function cacheSet(key: string, result: GeocodeResult): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Drop the oldest third rather than maintaining a full LRU: the map keeps
    // insertion order, and this runs at most once every few hundred searches.
    for (const k of [...cache.keys()].slice(0, Math.floor(CACHE_MAX_ENTRIES / 3))) cache.delete(k);
  }
  cache.set(key, { at: Date.now(), ttl: result.error ? CACHE_TTL_FAIL_MS : CACHE_TTL_OK_MS, result });
}

/**
 * One outgoing call at a time, at most one per second.
 * Debouncing in the browser cannot promise this: several administrators typing
 * at once would each stay under their own limit and still break the provider's.
 */
let gate: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function paced<T>(task: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = MIN_CALL_GAP_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    return task();
  });
  // Keep the chain alive even when a call rejects, or every later search stalls.
  gate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function round5(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

interface NominatimPlace {
  osm_type?: string;
  osm_id?: number;
  place_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
}

/**
 * Nominatim puts the whole chain in `display_name` and, usually, the object's
 * own name in `name`. The stop title wants the short form and the address field
 * wants the rest, so they are split here rather than in the browser.
 */
function toPlace(raw: NominatimPlace): GeocodedPlace | null {
  const lat = Number(raw.lat);
  const lng = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const display = (raw.display_name ?? "").trim();
  const own = (raw.name ?? "").trim();
  const parts = display
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const name = own || parts[0] || "Без названия";
  // The chain repeats the name first and ends with the country and the postal
  // code; none of that helps somebody checking which stop this is.
  const rest = parts[0] === name ? parts.slice(1) : parts;
  const address = rest
    .filter((p) => p !== "Таджикистан" && p !== "Tajikistan" && !/^\d+$/.test(p))
    .join(", ");

  const id = raw.osm_type && raw.osm_id ? `osm:${raw.osm_type}:${raw.osm_id}` : `place:${raw.place_id ?? `${lat},${lng}`}`;

  return {
    id,
    name,
    address: address || display,
    lat: round5(lat),
    lng: round5(lng),
    kind: raw.type ? KIND_LABELS[raw.type] : undefined,
  };
}

/**
 * What the object is, in Russian. The provider answers in English ("bus_stop"),
 * and the interface is Russian throughout, so anything not listed here is shown
 * without a kind rather than in English.
 */
const KIND_LABELS: Record<string, string> = {
  bus_stop: "остановка",
  bus_station: "автостанция",
  marketplace: "рынок",
  residential: "улица",
  tertiary: "улица",
  secondary: "улица",
  primary: "улица",
  unclassified: "улица",
  pedestrian: "улица",
  square: "площадь",
  neighbourhood: "район",
  suburb: "район",
  quarter: "квартал",
  village: "село",
  town: "город",
  city: "город",
  school: "школа",
  university: "университет",
  college: "колледж",
  hospital: "больница",
  clinic: "поликлиника",
  pharmacy: "аптека",
  supermarket: "супермаркет",
  mall: "торговый центр",
  bank: "банк",
  fuel: "заправка",
  park: "парк",
  stadium: "стадион",
  factory: "завод",
  industrial: "промзона",
  office: "офис",
  company: "организация",
  apartments: "жилой дом",
  house: "дом",
};

const UNAVAILABLE = "Поиск мест недоступен, поставьте точку на карте";

async function callProvider(path: string, params: URLSearchParams): Promise<unknown | { __failed: string }> {
  const url = `${geocoderUrl().replace(/\/$/, "")}/${path}?${params.toString()}`;
  try {
    const response = await paced(() =>
      fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    );
    if (!response.ok) return { __failed: `геокодер ответил ${response.status}` };
    return await response.json();
  } catch (error) {
    return { __failed: error instanceof Error && error.name === "TimeoutError" ? "геокодер не ответил" : "геокодер недоступен" };
  }
}

function failed(v: unknown): v is { __failed: string } {
  return typeof v === "object" && v !== null && "__failed" in v;
}

/** Places matching a name or an address, limited to the Khujand area. */
export async function searchPlaces(query: string, limit = 6): Promise<GeocodeResult> {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  const key = `s:${limit}|${normalized}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: query.trim(),
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": "ru",
    limit: String(limit),
    // Two belts: the viewbox is precise, countrycodes still helps on an instance
    // where bounded search behaves differently.
    countrycodes: "tj",
    viewbox: `${KHUJAND_VIEWBOX.west},${KHUJAND_VIEWBOX.north},${KHUJAND_VIEWBOX.east},${KHUJAND_VIEWBOX.south}`,
    bounded: "1",
  });

  const json = await callProvider("search", params);
  if (failed(json)) {
    const result: GeocodeResult = { places: [], source: "geocoder", error: `${UNAVAILABLE} (${json.__failed})` };
    cacheSet(key, result);
    return result;
  }

  const places = (Array.isArray(json) ? json : [])
    .map((raw) => toPlace(raw as NominatimPlace))
    .filter((p): p is GeocodedPlace => p !== null)
    .slice(0, limit);

  const result: GeocodeResult = { places, source: "geocoder" };
  cacheSet(key, result);
  return result;
}

/**
 * The address at a point, so a stop placed by clicking the map still gets one.
 * Called when the point is confirmed, never on every click.
 */
export async function reversePlace(lat: number, lng: number): Promise<GeocodedPlace | null> {
  const key = `r:${round5(lat)},${round5(lng)}`;
  const cached = cacheGet(key);
  if (cached) return cached.places[0] ?? null;

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": "ru",
    zoom: "18",
  });

  const json = await callProvider("reverse", params);
  if (failed(json)) {
    cacheSet(key, { places: [], source: "geocoder", error: `${UNAVAILABLE} (${json.__failed})` });
    return null;
  }

  const place = toPlace(json as NominatimPlace);
  cacheSet(key, { places: place ? [place] : [], source: "geocoder" });
  return place;
}

/** Whether a place search can be offered at all. */
export function geocoderConfigured(): boolean {
  return Boolean(geocoderUrl());
}
