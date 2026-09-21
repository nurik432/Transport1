"use client";

import { useState, useTransition } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { IconPin } from "@/components/icons";
import { saveHome } from "../actions";

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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null,
  );
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) =>
      setCoords({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) }),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Адрес">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="Улица, дом"
        />
      </Field>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {coords ? `Координаты: ${coords.lat}, ${coords.lng}` : "Координаты не заданы"}
        </span>
        <button
          type="button"
          onClick={useMyLocation}
          className="inline-flex cursor-pointer items-center gap-1 font-medium text-primary hover:underline"
        >
          <IconPin className="size-4" />
          Взять текущие
        </button>
      </div>

      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await saveHome(value, coords?.lat ?? null, coords?.lng ?? null);
            setSaved(true);
          })
        }
      >
        {pending ? "Сохранение…" : saved ? "Сохранено" : "Сохранить"}
      </Button>
    </div>
  );
}
