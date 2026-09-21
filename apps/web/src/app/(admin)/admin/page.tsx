import Link from "next/link";
import { formatLocalDate, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getDashboardCounts } from "@/lib/queries";
import { DIRECTION_LABEL, buildAnalytics } from "@/lib/analytics";
import { getLiveSignals, getLiveVehicles } from "@/lib/live";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { Card, EmptyState, LinkButton, LoadBar, RouteBadge, SectionTitle, Stat, StatusPill } from "@/components/ui";
import { IconAlert, IconChevronRight } from "@/components/icons";

export default async function AdminDashboard() {
  await requireRole("admin");
  const now = localNow();

  const analytics = await buildAnalytics();
  const counts = await getDashboardCounts(analytics.from, now.date);
  const [liveVehicles, liveSignals] = await Promise.all([getLiveVehicles(now.instant), getLiveSignals(now.instant, now.date)]);

  const withData = analytics.routes.filter((r) => r.stats.avgPct !== null);
  const avgLoad = withData.length
    ? Math.round(withData.reduce((s, r) => s + (r.stats.avgPct ?? 0), 0) / withData.length)
    : null;
  const maxLoad = withData.length ? Math.max(...withData.map((r) => r.stats.maxPct ?? 0)) : null;

  const overloaded = analytics.routes.filter((r) => r.stats.status === "overloaded");
  const low = analytics.routes.filter((r) => r.stats.status === "low");

  return (
    <AdminMain>
      <PageHeader
        title="Дашборд"
        description={`Данные за период ${formatLocalDate(analytics.from)} — ${formatLocalDate(analytics.to)}`}
        action={<LinkButton href="/admin/analytics">Подробная аналитика</LinkButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Маршруты" value={counts.routes} hint="активных" />
        <Stat label="Транспорт" value={counts.vehicles} />
        <Stat label="Водители" value={counts.drivers} />
        <Stat label="Пассажиры" value={counts.passengers} hint={`активных: ${counts.activePassengers}`} />
        <Stat label="Средняя загрузка" value={avgLoad === null ? "—" : `${avgLoad}%`} hint="по маршрутам" />
        <Stat label="Максимальная" value={maxLoad === null ? "—" : `${maxLoad}%`} hint="пиковый рейс" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <SectionTitle>Загрузка маршрутов</SectionTitle>
          {analytics.routes.length === 0 ? (
            <EmptyState title="Маршрутов пока нет" hint="Создайте маршрут, остановки и расписание, чтобы увидеть аналитику." />
          ) : (
            <Table head={["Маршрут", "Направление", "Вместимость", "Средняя / макс.", "Загрузка", "Статус", ""]}>
              {analytics.routes.map((r) => (
                <Row key={r.routeId}>
                  <Cell>
                    <RouteBadge name={r.routeName} color={r.routeColor} />
                  </Cell>
                  <Cell className="text-muted-foreground">{DIRECTION_LABEL[r.direction]}</Cell>
                  <Cell className="tabular-nums">{r.capacity ?? "—"}</Cell>
                  <Cell className="tabular-nums">
                    {r.stats.avgPassengers ?? "—"} / {r.stats.maxPassengers ?? "—"}
                  </Cell>
                  <Cell className="w-48">
                    <LoadBar pct={r.stats.avgPct} />
                  </Cell>
                  <Cell>
                    <StatusPill status={r.stats.status} />
                  </Cell>
                  <Cell>
                    <Link
                      href={`/admin/analytics?route=${r.routeId}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Разбор
                      <IconChevronRight className="size-4" />
                    </Link>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Загрузка считается как наибольшее из числа записавшихся пассажиров и фактического счёта водителя,
            делённое на вместимость назначенного транспорта.
          </p>
        </section>

        <section>
          <SectionTitle
            action={
              <Link href="/admin/live" className="text-xs font-medium text-primary hover:underline">
                Мониторинг
              </Link>
            }
          >
            Сейчас на линии
          </SectionTitle>
          <Card className="mb-4 text-sm">
            <p>
              Транспорта в рейсе: <span className="font-semibold tabular-nums">{liveVehicles.length}</span>
              {liveVehicles.length ? (
                <span className="text-muted-foreground">
                  {" "}· на связи {liveVehicles.filter((v) => v.tracking === "live").length}
                </span>
              ) : null}
            </p>
            {liveSignals.length ? (
              <ul className="mt-2 flex flex-col gap-1">
                {liveSignals.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <IconAlert className="mt-0.5 size-4 shrink-0 text-danger" />
                    <span>
                      <span className="font-medium">{s.title}</span>
                      <span className="text-muted-foreground"> — {s.details}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">Отклонений от маршрутов нет.</p>
            )}
          </Card>

          <SectionTitle>Сигналы загрузки</SectionTitle>
          {analytics.signals.length === 0 ? (
            <Card className="text-sm text-muted-foreground">
              Отклонений нет: все маршруты в пределах заданных порогов.
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {analytics.signals.map((s, i) => (
                <li key={`${s.routeId}:${i}`}>
                  <Card className={s.severity === "high" ? "border-danger/40" : "border-warn/40"}>
                    <div className="mb-2 flex items-start gap-2">
                      <IconAlert className={s.severity === "high" ? "size-5 text-danger" : "size-5 text-warn"} />
                      <p className="font-medium">{s.title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{s.details}</p>
                    <p className="mt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Возможные решения
                    </p>
                    <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm">
                      {s.suggestions.map((sg) => (
                        <li key={sg}>{sg}</li>
                      ))}
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <LinkButton href={`/admin/analytics?route=${s.routeId}`} className="text-xs">
                        Данные
                      </LinkButton>
                      <LinkButton href={`/admin/routes/${s.routeId}`} className="text-xs">
                        Изменить маршрут
                      </LinkButton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid gap-3">
            <Card className="text-sm">
              <p className="font-medium">Рейсы сегодня</p>
              <p className="mt-1 text-muted-foreground tabular-nums">
                Всего {counts.tripsToday}, завершено {counts.tripsCompletedToday}
              </p>
              <Link href="/admin/trips" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                Управление рейсами
              </Link>
            </Card>
            {overloaded.length || low.length ? (
              <Card className="text-sm">
                <p className="font-medium">Коротко</p>
                <p className="mt-1 text-muted-foreground">
                  Перегружено маршрутов: {overloaded.length}. С низкой загрузкой: {low.length}.
                </p>
              </Card>
            ) : null}
          </div>
        </section>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Система не меняет маршруты автоматически: она показывает данные и предлагает варианты, решение принимает администратор.
      </p>
    </AdminMain>
  );
}
