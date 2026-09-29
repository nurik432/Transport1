"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PIN_LENGTH, isValidPin } from "@transport/domain";
import { removePinAction, savePinAction } from "@/app/pin-actions";
import { Button, Field, inputClass } from "./ui";

/**
 * Set, change or remove the PIN of this device. Changing or removing an existing
 * PIN asks for the account password, so a stranger with an unlocked phone can't.
 */
export function PinSettings({ pinSet, remember }: { pinSet: boolean; remember: boolean }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, start] = useTransition();

  if (!remember) {
    return (
      <p className="text-sm text-muted-foreground">
        PIN доступен, если войти с галочкой «Запомнить меня». Сейчас вы вошли без неё.
      </p>
    );
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, message: string) {
    setError(undefined);
    setDone(undefined);
    start(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      setPin("");
      setPassword("");
      setDone(message);
      router.refresh();
    });
  }

  const pinOk = isValidPin(pin);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {pinSet ? "PIN включён на этом устройстве." : "PIN не задан. Он защитит приложение после перерыва в 5 минут."}
      </p>
      <Field label={pinSet ? "Новый PIN" : "PIN"} hint={`${PIN_LENGTH} цифры`}>
        <input
          className={inputClass}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      {pinSet ? (
        <Field label="Пароль от аккаунта" hint="Нужен, чтобы сменить или убрать PIN">
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      ) : null}
      {error ? <p role="alert" className="text-xs font-medium text-danger">{error}</p> : null}
      {done ? <p className="text-xs font-medium text-ok">{done}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || !pinOk || (pinSet && !password)}
          onClick={() => run(() => savePinAction(pin, password), pinSet ? "PIN изменён" : "PIN задан")}
        >
          {pinSet ? "Сменить PIN" : "Задать PIN"}
        </Button>
        {pinSet ? (
          <Button variant="secondary" disabled={pending || !password} onClick={() => run(() => removePinAction(password), "PIN убран")}>
            Убрать PIN
          </Button>
        ) : null}
      </div>
    </div>
  );
}
