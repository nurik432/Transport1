import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getAttendanceSettings } from "@/lib/attendance";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { EmptyState } from "@/components/ui";
import { PointRowActions, PointsEditor } from "./points-editor";

export default async function AttendancePointsPage() {
  await requireRole("admin");
  const [cfg, points] = await Promise.all([
    getAttendanceSettings(),
    db
      .select({
        id: schema.attendancePoints.id,
        name: schema.attendancePoints.name,
        lat: schema.attendancePoints.lat,
        lng: schema.attendancePoints.lng,
        radiusM: schema.attendancePoints.radiusM,
        status: schema.attendancePoints.status,
        // Qualified by hand: with no join Drizzle writes the column as a bare
        // "id", which inside the subquery would mean sc.id.
        scans: sql<number>`(select count(*) from ${schema.attendanceScans} sc where sc.point_id = ${schema.attendancePoints}.id)`,
      })
      .from(schema.attendancePoints)
      .orderBy(asc(schema.attendancePoints.name)),
  ]);

  return (
    <AdminMain>
      <PageHeader
        title="Точки сканирования"
        eyebrow="Табель"
        description={`Печатный QR на проходной. Водитель сканирует его утром и вечером; отметка засчитывается в радиусе точки (по умолчанию ${cfg.defaultRadiusM} м).`}
        action={
          <Link href="/admin/settings#attendance" className="text-sm font-medium text-primary hover:underline">
            Окна и праздники — в настройках
          </Link>
        }
      />

      <div className="mb-6">
        <PointsEditor defaultRadiusM={cfg.defaultRadiusM} />
      </div>

      {points.length === 0 ? (
        <EmptyState title="Точек пока нет" hint="Добавьте первую точку и распечатайте её QR-код." />
      ) : (
        <Table head={["Название", "Координаты", "Радиус, м", "Отметок", "Статус", ""]}>
          {points.map((p) => (
            <Row key={p.id}>
              <Cell className="font-medium">{p.name}</Cell>
              <Cell className="text-muted-foreground tabular-nums">
                {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
              </Cell>
              <Cell className="tabular-nums">{p.radiusM ?? `${cfg.defaultRadiusM} (по умолчанию)`}</Cell>
              <Cell className="text-muted-foreground tabular-nums">{Number(p.scans)}</Cell>
              <Cell>{p.status === "active" ? "Работает" : "Отключена"}</Cell>
              <Cell>
                <PointRowActions
                  id={p.id}
                  name={p.name}
                  lat={p.lat}
                  lng={p.lng}
                  radiusM={p.radiusM}
                  status={p.status}
                  defaultRadiusM={cfg.defaultRadiusM}
                />
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </AdminMain>
  );
}
