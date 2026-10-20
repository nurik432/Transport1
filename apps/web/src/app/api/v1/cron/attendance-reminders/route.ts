import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/attendance-reminders";

/** Constant-time compare, so the secret cannot be guessed byte by byte. */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by cron every few minutes (`Authorization: Bearer $CRON_SECRET`).
 * Sends the timesheet reminders that are due right now; a repeated call sends
 * nothing new.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET не задан" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!sameSecret(given, secret)) {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }

  try {
    const run = await sendDueReminders();
    return NextResponse.json({ ok: true, ...run });
  } catch (error) {
    console.error("attendance reminders failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось разослать напоминания" }, { status: 500 });
  }
}
