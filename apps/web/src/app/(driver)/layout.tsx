import { getLockState, requireRole } from "@/lib/auth";
import { LockGuard } from "@/components/lock-guard";
import { countUnread, getActiveDriverTrip } from "@/lib/queries";
import { DriverNav } from "./nav";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("driver");
  const [unread, activeTripId, lock] = await Promise.all([countUnread(user.id), getActiveDriverTrip(user.id), getLockState()]);

  return (
    <LockGuard pinSet={lock.pinSet} serverLocked={lock.locked} remember={lock.remember}>
      <div className="min-h-dvh">
        {children}
        <DriverNav unread={unread} activeTripId={activeTripId} />
      </div>
    </LockGuard>
  );
}
