import Link from "next/link";
import { windowsLabel } from "@transport/domain";
import { HOME_BY_ROLE, requireUser } from "@/lib/auth";
import { getAttendanceSettings } from "@/lib/attendance";
import { CheckinScreen } from "./checkin-screen";

/**
 * Where a QR link lands. Anyone signed in can open it (the link is public), but
 * only a driver gets to check in: others see why and a way back to their app.
 */
export default async function DriverCheckin({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const [user, { p }] = await Promise.all([requireUser(), searchParams]);
  const token = typeof p === "string" && p.length > 0 ? p : null;

  if (user.role !== "driver") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
        <div className="flex flex-col gap-2 rounded-[20px] bg-card p-6 text-center">
          <h1 className="text-[22px] font-extrabold tracking-[-0.01em]">Эта отметка только для водителей</h1>
          <p className="text-sm text-muted-foreground">
            По этому коду водители отмечают начало и конец рабочего дня. Для вас здесь ничего не записывается.
          </p>
        </div>
        <Link
          href={HOME_BY_ROLE[user.role]}
          className="flex min-h-13 items-center justify-center rounded-xl bg-primary px-5 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Вернуться в приложение
        </Link>
      </main>
    );
  }

  const cfg = await getAttendanceSettings();

  return (
    <>
      <header className="flex flex-col gap-0.5 px-5 pt-5 pb-3">
        <p className="text-sm text-muted-foreground">Табель</p>
        <h1 className="text-2xl font-bold tracking-[-0.01em]">Отметиться</h1>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-1 pb-4">
        <CheckinScreen key={token ?? "scan"} token={token} windows={windowsLabel(cfg)} />
      </main>
    </>
  );
}
