import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { formatLocalDate, isWorkingDay, localNow } from "@transport/domain";
import { getSessionUser } from "@/lib/auth";
import { getMonthReport } from "@/lib/attendance-admin";

/**
 * The month as a spreadsheet for payroll: drivers down, days across, the codes
 * the screen shows, totals on the right. Built on the server so the browser
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
  const ws = wb.addWorksheet("Табель", { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });

  const dayCols = report.dates.length;
  const totalsHead = ["Полных", "Неполных", "Без отметок", "Отпуск", "Больничный", "Выходной", "Не отработал"];

  ws.mergeCells(1, 1, 1, 2 + dayCols + totalsHead.length);
  ws.getCell(1, 1).value = `Табель водителей — ${title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };

  const head = ws.getRow(3);
  head.values = ["Водитель", "Телефон", ...report.dates.map((d) => Number(d.slice(8, 10))), ...totalsHead];
  head.font = { bold: true };
  head.alignment = { horizontal: "center" };

  const weekdayRow = ws.getRow(2);
  weekdayRow.values = ["", "", ...report.dates.map((d) => formatLocalDate(d, { weekday: "short" }))];
  weekdayRow.font = { color: { argb: "FF6B7280" }, size: 9 };
  weekdayRow.alignment = { horizontal: "center" };

  for (const row of report.rows) {
    const t = row.totals;
    const r = ws.addRow([
      row.name + (row.active ? "" : " (неактивен)"),
      row.phone,
      ...row.cells.map((c) => c.code),
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
  }

  // Shade weekends and holidays so a blank there reads as "day off", not "missing".
  report.dates.forEach((d, i) => {
    if (isWorkingDay(d, report.settings)) return;
    ws.getColumn(3 + i).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber >= 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    });
  });

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 16;
  for (let i = 0; i < dayCols; i++) ws.getColumn(3 + i).width = 4.5;
  for (let i = 0; i < totalsHead.length; i++) ws.getColumn(3 + dayCols + i).width = 12;

  ws.addRow([]);
  ws.addRow(["Я — полный день, Яв — полный день вне графика, Н — неполный, НН — не отработал, О — отпуск, Б — больничный, В — выходной, пусто — нет отметок"]);

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `tabel-${raw}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(`Табель ${title}.xlsx`)}`,
    },
  });
}
