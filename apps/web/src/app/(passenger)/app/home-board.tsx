/**
 * Passenger home, built like a stop departure board: the time until the
 * vehicle is the largest thing on screen, then what to do about it.
 */
import Link from "next/link";
import {
  formatDistance,
  formatEta,
  formatLocalTime,
  freeSeats,
  leaveHint,
  seatsLabel,
  walkMinutes,
  type EtaSource,
} from "@transport/domain";
import type { Arrival } from "@/lib/queries";
import { RouteBadge, cx } from "@/components/ui";
import { IconChevronRight, IconPin } from "@/components/icons";
import { BookButton } from "./book-button";

const SOURCE_LABEL: Record<EtaSource, string> = {
  position: "по GPS",
  driver: "по отметкам водителя",
  schedule: "по расписанию",
};

/** Minutes the vehicle runs behind schedule at this stop; 0 when on time or early. */
export function delayMinutes(a: Pick<Arrival, "eta" | "plannedAt">): number {
  return Math.max(0, Math.round((a.eta.arrivalAt.getTime() - a.plannedAt.getTime()) / 60_000));
}

/** "7 мин" / "сейчас" / "1 ч 5 мин" — the big number without the "через". */
function bigEta(a: Arrival): string {
  return formatEta(a.eta).replace(/^через /, "");
}

/**
 * The hero number is set as large as it can be without wrapping on a phone:
 * "8 мин" gets the full size, "6 ч 18 мин" has to step down.
 */
function etaSize(text: string, full: string, small: string): string {
  return text.length > 7 ? small : full;
}

function SourceLine({ arrival, className }: { arrival: Arrival; className?: string }) {
  const delay = delayMinutes(arrival);
  const live = arrival.eta.source !== "schedule";
  return (
    <p className={cx("flex items-center gap-2 text-sm", className)}>
      {live ? <span className="live-dot" aria-hidden="true" /> : null}
      <span>
        Прибытие в <strong className="font-semibold">{formatLocalTime(arrival.eta.arrivalAt)}</strong> ·{" "}
        {SOURCE_LABEL[arrival.eta.source]}
      </span>
      {delay >= 2 ? (
        <span className="ml-auto rounded-md bg-late-soft px-2 py-0.5 text-xs font-semibold text-late">
          +{delay} мин
        </span>
      ) : null}
    </p>
  );
}

function LeaveHintBox({ arrival, distanceM }: { arrival: Arrival; distanceM: number }) {
  const walk = walkMinutes(distanceM);
  const hint = leaveHint(arrival.eta.minutesFromNow, walk);
  const text =
    hint.kind === "far" ? (
      <>До остановки {walk} мин пешком.</>
    ) : hint.kind === "wait" ? (
      <>
        <strong>Выходите через {hint.leaveInMin} мин.</strong> До остановки {walk} мин пешком.
      </>
    ) : hint.kind === "now" ? (
      <>
        <strong>Выходите сейчас.</strong> До остановки {walk} мин пешком.
      </>
    ) : (
      <>
        <strong>Можете не успеть:</strong> идти {walk} мин, а транспорт будет раньше. Посмотрите следующий рейс ниже.
      </>
    );
  return (
    <p
      className={cx(
        "mx-3 rounded-xl px-3.5 py-3 text-sm leading-snug",
        hint.kind === "late"
          ? "bg-late-soft text-late"
          : hint.kind === "far"
            ? "bg-muted text-muted-foreground"
            : "bg-highlight-soft text-highlight-foreground",
      )}
    >
      {text}
    </p>
  );
}

function SeatsMeter({ arrival }: { arrival: Arrival }) {
  const capacity = arrival.vehicle?.capacity ?? null;
  const free = freeSeats(capacity, arrival.booked);
  if (capacity == null || free == null) return null;
  const pct = Math.round((free / capacity) * 100);
  return (
    <div className="flex flex-col gap-1.5 px-4.5 pt-4">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Свободно мест</span>
        <span className="font-semibold">
          {free} из {capacity}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cx("h-full rounded-full", free === 0 ? "bg-danger" : pct < 25 ? "bg-warn" : "bg-ok")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Main card when nothing is booked yet: nearest stop → next vehicle → when to leave → "Поеду". */
export function EtaHero({
  arrival,
  stopName,
  distanceM,
}: {
  arrival: Arrival;
  stopName: string;
  distanceM: number | null;
}) {
  return (
    <section
      aria-label="Ближайший транспорт"
      className="flex flex-col overflow-hidden rounded-3xl bg-card shadow-[0_1px_2px_rgb(11_22_38/0.06),0_8px_24px_rgb(11_22_38/0.06)]"
    >
      <div className="flex items-center gap-2.5 px-4.5 pt-4">
        <IconPin className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{stopName}</p>
          <p className="text-sm text-muted-foreground">
            Ближайшая остановка{distanceM != null ? ` · ${formatDistance(distanceM)}` : ""}
          </p>
        </div>
        <Link href="/app/routes" className="flex min-h-11 items-center text-sm font-semibold text-primary">
          Сменить
        </Link>
      </div>

      <div className="flex items-end gap-3.5 px-4.5 pt-4.5 pb-1.5">
        <RouteBadge name={arrival.routeName} color={arrival.routeColor} size="lg" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-muted-foreground">
            {arrival.direction === "to_work" ? "На работу" : "Домой"} · рейс {arrival.startTime}
          </p>
          <p
            className={cx(
              "leading-[0.95] font-extrabold tracking-tight whitespace-nowrap",
              etaSize(bigEta(arrival), "text-5xl", "text-[32px]"),
            )}
          >
            {bigEta(arrival)}
          </p>
        </div>
      </div>

      <SourceLine arrival={arrival} className="px-4.5 pt-1.5 pb-3.5 text-muted-foreground" />

      {distanceM != null ? <LeaveHintBox arrival={arrival} distanceM={distanceM} /> : null}

      <SeatsMeter arrival={arrival} />

      <div className="flex gap-2.5 p-4.5">
        <BookButton
          tripId={arrival.tripId}
          stopId={arrival.stopId}
          booked={false}
          bookLabel="Поеду этим рейсом"
          size="lg"
          className="flex-1"
        />
        <Link
          href={`/app/trips/${arrival.tripId}`}
          aria-label="Подробнее о рейсе"
          className="flex size-13 items-center justify-center rounded-xl bg-primary-soft text-primary transition-colors hover:bg-muted"
        >
          <IconChevronRight className="size-5" />
        </Link>
      </div>
    </section>
  );
}

/** Main card after booking: the passenger's own trip, on dark "ink". */
export function TripCard({ arrival }: { arrival: Arrival }) {
  const running = arrival.status === "in_progress";
  return (
    <section aria-label="Ваша поездка" className="flex flex-col gap-4.5 rounded-3xl bg-ink px-4.5 py-5 text-on-ink">
      <div className="flex items-center gap-3">
        <RouteBadge name={arrival.routeName} color={arrival.routeColor} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">Рейс {arrival.startTime}</p>
          <p className="truncate text-sm text-ink-muted">Посадка: {arrival.stopName}</p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-ink-muted">{running ? "Подъедет через" : "Отправление через"}</span>
          <span
            className={cx(
              "leading-[0.9] font-extrabold tracking-tight whitespace-nowrap",
              etaSize(bigEta(arrival), "text-[56px]", "text-[34px]"),
            )}
          >
            {bigEta(arrival)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1.5 text-sm text-ink-muted">
            {arrival.eta.source !== "schedule" ? <span className="live-dot text-on-ink" aria-hidden="true" /> : null}
            {SOURCE_LABEL[arrival.eta.source]}
          </span>
          <span className="text-xl font-bold">{formatLocalTime(arrival.eta.arrivalAt)}</span>
        </div>
      </div>

      <p className="text-sm leading-snug text-ink-muted">
        {running
          ? delayMinutes(arrival) >= 2
            ? `Транспорт в пути, опаздывает на ${delayMinutes(arrival)} мин.`
            : "Транспорт в пути и идёт по расписанию."
          : "Рейс ещё не начался. Время уточнится, когда водитель выедет."}
      </p>

      <div className="flex gap-2.5">
        <Link
          href={`/app/trips/${arrival.tripId}`}
          className="flex min-h-13 flex-1 items-center justify-center rounded-xl bg-card text-[15px] font-bold text-ink transition-opacity hover:opacity-90"
        >
          {running ? "Смотреть на карте" : "Подробнее о рейсе"}
        </Link>
        <BookButton
          tripId={arrival.tripId}
          stopId={arrival.stopId}
          booked
          tone="ink"
          cancelLabel="Не поеду"
          size="lg"
        />
      </div>
    </section>
  );
}

/** One row in "Дальше с этой остановки" / "Если не успеете". */
export function ArrivalRow({ arrival, today, action }: { arrival: Arrival; today: string; action?: string }) {
  const free = freeSeats(arrival.vehicle?.capacity, arrival.booked);
  return (
    <li>
      <Link
        href={`/app/trips/${arrival.tripId}`}
        className="flex min-h-15 items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted"
      >
        <RouteBadge name={arrival.routeName} color={arrival.routeColor} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">
            {formatLocalTime(arrival.eta.arrivalAt)}
            {arrival.date !== today ? <span className="font-normal text-muted-foreground"> · завтра</span> : null}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {formatEta(arrival.eta)} · {SOURCE_LABEL[arrival.eta.source]}
          </span>
        </span>
        {action ? (
          <span className="text-sm font-semibold text-primary">{action}</span>
        ) : free != null ? (
          <span className="text-sm whitespace-nowrap text-muted-foreground">
            {seatsLabel(free)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function ArrivalList({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl bg-card">{children}</ul>;
}

export function BoardSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="mx-1 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
