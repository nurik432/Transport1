"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  label: string;
  avgPct: number | null;
  trips: number;
  avgPassengers: number | null;
}

const COLORS = { over: "#dc2626", low: "#ca8a04", ok: "#2563eb" };

function fill(pct: number | null, overloadPct: number, lowPct: number): string {
  if (pct === null) return "#cbd5e1";
  if (pct >= overloadPct) return COLORS.over;
  if (pct < lowPct) return COLORS.low;
  return COLORS.ok;
}

export function LoadBarChart({
  data,
  overloadPct = 100,
  lowPct = 40,
  height = 240,
}: {
  data: ChartPoint[];
  overloadPct?: number;
  lowPct?: number;
  height?: number;
}) {
  if (!data.length) return <p className="py-8 text-center text-sm text-muted-foreground">Нет данных за период</p>;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4ecfc" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={{ stroke: "#e4ecfc" }} />
        <YAxis
          tick={{ fontSize: 12, fill: "#475569" }}
          tickLine={false}
          axisLine={false}
          unit="%"
          domain={[0, (max: number) => Math.max(120, Math.ceil(max / 20) * 20)]}
        />
        <Tooltip
          cursor={{ fill: "rgba(37,99,235,0.06)" }}
          contentStyle={{ borderRadius: 12, border: "1px solid #e4ecfc", fontSize: 13 }}
          formatter={(value, _name, item) => {
            const p = (item as { payload?: ChartPoint }).payload;
            const pct = typeof value === "number" ? value : Number(value ?? 0);
            return [`${pct}% · ${p?.avgPassengers ?? "—"} чел. · рейсов ${p?.trips ?? 0}`, "Загрузка"];
          }}
        />
        <ReferenceLine y={overloadPct} stroke="#dc2626" strokeDasharray="4 4" />
        <Bar dataKey="avgPct" radius={[6, 6, 0, 0]} maxBarSize={48}>
          {data.map((d) => (
            <Cell key={d.label} fill={fill(d.avgPct, overloadPct, lowPct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
