import Link from "next/link";
import { formatLocalDate, loadByStop, plural } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { DIRECTION_LABEL, buildAnalytics, routeSubtitle, windowLabel } from "@/lib/analytics";
import { getPassengersLeftBehind } from "@/lib/planning";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { EmptyState, LinkButton, LoadBar, Panel, PanelTitle, RouteBadge, Stat, StatusPill, cx } from "@/components/ui";
import { LoadBarChart } from "./load-charts";
import { BoardingChart, DailyLoadChart } from "./route-charts";

/** A day label for the x axis: "пт 25". */
function dayLabel(date: string): string {
  return formatLocalDate(date, { weekday: "short", day: "numeric" }).replace(",", "");
}

function periodHref(routeId: string | undefined, days: number, time?: string): string {
  const params = new URLSearchParams();
  if (routeId) params.set("route", routeId);
  params.set("days", String(days));
  if (time) params.set("time", time);
  return `/admin/analytics?${params.toString()}`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ route?: string; days?: string; time?: string }>;
}) {
  await requireRole("admin");
  const { route, days, time } = await searchParams;
  const windowDays = Number(days) === 7 || Number(days) === 30 ? Number(days) : 14;

  const all = await buildAnalytics(windowDays);
  const selected = route ? (all.routes.find((r) => r.routeId === route) ?? null) : null;
  const period = `${formatLocalDate(all.from)} — ${formatLocalDate(all.to)}`;

  const periods = (
    <div className="flex gap-2">
      {[7, 14, 30].map((d) => (
        <Link
          key={d}
          href={periodHref(selected?.routeId, d, time)}
          className={cx(
            "inline-flex min-h-10 items-center rounded-[10px] border px-3.5 text-sm font-semibold transition-colors",
            windowDays === d ? "border-primary bg-primary-soft text-primary" : "border-border bg-card hover:bg-muted",
          )}
        >
          {windowLabel(d)}
        </Link>
      ))}
    </div>
  );

  if (!selected) {
    return (
      <AdminMain>
        <PageHeader
          eyebrow={`Период ${period}`}
          title="Аналитика загрузки"
          description={`Пороги: перегрузка от ${all.thresholds.overloadPct}%, низкая загрузка ниже ${all.thresholds.lowAvgPct}%`}
          action={periods}
        />
        <PanelTitle>Сравнение маршрутов</PanelTitle>
        {all.routes.length === 0 ? (
          <EmptyState title="Маршрутов пока нет" hint="Создайте маршрут и расписание, чтобы увидеть аналитику." />
        ) : (
          <Table head={["Маршрут", "Направление", "Вместимость", "Средняя", "Макс.", "Перегруженных рейсов", "Статус"]}>
            {all.routes.map((r) => (
              <Row key={r.routeId}>
                <Cell className="w-24">
                  <Link href={periodHref(r.routeId, windowDays)} className="inline-flex items-center gap-2">
                    <RouteBadge name={r.routeName} color={r.routeColor} />
                  </Link>
                </Cell>
                <Cell>{routeSubtitle(r.description, r.direction)}</Cell>
                <Cell className="w-28 tabular-nums">{r.capacity ?? "—"}</Cell>
                <Cell className="w-56">
                  <LoadBar pct={r.stats.avgPct} />
                </Cell>
                <Cell className="w-20 tabular-nums">{r.stats.maxPct === null ? "—" : `${r.stats.maxPct}%`}</Cell>
                <Cell className="w-44 tabular-nums">
                  {r.stats.overloadedTrips} из {r.stats.trips}
                </Cell>
                <Cell className="w-44">
                  <StatusPill status={r.stats.status} />
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </AdminMain>
    );
  }

  // ---------------------------------------------------------- one route

  const departures = selected.byTime.filter((b) => b.avgPct !== null);
  const busiest = [...departures].sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))[0] ?? null;
  const quietest = [...departures].sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0))[0] ?? null;
  const focusTime = departures.find((d) => d.label === time)?.label ?? busiest?.label ?? null;
  const focus = departures.find((d) => d.label === focusTime) ?? null;

  const focusRecords = focusTime
    ? [...selected.records].filter((r) => r.startTime.slice(0, 5) === focusTime).sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const overCapacityDays = focusRecords.filter((r) => (r.loadPct ?? 0) >= all.thresholds.overloadPct).length;
  // A second departure to compare the focused one against: the quietest, when
  // it is not the same trip.
  const contrast = quietest && quietest.label !== focus?.label ? quietest : null;

  const focusTripIds = new Set(focusRecords.map((r) => r.tripId));
  const boarding = loadByStop(selected.stopRecords.filter((s) => focusTripIds.has(s.tripId)))
    .sort((a, b) => b.avgEffective - a.avgEffective)
    .slice(0, 6);

  const leftBehind = await getPassengersLeftBehind(all.from, all.to);
  const routeTripIds = new Set(selected.records.map((r) => r.tripId));
  const missedSeats = leftBehind
    .filter((t) => routeTripIds.has(t.tripId))
    .reduce((sum, t) => sum + t.names.length, 0);

  const overload = selected.signals.find((s) => s.kind === "overload") ?? null;
  const lowLoad = selected.signals.find((s) => s.kind === "low_load") ?? null;
  const topStops = boarding.slice(0, 2).map((s) => `«${s.stopName}»`);
  const excess =
    overload && selected.capacity && focus?.avgPassengers
      ? Math.max(0, Math.round(focus.avgPassengers - selected.capacity))
      : 0;

  return (
    <AdminMain>
      <PageHeader
        eyebrow={`Аналитика · ${period}`}
        badge={<RouteBadge name={selected.routeName} color={selected.routeColor} size="md" />}
        title={routeSubtitle(selected.description, selected.direction)}
        action={
          <>
            <LinkButton href={`/admin/analytics?days=${windowDays}`}>Другой маршрут</LinkButton>
            {periods}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <Stat
          label={focus ? `Рейс ${focus.label} · средняя` : "Средняя загрузка"}
          value={focus?.avgPct == null ? "—" : `${focus.avgPct}%`}
          hint={
            focus
              ? `выше вместимости ${overCapacityDays} из ${focusRecords.length} ${plural(focusRecords.length, ["дня", "дней", "дней"])}`
              : "нет завершённых рейсов"
          }
        />
        <Stat
          label={contrast ? `Рейс ${contrast.label} · средняя` : "Максимальная"}
          value={contrast ? `${contrast.avgPct}%` : (selected.stats.maxPct === null ? "—" : `${selected.stats.maxPct}%`)}
          hint={
            contrast
              ? (contrast.avgPct ?? 100) < 100
                ? "есть свободные места"
                : "тоже выше вместимости"
              : "пиковый рейс за период"
          }
        />
        <Stat
          label="Не хватило мест"
          value={missedSeats}
          hint={`${plural(missedSeats, ["поездка", "поездки", "поездок"])} за период`}
        />
        <Stat
          label="Вместимость"
          value={selected.capacity ?? "—"}
          hint="мест в назначенном транспорте"
        />
      </section>

      {departures.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">Рейс:</span>
          {departures.map((d) => (
            <Link
              key={d.key}
              href={periodHref(selected.routeId, windowDays, d.label)}
              aria-current={d.label === focusTime ? "page" : undefined}
              className={cx(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors",
                d.label === focusTime
                  ? "border-ink bg-ink font-bold text-on-ink"
                  : "border-border bg-card font-semibold text-body hover:bg-muted",
              )}
            >
              {d.label}
              <span className="tabular-nums opacity-80">{d.avgPct}%</span>
            </Link>
          ))}
        </div>
      ) : null}

      <section className="grid gap-3.5 xl:grid-cols-[1.5fr_1fr]">
        <Panel className="flex flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-bold">{focusTime ? `Рейс ${focusTime} по дням` : "Загрузка по дням"}</span>
            <span className="text-[13px] text-muted-foreground">
              Загрузка = больше из «записались» и «сели по факту», делённое на
              {selected.capacity ? ` ${selected.capacity} ${plural(selected.capacity, ["место", "места", "мест"])}` : " вместимость"}
            </span>
          </div>
          <DailyLoadChart
            data={focusRecords.map((r) => ({
              date: r.date,
              label: dayLabel(r.date),
              pct: r.loadPct,
              passengers: r.effective,
            }))}
          />
        </Panel>

        <div className="flex flex-col gap-3.5">
          <Panel className="flex flex-col gap-3 p-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-bold">{focusTime ? `Где садятся на ${focusTime}` : "Где садятся"}</span>
              <span className="text-[13px] text-muted-foreground">В среднем за рейс</span>
            </div>
            <BoardingChart
              data={boarding.map((s) => ({
                stopId: s.stopId,
                stopName: s.stopName,
                perTrip: Math.round(s.avgEffective),
              }))}
            />
          </Panel>

          <section className="flex flex-col gap-2.5 rounded-[--radius-panel] bg-ink p-5 text-on-ink">
            <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">Что можно сделать</span>
            {overload ? (
              <p className="text-[15px] leading-snug">
                {overload.reliefTime
                  ? `Добавить отправление ${overload.reliefTime}: на ${overload.peakTime} в среднем ${Math.round(overload.peakPassengers ?? 0)} ${plural(Math.round(overload.peakPassengers ?? 0), ["человек", "человека", "человек"])} при ${selected.capacity ?? "—"} местах`
                  : "Назначить транспорт большей вместимости"}
                {excess > 0 ? `, лишние ${excess} уедут раньше` : ""}
                {topStops.length ? `. Больше всего садятся на ${topStops.join(" и ")}` : ""}.
              </p>
            ) : lowLoad ? (
              <p className="text-[15px] leading-snug">
                Загрузка {selected.stats.avgPct}% при вместимости {selected.capacity ?? "—"}: можно назначить транспорт
                меньше или сократить число отправлений.
              </p>
            ) : (
              <p className="text-[15px] leading-snug">
                Маршрут в пределах порогов: средняя загрузка {selected.stats.avgPct ?? "—"}%, перегруженных рейсов{" "}
                {selected.stats.overloadedTrips} из {selected.stats.trips}. Менять расписание пока незачем.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={
                  overload?.reliefTime
                    ? `/admin/routes/${selected.routeId}?departure=${overload.reliefTime}#schedule`
                    : `/admin/routes/${selected.routeId}#schedule`
                }
                className="inline-flex min-h-9 items-center rounded-[9px] bg-card px-3.5 text-[13px] font-bold text-ink transition-colors hover:bg-muted"
              >
                {overload?.reliefTime ? "Добавить в расписание" : "Открыть расписание"}
              </Link>
              <Link
                href="/admin/planning"
                className="inline-flex min-h-9 items-center rounded-[9px] px-3.5 text-[13px] font-semibold text-on-ink shadow-[inset_0_0_0_1px_var(--color-ink-border)] transition-colors hover:bg-white/10"
              >
                Открыть прогноз
              </Link>
            </div>
          </section>
        </div>
      </section>

      <section className="grid gap-3.5 xl:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <PanelTitle>Загрузка по времени отправления</PanelTitle>
          <Panel className="p-4">
            <LoadBarChart
              data={selected.byTime.map((b) => ({
                label: b.label,
                avgPct: b.avgPct,
                trips: b.trips,
                avgPassengers: b.avgPassengers,
              }))}
              overloadPct={all.thresholds.overloadPct}
              lowPct={all.thresholds.lowAvgPct}
            />
          </Panel>
        </div>
        <div className="flex flex-col gap-2.5">
          <PanelTitle>Загрузка по дням недели</PanelTitle>
          <Panel className="p-4">
            <LoadBarChart
              data={selected.byWeekday.map((b) => ({
                label: b.label,
                avgPct: b.avgPct,
                trips: b.trips,
                avgPassengers: b.avgPassengers,
              }))}
              overloadPct={all.thresholds.overloadPct}
              lowPct={all.thresholds.lowAvgPct}
            />
          </Panel>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <PanelTitle>Загрузка по остановкам · все рейсы</PanelTitle>
        {selected.byStop.length === 0 ? (
          <EmptyState
            title="Нет данных по остановкам"
            hint="Данные появятся после завершённых рейсов с отметками водителя."
          />
        ) : (
          <Table head={["№", "Остановка", "Записались (среднее)", "Сели по факту (среднее)", "Пиковый спрос", "Рейсов"]}>
            {selected.byStop.map((s, i) => (
              <Row key={s.stopId}>
                <Cell className="w-12 text-muted-foreground tabular-nums">{i + 1}</Cell>
                <Cell className="font-medium">{s.stopName}</Cell>
                <Cell className="tabular-nums">{s.avgDemand}</Cell>
                <Cell className="tabular-nums">{s.avgBoarded}</Cell>
                <Cell className="tabular-nums">{s.avgEffective}</Cell>
                <Cell className="text-muted-foreground tabular-nums">{s.trips}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <PanelTitle>Рейсы за период</PanelTitle>
        <Table head={["Дата", "Отправление", "Записались", "Факт в салоне", "Загрузка"]}>
          {[...selected.records]
            .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : b.date.localeCompare(a.date)))
            .slice(0, 40)
            .map((r) => (
              <Row key={r.tripId}>
                <Cell className="w-28 tabular-nums">{formatLocalDate(r.date, { day: "2-digit", month: "2-digit" })}</Cell>
                <Cell className="w-32 tabular-nums">{r.startTime}</Cell>
                <Cell className="w-32 tabular-nums">{r.demand}</Cell>
                <Cell className="w-36 tabular-nums">{r.maxOnboard}</Cell>
                <Cell className="w-64">
                  <LoadBar pct={r.loadPct} />
                </Cell>
              </Row>
            ))}
        </Table>
        <p className="text-[13px] text-muted-foreground">
          {DIRECTION_LABEL[selected.direction]} · пороги: перегрузка от {all.thresholds.overloadPct}%, низкая загрузка
          ниже {all.thresholds.lowAvgPct}%.
        </p>
      </section>
    </AdminMain>
  );
}
