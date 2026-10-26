import Link from "next/link";
import { DAY_STATUS_LABEL, formatLocalDate, localNow, plural, type DayVerdict } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getDriverMonth } from "@/lib/attendance";
import { EmptyState, Pill, cx } from "@/components/ui";
import { IconArrowLeft, IconChevronRight, IconQr } from "@/components/icons";

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

function tone(v: DayVerdict): "ok" | "warn" | "neutral" | "primary" | "danger" {
  switch (v.status) {
    case "full":
    case "worked":
      return "ok";
    case "partial":
      return "warn";
    case "not_worked":
      return "danger";
    case "none":
      return "neutral";
    default:
      return "primary";
  }
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-card p-3.5">
      <span className="text-[26px] font-extrabold tabular-nums">{value}</span>
      <span className="text-[13px] text-muted-foreground">{label}</span>
    </div>
  );
}

/** The driver's own month: what the administrator will see, minus the fraud flags. */
export default async function DriverAttendance({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const [user, { m }] = await Promise.all([requireRole("driver"), searchParams]);
  const current = localNow().date.slice(0, 7);
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : current;
  const report = await getDriverMonth(user.id, month);

  return (
    <>
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-muted-foreground">Табель</p>
          <h1 className="text-2xl font-bold tracking-[-0.01em]">{monthTitle(month)}</h1>
        </div>
        <nav aria-label="Месяц" className="flex items-center gap-1 pt-1">
          <Link
            href={`/driver/attendance?m=${shiftMonth(month, -1)}`}
            aria-label="Предыдущий месяц"
            className="flex size-10 items-center justify-center rounded-xl bg-card text-primary"
          >
            <IconArrowLeft className="size-5" />
          </Link>
          {month < current ? (
            <Link
              href={`/driver/attendance?m=${shiftMonth(month, 1)}`}
              aria-label="Следующий месяц"
              className="flex size-10 items-center justify-center rounded-xl bg-card text-primary"
            >
              <IconChevronRight className="size-5" />
            </Link>
          ) : (
            <span aria-hidden="true" className="size-10" />
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-1 pb-4">
        <section aria-label="График работы" className="flex items-center justify-between gap-3 rounded-2xl bg-card px-3.5 py-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">График работы</span>
            <span className="truncate text-[15px] font-bold">{report.scheduleName}</span>
          </span>
          <span className="shrink-0 text-right text-[13px] text-muted-foreground">
            норма <span className="font-bold text-body tabular-nums">{report.norm}</span> {plural(report.norm, ["день", "дня", "дней"])}
          </span>
        </section>

        <div className="grid grid-cols-3 gap-2">
          <Tile value={report.totals.full} label="полных" />
          <Tile value={report.totals.partial} label="неполных" />
          <Tile value={report.totals.missing} label="без отметок" />
        </div>

        {month === current ? (
          <Link
            href="/driver/checkin"
            className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-primary text-[17px] font-bold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <IconQr className="size-5" />
            Отметиться
          </Link>
        ) : null}

        {report.days.length === 0 ? (
          <EmptyState title="Месяц ещё не начался" />
        ) : (
          <section className="flex flex-col rounded-2xl bg-card">
            {report.days.map((d) => {
              const working = d.working;
              const morning = d.scans.find((s) => s.kind === "morning" && !s.duplicate && !s.deletedAt);
              const evening = d.scans.find((s) => s.kind === "evening" && !s.duplicate && !s.deletedAt);
              return (
                <article
                  key={d.date}
                  className={cx("flex items-center gap-3 border-b border-divider px-3.5 py-3 last:border-b-0", !working && "opacity-70")}
                >
                  <span className="flex w-14 shrink-0 flex-col">
                    <span className="text-[15px] font-bold">{formatLocalDate(d.date, { day: "numeric", month: "short" })}</span>
                    <span className="text-xs text-muted-foreground">{formatLocalDate(d.date, { weekday: "short" })}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col text-[13px] text-muted-foreground tabular-nums">
                    <span>Утро {morning ? morning.time : "—"}</span>
                    <span>Вечер {evening ? evening.time : "—"}</span>
                    {d.verdict.overridden && d.overrideReason ? <span className="truncate">{d.overrideReason}</span> : null}
                  </span>
                  <Pill tone={tone(d.verdict)}>
                    {d.verdict.status === "none" && !working ? "Выходной" : DAY_STATUS_LABEL[d.verdict.status]}
                    {d.verdict.offSchedule ? " · в выходной" : ""}
                  </Pill>
                </article>
              );
            })}
          </section>
        )}

        <p className="mx-1 text-[13px] text-muted-foreground">
          Полный день — отметки утром и вечером. Если отметка не прошла, сообщите диспетчеру в тот же день.
        </p>
      </main>
    </>
  );
}
