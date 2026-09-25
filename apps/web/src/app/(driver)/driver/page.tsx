import Link from "next/link";
import { durationLabel, formatLocalDate, localNow, parseTimeToMinutes, plural } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getDriverTrips } from "@/lib/queries";
import { AutoRefresh } from "@/components/auto-refresh";
import { LogoutButton } from "@/components/mobile-shell";
import { EmptyState, Pill, RouteBadge, cx } from "@/components/ui";

type Trip = Awaited<ReturnType<typeof getDriverTrips>>[number];

/** Intl returns Russian weekdays in lower case; a heading starts with a capital. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "через 25 мин" before departure, "07:15" once it is time. */
function untilLabel(startTime: string, nowMinutes: number): string | null {
  const left = parseTimeToMinutes(startTime) - nowMinutes;
  if (left <= 0 || left > 12 * 60) return null;
  return `через ${durationLabel(left)}`;
}

/** Route number and where it goes, the two things that identify a trip. */
function TripLine({ trip }: { trip: Trip }) {
  return (
    <>
      <RouteBadge name={trip.routeName} color={trip.routeColor} size="md" className="h-8 min-w-9 text-base" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] font-bold tabular-nums">{trip.startTime}</span>
        {/* The count leads the line: on a long route name truncation must eat
            the description, never the number the driver came for. */}
        <span className="truncate text-[13px] text-muted-foreground">
          {trip.status === "completed" ? `перевезено ${trip.boardedTotal}` : `записались ${trip.booked}`}
          {trip.description ? ` · ${trip.description}` : ""}
        </span>
      </span>
    </>
  );
}

export default async function DriverToday() {
  const user = await requireRole("driver");
  const now = localNow();
  const trips = await getDriverTrips(user.id, now.date);
  const today = formatLocalDate(now.date, { weekday: "long", day: "numeric", month: "long" });

  const running = trips.find((t) => t.status === "in_progress") ?? null;
  const planned = trips.filter((t) => t.status === "planned");
  // One trip is the one to act on: the running one, otherwise the next.
  const focus = running ?? planned[0] ?? null;
  const later = planned.filter((t) => t.id !== focus?.id);
  const done = trips.filter((t) => t.status === "completed" || t.status === "cancelled");

  return (
    <>
      <AutoRefresh seconds={60} />
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-muted-foreground">{capitalize(today)}</p>
          <h1 className="text-2xl font-bold tracking-[-0.01em]">Мои рейсы</h1>
        </div>
        <LogoutButton compact />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-1 pb-4">
        {trips.length === 0 ? (
          <EmptyState title="На сегодня рейсов нет" hint="Администратор пока не назначил вам рейсы на эту дату." />
        ) : null}

        {focus ? (
          <section
            aria-label={running ? "Текущий рейс" : "Следующий рейс"}
            className="flex flex-col gap-4 rounded-[20px] bg-card p-[18px] shadow-[0_1px_2px_rgba(11,22,38,.06),0_8px_24px_rgba(11,22,38,.06)]"
          >
            <p className="text-[13px] font-semibold text-muted-foreground">
              {running ? "Рейс идёт" : "Следующий рейс"}
            </p>

            <div className="flex items-end gap-3.5">
              <RouteBadge
                name={focus.routeName}
                color={focus.routeColor}
                className="h-14 min-w-14 justify-center rounded-[14px] px-2 text-[26px] font-extrabold"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[44px] leading-[0.95] font-extrabold tracking-[-0.03em] tabular-nums">
                  {focus.startTime}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {running ? focus.description : [untilLabel(focus.startTime, now.minutes), focus.description].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-xl bg-background px-3 py-2.5">
                <span className="text-xs text-muted-foreground">Транспорт</span>
                <span className="truncate text-[15px] font-semibold">
                  {focus.vehicleNumber ? `${focus.vehicleModel ?? ""} ${focus.vehicleNumber}`.trim() : "не назначен"}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-xl bg-background px-3 py-2.5">
                <span className="text-xs text-muted-foreground">Записались</span>
                <span className="text-[15px] font-semibold tabular-nums">
                  {focus.booked}
                  {focus.vehicleCapacity ? ` из ${focus.vehicleCapacity}` : ""}
                </span>
              </div>
            </div>

            <Link
              href={`/driver/trips/${focus.id}`}
              className="flex min-h-14 items-center justify-center rounded-[14px] bg-primary text-[17px] font-bold text-on-primary transition-colors hover:bg-primary-hover"
            >
              {running ? "Вернуться к рейсу" : "Подготовиться к рейсу"}
            </Link>
          </section>
        ) : null}

        {later.length ? (
          <section className="flex flex-col gap-2">
            <h2 className="mx-1 text-[15px] font-bold">Позже сегодня</h2>
            <div className="flex flex-col rounded-2xl bg-card">
              {later.map((t) => (
                <Link
                  key={t.id}
                  href={`/driver/trips/${t.id}`}
                  className="flex min-h-16 items-center gap-3 border-b border-divider px-3.5 last:border-b-0"
                >
                  <TripLine trip={t} />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {done.length ? (
          <section className="flex flex-col gap-2">
            <h2 className="mx-1 text-[15px] font-bold">Выполнено</h2>
            <div className="flex flex-col rounded-2xl bg-card">
              {done.map((t) => (
                <Link
                  key={t.id}
                  href={`/driver/trips/${t.id}`}
                  className={cx(
                    "flex min-h-15 items-center gap-3 border-b border-divider px-3.5 last:border-b-0",
                    t.status === "cancelled" && "opacity-70",
                  )}
                >
                  <TripLine trip={t} />
                  <Pill tone={t.status === "completed" ? "ok" : "neutral"}>
                    {t.status === "completed" ? "Завершён" : "Отменён"}
                  </Pill>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {trips.length ? (
          <p className="mx-1 text-[13px] text-muted-foreground">
            Отмечайте прибытие на остановку — пассажиры увидят точное время. Всего сегодня{" "}
            {trips.length} {plural(trips.length, ["рейс", "рейса", "рейсов"])}.
          </p>
        ) : null}
      </main>
    </>
  );
}
