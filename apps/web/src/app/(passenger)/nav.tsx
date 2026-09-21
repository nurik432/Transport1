"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/mobile-shell";
import { IconBell, IconHome, IconRoute, IconUser } from "@/components/icons";

export function PassengerNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <BottomNav
      pathname={pathname}
      items={[
        { href: "/app", label: "Главная", icon: <IconHome /> },
        { href: "/app/routes", label: "Маршруты", icon: <IconRoute />, match: "/app/routes" },
        { href: "/app/notifications", label: "Уведомления", icon: <IconBell />, badge: unread },
        { href: "/app/profile", label: "Профиль", icon: <IconUser /> },
      ]}
    />
  );
}
