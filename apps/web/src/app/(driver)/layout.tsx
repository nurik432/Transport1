import { requireRole } from "@/lib/auth";
import { countUnread, getActiveDriverTrip } from "@/lib/queries";
import { DriverNav } from "./nav";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("driver");
  const [unread, activeTripId] = await Promise.all([countUnread(user.id), getActiveDriverTrip(user.id)]);

  return (
    <div className="min-h-dvh">
      {children}
      <DriverNav unread={unread} activeTripId={activeTripId} />
    </div>
  );
}
