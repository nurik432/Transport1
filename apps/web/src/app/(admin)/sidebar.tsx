"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import {
  IconBell,
  IconBus,
  IconCalendar,
  IconChart,
  IconHome,
  IconLogout,
  IconRadar,
  IconRoute,
  IconSettings,
  IconStop,
  IconTrend,
  IconTruck,
  IconUser,
  IconUsers,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** red counter on the item, e.g. problems waiting on the dashboard */
  badge?: number;
}

interface NavGroup {
  /** uppercase caption above the group; the last group carries none */
  title?: string;
  items: NavItem[];
}

/**
 * Twelve links in a row are a list to read; four groups are a place to look.
 * "Сейчас" is what is happening during the morning trips, "Анализ" is what
 * happened over the period, "Справочники" is what the panel is made of.
 */
function groups(attention: number): NavGroup[] {
  return [
    {
      title: "Сейчас",
      items: [
        { href: "/admin", label: "Дашборд", icon: <IconHome />, badge: attention },
        { href: "/admin/live", label: "Мониторинг", icon: <IconRadar /> },
        { href: "/admin/trips", label: "Рейсы", icon: <IconCalendar /> },
      ],
    },
    {
      title: "Анализ",
      items: [
        { href: "/admin/analytics", label: "Аналитика", icon: <IconChart /> },
        { href: "/admin/planning", label: "Прогноз", icon: <IconTrend /> },
      ],
    },
    {
      title: "Справочники",
      items: [
        { href: "/admin/routes", label: "Маршруты", icon: <IconRoute /> },
        { href: "/admin/stops", label: "Остановки", icon: <IconStop /> },
        { href: "/admin/vehicles", label: "Транспорт", icon: <IconTruck /> },
        { href: "/admin/drivers", label: "Водители", icon: <IconUser /> },
        { href: "/admin/passengers", label: "Пассажиры", icon: <IconUsers /> },
      ],
    },
    {
      items: [
        { href: "/admin/messages", label: "Уведомления", icon: <IconBell /> },
        { href: "/admin/settings", label: "Настройки", icon: <IconSettings /> },
      ],
    },
  ];
}

export function AdminSidebar({ userName, attentionCount = 0 }: { userName: string; attentionCount?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 font-semibold">
          Администрирование
          {attentionCount > 0 ? <Badge count={attentionCount} /> : null}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted"
        >
          {open ? "Закрыть" : "Меню"}
        </button>
      </div>

      <aside
        className={cx(
          "shrink-0 border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-58 lg:flex-col lg:border-r",
          open ? "block border-b" : "hidden lg:flex",
        )}
      >
        <div className="hidden items-center gap-2.5 px-5 py-4 lg:flex">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-ink text-on-ink">
            <IconBus className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">Транспорт</p>
            <p className="truncate text-xs text-muted-foreground">{userName}</p>
          </div>
        </div>

        <nav aria-label="Разделы администратора" className="flex flex-col gap-3.5 px-3 py-2 lg:flex-1 lg:overflow-y-auto">
          {groups(attentionCount).map((group, gi) => (
            <div key={group.title ?? `group-${gi}`} className="flex flex-col gap-0.5">
              {group.title ? (
                <span className="px-2.5 pb-1 text-[11px] font-bold tracking-[0.06em] text-subtle uppercase">
                  {group.title}
                </span>
              ) : null}
              {group.items.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors duration-200",
                      active
                        ? "bg-primary-soft font-bold text-primary"
                        : "font-medium text-body hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className={cx("shrink-0", active ? "text-primary" : "text-subtle")}>{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? <Badge count={item.badge} /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <form action="/logout" method="post" className="border-t border-border px-3 py-2">
          <button
            type="submit"
            className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <IconLogout />
            Выйти
          </button>
        </form>
      </aside>
    </>
  );
}

/** Problems waiting on the dashboard, read as "Дашборд, 3 требуют решения". */
function Badge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white tabular-nums">
      <span className="sr-only">требуют решения: </span>
      {count}
    </span>
  );
}
