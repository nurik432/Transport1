"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, inputClass } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Вход…" : "Войти"}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Телефон" hint="Например, +992 90 000 00 01">
        <input
          className={inputClass}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="username"
          placeholder="+992 …"
          required
        />
      </Field>
      <Field label="Пароль" error={state.error}>
        <input className={inputClass} name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
