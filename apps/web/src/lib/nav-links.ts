/**
 * Links that open a route in an external maps app for turn-by-turn guidance.
 * Plain https links: on a phone they open the installed app, otherwise the site.
 * The start is left empty so the app uses the device's current location.
 */

export type TravelMode = "driving" | "walking";

interface Point {
  lat: number;
  lng: number;
}

const coord = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export function yandexMapsRoute(to: Point, mode: TravelMode): string {
  return `https://yandex.ru/maps/?rtext=~${coord(to)}&rtt=${mode === "walking" ? "pd" : "auto"}`;
}

export function googleMapsRoute(to: Point, mode: TravelMode): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(to)}&travelmode=${mode}`;
}
