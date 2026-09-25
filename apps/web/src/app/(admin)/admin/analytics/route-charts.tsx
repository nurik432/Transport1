import { cx } from "@/components/ui";

const PLOT_H = 220;

export interface DailyPoint {
  date: string;
  /** short weekday plus day, e.g. "пн 14" */
  label: string;
  pct: number | null;
  passengers: number;
}

/**
 * One departure across the days of the period. Plain bars with the capacity
 * line drawn through them: the question is not "how much" but "how often does
 * it go over the line", and a dashed rule answers that faster than any legend.
 *
 * Only the highest and the lowest bar carry a number — the rest are shape.
 */
export function DailyLoadChart({ data, caption }: { data: DailyPoint[]; caption?: string }) {
  const withData = data.filter((d) => d.pct !== null);
  if (withData.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Нет завершённых рейсов за период</p>;
  }

  const highest = Math.max(...withData.map((d) => d.pct!));
  const lowest = Math.min(...withData.map((d) => d.pct!));
  // Always keep the capacity line inside the plot, even on a quiet route.
  const top = Math.max(120, Math.ceil(highest / 20) * 20);
  const y = (pct: number) => (pct / top) * PLOT_H;

  return (
    <div
      role="img"
      aria-label={`Загрузка по дням: от ${lowest}% до ${highest}%, выше вместимости в ${withData.filter((d) => d.pct! >= 100).length} из ${withData.length} дней`}
      className="grid grid-cols-[40px_1fr] gap-x-2"
    >
      <div className="relative text-xs text-muted-foreground" style={{ height: PLOT_H }}>
        <span className="absolute right-0" style={{ bottom: y(100) - 8 }}>
          100%
        </span>
        <span className="absolute right-0" style={{ bottom: y(50) - 8 }}>
          50%
        </span>
        <span className="absolute right-0 -bottom-2">0</span>
      </div>

      <div className="relative border-b border-axis" style={{ height: PLOT_H }}>
        <div className="absolute inset-x-0 border-t border-divider" style={{ bottom: y(50) }} />
        <div className="absolute inset-0 flex items-end gap-2 px-1.5">
          {data.map((d) => (
            <span
              key={d.date}
              title={d.pct === null ? `${d.label}: нет данных` : `${d.label}: ${d.pct}% · ${d.passengers} чел.`}
              className={cx(
                "relative min-w-0 flex-1 rounded-t",
                d.pct === null ? "bg-muted" : "bg-primary",
              )}
              style={{ height: d.pct === null ? 4 : Math.max(2, y(d.pct)) }}
            >
              {d.pct !== null && (d.pct === highest || d.pct === lowest) ? (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold whitespace-nowrap">
                  {d.pct}%
                </span>
              ) : null}
            </span>
          ))}
        </div>

        {/* Drawn over the bars: the point of the chart is how many cross it. */}
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-danger-foreground"
          style={{ bottom: y(100) }}
        />
        <span
          className="pointer-events-none absolute right-0 z-10 rounded bg-card/90 px-1 text-xs font-bold text-danger-foreground"
          style={{ bottom: y(100) + 4 }}
        >
          вместимость
        </span>
      </div>

      <span />
      <div className="flex gap-2 px-1.5 pt-1.5 text-center text-xs text-muted-foreground">
        {data.map((d) => (
          <span key={d.date} className="min-w-0 flex-1 truncate">
            {d.label}
          </span>
        ))}
      </div>

      {caption ? <p className="col-span-2 pt-2 text-[13px] text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

export interface BoardingPoint {
  stopId: string;
  stopName: string;
  perTrip: number;
}

/** Where the passengers of one departure get on, biggest stop first. */
export function BoardingChart({ data }: { data: BoardingPoint[] }) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Нет отметок водителя за период</p>;
  }
  const max = Math.max(...data.map((d) => d.perTrip), 1);

  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-x-2.5 gap-y-2 text-[13px]">
      {data.map((d) => (
        <div key={d.stopId} className="contents">
          <span className="truncate" title={d.stopName}>
            {d.stopName}
          </span>
          <span className="h-2.5 rounded-r bg-primary" style={{ width: `${Math.max(4, (d.perTrip / max) * 100)}%` }} />
          <strong className="tabular-nums">{d.perTrip}</strong>
        </div>
      ))}
    </div>
  );
}
