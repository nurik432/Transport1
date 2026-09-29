import { asc, desc, eq } from "drizzle-orm";
import { canManageUser } from "@transport/domain";
import { requireSuper } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { AdminRowActions, AdminsEditor } from "./admins-editor";

export default async function AdminsPage() {
  const me = await requireSuper();

  const admins = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      phone: schema.users.phone,
      status: schema.users.status,
      isSuper: schema.users.isSuper,
    })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"))
    .orderBy(desc(schema.users.isSuper), asc(schema.users.name));

  return (
    <AdminMain>
      <PageHeader
        title="Администраторы"
        description="Только суперадминистратор создаёт администраторов, блокирует их и сбрасывает пароли. Обычные администраторы управляют маршрутами, водителями и пассажирами."
      />

      <div className="mb-6">
        <AdminsEditor />
      </div>

      <Table head={["Имя", "Телефон", "Роль", "Статус", ""]}>
        {admins.map((a) => (
          <Row key={a.id}>
            <Cell className="font-medium">{a.name}</Cell>
            <Cell className="text-muted-foreground tabular-nums">{a.phone}</Cell>
            <Cell>{a.isSuper ? "Суперадминистратор" : "Администратор"}</Cell>
            <Cell>{a.status === "blocked" ? <span className="text-danger">Заблокирован</span> : "Активен"}</Cell>
            <Cell>
              {canManageUser(me, { ...a, role: "admin" }) ? <AdminRowActions id={a.id} name={a.name} userStatus={a.status} /> : null}
            </Cell>
          </Row>
        ))}
      </Table>
    </AdminMain>
  );
}
