import { requireRole } from "@/lib/auth";
import { getNotifications, markAllRead } from "@/lib/queries";
import { MobileHeader } from "@/components/mobile-shell";
import { Card, EmptyState, cx } from "@/components/ui";
import { IconAlert, IconBell, IconClock, IconRoute } from "@/components/icons";

const ICON_BY_TYPE: Record<string, React.ReactNode> = {
  route_changed: <IconRoute className="size-4" />,
  schedule_changed: <IconClock className="size-4" />,
  trip_cancelled: <IconAlert className="size-4" />,
  admin_message: <IconBell className="size-4" />,
};

export default async function DriverNotifications() {
  const user = await requireRole("driver");
  const items = await getNotifications(user.id);
  if (items.some((n) => !n.readAt)) await markAllRead(user.id);

  return (
    <>
      <MobileHeader title="Уведомления" subtitle="Сообщения администратора и изменения" />
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-4">
        {items.length === 0 ? (
          <EmptyState title="Уведомлений нет" hint="Здесь появятся изменения маршрутов и сообщения администратора." />
        ) : (
          items.map((n) => (
            <Card key={n.id} className={cx("flex gap-3", !n.readAt && "border-primary/40 bg-primary-soft/30")}>
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                {ICON_BY_TYPE[n.type] ?? <IconBell className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
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
            </Card>
          ))
        )}
      </main>
    </>
  );
}
