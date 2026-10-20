import Link from "next/link";
import { formatLocalDate, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getMonthReport } from "@/lib/attendance-admin";
import { AdminMain, PageHeader } from "@/components/admin-ui";
import { EmptyState, LinkButton } from "@/components/ui";
import { MonthGrid } from "./month-grid";

/** "YYYY-MM" ± n months. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string): string {
  const s = formatLocalDate(`${month}-01`, { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const [, { m }] = await Promise.all([requireRole("admin"), searchParams]);
  const current = localNow().date.slice(0, 7);
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : current;
  const report = await getMonthReport(month);

  return (
    <AdminMain>
      <PageHeader
        eyebrow="Табель"
        title={monthTitle(month)}
        description="Я — полный день, Яв — вне графика, Н — неполный, НН — не отработал, О — отпуск, Б — больничный, В — выходной. Клик по дню открывает отметки и правки."
        action={
          <>
            <nav aria-label="Месяц" className="flex items-center gap-1">
              <LinkButton href={`/admin/attendance?m=${shiftMonth(month, -1)}`} variant="secondary">
                ← {monthTitle(shiftMonth(month, -1))}
              </LinkButton>
              {month < current ? (
                <LinkButton href={`/admin/attendance?m=${shiftMonth(month, 1)}`} variant="secondary">
                  {monthTitle(shiftMonth(month, 1))} →
                </LinkButton>
              ) : null}
            </nav>
            <a
              href={`/api/v1/admin/attendance/export?month=${month}`}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Скачать XLSX
            </a>
            <Link href="/admin/attendance/points" className="text-sm font-medium text-primary hover:underline">
              Точки сканирования
            </Link>
          </>
        }
      />

      {report.rows.length === 0 ? (
        <EmptyState title="Водителей нет" hint="Табель заполняется, когда водители начинают сканировать QR на проходной." />
      ) : (
        <MonthGrid report={report} />
      )}
    </AdminMain>
  );
}
