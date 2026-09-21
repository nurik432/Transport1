import type { Metadata } from "next";
import { IconBus } from "@/components/icons";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход — Корпоративный транспорт" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-on-primary">
          <IconBus className="size-7" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Корпоративный транспорт</h1>
          <p className="text-sm text-muted-foreground">Войдите по телефону и паролю, выданному администратором</p>
        </div>
      </div>

      <Card className="p-5">
        <LoginForm next={next} />
      </Card>

      <Card className="bg-muted text-xs text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">Демо-доступы</p>
        <ul className="flex flex-col gap-1">
          <li>Администратор: +992900000001 / admin123</li>
          <li>Водитель: +992900000101 / driver123</li>
          <li>Пассажир: +992910000001 / pass123</li>
        </ul>
      </Card>
    </main>
  );
}
