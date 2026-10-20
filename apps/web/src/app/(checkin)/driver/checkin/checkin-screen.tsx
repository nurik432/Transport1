"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui";
import { IconCheck, IconClose, IconQr } from "@/components/icons";

type ScanResponse =
  | { ok: true; kind: "morning" | "evening" | "off_window"; counted: boolean; duplicate: boolean; time: string; message: string }
  | { ok: false; error: string };

type Phase = { step: "scan" } | { step: "busy" } | { step: "done"; result: ScanResponse } | { step: "failed"; error: string };

/** Locate, post, and say what happened. Pure request/response: no React state inside. */
async function runScan(token: string): Promise<Phase> {
  const position = await locate();
  try {
    const res = await fetch("/api/v1/driver/attendance/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, lat: position?.lat ?? null, lng: position?.lng ?? null, accuracyM: position?.accuracyM ?? null }),
    });
    return { step: "done", result: (await res.json()) as ScanResponse };
  } catch {
    return { step: "failed", error: "Нет сети. Повторите, когда появится связь." };
  }
}

/** The point token out of whatever the camera read: our URL or a bare token. */
function tokenFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, window.location.origin);
    const p = url.searchParams.get("p");
    if (p) return p;
  } catch {
    /* not a URL */
  }
  return /^[\w-]{6,200}$/.test(trimmed) ? trimmed : null;
}

/** One position fix, or null when the phone cannot or will not give one. */
function locate(): Promise<{ lat: number; lng: number; accuracyM: number | null } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? null }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  });
}

/**
 * The driver's check-in: either the page was opened from a QR link (token
 * known, send straight away) or the driver scans with the in-app camera.
 */
export function CheckinScreen({ token, windows }: { token: string | null; windows: string }) {
  const [phase, setPhase] = useState<Phase>(token ? { step: "busy" } : { step: "scan" });

  useEffect(() => {
    if (!token) return;
    let alive = true;
    runScan(token).then((next) => {
      if (alive) setPhase(next);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (phase.step === "scan") {
    return (
      <Scanner
        windows={windows}
        onToken={(t) => {
          setPhase({ step: "busy" });
          runScan(t).then(setPhase);
        }}
      />
    );
  }

  if (phase.step === "busy") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] bg-card p-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <IconQr className="size-7" />
        </span>
        <p className="text-[17px] font-bold">Отправляем отметку…</p>
        <p className="text-sm text-muted-foreground">Разрешите доступ к геолокации, если телефон спросит.</p>
      </div>
    );
  }

  const result = phase.step === "done" ? phase.result : null;
  const good = result?.ok === true && result.counted;
  const soft = result?.ok === true && !result.counted;
  const title = phase.step === "failed" ? "Не получилось" : result?.ok ? (good ? "Готово" : "Отметка не засчитана") : "Отметка не принята";
  const text = phase.step === "failed" ? phase.error : result?.ok ? result.message : result?.error ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className={`flex flex-col items-center gap-3 rounded-[20px] p-6 text-center ${
          good ? "bg-ok-soft" : soft ? "bg-warn-soft" : "bg-danger-soft"
        }`}
      >
        <span
          className={`flex size-16 items-center justify-center rounded-full ${
            good ? "bg-ok text-on-primary" : soft ? "bg-warn text-on-primary" : "bg-danger text-on-primary"
          }`}
        >
          {good ? <IconCheck className="size-8" /> : <IconClose className="size-8" />}
        </span>
        <p className="text-[22px] font-extrabold tracking-[-0.01em]">{title}</p>
        <p className="text-[15px]">{text}</p>
        {result?.ok && result.counted ? <p className="text-sm text-muted-foreground">Окна отметок: {windows}.</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={() => setPhase({ step: "scan" })}>
          Сканировать ещё
        </Button>
        <Link
          href="/driver"
          className="flex min-h-13 items-center justify-center rounded-xl bg-primary px-5 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover"
        >
          К рейсам
        </Link>
      </div>
    </div>
  );
}

/** Camera view that hands back the first token it reads. */
function Scanner({ windows, onToken }: { windows: string; onToken: (token: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 300 });
        if (cancelled || !videoRef.current) return;
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _err, ctl) => {
          if (!result) return;
          const t = tokenFromText(result.getText());
          if (!t) return;
          ctl.stop();
          onToken(t);
        });
        if (cancelled) controls.stop();
      } catch {
        if (!cancelled) setError("Камера недоступна. Разрешите доступ к камере или наведите на код штатную камеру телефона.");
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onToken]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square overflow-hidden rounded-[20px] bg-ink">
        {/* The camera preview; the frame on top says where to hold the code. */}
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-white/80" />
      </div>
      {error ? (
        <p role="alert" className="rounded-2xl bg-danger-soft p-3.5 text-sm text-danger-foreground">
          {error}
        </p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Наведите камеру на QR-код на проходной. Окна отметок: {windows}.</p>
      )}
      <details className="rounded-2xl bg-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Ввести код вручную
          <span className="text-muted-foreground">Открыть</span>
        </summary>
        <form
          className="flex gap-2 border-t border-border p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            const t = tokenFromText(manual);
            if (t) onToken(t);
            else setError("Код не распознан");
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Код с таблички"
            className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-[15px]"
          />
          <Button type="submit" variant="secondary">
            Отметить
          </Button>
        </form>
      </details>
    </div>
  );
}
