"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCK_AFTER_MS, TOUCH_INTERVAL_MS } from "@transport/domain";
import { lockAction, savePinAction, touchAction, unlockAction } from "@/app/pin-actions";
import { PinPad } from "./pin-pad";
import { IconLock } from "./icons";
import { Button } from "./ui";

const SETUP_SKIPPED_KEY = "transport:pin-setup-skipped";

// "Не сейчас" is remembered per device. Read through useSyncExternalStore so the
// server render (no localStorage) and the first client render agree.
const skipListeners = new Set<() => void>();
let skippedInMemory = false;

function subscribeSkipped(onChange: () => void) {
  skipListeners.add(onChange);
  return () => {
    skipListeners.delete(onChange);
  };
}

function getSkipped(): boolean {
  if (skippedInMemory) return true;
  try {
    return localStorage.getItem(SETUP_SKIPPED_KEY) === "1";
  } catch {
    return false;
  }
}

/** On the server the offer stays hidden; the client decides after hydration. */
const getServerSkipped = () => true;

function skipSetup() {
  skippedInMemory = true;
  try {
    localStorage.setItem(SETUP_SKIPPED_KEY, "1");
  } catch {
    // private mode: remembered until the tab closes
  }
  skipListeners.forEach((l) => l());
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[3000] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-background px-6 py-10">
      {children}
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-on-primary">
        <IconLock className="size-6" />
      </span>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-xs text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function UnlockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function submit(pin: string) {
    setPending(true);
    const res = await unlockAction(pin);
    if (res.ok) return onUnlocked();
    if (res.loggedOut) return router.replace("/login");
    setError(res.error);
    setPending(false);
    setAttempt((n) => n + 1);
  }

  return (
    <Overlay>
      <Heading title="Введите PIN" subtitle="Приложение заблокировано после перерыва" />
      <PinPad key={attempt} onComplete={submit} disabled={pending} error={error} />
      <a href="/logout" className="text-sm font-medium text-primary">
        Забыли PIN? Войти по паролю
      </a>
    </Overlay>
  );
}

function SetupScreen({ onDone }: { onDone: (pinCreated: boolean) => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);

  async function submit(pin: string) {
    if (first === null) {
      setFirst(pin);
      setError(undefined);
      setStep((n) => n + 1);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError("PIN не совпал, начните заново");
      setStep((n) => n + 1);
      return;
    }
    setPending(true);
    const res = await savePinAction(pin);
    if (res.ok) return onDone(true);
    setError(res.error);
    setFirst(null);
    setPending(false);
    setStep((n) => n + 1);
  }

  return (
    <Overlay>
      <Heading
        title={first === null ? "Задайте PIN" : "Повторите PIN"}
        subtitle="Вы вошли с «Запомнить меня». PIN защитит приложение на этом устройстве — пароль не понадобится."
      />
      <PinPad key={step} onComplete={submit} disabled={pending} error={error} />
      <Button
        variant="secondary"
        onClick={() => {
          skipSetup();
          onDone(false);
        }}
      >
        Не сейчас
      </Button>
    </Overlay>
  );
}

/**
 * Screen lock for a signed-in device. Covers the app with a PIN screen after
 * 5 minutes without interaction, but keeps the app underneath mounted (only
 * `inert`), so a driver's GPS reporting and live updates keep running while locked.
 * The lock is a UI gate; the position API still works by session, on purpose.
 */
export function LockGuard({
  pinSet,
  serverLocked,
  remember,
  children,
}: {
  pinSet: boolean;
  serverLocked: boolean;
  remember: boolean;
  children: ReactNode;
}) {
  // Idle lock decided on the client, and "unlocked here" after a correct PIN.
  const [idleLocked, setIdleLocked] = useState(false);
  const [unlockedHere, setUnlockedHere] = useState(false);
  const [pinCreatedHere, setPinCreatedHere] = useState(false);
  const [setupClosed, setSetupClosed] = useState(false);
  const skipped = useSyncExternalStore(subscribeSkipped, getSkipped, getServerSkipped);
  const lastActivity = useRef(0);
  const lastTouch = useRef(0);

  // A fresh server verdict replaces what the client remembers: "locked" locks
  // again, and a changed PIN status drops the "created here" shortcut.
  const [prevServerLocked, setPrevServerLocked] = useState(serverLocked);
  if (serverLocked !== prevServerLocked) {
    setPrevServerLocked(serverLocked);
    if (serverLocked) setUnlockedHere(false);
  }
  const [prevPinSet, setPrevPinSet] = useState(pinSet);
  if (pinSet !== prevPinSet) {
    setPrevPinSet(pinSet);
    setPinCreatedHere(false);
  }

  const hasPin = pinSet || pinCreatedHere;
  const locked = hasPin && (idleLocked || (serverLocked && !unlockedHere));
  const offerSetup = remember && !hasPin && !skipped && !setupClosed;

  const lockNow = useCallback(() => {
    setIdleLocked(true);
    void lockAction();
  }, []);

  useEffect(() => {
    if (!hasPin || locked) return;
    lastActivity.current = Date.now();
    lastTouch.current = Date.now();

    function onActivity() {
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastTouch.current >= TOUCH_INTERVAL_MS) {
        lastTouch.current = now;
        void touchAction();
      }
    }
    function check() {
      if (Date.now() - lastActivity.current > LOCK_AFTER_MS) lockNow();
    }

    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 15_000);
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [hasPin, locked, lockNow]);

  const covered = locked || offerSetup;
  return (
    <>
      <div inert={covered} aria-hidden={covered || undefined}>
        {children}
      </div>
      {locked ? (
        <UnlockScreen
          onUnlocked={() => {
            setIdleLocked(false);
            setUnlockedHere(true);
          }}
        />
      ) : offerSetup ? (
        <SetupScreen
          onDone={(pinCreated) => {
            setSetupClosed(true);
            if (pinCreated) setPinCreatedHere(true);
          }}
        />
      ) : null}
    </>
  );
}
