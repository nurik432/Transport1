import Link from "next/link";
import { notFound } from "next/navigation";
import { WORK_SCHEDULE_KIND_LABEL, formatLocalDate, formatLocalTime, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import {
  SCHEDULE_AUDIT_LABEL,
  closedBefore,
  driverOptions,
  getSchedule,
  scheduleNamesToday,
  versionLabel,
  type ScheduleAuditView,
} from "@/lib/work-schedules";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { Card, Pill } from "@/components/ui";
import { AssignForm, VersionForm } from "../schedule-forms";
import { ScheduleAdminActions } from "../schedule-admin";
import { DriverScheduleButton } from "../driver-schedule-dialog";

const day = (d: string) => formatLocalDate(d, { day: "numeric", month: "long", year: "numeric" });

function describe(a: ScheduleAuditView): string {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const b = a.before ?? {};
  const f = a.after ?? {};
  switch (a.action) {
    case "schedule_created":
      return s(f.label);
    case "renamed":
      return `${s(b.name)} → ${s(f.name)}`;
    case "version_set":
      return `с ${s(f.from)}: ${s(f.label)}${a.before ? ` (было: ${s(b.label)})` : ""}`;
    case "default_changed":
      return a.before ? `вместо «${s(b.name)}»` : "";
    case "assigned":
      return `${a.driverName ?? "водитель"} с ${s(f.from)}${f.cycleStart ? `, цикл с ${s(f.cycleStart)}` : ""}${b.schedule ? ` (был: ${s(b.schedule)})` : ""}`;
    case "unassigned":
      return `${a.driverName ?? "водитель"}, назначение с ${s(b.from)}`;
    default:
      return "";
  }
}

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const [, { id }] = await Promise.all([requireRole("admin"), params]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getSchedule(id);
  if (!detail) notFound();
  const [drivers, namesToday] = await Promise.all([driverOptions(), scheduleNamesToday()]);
  const { schedule: s, versions, current, driversNow, upcoming, audit, used } = detail;
  const today = localNow().date;
  const onIt = new Set(driversNow.map((d) => d.userId));
  const assignable = drivers
    .filter((d) => !onIt.has(d.value))
    .map((d) => ({ value: d.value, label: d.label, hint: `${namesToday.get(d.value) ?? ""}${d.active ? "" : " · неактивен"}` }));
  const closed = closedBefore();
  const active = s.status === "active";

  return (
    <AdminMain>
      <PageHeader
        eyebrow="График работы"
        title={s.name}
        description={`${WORK_SCHEDULE_KIND_LABEL[s.kind]}. Сейчас: ${current ? versionLabel(current) : "—"}.`}
        action={
          <Link href="/admin/attendance/schedules" className="text-sm font-medium text-primary hover:underline">
            Все графики
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {s.isDefault ? <Pill tone="primary">по умолчанию</Pill> : null}
        {active ? null : <Pill>в архиве</Pill>}
        <ScheduleAdminActions id={s.id} name={s.name} isDefault={s.isDefault} status={s.status} used={used} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Водители на графике сегодня · {driversNow.length}</h2>
          {driversNow.length === 0 ? (
            <p className="text-sm text-muted-foreground">Никого.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-divider text-sm">
              {driversNow.map((d) => (
                <li key={d.userId} className="flex flex-wrap items-center gap-x-2 py-2">
                  <DriverScheduleButton userId={d.userId} name={d.name} scheduleName={d.name} className="cursor-pointer font-medium hover:underline" />
                  <span className="text-xs text-muted-foreground">
                    {d.since ? `с ${day(d.since)}` : "по умолчанию"}
                    {d.cycleStart ? `, цикл с ${day(d.cycleStart)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {upcoming.length ? (
            <>
              <h3 className="text-sm font-semibold">Перейдут на график</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {upcoming.map((d) => (
                  <li key={`${d.userId}:${d.since}`}>
                    {d.name} <span className="text-xs text-muted-foreground">с {day(d.since)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {active ? (
            <>
              <h3 className="text-sm font-semibold">Назначить водителей</h3>
              <AssignForm schedules={[{ value: s.id, label: s.name, kind: s.kind }]} fixedScheduleId={s.id} closedBefore={closed} drivers={assignable} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">График в архиве: назначать его нельзя.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">Версии</h2>
          <Table head={["С даты", "Дни", "Кто"]}>
            {versions.map((v) => (
              <Row key={v.id}>
                <Cell className="tabular-nums whitespace-nowrap">
                  {day(v.effectiveFrom)}
                  {current?.effectiveFrom === v.effectiveFrom ? <span className="ml-1 text-xs text-ok">действует</span> : v.effectiveFrom > today ? <span className="ml-1 text-xs text-muted-foreground">будет</span> : null}
                </Cell>
                <Cell>{versionLabel(v)}</Cell>
                <Cell className="text-muted-foreground">{v.createdBy ?? "—"}</Cell>
              </Row>
            ))}
          </Table>
          {active ? (
            <>
              <h3 className="text-sm font-semibold">Изменить дни</h3>
              <VersionForm scheduleId={s.id} kind={s.kind} current={current} closedBefore={closed} />
            </>
          ) : null}
        </Card>
      </div>

      {audit.length ? (
        <Card className="mt-6 flex flex-col gap-2 p-5">
          <h2 className="text-base font-semibold">Журнал изменений</h2>
          <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {audit.map((a) => (
              <li key={a.id}>
                <span className="font-medium text-body">{SCHEDULE_AUDIT_LABEL[a.action] ?? a.action}</span>
                {describe(a) ? `: ${describe(a)}` : ""} — {a.adminName ?? "администратор"}, {formatLocalDate(a.at.toISOString().slice(0, 10))} {formatLocalTime(a.at)}
                {a.reason ? ` · ${a.reason}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </AdminMain>
  );
}
