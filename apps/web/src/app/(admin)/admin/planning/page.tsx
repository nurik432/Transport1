import Link from "next/link";
import {
  BASIS_LABEL,
  CONFIDENCE_LABEL,
  RISK_LABEL,
  addDays,
  formatLocalDate,
  localNow,
  type ForecastRisk,
} from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { buildCoverage, buildForecast, getPassengersLeftBehind, HISTORY_DAYS, HORIZON_DAYS } from "@/lib/planning";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { MapPanel } from "@/components/map";
import { Card, EmptyState, LoadBar, RouteBadge, SectionTitle, Stat, cx } from "@/components/ui";
import { IconAlert, IconPin, IconRoute, IconUsers } from "@/components/icons";
import { AddDepartureButton, CreateRouteDraftButton } from "./proposal-actions";

const RISK_STYLE: Record<ForecastRisk, string> = {
  overflow: "bg-danger-soft text-red-800",
  tight: "bg-warn-soft text-yellow-800",
  normal: "bg-ok-soft text-green-800",
  low: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
};

function RiskPill({ risk }: { risk: ForecastRisk }) {
  return (
    <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", RISK_STYLE[risk])}>
      {RISK_LABEL[risk]}
    </span>
  );
}

export default async function PlanningPage() {
  await requireRole("admin");
  const now = localNow();

  const [forecast, coverage, leftBehind] = await Promise.all([
    buildForecast(),
    buildCoverage(),
    getPassengersLeftBehind(addDays(now.date, -HISTORY_DAYS), addDays(now.date, HORIZON_DAYS)),
  ]);

  const atRisk = forecast.routes.filter((r) => r.overflowTrips > 0 || r.peaks.length > 0);
  const coveredClusters = coverage.clusters.length - coverage.underserved.length;
  const uncoveredPeople = coverage.underserved.reduce((s, c) => s + c.size, 0);

  return (
    <AdminMain>
      <PageHeader
        title="Прогноз и рекомендации"
        description={`Прогноз на ${HORIZON_DAYS} дней по истории за ${HISTORY_DAYS} дней. Решения принимает администратор — система только показывает данные.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Маршрутов под риском" value={atRisk.length} hint={`из ${forecast.routes.length}`} />
        <Stat
          label="Рейсов без мест"
          value={forecast.routes.reduce((s, r) => s + r.overflowTrips, 0)}
          hint={`до ${formatLocalDate(forecast.to)}`}
        />
        <Stat label="Групп проживания" value={coverage.clusters.length} hint={`покрыто ${coveredClusters}`} />
        <Stat label="Без остановки рядом" value={uncoveredPeople} hint="сотрудников" />
        <Stat
          label="Без адреса"
          value={coverage.withoutHome}
          hint={`из ${coverage.totalPassengers} пассажиров`}
        />
      </div>

      {/* ---------------------------------------------------------------- forecast */}
      <section className="mb-8">
        <SectionTitle>Прогноз спроса по маршрутам</SectionTitle>

        {forecast.routes.length === 0 ? (
          <EmptyState
            title="Нет запланированных рейсов"
            hint="Сгенерируйте рейсы из расписания, чтобы увидеть прогноз."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {forecast.routes.map((route) => (
              <Card key={route.routeId}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <RouteBadge name={route.routeName} color={route.routeColor} />
                    <span className="text-sm text-muted-foreground">
                      {route.description} · {route.direction === "to_work" ? "утро" : "вечер"}
                    </span>
                  </div>
                  {route.overflowTrips > 0 ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-danger">
                      <IconAlert className="size-4" />
                      {route.overflowTrips} рейсов без мест, не поместятся до {route.worstShortfall} чел.
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Мест хватает</span>
                  )}
                </div>

                {route.peaks.length > 0 ? (
                  <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2">
                    <span className="text-sm">
                      Пик спроса: <span className="font-medium">{route.peaks[0]!.startTime}</span>, ожидается{" "}
                      <span className="font-medium tabular-nums">{route.peaks[0]!.expected}</span> чел.
                      {route.peaks[0]!.capacity ? ` при вместимости ${route.peaks[0]!.capacity}` : ""}
                    </span>
                    <AddDepartureButton
                      routeId={route.routeId}
                      departureTime={shiftTime(route.peaks[0]!.startTime, -15)}
                    />
                    <Link href={`/admin/routes/${route.routeId}`} className="text-sm font-medium text-primary hover:underline">
                      Изменить маршрут
                    </Link>
                  </div>
                ) : null}

                <Table head={["Дата", "Отправление", "Ожидается", "Вместимость", "Загрузка", "Риск", "Основание"]}>
                  {route.trips.slice(0, 12).map((t) => (
                    <Row key={t.tripId}>
                      <Cell className="whitespace-nowrap tabular-nums">
                        {formatLocalDate(t.date, { weekday: "short", day: "2-digit", month: "2-digit" })}
                      </Cell>
                      <Cell className="font-medium tabular-nums">{t.startTime}</Cell>
                      <Cell className="tabular-nums">
                        {t.basis === "none" ? "—" : t.expected}
                        {t.samples > 0 ? (
                          <span className="text-muted-foreground"> ({t.low}–{t.high})</span>
                        ) : null}
                      </Cell>
                      <Cell className="tabular-nums">{t.capacity ?? "—"}</Cell>
                      <Cell className="w-40">
                        <LoadBar pct={t.loadPct} />
                      </Cell>
                      <Cell>
                        <RiskPill risk={t.risk} />
                      </Cell>
                      <Cell className="text-xs text-muted-foreground">
                        {BASIS_LABEL[t.basis]}
                        {t.samples > 0 ? ` · ${t.samples} рейсов · точность ${CONFIDENCE_LABEL[t.confidence]}` : ""}
                      </Cell>
                    </Row>
                  ))}
                </Table>
              </Card>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Прогноз — это средневзвешенное число пассажиров по сопоставимым прошлым рейсам: чем свежее рейс, тем больше
          его вес. В скобках показан наблюдавшийся разброс.
        </p>
      </section>

      {/* ---------------------------------------------------------------- left behind */}
      {leftBehind.length > 0 ? (
        <section className="mb-8">
          <SectionTitle>Кто не помещается в транспорт</SectionTitle>
          <Table head={["Дата", "Рейс", "Маршрут", "Записались", "Вместимость", "Не хватило мест"]}>
            {leftBehind.slice(0, 10).map((t) => (
              <Row key={t.tripId}>
                <Cell className="whitespace-nowrap tabular-nums">
                  {formatLocalDate(t.date, { day: "2-digit", month: "2-digit" })}
                </Cell>
                <Cell className="font-medium tabular-nums">{t.startTime}</Cell>
                <Cell>{t.routeName}</Cell>
                <Cell className="tabular-nums">{t.booked}</Cell>
                <Cell className="tabular-nums">{t.capacity}</Cell>
                <Cell>
                  <span className="text-danger">{t.names.length}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{t.names.slice(0, 3).join(", ")}</span>
                </Cell>
              </Row>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Список формируется по порядку записи: указаны сотрудники, записавшиеся после того, как места закончились.
          </p>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- coverage */}
      <section className="mb-8">
        <SectionTitle>Где живут сотрудники</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <MapPanel
            className="h-[26rem] w-full rounded-[--radius-card] border border-border"
            stops={coverage.clusters.length ? [] : []}
            areas={coverage.clusters.map((c) => ({
              id: c.id,
              lat: c.center.lat,
              lng: c.center.lng,
              radiusM: Math.max(300, c.spreadM),
              label: `${c.size} сотрудников`,
              note: c.nearestStop
                ? `Ближайшая остановка: ${c.nearestStop.name}, ${c.nearestStop.distanceM} м`
                : "Рядом нет остановок",
              alert: coverage.underserved.some((u) => u.id === c.id),
            }))}
          />

          <div className="flex flex-col gap-3">
            <Card className="text-sm">
              <p className="mb-2 font-medium">Как читать карту</p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                <li>Синяя зона — группа сотрудников рядом с существующей остановкой.</li>
                <li>Оранжевая зона — до остановки дальше 600 м пешком.</li>
                <li>Группы меньше трёх человек не показываются.</li>
              </ul>
            </Card>

            {coverage.underserved.length === 0 ? (
              <Card className="text-sm text-muted-foreground">
                Все группы проживания находятся в пешей доступности от остановок.
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {coverage.underserved.map((c) => (
                  <li key={c.id}>
                    <Card className="flex items-start gap-3">
                      <IconPin className="mt-0.5 size-5 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">{c.size} сотрудников без остановки рядом</p>
                        <p className="text-muted-foreground">
                          {c.nearestStop
                            ? `До «${c.nearestStop.name}» — ${c.nearestStop.distanceM} м`
                            : "Поблизости нет ни одной остановки"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{c.names.slice(0, 4).join(", ")}</p>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- proposals */}
      <section>
        <SectionTitle>Предложения</SectionTitle>

        <div className="flex flex-col gap-4">
          {coverage.stopSuggestions.length > 0 ? (
            <Card>
              <div className="mb-2 flex items-center gap-2">
                <IconPin className="size-5 text-primary" />
                <p className="font-medium">Добавить остановку на существующий маршрут</p>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Эти группы живут рядом с уже существующей линией — достаточно добавить остановку, новый маршрут не нужен.
              </p>
              <Table head={["Сотрудников", "Маршрут", "Отклонение от линии", "Ближайшая остановка", ""]}>
                {coverage.stopSuggestions.map((s) => (
                  <Row key={s.cluster.id}>
                    <Cell className="font-medium tabular-nums">{s.cluster.size}</Cell>
                    <Cell>{s.routeName}</Cell>
                    <Cell className="tabular-nums">{s.detourM} м</Cell>
                    <Cell className="text-muted-foreground">
                      {s.cluster.nearestStop
                        ? `${s.cluster.nearestStop.name}, ${s.cluster.nearestStop.distanceM} м`
                        : "нет"}
                    </Cell>
                    <Cell>
                      <Link
                        href={`/admin/routes/${s.routeId}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Открыть маршрут
                      </Link>
                    </Cell>
                  </Row>
                ))}
              </Table>
            </Card>
          ) : null}

          {coverage.proposals.length > 0 ? (
            coverage.proposals.map((proposal, index) => (
              <Card key={proposal.clusterIds.join("-")}>
                <div className="mb-2 flex items-center gap-2">
                  <IconRoute className="size-5 text-primary" />
                  <p className="font-medium">
                    Черновик нового маршрута{coverage.proposals.length > 1 ? ` №${index + 1}` : ""}
                  </p>
                </div>
                <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <IconUsers className="size-4" />
                    ожидается {proposal.expectedPassengers} пассажиров
                  </span>
                  <span>
                    протяжённость по прямой {(proposal.totalDistanceM / 1000).toFixed(1).replace(".", ",")} км
                  </span>
                  <span>время в пути около {proposal.durationMin} мин</span>
                </p>

                <Table head={["№", "Остановка", "Через, мин", "Сядут", "Статус"]}>
                  {proposal.stops.map((s, i) => (
                    <Row key={`${s.name}-${i}`}>
                      <Cell className="text-muted-foreground tabular-nums">{i + 1}</Cell>
                      <Cell className="font-medium">{s.name}</Cell>
                      <Cell className="tabular-nums">{s.offsetMin}</Cell>
                      <Cell className="tabular-nums">{s.expectedPassengers || "—"}</Cell>
                      <Cell className="text-muted-foreground">{s.isNew ? "будет создана" : "существующая"}</Cell>
                    </Row>
                  ))}
                </Table>

                <p className="mt-3 text-xs text-muted-foreground">
                  Расстояние и время — предварительная оценка по прямой. Точный путь по дорогам построится при создании
                  черновика.
                </p>

                <div className="mt-4">
                  <CreateRouteDraftButton
                    name={`Новый ${index + 1}`}
                    description={`Предложен системой: ${proposal.expectedPassengers} сотрудников без остановки рядом`}
                    departures={["07:30"]}
                    stops={proposal.stops.map((s) => ({
                      stopId: s.stopId,
                      name: s.isNew ? cleanStopName(s.name) : s.name,
                      lat: s.lat,
                      lng: s.lng,
                      offsetMin: s.offsetMin,
                    }))}
                  />
                </div>
              </Card>
            ))
          ) : coverage.underserved.length === 0 ? (
            <Card className="text-sm text-muted-foreground">
              Новый маршрут не требуется: все группы проживания охвачены сетью остановок.
            </Card>
          ) : null}
        </div>
      </section>
    </AdminMain>
  );
}

/** Turns "Новая остановка (7 чел.)" into a name an administrator can edit. */
function cleanStopName(name: string): string {
  return name.replace(/\s*\(.*\)$/, "").trim() || "Новая остановка";
}

/** "07:30" shifted by minutes, used to suggest an extra departure before the peak. */
function shiftTime(time: string, deltaMin: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = ((h ?? 0) * 60 + (m ?? 0) + deltaMin + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
