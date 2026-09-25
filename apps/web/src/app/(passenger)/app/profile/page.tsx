import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getFavorites, listRoutes, listStops } from "@/lib/queries";
import { RouteBadge } from "@/components/ui";
import { IconChevronRight, IconHome, IconLogout, IconPin } from "@/components/icons";
import { HomeAddressForm } from "./home-form";
import { PushSetup } from "@/components/push-setup";
import { VAPID_PUBLIC_KEY } from "@/lib/push";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mx-1 text-sm font-semibold text-muted-foreground">{children}</h2>;
}

export default async function ProfilePage() {
  const user = await requireRole("passenger");

  const [profileRows, favorites, routes, stops] = await Promise.all([
    db.select().from(schema.passengers).where(eq(schema.passengers.userId, user.id)).limit(1),
    getFavorites(user.id),
    listRoutes(true),
    listStops(),
  ]);
  const profile = profileRows[0];
  const favRoutes = routes.filter((r) => favorites.routeIds.has(r.id));
  const favStops = stops.filter((s) => favorites.stopIds.has(s.id));
  const hasHome = profile?.lat != null && profile?.lng != null;

  return (
    <>
      <header className="mx-auto flex w-full max-w-md items-center gap-3.5 px-5 pt-5 pb-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink text-xl font-bold text-on-ink"
        >
          {initials(user.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold">{user.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {[user.phone, profile?.department].filter(Boolean).join(" · ") || "Пассажир"}
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-4">
        <section className="flex flex-col gap-2">
          <SectionHeading>Уведомления</SectionHeading>
          <PushSetup
            vapidPublicKey={VAPID_PUBLIC_KEY}
            hint="Сообщим за несколько минут до подъезда транспорта, а также о задержках и изменениях маршрута."
          />
        </section>

        <section className="flex flex-col gap-2">
          <SectionHeading>Домашний адрес</SectionHeading>
          <details className="group rounded-2xl bg-card" open={!hasHome}>
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <IconHome className="size-5 text-primary" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{profile?.homeAddress || "Адрес не указан"}</span>
                <span className="text-sm text-muted-foreground">
                  {hasHome
                    ? "Если геолокация выключена, ищем остановку от этого адреса"
                    : "Укажите адрес, чтобы видеть ближайшую остановку без геолокации"}
                </span>
              </span>
              <span className="text-sm font-semibold text-primary group-open:hidden">Изменить</span>
            </summary>
            <div className="border-t border-border p-4">
              <HomeAddressForm
                address={profile?.homeAddress ?? ""}
                lat={profile?.lat ?? null}
                lng={profile?.lng ?? null}
              />
            </div>
          </details>
        </section>

        <section className="flex flex-col gap-2">
          <SectionHeading>Избранное</SectionHeading>
          {favRoutes.length === 0 && favStops.length === 0 ? (
            <p className="rounded-2xl bg-card px-4 py-4 text-sm text-muted-foreground">
              Пока ничего нет. Откройте маршрут и нажмите на звёздочку — он появится здесь и на главной.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl bg-card">
              {favRoutes.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/app/routes/${r.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 transition-colors hover:bg-muted"
                  >
                    <RouteBadge name={r.name} color={r.color} size="md" />
                    <span className="min-w-0 flex-1 truncate text-[15px]">
                      {r.description ?? "Маршрут"}
                      <span className="text-muted-foreground"> · {r.direction === "to_work" ? "утро" : "вечер"}</span>
                    </span>
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
              {favStops.map((s) => (
                <li key={s.id} className="flex min-h-14 items-center gap-3 px-4">
                  <span className="flex min-w-9 justify-center text-primary">
                    <IconPin className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px]">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form action="/logout" method="post">
          <button
            type="submit"
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[15px] font-semibold text-danger transition-colors hover:bg-danger-soft"
          >
            <IconLogout className="size-4" />
            Выйти из аккаунта
          </button>
        </form>
      </main>
    </>
  );
}
