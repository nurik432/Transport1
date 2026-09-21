"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/mobile-shell";
import { IconBell, IconBus, IconUser } from "@/components/icons";

export function DriverNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <BottomNav
      pathname={pathname}
      items={[
        { href: "/driver", label: "Рейсы", icon: <IconBus />, match: "/driver/trips" },
        { href: "/driver/notifications", label: "Уведомления", icon: <IconBell />, badge: unread },
        { href: "/driver/profile", label: "Профиль", icon: <IconUser /> },
      ]}
    />
  );
}
