"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pathKey } from "./use-route-editor";

/**
 * The road path under the route being edited, and the travel times that follow
 * from it.
 *
 * The project rule is that the router is asked "only when a route is created or
 * its stops change, never on page render". Moving a point is exactly "its stops
 * change": the request comes from the browser because a person moved something,
 * not from rendering a page. Opening an existing route shows the geometry that
 * was stored with it and asks nothing.
 *
 * Only the coordinates and their order are watched. Editing a time must not
 * trigger a new request, or typing a correction would fetch a path that
 * overwrites the correction.
 */

const DEBOUNCE_MS = 700;

export type PathState = "idle" | "pending" | "loading" | "ready";

interface PathResult {
  /** which request this answers: the points plus the retry counter */
  token: string;
  /** which set of points this result describes */
  key: string;
  points: [number, number][] | null;
  distanceM: number | null;
  source: "road" | "straight" | null;
  error?: string;
}

export interface RoutePath {
  state: PathState;
  points: [number, number][] | null;
  distanceM: number | null;
  source: "road" | "straight" | null;
  error?: string;
  /** ask again after a failure */
  recompute: () => void;
}

export function useRoutePath({
  stops,
  savedPath,
  savedSource,
  savedDistanceM,
  onSuggestedOffsets,
}: {
  stops: readonly { lat: number; lng: number }[];
  savedPath: [number, number][] | null;
  savedSource: "road" | "straight" | null;
  savedDistanceM: number | null;
  /** times computed from the path; the caller decides which of them to keep */
  onSuggestedOffsets: (suggested: number[]) => void;
}): RoutePath {
  const key = useMemo(() => pathKey(stops), [stops]);

  // Seeded with the stored geometry and the key it belongs to, so the first
  // render of a saved route matches without calling the provider.
  const [result, setResult] = useState<PathResult>(() => ({
    token: `${pathKey(stops)}|0`,
    key: pathKey(stops),
    points: savedPath && savedPath.length >= 2 ? savedPath : null,
    distanceM: savedDistanceM,
    source: savedPath && savedPath.length >= 2 ? savedSource : null,
  }));
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Read when the timer fires, so the effect does not depend on a fresh array
  // identity on every render.
  const pointsRef = useRef(stops);
  const callbackRef = useRef(onSuggestedOffsets);
  useEffect(() => {
    pointsRef.current = stops;
    callbackRef.current = onSuggestedOffsets;
  });

  const enough = stops.length >= 2;
  // The token names the request, not just the shape: after a retry the key is
  // current again, so comparing keys alone would ask forever.
  const token = `${key}|${nonce}`;
  const settled = result.token === token;

  useEffect(() => {
    if (!enough || settled) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/v1/routing/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            points: pointsRef.current.map((s) => ({ lat: s.lat, lng: s.lng })),
          }),
          signal: controller.signal,
        });
        const json = await response.json();
        if (controller.signal.aborted) return;
        if (json.ok) {
          setResult({
            token,
            key,
            points: json.points,
            distanceM: json.totalDistanceM,
            source: json.source,
            error: json.error,
          });
          callbackRef.current(json.suggestedOffsets ?? []);
        } else {
          setResult({
            token,
            key,
            points: null,
            distanceM: null,
            source: null,
            error: json.error ?? "Не удалось построить путь",
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({ token, key, points: null, distanceM: null, source: null, error: "Не удалось построить путь" });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, token, enough, settled]);

  const state: PathState = !enough ? "idle" : loading ? "loading" : settled ? "ready" : "pending";

  return {
    state,
    // While a new path is on its way the previous one stays on the map: a line
    // that vanishes on every edit is harder to work with than a slightly old one.
    points: enough ? result.points : null,
    distanceM: enough ? result.distanceM : null,
    source: enough ? result.source : null,
    error: result.error,
    recompute: () => setNonce((n) => n + 1),
  };
}
