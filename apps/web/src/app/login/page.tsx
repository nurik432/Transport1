import type { Metadata } from "next";
import Image from "next/image";
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
        <h1>
          {/* PNG, not SVG: the tagline in the SVG is live Montserrat text that an <img> would not render. */}
          <Image
            src="/brand/logo-horizontal-blue.png"
            alt="Фаровон Транспорт"
            width={240}
            height={64}
            priority
            unoptimized
          />
        </h1>
        <p className="text-sm text-muted-foreground">Войдите по телефону и паролю, выданному администратором</p>
      </div>

      <Card className="p-5">
        <LoginForm next={next} />
      </Card>
    </main>
  );
}
