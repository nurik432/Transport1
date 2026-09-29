"use client";

import { useRef, useState, useTransition } from "react";
import { MapPanel } from "@/components/map";
import { PlaceSearch } from "@/components/place-search";
import { Button, Field, inputClass } from "@/components/ui";
import { IconPin } from "@/components/icons";
import { saveHome } from "../actions";

interface Point {
  lat: number;
  lng: number;
}

const round5 = (n: number) => Number(n.toFixed(5));

/**
 * Home is a place, so it is set by pointing: find it by name, tap the map or
 * drag the pin. The address line fills itself from the point until the passenger
 * edits it by hand.
 */
export function HomeAddressForm({
  address,
  lat,
  lng,
}: {
  address: string;
  lat: number | null;
  lng: number | null;
}) {
  const [value, setValue] = useState(address);
  const [coords, setCoords] = useState<Point | null>(lat != null && lng != null ? { lat, lng } : null);
  const [fitKey, setFitKey] = useState(0);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string>();
  const [pending, start] = useTransition();
  const typedByHand = useRef(false);
  const lookup = useRef<AbortController | null>(null);

  function place(point: Point, knownAddress?: string) {
    const next = { lat: round5(point.lat), lng: round5(point.lng) };
    setCoords(next);
    setSaved(false);
    setNote(undefined);
    if (knownAddress) {
      setValue(knownAddress);
      typedByHand.current = false;
      return;
    }
    if (typedByHand.current) return;
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    fetch(`/api/v1/geocode?lat=${next.lat}&lng=${next.lng}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (!controller.signal.aborted && json.ok && json.place?.address) setValue(json.place.address);
      })
      .catch(() => {});
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setNote("Телефон не даёт определить местоположение");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        place({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setFitKey((k) => k + 1);
      },
      () => setNote("Не удалось определить местоположение, поставьте точку на карте"),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PlaceSearch
        label="Найти адрес"
        placeholder="Улица, дом или ориентир"
        onPick={(p) => {
          place(p, p.address || p.name);
          setFitKey((k) => k + 1);
        }}
      />

      <MapPanel
        className="h-72 w-full rounded-[--radius-card] border border-border"
        stops={coords ? [{ id: "home", name: "Дом", lat: coords.lat, lng: coords.lng, draggable: true, highlight: true }] : []}
        fitKey={fitKey}
        fitPoints={coords ? [[coords.lat, coords.lng]] : undefined}
        onMapClick={(la, ln) => place({ lat: la, lng: ln })}
        onStopDragEnd={(_, la, ln) => place({ lat: la, lng: ln })}
      />

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{coords ? "Нажмите на карту или перетащите точку, чтобы поправить" : "Нажмите на карту там, где вы живёте"}</span>
        <button
          type="button"
          onClick={useMyLocation}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 font-medium text-primary hover:underline"
        >
          <IconPin className="size-4" />
          Я дома
        </button>
      </div>
      {note ? <p className="text-sm text-danger">{note}</p> : null}

      <Field label="Адрес" hint="Заполняется по точке на карте, можно уточнить: подъезд, ориентир">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            typedByHand.current = e.target.value.trim().length > 0;
            setSaved(false);
          }}
          placeholder="Улица, дом"
        />
      </Field>

      <Button
        disabled={pending || !coords}
        onClick={() =>
          start(async () => {
            await saveHome(value, coords?.lat ?? null, coords?.lng ?? null);
            setSaved(true);
          })
        }
      >
        {pending ? "Сохранение…" : saved ? "Сохранено" : coords ? "Сохранить" : "Поставьте точку на карте"}
      </Button>
    </div>
  );
}
