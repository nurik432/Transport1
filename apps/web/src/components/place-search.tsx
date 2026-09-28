"use client";

import { useEffect, useState } from "react";
import { Combobox } from "./combobox";

/**
 * "Find a place" over /api/v1/geocode.
 *
 * This is the answer to "I do not know where to get the coordinates": type a
 * name, pick a place, and the point is set with its address already filled in.
 * The request is debounced and every stale one is aborted, so typing a name
 * costs one call to the provider rather than one per letter.
 */

export interface FoundPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind?: string;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 400;

/** Results always carry the query they belong to, so a late answer cannot win. */
interface SearchState {
  forQuery: string;
  places: FoundPlace[];
  note: string | null;
}

const EMPTY: FoundPlace[] = [];

export function PlaceSearch({
  label = "Найти место",
  hint,
  placeholder = "Например, Панчшанбе",
  onPick,
  onManual,
}: {
  label?: string;
  hint?: string;
  placeholder?: string;
  onPick: (place: FoundPlace) => void;
  /** offered at the bottom of the list, for when the search cannot help */
  onManual?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchState>({ forQuery: "", places: EMPTY, note: null });
  const [loading, setLoading] = useState(false);

  const trimmed = query.trim();
  const tooShort = trimmed.length < MIN_CHARS;
  const fresh = result.forQuery === trimmed;

  useEffect(() => {
    if (trimmed.length < MIN_CHARS || trimmed === result.forQuery) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/v1/geocode?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const json = await response.json();
        if (controller.signal.aborted) return;
        if (json.ok) {
          const places: FoundPlace[] = json.places ?? [];
          setResult({ forQuery: trimmed, places, note: json.error ?? (places.length ? null : "Ничего не найдено") });
        } else {
          setResult({ forQuery: trimmed, places: EMPTY, note: json.error ?? "Поиск не сработал" });
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({ forQuery: trimmed, places: EMPTY, note: "Поиск не сработал, поставьте точку на карте" });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, result.forQuery]);

  // Show only what belongs to what is typed now: results for an older query are
  // worse than none, because they point at a different place.
  const places = fresh ? result.places : EMPTY;
  const searching = !tooShort && (loading || !fresh);
  const statusText = searching
    ? "Ищем…"
    : tooShort
      ? undefined
      : (result.note ?? (places.length ? `Найдено мест: ${places.length}` : undefined));

  return (
    <Combobox<FoundPlace>
      label={label}
      hint={hint}
      placeholder={placeholder}
      query={query}
      onQueryChange={setQuery}
      items={places}
      itemKey={(p) => p.id}
      loading={searching}
      statusText={statusText}
      minChars={MIN_CHARS}
      footerAction={onManual ? { label: "Поставить точку на карте вручную", onSelect: onManual } : undefined}
      renderItem={(p) => (
        <span className="flex flex-col">
          <span className="font-medium">
            {p.name}
            {p.kind ? <span className="ml-1.5 font-normal text-muted-foreground">· {p.kind}</span> : null}
          </span>
          {p.address ? <span className="text-xs text-muted-foreground">{p.address}</span> : null}
        </span>
      )}
      onSelect={(place) => {
        onPick(place);
        setQuery("");
        setResult({ forQuery: "", places: EMPTY, note: null });
      }}
    />
  );
}
