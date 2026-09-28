import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listRoutes } from "@/lib/queries";
import { buildAnalytics, DIRECTION_LABEL } from "@/lib/analytics";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { LinkButton, LoadBar, Pill, RouteBadge, StatusPill } from "@/components/ui";
import { RebuildGeometryButton, RouteRowActions } from "./route-actions";

const STATUS_LABEL: Record<string, string> = { active: "Активен", draft: "Черновик", inactive: "Отключён" };

export default async function RoutesPage() {
  await requireRole("admin");
  const [routes, analytics] = await Promise.all([listRoutes(false), buildAnalytics()]);
  const statsById = new Map(analytics.routes.map((r) => [r.routeId, r]));

  return (
    <AdminMain>
      <PageHeader
        title="Маршруты"
        description="Маршрут описывает одно направление. Утренний и вечерний рейсы — две записи с одним номером."
        action={
          <span className="flex flex-wrap items-center gap-2">
            <RebuildGeometryButton />
            <LinkButton href="/admin/routes/new" variant="primary">
              Создать маршрут
            </LinkButton>
          </span>
        }
      />

      <Table
        head={["Маршрут", "Направление", "Остановок", "Отправлений", "Путь", "Средняя загрузка", "Статус", "Состояние", ""]}
        minWidth="56rem"
      >
        {routes.map((r) => {
          const a = statsById.get(r.id);
          // An active route with no departures produces no trips at all, and
          // nothing else on this screen would say so.
          const silent = r.status === "active" && r.schedules.length === 0;
          return (
            <Row key={r.id} tone={silent ? "attention" : "plain"}>
              <Cell>
                <Link href={`/admin/routes/${r.id}`} className="inline-flex items-center gap-2 hover:underline">
                  <RouteBadge name={r.name} color={r.color} />
                  <span className="max-w-64 truncate text-muted-foreground">{r.description}</span>
                </Link>
              </Cell>
              <Cell className="text-muted-foreground">{DIRECTION_LABEL[r.direction]}</Cell>
              <Cell className="tabular-nums">{r.stops.length}</Cell>
              <Cell className="tabular-nums">
                {r.schedules.length > 0 ? (
                  r.schedules.length
                ) : (
                  <Pill tone="warn">нет расписания</Pill>
                )}
              </Cell>
              <Cell className="whitespace-nowrap text-muted-foreground tabular-nums">
                {r.pathSource === "road" && r.pathDistanceM ? (
                  `${(r.pathDistanceM / 1000).toFixed(1).replace(".", ",")} км по дорогам`
                ) : (
                  <span className="text-warn">прямые линии</span>
                )}
              </Cell>
              <Cell className="w-48">{a ? <LoadBar pct={a.stats.avgPct} /> : "—"}</Cell>
              <Cell>{a ? <StatusPill status={a.stats.status} /> : null}</Cell>
              <Cell className="text-muted-foreground">{STATUS_LABEL[r.status]}</Cell>
              <Cell>
                <RouteRowActions id={r.id} name={r.name} />
              </Cell>
            </Row>
          );
        })}
      </Table>
    </AdminMain>
  );
}
