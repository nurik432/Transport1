import Link from "next/link";
import { WORK_SCHEDULE_KIND_LABEL } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { listSchedules, versionLabel } from "@/lib/work-schedules";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { Pill } from "@/components/ui";
import { Collapsible } from "@/components/entity-form";
import { CreateScheduleForm } from "./schedule-forms";

export default async function SchedulesPage() {
  await requireRole("admin");
  const schedules = await listSchedules();

  return (
    <AdminMain>
      <PageHeader
        eyebrow="Табель"
        title="Графики работы"
        description="График задаёт рабочие и выходные дни водителя. По нему табель считает норму, пропуски и работу в выходной. Водитель без назначения работает по графику по умолчанию."
        action={
          <Link href="/admin/attendance" className="text-sm font-medium text-primary hover:underline">
            К табелю
          </Link>
        }
      />

      <div className="mb-6">
        <Collapsible title="Создать график">
          <CreateScheduleForm />
        </Collapsible>
      </div>

      <Table head={["Название", "Тип", "Сейчас", "Водителей", ""]}>
        {schedules.map((s) => (
          <Row key={s.id}>
            <Cell className="font-medium">
              <Link href={`/admin/attendance/schedules/${s.id}`} className="text-primary hover:underline">
                {s.name}
              </Link>
              {s.isDefault ? (
                <Pill tone="primary" className="ml-2">
                  по умолчанию
                </Pill>
              ) : null}
              {s.status === "archived" ? (
                <Pill className="ml-2">в архиве</Pill>
              ) : null}
            </Cell>
            <Cell className="text-muted-foreground">{WORK_SCHEDULE_KIND_LABEL[s.kind]}</Cell>
            <Cell className="text-muted-foreground">{s.current ? versionLabel(s.current) : "—"}</Cell>
            <Cell className="tabular-nums">{s.driversNow}</Cell>
            <Cell>
              <Link href={`/admin/attendance/schedules/${s.id}`} className="text-sm font-medium text-primary hover:underline">
                Открыть
              </Link>
            </Cell>
          </Row>
        ))}
      </Table>
    </AdminMain>
  );
}
