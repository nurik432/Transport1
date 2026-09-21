import { desc, eq, sql } from "drizzle-orm";
import { asc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { MessageForm } from "./message-form";

export default async function MessagesPage() {
  await requireRole("admin");

  const [routes, recent] = await Promise.all([
    db
      .select({ id: schema.routes.id, name: schema.routes.name, direction: schema.routes.direction })
      .from(schema.routes)
      .where(eq(schema.routes.status, "active"))
      .orderBy(asc(schema.routes.name)),
    db
      .select({
        title: schema.notifications.title,
        body: schema.notifications.body,
        type: schema.notifications.type,
        createdAt: sql<string>`max(${schema.notifications.createdAt})`,
        recipients: sql<number>`count(*)`,
      })
      .from(schema.notifications)
      .groupBy(schema.notifications.title, schema.notifications.body, schema.notifications.type)
      .orderBy(desc(sql`max(${schema.notifications.createdAt})`))
      .limit(20),
  ]);

  const TYPE_LABEL: Record<string, string> = {
    admin_message: "Сообщение администратора",
    route_changed: "Изменение маршрута",
    schedule_changed: "Изменение расписания",
    trip_cancelled: "Отмена рейса",
    trip_delayed: "Задержка",
    vehicle_approaching: "Транспорт рядом",
    new_route: "Новый маршрут",
    route_overloaded: "Перегрузка маршрута",
    route_underloaded: "Низкая загрузка",
  };

  return (
    <AdminMain>
      <PageHeader title="Уведомления" description="Сообщения приходят внутри приложения пассажирам и водителям." />

      <div className="mb-6 max-w-3xl">
        <MessageForm
          routeOptions={routes.map((r) => ({
            value: r.id,
            label: `${r.name} · ${r.direction === "to_work" ? "утро" : "вечер"}`,
          }))}
        />
      </div>

      <Table head={["Отправлено", "Тип", "Заголовок", "Текст", "Получателей"]}>
        {recent.map((n, i) => (
          <Row key={i}>
            <Cell className="whitespace-nowrap text-muted-foreground tabular-nums">
              {new Intl.DateTimeFormat("ru-RU", {
                timeZone: "Asia/Dushanbe",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(n.createdAt))}
            </Cell>
            <Cell className="text-muted-foreground">{TYPE_LABEL[n.type] ?? n.type}</Cell>
            <Cell className="font-medium">{n.title}</Cell>
            <Cell className="max-w-96 truncate text-muted-foreground">{n.body}</Cell>
            <Cell className="tabular-nums">{Number(n.recipients)}</Cell>
          </Row>
        ))}
      </Table>
    </AdminMain>
  );
}
