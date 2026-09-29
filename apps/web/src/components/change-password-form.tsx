"use client";

import { useState, useTransition } from "react";
import { Button, Field, inputClass } from "./ui";

type Result = { ok: true } | { ok: false; error: string };

export function ChangePasswordForm({ action }: { action: (currentPassword: string, newPassword: string) => Promise<Result> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await action(current, next);
      setResult(res);
      if (res.ok) {
        setCurrent("");
        setNext("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Текущий пароль" error={result && !result.ok ? result.error : undefined}>
        <input
          type="password"
          autoComplete="current-password"
          className={inputClass}
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setResult(null);
          }}
        />
      </Field>
      <Field label="Новый пароль" hint="Не короче 6 символов">
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setResult(null);
          }}
        />
      </Field>
      {result?.ok ? <p className="text-xs font-medium text-ok">Пароль изменён</p> : null}
      <Button disabled={pending || !current || !next} onClick={submit}>
        {pending ? "Сохранение…" : "Сменить пароль"}
      </Button>
    </div>
  );
}
