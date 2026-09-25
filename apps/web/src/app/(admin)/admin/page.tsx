import Link from "next/link";
import { formatLocalDate, formatLocalTime, localNow, plural } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getDashboardCounts } from "@/lib/queries";
import { DEFAULT_WINDOW_DAYS, buildAnalytics, routeSubtitle, windowLabel } from "@/lib/analytics";
import { getAttention } from "@/lib/attention";
import { getLiveVehicles } from "@/lib/live";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { AttentionCard } from "@/components/attention-card";
import { EmptyState, LinkButton, LoadBar, Panel, PanelTitle, RouteBadge, Stat, StatSuffix, StatusPill } from "@/components/ui";
import { IconChevronRight } from "@/components/icons";

/** Sentence-case a Russian date that Intl returns in lower case. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function AdminDashboard() {
  await requireRole("admin");
  const now = localNow();

  const [analytics, attention, liveVehicles] = await Promise.all([
    buildAnalytics(),
    getAttention(),
    getLiveVehicles(now.instant),
  ]);
  const counts = await getDashboardCounts(analytics.from, now.date);

  const withData = analytics.routes.filter((r) => r.stats.avgPct !== null);
  const avgLoad = withData.length
    ? Math.round(withData.reduce((s, r) => s + (r.stats.avgPct ?? 0), 0) / withData.length)
    : null;

  // The single worst departure of the period: the number is only useful with
  // the route and the time next to it.
  const peak = withData.reduce<{ pct: number; routeName: string; time: string | null } | null>((best, r) => {
    const pct = r.stats.maxPct;
    if (pct === null || (best && pct <= best.pct)) return best;
    const hottest = [...r.byTime].sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))[0];
    return { pct, routeName: r.routeName, time: hottest?.label ?? null };
  }, null);

  const period = windowLabel(DEFAULT_WINDOW_DAYS);
  // Six cards still fit above the fold; the heading keeps the honest total.
  const shown = attention.slice(0, 6);
  const hidden = attention.length - shown.length;
  const onlineNow = counts.tripsInProgressToday;
  const tracked = liveVehicles.filter((v) => v.tracking === "live").length;

  return (
    <AdminMain>
      <PageHeader
        eyebrow={`${capitalize(formatLocalDate(now.date, { weekday: "long", day: "numeric", month: "long" }))} · обновлено в ${formatLocalTime(now.instant)}`}
        title="Дашборд"
        action={<LinkButton href="/admin/analytics">Подробная аналитика</LinkButton>}
      />

      <section aria-labelledby="attention" className="flex flex-col gap-2.5">
        <PanelTitle id="attention">
          Требует решения{attention.length ? ` · ${attention.length}` : ""}
        </PanelTitle>
        {attention.length === 0 ? (
          <Panel className="p-4 text-sm text-muted-foreground">
            Сейчас ничего не требует решения: рейсы идут по маршрутам, перегруженных направлений нет.
          </Panel>
        ) : (
          <>
            <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((item) => (
                <AttentionCard key={item.id} item={item} />
              ))}
            </div>
            {hidden > 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Ещё {hidden} {plural(hidden, ["похожая ситуация", "похожие ситуации", "похожих ситуаций"])} —{" "}
                <Link href={`/admin/trips?date=${now.date}`} className="font-semibold text-primary hover:underline">
                  смотреть в рейсах
                </Link>
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-label="Сегодня" className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <Stat
          label="На линии сейчас"
          value={
            <>
              {onlineNow} <StatSuffix>из {counts.vehicles}</StatSuffix>
            </>
          }
          hint={onlineNow ? `на связи ${tracked}` : "рейсов в пути нет"}
        />
        <Stat
          label="Рейсов сегодня"
          value={counts.tripsToday}
          hint={`завершено ${counts.tripsCompletedToday} · отменено ${counts.tripsCancelledToday}`}
        />
        <Stat
          label="Записались на сегодня"
          value={counts.bookedToday}
          hint={`из ${counts.passengers} ${plural(counts.passengers, ["сотрудника", "сотрудников", "сотрудников"])}`}
        />
        <Stat
          label={`Средняя загрузка · ${period}`}
          value={avgLoad === null ? "—" : `${avgLoad}%`}
          hint={
            peak
              ? `пик ${peak.pct}% · ${peak.routeName}${peak.time ? ` в ${peak.time}` : ""}`
              : "данных за период пока нет"
          }
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <PanelTitle>Загрузка маршрутов · {period}</PanelTitle>
        {analytics.routes.length === 0 ? (
          <EmptyState
            title="Маршрутов пока нет"
            hint="Создайте маршрут, остановки и расписание, чтобы увидеть аналитику."
          />
        ) : (
          <Table head={["Маршрут", "Направление", "Сред. / макс.", "Средняя загрузка", "Статус", ""]}>
            {analytics.routes.map((r) => {
              const hottest = [...r.byTime].sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))[0];
              return (
                <Row key={r.routeId}>
                  <Cell className="w-24">
                    <RouteBadge name={r.routeName} color={r.routeColor} />
                  </Cell>
                  <Cell>{routeSubtitle(r.description, r.direction)}</Cell>
                  <Cell className="w-28 tabular-nums">
                    {r.stats.avgPassengers === null ? "—" : Math.round(r.stats.avgPassengers)} /{" "}
                    {r.stats.maxPassengers ?? "—"}
                  </Cell>
                  <Cell className="w-64">
                    <LoadBar pct={r.stats.avgPct} />
                  </Cell>
                  <Cell className="w-52">
                    <StatusPill
                      status={r.stats.status}
                      note={r.stats.status === "overloaded" && hottest ? `в ${hottest.label}` : undefined}
                    />
                  </Cell>
                  <Cell className="w-24">
                    <Link
                      href={`/admin/analytics?route=${r.routeId}`}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                    >
                      Разбор
                      <IconChevronRight className="size-4" />
                    </Link>
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
        <p className="text-[13px] text-muted-foreground">
          Загрузка — наибольшее из числа записавшихся и фактического счёта водителя, делённое на вместимость
          назначенного транспорта. Система не меняет маршруты сама: решение принимает администратор.
        </p>
      </section>
    </AdminMain>
  );
}
