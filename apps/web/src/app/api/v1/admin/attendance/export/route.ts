import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { formatLocalDate, localNow } from "@transport/domain";
import { getSessionUser } from "@/lib/auth";
import { getMonthReport } from "@/lib/attendance-admin";

/**
 * The month as a spreadsheet for payroll: drivers down, days across, the codes
 * the screen shows, the norm and totals on the right. Days off by each driver's
 * schedule are shaded in that driver's row. Built on the server so the browser
 * gets a file, not a page to print.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }
  const raw = new URL(request.url).searchParams.get("month") ?? localNow().date.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    return NextResponse.json({ ok: false, error: "Месяц указывается как ГГГГ-ММ" }, { status: 400 });
  }

  const report = await getMonthReport(raw);
  // Intl ends the Russian form with "г." — trimmed so the file name does not get a double dot.
  const title = formatLocalDate(`${raw}-01`, { month: "long", year: "numeric" }).replace(/\.$/, "");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Корпоративный транспорт";
  const ws = wb.addWorksheet("Табель", { views: [{ state: "frozen", xSplit: 3, ySplit: 3 }] });

  const dayCols = report.dates.length;
  const FIRST_DAY_COL = 4;
  const totalsHead = ["Норма", "Полных", "Неполных", "Без отметок", "Отпуск", "Больничный", "Выходной", "Не отработал"];

  ws.mergeCells(1, 1, 1, FIRST_DAY_COL - 1 + dayCols + totalsHead.length);
  ws.getCell(1, 1).value = `Табель водителей — ${title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };

  const head = ws.getRow(3);
  head.values = ["Водитель", "Телефон", "График", ...report.dates.map((d) => Number(d.slice(8, 10))), ...totalsHead];
  head.font = { bold: true };
  head.alignment = { horizontal: "center" };

  const weekdayRow = ws.getRow(2);
  weekdayRow.values = ["", "", "", ...report.dates.map((d) => formatLocalDate(d, { weekday: "short" }))];
  weekdayRow.font = { color: { argb: "FF6B7280" }, size: 9 };
  weekdayRow.alignment = { horizontal: "center" };

  for (const row of report.rows) {
    const t = row.totals;
    const r = ws.addRow([
      row.name + (row.active ? "" : " (неактивен)"),
      row.phone,
      row.scheduleName,
      ...row.cells.map((c) => c.code),
      row.norm,
      t.full,
      t.partial,
      t.missing,
      t.vacation,
      t.sick,
      t.dayOff,
      t.notWorked,
    ]);
    r.alignment = { horizontal: "center" };
    r.getCell(1).alignment = { horizontal: "left" };
    r.getCell(2).alignment = { horizontal: "left" };
    r.getCell(3).alignment = { horizontal: "left" };
    // Shade this driver's days off so a blank there reads as "day off", not "missing".
    row.cells.forEach((c, i) => {
      if (!c.working) r.getCell(FIRST_DAY_COL + i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    });
  }

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 18;
  for (let i = 0; i < dayCols; i++) ws.getColumn(FIRST_DAY_COL + i).width = 4.5;
  for (let i = 0; i < totalsHead.length; i++) ws.getColumn(FIRST_DAY_COL + dayCols + i).width = 12;

  ws.addRow([]);
  ws.addRow(["Я — полный день, Яв — полный день в выходной по графику, Н — неполный, НН — не отработал, О — отпуск, Б — больничный, В — выходной, пусто — нет отметок; серым — выходные по графику водителя; Норма — рабочих дней по графику"]);

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `tabel-${raw}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(`Табель ${title}.xlsx`)}`,
    },
  });
}
