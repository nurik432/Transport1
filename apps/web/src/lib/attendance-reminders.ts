import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { localNow, reminderDue, shortTime } from "@transport/domain";
import { getAttendanceSettings } from "./attendance";
import { db, schema } from "./db";
import { notify } from "./push";
import { loadWorkCalendars } from "./work-schedules";

const { attendanceReminders, attendanceScans, attendanceDayOverrides, drivers, users } = schema;

const WINDOW_LABEL = { morning: "Утреннее", evening: "Вечернее" } as const;

export interface ReminderRun {
  /** the window whose reminder was due, or null when none is */
  kind: "morning" | "evening" | null;
  date: string;
  sent: number;
}

/**
 * Remind active drivers who have not scanned in the window that is about to
 * close. Called by cron every few minutes; safe to call any number of times:
 * the reminder row is claimed before the push goes out, so a repeated or
 * overlapping call finds it taken and sends nothing. A push that fails after
 * the claim is not retried — a missed reminder is better than a duplicate.
 */
export async function sendDueReminders(at: Date = new Date()): Promise<ReminderRun> {
  const cfg = await getAttendanceSettings();
  const now = localNow(at);
  const kind = reminderDue(now.minutes, cfg);
  if (!kind) return { kind: null, date: now.date, sent: 0 };

  const pending = await db
    .select({ userId: users.id })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.userId))
    .where(
      and(
        eq(drivers.status, "active"),
        eq(users.status, "active"),
        sql`not exists (select 1 from ${attendanceScans} sc where sc.user_id = ${users.id} and sc.date = ${now.date}
          and sc.kind = ${kind} and sc.deleted_at is null and sc.duplicate = false)`,
        sql`not exists (select 1 from ${attendanceDayOverrides} ov where ov.user_id = ${users.id} and ov.date = ${now.date})`,
      ),
    );
  // Only drivers due at work today by their own schedule.
  const calendars = await loadWorkCalendars(pending.map((p) => p.userId));
  const due = pending.filter((p) => calendars.calendarOf(p.userId).isWorkDay(now.date));
  if (!due.length) return { kind, date: now.date, sent: 0 };

  const claimed = await db
    .insert(attendanceReminders)
    .values(due.map((p) => ({ userId: p.userId, date: now.date, kind })))
    .onConflictDoNothing()
    .returning({ userId: attendanceReminders.userId });
  if (!claimed.length) return { kind, date: now.date, sent: 0 };

  await notify(
    claimed.map((c) => c.userId),
    "attendance_reminder",
    {
      title: "Не забудьте отметиться",
      body: `${WINDOW_LABEL[kind]} окно табеля закрывается в ${shortTime(cfg[kind].to)}. Отсканируйте QR на проходной.`,
      url: "/driver/checkin",
      tag: `attendance-${now.date}-${kind}`,
      payload: { date: now.date, kind },
    },
  );
  return { kind, date: now.date, sent: claimed.length };
}
