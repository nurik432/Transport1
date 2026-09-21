import Link from "next/link";
import { formatLocalDate } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { DIRECTION_LABEL, buildAnalytics } from "@/lib/analytics";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { Card, EmptyState, LoadBar, RouteBadge, SectionTitle, Stat, StatusPill, cx } from "@/components/ui";
import { IconAlert } from "@/components/icons";
import { LoadBarChart } from "./load-charts";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ route?: string; days?: string }>;
}) {
  await requireRole("admin");
  const { route, days } = await searchParams;
  const windowDays = Number(days) === 7 || Number(days) === 30 ? Number(days) : 14;

  const all = await buildAnalytics(windowDays);
  const selected = route ? (all.routes.find((r) => r.routeId === route) ?? null) : null;

  return (
    <AdminMain>
      <PageHeader
        title="Аналитика загрузки"
        description={`Период ${formatLocalDate(all.from)} — ${formatLocalDate(all.to)} · пороги: перегрузка от ${all.thresholds.overloadPct}%, низкая загрузка ниже ${all.thresholds.lowAvgPct}%`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Период:</span>
        {[7, 14, 30].map((d) => (
          <Link
            key={d}
            href={`/admin/analytics?${new URLSearchParams({ ...(route ? { route } : {}), days: String(d) }).toString()}`}
            className={cx(
              "min-h-9 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              windowDays === d ? "border-primary bg-primary-soft text-primary" : "border-border bg-card hover:bg-muted",
            )}
          >
            {d} дней
          </Link>
        ))}
        <span className="ml-4 text-sm text-muted-foreground">Маршрут:</span>
        <Link
          href={`/admin/analytics?days=${windowDays}`}
          className={cx(
            "min-h-9 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            !route ? "border-primary bg-primary-soft text-primary" : "border-border bg-card hover:bg-muted",
          )}
        >
          Все
        </Link>
        {all.routes.map((r) => (
          <Link
            key={r.routeId}
            href={`/admin/analytics?route=${r.routeId}&days=${windowDays}`}
            className={cx(
              "min-h-9 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              route === r.routeId ? "border-primary bg-primary-soft text-primary" : "border-border bg-card hover:bg-muted",
            )}
          >
            {r.routeName} · {r.direction === "to_work" ? "утро" : "вечер"}
          </Link>
        ))}
      </div>

      {selected ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <RouteBadge name={selected.routeName} color={selected.routeColor} />
            <span className="text-sm text-muted-foreground">
              {selected.description} · {DIRECTION_LABEL[selected.direction]}
            </span>
            <StatusPill status={selected.stats.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Вместимость" value={selected.capacity ?? "—"} hint="мест в транспорте" />
            <Stat label="Средняя загрузка" value={selected.stats.avgPct === null ? "—" : `${selected.stats.avgPct}%`} />
            <Stat label="Максимальная" value={selected.stats.maxPct === null ? "—" : `${selected.stats.maxPct}%`} />
            <Stat label="Среднее пассажиров" value={selected.stats.avgPassengers ?? "—"} hint={`максимум ${selected.stats.maxPassengers ?? "—"}`} />
            <Stat label="Рейсов с перегрузкой" value={`${selected.stats.overloadedTrips} из ${selected.stats.trips}`} />
          </div>

          {selected.signals.length ? (
            <ul className="flex flex-col gap-3">
              {selected.signals.map((s, i) => (
                <li key={i}>
                  <Card className={s.severity === "high" ? "border-danger/40" : "border-warn/40"}>
                    <div className="mb-1 flex items-center gap-2">
                      <IconAlert className={s.severity === "high" ? "size-5 text-danger" : "size-5 text-warn"} />
                      <p className="font-medium">{s.title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{s.details}</p>
                    <ul className="mt-2 flex list-disc flex-col gap-0.5 pl-5 text-sm">
                      {s.suggestions.map((sg) => (
                        <li key={sg}>{sg}</li>
                      ))}
                    </ul>
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionTitle>Загрузка по времени отправления</SectionTitle>
              <Card>
                <LoadBarChart
                  data={selected.byTime.map((b) => ({ label: b.label, avgPct: b.avgPct, trips: b.trips, avgPassengers: b.avgPassengers }))}
                  overloadPct={all.thresholds.overloadPct}
                  lowPct={all.thresholds.lowAvgPct}
                />
              </Card>
            </section>

            <section>
              <SectionTitle>Загрузка по дням недели</SectionTitle>
              <Card>
                <LoadBarChart
                  data={selected.byWeekday.map((b) => ({ label: b.label, avgPct: b.avgPct, trips: b.trips, avgPassengers: b.avgPassengers }))}
                  overloadPct={all.thresholds.overloadPct}
                  lowPct={all.thresholds.lowAvgPct}
                />
              </Card>
            </section>
          </div>

          <section>
            <SectionTitle>Загрузка по остановкам</SectionTitle>
            {selected.byStop.length === 0 ? (
              <EmptyState title="Нет данных по остановкам" hint="Данные появятся после завершённых рейсов с отметками водителя." />
            ) : (
              <Table head={["№", "Остановка", "Записались (среднее)", "Сели по факту (среднее)", "Пиковый спрос", "Рейсов"]}>
                {selected.byStop.map((s, i) => (
                  <Row key={s.stopId}>
                    <Cell className="text-muted-foreground tabular-nums">{i + 1}</Cell>
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

          <section>
            <SectionTitle>Рейсы за период</SectionTitle>
            <Table head={["Дата", "Отправление", "Записались", "Факт в салоне", "Загрузка"]}>
              {[...selected.records]
                .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : b.date.localeCompare(a.date)))
                .slice(0, 40)
                .map((r) => (
                  <Row key={r.tripId}>
                    <Cell className="tabular-nums">{formatLocalDate(r.date, { day: "2-digit", month: "2-digit" })}</Cell>
                    <Cell className="tabular-nums">{r.startTime}</Cell>
                    <Cell className="tabular-nums">{r.demand}</Cell>
                    <Cell className="tabular-nums">{r.maxOnboard}</Cell>
                    <Cell className="w-56">
                      <LoadBar pct={r.loadPct} />
                    </Cell>
                  </Row>
                ))}
            </Table>
          </section>
        </div>
      ) : (
        <section>
          <SectionTitle>Сравнение маршрутов</SectionTitle>
          <Table head={["Маршрут", "Направление", "Вместимость", "Средняя", "Макс.", "Перегруженных рейсов", "Статус"]}>
            {all.routes.map((r) => (
              <Row key={r.routeId}>
                <Cell>
                  <Link href={`/admin/analytics?route=${r.routeId}&days=${windowDays}`} className="inline-flex items-center gap-2 hover:underline">
                    <RouteBadge name={r.routeName} color={r.routeColor} />
                  </Link>
                </Cell>
                <Cell className="text-muted-foreground">{DIRECTION_LABEL[r.direction]}</Cell>
                <Cell className="tabular-nums">{r.capacity ?? "—"}</Cell>
                <Cell className="w-48">
                  <LoadBar pct={r.stats.avgPct} />
                </Cell>
                <Cell className="tabular-nums">{r.stats.maxPct === null ? "—" : `${r.stats.maxPct}%`}</Cell>
                <Cell className="tabular-nums">
                  {r.stats.overloadedTrips} из {r.stats.trips}
                </Cell>
                <Cell>
                  <StatusPill status={r.stats.status} />
                </Cell>
              </Row>
            ))}
          </Table>
        </section>
      )}
    </AdminMain>
  );
}
