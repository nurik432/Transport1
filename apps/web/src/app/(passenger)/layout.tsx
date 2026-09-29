import { getLockState, requireRole } from "@/lib/auth";
import { LockGuard } from "@/components/lock-guard";
import { countUnread } from "@/lib/queries";
import { PassengerNav } from "./nav";

export default async function PassengerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("passenger");
  const [unread, lock] = await Promise.all([countUnread(user.id), getLockState()]);

  return (
    <LockGuard pinSet={lock.pinSet} serverLocked={lock.locked} remember={lock.remember}>
      <div className="min-h-dvh pb-20">
        {children}
        <PassengerNav unread={unread} />
      </div>
    </LockGuard>
  );
}
