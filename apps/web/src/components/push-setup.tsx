"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, cx } from "./ui";
import { IconBell, IconCheck } from "./icons";

type State = "loading" | "unsupported" | "blocked" | "off" | "on" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Turns web push on for this device. The browser asks for permission only when
 * the person presses the button, never on page load.
 */
export function PushSetup({ vapidPublicKey, hint }: { vapidPublicKey: string; hint?: string }) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Look up the existing subscription first: every state update below happens
    // after this await, which keeps the effect free of synchronous renders.
    let subscribed = false;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      subscribed = Boolean(registration && (await registration.pushManager.getSubscription()));
    } catch {
      subscribed = false;
    }

    const supported =
      Boolean(vapidPublicKey) &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    setState(subscribed ? "on" : "off");
  }, [vapidPublicKey]);

  useEffect(() => {
    // Reading the current push subscription is an async browser lookup, so the
    // state update happens after an await, not during this effect's render pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function enable() {
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const response = await fetch("/api/v1/push/subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!response.ok) throw new Error("save failed");
      setState("on");
      setMessage("Уведомления включены на этом устройстве");
    } catch {
      setState("error");
      setMessage("Не удалось включить уведомления. Попробуйте ещё раз.");
    }
  }

  async function disable() {
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = registration ? await registration.pushManager.getSubscription() : null;
      if (sub) {
        await fetch(`/api/v1/push/subscription?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
        await sub.unsubscribe();
      }
      setState("off");
      setMessage("Уведомления выключены");
    } catch {
      setState("error");
      setMessage("Не удалось выключить уведомления");
    }
  }

  const text: Record<State, string> = {
    loading: "Проверяем настройки…",
    unsupported: "Этот браузер не поддерживает push-уведомления.",
    blocked: "Уведомления запрещены в настройках браузера. Разрешите их для этого сайта.",
    off: hint ?? "Получайте сообщения, даже когда приложение закрыто.",
    on: "Push-уведомления приходят на это устройство.",
    error: "Произошла ошибка.",
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            state === "on" ? "bg-ok-soft text-ok" : "bg-primary-soft text-primary",
          )}
        >
          {state === "on" ? <IconCheck className="size-5" /> : <IconBell className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Уведомления на телефон</p>
          <p className="text-sm text-muted-foreground">{text[state]}</p>
          {message ? <p className="mt-1 text-xs text-muted-foreground">{message}</p> : null}
        </div>
      </div>

      {state === "off" || state === "error" ? (
        <Button onClick={enable}>Включить уведомления</Button>
      ) : state === "on" ? (
        <Button variant="secondary" onClick={disable}>
          Выключить
        </Button>
      ) : null}
    </div>
  );
}
