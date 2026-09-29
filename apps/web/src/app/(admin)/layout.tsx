import { getLockState, requireRole } from "@/lib/auth";
import { LockGuard } from "@/components/lock-guard";
import { getAttentionCount } from "@/lib/attention";
import { AdminSidebar } from "./sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");
  // Same list the dashboard shows, so the menu counter and the cards agree.
  const attentionCount = await getAttentionCount();
  const lock = await getLockState();

  return (
    <LockGuard pinSet={lock.pinSet} serverLocked={lock.locked} remember={lock.remember}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <AdminSidebar userName={user.name} attentionCount={attentionCount} isSuper={user.isSuper} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </LockGuard>
  );
}
