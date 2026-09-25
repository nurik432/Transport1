"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/mobile-shell";
import { IconBell, IconBus, IconUser } from "@/components/icons";

/**
 * While a trip is running the screen belongs to the trip: the menu would only
 * offer ways to leave it, and its bar competes with the main button under the
 * thumb. So the whole nav — bar and the space it reserves — disappears there.
 */
export function DriverNav({ unread, activeTripId }: { unread: number; activeTripId: string | null }) {
  const pathname = usePathname();
  if (activeTripId && pathname === `/driver/trips/${activeTripId}`) return null;

  return (
    <>
      <div aria-hidden="true" className="h-20" />
      <BottomNav
        pathname={pathname}
        items={[
          { href: "/driver", label: "Рейсы", icon: <IconBus />, match: "/driver/trips" },
          { href: "/driver/notifications", label: "Уведомления", icon: <IconBell />, badge: unread },
          { href: "/driver/profile", label: "Профиль", icon: <IconUser /> },
        ]}
      />
    </>
  );
}
