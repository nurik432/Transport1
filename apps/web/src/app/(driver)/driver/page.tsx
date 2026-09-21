import Link from "next/link";
import { formatLocalDate, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getDriverTrips } from "@/lib/queries";
import { AutoRefresh } from "@/components/auto-refresh";
import { LogoutButton, MobileHeader } from "@/components/mobile-shell";
import { Card, EmptyState, RouteBadge, SectionTitle, cx } from "@/components/ui";
import { IconBus, IconChevronRight, IconClock, IconUsers } from "@/components/icons";

const STATUS: Record<string, { label: string; cls: string }> = {
  planned: { label: "По расписанию", cls: "bg-muted text-muted-foreground" },
  in_progress: { label: "В пути", cls: "bg-primary-soft text-primary" },
  completed: { label: "Завершён", cls: "bg-ok-soft text-green-800" },
  cancelled: { label: "Отменён", cls: "bg-danger-soft text-red-800" },
};

export default async function DriverToday() {
  const user = await requireRole("driver");
  const now = localNow();
  const trips = await getDriverTrips(user.id, now.date);

  const active = trips.find((t) => t.status === "in_progress");
  const upcoming = trips.filter((t) => t.status === "planned");
  const done = trips.filter((t) => t.status === "completed" || t.status === "cancelled");

  return (
    <>
      <AutoRefresh seconds={60} />
      <MobileHeader
        title="Мои рейсы"
        subtitle={`${formatLocalDate(now.date, { weekday: "long", day: "numeric", month: "long" })}`}
        action={<LogoutButton compact />}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        {trips.length === 0 ? (
          <EmptyState title="На сегодня рейсов нет" hint="Администратор пока не назначил вам рейсы на эту дату." />
        ) : null}

        {active ? (
          <section>
            <SectionTitle>Текущий рейс</SectionTitle>
            <Link href={`/driver/trips/${active.id}`}>
              <Card className="border-primary bg-primary-soft/40 transition-colors hover:bg-primary-soft/60">
                <div className="flex items-center gap-3">
                  <RouteBadge name={active.routeName} color={active.routeColor} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold tabular-nums">{active.startTime}</p>
                    <p className="truncate text-sm text-muted-foreground">{active.description}</p>
                  </div>
                  <IconChevronRight className="size-5 text-primary" />
                </div>
                <p className="mt-3 text-sm font-medium text-primary">Продолжить рейс</p>
              </Card>
            </Link>
          </section>
        ) : null}

        {upcoming.length ? (
          <section>
            <SectionTitle>Предстоящие</SectionTitle>
            <ul className="flex flex-col gap-2">
              {upcoming.map((t) => (
                <li key={t.id}>
                  <Link href={`/driver/trips/${t.id}`}>
                    <Card className="flex items-center gap-3 transition-colors hover:bg-muted">
                      <RouteBadge name={t.routeName} color={t.routeColor} />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold tabular-nums">{t.startTime}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <IconBus className="size-3.5" />
                            {t.vehicleNumber ?? "транспорт не назначен"}
                          </span>
                          <span className="flex items-center gap-1 tabular-nums">
                            <IconUsers className="size-3.5" />
                            {t.booked}
                            {t.vehicleCapacity ? `/${t.vehicleCapacity}` : ""}
                          </span>
                        </p>
                      </div>
                      <IconChevronRight className="size-4 text-muted-foreground" />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {done.length ? (
          <section>
            <SectionTitle>Завершённые</SectionTitle>
            <ul className="flex flex-col gap-2">
              {done.map((t) => (
                <li key={t.id}>
                  <Link href={`/driver/trips/${t.id}`}>
                    <Card className="flex items-center gap-3 opacity-80 transition-opacity hover:opacity-100">
                      <RouteBadge name={t.routeName} color={t.routeColor} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium tabular-nums">{t.startTime}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                      </div>
                      <span className={cx("rounded-full px-2 py-1 text-xs font-medium", STATUS[t.status]?.cls)}>
                        {STATUS[t.status]?.label}
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <IconClock className="size-4" />
          Отмечайте прибытие на остановку — пассажиры увидят точное время.
        </p>
      </main>
    </>
  );
}
