import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getFavorites, listRoutes, listStops } from "@/lib/queries";
import { MobileHeader } from "@/components/mobile-shell";
import { Card, RouteBadge, SectionTitle } from "@/components/ui";
import { IconChevronRight, IconLogout, IconPin } from "@/components/icons";
import { HomeAddressForm } from "./home-form";
import { PushSetup } from "@/components/push-setup";
import { VAPID_PUBLIC_KEY } from "@/lib/push";

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

  return (
    <>
      <MobileHeader title="Профиль" subtitle={user.phone} />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <Card className="flex flex-col gap-1">
          <p className="text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-muted-foreground">
            {profile?.department ? `Отдел: ${profile.department}` : "Пассажир"}
          </p>
        </Card>

        <section>
          <SectionTitle>Домашний адрес</SectionTitle>
          <Card>
            <p className="mb-3 text-xs text-muted-foreground">
              Используется, когда геолокация недоступна — по нему находим ближайшую остановку.
            </p>
            <HomeAddressForm
              address={profile?.homeAddress ?? ""}
              lat={profile?.lat ?? null}
              lng={profile?.lng ?? null}
            />
          </Card>
        </section>

        <section>
          <SectionTitle>Уведомления</SectionTitle>
          <PushSetup
            vapidPublicKey={VAPID_PUBLIC_KEY}
            hint="Сообщим, когда транспорт будет подъезжать к вашей остановке, и об изменениях маршрута."
          />
        </section>

        <section>
          <SectionTitle>Избранные маршруты</SectionTitle>
          {favRoutes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока ничего не добавлено. Откройте маршрут и нажмите на звёздочку.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {favRoutes.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/routes/${r.id}`}>
                    <Card className="flex items-center gap-3 transition-colors hover:bg-muted">
                      <RouteBadge name={r.name} color={r.color} />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.description}</span>
                      <IconChevronRight className="size-4 text-muted-foreground" />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {favStops.length ? (
          <section>
            <SectionTitle>Избранные остановки</SectionTitle>
            <ul className="flex flex-col gap-2">
              {favStops.map((s) => (
                <li key={s.id}>
                  <Card className="flex items-center gap-3">
                    <IconPin className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <form action="/logout" method="post">
          <button
            type="submit"
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            <IconLogout className="size-4" />
            Выйти из аккаунта
          </button>
        </form>
      </main>
    </>
  );
}
