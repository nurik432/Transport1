"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";
import {
  IconBell,
  IconBus,
  IconChart,
  IconHome,
  IconLogout,
  IconPin,
  IconRoute,
  IconSettings,
  IconUser,
  IconUsers,
} from "@/components/icons";

const ITEMS = [
  { href: "/admin", label: "Дашборд", icon: <IconHome /> },
  { href: "/admin/live", label: "Мониторинг", icon: <IconPin /> },
  { href: "/admin/analytics", label: "Аналитика", icon: <IconChart /> },
  { href: "/admin/routes", label: "Маршруты", icon: <IconRoute /> },
  { href: "/admin/stops", label: "Остановки", icon: <IconPin /> },
  { href: "/admin/trips", label: "Рейсы", icon: <IconBus /> },
  { href: "/admin/vehicles", label: "Транспорт", icon: <IconBus /> },
  { href: "/admin/drivers", label: "Водители", icon: <IconUser /> },
  { href: "/admin/passengers", label: "Пассажиры", icon: <IconUsers /> },
  { href: "/admin/messages", label: "Уведомления", icon: <IconBell /> },
  { href: "/admin/settings", label: "Настройки", icon: <IconSettings /> },
];

export function AdminSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <span className="font-semibold">Администрирование</span>
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
          "shrink-0 border-border bg-card lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:border-r",
          open ? "block border-b" : "hidden lg:block",
        )}
      >
        <div className="hidden items-center gap-2 px-4 py-4 lg:flex">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-on-primary">
            <IconBus className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Транспорт</p>
            <p className="truncate text-xs text-muted-foreground">{userName}</p>
          </div>
        </div>

        <nav aria-label="Разделы администратора" className="px-2 py-2">
          <ul className="flex flex-col gap-0.5">
            {ITEMS.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-200",
                      active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <form action="/logout" method="post" className="border-t border-border px-2 py-2">
          <button
            type="submit"
            className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <IconLogout />
            Выйти
          </button>
        </form>
      </aside>
    </>
  );
}
