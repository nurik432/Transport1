import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listRoutes } from "@/lib/queries";
import { buildAnalytics, DIRECTION_LABEL } from "@/lib/analytics";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { LinkButton, LoadBar, RouteBadge, StatusPill } from "@/components/ui";
import { RouteRowActions } from "./route-actions";

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
        action={<LinkButton href="/admin/routes/new" variant="primary">Создать маршрут</LinkButton>}
      />

      <Table head={["Маршрут", "Направление", "Остановок", "Отправлений", "Средняя загрузка", "Статус", "Состояние", ""]}>
        {routes.map((r) => {
          const a = statsById.get(r.id);
          return (
            <Row key={r.id}>
              <Cell>
                <Link href={`/admin/routes/${r.id}`} className="inline-flex items-center gap-2 hover:underline">
                  <RouteBadge name={r.name} color={r.color} />
                  <span className="max-w-64 truncate text-muted-foreground">{r.description}</span>
                </Link>
              </Cell>
              <Cell className="text-muted-foreground">{DIRECTION_LABEL[r.direction]}</Cell>
              <Cell className="tabular-nums">{r.stops.length}</Cell>
              <Cell className="text-muted-foreground tabular-nums">
                {r.schedules.length ? r.schedules.map((s) => s.departureTime).join(", ") : "—"}
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
