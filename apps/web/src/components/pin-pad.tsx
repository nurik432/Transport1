"use client";

import { useEffect, useRef, useState } from "react";
import { PIN_LENGTH } from "@transport/domain";
import { IconBackspace } from "./icons";
import { cx } from "./ui";

/**
 * Four-digit PIN entry: dots plus a numeric keypad. Works with the phone keypad
 * on screen and with a hardware keyboard. Calls `onComplete` with the last
 * digit; the parent decides what a wrong PIN means and clears the digits by
 * giving the pad a new `key`.
 */
export function PinPad({
  onComplete,
  disabled,
  error,
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState("");
  const done = useRef(onComplete);
  done.current = onComplete;

  useEffect(() => {
    if (disabled) return;
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) push(e.key);
      else if (e.key === "Backspace") setValue((v) => v.slice(0, -1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, value]);

  function push(digit: string) {
    if (disabled || value.length >= PIN_LENGTH) return;
    const next = value + digit;
    setValue(next);
    if (next.length === PIN_LENGTH) done.current(next);
  }

  const keyClass =
    "flex size-20 flex-col items-center justify-center rounded-full bg-card text-3xl font-semibold shadow-sm ring-1 ring-border transition-colors active:scale-95 active:bg-muted disabled:opacity-50";

  const letters: Record<string, string> = {
    "1": "",
    "2": "абвг",
    "3": "дежз",
    "4": "ийкл",
    "5": "мноп",
    "6": "рсту",
    "7": "фхцч",
    "8": "шщъы",
    "9": "ьэюя",
    "0": "",
  };

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex gap-5" role="img" aria-label={`Введено цифр: ${value.length} из ${PIN_LENGTH}`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cx(
              "size-5 rounded-full border-2 transition-colors",
              i < value.length ? "border-primary bg-primary" : "border-axis",
              error && "border-danger",
              error && i < value.length && "bg-danger",
            )}
          />
        ))}
      </div>
      <p role="alert" className="min-h-5 text-center text-sm font-medium text-danger">
        {error}
      </p>
      <div className="grid w-full max-w-80 grid-cols-3 justify-items-center gap-y-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={keyClass} disabled={disabled} onClick={() => push(d)}>
            <span>{d}</span>
            {letters[d] ? <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{letters[d]}</span> : null}
          </button>
        ))}
        <span />
        <button type="button" className={keyClass} disabled={disabled} onClick={() => push("0")}>
          0
        </button>
        <button
          type="button"
          aria-label="Удалить цифру"
          className={cx(keyClass, "text-muted-foreground shadow-none ring-0")}
          disabled={disabled || !value}
          onClick={() => setValue((v) => v.slice(0, -1))}
        >
          <IconBackspace className="size-7" />
        </button>
      </div>
    </div>
  );
}
