import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";
import { IconArrowLeft, IconLogout } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  /** match nested routes as active */
  match?: string;
}

export function BottomNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav
      aria-label="Основная навигация"
      className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch">
        {items.map((item) => {
          const active = pathname === item.href || (item.match && pathname.startsWith(item.match));
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors duration-200",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="absolute top-1.5 right-1/2 translate-x-4 rounded-full bg-danger px-1.5 text-[10px] leading-4 font-semibold text-white">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
        {back ? (
          <Link
            href={back}
            aria-label="Назад"
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <IconArrowLeft />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/logout" method="post">
      <button
        type="submit"
        className={cx(
          "inline-flex cursor-pointer items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          compact ? "size-10 justify-center" : "min-h-11 px-3",
        )}
        aria-label="Выйти"
      >
        <IconLogout className="size-5" />
        {compact ? null : <span>Выйти</span>}
      </button>
    </form>
  );
}
