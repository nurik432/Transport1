import Link from "next/link";
import { formatLocalDate, formatLocalTime, localNow, addDays } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getNotifications } from "@/lib/queries";
import { cx } from "@/components/ui";
import { IconAlert, IconBell, IconBus, IconClock, IconRoute } from "@/components/icons";
import { MarkReadOnView } from "./mark-read";

type Tone = "urgent" | "warning" | "info";

const KIND: Record<string, { icon: React.ReactNode; tone: Tone }> = {
  vehicle_approaching: { icon: <IconBus className="size-5" />, tone: "urgent" },
  trip_delayed: { icon: <IconClock className="size-5" />, tone: "urgent" },
  trip_cancelled: { icon: <IconAlert className="size-5" />, tone: "warning" },
  route_changed: { icon: <IconRoute className="size-5" />, tone: "info" },
  schedule_changed: { icon: <IconClock className="size-5" />, tone: "info" },
  new_route: { icon: <IconRoute className="size-5" />, tone: "info" },
  admin_message: { icon: <IconBell className="size-5" />, tone: "info" },
  route_overloaded: { icon: <IconAlert className="size-5" />, tone: "info" },
  route_underloaded: { icon: <IconAlert className="size-5" />, tone: "info" },
};

const ICON_TONE: Record<Tone, string> = {
  urgent: "bg-late-soft text-late",
  warning: "bg-danger-soft text-danger",
  info: "bg-primary-soft text-primary",
};

/** Where tapping a notification leads, from the ids `notify()` stores in its payload. */
function hrefFor(payload: Record<string, unknown>): string | null {
  if (typeof payload.tripId === "string") return `/app/trips/${payload.tripId}`;
  if (typeof payload.routeId === "string") return `/app/routes/${payload.routeId}`;
  return null;
}

/** YYYY-MM-DD of an instant in the company time zone. */
function localDateOf(d: Date): string {
  return localNow(d).date;
}

export default async function NotificationsPage() {
  const user = await requireRole("passenger");
  const items = await getNotifications(user.id);
  const today = localNow().date;
  const yesterday = addDays(today, -1);

  const groups: { label: string; items: typeof items }[] = [];
  for (const n of items) {
    const date = localDateOf(n.createdAt);
    const label = date === today ? "Сегодня" : date === yesterday ? "Вчера" : formatLocalDate(date);
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <>
      <header className="mx-auto w-full max-w-md px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">Уведомления</h1>
      </header>
      <MarkReadOnView hasUnread={items.some((n) => !n.readAt)} />

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-4">
        {items.length === 0 ? (
          <section className="flex flex-col items-center gap-2 rounded-2xl bg-card px-5 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <IconBell className="size-6" />
            </span>
            <p className="font-semibold">Уведомлений нет</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Здесь появятся подъезд транспорта, задержки, изменения маршрутов и сообщения администратора.
            </p>
          </section>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="flex flex-col gap-2">
              <h2 className="mx-1 text-sm font-semibold text-muted-foreground">{g.label}</h2>
              <ul className="flex flex-col gap-2.5">
                {g.items.map((n) => {
                  const kind = KIND[n.type] ?? { icon: <IconBell className="size-5" />, tone: "info" as const };
                  const unread = !n.readAt;
                  const href = hrefFor(n.payload);
                  const body = (
                    <>
                      <span
                        className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", ICON_TONE[kind.tone])}
                      >
                        {kind.icon}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cx("text-[15px]", unread ? "font-bold" : "font-semibold")}>
                            {unread ? <span className="sr-only">Новое: </span> : null}
                            {n.title}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatLocalTime(n.createdAt)}</span>
                        </span>
                        {n.body ? (
                          <span className={cx("text-sm leading-snug", unread ? "text-foreground" : "text-muted-foreground")}>
                            {n.body}
                          </span>
                        ) : null}
                      </span>
                    </>
                  );
                  const cls = cx(
                    "flex gap-3 rounded-2xl bg-card p-3.5",
                    unread && (kind.tone === "urgent" ? "ring-2 ring-highlight ring-inset" : "ring-2 ring-primary/25 ring-inset"),
                  );
                  return (
                    <li key={n.id}>
                      {href ? (
                        <Link href={href} className={cx(cls, "transition-colors hover:bg-muted")}>
                          {body}
                        </Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  );
}
