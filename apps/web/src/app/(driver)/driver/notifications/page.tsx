import { requireRole } from "@/lib/auth";
import { getNotifications, markAllRead } from "@/lib/queries";
import { EmptyState, cx } from "@/components/ui";
import { IconAlert, IconBell, IconClock, IconRoute } from "@/components/icons";

const ICON_BY_TYPE: Record<string, React.ReactNode> = {
  route_changed: <IconRoute className="size-4.5" />,
  schedule_changed: <IconClock className="size-4.5" />,
  trip_cancelled: <IconAlert className="size-4.5" />,
  admin_message: <IconBell className="size-4.5" />,
};

export default async function DriverNotifications() {
  const user = await requireRole("driver");
  const items = await getNotifications(user.id);
  const unread = items.filter((n) => !n.readAt).length;
  if (unread) await markAllRead(user.id);

  return (
    <>
      <header className="flex flex-col gap-0.5 px-5 pt-5 pb-3">
        <p className="text-sm text-muted-foreground">Сообщения администратора и изменения</p>
        <h1 className="text-2xl font-bold tracking-[-0.01em]">Уведомления</h1>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-2.5 px-4 pt-1 pb-4">
        {items.length === 0 ? (
          <EmptyState title="Уведомлений нет" hint="Здесь появятся изменения маршрутов и сообщения администратора." />
        ) : (
          items.map((n) => (
            <article
              key={n.id}
              className={cx(
                "flex gap-3 rounded-2xl bg-card p-3.5",
                !n.readAt && "shadow-[inset_0_0_0_2px_var(--color-primary-soft)]",
              )}
            >
              <span
                className={cx(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                  n.readAt ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary",
                )}
              >
                {ICON_BY_TYPE[n.type] ?? <IconBell className="size-4.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("ru-RU", {
                    timeZone: "Asia/Dushanbe",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(n.createdAt)}
                </p>
              </div>
            </article>
          ))
        )}
      </main>
    </>
  );
}
